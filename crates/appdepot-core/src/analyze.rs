//! Detection heuristics for executables, icons, categories, and sandboxes.
//!
//! Transforms messy vendor tarballs into first-class system packages with
//! ranked launchers, crisp desktop icons, and automated permission fixes.

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
            score += 25;
        } else if lower_name.contains(&app_id_lower) {
            score += 15;
        }

        // 4. Penalize helper binaries, crashpad, uninstallers, and shared libraries
        if lower_name == "chrome-sandbox"
            || lower_name == "chrome_crashpad_handler"
            || lower_name == "crashpad_handler"
            || lower_name.starts_with("uninstall")
            || lower_name.starts_with("update")
            || lower_name.ends_with(".so")
            || lower_name.contains(".so.")
        {
            score -= 60;
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
            score -= 20;
        }

        score
    }

    /// Evaluates if an icon path should be excluded according to Rule 4.
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
        if file_name.ends_with(".svg") {
            score += 50;
        } else if file_name.ends_with(".png") {
            score += 30;
        }

        // Name matches app ID or common icon names
        let app_id_lower = app_id.to_lowercase();
        if file_name.starts_with(&app_id_lower) {
            score += 30;
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
