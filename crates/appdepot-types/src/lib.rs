//! Shared types, enums, and data models for AppDepot.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// The three fundamental ownership modes in AppDepot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OwnershipMode {
    /// AppDepot manages the files, folder lifecycle, and removal.
    Managed,
    /// Files are owned by another package manager (e.g. .deb), AppDepot links to them.
    Linked,
    /// Applications registered virtually (e.g. Flatpak/Snap/system shortcuts).
    Adopted,
}

impl std::fmt::Display for OwnershipMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Managed => write!(f, "managed"),
            Self::Linked => write!(f, "linked"),
            Self::Adopted => write!(f, "adopted"),
        }
    }
}

/// Verification level of an application download or archive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrustLevel {
    /// Matched against a known publisher checksum or signature.
    Verified,
    /// Checksum computed and recorded, but unverified against publisher.
    HashRecorded,
    /// No checksum provided.
    Unverified,
}

/// Functional category in the library (e.g. ide, sdk, browsers).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub sort_order: i32,
}

/// An application entry recorded in the registry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub category_id: Option<String>,
    pub mode: OwnershipMode,
    pub version: Option<String>,
    pub install_path: Option<PathBuf>,
    pub exec_path: Option<PathBuf>,
    pub icon_path: Option<PathBuf>,
    pub source_type: String,
    pub source_ref: Option<String>,
    pub checksum: Option<String>,
    pub trust_level: TrustLevel,
    pub pinned: bool,
    pub installed_at: String,
    pub updated_at: Option<String>,
}

/// Types of artifacts tracked by the uninstallation ledger.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactKind {
    Dir,
    Symlink,
    DesktopEntry,
    EnvFragment,
    Wrapper,
    ServiceOverride,
    Mime,
    SandboxFix,
}

/// A specific filesystem artifact created during installation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Artifact {
    pub id: Option<i64>,
    pub app_id: String,
    pub kind: ArtifactKind,
    pub path: PathBuf,
    pub content_hash: Option<String>,
    pub created_at: String,
}

/// Individual actions emitted as part of a transactional Plan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(clippy::large_enum_variant)]
pub enum Action {
    CreateDir {
        path: PathBuf,
        mode: u32,
    },
    ExtractTo {
        archive: PathBuf,
        dest: PathBuf,
        strip_components: usize,
    },
    Symlink {
        target: PathBuf,
        link: PathBuf,
    },
    WriteFile {
        path: PathBuf,
        contents: Vec<u8>,
        mode: u32,
    },
    SetSandbox {
        path: PathBuf,
    },
    WriteEnvFragment {
        app_id: String,
        body: String,
    },
    RegisterEntry {
        entry: AppEntry,
    },
}

/// A declarative execution plan produced before applying changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Plan {
    pub actions: Vec<Action>,
    pub needs_privilege: bool,
}

/// Doctor health check finding severity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DoctorSeverity {
    Info,
    Warning,
    Error,
}

/// Diagnostic report finding from the doctor module.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DoctorFinding {
    pub code: String,
    pub severity: DoctorSeverity,
    pub message: String,
    pub fixable: bool,
    pub hint: Option<String>,
}
