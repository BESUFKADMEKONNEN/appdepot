//! System health checks and automated repairs (Catalogue D-001..D-012).
//!
//! Provides the diagnostic engine that catches broken symlinks, placeholder icons,
//! missing PATH fragments, and sandbox permission issues.

use appdepot_types::{DoctorFinding, DoctorSeverity};
use std::path::Path;

pub struct Doctor;

impl Doctor {
    /// Validates an icon path to prevent the prototype's placeholder leak (D-005).
    pub fn check_icon_path(icon_path: &Path) -> Option<DoctorFinding> {
        let path_str = icon_path.to_string_lossy();
        if path_str.contains("/path/to/icon") || path_str.contains("placeholder") {
            return Some(DoctorFinding {
                code: "D-005".to_string(),
                severity: DoctorSeverity::Error,
                message: format!("Icon path is an unreplaced placeholder: {}", path_str),
                fixable: true,
                hint: Some("Run icon auto-discovery or generate a monogram fallback".to_string()),
            });
        }

        if !icon_path.exists() {
            return Some(DoctorFinding {
                code: "D-005".to_string(),
                severity: DoctorSeverity::Error,
                message: format!("Icon file does not exist on disk: {}", path_str),
                fixable: true,
                hint: Some("Repair shortcut with depot shortcut repair".to_string()),
            });
        }

        None
    }

    /// Checks if a command symlink points to a valid target (D-003).
    pub fn check_symlink(link_path: &Path) -> Option<DoctorFinding> {
        if !link_path.exists() && link_path.is_symlink() {
            return Some(DoctorFinding {
                code: "D-003".to_string(),
                severity: DoctorSeverity::Warning,
                message: format!("Dangling command symlink: {}", link_path.display()),
                fixable: true,
                hint: Some("Remove dangling symlink or update application path".to_string()),
            });
        }
        None
    }

    /// Verifies the setuid sandbox permissions on Electron/Chromium applications (D-006).
    pub fn check_chromium_sandbox(sandbox_path: &Path, is_setuid: bool) -> Option<DoctorFinding> {
        if !is_setuid {
            return Some(DoctorFinding {
                code: "D-006".to_string(),
                severity: DoctorSeverity::Error,
                message: format!("Chromium sandbox helper is missing setuid permissions: {}", sandbox_path.display()),
                fixable: true,
                hint: Some("Run depot doctor --fix to apply chmod 4755 via appdepot-helper".to_string()),
            });
        }
        None
    }
}
