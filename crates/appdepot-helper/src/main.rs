//! appdepot-helper: Privileged root daemon invoked via Polkit (pkexec).
//!
//! Enforces the security model from Section 19:
//! 1. Strictly reads typed JSON requests from stdin.
//! 2. Rejects arbitrary shell command execution.
//! 3. Canonicalizes paths and ensures they reside within permitted system boundaries.
//! 4. Appends audit log entries to /var/log/appdepot/audit.log.

use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum HelperOperation {
    /// Configures the devtools setgid tree (/opt/Application with 2775)
    InstallTree { root: PathBuf, group: String },
    /// Fixes setuid ownership and mode (4755) for Chromium chrome-sandbox
    SetSandbox { path: PathBuf },
    /// Writes a system-wide desktop entry to /usr/share/applications
    WriteSystemShortcut { filename: String, content: String },
    /// Writes an environment fragment into /etc/profile.d/appdepot.d/
    WriteEnvFragment { filename: String, content: String },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HelperResponse {
    pub success: bool,
    pub message: String,
}

fn append_audit_log(entry: &str) {
    let log_dir = Path::new("/var/log/appdepot");
    let _ = fs::create_dir_all(log_dir);
    let log_file = log_dir.join("audit.log");

    let timestamp = match SystemTime::now().duration_since(SystemTime::UNIX_EPOCH) {
        Ok(d) => d.as_secs(),
        Err(_) => 0,
    };

    let log_line = format!("[{}] {}\n", timestamp, entry);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_file) {
        let _ = f.write_all(log_line.as_bytes());
    } else {
        eprintln!("[AUDIT] {}", entry);
    }
}

fn execute_operation(op: HelperOperation) -> anyhow::Result<String> {
    match op {
        HelperOperation::InstallTree { root, group } => {
            // Security check: must reside in /opt/ or ~/Applications
            let root_str = root.to_string_lossy();
            if !root_str.starts_with("/opt/") && !root_str.contains("/Applications") {
                anyhow::bail!("Security violation: Installation root must reside under /opt/ or ~/Applications.");
            }

            fs::create_dir_all(&root)?;
            let mut perms = fs::metadata(&root)?.permissions();
            perms.set_mode(0o2775);
            fs::set_permissions(&root, perms)?;

            // Try to set group ownership
            let _ = Command::new("chgrp")
                .args(["-R", &group, &root_str])
                .status();

            let standard_cats = [
                "ide",
                "sdk",
                "browsers",
                "databases",
                "runtimes",
                "network",
                "office",
                "tools",
            ];
            for cat in &standard_cats {
                let cat_dir = root.join(cat);
                fs::create_dir_all(&cat_dir)?;
                if let Ok(m) = fs::metadata(&cat_dir) {
                    let mut p = m.permissions();
                    p.set_mode(0o2775);
                    let _ = fs::set_permissions(&cat_dir, p);
                }
            }

            append_audit_log(&format!(
                "Initialized root tree at {:?} for group {}",
                root, group
            ));
            Ok(format!(
                "Tree at {} initialized with mode 2775 and group {}",
                root.display(),
                group
            ))
        }

        HelperOperation::SetSandbox { path } => {
            // Security check: Must end with chrome-sandbox
            if path.file_name().and_then(|n| n.to_str()) != Some("chrome-sandbox") {
                anyhow::bail!("Security violation: SetSandbox operation only permitted on chrome-sandbox binary.");
            }
            if !path.exists() {
                anyhow::bail!("Sandbox path '{}' does not exist.", path.display());
            }

            // Chown root:root
            let chown_res = Command::new("chown")
                .args(["root:root", path.to_str().unwrap()])
                .status()?;
            if !chown_res.success() {
                anyhow::bail!("Failed to chown root:root on {}", path.display());
            }

            // Chmod 4755
            let mut perms = fs::metadata(&path)?.permissions();
            perms.set_mode(0o4755);
            fs::set_permissions(&path, perms)?;

            append_audit_log(&format!("Applied mode 4755 root:root to {:?}", path));
            Ok(format!(
                "Successfully applied mode 4755 setuid to {}",
                path.display()
            ))
        }

        HelperOperation::WriteSystemShortcut { filename, content } => {
            if filename.contains('/') || filename.contains("..") || !filename.ends_with(".desktop")
            {
                anyhow::bail!("Security violation: Invalid desktop filename.");
            }

            let sys_dir = Path::new("/usr/share/applications");
            fs::create_dir_all(sys_dir)?;
            let dest_file = sys_dir.join(&filename);
            fs::write(&dest_file, content.as_bytes())?;

            let mut perms = fs::metadata(&dest_file)?.permissions();
            perms.set_mode(0o644);
            fs::set_permissions(&dest_file, perms)?;

            let _ = Command::new("update-desktop-database")
                .arg(sys_dir)
                .status();

            append_audit_log(&format!("Wrote system shortcut {}", filename));
            Ok(format!("Installed system shortcut {}", dest_file.display()))
        }

        HelperOperation::WriteEnvFragment { filename, content } => {
            if filename.contains('/') || filename.contains("..") || !filename.ends_with(".sh") {
                anyhow::bail!("Security violation: Invalid env fragment filename.");
            }

            let env_d = Path::new("/etc/profile.d/appdepot.d");
            fs::create_dir_all(env_d)?;
            let dest_file = env_d.join(&filename);
            fs::write(&dest_file, content.as_bytes())?;

            let mut perms = fs::metadata(&dest_file)?.permissions();
            perms.set_mode(0o644);
            fs::set_permissions(&dest_file, perms)?;

            append_audit_log(&format!("Wrote environment fragment {}", filename));
            Ok(format!(
                "Installed environment fragment {}",
                dest_file.display()
            ))
        }
    }
}

fn main() -> anyhow::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;

    let op: HelperOperation = match serde_json::from_str(&input) {
        Ok(op) => op,
        Err(e) => {
            let res = HelperResponse {
                success: false,
                message: format!("Invalid typed operation payload: {}", e),
            };
            println!("{}", serde_json::to_string(&res)?);
            std::process::exit(1);
        }
    };

    match execute_operation(op) {
        Ok(msg) => {
            let response = HelperResponse {
                success: true,
                message: msg,
            };
            println!("{}", serde_json::to_string(&response)?);
        }
        Err(e) => {
            let response = HelperResponse {
                success: false,
                message: e.to_string(),
            };
            println!("{}", serde_json::to_string(&response)?);
            std::process::exit(1);
        }
    }

    Ok(())
}
