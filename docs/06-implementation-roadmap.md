# 06. Implementation Roadmap and Incremental Build Plan

> **Source:** Derived from Section 26 and Appendix F of [`AppDepot-Project-Spec.md`](file:///home/besu/projects/appdepotforlinux/AppDepot-Project-Spec.md)  
> **Status:** Specification v0.1

---

## 1. Overview & Build Philosophy

To prevent burnout, feature drift, or getting bogged down in complex subsystems before foundations are ready, development is organized into **strict sequential phases**.

### Core Rules for Incremental Progress:
1. **Build CLI & Core First:** Never start UI components before the underlying command and data structures are proven and tested in `appdepot-core`.
2. **Phase Gates:** Do not begin a subsequent phase until the current phase passes its specific acceptance criteria.
3. **Definition of Done:** Every feature must satisfy the 6-point DoD before being considered complete.

---

## 2. Phase-by-Phase Execution Plan

### 📍 Phase 0: Foundations & Scaffolding (Target: Week 1)

*Goal: Establish a clean workspace, automated CI checks, and architectural clarity.*

- [ ] **Task 0.1:** Initialize Cargo workspace structure:
  - `crates/appdepot-core`: Core domain, pipeline, heuristics, registry, doctor.
  - `crates/appdepot-cli`: Binary entry point for the `depot` command.
  - `crates/appdepot-types`: Shared serializable data types.
  - `crates/appdepot-helper`: Privileged daemon skeleton.
  - `crates/appdepot-pty`: PTY session wrapper skeleton.
- [ ] **Task 0.2:** Create license (`MIT`), `README.md` skeleton, `CONTRIBUTING.md`, and `SECURITY.md`.
- [ ] **Task 0.3:** Preserve the v0 prototype script in `docs/history/add-app.sh`.
- [ ] **Task 0.4:** Write Architecture Decision Records:
  - `docs/adr/ADR-001-language-choice-rust.md`
  - `docs/adr/ADR-002-gui-toolkit-tauri-react.md`
  - `docs/adr/ADR-003-privilege-model-polkit-helper.md`
- [ ] **Task 0.5:** Configure GitHub Actions CI workflow (`cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`).
- **Phase 0 Deliverable:** Green CI running on an empty workspace with full documentation scaffolding.

---

### 📍 Phase 1: Core Engine & CLI MVP (Target: Weeks 2–5)

*Goal: Install tarballs safely, generate valid shortcuts, and provide core CLI commands.*

- [ ] **Task 1.1: Filesystem Abstraction (`fsx`):** Trait-based filesystem enabling in-memory testing for atomic operations.
- [ ] **Task 1.2: Safe Archive Extraction (`sources/tarball`, `sources/zip`):**
  - Implement zip-slip path validation.
  - Implement decompression limits (file count, total size).
  - Implement single-root directory flattening.
- [ ] **Task 1.3: Detection Heuristics (`analyze/`):**
  - Implement executable scoring (+50 ELF, +30 bin, -60 crashpad/helper).
  - Implement icon search and ranking algorithm with `extensions/` exclusion.
  - Implement monogram fallback icon renderer.
  - Implement category matching.
- [ ] **Task 1.4: Shortcut Generator (`shortcut/`):**
  - Generate standards-compliant `.desktop` files using `freedesktop-desktop-entry`.
  - Add symlink and shell wrapper generator in `/usr/local/bin` (or user `~/.local/bin`).
  - Cache refresh integration (`update-desktop-database`, `kbuildsycoca6`).
- [ ] **Task 1.5: Core CLI Commands in `appdepot-cli`:**
  - `depot init`: Set up directory tree and permissions.
  - `depot install <archive>`: Execute the 9-stage pipeline.
  - `depot list`: Query installed applications.
  - `depot info <app>`: Inspect metadata and ledger.
  - `depot remove <app>`: Cleanly delete all artifacts recorded in ledger.
  - `depot doctor`: Basic health checks (D-001, D-003, D-004, D-005).
- **Phase 1 Acceptance Criteria:**
  - Installing the synthetic `electron-like.tar.gz` fixture creates a functional `.desktop` shortcut and terminal command.
  - `depot remove` leaves zero orphaned files or symlinks.
  - `depot doctor` catches placeholder icons and fixes them.

---

### 📍 Phase 2: Registry, Adoption & Manifests (Target: Weeks 6–8)

*Goal: Track state in SQLite, link existing system applications, and enable workstation reproduction.*

- [ ] **Task 2.1: SQLite Registry & Ledger:**
  - Embed SQLite via `rusqlite` with schema migrations.
  - Implement transactional ledger tracking for all created artifacts.
- [ ] **Task 2.2: External App Scanner & Adoption (`adopt`):**
  - Scan `/usr/share/applications`, `/opt`, Flatpak, and Snap.
  - Use `dpkg -S` for Debian/Ubuntu package ownership detection.
  - Support **Linked Mode** (`depot link /opt/google/chrome --category browsers`).
- [ ] **Task 2.3: TOML Manifest Engine (`manifest/`):**
  - Implement TOML parser and serializer with JSON Schema validation.
  - Implement `depot export`: Generate `workstation.toml` from installed state.
  - Implement `depot import --dry-run`: Plan preview for manifests.
  - Implement `depot diff`: Contrast local system vs. manifest.
- **Phase 2 Acceptance Criteria:**
  - A manifest exported on one test VM restores cleanly on a fresh VM with a single `depot import` command.

---

### 📍 Phase 3: Desktop GUI Shell (Target: Weeks 9–12)

*Goal: Deliver a responsive, modern desktop interface for all existing capabilities.*

- [ ] **Task 3.1: Tauri v2 + React Scaffolding:**
  - Initialize `apps/gui` with Tauri v2, React, TypeScript, and Vite.
  - Export types from Rust to TypeScript using `specta` or `ts-rs`.
- [ ] **Task 3.2: Design Tokens & Layout:**
  - Implement CSS design tokens (Light/Dark themes, calm density, Lucide icons).
  - Build the three-column layout: Category Sidebar, App Grid/List, Inspector.
- [ ] **Task 3.3: 4-Step Interactive Install Wizard:**
  - Step 1: Drag-and-drop file dropzone or URL input.
  - Step 2: Editable heuristic analysis review (name, category, launcher, icon).
  - Step 3: Full plan preview before execution.
  - Step 4: Progress bar and live execution logs.
- [ ] **Task 3.4: Unorganized Apps View:**
  - Surface unorganized system applications; drag-and-drop into categories to adopt.
- **Phase 3 Acceptance Criteria:**
  - Every capability from Phase 1 and Phase 2 can be fully performed through the GUI without touching a terminal.

---

### 📍 Phase 4: Embedded Terminal & Teach Mode (Target: Weeks 13–14)

*Goal: Integrate a real terminal docked beside the GUI for transparency and learning.*

- [ ] **Task 4.1: PTY Backend (`appdepot-pty`):**
  - Implement PTY manager using `portable-pty`.
  - Stream raw binary chunks over Tauri v2 Channels.
  - Handle window resize events (`TIOCSWINSZ`).
- [ ] **Task 4.2: Frontend Terminal Component:**
  - Integrate `xterm.js` with WebGL, Fit, Search, and WebLinks addons.
  - Synchronize terminal color palettes with AppDepot UI theme.
- [ ] **Task 4.3: Visible Execution & Teach Mode:**
  - Run visible install/update tasks in a dedicated job terminal tab.
  - Display contextual explanations above commands from the teach dictionary.
- **Phase 4 Acceptance Criteria:**
  - Side-by-side layout functions smoothly under both X11 and Wayland.
  - Dropping an archive shows the real terminal commands running live.

---

### 📍 Phase 5: Privilege Helper, Services & Stacks (Target: Weeks 15–18)

*Goal: Privilege separation with polkit, systemd integration, and stack orchestration.*

- [ ] **Task 5.1: `appdepot-helper` & Polkit Policy:**
  - Implement standalone root helper in `crates/appdepot-helper`.
  - Write XML polkit policy (`org.appdepot.policy`).
  - Implement typed JSON protocol over `stdin` (reject arbitrary shell strings).
  - Implement `/var/log/appdepot/audit.log` logging.
- [ ] **Task 5.2: Services Panel (`services/`):**
  - Connect to systemd via `zbus` D-Bus bindings.
  - Support start, stop, restart, enable, disable for Redis, PostgreSQL, MySQL.
- [ ] **Task 5.3: Stacks & Dependency Engine (`stack/`):**
  - Build dependency DAG with cycle detection.
  - Ship default stack templates (Flutter Mobile, Node Backend, Java Enterprise).
- **Phase 5 Acceptance Criteria:**
  - The desktop GUI process never runs as root; all privileged tasks route through `appdepot-helper` and are logged.

---

### 📍 Phase 6: Polish, Packaging & 1.0 Release (Target: Weeks 19–22)

*Goal: Multi-distro packaging, performance optimization, and portfolio presentation.*

- [ ] **Task 6.1: Packaging & Bundling:**
  - Build `.deb` with helper registration and polkit policy.
  - Build portable standalone AppImage.
  - Build `.rpm` for Fedora/openSUSE.
- [ ] **Task 6.2: Accessibility & Ergonomics:**
  - Complete keyboard shortcut navigation (`Ctrl+K` command palette).
  - Screen reader compliance (Orca testing).
- [ ] **Task 6.3: Portfolio & Community Assets:**
  - Record the 90-second demo video following the script in Doc 05.
  - Publish mdBook documentation site.
  - Write blog posts on safe archive extraction and polkit privilege separation.
- **Phase 6 Acceptance Criteria:**
  - A new user can download the `.deb` or AppImage from GitHub Releases and organize their machine with zero external assistance.

---

## 3. Definition of Done (DoD) for Any Feature

Before marking any task complete, verify:

1. **User Guide Documentation:** Feature behavior and CLI flags documented.
2. **Automated Tests:** Unit test and integration test (including failure/rollback paths).
3. **Dry-Run & Preview:** `--dry-run` and GUI preview behavior verified.
4. **Dual Interface Support:** Both CLI and GUI support the operation (or an explicit exception is noted in ADR).
5. **Accessibility Check:** Full keyboard navigation verified.
6. **Changelog Entry:** Recorded according to Conventional Commits standard.

---

## 4. First Week Checklist (Kickstarting Phase 0)

- [x] Review master specification and split into modular documents.
- [ ] Initialize Cargo workspace (`Cargo.toml`) and crate directories.
- [ ] Place `add-app.sh` in `docs/history/`.
- [ ] Draft ADR-001, ADR-002, and ADR-003.
- [ ] Set up GitHub Actions CI workflow.
- [ ] Generate synthetic fixture archives (`electron-like.tar.gz`).
