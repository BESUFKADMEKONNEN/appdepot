//! Source adapters for archives, packages, AppImages, directories, and remote URLs.
//!
//! Provides the extraction pipeline that turns tarballs, zip files, Debian packages,
//! AppImages, and GitHub release archives into structured, organized packages.

use crate::Error;
use serde::{Deserialize, Serialize};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

/// Supported source package types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    Tarball,
    Zip,
    Deb,
    AppImage,
    Directory,
    Url,
}

/// Detects the package kind from a path or URL.
pub fn detect_source_kind(path_or_url: &str) -> SourceKind {
    let lower = path_or_url.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        SourceKind::Url
    } else if lower.ends_with(".tar.gz")
        || lower.ends_with(".tgz")
        || lower.ends_with(".tar.xz")
        || lower.ends_with(".txz")
        || lower.ends_with(".tar.bz2")
        || lower.ends_with(".tbz2")
        || lower.ends_with(".tar.zst")
        || lower.ends_with(".tar")
    {
        SourceKind::Tarball
    } else if lower.ends_with(".zip") {
        SourceKind::Zip
    } else if lower.ends_with(".deb") {
        SourceKind::Deb
    } else if lower.ends_with(".appimage") {
        SourceKind::AppImage
    } else {
        SourceKind::Directory
    }
}

/// Downloads a remote URL to a local destination using curl or wget.
pub fn download_from_url(url: &str, dest_file: &Path) -> Result<(), Error> {
    if let Some(parent) = dest_file.parent() {
        fs::create_dir_all(parent)?;
    }

    // Try curl first
    let curl_status = Command::new("curl")
        .args([
            "-fSL",
            "--connect-timeout",
            "15",
            "--max-time",
            "300",
            "-o",
            dest_file.to_str().unwrap_or_default(),
            url,
        ])
        .status();

    match curl_status {
        Ok(status) if status.success() => return Ok(()),
        _ => {}
    }

    // Fallback to wget
    let wget_status = Command::new("wget")
        .args([
            "-q",
            "--timeout=15",
            "-O",
            dest_file.to_str().unwrap_or_default(),
            url,
        ])
        .status();

    match wget_status {
        Ok(status) if status.success() => Ok(()),
        _ => Err(Error::Archive(format!(
            "Failed to download from URL '{}'. Please check internet connection or URL validity.",
            url
        ))),
    }
}

/// Extracts or stages an archive, package, or directory into a target directory.
pub fn unpack_source(source: &Path, target_dir: &Path, app_name: &str) -> Result<(), Error> {
    fs::create_dir_all(target_dir)?;

    if source.is_dir() {
        // Copy directory content
        copy_dir_recursive(source, target_dir)?;
        return Ok(());
    }

    let source_str = source.to_string_lossy().to_lowercase();

    if source_str.ends_with(".tar.gz") || source_str.ends_with(".tgz") {
        unpack_tar(source, target_dir, &["-xzf"])?;
    } else if source_str.ends_with(".tar.xz") || source_str.ends_with(".txz") {
        unpack_tar(source, target_dir, &["-xJf"])?;
    } else if source_str.ends_with(".tar.bz2") || source_str.ends_with(".tbz2") {
        unpack_tar(source, target_dir, &["-xjf"])?;
    } else if source_str.ends_with(".tar.zst") {
        unpack_tar(source, target_dir, &["--zstd", "-xf"])?;
    } else if source_str.ends_with(".tar") {
        unpack_tar(source, target_dir, &["-xf"])?;
    } else if source_str.ends_with(".zip") {
        unpack_zip(source, target_dir)?;
    } else if source_str.ends_with(".deb") {
        unpack_deb(source, target_dir)?;
    } else if source_str.ends_with(".appimage") {
        stage_appimage(source, target_dir, app_name)?;
    } else {
        return Err(Error::Archive(format!(
            "Unsupported archive or package format: {}",
            source.display()
        )));
    }

    // Fix permissions so files are readable and directories are traversable
    normalize_permissions(target_dir)?;

    Ok(())
}

fn unpack_tar(source: &Path, target_dir: &Path, tar_flags: &[&str]) -> Result<(), Error> {
    // Try with --strip-components=1 first (common for archives with an enclosing root folder)
    let mut args = Vec::from(tar_flags);
    let src_str = source.to_str().unwrap_or_default();
    let target_str = target_dir.to_str().unwrap_or_default();

    args.push(src_str);
    args.push("-C");
    args.push(target_str);
    args.push("--strip-components=1");

    let status = Command::new("tar").args(&args).status();
    if let Ok(st) = status {
        if st.success() {
            // Check if files actually landed in target_dir
            if has_files(target_dir) {
                return Ok(());
            }
        }
    }

    // Fallback without --strip-components=1
    let mut fallback_args = Vec::from(tar_flags);
    fallback_args.push(src_str);
    fallback_args.push("-C");
    fallback_args.push(target_str);

    let fallback_status = Command::new("tar").args(&fallback_args).status();
    match fallback_status {
        Ok(st) if st.success() => Ok(()),
        Ok(st) => Err(Error::Archive(format!("tar command exited with status: {}", st))),
        Err(e) => Err(Error::Archive(format!("Failed to execute tar: {}", e))),
    }
}

fn unpack_zip(source: &Path, target_dir: &Path) -> Result<(), Error> {
    let src_str = source.to_str().unwrap_or_default();
    let target_str = target_dir.to_str().unwrap_or_default();

    let status = Command::new("unzip")
        .args(["-q", "-o", src_str, "-d", target_str])
        .status();

    match status {
        Ok(st) if st.success() => Ok(()),
        Ok(st) => Err(Error::Archive(format!("unzip command exited with status: {}", st))),
        Err(e) => Err(Error::Archive(format!("Failed to execute unzip: {}", e))),
    }
}

fn unpack_deb(source: &Path, target_dir: &Path) -> Result<(), Error> {
    let src_str = source.to_str().unwrap_or_default();
    let target_str = target_dir.to_str().unwrap_or_default();

    // Try dpkg-deb -x first
    let dpkg_status = Command::new("dpkg-deb")
        .args(["-x", src_str, target_str])
        .status();

    if let Ok(st) = dpkg_status {
        if st.success() {
            return Ok(());
        }
    }

    // Fallback to ar and tar
    let script = format!(
        "cd \"{}\" && ar x \"{}\" && (tar -xf data.tar.* 2>/dev/null || true) && rm -f control.tar.* data.tar.* debian-binary",
        target_str, src_str
    );

    let status = Command::new("sh").args(["-c", &script]).status();
    match status {
        Ok(st) if st.success() => Ok(()),
        Ok(st) => Err(Error::Archive(format!("Deb extraction failed with status: {}", st))),
        Err(e) => Err(Error::Archive(format!("Deb extraction error: {}", e))),
    }
}

fn stage_appimage(source: &Path, target_dir: &Path, app_name: &str) -> Result<(), Error> {
    let dest_file = target_dir.join(format!("{}.AppImage", app_name));
    fs::copy(source, &dest_file)?;

    // Make executable
    let mut perms = fs::metadata(&dest_file)?.permissions();
    perms.set_mode(0o755);
    fs::set_permissions(&dest_file, perms)?;

    // Attempt to extract .desktop and icon using --appimage-extract
    let extract_dir = target_dir.join(".extracted");
    let _ = Command::new(&dest_file)
        .args(["--appimage-extract"])
        .current_dir(target_dir)
        .status();

    let squashfs = target_dir.join("squashfs-root");
    if squashfs.exists() {
        let _ = fs::rename(&squashfs, &extract_dir);
    }

    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)?.flatten() {
        let entry_path = entry.path();
        let target_path = dst.join(entry.file_name());
        if entry_path.is_dir() {
            copy_dir_recursive(&entry_path, &target_path)?;
        } else {
            fs::copy(&entry_path, &target_path)?;
        }
    }
    Ok(())
}

fn has_files(dir: &Path) -> bool {
    fs::read_dir(dir).map(|mut r| r.next().is_some()).unwrap_or(false)
}

fn normalize_permissions(dir: &Path) -> Result<(), Error> {
    for entry in fs::read_dir(dir)?.flatten() {
        let p = entry.path();
        if let Ok(meta) = p.metadata() {
            let mut perms = meta.permissions();
            let mode = perms.mode();
            if p.is_dir() {
                perms.set_mode(mode | 0o755);
                let _ = fs::set_permissions(&p, perms);
                let _ = normalize_permissions(&p);
            } else if (mode & 0o111) != 0 {
                perms.set_mode(mode | 0o755);
                let _ = fs::set_permissions(&p, perms);
            } else {
                perms.set_mode(mode | 0o644);
                let _ = fs::set_permissions(&p, perms);
            }
        }
    }
    Ok(())
}

/// Standard categories matching real Linux FHS organization under /opt/Application
pub const STANDARD_CATEGORIES: &[(&str, &str, &str)] = &[
    ("ide", "IDEs & Editors", "Antigravity, Android Studio, VS Code, JetBrains"),
    ("sdk", "SDKs & Toolchains", "Flutter SDK, Android SDK, OpenJDK, Rust toolchains"),
    ("browsers", "Web Browsers", "Chrome, Firefox, Chromium, Edge"),
    ("databases", "Databases & Storage", "PostgreSQL, Redis, MySQL, MongoDB"),
    ("runtimes", "Runtimes & Interpreters", "Node.js, Deno, Bun, Python, Go"),
    ("network", "Network & VPN", "NetBird, WireGuard, Wireshark"),
    ("office", "Office & Productivity", "OnlyOffice, LibreOffice, Document Viewers"),
    ("tools", "System & Dev Tools", "CLI utilities, profilers, Docker/Podman helpers"),
];

/// Suggests the standard category based on application ID or executable name.
pub fn suggest_category(app_id_or_name: &str) -> &'static str {
    let lower = app_id_or_name.to_lowercase();
    if lower.contains("ide") || lower.contains("code") || lower.contains("studio") || lower.contains("editor") {
        "ide"
    } else if lower.contains("sdk") || lower.contains("flutter") || lower.contains("jdk") || lower.contains("cargo") {
        "sdk"
    } else if lower.contains("chrome") || lower.contains("firefox") || lower.contains("browser") {
        "browsers"
    } else if lower.contains("sql") || lower.contains("redis") || lower.contains("database") || lower.contains("db") {
        "databases"
    } else if lower.contains("node") || lower.contains("deno") || lower.contains("bun") || lower.contains("python") {
        "runtimes"
    } else if lower.contains("vpn") || lower.contains("netbird") || lower.contains("network") {
        "network"
    } else if lower.contains("office") || lower.contains("writer") || lower.contains("calc") {
        "office"
    } else {
        "tools"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_source_kind() {
        assert_eq!(detect_source_kind("https://example.com/app.tar.gz"), SourceKind::Url);
        assert_eq!(detect_source_kind("app.tar.gz"), SourceKind::Tarball);
        assert_eq!(detect_source_kind("app.tgz"), SourceKind::Tarball);
        assert_eq!(detect_source_kind("app.tar.xz"), SourceKind::Tarball);
        assert_eq!(detect_source_kind("app.zip"), SourceKind::Zip);
        assert_eq!(detect_source_kind("package.deb"), SourceKind::Deb);
        assert_eq!(detect_source_kind("editor.AppImage"), SourceKind::AppImage);
        assert_eq!(detect_source_kind("/opt/my-folder"), SourceKind::Directory);
    }

    #[test]
    fn test_suggest_category() {
        assert_eq!(suggest_category("antigravity-ide"), "ide");
        assert_eq!(suggest_category("flutter-sdk"), "sdk");
        assert_eq!(suggest_category("google-chrome"), "browsers");
        assert_eq!(suggest_category("postgresql-server"), "databases");
        assert_eq!(suggest_category("python3.11"), "runtimes");
        assert_eq!(suggest_category("netbird"), "network");
        assert_eq!(suggest_category("random-util"), "tools");
    }
}
