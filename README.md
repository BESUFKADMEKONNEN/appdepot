# AppDepot 📦

> **Windows' "Program Files" & macOS `/Applications` experience, done the Linux way:**
> Group, install, organize, and launch every Linux application from one unified tree with a docked live terminal and zero hardcoded data.

[![CI](https://github.com/besu/appdepot/actions/workflows/ci.yml/badge.svg)](https://github.com/besu/appdepot/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.78%2B-red.svg)](https://www.rust-lang.org/)
[![GUI](https://img.shields.io/badge/GUI-Tauri_v2_%7C_React_%2B_TS-61dafb.svg)](apps/gui)
[![Live Inotify](https://img.shields.io/badge/Kernel-Inotify_SSE-brightgreen.svg)](#features)

---

## 💡 The Problem

On Linux, software arrives from fragmented sources: tarballs, zip archives, `.deb` packages, Flatpaks, Snaps, AppImages, and git repositories. Each tool dumps files in different directories (`/opt`, `~/.local`, `/usr/local`, `/var/lib/flatpak`), creates shortcuts inconsistently, pollutes `$PATH`, and leaves orphaned files behind.

**AppDepot** brings desktop parity to Linux (similar to Windows `C:\Program Files` or macOS `/Applications`) without replacing your distribution package manager:

* 📁 **Categorized Library:** Structured system hierarchy (`ide/`, `sdk/`, `browsers/`, `databases/`, `runtimes/`, `network/`, `office/`, `tools/`) under `/opt/Application`.
* ⚡ **Live Inotify Watcher:** Immediate real-time sync via Linux kernel inotify and Server-Sent Events. Dropping a folder or archive into `/opt/Application` immediately updates the GUI with zero manual refresh.
* 🔍 **Smart Heuristic Pipeline:** Inspects archives, scores candidate executables (+95 ELF binary match), detects Chromium setuid sandboxes (`chrome-sandbox`), and extracts application icons.
* 💻 **Docked Live Shell:** An integrated terminal running alongside the GUI that executes real system commands, displaying the exact actions performed.
* 🛡️ **Zero GUI Root:** Unprivileged UI communicating with a minimal, typed Polkit helper daemon.
* 📋 **Complete Artifacts Ledger:** Tracks every symlink in `~/.local/bin`, XDG shortcut in `~/.local/share/applications`, and directory for 100% clean, one-click uninstallation.

---

## 🚀 Quick Start

### 1. Prerequisites
* **Linux:** Ubuntu / Debian / Fedora / Arch (tested on Kubuntu 24.04 LTS)
* **Rust:** 1.78+ (`rustup default stable`)
* **Node.js:** 18+ & npm

### 2. Run the Native Rust CLI
```bash
# Clone the repository
git clone https://github.com/besu/appdepot.git
cd appdepot

# Build native Rust workspace
cargo build --workspace

# Inspect live applications on your machine
./bin/depot list

# Inspect detailed ledger artifacts for an app
./bin/depot info antigravity

# Run POSIX system doctor diagnostics
./bin/depot doctor
```

### 3. Launch the Desktop GUI
```bash
# Run the interactive desktop launcher
./bin/depot gui
# (or execute ./start.sh directly)
```
Open **http://127.0.0.1:5173/** in your browser or run as a native window via Tauri.

---

## 🎯 Three Ownership Modes

AppDepot manages software without breaking system packages:

| Mode | Target Location | Description | Use Cases |
| :--- | :--- | :--- | :--- |
| **Managed** | `/opt/Application/<category>/<app>/` | AppDepot extracts, manages files, sets permissions, and handles lifecycle. | Tarballs, zips, AppImages, custom SDKs (Flutter, Go, Zig). |
| **Linked** | Symlink to `/opt/<vendor>/` or `/usr/` | Physical files stay untouched; a symlink is registered in the categorized tree. | Vendor packages like Google Chrome, OnlyOffice, PostgreSQL. |
| **Adopted** | System registry entry | Records external packages, Flatpaks, or Snaps in the artifacts ledger. | System utilities and background systemd services (MySQL). |

---

## 🏛️ Architecture Overview

AppDepot is architected as a modular Rust workspace with a decoupled presentation layer:

```
┌────────────────────────────────────────────────────────────────────────┐
│ PRESENTATION LAYER                                                     │
│   GUI: Tauri v2 + React + TypeScript + xterm.js (apps/gui)             │
│   CLI: `depot` binary via clap v4 (crates/appdepot-cli)                │
├────────────────────────────────────────────────────────────────────────┤
│ APPLICATION ENGINE (`crates/appdepot-core`)                            │
│   Safe Extractor · Heuristics · Artifacts Ledger · POSIX Doctor        │
├────────────────────────────────────────────────────────────────────────┤
│ INFRASTRUCTURE LAYER                                                   │
│   SQLite Registry (`rusqlite`) · Inotify Watcher · PTY Supervisor      │
├────────────────────────────────────────────────────────────────────────┤
│ PRIVILEGED HELPER (`crates/appdepot-helper`)                           │
│   Polkit-authorized daemon for root actions (chmod 4755 chrome-sandbox)│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Repository Structure

```
├── Cargo.toml                  # Root Rust workspace definition
├── bin/
│   └── depot                   # Main CLI launcher (delegates to native Rust binary)
├── crates/
│   ├── appdepot-types/         # Shared IPC data structures & serializable models
│   ├── appdepot-core/          # Core engine, heuristics, archive safety, doctor
│   ├── appdepot-cli/           # Native CLI binary (`depot list|info|install|doctor`)
│   ├── appdepot-helper/        # Privileged Polkit root helper
│   └── appdepot-pty/           # PTY process supervisor
├── apps/
│   └── gui/                    # React + TypeScript + Vite desktop application
│       ├── server/             # Live Linux inotify scanner & system API middleware
│       └── src/                # Library view, install wizard, docked terminal
├── docs/                       # Complete 6-part architecture documentation suite
│   ├── 01-vision-and-concepts.md
│   ├── 02-architecture-and-security.md
│   ├── 03-core-pipeline-and-heuristics.md
│   ├── 04-interfaces-and-design-system.md
│   ├── 05-quality-packaging-and-portfolio.md
│   └── 06-implementation-roadmap.md
├── fixtures/                   # Synthetic test archives (Electron & SDK fixtures)
└── start.sh                    # One-command desktop GUI launcher
```

---

## 🩺 System Doctor Health Checks

AppDepot comes with built-in POSIX diagnostic audits (`depot doctor`):

* **D-001 (Root Permissions):** Verifies `/opt/Application` exists with `2775` permissions and `devtools` group ownership.
* **D-003 (Command Symlinks):** Scans `/usr/local/bin` and `~/.local/bin` for broken or dangling symlinks.
* **D-006 (Setuid Sandbox Audit):** Verifies Chromium-based applications (`chrome-sandbox`) have `4755 root` setuid flags for proper process isolation.
* **D-007 (Environment Fragments):** Verifies modular `/etc/profile.d/` environment loaders.

---

## 📜 Origin Story

AppDepot originated from a 25-line Bash prototype script (`add-app.sh`) written to organize software on Kubuntu workstations. Read the full architectural evolution in [`docs/history/add-app.sh`](docs/history/add-app.sh).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
