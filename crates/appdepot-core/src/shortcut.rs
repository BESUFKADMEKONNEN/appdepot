//! Desktop entry generator (.desktop) and terminal launcher links.
//!
//! Complies with the freedesktop.org Desktop Entry Specification and guarantees
//! that non-packaged software appears seamlessly in application menus and shells.

use crate::Error;
use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone)]
pub struct DesktopShortcut {
    pub id: String,
    pub name: String,
    pub generic_name: Option<String>,
    pub comment: Option<String>,
    pub exec_path: PathBuf,
    pub icon_path: Option<PathBuf>,
    pub categories: String,
    pub terminal: bool,
    pub startup_wm_class: Option<String>,
}

impl DesktopShortcut {
    /// Renders the complete, validated `.desktop` file format.
    pub fn render_desktop_file(&self) -> String {
        let mut out = String::new();
        out.push_str("[Desktop Entry]\n");
        out.push_str("Type=Application\n");
        out.push_str("Version=1.5\n");
        out.push_str(&format!("Name={}\n", self.name));
        if let Some(ref generic) = self.generic_name {
            out.push_str(&format!("GenericName={}\n", generic));
        }
        if let Some(ref comment) = self.comment {
            out.push_str(&format!("Comment={}\n", comment));
        }
        out.push_str(&format!("Exec=\"{}\" %U\n", self.exec_path.display()));
        out.push_str(&format!("TryExec={}\n", self.exec_path.display()));
        if let Some(ref icon) = self.icon_path {
            out.push_str(&format!("Icon={}\n", icon.display()));
        }
        out.push_str(&format!("Terminal={}\n", self.terminal));
        out.push_str(&format!("Categories={}\n", self.categories));
        if let Some(ref wm_class) = self.startup_wm_class {
            out.push_str(&format!("StartupWMClass={}\n", wm_class));
        }
        out.push_str("StartupNotify=true\n");
        out.push_str(&format!("X-AppDepot-Id={}\n", self.id));
        out.push_str("X-AppDepot-Managed=true\n");
        out
    }

    /// Installs the desktop entry file into user or system applications directory.
    pub fn install_desktop_file(&self) -> Result<PathBuf, Error> {
        let content = self.render_desktop_file();

        // Target user applications directory (~/.local/share/applications)
        let home =
            std::env::var("HOME").map_err(|_| Error::Custom("HOME env var not set".into()))?;
        let user_apps = PathBuf::from(&home).join(".local/share/applications");
        fs::create_dir_all(&user_apps)?;

        let dest_file = user_apps.join(format!("appdepot-{}.desktop", self.id));
        fs::write(&dest_file, content.as_bytes())?;

        // Update desktop database
        let _ = Command::new("update-desktop-database")
            .arg(&user_apps)
            .status();

        // Also try system-wide /usr/share/applications if writable
        let sys_apps = Path::new("/usr/share/applications");
        if is_dir_writable(sys_apps) {
            let sys_file = sys_apps.join(format!("appdepot-{}.desktop", self.id));
            let _ = fs::write(&sys_file, content.as_bytes());
            let _ = Command::new("update-desktop-database")
                .arg(sys_apps)
                .status();
        }

        Ok(dest_file)
    }

    /// Creates a symlink in ~/.local/bin and /usr/local/bin for global shell access.
    pub fn install_bin_symlink(&self) -> Result<PathBuf, Error> {
        let home =
            std::env::var("HOME").map_err(|_| Error::Custom("HOME env var not set".into()))?;
        let user_bin = PathBuf::from(&home).join(".local/bin");
        fs::create_dir_all(&user_bin)?;

        let link_path = user_bin.join(&self.id);
        if link_path.exists() || link_path.symlink_metadata().is_ok() {
            let _ = fs::remove_file(&link_path);
        }
        symlink(&self.exec_path, &link_path)?;

        // Also attempt /usr/local/bin if writable
        let sys_bin = Path::new("/usr/local/bin");
        if is_dir_writable(sys_bin) {
            let sys_link = sys_bin.join(&self.id);
            if sys_link.exists() || sys_link.symlink_metadata().is_ok() {
                let _ = fs::remove_file(&sys_link);
            }
            let _ = symlink(&self.exec_path, &sys_link);
        }

        Ok(link_path)
    }
}

/// Removes all desktop entry files and binary symlinks for an application cleanly.
pub fn remove_shortcuts(app_id: &str) -> Vec<PathBuf> {
    let mut removed = Vec::new();
    let home = std::env::var("HOME").unwrap_or_default();

    // Candidates for desktop files
    let desktop_candidates = vec![
        PathBuf::from(&home).join(format!(
            ".local/share/applications/appdepot-{}.desktop",
            app_id
        )),
        PathBuf::from(&home).join(format!(".local/share/applications/{}.desktop", app_id)),
        PathBuf::from(format!(
            "/usr/share/applications/appdepot-{}.desktop",
            app_id
        )),
    ];

    for path in desktop_candidates {
        if (path.exists() || path.symlink_metadata().is_ok()) && fs::remove_file(&path).is_ok() {
            removed.push(path);
        }
    }

    // Update desktop databases
    let user_apps = PathBuf::from(&home).join(".local/share/applications");
    let _ = Command::new("update-desktop-database")
        .arg(&user_apps)
        .status();

    // Candidates for binary symlinks
    let bin_candidates = vec![
        PathBuf::from(&home).join(format!(".local/bin/{}", app_id)),
        PathBuf::from(format!("/usr/local/bin/{}", app_id)),
    ];

    for path in bin_candidates {
        if (path.exists() || path.symlink_metadata().is_ok()) && fs::remove_file(&path).is_ok() {
            removed.push(path);
        }
    }

    removed
}

fn is_dir_writable(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    let test_file = path.join(".appdepot_test_write");
    if fs::write(&test_file, b"test").is_ok() {
        let _ = fs::remove_file(test_file);
        true
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_render_desktop_file() {
        let shortcut = DesktopShortcut {
            id: "myapp".to_string(),
            name: "My Application".to_string(),
            generic_name: Some("Text Editor".to_string()),
            comment: Some("A modern text editor".to_string()),
            exec_path: PathBuf::from("/opt/Application/ide/myapp/bin/myapp"),
            icon_path: Some(PathBuf::from("/opt/Application/ide/myapp/icon.svg")),
            categories: "Development;IDE;".to_string(),
            terminal: false,
            startup_wm_class: Some("myapp".to_string()),
        };

        let rendered = shortcut.render_desktop_file();
        assert!(rendered.contains("Name=My Application"));
        assert!(rendered.contains("Exec=\"/opt/Application/ide/myapp/bin/myapp\" %U"));
        assert!(rendered.contains("Icon=/opt/Application/ide/myapp/icon.svg"));
        assert!(rendered.contains("X-AppDepot-Managed=true"));
        assert!(rendered.contains("Categories=Development;IDE;"));
    }

    #[test]
    fn test_install_and_remove_shortcuts() {
        let dir = tempdir().unwrap();
        let exec = dir.path().join("fake_exec");
        std::fs::write(&exec, b"fake").unwrap();

        let shortcut = DesktopShortcut {
            id: "test-unit-app".to_string(),
            name: "Test Unit App".to_string(),
            generic_name: None,
            comment: None,
            exec_path: exec,
            icon_path: None,
            categories: "Utility;".to_string(),
            terminal: false,
            startup_wm_class: None,
        };

        let desktop_res = shortcut.install_desktop_file();
        assert!(desktop_res.is_ok());

        let bin_res = shortcut.install_bin_symlink();
        assert!(bin_res.is_ok());

        // Remove
        let removed = remove_shortcuts("test-unit-app");
        assert!(!removed.is_empty());
    }
}
