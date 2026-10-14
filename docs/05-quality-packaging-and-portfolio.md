# 05. Quality, Packaging, and Portfolio Strategy

> **Source:** Derived from Sections 24, 25, 27, 28, 29, 30, and 31 of [`AppDepot-Project-Spec.md`](file:///home/besu/projects/appdepotforlinux/AppDepot-Project-Spec.md)  
> **Status:** Specification v0.1

---

## 1. Testing Strategy

### 1.1 Testing Pyramid

```
                ┌─────────────────────────────────┐
                │      Manual QA & Distro Test    │  KDE, GNOME, XFCE
                ├─────────────────────────────────┤
                │      End-to-End GUI Tests       │  Playwright + tauri-driver
                ├─────────────────────────────────┤
                │     Container Matrix Tests      │  Ubuntu 22.04/24.04, Debian 12, Fedora
                ├─────────────────────────────────┤
                │    Security & Fuzzing Tests     │  cargo-fuzz, zip-slip, decompression bomb
                ├─────────────────────────────────┤
                │   Integration Tests (Mock FS)   │  assert_fs, tempfile, fake root rollback
                ├─────────────────────────────────┤
                │     Golden & Snapshot Tests     │  insta (.desktop files, env fragments)
                ├─────────────────────────────────┤
                │           Unit Tests            │  Scoring heuristics, path sanitizers
                └─────────────────────────────────┘
```

### 1.2 Fixture Library Requirements

To ensure automated regression testing against messy vendor packages, the test suite relies on synthetic fixtures:

| Fixture Name | Composition | Test Target |
|---|---|---|
| `electron-like.tar.gz` | Root binary, nested `bin/`, `chrome-sandbox`, `chrome_crashpad_handler`, `extensions/` icon noise. | Validates executable scoring, icon exclusion filters, and setuid detection. |
| `sdk-like.tar.xz` | Single top-level directory containing executables under `bin/`, no `.desktop`. | Validates smart directory stripping and PATH fragment generation. |
| `multi-root.zip` | Archive without a single root directory. | Validates auto-wrapping in an app folder. |
| `evil-slip.tar` | Contains relative paths traversing upwards (`../../etc/passwd`). | Verifies that Zip-slip attacks are rejected and abort execution. |
| `evil-symlink.tar` | Archive containing symlinks resolving outside the root. | Ensures external symlinks are neutralized. |
| `bomb.zip` | 10 KB compressed file expanding to > 50 GB. | Verifies decompression quota enforcement. |

### 1.3 Minimal Doctor Check Catalogue

| Code | Health Check | Automated Resolution |
|---|---|---|
| **D-001** | Install root exists with `devtools` group and `2775` mode. | Run helper permission repair (`chmod 2775`). |
| **D-002** | Current user belongs to `devtools` in current session. | Prompt user to log out and re-authenticate. |
| **D-003** | Symlinks in `/usr/local/bin` point to valid executables. | Remove dangling links or update targets. |
| **D-004** | Desktop entries (`Exec=`) point to executable files. | Repair executable path or unregister shortcut. |
| **D-005** | No `Icon=` entry points to a missing file or placeholder. | Rerun icon heuristic ranking or create monogram fallback. |
| **D-006** | Chromium sandbox helpers have ownership `root:root` and mode `4755`. | Invoke `appdepot-helper` to restore setuid bit. |
| **D-007** | PATH fragments are present and sourced by loader. | Regenerate missing `/etc/profile.d/appdepot.d/*.sh` files. |
| **D-008** | Two installed apps provide colliding command names. | Prompt user to assign a command alias. |
| **D-009** | SQLite registry records match physical filesystem entries. | Rebuild database from disk metadata (`X-AppDepot-Id`). |
| **D-010** | System services referenced in stacks exist on host. | Suggest installing the missing apt package. |
| **D-011** | Database data directories possess correct service UID/mode. | Correct ownership to `postgres:postgres` or `mysql:mysql`. |

---

## 2. Packaging and Distribution

### 2.1 Distribution Formats

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      AppDepot Distribution Tiers                       │
 ├─────────────────┬──────────────────────────────────────────────────────┤
 │ 1. Native .deb  │ Primary format for Ubuntu, Debian, Kubuntu, Mint.    │
 │                 │ Installs helper to /usr/libexec and registers polkit.│
 ├─────────────────┼──────────────────────────────────────────────────────┤
 │ 2. AppImage     │ Distro-agnostic portable binary. Prompts a one-time  │
 │                 │ "Install Helper" prompt on first run.                │
 ├─────────────────┼──────────────────────────────────────────────────────┤
 │ 3. Native .rpm  │ Secondary tier for Fedora and openSUSE developer VMs.│
 └─────────────────┴──────────────────────────────────────────────────────┘
```

### 2.2 CI/CD Release Pipeline

```
  git tag v1.0.0
       │
       ▼
  GitHub Actions Matrix (Ubuntu 22.04 LTS & 24.04 LTS)
    ├─ cargo fmt --check && cargo clippy -D warnings
    ├─ cargo nextest run && npm test
    ├─ cargo deny check && cargo audit
    ├─ tauri build  ──▶ Generates .deb, .AppImage, .rpm
    ├─ Generate SHA256SUMS and sign with minisign
    ├─ Generate Software Bill of Materials (SBOM)
    └─ Publish GitHub Release & synchronize APT repository
```

> **Compilation Note:** Binaries are compiled against the oldest supported LTS (Ubuntu 22.04) so that glibc forward-compatibility is preserved across newer systems.

---

## 3. Portfolio & Career Presentation Strategy

AppDepot is structured to serve as an exceptional portfolio project demonstrating advanced software craftsmanship.

### 3.1 Key Skills Demonstrated

| Engineering Domain | Direct Evidence in AppDepot |
|---|---|
| **Systems Programming** | Safe archive parsing, POSIX file permissions, setgid management, PTY sessions. |
| **Security Engineering** | Polkit integration, typed unprivileged-to-root IPC, threat modeling, anti-traversal guards. |
| **Product & UX Design** | Real pain point resolved, developer personas, dual-pane GUI with docked live terminal. |
| **Full-Stack Architecture** | Multi-crate Rust backend, typed IPC bindings (`specta`), React + Vite modern frontend. |
| **Testing Discipline** | Fixture-based regression suite, snapshot tests (`insta`), self-healing doctor catalogue. |
| **Release Engineering** | Multi-distro Linux packaging (`.deb`, AppImage), automated GitHub Actions CI/CD. |

### 3.2 The 90-Second Demo Script

1. **The Mess:** Start with a fresh Kubuntu VM and a cluttered `Downloads/` directory containing an IDE tarball.
2. **Auto-Discovery:** Launch AppDepot. The background scanner highlights unorganized system packages (Chrome, OnlyOffice); drag them into categories.
3. **Smart Install:** Drag the IDE tarball onto the window. The wizard identifies the real launcher, selects the crispest SVG icon, flags the Chromium sandbox helper, and previews the exact plan.
4. **Live Transparency:** Execute the plan; the docked terminal displays the underlying commands executing in real time.
5. **One-Click Stacks:** Click **Install Stack: Flutter Mobile** to see multi-package dependency ordering in action.
6. **Self-Healing Doctor:** Introduce an intentional failure (broken icon or modified permissions); run `depot doctor --fix` to show instant automated recovery.
7. **Portability:** Export the machine manifest to `workstation.toml` and verify restoration on a second clean VM.

### 3.3 Interview Talking Points & Deep-Dives
- **Why Plan-Then-Apply:** Decouples dry-run validation, UI previews, and rollback logic into a single deterministic codepath.
- **Why Linking Beats Moving:** Moving `.deb`-managed files breaks system updates and AppArmor; symlinking preserves package integrity while delivering Program Files organization.
- **Helper Security Surface:** Why accepting typed JSON operations over `stdin` is fundamentally safer than running shell scripts with `sudo`.

---

## 4. Risks and Mitigations Summary

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Scope Creep** | High | Strictly observe Non-Goals; deliver CLI and core pipeline before expanding GUI features. |
| **Rust Learning Curve** | Medium | Follow modular phase roadmap; keep core separate from UI; leverage existing Plan B (Flutter). |
| **WebKitGTK Compatibility** | Medium | Isolate all presentation logic from `appdepot-core`; test across X11 and Wayland. |
| **Privilege Escalation** | Critical | Strict path bounds checking, typed JSON payloads, external review before 1.0 release. |
| **False-Positive Heuristics** | Low | Install wizard always surfaces scored choices for user review and manual override. |
