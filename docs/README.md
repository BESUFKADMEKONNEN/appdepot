# AppDepot Documentation Suite & Implementation Map

Welcome to the modular documentation and implementation guide for **AppDepot** (A Linux Application Manager for Developers).

The master project specification (`AppDepot-Project-Spec.md`) has been split into 6 focused modular documents, architectural decision records (ADRs), and historical reference materials. This structure allows the project to be built incrementally, one milestone and subsystem at a time.

---

## 📚 Document Index

| # | Document | Focus & Scope | Master Spec Sections |
|---|---|---|---|
| **01** | [**Vision & Concepts**](file:///home/besu/projects/appdepotforlinux/docs/01-vision-and-concepts.md) | Vision, Problem Statement, Personas, Goals, Vocabulary, 3 Ownership Modes (Managed/Linked/Adopted), Windows-to-Linux Translator | §§ 1–6 |
| **02** | [**Architecture & Security**](file:///home/besu/projects/appdepotforlinux/docs/02-architecture-and-security.md) | Filesystem Layout (`/opt/Application`), Privilege Separation (`appdepot-helper` + Polkit), System Architecture (Plan & Apply), SQLite Registry Schema, Tech Stack | §§ 8, 19, 20, 21, 22, 23 |
| **03** | [**Core Pipeline & Engine**](file:///home/besu/projects/appdepotforlinux/docs/03-core-pipeline-and-heuristics.md) | Install State Machine, Safe Archive Extraction (Zip-slip guard), Heuristic Detection (Executables & Icons), Shortcuts (`.desktop`), Adoption Scanner, Stacks, TOML Manifests | §§ 9, 10, 11, 12, 13, 14 |
| **04** | [**Interfaces & Design System**](file:///home/besu/projects/appdepotforlinux/docs/04-interfaces-and-design-system.md) | CLI Design (`depot`), GUI Views (Wireframes & Wizard), Embedded Terminal (PTY + xterm.js streaming), Teach Mode, Design Tokens & Components | §§ 15, 16, 17, 18 |
| **05** | [**Quality, Packaging & Portfolio**](file:///home/besu/projects/appdepotforlinux/docs/05-quality-packaging-and-portfolio.md) | Testing Pyramid, Fixture Library, Doctor Catalogue (D-001..D-012), Packaging (`.deb`, AppImage, `.rpm`), Portfolio Pitch, 90s Demo Script, Risk Analysis | §§ 24, 25, 27, 28, 29, 30, 31 |
| **06** | [**Implementation Roadmap**](file:///home/besu/projects/appdepotforlinux/docs/06-implementation-roadmap.md) | Phased Execution Plan (Phase 0 to Phase 6), Definition of Done, Incremental Tasks & Milestone Acceptance Criteria | § 26, Appendix F |

---

## 🏛️ Architecture Decision Records (ADR)
Located in [`docs/adr/`](file:///home/besu/projects/appdepotforlinux/docs/adr/):
- [**ADR-001: Language Choice (Rust for Core & Helper)**](file:///home/besu/projects/appdepotforlinux/docs/adr/ADR-001-language-choice-rust.md)
- [**ADR-002: GUI Toolkit (Tauri v2 + React + TypeScript)**](file:///home/besu/projects/appdepotforlinux/docs/adr/ADR-002-gui-toolkit-tauri-react.md)
- [**ADR-003: Privilege Model (Polkit + Typed IPC Helper)**](file:///home/besu/projects/appdepotforlinux/docs/adr/ADR-003-privilege-model-polkit-helper.md)

---

## 📜 Origin Story & History
- [**v0 Prototype Script (`docs/history/add-app.sh`)**](file:///home/besu/projects/appdepotforlinux/docs/history/add-app.sh): The initial 25-line Bash script that surfaced the real pain points and inspired AppDepot.

---

## 🚀 How to Build One Module at a Time

To prevent burnout and scope creep, follow the phase sequence in [**06-implementation-roadmap.md**](file:///home/besu/projects/appdepotforlinux/docs/06-implementation-roadmap.md):

1. **Phase 0: Foundations & Scaffolding**
   - Workspace setup (`Cargo.toml` with crates: `appdepot-core`, `appdepot-cli`, `appdepot-types`, `appdepot-helper`, `appdepot-pty`).
   - GitHub Actions CI matrix, formatting (`rustfmt`, `clippy`), linting.
2. **Phase 1: Core Engine & CLI MVP**
   - Implement the safe archive extractor (`tar`, `zip` with path traversal guards).
   - Executable scoring and icon ranking heuristics.
   - Desktop entry parser and generator (`freedesktop-desktop-entry`).
   - Core CLI commands: `depot init`, `depot install`, `depot list`, `depot info`, `depot remove`, `depot doctor`.
3. **Phase 2: Registry, Adoption & Manifests**
   - SQLite schema (`rusqlite`) and transaction-safe ledger.
   - External application scanner (`dpkg -S`, `/opt`, Flatpak, Snap).
   - Linking external apps into categories without modifying system files.
   - TOML manifest export, import, and diff.
4. **Phase 3: Tauri Desktop GUI**
   - Initialize Tauri v2 + React + Vite frontend.
   - Library view (category sidebar, app grid/list, app detail inspector).
   - 4-step interactive install wizard with plan preview.
5. **Phase 4: Embedded Terminal & Teach Mode**
   - `portable-pty` Rust backend streaming raw bytes over Tauri channels.
   - `xterm.js` frontend with theme sync and clickable links.
   - Live execution of commands and Teach Mode dictionary explanations.
6. **Phase 5: Privilege Helper & Stacks**
   - `appdepot-helper` with polkit XML policy (`org.appdepot.policy`).
   - Systemd background service management (`zbus`).
   - Multi-app stacks and dependency ordering.
7. **Phase 6: Polish, Packaging & 1.0 Release**
   - Multi-distro packaging (`.deb`, AppImage, `.rpm`).
   - 90-second portfolio demo recording and documentation portal.
