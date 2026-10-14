# 03. Core Pipeline, Detection Heuristics, and Engine

> **Source:** Derived from Sections 9, 10, 11, 12, 13, and 14 of [`AppDepot-Project-Spec.md`](file:///home/besu/projects/appdepotforlinux/AppDepot-Project-Spec.md)  
> **Status:** Specification v0.1

---

## 1. The Installation Pipeline

### 1.1 State Machine

Every application installation follows a strict 9-stage finite state machine:

```
 ┌─────────┐   ┌──────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐
 │ Resolve │──▶│  Fetch   │──▶│ Verify  │──▶│  Unpack  │──▶│ Analyze  │
 └─────────┘   └──────────┘   └─────────┘   └──────────┘   └────┬─────┘
                                                                │
 ┌─────────┐   ┌──────────┐   ┌─────────┐   ┌──────────┐        ▼
 │  Done   │◀──│ Register │◀──│  Wire   │◀──│ Preview  │◀───────┘
 └─────────┘   └──────────┘   └─────────┘   └──────────┘
        ▲            Any failure ──▶ Rollback ──▶ Failed
```

### 1.2 Pipeline Stage Execution Contract

| Stage | Responsibility | Failure Handling |
|---|---|---|
| **1. Resolve** | Determine source type, target category, app ID, and version. | Prompt user; never guess silently. |
| **2. Fetch** | Download with resume and progress tracking into cache. | Retry with exponential backoff; retain partial chunks. |
| **3. Verify** | Validate SHA-256 and optional GPG/minisign signatures. | Immediate abort; purge corrupted file from cache. |
| **4. Unpack** | Extract into an isolated temporary folder in the target filesystem. | Purge temporary folder. |
| **5. Analyze** | Run detection heuristics: executables, icons, sandbox helpers. | Continue with warnings; surface candidates to user. |
| **6. Preview** | Present the planned changes (files, symlinks, shortcuts, PATH). | User may edit options or cancel cleanly without disk impact. |
| **7. Wire** | Atomic `rename()` into target category; apply permissions; create artifacts. | Full transactional rollback of all created artifacts. |
| **8. Register** | Write app entry and ledger to SQLite in a single transaction. | Roll back filesystem changes and abort. |
| **9. Done** | Refresh desktop caches (`update-desktop-database`) and notify UI. | Non-fatal logging if cache refresh fails. |

### 1.3 Safe Archive Extraction Rules

To protect against malicious archives and decompression exploits:

1. **Anti-Zip-Slip Guard:** Strictly reject any archive entry whose normalized target path contains `../` or resolves outside the destination directory.
2. **Symlink Boundary Checks:** Reject or neutralize any symbolic link pointing outside the extraction boundary.
3. **Privilege Neutralization:** Strip setuid/setgid bits and world-writable permissions on extracted files (except explicitly detected Chromium sandbox helpers).
4. **Decompression Bomb Protection:** Enforce hard quotas on uncompressed file size (max 10 GB default), file count (max 100,000 files), and directory depth (max 15 levels).
5. **Same-Filesystem Staging:** Extract into `.tmp` inside the target category so that the final placement is an atomic POSIX `rename()` instead of a slow copy.

---

## 2. Detection Heuristics

Real-world vendor archives are cluttered. For instance, an Electron IDE tarball may contain `antigravity-ide`, `bin/antigravity-ide`, `chrome-sandbox`, and `chrome_crashpad_handler`. Heuristics accurately identify launchers and assets.

### 2.1 Executable Scoring Algorithm

```
score(candidate):
    +50  File is an ELF binary or a shell script with the executable bit set
    +30  Parent directory is the install root or a directory named "bin"
    +25  Normalized basename exactly matches app ID or folder name
    +15  Normalized basename contains app name as a substring
    +10  File extension is .sh and no valid ELF candidate exists
    -60  Basename matches {chrome-sandbox, chrome_crashpad_handler, crashpad_handler,
                           uninstall*, update*, *.so, *.so.*}
    -30  Directory depth > 3 from the install root
    -20  Inside directory named lib, libexec, resources, node_modules

Resolution: Select the candidate with the highest score.
If top candidates are within 10 points, prompt the user in the wizard to disambiguate.
```

### 2.2 Icon Discovery & Ranking Rules

Vendor archives frequently contain internal theme assets or extension icons that confuse naive finders.

1. **Check `.desktop` First:** If the archive includes an internal `.desktop` file, parse its `Icon=` key first.
2. **Candidate Basenames (Case-Insensitive):** `<app-id>`, `<exec-name>`, `icon`, `logo`, `app`, `appicon`, `code`, `favicon`.
3. **Search Paths:** Root folder, `resources/`, `share/icons/hicolor/*/apps/`, `share/pixmaps/`, `assets/`, `build/`.
4. **Hard Exclusion Filters:** Reject any file path containing `extensions/`, `node_modules/`, `themes/`, `test/`, `docs/`, `demo/`, `samples/`, `locale/`, `language-packs/`.
5. **Format & Resolution Preference:** Prefer vector SVG (`.svg`). Otherwise, pick the largest PNG with dimensions $\ge 128 \times 128\text{ px}$.
6. **Aspect Ratio Sanity:** Require an aspect ratio between $0.9$ and $1.1$ (square format).
7. **Monogram Fallback:** If no valid image is found, automatically render a high-DPI monogram icon (initial letter on a category-colored background) to `<app>/.appdepot/icon.png`.
8. **Cardinal Rule:** **Never write an icon path into a `.desktop` file that does not exist on disk.**

### 2.3 Automatic Category Suggestions

| Detection Signal | Suggested Category |
|---|---|
| Existing `.desktop` `Categories=` contains `IDE`, `TextEditor`, `Development` | `ide` |
| Executable name matches `flutter`, `dart`, `javac`, `gradle`, `go`, `rustc`, `cargo` | `sdk` |
| `WebBrowser` keyword in desktop categories or metadata | `browsers` |
| Executable matches `postgres`, `mysqld`, `redis-server`, `mongod` | `databases` |
| Executable matches `node`, `deno`, `bun`, `python` | `runtimes` |
| Keywords match VPN, tunnel, WireGuard, NetBird | `network` |
| Desktop category matches `Office`, `Viewer`, `Spreadsheet` | `office` |
| Fallback | `tools` |

### 2.4 Chromium & Electron Sandbox Helper Handling

When an application bundle contains `chrome-sandbox`:
1. Mark the entry as requiring setuid elevation: `sandbox = "setuid"`.
2. Via `appdepot-helper`, set ownership and permissions: `chown root:root chrome-sandbox && chmod 4755 chrome-sandbox`.
3. Record the permission change in the ledger so updates or category relocations maintain this state.

---

## 3. Shortcut and Launcher System

### 3.1 Generated Desktop Entry Specification

Written to `/usr/share/applications/appdepot-<id>.desktop` (System) or `~/.local/share/applications/appdepot-<id>.desktop` (User):

```ini
[Desktop Entry]
Type=Application
Version=1.5
Name=Antigravity
GenericName=Code Editor
Comment=AI-assisted code editor
Exec="/opt/Application/ide/antigravity/antigravity-ide" %U
TryExec=/opt/Application/ide/antigravity/antigravity-ide
Icon=/opt/Application/ide/antigravity/.appdepot/icon.png
Terminal=false
Categories=Development;IDE;
StartupWMClass=antigravity
StartupNotify=true
X-AppDepot-Id=antigravity
X-AppDepot-Managed=true
```

### 3.2 Shortcut Rules & Standards
- Validate every generated file using `freedesktop-desktop-entry` / `desktop-file-validate` before saving.
- Include `TryExec=` pointing to the binary so the launcher disappears cleanly if the directory is missing.
- Link the entry to the registry using the custom key `X-AppDepot-Id`.
- After writing, refresh caches immediately:
  - `update-desktop-database` (freedesktop standard)
  - `kbuildsycoca6` / `kbuildsycoca5` (KDE Plasma cache)
  - `gtk-update-icon-cache` (GNOME/GTK icon cache)

### 3.3 Terminal Commands & Wrapper Scripts

- **Standard Binary:** Create a symlink in `/usr/local/bin/<command>`.
- **Custom Environment / Flags:** When environment variables or flags (e.g. Wayland ozone hints) are needed, generate an executable wrapper script:

```sh
#!/bin/sh
# Generated by AppDepot. Do not edit manually.
export ELECTRON_OZONE_PLATFORM_HINT=auto
exec "/opt/Application/ide/antigravity/antigravity-ide" "$@"
```

---

## 4. Adopting Existing Applications

### 4.1 System Scanner Targets

AppDepot's discovery engine searches:
- Standard desktop directories: `/usr/share/applications/*.desktop`, `~/.local/share/applications/*.desktop`.
- Sandboxed application exports: Flatpak (`/var/lib/flatpak/exports/share/applications`), Snap (`/var/lib/snapd/desktop/applications`).
- Existing add-ons in `/opt/*` (e.g. `/opt/google/chrome`, `/opt/onlyoffice`).
- Standalone AppImages in `~/Applications` or `~/Downloads`.

### 4.2 Ownership Detection Logic

```bash
dpkg -S <path>      # Ubuntu/Debian: identifies owning package (e.g. google-chrome-stable)
flatpak list --app  # Identifies Flatpak application IDs
snap list           # Identifies installed Snap packages
```

- If owned by `dpkg`: Registered in **Linked Mode**. AppDepot creates a directory symlink (`/opt/Application/browsers/chrome -> /opt/google/chrome`) and tracks metadata without touching package files.
- If Flatpak/Snap: Registered in **Adopted Mode** (metadata and tag grouping only).

---

## 5. Groups, Stacks, and Services

### 5.1 Categories vs. Tags vs. Stacks

- **Category:** Exactly one per application. Determines filesystem folder location under `/opt/Application/`.
- **Tag:** Arbitrary labels for searching (`mobile`, `frontend`, `work`).
- **Stack:** A named collection of tools, SDKs, and background services installed, updated, or launched together.

### 5.2 Built-In Stack Templates

| Stack Name | Included Applications & Components |
|---|---|
| **Flutter Mobile** | Flutter SDK (git), Android Studio, Chrome, `clang`, `cmake`, `ninja-build`, `libgtk-3-dev`. |
| **Node Backend** | Node.js LTS, Redis service, PostgreSQL service, Git. |
| **Java Enterprise** | OpenJDK 21, Gradle, Maven, IntelliJ IDEA / Eclipse. |
| **Data Science** | Python runtime, Jupyter, PostgreSQL, SQLite tools. |

### 5.3 Service Integration (systemd via `zbus`)

The Services engine communicates with `systemd` via D-Bus:
- Supports starting, stopping, restarting, and boot enabling/disabling of developer services (Redis, PostgreSQL, MySQL).
- Relieves developers from running database daemons continuously when not developing.
- Logs are streamed in real time to the activity panel via `journalctl`.

---

## 6. Manifest Format (TOML)

Workstations can be described entirely in declarative TOML profiles for reproduction on fresh machines.

### 6.1 Sample Workstation Manifest (`workstation.toml`)

```toml
schema = 1

[meta]
name        = "Mobile & Backend Workstation"
description = "Development environment for Kubuntu"
author      = "besu"
created     = "2026-10-14"

[root]
path  = "/opt/Application"
group = "devtools"
mode  = "2775"

[[category]]
id    = "ide"
label = "IDEs"
icon  = "code"

[[category]]
id    = "sdk"
label = "SDKs"
icon  = "box"

[[app]]
id       = "antigravity"
name     = "Antigravity"
category = "ide"
source   = { type = "tarball", url = "https://example.com/antigravity.tar.gz", sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }
exec     = "antigravity-ide"
command  = "antigravity"
sandbox  = "setuid"
shortcut = { categories = ["Development", "IDE"], wm_class = "antigravity" }

[[app]]
id       = "flutter"
name     = "Flutter SDK"
category = "sdk"
source   = { type = "git", url = "https://github.com/flutter/flutter.git", ref = "stable" }
env      = { FLUTTER_HOME = "{{install_dir}}" }
path_add = ["{{install_dir}}/bin"]
apt_deps = ["clang", "cmake", "ninja-build", "pkg-config", "libgtk-3-dev"]

[[service]]
id        = "redis"
unit      = "redis-server.service"
autostart = false

[[stack]]
id   = "mobile-stack"
label = "Mobile Dev"
apps = ["flutter", "antigravity"]
```

### 6.2 Template Expansion Variables
- `{{root}}`: Resolved install root (`/opt/Application`).
- `{{install_dir}}`: Full path to the app directory (`/opt/Application/sdk/flutter`).
- `{{user}}`: Current user login name.
- `{{home}}`: User home path (`/home/besu`).
- `{{arch}}`: Machine CPU architecture (`x86_64` or `aarch64`).
