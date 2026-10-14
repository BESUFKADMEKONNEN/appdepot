# AppDepot 📦

> **Windows' "Program Files" experience, done the Linux way:** group, install, organize, and launch every application from one window, with a real terminal sitting beside it.

[![CI](https://github.com/besifkad/appdepot/actions/workflows/ci.yml/badge.svg)](https://github.com/besifkad/appdepot/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Pre-Alpha](https://img.shields.io/badge/Status-Phase_0_Foundations-orange.svg)](#roadmap)

---

## 💡 The Problem

Linux provides world-class package managers (`apt`, `dnf`, `pacman`), yet software arrives from everywhere: tarballs, zips, `.deb` files, Flatpaks, Snaps, AppImages, and git repositories. Each puts files in a different directory, configures PATH inconsistently, creates shortcuts haphazardly (or not at all), and leaves orphaned files behind upon uninstallation.

**AppDepot** is a desktop application and command-line tool that brings order to this chaos without replacing your package manager:
- 📁 **Categorized Library:** Windows-like organization (`ide`, `sdk`, `browsers`, `databases`, `runtimes`, `tools`) under `/opt/Application`.
- ⚡ **One-Click Safe Install:** Tarballs, zips, AppImages, and `.deb` packages extracted safely with anti-traversal validation, automatic executable scoring, and crisp icon extraction.
- 💻 **Side-by-Side Live Terminal:** A real PTY docked directly beside the GUI displaying the exact POSIX commands executed on your behalf.
- 🔗 **Non-Destructive Adoption:** Point at existing `.deb`, Flatpak, or Snap applications without moving files or breaking updates.
- 📋 **Shareable Manifests:** Describe your workstation in a single declarative `workstation.toml` file and recreate it on clean hardware in seconds.
- 🛡️ **Zero GUI Root:** Unprivileged GUI communicating with a minimal, typed Polkit helper daemon.

---

## 🏛️ Architecture Overview

AppDepot is constructed as a modular Rust workspace with a decoupled presentation layer:

```
┌─────────────────────────────────────────────────────────────┐
│ PRESENTATION LAYER                                          │
│   GUI: Tauri v2 + React + TypeScript + xterm.js             │
│   CLI: `depot` (clap v4)                                    │
├─────────────────────────────────────────────────────────────┤
│ APPLICATION LAYER (`appdepot-core`)                         │
│   Pipeline · Heuristics · Ledger · Doctor · Manifest Engine │
├─────────────────────────────────────────────────────────────┤
│ INFRASTRUCTURE LAYER                                        │
│   SQLite Registry (`rusqlite`) · Safe Extractor · PTY       │
├─────────────────────────────────────────────────────────────┤
│ PRIVILEGED LAYER                                            │
│   `appdepot-helper` (Polkit authorized, typed JSON on stdin)│
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Documentation Suite

The complete project specification is partitioned into modular guides in [`docs/`](docs/):

1. [**01. Vision & Core Concepts**](docs/01-vision-and-concepts.md): Personas, pain points, ownership modes, and terminology.
2. [**02. Architecture & Security**](docs/02-architecture-and-security.md): Filesystem layout (`/opt/Application`), Polkit helper, SQLite schema.
3. [**03. Core Pipeline & Engine**](docs/03-core-pipeline-and-heuristics.md): 9-stage pipeline, scoring heuristics, `.desktop` generators.
4. [**04. Interfaces & Design System**](docs/04-interfaces-and-design-system.md): CLI reference, GUI layout, PTY terminal, Teach Mode.
5. [**05. Quality, Packaging & Portfolio**](docs/05-quality-packaging-and-portfolio.md): Test fixtures, Doctor catalogue, packaging, portfolio demo script.
6. [**06. Implementation Roadmap**](docs/06-implementation-roadmap.md): Milestone progress from Phase 0 to Phase 6.

---

## 🛠️ Repository Layout

```
├── crates/
│   ├── appdepot-core/      # Core engine, heuristics, registry, doctor
│   ├── appdepot-cli/       # `depot` command-line binary
│   ├── appdepot-types/     # Shared IPC data structures
│   ├── appdepot-helper/    # Privileged Polkit root helper
│   └── appdepot-pty/       # PTY session supervisor
├── apps/
│   └── gui/                # Tauri v2 + React desktop application
├── docs/                   # Architectural guides & ADRs
└── fixtures/               # Test archives (Electron, SDK, decompression bombs)
```

---

## 📜 Origin Story

AppDepot evolved from a 25-line Bash script created during a Kubuntu workstation setup. Read the full origin story and examine the prototype script in [`docs/history/add-app.sh`](docs/history/add-app.sh).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
