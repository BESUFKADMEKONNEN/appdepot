//! System health checks and automated repairs (Catalogue D-001..D-012).
//!
//! Provides the diagnostic engine that catches broken symlinks, placeholder icons,
//! missing PATH fragments, and sandbox permission issues, with automated 1-click repairs.

use appdepot_types::{DoctorFinding, DoctorSeverity};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

pub struct Doctor;

impl Doctor {
    /// Validates an icon path to prevent placeholder leaks (D-005).
    pub fn check_icon_path(icon_path: &Path) -> Option<DoctorFinding> {
        let path_str = icon_path.to_string_lossy();
        if path_str.contains("/path/to/icon") || path_str.contains("placeholder") {
            return Some(DoctorFinding {
                code: "D-005".to_string(),
                severity: DoctorSeverity::Error,
                message: format!("Icon path is an unreplaced placeholder: {}", path_str),
                fixable: true,
                hint: Some("Run auto-discovery or remove invalid icon reference".to_string()),
            });
        }

        if !icon_path.exists() {
            return Some(DoctorFinding {
                code: "D-005".to_string(),
                severity: DoctorSeverity::Warning,
                message: format!("Icon file does not exist on disk: {}", path_str),
                fixable: true,
                hint: Some("Run icon auto-discovery to relink valid icon".to_string()),
            });
        }

        None
    }

    /// Checks if a command symlink points to a valid target (D-003).
    pub fn check_symlink(link_path: &Path) -> Option<DoctorFinding> {
        if let Ok(meta) = link_path.symlink_metadata() {
            if meta.file_type().is_symlink() && !link_path.exists() {
                return Some(DoctorFinding {
                    code: "D-003".to_string(),
                    severity: DoctorSeverity::Warning,
                    message: format!("Dangling command symlink: {}", link_path.display()),
                    fixable: true,
                    hint: Some("Prune broken symlink or update application target".to_string()),
                });
            }
        }
        None
    }

    /// Verifies the setuid sandbox permissions on Electron/Chromium applications (D-006).
    pub fn check_chromium_sandbox(sandbox_path: &Path, is_setuid: bool) -> Option<DoctorFinding> {
        if !is_setuid {
            return Some(DoctorFinding {
                code: "D-006".to_string(),
                severity: DoctorSeverity::Error,
                message: format!(
                    "Chromium sandbox helper is missing setuid permissions: {}",
                    sandbox_path.display()
                ),
                fixable: true,
                hint: Some("Run depot doctor --fix to apply chmod 4755".to_string()),
            });
        }
        None
    }

    /// Runs all diagnostic checks against the host machine.
    pub fn run_diagnostics(root_path: &Path) -> Vec<DoctorFinding> {
        let mut findings = Vec::new();

        // 1. D-001: Root path existence and setgid
        if !root_path.exists() {
            findings.push(DoctorFinding {
                code: "D-001".to_string(),
                severity: DoctorSeverity::Error,
                message: format!("Application root {} does not exist", root_path.display()),
                fixable: true,
                hint: Some(format!("Create {} with mode 2775", root_path.display())),
            });
        } else if let Ok(meta) = root_path.metadata() {
            let mode = meta.permissions().mode();
            let is_setgid = (mode & 0o2000) != 0;
            if !is_setgid {
                findings.push(DoctorFinding {
                    code: "D-001".to_string(),
                    severity: DoctorSeverity::Warning,
                    message: format!(
                        "Root {} does not have setgid bit active (mode: {:o}, recommended: 2775)",
                        root_path.display(),
                        mode & 0o7777
                    ),
                    fixable: true,
                    hint: Some(
                        "Apply chmod 2775 to enable shared developer group writes".to_string(),
                    ),
                });
            }
        }

        // 2. D-003: Dangling symlinks in ~/.local/bin and /usr/local/bin
        let home = std::env::var("HOME").unwrap_or_default();
        let bin_dirs = vec![
            PathBuf::from(&home).join(".local/bin"),
            PathBuf::from("/usr/local/bin"),
        ];

        for dir in bin_dirs {
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if let Some(f) = Self::check_symlink(&p) {
                        findings.push(f);
                    }
                }
            }
        }

        // 3. D-006: Chromium sandbox helpers under root_path
        if root_path.exists() {
            scan_sandboxes_recursive(root_path, &mut findings);
        }

        // 4. D-007: Modular environment loader
        let sys_env = Path::new("/etc/profile.d/appdepot.sh");
        let user_env = PathBuf::from(&home).join(".config/appdepot/env.sh");
        if !sys_env.exists() && !user_env.exists() {
            findings.push(DoctorFinding {
                code: "D-007".to_string(),
                severity: DoctorSeverity::Warning,
                message: "No AppDepot environment loader found in /etc/profile.d or ~/.config/appdepot/env.sh".to_string(),
                fixable: true,
                hint: Some("Generate environment loader so ~/.local/bin and AppDepot paths are automatically in $PATH".to_string()),
            });
        }

        findings
    }

    /// Automatically fixes fixable findings.
    pub fn apply_fixes(root_path: &Path) -> Vec<String> {
        let mut fixed = Vec::new();

        // Fix D-001: Root directory
        if !root_path.exists() {
            if fs::create_dir_all(root_path).is_ok() {
                let mut perms = fs::metadata(root_path).unwrap().permissions();
                perms.set_mode(0o2775);
                let _ = fs::set_permissions(root_path, perms);
                fixed.push(format!(
                    "Created install root {} with mode 2775",
                    root_path.display()
                ));
            }
        } else if let Ok(meta) = root_path.metadata() {
            let mode = meta.permissions().mode();
            if (mode & 0o2000) == 0 {
                let mut perms = meta.permissions();
                perms.set_mode(mode | 0o2775);
                if fs::set_permissions(root_path, perms).is_ok() {
                    fixed.push(format!(
                        "Applied mode 2775 (setgid) to {}",
                        root_path.display()
                    ));
                }
            }
        }

        // Fix D-003: Prune dangling symlinks
        let home = std::env::var("HOME").unwrap_or_default();
        let bin_dirs = vec![
            PathBuf::from(&home).join(".local/bin"),
            PathBuf::from("/usr/local/bin"),
        ];

        for dir in bin_dirs {
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if let Ok(meta) = p.symlink_metadata() {
                        if meta.file_type().is_symlink()
                            && !p.exists()
                            && fs::remove_file(&p).is_ok()
                        {
                            fixed.push(format!("Pruned dangling symlink: {}", p.display()));
                        }
                    }
                }
            }
        }

        // Fix D-007: Generate user environment loader in ~/.config/appdepot/env.sh
        if let Ok(env_path) = crate::env::write_user_env_loader() {
            fixed.push(format!(
                "Generated user environment loader at {}",
                env_path.display()
            ));
        }

        fixed
    }
}

fn scan_sandboxes_recursive(dir: &Path, findings: &mut Vec<DoctorFinding>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') {
                    scan_sandboxes_recursive(&p, findings);
                }
            } else if entry.file_name() == "chrome-sandbox" {
                if let Ok(meta) = p.metadata() {
                    let mode = meta.permissions().mode();
                    let is_setuid = (mode & 0o4000) != 0;
                    if let Some(f) = Doctor::check_chromium_sandbox(&p, is_setuid) {
                        findings.push(f);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_check_icon_placeholder() {
        let finding = Doctor::check_icon_path(Path::new("/path/to/icon.png"));
        assert!(finding.is_some());
        assert_eq!(finding.unwrap().code, "D-005");
    }

    #[test]
    fn test_check_dangling_symlink() {
        let dir = tempdir().unwrap();
        let link = dir.path().join("broken_link");
        let non_existent = dir.path().join("does_not_exist");
        std::os::unix::fs::symlink(&non_existent, &link).unwrap();

        let finding = Doctor::check_symlink(&link);
        assert!(finding.is_some());
        assert_eq!(finding.unwrap().code, "D-003");
    }
}
