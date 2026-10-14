# ADR-001: Language Choice (Rust for Core, CLI, and Helper)

- **Status:** Accepted
- **Deciders:** Besifkad
- **Date:** 2026-10-14

## Context and Problem Statement
AppDepot is fundamentally a systems engineering tool on Linux. It needs to:
1. Handle untrusted vendor archives safely (zip-slip, symlink escapes, decompression bombs).
2. Interface directly with POSIX file system APIs, permissions, setgid bits, and D-Bus (`zbus`).
3. Manage privileged operations via a Polkit helper daemon.
4. Host a real pseudo-terminal (PTY) session.
5. Provide a single-binary CLI (`depot`) that starts instantly with low memory overhead.
6. Provide strong portfolio differentiation demonstrating deep systems programming competence.

## Decision Outcome
Chosen option: **Rust**, because:
- **Memory Safety without Garbage Collection:** Elimination of memory safety vulnerabilities in archive extraction and privileged helper code.
- **Single Core:** The core domain logic, CLI, privileged helper, and desktop backend all reside in a single Rust workspace (`appdepot-core`), guaranteeing that the CLI and GUI never diverge in behavior.
- **Rich Systems Ecosystem:** First-class crates for POSIX filesystems, ELF inspection (`goblin`/`object`), D-Bus (`zbus`), PTY (`portable-pty`), CLI parsing (`clap`), and embedded database (`rusqlite`).
- **Portfolio Value:** A Rust systems project with privilege separation and transactional safety provides maximum portfolio impact.

## Fallback Tripwire
If Rust development blocks progress past Phase 3, the fallback plan (Plan B) is to wrap the concepts using Flutter desktop and Dart system processes, keeping the architecture intact.
