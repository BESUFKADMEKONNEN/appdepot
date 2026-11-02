//! Detection heuristics for executables, icons, categories, and sandboxes.
//!
//! Transforms messy vendor tarballs into first-class system packages with
//! ranked launchers, crisp desktop icons, and automated permission fixes.

use std::fs::File;
use std::io::Read;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

/// Scored candidate executable discovered in an extracted package.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateExecutable {
    pub path: PathBuf,
    pub relative_path: PathBuf,
    pub score: i32,
    pub is_elf: bool,
}

/// Discovered icon candidate with ranking.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateIcon {
    pub path: PathBuf,
    pub relative_path: PathBuf,
    pub is_svg: bool,
    pub score: i32,
}

pub struct Heuristics;

impl Heuristics {
    /// Checks if a file has the standard ELF binary magic bytes (\x7fELF).
    pub fn is_elf_binary(path: &Path) -> bool {
        if let Ok(mut file) = File::open(path) {
            let mut magic = [0u8; 4];
            if file.read_exact(&mut magic).is_ok() {
                return magic == [0x7f, b'E', b'L', b'F'];
            }
        }
        false
    }

    /// Scores an executable candidate according to Section 10.1 of the specification.
    pub fn score_executable(
        path: &Path,
        root_dir: &Path,
        app_id: &str,
        is_elf: bool,
        is_executable_mode: bool,
    ) -> i32 {
        let mut score = 0;
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name,
            None => return -100,
        };
        let lower_name = file_name.to_lowercase();
        let app_id_lower = app_id.to_lowercase();

        // 1. Is an executable ELF or executable script
        if is_elf || is_executable_mode {
            score += 50;
        }

        // 2. Parent directory is install root or "bin"
        if let Some(parent) = path.parent() {
            if parent == root_dir {
                score += 30;
            } else if parent.file_name().and_then(|n| n.to_str()) == Some("bin") {
                score += 30;
            }
        }

        // 3. Normalized basename matches app ID
        if lower_name == app_id_lower {
            score += 35;
        } else if lower_name.contains(&app_id_lower) || app_id_lower.contains(&lower_name) {
            score += 20;
        }

        // 4. Penalize helper binaries, crashpad, uninstallers, and shared libraries
        if lower_name == "chrome-sandbox"
            || lower_name == "chrome_crashpad_handler"
            || lower_name == "crashpad_handler"
            || lower_name.starts_with("uninstall")
            || lower_name.starts_with("update")
            || lower_name.ends_with(".so")
            || lower_name.contains(".so.")
            || lower_name.ends_with(".pak")
        {
            score -= 80;
        }

        // 5. Directory depth penalty
        if let Ok(rel) = path.strip_prefix(root_dir) {
            let depth = rel.components().count();
            if depth > 3 {
                score -= 30;
            }
        }

        // 6. Penalize internal runtime directories
        let path_str = path.to_string_lossy();
        if path_str.contains("/lib/")
            || path_str.contains("/libexec/")
            || path_str.contains("/resources/")
            || path_str.contains("/node_modules/")
        {
            score -= 25;
        }

        score
    }

    /// Evaluates if an icon path should be excluded.
    pub fn is_excluded_icon_path(rel_path: &Path) -> bool {
        let s = rel_path.to_string_lossy().to_lowercase();
        s.contains("extensions/")
            || s.contains("node_modules/")
            || s.contains("themes/")
            || s.contains("test/")
            || s.contains("docs/")
            || s.contains("demo/")
            || s.contains("samples/")
            || s.contains("locale/")
            || s.contains("language-packs/")
    }

    /// Ranks icon candidates (preferring SVG, root/assets, and matching name).
    pub fn score_icon(path: &Path, root_dir: &Path, app_id: &str) -> i32 {
        let rel_path = match path.strip_prefix(root_dir) {
            Ok(rel) => rel,
            Err(_) => return -100,
        };

        if Self::is_excluded_icon_path(rel_path) {
            return -100;
        }

        let mut score = 0;
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_lowercase(),
            None => return -100,
        };

        // Prefer SVG vector icons
        let is_svg = file_name.ends_with(".svg");
        if is_svg {
            score += 50;
        } else if file_name.ends_with(".png") {
            score += 30;
        } else {
            return -100;
        }

        // Name matches app ID or common icon names
        let app_id_lower = app_id.to_lowercase();
        if file_name.starts_with(&app_id_lower) {
            score += 35;
        } else if file_name.starts_with("icon") || file_name.starts_with("logo") || file_name.starts_with("app") {
            score += 20;
        }

        // Preferred locations
        let rel_str = rel_path.to_string_lossy().to_lowercase();
        if rel_str.starts_with("share/icons") || rel_str.starts_with("share/pixmaps") {
            score += 25;
        } else if rel_str.starts_with("resources") || rel_str.starts_with("assets") {
            score += 15;
        }

        score
    }

    /// Recursively discovers and ranks all candidate executables in an installation directory.
    pub fn discover_executables(root_dir: &Path, app_id: &str) -> Vec<CandidateExecutable> {
        let mut candidates = Vec::new();
        Self::scan_executables_recursive(root_dir, root_dir, app_id, 0, &mut candidates);
        candidates.sort_by(|a, b| b.score.cmp(&a.score));
        candidates
    }

    fn scan_executables_recursive(
        dir: &Path,
        root_dir: &Path,
        app_id: &str,
        depth: usize,
        out: &mut Vec<CandidateExecutable>,
    ) {
        if depth > 5 {
            return;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let dname = entry.file_name().to_string_lossy().to_string();
                if dname.starts_with('.') || dname == "node_modules" || dname == "test" || dname == "docs" {
                    continue;
                }
                Self::scan_executables_recursive(&p, root_dir, app_id, depth + 1, out);
            } else if p.is_file() {
                let is_elf = Self::is_elf_binary(&p);
                let is_exec_mode = entry
                    .metadata()
                    .map(|m| (m.permissions().mode() & 0o111) != 0)
                    .unwrap_or(false);

                // Consider if ELF or executable permission
                if is_elf || is_exec_mode {
                    let score = Self::score_executable(&p, root_dir, app_id, is_elf, is_exec_mode);
                    let relative_path = p.strip_prefix(root_dir).unwrap_or(&p).to_path_buf();
                    out.push(CandidateExecutable {
                        path: p,
                        relative_path,
                        score,
                        is_elf,
                    });
                }
            }
        }
    }

    /// Recursively discovers and ranks all candidate icons in an installation directory.
    pub fn discover_icons(root_dir: &Path, app_id: &str) -> Vec<CandidateIcon> {
        let mut candidates = Vec::new();
        Self::scan_icons_recursive(root_dir, root_dir, app_id, 0, &mut candidates);
        candidates.sort_by(|a, b| b.score.cmp(&a.score));
        candidates
    }

    fn scan_icons_recursive(
        dir: &Path,
        root_dir: &Path,
        app_id: &str,
        depth: usize,
        out: &mut Vec<CandidateIcon>,
    ) {
        if depth > 5 {
            return;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let dname = entry.file_name().to_string_lossy().to_string();
                if dname.starts_with('.') || dname == "node_modules" {
                    continue;
                }
                Self::scan_icons_recursive(&p, root_dir, app_id, depth + 1, out);
            } else if p.is_file() {
                let fname = entry.file_name().to_string_lossy().to_lowercase();
                if fname.ends_with(".svg") || fname.ends_with(".png") {
                    let score = Self::score_icon(&p, root_dir, app_id);
                    if score > 0 {
                        let relative_path = p.strip_prefix(root_dir).unwrap_or(&p).to_path_buf();
                        out.push(CandidateIcon {
                            path: p,
                            relative_path,
                            is_svg: fname.ends_with(".svg"),
                            score,
                        });
                    }
                }
            }
        }
    }

    /// Checks if a package contains the Chromium setuid sandbox helper.
    pub fn detect_chromium_sandbox(app_dir: &Path) -> Option<PathBuf> {
        let sandbox_candidate = app_dir.join("chrome-sandbox");
        if sandbox_candidate.exists() {
            Some(sandbox_candidate)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_score_executable_priorities() {
        let root = Path::new("/opt/Application/ide/antigravity");
        let main_bin = root.join("antigravity");
        let crashpad = root.join("chrome_crashpad_handler");
        let helper = root.join("resources/helper");

        let score_main = Heuristics::score_executable(&main_bin, root, "antigravity", true, true);
        let score_crash = Heuristics::score_executable(&crashpad, root, "antigravity", true, true);
        let score_helper = Heuristics::score_executable(&helper, root, "antigravity", false, true);

        assert!(score_main > 100);
        assert!(score_crash < 50);
        assert!(score_main > score_crash);
        assert!(score_main > score_helper);
    }

    #[test]
    fn test_discover_executables() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let bin_dir = root.join("bin");
        std::fs::create_dir_all(&bin_dir).unwrap();

        let app_exec = bin_dir.join("myapp");
        std::fs::write(&app_exec, b"#!/bin/sh\necho hi\n").unwrap();
        let mut perms = std::fs::metadata(&app_exec).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&app_exec, perms).unwrap();

        let candidates = Heuristics::discover_executables(root, "myapp");
        assert!(!candidates.is_empty());
        assert_eq!(candidates[0].path, app_exec);
    }
}
