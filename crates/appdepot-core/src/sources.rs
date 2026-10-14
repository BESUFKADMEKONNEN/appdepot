//! Source adapters for archives, packages, AppImages, and git repositories.
//!
//! Provides the abstraction layer that allows AppDepot to treat any software format
//! (tarball, zip, .deb, AppImage, apt package) like an advanced, unified system package.

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

/// Supported source package types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    /// Compressed tarball (.tar.gz, .tar.xz, .tar.bz2, .tar.zst)
    Tarball,
    /// Zip archive (.zip)
    Zip,
    /// Debian package (.deb) installed via apt and linked into category
    Deb,
    /// Standalone AppImage (.AppImage)
    AppImage,
    /// Git repository clone (e.g. Flutter SDK)
    Git,
    /// Distribution APT package managed via linked/adopted mode
    Apt,
}

/// Specifications for an application source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceSpec {
    pub kind: SourceKind,
    pub location: String, // local path or remote URL
    pub checksum: Option<String>,
    pub git_ref: Option<String>,
}

/// Normalized package metadata discovered from source analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageMetadata {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub category: String,
    pub exec_rel_path: PathBuf,
    pub icon_rel_path: Option<PathBuf>,
    pub is_chromium_sandbox_needed: bool,
    pub apt_dependencies: Vec<String>,
}

/// Interface implemented by all source adapters.
pub trait SourceAdapter {
    fn can_handle(&self, path_or_url: &str) -> bool;
    fn source_kind(&self) -> SourceKind;
    fn stage_unpack(&self, source: &Path, staging_dir: &Path) -> Result<PathBuf, crate::Error>;
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
