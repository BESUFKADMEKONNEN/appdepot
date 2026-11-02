//! depot: AppDepot Command-Line Interface
//!
//! Provides the developer CLI for managing, installing, organizing,
//! and troubleshooting Linux applications dynamically from /opt/Application.

use appdepot_core::analyze::Heuristics;
use appdepot_core::doctor::Doctor;
use appdepot_core::env::{write_app_fragment, write_user_env_loader};
use appdepot_core::shortcut::{remove_shortcuts, DesktopShortcut};
use appdepot_core::sources::{detect_source_kind, download_from_url, suggest_category, unpack_source, SourceKind};
use appdepot_core::typo::{correct_category_typo, fuzzy_find_source_file, suggest_closest, CANONICAL_CATEGORIES};
use clap::{Parser, Subcommand};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(
    name = "depot",
    author = "Besifkad",
    version = "0.1.0",
    about = "Windows' Program Files experience, done the Linux way.",
    long_about = "Group, install, organize, and launch every Linux application from one organized tree."
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Output results formatted as JSON
    #[arg(long, global = true)]
    json: bool,

    /// Suppress informational output
    #[arg(short, long, global = true)]
    quiet: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize the install root, standard categories, and permissions
    Init {
        /// Base root path for the application library
        #[arg(long, default_value = "/opt/Application")]
        root: PathBuf,

        /// Group name with shared write permissions (setgid)
        #[arg(long, default_value = "devtools")]
        group: String,
    },

    /// List installed applications, categories, and health states
    List {
        /// Filter by specific category (ide, sdk, browsers, databases, runtimes, etc.)
        #[arg(short, long)]
        category: Option<String>,
    },

    /// Inspect detailed metadata, ledger artifacts, and health of an app
    Info {
        /// Application ID
        app: String,
    },

    /// Install an application from an archive, .deb, AppImage, or URL
    Install {
        /// Path or URL to the source archive or package
        source: String,

        /// Target category (e.g. ide, sdk, browsers, tools)
        #[arg(short, long)]
        category: Option<String>,

        /// Override display name / application ID
        #[arg(short, long)]
        name: Option<String>,

        /// Preview planned actions without modifying the filesystem
        #[arg(long)]
        dry_run: bool,
    },

    /// Remove an application cleanly using its ledger records
    Remove {
        /// Application ID to remove
        app: String,

        /// Skip confirmation prompt
        #[arg(short, long)]
        yes: bool,
    },

    /// Link an existing external application directory into a category
    Link {
        /// Path to the external application folder (e.g. /opt/google/chrome)
        path: PathBuf,

        /// Target category
        #[arg(short, long)]
        category: String,

        /// Application ID or name
        #[arg(short, long)]
        name: Option<String>,
    },

    /// Scan system and adopt existing applications into categories
    Adopt {
        /// Path to candidate directory or binary to adopt
        path: Option<PathBuf>,

        /// Target category (auto-detected if omitted)
        #[arg(short, long)]
        category: Option<String>,

        /// Application name or ID
        #[arg(short, long)]
        name: Option<String>,
    },

    /// Run health checks and repair broken shortcuts or permissions
    Doctor {
        /// Automatically apply recommended fixes
        #[arg(long)]
        fix: bool,
    },

    /// View or regenerate modular environment fragments
    Env {
        #[command(subcommand)]
        action: EnvAction,
    },

    /// Launch the AppDepot desktop GUI
    Gui,
}

#[derive(Subcommand)]
enum EnvAction {
    /// Show current active environment fragments
    Show,
    /// Regenerate all environment fragments and shell loaders
    Apply,
}

const DEFAULT_ROOT: &str = "/opt/Application";

/// Resolves the effective root directory. If /opt/Application is not writable and cannot be created,
/// gracefully falls back to ~/Applications to prevent permission crashes for non-root users.
fn resolve_effective_root(preferred_root: &Path) -> PathBuf {
    if preferred_root.exists() {
        if is_dir_writable(preferred_root) {
            return preferred_root.to_path_buf();
        }
    } else {
        // Try creating or checking parent
        if let Some(parent) = preferred_root.parent() {
            if is_dir_writable(parent) {
                return preferred_root.to_path_buf();
            }
        }
    }

    // Fallback to user home
    if let Ok(home) = std::env::var("HOME") {
        let user_apps = PathBuf::from(home).join("Applications");
        if preferred_root != user_apps && !is_dir_writable(preferred_root) {
            eprintln!(
                "Note: '{}' is not writable by current user. Using user library: '{}'",
                preferred_root.display(),
                user_apps.display()
            );
        }
        return user_apps;
    }

    preferred_root.to_path_buf()
}

fn is_dir_writable(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    let test_file = path.join(".appdepot_write_test");
    if fs::write(&test_file, b"ok").is_ok() {
        let _ = fs::remove_file(test_file);
        true
    } else {
        false
    }
}

fn get_all_installed_app_ids(root: &Path) -> Vec<String> {
    let mut apps = Vec::new();
    if let Ok(cat_dirs) = fs::read_dir(root) {
        for cat in cat_dirs.flatten() {
            if cat.path().is_dir() {
                if let Ok(app_dirs) = fs::read_dir(cat.path()) {
                    for app in app_dirs.flatten() {
                        let name = app.file_name().to_string_lossy().to_string();
                        if !name.starts_with('.') {
                            apps.push(name);
                        }
                    }
                }
            }
        }
    }
    apps
}

fn list_apps(target_root: &Path, filter_category: Option<String>, json_format: bool) -> anyhow::Result<()> {
    if !target_root.exists() {
        if json_format {
            println!("[]");
        } else {
            println!("Install root '{}' does not exist yet. Run 'depot init' to initialize.", target_root.display());
        }
        return Ok(());
    }

    let normalized_filter = if let Some(cat) = filter_category {
        match correct_category_typo(&cat) {
            Ok(c) => Some(c),
            Err(err) => {
                eprintln!("Warning: {}", err);
                Some(cat)
            }
        }
    } else {
        None
    };

    let mut entries = Vec::new();

    if let Ok(cat_dirs) = fs::read_dir(target_root) {
        for cat_res in cat_dirs.flatten() {
            let cat_path = cat_res.path();
            if cat_path.is_dir() {
                let cat_name = cat_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if let Some(ref f) = normalized_filter {
                    if &cat_name != f {
                        continue;
                    }
                }

                if let Ok(app_dirs) = fs::read_dir(&cat_path) {
                    for app_res in app_dirs.flatten() {
                        let app_path = app_res.path();
                        let app_name = app_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        if app_name.starts_with('.') {
                            continue;
                        }

                        let is_symlink = app_path.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false);
                        let (mode, target_display) = if is_symlink {
                            let target = fs::read_link(&app_path).unwrap_or_else(|_| PathBuf::from("dangling"));
                            ("linked", target.to_string_lossy().to_string())
                        } else {
                            ("managed", app_path.to_string_lossy().to_string())
                        };

                        entries.push((cat_name.clone(), app_name, mode, target_display));
                    }
                }
            }
        }
    }

    entries.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    if json_format {
        let json_entries: Vec<serde_json::Value> = entries
            .into_iter()
            .map(|(cat, name, mode, target)| {
                serde_json::json!({
                    "category": cat,
                    "name": name,
                    "mode": mode,
                    "target": target,
                })
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&json_entries)?);
    } else {
        println!("AppDepot Live Applications (Root: {}):", target_root.display());
        println!("------------------------------------------------------------------------------------------");
        println!("{:<14} {:<24} {:<10} {:<38}", "CATEGORY", "NAME", "MODE", "PATH / TARGET");
        println!("------------------------------------------------------------------------------------------");
        if entries.is_empty() {
            println!("No applications found under {}.", target_root.display());
        } else {
            for (cat, name, mode, target) in entries {
                println!("{:<14} {:<24} {:<10} {:<38}", cat, name, mode, target);
            }
        }
        println!("------------------------------------------------------------------------------------------");
    }

    Ok(())
}

fn show_app_info(target_root: &Path, app_id: &str, json_format: bool) -> anyhow::Result<()> {
    let mut found_data: Option<serde_json::Value> = None;

    if let Ok(cat_dirs) = fs::read_dir(target_root) {
        for cat_res in cat_dirs.flatten() {
            let cat_path = cat_res.path();
            if cat_path.is_dir() {
                let cat_name = cat_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let candidate = cat_path.join(app_id);
                if candidate.exists() || candidate.symlink_metadata().is_ok() {
                    let is_symlink = candidate.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false);
                    let target_path = if is_symlink {
                        fs::read_link(&candidate).unwrap_or_else(|_| PathBuf::from("dangling"))
                    } else {
                        candidate.clone()
                    };

                    let home = std::env::var("HOME").unwrap_or_default();
                    let bin_symlink = PathBuf::from("/usr/local/bin").join(app_id);
                    let user_bin_symlink = PathBuf::from(&home).join(".local/bin").join(app_id);
                    let has_bin = bin_symlink.exists() || user_bin_symlink.exists();

                    let desktop_sys = PathBuf::from(format!("/usr/share/applications/appdepot-{}.desktop", app_id));
                    let desktop_usr = PathBuf::from(format!("{}/.local/share/applications/appdepot-{}.desktop", home, app_id));
                    let has_desktop = desktop_sys.exists() || desktop_usr.exists();

                    let sandbox = target_path.join("chrome-sandbox");
                    let has_sandbox = sandbox.exists();
                    let sandbox_mode = if has_sandbox {
                        sandbox.metadata().map(|m| format!("{:o}", m.permissions().mode() & 0o7777)).unwrap_or_default()
                    } else {
                        String::new()
                    };

                    found_data = Some(serde_json::json!({
                        "id": app_id,
                        "category": cat_name,
                        "mode": if is_symlink { "linked" } else { "managed" },
                        "path": candidate.to_string_lossy(),
                        "target": target_path.to_string_lossy(),
                        "bin_symlink_active": has_bin,
                        "desktop_shortcut_registered": has_desktop,
                        "has_sandbox_helper": has_sandbox,
                        "sandbox_mode": sandbox_mode,
                    }));
                    break;
                }
            }
        }
    }

    if let Some(info) = found_data {
        if json_format {
            println!("{}", serde_json::to_string_pretty(&info)?);
        } else {
            println!("Application: {}", app_id);
            println!("----------------------------------------------------------------");
            println!("• Category:        {}", info["category"].as_str().unwrap_or_default());
            println!("• Ownership Mode:  {}", info["mode"].as_str().unwrap_or_default());
            println!("• Stored Path:     {}", info["path"].as_str().unwrap_or_default());
            if info["mode"] == "linked" {
                println!("• Physical Target: {}", info["target"].as_str().unwrap_or_default());
            }
            println!(
                "• Command Symlink: {}",
                if info["bin_symlink_active"].as_bool().unwrap_or(false) {
                    "Active in ~/.local/bin"
                } else {
                    "None"
                }
            );
            println!(
                "• Desktop Entry:   {}",
                if info["desktop_shortcut_registered"].as_bool().unwrap_or(false) {
                    "Registered in ~/.local/share/applications"
                } else {
                    "None"
                }
            );
            if info["has_sandbox_helper"].as_bool().unwrap_or(false) {
                println!("• Sandbox Helper:  Found chrome-sandbox (mode: {})", info["sandbox_mode"].as_str().unwrap_or_default());
            }
            println!("----------------------------------------------------------------");
        }
    } else {
        eprintln!("Application '{}' not found in {}.", app_id, target_root.display());
        // Human typo assistance
        let installed = get_all_installed_app_ids(target_root);
        if let Some(suggestion) = suggest_closest(app_id, &installed) {
            eprintln!("Did you mean '{}'?", suggestion);
        }
    }

    Ok(())
}

fn execute_install(
    root: &Path,
    source_input: &str,
    category_input: Option<String>,
    name_input: Option<String>,
    dry_run: bool,
) -> anyhow::Result<()> {
    // 1. Resolve source (handle URL downloads or local files with typo tolerance)
    let source_kind = detect_source_kind(source_input);
    let mut temp_download_file: Option<PathBuf> = None;

    let local_source = if source_kind == SourceKind::Url {
        println!("Downloading package from URL: {}", source_input);
        let temp_dir = std::env::temp_dir().join("appdepot_downloads");
        fs::create_dir_all(&temp_dir)?;
        let file_stem = Path::new(source_input).file_name().unwrap_or_default().to_string_lossy();
        let download_dest = temp_dir.join(if file_stem.is_empty() { "download.tar.gz" } else { &file_stem });
        download_from_url(source_input, &download_dest)?;
        temp_download_file = Some(download_dest.clone());
        download_dest
    } else {
        let input_path = PathBuf::from(source_input);
        if !input_path.exists() {
            // Typo check on source file path
            if let Some(fuzzy_path) = fuzzy_find_source_file(&input_path) {
                println!("Notice: File '{}' not found. Using matched file: '{}'", source_input, fuzzy_path.display());
                fuzzy_path
            } else {
                anyhow::bail!("Source file or package '{}' does not exist.", source_input);
            }
        } else {
            input_path
        }
    };

    // 2. Resolve App Name
    let app_name = name_input.unwrap_or_else(|| {
        let stem = local_source.file_name().unwrap_or_default().to_string_lossy().to_string();
        let clean = stem
            .trim_end_matches(".tar.gz")
            .trim_end_matches(".tar.xz")
            .trim_end_matches(".tar.bz2")
            .trim_end_matches(".tgz")
            .trim_end_matches(".zip")
            .trim_end_matches(".deb")
            .trim_end_matches(".AppImage")
            .trim_end_matches("-linux-x64")
            .trim_end_matches("-linux-x86_64")
            .trim_end_matches("-x86_64")
            .trim_end_matches("-amd64");
        clean.to_lowercase().replace(' ', "-")
    });

    // 3. Resolve & validate Category (with typo correction)
    let category = match category_input {
        Some(cat) => match correct_category_typo(&cat) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Warning: {}. Falling back to heuristic category.", e);
                suggest_category(&app_name).to_string()
            }
        },
        None => suggest_category(&app_name).to_string(),
    };

    let target_dir = root.join(&category).join(&app_name);

    if dry_run {
        println!("\n[DRY RUN] Planned Actions for Installation:");
        println!("------------------------------------------------------------");
        println!("• Source:            {}", local_source.display());
        println!("• Application ID:    {}", app_name);
        println!("• Target Category:   {}", category);
        println!("• Install Directory: {}", target_dir.display());
        println!("• Desktop Shortcut:  ~/.local/share/applications/appdepot-{}.desktop", app_name);
        println!("• Terminal Symlink:  ~/.local/bin/{}", app_name);
        println!("• Environment:       ~/.config/appdepot/env.d/{}.sh", app_name);
        println!("------------------------------------------------------------");
        return Ok(());
    }

    println!("Installing '{}' into category '{}'...", app_name, category);

    // 4. Safe staged extraction
    if target_dir.exists() {
        println!("Notice: Overwriting existing installation at {}", target_dir.display());
        let _ = fs::remove_dir_all(&target_dir);
    }
    fs::create_dir_all(&target_dir)?;

    if let Err(e) = unpack_source(&local_source, &target_dir, &app_name) {
        // Rollback on failure to prevent zombie folders
        let _ = fs::remove_dir_all(&target_dir);
        anyhow::bail!("Extraction failed: {}. Cleaned up target directory.", e);
    }

    // 5. Discover executables using heuristics
    let execs = Heuristics::discover_executables(&target_dir, &app_name);
    let main_exec = if let Some(best) = execs.first() {
        // Ensure executable permissions
        if let Ok(meta) = best.path.metadata() {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o755);
            let _ = fs::set_permissions(&best.path, perms);
        }
        best.path.clone()
    } else {
        // Fallback: look for any file or wrapper
        target_dir.join(&app_name)
    };

    // 6. Discover icon
    let icons = Heuristics::discover_icons(&target_dir, &app_name);
    let best_icon = icons.first().map(|i| i.path.clone());

    // 7. Check for Chromium setuid sandbox
    if let Some(sandbox) = Heuristics::detect_chromium_sandbox(&target_dir) {
        println!("• Detected Chromium sandbox helper at: {}", sandbox.display());
        println!("  (Run 'depot doctor --fix' if setuid permissions are needed)");
    }

    // 8. Generate and install desktop shortcut
    let display_title = app_name
        .split('-')
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ");

    let shortcut = DesktopShortcut {
        id: app_name.clone(),
        name: display_title,
        generic_name: None,
        comment: Some(format!("Installed via AppDepot in {}", category)),
        exec_path: main_exec.clone(),
        icon_path: best_icon,
        categories: format!("Utility;{};", category.to_uppercase()),
        terminal: false,
        startup_wm_class: Some(app_name.clone()),
    };

    let desktop_file = shortcut.install_desktop_file()?;
    let bin_link = shortcut.install_bin_symlink()?;

    // 9. Generate environment fragment
    let _ = write_app_fragment(&app_name, &target_dir);
    let _ = write_user_env_loader();

    // Clean temp download if needed
    if let Some(ref tmp) = temp_download_file {
        let _ = fs::remove_file(tmp);
    }

    println!("\n✓ Successfully installed '{}'!", app_name);
    println!("------------------------------------------------------------");
    println!("• Directory: {}", target_dir.display());
    println!("• Main Exec: {}", main_exec.display());
    println!("• Shortcut:  {}", desktop_file.display());
    println!("• PATH Link: {} (Run '{}' in any terminal)", bin_link.display(), app_name);
    println!("------------------------------------------------------------");

    Ok(())
}

fn execute_remove(root: &Path, app_id: &str, skip_confirm: bool) -> anyhow::Result<()> {
    let mut found_cat: Option<String> = None;
    let mut found_path: Option<PathBuf> = None;
    let mut is_link = false;

    if let Ok(cat_dirs) = fs::read_dir(root) {
        for cat_res in cat_dirs.flatten() {
            let cat_path = cat_res.path();
            if cat_path.is_dir() {
                let candidate = cat_path.join(app_id);
                if candidate.exists() || candidate.symlink_metadata().is_ok() {
                    found_cat = Some(cat_path.file_name().unwrap_or_default().to_string_lossy().to_string());
                    is_link = candidate.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false);
                    found_path = Some(candidate);
                    break;
                }
            }
        }
    }

    let target = match found_path {
        Some(p) => p,
        None => {
            eprintln!("Error: Application '{}' not found in {}.", app_id, root.display());
            let installed = get_all_installed_app_ids(root);
            if let Some(cand) = suggest_closest(app_id, &installed) {
                eprintln!("Did you mean '{}'?", cand);
            }
            anyhow::bail!("Application not found.");
        }
    };

    if !skip_confirm {
        println!("Application '{}' found in category '{}'.", app_id, found_cat.as_deref().unwrap_or(""));
        println!("This will delete: ");
        println!("  • {}", target.display());
        println!("  • Desktop entries and binary symlinks (~/.local/bin/{})", app_id);
        println!("  • Environment fragment in ~/.config/appdepot/env.d/{}.sh", app_id);
    }

    // 1. Remove files
    if is_link {
        fs::remove_file(&target)?;
    } else {
        fs::remove_dir_all(&target)?;
    }

    // 2. Remove desktop entries and symlinks
    let removed_artifacts = remove_shortcuts(app_id);

    // 3. Remove environment fragment
    let _ = appdepot_core::env::remove_app_fragment(app_id);

    println!("\n✓ Cleanly removed '{}'. Purged {} ledger artifacts.", app_id, removed_artifacts.len() + 1);
    for art in removed_artifacts {
        println!("  • Removed: {}", art.display());
    }

    Ok(())
}

fn execute_adopt(root: &Path, source_path: &Path, category_arg: Option<String>, name_arg: Option<String>) -> anyhow::Result<()> {
    if !source_path.exists() {
        anyhow::bail!("Path to adopt '{}' does not exist.", source_path.display());
    }

    let app_name = name_arg.unwrap_or_else(|| {
        source_path.file_name().unwrap_or_default().to_string_lossy().to_string()
    });

    let category = match category_arg {
        Some(c) => correct_category_typo(&c).unwrap_or_else(|_| suggest_category(&app_name).to_string()),
        None => suggest_category(&app_name).to_string(),
    };

    let cat_dir = root.join(&category);
    fs::create_dir_all(&cat_dir)?;

    let target_link = cat_dir.join(&app_name);
    if target_link.exists() || target_link.symlink_metadata().is_ok() {
        let _ = fs::remove_file(&target_link);
    }
    std::os::unix::fs::symlink(source_path, &target_link)?;

    // Discover executable and create desktop entry & symlink
    let execs = Heuristics::discover_executables(source_path, &app_name);
    let main_exec = if let Some(e) = execs.first() {
        e.path.clone()
    } else if source_path.is_file() {
        source_path.to_path_buf()
    } else {
        target_link.clone()
    };

    let icons = Heuristics::discover_icons(source_path, &app_name);
    let best_icon = icons.first().map(|i| i.path.clone());

    let shortcut = DesktopShortcut {
        id: app_name.clone(),
        name: app_name.clone(),
        generic_name: None,
        comment: Some(format!("Adopted via AppDepot into {}", category)),
        exec_path: main_exec.clone(),
        icon_path: best_icon,
        categories: format!("Utility;{};", category.to_uppercase()),
        terminal: false,
        startup_wm_class: Some(app_name.clone()),
    };

    let _ = shortcut.install_desktop_file();
    let _ = shortcut.install_bin_symlink();

    println!("✓ Successfully adopted '{}' into category '{}'!", app_name, category);
    println!("• Linked:   {} -> {}", target_link.display(), source_path.display());
    println!("• Exec:     {}", main_exec.display());
    println!("• Shortcut: ~/.local/share/applications/appdepot-{}.desktop", app_name);

    Ok(())
}

fn run_doctor(target_root: &Path, fix: bool) -> anyhow::Result<()> {
    println!("Running Live AppDepot Doctor Diagnostics on Host Machine...");
    println!("------------------------------------------------------------------------");

    let findings = Doctor::run_diagnostics(target_root);

    if findings.is_empty() {
        println!("✓ All health checks passed! System is 100% healthy.");
    } else {
        for f in &findings {
            let badge = match f.severity {
                appdepot_types::DoctorSeverity::Error => "[✗]",
                appdepot_types::DoctorSeverity::Warning => "[!]",
                appdepot_types::DoctorSeverity::Info => "[i]",
            };
            println!("  {} {}: {}", badge, f.code, f.message);
            if let Some(ref h) = f.hint {
                println!("      Hint: {}", h);
            }
        }
    }

    if fix {
        println!("\nApplying automated repairs...");
        let repairs = Doctor::apply_fixes(target_root);
        if repairs.is_empty() {
            println!("No automatic fixes available.");
        } else {
            for r in repairs {
                println!("  ✓ {}", r);
            }
            println!("Repairs completed. Run 'depot doctor' to verify.");
        }
    } else if !findings.is_empty() {
        println!("\nTip: Run 'depot doctor --fix' to automatically resolve fixable issues.");
    }

    println!("------------------------------------------------------------------------");
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let default_root = PathBuf::from(DEFAULT_ROOT);
    let effective_root = resolve_effective_root(&default_root);

    match cli.command {
        Commands::Init { root, group } => {
            println!("Initializing AppDepot install tree at: {}", root.display());
            println!("Target developer group: {}", group);
            let target_root = resolve_effective_root(&root);
            fs::create_dir_all(&target_root)?;

            // Apply 2775 setgid
            if let Ok(meta) = target_root.metadata() {
                let mut perms = meta.permissions();
                perms.set_mode(0o2775);
                let _ = fs::set_permissions(&target_root, perms);
            }

            println!("Creating standard categories: {}", CANONICAL_CATEGORIES.join(", "));
            for cat in CANONICAL_CATEGORIES {
                let cat_dir = target_root.join(cat);
                let _ = fs::create_dir_all(&cat_dir);
                if let Ok(meta) = cat_dir.metadata() {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o2775);
                    let _ = fs::set_permissions(&cat_dir, perms);
                }
            }

            // Write user environment loader
            let env_loader = write_user_env_loader()?;
            println!("✓ Init complete. Mode 2775 (setgid) and categories ready.");
            println!("✓ Shell environment loader configured at {}", env_loader.display());
        }

        Commands::List { category } => {
            list_apps(&effective_root, category, cli.json)?;
        }

        Commands::Info { app } => {
            show_app_info(&effective_root, &app, cli.json)?;
        }

        Commands::Install {
            source,
            category,
            name,
            dry_run,
        } => {
            execute_install(&effective_root, &source, category, name, dry_run)?;
        }

        Commands::Remove { app, yes } => {
            execute_remove(&effective_root, &app, yes)?;
        }

        Commands::Link { path, category, name } => {
            let cat = correct_category_typo(&category).unwrap_or_else(|_| category);
            let link_name = name.unwrap_or_else(|| path.file_name().unwrap_or_default().to_string_lossy().to_string());
            let target = effective_root.join(&cat).join(&link_name);
            fs::create_dir_all(effective_root.join(&cat))?;
            if target.exists() || target.symlink_metadata().is_ok() {
                let _ = fs::remove_file(&target);
            }
            std::os::unix::fs::symlink(&path, &target)?;
            println!("✓ Linked external package '{}' into category '{}' as '{}'", path.display(), cat, link_name);
        }

        Commands::Adopt { path, category, name } => {
            if let Some(p) = path {
                execute_adopt(&effective_root, &p, category, name)?;
            } else {
                println!("Scanning system for unorganized applications in /opt...");
                if let Ok(entries) = fs::read_dir("/opt") {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name != "Application" && !name.starts_with('.') {
                            println!("• Found candidate: /opt/{} (Run 'depot adopt /opt/{}' to adopt)", name, name);
                        }
                    }
                }
            }
        }

        Commands::Doctor { fix } => {
            run_doctor(&effective_root, fix)?;
        }

        Commands::Env { action } => match action {
            EnvAction::Show => {
                let home = std::env::var("HOME").unwrap_or_default();
                println!("AppDepot Active Environment:");
                println!("  • User Loader:     {}/.config/appdepot/env.sh", home);
                println!("  • User Fragments:  {}/.config/appdepot/env.d/*.sh", home);
                println!("  • System Loader:   /etc/profile.d/appdepot.sh");
            }
            EnvAction::Apply => {
                let path = write_user_env_loader()?;
                println!("✓ Regenerated AppDepot environment loader at: {}", path.display());
            }
        },

        Commands::Gui => {
            println!("Launching AppDepot Desktop GUI...");
            let _ = std::process::Command::new("./start.sh").status();
        }
    }

    Ok(())
}
