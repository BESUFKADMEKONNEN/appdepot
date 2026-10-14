//! PTY session supervisor and streaming pipeline for the embedded terminal.
//!
//! Bridges xterm.js in the desktop GUI to the user's host shell ($SHELL).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct TerminalSession {
    pub id: String,
    pub is_active: Arc<AtomicBool>,
}

impl TerminalSession {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            is_active: Arc::new(AtomicBool::new(true)),
        }
    }

    pub fn close(&self) {
        self.is_active.store(false, Ordering::SeqCst);
    }
}
