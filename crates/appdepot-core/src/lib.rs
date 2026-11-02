//! AppDepot Core Engine
//!
//! Provides the core business logic, filesystem abstractions, pipeline execution,
//! detection heuristics, and health diagnostics.

pub mod analyze;
pub mod doctor;
pub mod env;
pub mod fsx;
pub mod plan;
pub mod shortcut;
pub mod sources;
pub mod typo;

pub use appdepot_types as types;

/// Standard AppDepot result type.
pub type Result<T> = std::result::Result<T, Error>;

/// Primary error type for core operations.
#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Archive error: {0}")]
    Archive(String),

    #[error("Zip-slip security violation: Path escapes extraction boundary: {0}")]
    ZipSlip(String),

    #[error("Icon not found or invalid: {0}")]
    InvalidIcon(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Heuristic failure: {0}")]
    Heuristic(String),

    #[error("{0}")]
    Custom(String),
}
