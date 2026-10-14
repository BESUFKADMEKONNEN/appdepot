# AppDepot: A Linux Application Manager for Developers

> **Working title.** "AppDepot" is a placeholder. Alternatives are listed in section 28.
> **Status:** Specification v0.1 (pre-implementation)
> **Author:** Besifkad
> **Date:** 2026-10-14
> **One-line pitch:** *Windows' "Program Files" experience, done the Linux way: group, install, organize and launch every application from one window, with a real terminal sitting beside it.*

---

## Table of Contents

1. Vision
2. Problem Statement
3. Origin Story: The v0 Prototype
4. Target Users
5. Goals and Non-Goals
6. Core Concepts and Vocabulary
7. Feature Catalogue
8. Filesystem Layout and Conventions
9. The Installation Pipeline
10. Detection Heuristics (Executables, Icons, Categories)
11. Shortcut and Launcher System
12. Adopting Existing Applications
13. Groups, Stacks and Services
14. Manifest Format
15. CLI Design
16. GUI Design
17. Embedded Terminal
18. Appearance and Design System
19. Privilege and Security Model
20. Architecture
21. Data Model
22. Technology Stack
23. Alternatives Considered
24. Packaging and Distribution
25. Testing Strategy
26. Roadmap
27. Repository Structure
28. Naming and Branding
29. Portfolio Strategy
30. Risks and Mitigations
31. Appendices

---

## 1. Vision

Linux gives you excellent package managers and no single place to see, organize and launch **everything** you run. Software arrives from many sources: `apt`, `.deb` files, Flatpak, Snap, AppImages, tarballs, `git clone`, and vendor install scripts. Each source puts files in a different place, creates different shortcuts (or none), and is removed in a different way.

AppDepot is a desktop application and command-line tool that gives all of those sources **one organized home**:

- A **categorized library** (IDEs, SDKs, browsers, databases, runtimes, tools) like folders under Windows' Program Files.
- **One-click install** of tarballs, zips, `.deb` files, AppImages and git repositories into that library, with shortcuts, icons, PATH entries and permissions created correctly.
- **Group operations**: install, update, remove, launch or export a whole *stack* (for example "Flutter Mobile") in one action.
- **Adoption** of software that is already installed, so it can be organized and given shortcuts without being moved or modified.
- A **terminal docked beside the GUI**, so the user sees the exact commands being run and can type their own without switching windows.
- **Portable profiles**: describe a workstation in a single file and recreate it on another machine.

The goal is a tool that makes a newcomer from Windows productive on day one, and that experienced developers still find faster than doing it by hand.

---

## 2. Problem Statement

These problems are not hypothetical. Every item below was hit while setting up a fresh Kubuntu machine for development.

| # | Pain point | What actually happens |
|---|---|---|
| 1 | **No standard home for manual installs** | `/opt`, `/usr/local`, `~/.local`, `~/dev/tools`: the user must choose, and every tutorial chooses differently. |
| 2 | **Tarball apps never appear in the menu** | The app runs from a folder, but there is no launcher, no icon, and no way to pin it, until someone hand-writes a `.desktop` file. |
| 3 | **Placeholder values leak into real files** | A copy-pasted `Icon=/path/to/icon.png` is silently accepted and the desktop shows a generic fallback icon. |
| 4 | **Electron and Chromium sandbox permissions** | Apps built on Chromium ship a `chrome-sandbox` helper that must be owned by root with the setuid bit, or the app fails to start. |
| 5 | **PATH is configured in many places** | `~/.bashrc`, `~/.zshrc`, `~/.profile`, `/etc/profile.d/*.sh`, and each behaves differently for GUI versus terminal sessions. |
| 6 | **Permissions and groups are confusing** | Managing a shared tree without `sudo` every time needs a group, `chgrp`, and the setgid bit (`2775`). It is easy to get wrong. |
| 7 | **Package-managed apps pick their own folders** | `.deb` installs put Chrome in `/opt/google` and OnlyOffice in `/opt/onlyoffice`. Moving them breaks updates, so they cannot simply be "tidied" into a custom tree. |
| 8 | **Uninstall is manual detective work** | A tarball install leaves behind a symlink, a `.desktop` file, a PATH line and permissions. Nothing tracks them. |
| 9 | **Nothing is reproducible** | A new machine means repeating every step from memory or from notes. |
| 10 | **Fragmented formats** | `apt`, Snap, Flatpak, AppImage and tarballs each have their own commands, locations and update stories. |
| 11 | **Typos in long commands** | A wrong folder name (`/opt/sdk` versus `/opt/Application/sdk`) produces a page of errors and no progress. |
| 12 | **The terminal is intimidating** | Newcomers do not know what each command did, so they cannot learn from running it. |

### 2.1 The gap in existing tools

| Tool | What it does well | What it does not do |
|---|---|---|
| `apt`, `dnf`, `pacman` | Package install, dependencies, updates | No grouping by purpose; no tarballs; no shortcuts for non-packaged apps |
| Flatpak / Snap | Sandboxed apps, central stores | Different filesystem model; poor fit for SDKs and toolchains |
| AppImageLauncher | Integrates AppImages into the menu | AppImages only |
| Discover / GNOME Software | Browsing and installing from stores | No organization of manual installs, no stacks |
| `asdf`, `mise`, `sdkman`, `nvm` | Language-runtime version management | Each manages only its own runtime |
| Ansible / Nix / Brew bundles | Reproducible setups | High learning curve; no GUI; no shortcut handling |
| Windows' installer experience | Familiar, one place for everything | Not available on Linux |

AppDepot's niche is the **organization and lifecycle layer** above all of them. It does not replace any of them. It cooperates with them.

---

## 3. Origin Story: The v0 Prototype

The first version of this idea was a 25-line Bash script called `add-app`, written during the initial setup of the machine. It took a name, an executable path, an optional icon and a category, and then:

1. Resolved the executable's real path.
2. Created a symlink in `/usr/local/bin` so the app could be started from any terminal.
3. Wrote a `.desktop` file in `/usr/share/applications`.
4. Refreshed the desktop database.

```bash
add-app "Antigravity" /opt/Application/ide/antigravity/antigravity-ide /path/to/icon.png "Development;IDE;"
```

It worked, and it also exposed every weakness a real product must fix.

| Weakness of the v0 script | Real-product answer |
|---|---|
| Accepted a non-existent icon path and wrote it into the file | Validate every path before writing; discover icons automatically |
| Could not find the executable on its own | Executable detection with scoring (section 10) |
| Did nothing about the Chromium sandbox | Detect and fix sandbox helpers, with polkit authorization |
| No record of what it created | A ledger of every artifact for clean uninstall |
| One app at a time | Groups, stacks and manifests |
| Needed `sudo` inside the script | A privileged helper with polkit, never `sudo` in the GUI |
| No undo | Transactional install with rollback |
| No view of what is installed | A registry database and a library UI |
| Linux-newbie unfriendly | GUI, explanations, and a visible terminal |

**The v0 script is the seed of `appdepot-core`'s shortcut module.** Keep it in the repository's `docs/history/` folder as part of the project story.

---

## 4. Target Users

### 4.1 Personas

**Persona A: The Windows Migrant ("Besu")**
Developer with 1-2 years of experience, new to Linux. Knows Program Files, the Start menu and the PATH dialog. Wants a tidy, professional machine and wants to learn what is happening underneath. *Needs:* guidance, visible commands, safe defaults.

**Persona B: The Polyglot Developer ("Mira")**
Uses Flutter, Node, Java and Python. Installs SDKs by tarball because distribution packages are old. Reinstalls her machine twice a year. *Needs:* stacks, manifests, and a fast restore.

**Persona C: The Team Lead ("Daniel")**
Onboards new hires and wants everyone to have the same toolchain in the same folders. *Needs:* shareable profiles, a doctor command, and consistent layout.

**Persona D: The Workstation Admin ("Priya")**
Maintains 20-50 developer machines in a small company or lab. *Needs:* a CLI, JSON output, idempotent operations, an audit log.

**Persona E: The Student / Bootcamp Learner**
Shares a lab machine and has no `sudo` rights. *Needs:* user-scope installs under the home directory with the same interface.

### 4.2 Jobs To Be Done

- "When I download a tarball, help me put it somewhere sensible and make it show up in my menu."
- "When I set up a new machine, let me describe my tools once and install them all."
- "When I forget what is installed where, show me everything in one organized place."
- "When I remove something, make sure nothing is left behind."
- "When I do not understand a command, show me what it does."

---

## 5. Goals and Non-Goals

### 5.1 Goals

1. **Organized by default.** Every app belongs to a category, in a predictable location.
2. **Safe.** No GUI process runs as root. Every privileged action is narrow, authorized and logged.
3. **Reversible.** Every install is a transaction with a ledger. Uninstall removes everything it created.
4. **Cooperative.** Works with `apt`, Flatpak, Snap and AppImage rather than competing with them.
5. **Transparent.** The exact commands are always visible in the docked terminal.
6. **Portable.** A manifest file recreates a setup on another machine.
7. **Fast and light.** Starts in under one second; idle memory under 150 MB for the GUI.
8. **Single-artifact distribution.** Double-click an AppImage or install one `.deb`, with no dependency ceremony.
9. **Scriptable.** Everything the GUI does is available from the CLI with `--json` output.
10. **A strong portfolio piece.** Systems programming, UI engineering, security design, packaging and testing in one project.

### 5.2 Non-Goals

- Replacing `apt`, `dnf` or `pacman`. They remain the source of truth for packaged software.
- Hosting a public app store or package repository (maybe later as a community manifest index).
- Sandboxing applications (that is Flatpak's job).
- Supporting immutable distributions such as Fedora Silverblue or SteamOS in v1. A read-only `/opt` is out of scope.
- Managing language-level dependencies (`pip`, `npm` packages).
- Windows or macOS support.

---

## 6. Core Concepts and Vocabulary

| Term | Meaning |
|---|---|
| **Application** | Anything launchable or usable: GUI app, CLI tool, SDK, runtime, service. |
| **Category** (group) | A folder-like label such as `ide`, `sdk`, `browsers`, `databases`. Maps to a directory in the install root. |
| **Install Root** | The base directory AppDepot manages. Default: `/opt/Application`. Configurable. |
| **Source** | Where an application comes from: tarball, zip, `.deb`, AppImage, git repository, apt package, Flatpak, Snap, or a script. |
| **Entry** | An application as recorded in the registry. |
| **Artifact** | Anything AppDepot creates for an entry: a symlink, `.desktop` file, wrapper script, PATH fragment, service override. |
| **Ledger** | The per-entry list of artifacts, used for clean removal and for `doctor`. |
| **Launcher** | The way an app is started: terminal command, menu entry, or both. |
| **Shortcut** | A `.desktop` entry visible in the application menu. |
| **Stack** | A named set of entries (and services) operated on together. |
| **Profile / Manifest** | A text file describing categories, apps, stacks and services. |
| **Job** | A unit of work (install, update, remove) with progress, logs and a result. |
| **Backend** | A plug-in that talks to a package system (apt, dnf, pacman, Flatpak). |
| **Helper** | The small privileged program that performs authorized root actions. |

### 6.1 The three ownership modes

This distinction is the most important idea in the design.

| Mode | Files live in | AppDepot owns | Examples |
|---|---|---|---|
| **Managed** | `<root>/<category>/<app>` | Files and lifecycle | Flutter SDK, Android Studio, Antigravity (tarball) |
| **Linked** | Wherever the package manager put them | Only a symlink, metadata and category | Chrome (`/opt/google/chrome`), OnlyOffice (`/opt/onlyoffice`) |
| **Adopted** | Anywhere | Nothing on disk; only tags, group and shortcut preferences | VLC from apt, Firefox snap, any existing `.desktop` app |

A single rule follows from this: **AppDepot never moves files that another package manager owns.** It points at them.

### 6.2 Windows concept translator (built into the help system)

| Windows | Linux | AppDepot equivalent |
|---|---|---|
| `C:\Program Files` | `/opt`, `/usr` | Install Root with categories |
| Start menu entry | `.desktop` file | Shortcut |
| Environment Variables dialog | `/etc/profile.d`, `~/.profile` | Environment fragments |
| `.exe` installer | `.deb`, AppImage, tarball | Install wizard |
| Add or Remove Programs | `apt remove`, manual deletion | Library, Remove |
| Registry | Dotfiles, `/etc` | (none; AppDepot has its own registry) |
| Services | systemd units | Services tab |
| Run as administrator | `sudo`, polkit | Authorization dialog |

---

## 7. Feature Catalogue

Priority key: **P0** = MVP, **P1** = version 1.0, **P2** = after 1.0.

### 7.1 Install and sources

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-001 | Tarball install | `.tar.gz`, `.tar.xz`, `.tar.bz2`, `.tar.zst` extracted into the right category | P0 |
| F-002 | Zip install | `.zip` with nested-root detection | P0 |
| F-003 | Smart root stripping | Detect a single top-level folder and flatten it (the `--strip-components` problem) | P0 |
| F-004 | `.deb` install | Install through apt so dependencies resolve; record as *linked* | P0 |
| F-005 | AppImage install | Copy to the category, make executable, integrate | P1 |
| F-006 | Git install | Clone a repository (for example the Flutter stable branch) into the category | P1 |
| F-007 | APT package install | Install by package name, record as *linked* or *adopted* | P0 |
| F-008 | Flatpak and Snap install | Install by id, record as *adopted* | P2 |
| F-009 | Checksum verification | SHA-256 verification when a checksum is supplied or published | P0 |
| F-010 | Signature verification | GPG or minisign verification where available | P1 |
| F-011 | Drag-and-drop install | Drop a file on the window to open the install wizard | P1 |
| F-012 | URL install | Paste a download link; AppDepot downloads with progress and resume | P1 |
| F-013 | Dry run | Show every file and command without changing anything | P0 |
| F-014 | Transactional install | All-or-nothing with rollback on failure | P0 |
| F-015 | Vendor script guard | Show and require confirmation for `curl \| sh` style installers; never auto-run | P1 |
| F-016 | Dependency hints | Detect missing shared libraries with `ldd` and suggest apt packages | P2 |

### 7.2 Organization

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-020 | Categories | Default set plus user-defined categories; each maps to a folder | P0 |
| F-021 | Move between categories | Moves managed apps and updates every artifact path | P1 |
| F-022 | Tags | Free-form tags on top of categories (for example `mobile`, `work`) | P1 |
| F-023 | Search and filter | By name, category, tag, source, health | P0 |
| F-024 | Favorites and recents | Pin frequently used apps | P1 |
| F-025 | Custom icons per category | Choose icon and color per category | P2 |
| F-026 | Library view modes | Grid, list, and compact | P1 |

### 7.3 Shortcuts and launchers

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-030 | Menu shortcut creation | Valid `.desktop` entry with validated fields | P0 |
| F-031 | Terminal command creation | Symlink or wrapper in a bin directory on PATH | P0 |
| F-032 | Automatic icon discovery | Rank candidate icons; reject placeholders and extension icons | P0 |
| F-033 | Generated fallback icon | Render a monogram icon when none exists | P1 |
| F-034 | Wrapper scripts | Set environment variables or flags (for example Wayland hints) | P1 |
| F-035 | Desktop actions | "New window", "New private window" entries | P2 |
| F-036 | MIME associations | Set default handlers (for example `.docx`) | P1 |
| F-037 | Autostart toggle | Create or remove an autostart entry | P1 |
| F-038 | Shortcut repair | Detect and fix broken `Exec=` and `Icon=` values | P0 |
| F-039 | Per-user versus system scope | Choose `~/.local/share/applications` or `/usr/share/applications` | P0 |
| F-040 | Cache refresh | Run `update-desktop-database` and `kbuildsycoca6` as needed | P0 |

### 7.4 Existing applications

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-050 | System scan | Find apps from `.desktop` files, `/opt`, Flatpak, Snap, AppImages | P0 |
| F-051 | Ownership detection | Identify the package owner with `dpkg -S`, `flatpak list`, `snap list` | P1 |
| F-052 | Adopt into groups | Drag an existing app into a category without touching its files | P0 |
| F-053 | Shortcut for any executable | File picker creates a shortcut for any binary or script | P0 |
| F-054 | Link external folders | Link `/opt/google/chrome` into the tree as *linked* | P0 |
| F-055 | Hide from menu | Override a system `.desktop` with `NoDisplay=true` in user scope | P2 |

### 7.5 Groups, stacks and services

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-060 | Stacks | Named sets of apps and services | P1 |
| F-061 | Group install | Install every member of a stack, in dependency order | P1 |
| F-062 | Group update | Check and update members together | P1 |
| F-063 | Group remove | Remove all members with a single confirmation | P1 |
| F-064 | Group launch | Start several apps and services in one action | P2 |
| F-065 | Services panel | Start, stop, enable and disable systemd units (Redis, PostgreSQL, MySQL) | P1 |
| F-066 | Service data directory management | Relocate a database's data directory into the tree with AppArmor handling | P2 |
| F-067 | Stack templates | Built-in stacks: Flutter Mobile, Node Backend, Java, Data Science | P1 |

### 7.6 Environment

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-070 | PATH fragments | One file per app in `/etc/profile.d/appdepot.d/` or user equivalent | P0 |
| F-071 | Environment variables | `FLUTTER_HOME`, `ANDROID_HOME`, `JAVA_HOME` and similar | P0 |
| F-072 | Shell detection | Bash, Zsh, Fish: write the correct syntax for each | P1 |
| F-073 | Conflict detection | Warn when two apps provide the same command | P1 |
| F-074 | Active version switching | Choose which Java or Node version is `default` | P2 |

### 7.7 Updates, backup and sharing

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-080 | Update sources | GitHub Releases, URL patterns, apt policy | P1 |
| F-081 | Update notifications | Desktop notification with changelog link | P1 |
| F-082 | Version pinning | Hold an app at a version | P2 |
| F-083 | Manifest export | Write the current setup to a manifest | P0 |
| F-084 | Manifest import | Recreate a setup from a manifest, with a preview | P0 |
| F-085 | Manifest diff | Compare a manifest with the current machine | P1 |
| F-086 | `.depot` file association | Double-click a manifest to open the import wizard | P2 |
| F-087 | Pre-install snapshot | Offer a Timeshift snapshot before large operations | P2 |
| F-088 | Settings backup | Optionally archive config directories (`~/.config/<app>`) | P2 |

### 7.8 Health and diagnostics

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-090 | Doctor | Run all health checks and show fixes | P0 |
| F-091 | Dangling symlink check | Detect links to removed files | P0 |
| F-092 | Orphan shortcut check | `.desktop` files that point to missing executables | P0 |
| F-093 | Placeholder detection | Find values such as `/path/to/icon.png` | P0 |
| F-094 | Permission audit | Verify group, mode and the setgid bit on the tree | P0 |
| F-095 | Sandbox audit | Confirm Chromium-based helpers have correct ownership and mode | P1 |
| F-096 | PATH audit | Show which PATH entry wins for each command | P1 |
| F-097 | One-click fix | Every doctor finding offers a fix that can be previewed | P0 |
| F-098 | Health score | Single summary on the dashboard | P2 |

### 7.9 Interface

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-100 | Side-by-side terminal | Docked right or bottom, resizable, always available | P0 |
| F-101 | Command palette | `Ctrl+K` for every action | P1 |
| F-102 | Activity panel | Running and finished jobs with logs | P0 |
| F-103 | Teach mode | Explain each command shown in the terminal | P1 |
| F-104 | Theme following | Follow the desktop's light, dark and accent colors | P1 |
| F-105 | Terminal themes | Catppuccin, Tokyo Night, Dracula, Nord, Solarized | P1 |
| F-106 | Keyboard-first navigation | Everything reachable without a mouse | P1 |
| F-107 | Tray icon | Quick launch menu and update notifications | P2 |
| F-108 | Localization | Translatable strings from day one | P2 |

### 7.10 Extensibility

| ID | Feature | Description | Pri |
|---|---|---|---|
| F-110 | Backend plug-ins | dnf, pacman, zypper behind one trait | P2 |
| F-111 | Community manifests | Index of shareable stacks | P2 |
| F-112 | Hooks | `post_install` and `pre_remove` scripts in manifests, with confirmation | P1 |
| F-113 | TUI mode | `depot tui` for SSH sessions | P2 |
| F-114 | JSON API | Stable machine-readable output for scripting | P1 |

---

## 8. Filesystem Layout and Conventions

### 8.1 Default install root

```
/opt/Application/
├── ide/                 # Antigravity, Android Studio, JetBrains tools
├── sdk/                 # Flutter, Android SDK, JDKs installed manually
├── browsers/            # Linked: chrome -> /opt/google/chrome
├── databases/
│   ├── postgresql/      # relocated data directory
│   └── mysql/           # relocated data directory
├── runtimes/            # Node, Deno, Bun (manual installs)
├── network/             # NetBird, VPN tools (manual installs)
├── office/              # Linked: onlyoffice -> /opt/onlyoffice
├── tools/               # standalone utilities, plus the legacy add-app script
└── .appdepot/           # AppDepot's own metadata (hidden)
    ├── registry.db
    ├── ledger/
    ├── cache/
    └── logs/
```

### 8.2 Why `/opt`

The Filesystem Hierarchy Standard reserves `/opt` for add-on application software packages. It is outside the package manager's territory, it is system-wide, and it is the closest analogue to Program Files. Linked entries from packages (`/opt/google`, `/opt/onlyoffice`) already live here.

### 8.3 Scopes

| Scope | Root | Shortcuts | Command links | Needs privileges |
|---|---|---|---|---|
| **System** | `/opt/Application` | `/usr/share/applications` | `/usr/local/bin` | Yes (helper) |
| **User** | `~/Applications` | `~/.local/share/applications` | `~/.local/bin` | No |

The user scope exists so that shared lab machines and no-`sudo` users get the same interface.

### 8.4 Permissions model

```
/opt/Application             root:devtools   2775  (setgid, group-writable)
/opt/Application/<category>  root:devtools   2775
<app folder>                 <user>:devtools 2775
```

- The **setgid bit** makes new files inherit the `devtools` group.
- AppDepot's *init* step creates the group, adds the current user, and sets modes. The user must log out and back in once. The wizard says so plainly.
- Exceptions are database data directories, which must be owned by the service user (`postgres`, `mysql`) with restrictive modes. AppDepot sets these per service.

### 8.5 Configuration locations (XDG compliant)

| File | Purpose |
|---|---|
| `/etc/appdepot/config.toml` | System defaults (root, group, scope) |
| `~/.config/appdepot/config.toml` | User preferences (theme, terminal font, layout) |
| `<root>/.appdepot/registry.db` | Registry (system scope) |
| `~/.local/share/appdepot/registry.db` | Registry (user scope) |
| `~/.cache/appdepot/` | Downloads and icon cache |
| `/etc/profile.d/appdepot.sh` | Loader for environment fragments |
| `/etc/profile.d/appdepot.d/*.sh` | One fragment per app |
| `/var/log/appdepot/` or `~/.local/state/appdepot/` | Logs |

### 8.6 Environment fragments

One file per app, so removal is a single `rm`:

```sh
# /etc/profile.d/appdepot.d/flutter.sh   (generated; do not edit)
export FLUTTER_HOME="/opt/Application/sdk/flutter"
export PATH="$FLUTTER_HOME/bin:$PATH"
```

A single loader sources them all:

```sh
# /etc/profile.d/appdepot.sh
for f in /etc/profile.d/appdepot.d/*.sh; do [ -r "$f" ] && . "$f"; done
unset f
```

Fish shell uses `set -gx` syntax and a separate `conf.d` file. AppDepot writes the right form for the user's shell.

---

## 9. The Installation Pipeline

### 9.1 State machine

```
 ┌─────────┐   ┌──────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐
 │ Resolve │──▶│  Fetch   │──▶│ Verify  │──▶│  Unpack  │──▶│ Analyze  │
 └─────────┘   └──────────┘   └─────────┘   └──────────┘   └────┬─────┘
                                                                │
 ┌─────────┐   ┌──────────┐   ┌─────────┐   ┌──────────┐        ▼
 │  Done   │◀──│ Register │◀──│  Wire   │◀──│ Preview  │◀───────┘
 └─────────┘   └──────────┘   └─────────┘   └──────────┘
        ▲            any failure ──▶ Rollback ──▶ Failed
```

### 9.2 Stage details

| Stage | Work | Failure handling |
|---|---|---|
| **Resolve** | Determine source type, target category, app id and version | Ask the user; never guess silently |
| **Fetch** | Download with resume and progress; store in cache | Retry with backoff; keep partial file |
| **Verify** | SHA-256 and, if present, signature | Abort and delete on mismatch |
| **Unpack** | Extract into a temporary directory inside the target category | Remove temp directory |
| **Analyze** | Find executable, icon, desktop entry hints, sandbox helper, ELF dependencies | Continue with warnings |
| **Preview** | Show every file, link, shortcut and PATH change | User may edit names and choices |
| **Wire** | Atomic rename into place; create artifacts; call the helper for privileged parts | Roll back all artifacts |
| **Register** | Write entry and ledger to the registry in one SQLite transaction | Roll back |
| **Done** | Refresh caches, send a notification | n/a |

### 9.3 Safe extraction rules

Archive handling is a classic source of vulnerabilities. The extractor must:

1. Reject any entry whose normalized path escapes the destination (`../` or absolute paths), known as zip-slip.
2. Reject or neutralize symlinks pointing outside the destination.
3. Refuse device files and setuid files except the explicitly recognized sandbox helper.
4. Limit total uncompressed size, file count and path depth to defeat decompression bombs.
5. Preserve executable bits, but strip world-writable bits.
6. Extract into a temp directory on the **same filesystem** as the target so the final move is an atomic `rename`.

### 9.4 Source adapter specifics

| Source | Notes |
|---|---|
| **Tarball / Zip** | Detect a single root folder; if several, create a folder named after the app |
| **`.deb`** | Read control metadata with `dpkg-deb -I`; install via `apt install ./file.deb`; discover installed files with `dpkg -L`; record as *linked* |
| **AppImage** | Copy to `<category>/<app>/`, `chmod +x`, extract `.desktop` and icon with `--appimage-extract`, optionally keep the image mounted-only |
| **Git** | Shallow clone, record the branch or tag; update becomes `git pull` |
| **APT package** | Query `apt-cache policy`; install through the helper; map `dpkg -L` to executables and desktop files |
| **Script** | Download, display, hash, require explicit approval, run in a PTY visible to the user |

### 9.5 Idempotency

Running the same install twice must be safe: if the entry exists with the same version and checksum, the second run reports "already installed". If the version differs, the run becomes an upgrade with the previous version kept until success.

---

## 10. Detection Heuristics (Executables, Icons, Categories)

### 10.1 Executable discovery

Real archives are messy. A listing from an actual Electron-based IDE tarball contained `antigravity-ide`, `bin/antigravity-ide`, `chrome-sandbox` and `chrome_crashpad_handler`, all executable. Only one is the right launcher.

```
score(candidate):
    +50  file is an ELF binary or a shell script with the executable bit
    +30  parent directory is the install root or a directory named "bin"
    +25  normalized basename equals the app id or the folder name
    +15  normalized basename contains the app name
    +10  extension is .sh and no ELF candidate exists
    -60  basename in {chrome-sandbox, chrome_crashpad_handler, crashpad_handler,
                      uninstall*, update*, *.so, *.so.*}
    -30  depth greater than 3 from the install root
    -20  inside a directory named lib, libexec, resources, node_modules
pick the highest score; if the top two are within 10 points, ask the user
```

The wizard always shows the ranking so the user can override it. Learning from corrections is a P2 stretch goal.

### 10.2 Icon discovery

An early attempt to find an icon returned theme and extension icons from inside the application's `extensions/` directory, which looked plausible and were all wrong.

```
1.  If the archive ships a .desktop file, read its Icon= value first.
2.  Candidate names (case-insensitive): <app-id>, <exec-name>, icon, logo, app,
    appicon, code, favicon.
3.  Candidate locations: root, resources/, share/icons/hicolor/*/apps/,
    share/pixmaps/, assets/, build/.
4.  EXCLUDE paths containing: extensions/, node_modules/, themes/, test/, docs/,
    demo/, samples/, locale/, language-packs/.
5.  Prefer SVG; otherwise the largest PNG at least 128 px (read the header; do
    not decode the whole image).
6.  Prefer square images (aspect ratio between 0.9 and 1.1).
7.  If nothing is found, generate a monogram icon (first letter on a colored
    rounded square) and store it in <app>/.appdepot/icon.png.
8.  NEVER write an icon path that does not exist on disk.
```

Rule 8 alone would have prevented the placeholder-icon problem in the prototype.

### 10.3 Category suggestion

| Signal | Suggested category |
|---|---|
| Existing `.desktop` `Categories=` contains `IDE`, `TextEditor`, `Development` | `ide` |
| Executable names `flutter`, `dart`, `javac`, `gradle`, `go`, `rustc`, `cargo` | `sdk` |
| `WebBrowser` in `Categories=` | `browsers` |
| Binary names `postgres`, `mysqld`, `redis-server`, `mongod` | `databases` |
| `node`, `deno`, `bun`, `python` | `runtimes` |
| Network, VPN keywords | `network` |
| `Office`, `Viewer` | `office` |
| Otherwise | `tools` (user can change) |

### 10.4 Chromium and Electron detection

If a `chrome-sandbox` file exists beside the main executable:

1. Mark the entry `sandbox = "setuid"`.
2. Via the helper: `chown root:root chrome-sandbox && chmod 4755 chrome-sandbox`.
3. Record the change in the ledger so a move or update re-applies it.
4. Offer an advanced fallback (`--no-sandbox`) only behind a clearly worded warning.

### 10.5 Window class detection

Menu pinning and taskbar grouping depend on `StartupWMClass` matching the running window. AppDepot takes the first reasonable guess (the executable name), then offers **"Detect from running window"**: launch the app, ask the compositor (KWin scripting or `xprop` under X11) for the class, and write it back.

---

## 11. Shortcut and Launcher System

### 11.1 Generated desktop entry

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

### 11.2 Rules

1. Validate with `desktop-file-validate` before installing the file.
2. Quote `Exec=` paths and escape reserved characters according to the specification.
3. Use `TryExec=` so the entry disappears automatically if the program is removed.
4. Custom keys must begin with `X-`. `X-AppDepot-Id` links a file back to its registry entry.
5. Prefer an absolute icon path for managed apps, and an icon-theme name for linked apps that ship theme icons.
6. After writing, refresh caches: `update-desktop-database`, `gtk-update-icon-cache` when icons were added to a theme, and `kbuildsycoca6` on KDE Plasma 6 (the equivalent on older Plasma versions is `kbuildsycoca5`).
7. A `.desktop` file is never edited in place if AppDepot did not create it. Linked and adopted apps get a **user-scope override** instead.

### 11.3 Terminal commands

| Method | When | Notes |
|---|---|---|
| Symlink in `bin` | Simple binaries | Fast; breaks if the target moves, so the ledger tracks it |
| Wrapper script | Needs env vars or flags | Generated, executable, marked as managed |
| Shell alias | Never by default | Not visible to GUI sessions |

Name collisions are detected: if `node` already exists in PATH, the wizard asks whether to shadow it or choose another name.

### 11.4 Wrapper script example

```sh
#!/bin/sh
# Generated by AppDepot. Do not edit; changes are overwritten.
export ELECTRON_OZONE_PLATFORM_HINT=auto
exec "/opt/Application/ide/antigravity/antigravity-ide" "$@"
```

### 11.5 Autostart and MIME

- **Autostart:** copy or generate a `.desktop` file in `~/.config/autostart/`; remove to disable.
- **MIME:** `xdg-mime default <desktop-file> <mime-type>` plus a visible list of current associations, so the user can see what will change.

### 11.6 The "any executable" wizard

The user picks any file (binary, script, AppImage, a Windows tool run through Wine). Steps:

1. Name, icon (auto-detected or chosen), category.
2. Choose Terminal=true or false.
3. Preview the `.desktop` file.
4. Save in user or system scope.

This covers the "pick existing apps and create shortcuts" requirement without any installation logic.

---

## 12. Adopting Existing Applications

### 12.1 Scan sources

| Source | Location |
|---|---|
| System shortcuts | `/usr/share/applications/*.desktop` |
| User shortcuts | `~/.local/share/applications/*.desktop` |
| Flatpak | `/var/lib/flatpak/exports/share/applications`, `~/.local/share/flatpak/exports/share/applications` |
| Snap | `/var/lib/snapd/desktop/applications` |
| Add-on packages | Directories directly under `/opt` |
| AppImages | `~/Applications`, `~/Downloads`, `~/.local/bin` (`*.AppImage`) |
| Binaries on PATH | `$PATH` directories (optional, off by default) |

### 12.2 Ownership detection

```
dpkg -S <path>          -> "google-chrome-stable: /opt/google/chrome/chrome"
flatpak list --app      -> application ids
snap list               -> snap names
```

The result sets the mode: files owned by dpkg become **linked**; Flatpak and Snap become **adopted**; nothing owns it, so it becomes **managed** after an optional move.

### 12.3 Adoption flow

1. The scanner lists everything not yet in the registry under **Unorganized**.
2. The user drags items into categories, or clicks **Auto-organize**, which applies section 10.3.
3. For linked entries AppDepot adds a symlink under `<root>/<category>/` that points at the real folder. For adopted entries it records metadata only.
4. Optional per-entry actions: hide the original menu item, add terminal command, add to a stack.

### 12.4 Why linking rather than moving

Moving a package-managed folder breaks `dpkg`'s file records, causes errors on upgrade and removal, and invalidates AppArmor profiles and menu entries. The link gives the visual organization of Program Files without the damage.

---

## 13. Groups, Stacks and Services

### 13.1 Categories versus stacks

| Concept | Purpose | An app can belong to |
|---|---|---|
| **Category** | Where it lives and how it is listed | Exactly one |
| **Tag** | Free-form label | Many |
| **Stack** | A set operated on together | Many |

### 13.2 Operations matrix

| Operation | Category | Stack |
|---|---|---|
| Install all | n/a | Yes |
| Update all | Yes | Yes |
| Remove all | Yes (with a strong warning) | Yes |
| Launch all | n/a | Yes |
| Export | Yes | Yes |
| Doctor | Yes | Yes |
| Start or stop services | n/a | Yes |

### 13.3 Built-in stack templates

| Stack | Contents |
|---|---|
| **Flutter Mobile** | Flutter SDK, Android SDK command-line tools, Android Studio, Chrome, system libraries (`clang`, `cmake`, `ninja-build`, `libgtk-3-dev`) |
| **Node Backend** | Node LTS, Redis, PostgreSQL, a database CLI, Git |
| **Java** | OpenJDK, Gradle, Maven, an IDE |
| **Office and Media** | OnlyOffice, Okular, VLC |
| **Network** | NetBird, `curl`, `jq`, `mtr` |

Templates are ordinary manifests shipped with the app, so users can fork them.

### 13.4 Dependency ordering

Stack members may declare `requires = ["java"]`. AppDepot builds a directed graph, rejects cycles, and runs the install in topological order. Independent items run in parallel up to a configurable limit.

### 13.5 Services panel

Many developer tools are background services. Redis, PostgreSQL and MySQL run all day by default, which uses memory and resources. The panel:

- Lists systemd units tied to registry entries.
- Shows state (active, inactive, failed), memory use and the listening port.
- Provides **Start**, **Stop**, **Restart**, **Enable at boot**, **Disable at boot**.
- Shows logs from `journalctl -u <unit>` in the terminal pane.
- Supports "on-demand" profiles: services stopped at login, started with one click.

All of this goes through the privileged helper with the narrow polkit action `org.appdepot.helper.service`.

### 13.6 Data directory relocation (advanced, P2)

For PostgreSQL and MySQL, the program files stay in `/usr` (managed by apt), while the data directory is relocated into `/opt/Application/databases/<name>/`. The wizard:

1. Stops the service.
2. Copies the data with ownership and permissions preserved.
3. Updates the service configuration (`data_directory` for PostgreSQL; `datadir` for MySQL).
4. On Ubuntu, adds an AppArmor alias so MySQL may read the new path, and reloads AppArmor.
5. Starts the service and runs a health query to confirm.
6. Keeps the old directory until the user confirms success.

---

## 14. Manifest Format

### 14.1 Format choice

**TOML** for manifests and configuration: strict, comment-friendly, well supported by Rust tooling, and less ambiguous than YAML. A JSON Schema is published for editor validation.

### 14.2 Full example

```toml
schema = 1

[meta]
name        = "Flutter and Backend Workstation"
description = "Mobile and backend development on Kubuntu"
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

[[category]]
id    = "databases"
label = "Databases"
icon  = "database"

[[app]]
id        = "flutter"
name      = "Flutter SDK"
category  = "sdk"
source    = { type = "git", url = "https://github.com/flutter/flutter.git", ref = "stable" }
env       = { FLUTTER_HOME = "{{install_dir}}" }
path_add  = ["{{install_dir}}/bin"]
apt_deps  = ["clang", "cmake", "ninja-build", "pkg-config", "libgtk-3-dev"]
post_install = "flutter precache"

[[app]]
id        = "antigravity"
name      = "Antigravity"
category  = "ide"
source    = { type = "tarball", url = "https://example.com/Antigravity-IDE.tar.gz", sha256 = "<hash>" }
exec      = "antigravity-ide"
command   = "antigravity"
sandbox   = "setuid"
shortcut  = { categories = ["Development", "IDE"], wm_class = "antigravity" }

[[app]]
id       = "chrome"
name     = "Google Chrome"
category = "browsers"
source   = { type = "deb", url = "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb" }
mode     = "linked"
link     = "/opt/google/chrome"

[[app]]
id       = "redis"
name     = "Redis"
category = "databases"
source   = { type = "apt", package = "redis-server" }
mode     = "adopted"

[[service]]
id        = "redis"
unit      = "redis-server.service"
autostart = false

[[service]]
id        = "postgresql"
unit      = "postgresql.service"
autostart = false
data_dir  = "/opt/Application/databases/postgresql"

[[stack]]
id    = "flutter-mobile"
label = "Flutter Mobile"
apps  = ["flutter", "antigravity", "chrome"]

[[stack]]
id       = "backend"
label    = "Backend"
apps     = ["redis"]
services = ["redis", "postgresql"]
requires = []
```

### 14.3 Template variables

| Variable | Expands to |
|---|---|
| `{{root}}` | Install root |
| `{{install_dir}}` | The app's folder |
| `{{category_dir}}` | The category's folder |
| `{{user}}` | Current username |
| `{{home}}` | Home directory |
| `{{arch}}` | `x86_64`, `aarch64` |

### 14.4 Manifest safety

- Hooks (`post_install`, `pre_remove`) are shown in full and require confirmation unless the manifest is signed by a trusted key.
- Secrets never belong in manifests. Passwords and tokens are explicitly rejected by the validator and replaced with a "ask on install" prompt.
- Import always starts with a **diff and preview**.

---

## 15. CLI Design

The binary is `depot` (short for AppDepot). It shares 100% of its logic with the GUI through `appdepot-core`.

### 15.1 Command reference

| Command | Purpose |
|---|---|
| `depot init` | Create the root, group and permissions; first-run setup |
| `depot list [--category X] [--json]` | List entries |
| `depot info <app>` | Full details, ledger, health |
| `depot install <source>` | Install from a file, URL, apt name or manifest entry |
| `depot remove <app>` | Remove with the ledger |
| `depot update [<app>\|--all]` | Check and apply updates |
| `depot move <app> <category>` | Change category |
| `depot link <path> --category X` | Link an external folder |
| `depot adopt [--scan]` | Scan and adopt existing apps |
| `depot shortcut add <exe>` | Create a shortcut for any executable |
| `depot shortcut repair [<app>]` | Fix broken shortcuts |
| `depot stack list\|show\|install\|remove\|launch <id>` | Stack operations |
| `depot service list\|start\|stop\|enable\|disable <id>` | Service operations |
| `depot export [-o file]` | Write a manifest |
| `depot import <file> [--dry-run]` | Apply a manifest |
| `depot diff <file>` | Compare manifest and machine |
| `depot doctor [--fix]` | Health checks |
| `depot env show\|apply` | Show or regenerate environment fragments |
| `depot gui` | Launch the GUI |
| `depot completions <shell>` | Shell completions |

### 15.2 Examples

```bash
# First-time setup
depot init --root /opt/Application --group devtools

# Install a tarball into the IDE category
depot install ~/Downloads/Antigravity-IDE.tar.gz --category ide --name Antigravity

# Install a whole stack from a manifest
depot import workstation.toml --dry-run
depot import workstation.toml

# Adopt what is already installed
depot adopt --scan
depot link /opt/google/chrome --category browsers --name chrome

# Health
depot doctor
depot doctor --fix

# Scripting
depot list --json | jq '.[] | select(.category=="sdk") | .name'
```

### 15.3 Conventions

- **Exit codes:** `0` success, `1` general error, `2` usage error, `3` partial failure, `4` authorization denied, `5` user cancelled.
- **Output:** human-readable by default; `--json` for scripts; `--quiet` and `--verbose` levels.
- **Color:** respects `NO_COLOR` and TTY detection.
- **Safe defaults:** destructive commands ask for confirmation; `--yes` skips it.
- **Dry run:** `--dry-run` on every mutating command.
- **Progress:** `indicatif` bars on a TTY, structured lines otherwise.
- **Idempotent:** repeating a command never produces a different end state.

### 15.4 Error message style

Errors state what happened, why, and what to do next:

```
error: icon file does not exist
  path: /path/to/icon.png
  hint: AppDepot found 3 candidate icons; run `depot shortcut repair antigravity`
        or choose one with --icon <file>
```

---

## 16. GUI Design

### 16.1 Main window wireframe (side-by-side layout)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ☰  AppDepot        🔍 Search apps, stacks, commands…  Ctrl+K        ⚙   ◐   –  □  ✕ │
├─────────────┬──────────────────────────────────────────┬───────────────────────────┤
│ LIBRARY     │  IDEs · 3 apps                [+ Install▾]│ TERMINAL        ⊟ ⊞ ＋ ✕ │
│ ▸ All    42 │ ┌────────┐ ┌────────┐ ┌────────┐         │ besu@kubuntu:~$ depot list│
│ ▾ IDEs    3 │ │  ◉     │ │  ◉     │ │  ◉     │         │ ide  antigravity   0.9.1  │
│   SDKs    5 │ │Antigr. │ │Android │ │ VS     │         │ ide  android-studio 2024  │
│   Browsers 2│ │ ide    │ │ Studio │ │ Code   │         │ sdk  flutter       3.x    │
│   Databases 3│└────────┘ └────────┘ └────────┘         │ besu@kubuntu:~$ ▌         │
│   Runtimes 2│                                          │                           │
│   Network  1│  Antigravity                    ● Healthy │                           │
│   Office   2│  Managed · /opt/Application/ide/…         │                           │
│   Tools    4│  [Launch] [Shortcut] [Move] [Update] [⋯] │                           │
│             │                                          │                           │
│ STACKS      │  Artifacts                               │                           │
│  Flutter    │  ✓ terminal command: antigravity         │                           │
│  Backend    │  ✓ menu shortcut (system)                │                           │
│             │  ✓ sandbox helper (setuid)               │                           │
│ SERVICES    │  ✓ PATH fragment                         │                           │
│  ● redis    │                                          │                           │
│  ○ postgres │                                          │                           │
├─────────────┴──────────────────────────────────────────┴───────────────────────────┤
│ Activity: ✓ Installed Antigravity (12s)   ⟳ Updating flutter… 42%        Health 96 │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Layout modes

| Mode | Description | Use case |
|---|---|---|
| **Side-by-side** (default) | Terminal docked on the right (about 30% width) | Wide screens |
| **Bottom dock** | Terminal below the library | Narrow or tall windows |
| **Tabbed** | Library and terminal as tabs | Small laptops |
| **Focus** | Terminal only, or library only | Concentration |
| **Detached** | Terminal in its own window | Multi-monitor |

The terminal is **never more than one keystroke away**: `Ctrl+`` toggles focus, `Ctrl+Shift+T` opens a new tab.

### 16.3 Views

| View | Purpose |
|---|---|
| **Dashboard** | Health score, recent activity, updates, quick actions, disk usage per category |
| **Library** | Categories on the left, apps in the center; grid, list or compact |
| **App detail** | Metadata, launch, artifacts ledger, source, version, health, danger zone |
| **Install wizard** | Source, analysis results, preview, confirm (section 16.4) |
| **Unorganized** | Scanner results waiting to be adopted, drag-and-drop targets |
| **Stacks** | Stack cards, member list, install-all, launch-all |
| **Services** | Unit list with toggles and logs |
| **Doctor** | Findings grouped by severity, each with a preview-and-fix button |
| **Activity** | Job queue and history with logs |
| **Settings** | Root, scope, theme, terminal, updates, advanced |

### 16.4 Install wizard flow

```
 Step 1: Source          Step 2: Analysis        Step 3: Preview         Step 4: Install
 ┌────────────────┐     ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐
 │ Drop a file or │ ──▶ │ Name: Antigravity│ ──▶│ Files to create: │ ──▶│ ▓▓▓▓▓▓░░ 70%   │
 │ paste a URL    │     │ Category: ide ▾  │    │  • folder        │    │ Live commands  │
 │ [Browse…]      │     │ Launcher: ✓ found│    │  • symlink       │    │ in the docked  │
 │                │     │ Icon: ✓ found    │    │  • shortcut      │    │ terminal       │
 │                │     │ Sandbox: needs   │    │  • sandbox fix   │    │                │
 │                │     │   root (ask)     │    │ [Dry run] [Go]   │    │ [Open app]     │
 └────────────────┘     └──────────────────┘    └──────────────────┘    └────────────────┘
```

Every field on the analysis step is editable. The wizard is **never a black box**: the preview lists each change, and the terminal shows each command as it runs.

### 16.5 Interaction details

- **Drag and drop:** a file dropped anywhere on the window opens the wizard; an app dragged onto a category in the sidebar moves or adopts it.
- **Context menu (right click):** Launch, Open folder, Copy path, Create shortcut, Move to, Add to stack, Remove.
- **Multi-select:** Shift and Ctrl selection for bulk move, tag, remove, add to stack.
- **Undo toast:** after a move or remove, a 10-second "Undo" appears when reversible.
- **Empty states:** every empty view explains what to do and offers the primary action.
- **Destructive actions:** red buttons and a second confirmation that names what will be deleted.

### 16.6 Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl+K` | Command palette |
| `Ctrl+N` | Install new app |
| `Ctrl+F` | Search library |
| `` Ctrl+` `` | Focus or hide terminal |
| `Ctrl+Shift+T` | New terminal tab |
| `Ctrl+\` | Toggle side-by-side and bottom dock |
| `Ctrl+1..5` | Switch view |
| `Enter` | Launch selected app |
| `Delete` | Remove (with confirmation) |
| `F2` | Rename |
| `F5` | Rescan |
| `Ctrl+,` | Settings |

### 16.7 Accessibility

- Full keyboard navigation with visible focus rings.
- Screen reader labels for every icon-only control (Orca).
- Respect the system's reduced-motion setting.
- Minimum contrast ratio of 4.5:1 for text, 3:1 for UI components.
- Scalable UI (follows system font scale up to 200%).

---

## 17. Embedded Terminal

### 17.1 Requirements

1. A real PTY: full-color output, `vim`, `htop`, `less`, and password prompts all work.
2. Resizes correctly with the pane, and communicates size changes to the shell.
3. Copy, paste, search, clickable URLs and file paths.
4. Multiple tabs and splits.
5. Uses the user's shell (`$SHELL`) and their `.zshrc` or `.bashrc` (so Starship, autosuggestions and aliases appear).
6. GUI actions can **write commands into the terminal** so the user watches them run.
7. Themes synchronized with the UI, with Nerd Font support for prompt icons.

### 17.2 Two execution modes

| Mode | Used for | Visible to user |
|---|---|---|
| **Visible** | Installs, updates, removals, anything educational | Streams into the terminal pane |
| **Background** | Scans, health checks, icon analysis | Shown in the Activity panel only |

Visible mode runs the **same command a human would type**, so the user learns by watching. Teach mode adds a one-line explanation above each command.

### 17.3 Teach mode

```
# Teach: make the group-writable folder keep its group for new files (setgid bit)
$ sudo find /opt/Application -type d -exec chmod 2775 {} +
```

Explanations come from a bundled, translatable dictionary keyed by command pattern. The dictionary is a visible, community-editable file, which makes a good open-source contribution surface.

### 17.4 Technical design

```
 Frontend (xterm.js)                 Backend (Rust)
 ┌────────────────────┐   input    ┌──────────────────────────┐
 │ xterm.js + addons  │ ─────────▶ │ PtySession (portable-pty)│
 │  fit / search /    │            │  - spawn shell           │
 │  webgl / links     │ ◀───────── │  - read loop (async)     │
 └────────────────────┘   output   │  - resize                │
        ▲   Tauri Channel          └──────────┬───────────────┘
        │   (binary chunks)                   │
        └─────────────────────────────────────┘
```

- **Streaming:** Tauri v2 `Channel` carries raw byte chunks to the frontend; no JSON encoding of terminal data.
- **Backpressure:** the read loop pauses when the frontend's write buffer is above a threshold (xterm.js write callbacks).
- **Resize:** the `fit` addon computes rows and columns; the backend calls the PTY `resize`.
- **Programmatic commands:** the backend writes to the PTY, then optionally waits for a sentinel marker (`echo __DEPOT_DONE_$?__`) to know the exit code.
- **Safety:** commands generated by GUI actions are built from structured data, never by string concatenation of user input; arguments are quoted with a tested shell-escaping function.
- **Privileged commands:** displayed in the terminal as `pkexec appdepot-helper …`, so the user sees that elevation is involved and why.

### 17.4.1 Sentinel pattern caveat

Because user input can interleave with GUI-injected commands, GUI-driven jobs run in a **dedicated terminal tab** reserved for the job, avoiding mixing with a user's own typing.

---

## 18. Appearance and Design System

### 18.1 Principles

1. **Native feel.** Follow the desktop's color scheme, accent color and font scale.
2. **Calm density.** A developer tool: compact, information-rich, never cramped.
3. **Show the machinery.** Paths, commands and status are visible, not hidden behind friendly lies.
4. **Obvious safety.** Destructive actions look different from safe ones.
5. **Fast.** Perceived speed matters: skeletons, optimistic updates, instant search.

### 18.2 Design tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F6F7F9` | `#14161A` |
| `--surface` | `#FFFFFF` | `#1B1E24` |
| `--surface-raised` | `#FFFFFF` | `#232730` |
| `--border` | `#E1E4EA` | `#2E333D` |
| `--text` | `#1B1F27` | `#E6E8EC` |
| `--text-muted` | `#5B6472` | `#9AA3B2` |
| `--accent` | system accent (default `#3DAEE9`) | system accent |
| `--success` | `#1E9E5A` | `#3DD68C` |
| `--warning` | `#B7791F` | `#F5B54A` |
| `--danger` | `#D03B3B` | `#FF6B6B` |

The accent color is read from the desktop through the XDG Desktop Portal (`org.freedesktop.appearance`), so a KDE or GNOME user's accent carries over.

### 18.3 Typography

| Use | Font | Size |
|---|---|---|
| UI | System UI font (Noto Sans, Inter fallback) | 13-14 px |
| Headings | Same, semibold | 16 / 20 / 24 px |
| Monospace and terminal | JetBrains Mono Nerd Font (bundled fallback) | 13 px, configurable |
| Paths and commands in UI | Monospace, muted background chip | 12 px |

### 18.4 Spacing, radius and elevation

- 4 px base grid: 4, 8, 12, 16, 24, 32.
- Radius: 6 px for controls, 10 px for cards, 14 px for dialogs.
- Elevation: 1 px borders in preference to heavy shadows; one soft shadow for floating layers only.

### 18.5 Iconography

- **Lucide** icon set for the interface (consistent stroke, permissive license).
- Application icons are rendered at 48 px in the grid and 20 px in lists, with a rounded-square mask so monogram fallbacks look intentional.
- Category icons are user-selectable.

### 18.6 Core components

| Component | Notes |
|---|---|
| App card | Icon, name, category chip, mode badge (Managed, Linked, Adopted), health dot |
| Status pill | Healthy, Needs attention, Broken, Updating |
| Path chip | Monospace with a copy button and "open in Dolphin" |
| Diff preview | Added, changed and removed artifacts with colors and icons |
| Job row | Title, progress, elapsed time, expandable logs |
| Wizard stepper | Four fixed steps with back and forward navigation |
| Command palette | Fuzzy search over actions, apps and settings |
| Toast | With undo for reversible operations |
| Empty state | Illustration-free, short text and one primary button |

### 18.7 Terminal themes

Bundled: **Catppuccin Mocha**, **Tokyo Night**, **Dracula**, **Nord**, **Solarized Dark**, **Solarized Light**, **GitHub Light**. The default follows the UI theme; users may override.

### 18.8 Motion

- 120-180 ms ease-out transitions.
- Progress uses determinate bars where possible, indeterminate otherwise.
- All motion is disabled when the system requests reduced motion.

### 18.9 Window chrome

Use native server-side decorations on KDE and GNOME-with-extensions for consistency; fall back to client-side decorations on Wayland compositors that require them.

---

## 19. Privilege and Security Model

### 19.1 Threat model

| Threat | Example | Mitigation |
|---|---|---|
| Malicious archive | Zip-slip, symlink escape, decompression bomb | Safe extractor (section 9.3), size limits |
| Tampered download | Man-in-the-middle, compromised mirror | HTTPS only, checksum and signature verification |
| Malicious manifest | A shared `.toml` with a hostile hook | Hooks displayed and confirmed; signed manifests optional |
| Privilege escalation | GUI bug leads to arbitrary root commands | Helper accepts a **fixed set of typed operations**, not shell strings |
| Local attacker | Another user modifies shared tree | Strict modes, group controls, root-owned helper binary |
| Supply-chain attack | Malicious dependency | `cargo-deny`, `cargo-audit`, lockfiles, reviewed updates, SBOM |
| Social engineering | "Install this stack" link | Custom URL scheme (if added) always shows the full preview and requires manual confirmation |
| Data loss | Over-broad delete | Ledger-based removal only deletes recorded paths inside the root |

### 19.2 Never run the GUI as root

The GUI and CLI run as the normal user. Operations that need elevation are delegated to **`appdepot-helper`**:

```
 GUI / CLI (user)  ──(typed request)──▶  pkexec ──▶ appdepot-helper (root)
                                           │              │
                                    polkit decision       ├─ install_tree
                                    (password prompt)     ├─ set_sandbox
                                                          ├─ write_shortcut
                                                          ├─ write_env_fragment
                                                          ├─ manage_service
                                                          └─ fix_permissions
```

### 19.3 Helper design rules

1. **Typed operations only.** The helper takes a small JSON request on stdin (for example `{"op": "set_sandbox", "path": "…"}`), never a shell command line.
2. **Validate everything.** Canonicalize paths, reject anything outside the allowed roots, reject symlink components that escape.
3. **Least privilege.** Each operation does the minimum; the helper drops capabilities it does not need.
4. **No network.** The helper never downloads anything; the unprivileged side fetches and verifies, then hands over a verified staging directory.
5. **Audit log.** Every privileged operation appends to a root-owned log with timestamp, user, operation and result.
6. **Stable path.** polkit binds an action to an absolute executable path, so the helper is installed to `/usr/libexec/appdepot/appdepot-helper` by the `.deb` (or by a one-time "install helper" step for the AppImage).

### 19.4 polkit action sketch

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE policyconfig PUBLIC "-//freedesktop//DTD PolicyKit Policy Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/PolicyKit/1/policyconfig.dtd">
<policyconfig>
  <vendor>AppDepot</vendor>
  <action id="org.appdepot.helper.install">
    <description>Install applications into the AppDepot root</description>
    <message>Authentication is required to install applications system-wide</message>
    <defaults>
      <allow_any>auth_admin</allow_any>
      <allow_inactive>auth_admin</allow_inactive>
      <allow_active>auth_admin_keep</allow_active>
    </defaults>
    <annotate key="org.freedesktop.policykit.exec.path">/usr/libexec/appdepot/appdepot-helper</annotate>
  </action>
</policyconfig>
```

Separate actions (`install`, `service`, `permissions`) let administrators tune what needs a password.

### 19.5 Download trust

| Level | Meaning | UI |
|---|---|---|
| Verified | Checksum or signature matched a published value | Green shield |
| Hash recorded | Checksum computed but not compared to a publisher value | Neutral |
| Unverified | No integrity information | Yellow warning and explicit confirmation |

### 19.6 Privacy

- **No telemetry by default.** If anonymous crash reporting is ever added, it is opt-in, documented and inspectable.
- The registry and logs are local. Manifests exclude secrets.
- Update checks contact only the sources the user configured.

---

## 20. Architecture

### 20.1 Layered overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Presentation                                                                 │
│  ┌───────────────────────────┐        ┌──────────────────────────────┐       │
│  │ GUI (Tauri webview)       │        │ CLI (`depot`)  / TUI (later) │       │
│  │ React + TypeScript        │        │ clap + ratatui               │       │
│  └──────────────┬────────────┘        └──────────────┬───────────────┘       │
├─────────────────┼────────────────────────────────────┼───────────────────────┤
│ Application     │     appdepot-core (Rust library)   │                       │
│  ┌──────────────▼────────────────────────────────────▼───────────────────┐   │
│  │ Commands · Job queue · Event bus · Transaction manager · Policy       │   │
│  ├───────────────────────────────────────────────────────────────────────┤   │
│  │ Installer pipeline │ Analyzer │ Shortcuts │ Env │ Doctor │ Manifest   │   │
│  ├───────────────────────────────────────────────────────────────────────┤   │
│  │ Source adapters: tarball · zip · deb · appimage · git · apt · flatpak │   │
│  │ Backends: apt · dnf · pacman · systemd (zbus)                         │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Infrastructure                                                               │
│  Registry (SQLite) · Filesystem abstraction · HTTP client · PTY manager      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Privileged                                                                   │
│  appdepot-helper (root, via polkit)                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 20.2 Process model

| Process | Privilege | Role |
|---|---|---|
| `appdepot` (GUI) | User | Window, webview, PTY, job orchestration |
| `depot` (CLI) | User | Same core, no GUI |
| `appdepot-helper` | Root (on demand) | Narrow privileged operations |
| Shell child processes | User | The embedded terminal |

### 20.3 Key design decisions

1. **Core as a library.** The GUI and CLI are thin; all behavior is testable without a window.
2. **Filesystem abstraction.** All file access goes through a trait with a real implementation and an in-memory one for tests.
3. **Jobs, not calls.** Long operations are jobs with progress events, cancellation and logs.
4. **Plan, then apply.** Every mutating operation first produces a **plan** (a list of typed actions), which powers dry runs, previews and tests; the apply step executes the plan transactionally.
5. **Ledger-first.** An artifact is recorded as it is created, so a crash leaves enough information to recover.
6. **Events over polling.** The core emits typed events; the GUI subscribes.

### 20.4 Plan and apply

```rust
pub enum Action {
    CreateDir   { path: PathBuf, owner: Owner, mode: u32 },
    ExtractTo   { archive: PathBuf, dest: PathBuf, strip: StripMode },
    Symlink     { target: PathBuf, link: PathBuf },
    WriteFile   { path: PathBuf, contents: Vec<u8>, mode: u32 },
    SetSandbox  { path: PathBuf },
    EnvFragment { app_id: String, shell: Shell, body: String },
    Service     { unit: String, op: ServiceOp },
    Register    { entry: Entry },
}

pub struct Plan { pub actions: Vec<Action>, pub needs_privilege: bool }

pub trait Executor {
    fn apply(&self, plan: &Plan, ctx: &mut JobCtx) -> Result<Receipt>;
    fn rollback(&self, receipt: &Receipt) -> Result<()>;
}
```

### 20.5 Extension traits

```rust
pub trait SourceAdapter {
    fn id(&self) -> &'static str;
    fn can_handle(&self, spec: &SourceSpec) -> bool;
    fn fetch(&self, spec: &SourceSpec, ctx: &mut JobCtx) -> Result<Fetched>;
    fn unpack(&self, f: &Fetched, dest: &Path, ctx: &mut JobCtx) -> Result<Unpacked>;
}

pub trait PackageBackend {
    fn name(&self) -> &'static str;
    fn is_installed(&self, pkg: &str) -> Result<bool>;
    fn install(&self, pkgs: &[&str], ctx: &mut JobCtx) -> Result<()>;
    fn remove(&self, pkgs: &[&str], ctx: &mut JobCtx) -> Result<()>;
    fn owner_of(&self, path: &Path) -> Result<Option<String>>;
    fn files_of(&self, pkg: &str) -> Result<Vec<PathBuf>>;
}
```

### 20.6 Error handling

- Library crates use `thiserror` with typed, user-explainable errors (each carries a *hint*).
- Binaries use `anyhow` only at the outermost layer.
- Every error has a stable code (`E_ICON_MISSING`, `E_PERM_GROUP`) that is documented.
- Failures are shown with cause chains in the Activity panel and a short summary in a toast.

### 20.7 IPC between frontend and backend

- **Commands** (request and response): `list_apps`, `plan_install`, `apply_plan`, `run_doctor`.
- **Events** (backend to frontend): `job:progress`, `job:log`, `registry:changed`, `fs:changed`.
- **Channels** (streams): terminal output bytes.
- All payloads are typed with shared definitions generated from Rust to TypeScript (`specta` or `ts-rs`), so a schema mismatch becomes a compile error.

### 20.8 Concurrency

- `tokio` runtime for downloads and process I/O.
- A job scheduler limits parallel installs (default 2) and serializes operations that touch the same entry.
- File-system watchers (`notify`) keep the library in sync with changes made outside the app.

---

## 21. Data Model

### 21.1 Registry schema (SQLite)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE category (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE app (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category_id  TEXT REFERENCES category(id) ON DELETE SET NULL,
  mode         TEXT NOT NULL CHECK (mode IN ('managed','linked','adopted')),
  version      TEXT,
  install_path TEXT,
  exec_path    TEXT,
  icon_path    TEXT,
  source_type  TEXT NOT NULL,
  source_ref   TEXT,
  checksum     TEXT,
  trust_level  TEXT NOT NULL DEFAULT 'unverified',
  pinned       INTEGER NOT NULL DEFAULT 0,
  installed_at TEXT NOT NULL,
  updated_at   TEXT
);

CREATE TABLE artifact (
  id           INTEGER PRIMARY KEY,
  app_id       TEXT NOT NULL REFERENCES app(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN
                 ('dir','symlink','desktop_entry','env_fragment',
                  'wrapper','service_override','mime','sandbox_fix')),
  path         TEXT NOT NULL,
  content_hash TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE tag (
  app_id TEXT NOT NULL REFERENCES app(id) ON DELETE CASCADE,
  tag    TEXT NOT NULL,
  PRIMARY KEY (app_id, tag)
);

CREATE TABLE stack (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE stack_member (
  stack_id TEXT NOT NULL REFERENCES stack(id) ON DELETE CASCADE,
  app_id   TEXT NOT NULL REFERENCES app(id)   ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (stack_id, app_id)
);

CREATE TABLE service (
  id        TEXT PRIMARY KEY,
  app_id    TEXT REFERENCES app(id) ON DELETE SET NULL,
  unit      TEXT NOT NULL,
  autostart INTEGER NOT NULL DEFAULT 0,
  data_dir  TEXT
);

CREATE TABLE job (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,
  target      TEXT,
  state       TEXT NOT NULL CHECK (state IN
                ('queued','running','succeeded','failed','cancelled')),
  started_at  TEXT,
  finished_at TEXT,
  error_code  TEXT
);

CREATE TABLE job_log (
  id      INTEGER PRIMARY KEY,
  job_id  INTEGER NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  ts      TEXT NOT NULL,
  level   TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE schema_version (version INTEGER NOT NULL);
```

### 21.2 Rules

- The ledger (`artifact` table) is the **only** source for uninstall decisions.
- Every registry write that corresponds to filesystem changes happens inside a transaction opened *after* the filesystem step succeeds and closed *before* the final cache refresh.
- A "rebuild registry from disk" command scans `X-AppDepot-Id` desktop entries and ledger snapshots as a recovery path.
- Migrations are versioned, forward-only, and tested against fixtures from every released version.

---

## 22. Technology Stack

### 22.1 Recommended stack

| Layer | Choice | Why |
|---|---|---|
| **Core language** | **Rust** | Memory safety for archive and privilege code, single static-ish binaries, excellent filesystem and process APIs, strong portfolio signal |
| **GUI shell** | **Tauri v2** | Small native bundle, Rust backend, system webview, built-in packaging for AppImage, `.deb` and `.rpm` |
| **Frontend** | **React + TypeScript + Vite** | Familiar to a Node developer; large ecosystem; fast iteration |
| **Styling** | **Tailwind CSS + Radix UI primitives** | Accessible, unstyled primitives with consistent tokens |
| **State** | **Zustand** and **TanStack Query** | Small and predictable; Query for backend data caching |
| **Terminal** | **xterm.js** with fit, search, web-links, webgl addons | The de facto web terminal, used by VS Code |
| **PTY** | **`portable-pty`** crate | Mature PTY abstraction extracted from WezTerm |
| **CLI** | **`clap`** v4 with derive macros | Standard; generates completions and man pages |
| **TUI (later)** | **`ratatui`** | Mature Rust TUI library |
| **Registry** | **SQLite** via `rusqlite` (bundled) | Zero-config, transactional, inspectable |
| **Async** | **`tokio`** | Standard runtime |
| **HTTP** | **`reqwest`** with `rustls` | No OpenSSL dependency issues |
| **Archives** | `tar`, `flate2`, `xz2`, `zstd`, `zip` | Safe wrapper layer written on top |
| **Binary inspection** | `object` or `goblin` | Detect ELF and architecture without spawning `file` |
| **Desktop entries** | `freedesktop-desktop-entry` plus custom validation | Parse and write `.desktop` files |
| **System bus** | `zbus` | systemd and portal access from pure Rust |
| **Hashing** | `sha2` | Checksums |
| **Config** | `serde`, `toml`, `directories` | XDG-aware paths |
| **Logging** | `tracing` and `tracing-subscriber` | Structured, filterable logs |
| **Type sharing** | `specta` or `ts-rs` | Generate TypeScript types from Rust |
| **Testing (Rust)** | `cargo-nextest`, `assert_fs`, `tempfile`, `insta`, `proptest` | Fast, snapshot and property tests |
| **Testing (UI)** | Vitest, Testing Library, Playwright | Component and end-to-end |
| **CI** | GitHub Actions | Free for public repositories |
| **Supply chain** | `cargo-deny`, `cargo-audit` | License and vulnerability checks |
| **Packaging** | Tauri bundler, `cargo-deb`, AppImage | Multiple distribution formats |
| **Docs** | mdBook plus a VitePress or Astro landing page | Searchable documentation |

### 22.2 Why Rust and Tauri (summary of the decision)

1. **The hard part of this product is systems work**: archives, permissions, privileged helpers, PTYs, D-Bus. Rust makes those safer and faster.
2. **One language for the core, CLI, helper and GUI backend** means the CLI and GUI can never disagree.
3. **Small footprint.** A Tauri app is typically tens of megabytes, far lighter than Electron, which fits the "lightweight" preference that already shaped the database-manager choice.
4. **The frontend skill is reused.** React and TypeScript knowledge from Node work applies directly.
5. **Portfolio value.** A Rust systems project with a real security model stands out more than another CRUD app.

### 22.3 Honest trade-offs

| Concern | Reality | Mitigation |
|---|---|---|
| Rust learning curve | Steep for the first 4-6 weeks | Start with the CLI core, where the borrow checker teaches without UI distraction; see the learning plan |
| WebKitGTK quirks | Rendering and Wayland issues appear on some GPU and driver combinations | Test on X11 and Wayland, document env-var workarounds, keep the UI simple |
| Webview dependency | Needs `libwebkit2gtk-4.1` on the system | The `.deb` declares it; AppImage bundles it |
| Terminal in a webview | Not as fast as a native terminal | WebGL renderer; the target use is install logs and light shell work, not heavy terminal workloads |

### 22.4 Rust learning plan for a developer with ~1.5 years of experience

| Weeks | Focus | Resources |
|---|---|---|
| 1-2 | Ownership, borrowing, enums, `Result` | *The Rust Programming Language* book, Rustlings |
| 3 | Modules, traits, error handling with `thiserror` | Book chapters 7-10, 17 |
| 4 | Build a tiny CLI: list files, parse a `.desktop` file | *Command Line Applications in Rust* |
| 5 | Async and `tokio` basics; download a file with progress | Tokio tutorial |
| 6 | Port the v0 `add-app` Bash script to Rust | This project's Phase 1 |

---

## 23. Alternatives Considered

### 23.1 Comparison matrix

Scores from 1 (poor) to 5 (excellent), judged for **this** project and **this** developer.

| Option | Native feel | Size and speed | Embedded terminal | Privileged and system work | Learning curve for the author | Portfolio signal | Total |
|---|---|---|---|---|---|---|---|
| **Rust + Tauri + React** | 3 | 5 | 4 | 5 | 2 | 5 | **24** |
| **Flutter desktop (Dart)** | 3 | 3 | 3 | 3 | **5** | 3 | 20 |
| **Qt 6 / QML + Rust (cxx-qt)** | 5 | 4 | 4 | 4 | 1 | 4 | 22 |
| **GTK4 + libadwaita (Rust)** | 4 | 5 | 4 (VTE) | 5 | 1 | 4 | 23 |
| **Electron + Node** | 2 | 1 | 4 | 3 | 5 | 2 | 17 |
| **Go + Wails** | 3 | 4 | 3 | 4 | 3 | 4 | 21 |
| **Python + PySide6** | 4 | 3 | 3 | 3 | 4 | 2 | 19 |
| **Kotlin Compose Desktop** | 3 | 2 | 3 | 3 | 3 | 3 | 17 |

The scores are judgments, not measurements. The point is to make the trade-offs explicit and revisable.

### 23.2 Plan B: Flutter

Flutter is the strongest fallback because the author already works with it.

| Aspect | Detail |
|---|---|
| UI | Flutter Linux desktop (GTK embedding) |
| Terminal | `xterm` Dart package with `flutter_pty` |
| System work | `dart:io` `Process`, plus a small Rust or Go helper for privileged operations |
| Packaging | `flutter build linux`, then package with `fpm` or a custom `.deb` step |
| Advantage | Fastest path to a working GUI; the familiar language |
| Disadvantage | System-level code (archives, safe extraction, D-Bus) is less ergonomic; fewer portfolio points for systems depth |

### 23.3 Plan C: Native KDE (Qt / Kirigami)

The best choice if the target audience were KDE users only, since it would match Plasma perfectly (including Konsole's KPart for an embedded real terminal). It was not chosen as the main path because the C++ or `cxx-qt` learning curve is the steepest, and the product should serve non-KDE users as well.

### 23.4 Tripwires: when to switch plans

- **After Phase 3**, if the Rust core is still not producing working installs, move the *core* behavior into a simpler language and keep the plan.
- If WebKitGTK rendering problems affect more than a small set of tested machines, evaluate GTK4 or Qt for the front end while keeping `appdepot-core` unchanged. This is why the core is a separate library.

---

## 24. Packaging and Distribution

### 24.1 The "single executable like Windows" expectation

| Format | Experience | Strengths | Limits |
|---|---|---|---|
| **`.deb`** | Double-click opens the software center or `sudo apt install ./appdepot.deb` | Installs the helper and polkit policy correctly; integrates with apt upgrades | Debian and Ubuntu families only |
| **AppImage** | Download, make executable, double-click | Truly one file; works across distributions | Helper must be installed separately because polkit needs a stable path |
| **`.rpm`** | Fedora and openSUSE family | Native for those distros | Needs separate CI job and testing |
| **Flatpak** | Software center install | Sandboxed and widely available | **Poor fit**: the sandbox blocks managing `/opt`, other apps and system services. Could be offered later in a limited mode |
| **Install script** | `curl … \| sh` | Convenient | Must be checksum-pinned and printed before running |
| **APT repository** | `apt install appdepot` after adding a source | Automatic updates | Requires hosting and signing infrastructure |

**Primary: `.deb`. Secondary: AppImage.**

### 24.2 First-run experience (AppImage case)

1. The user double-clicks the AppImage.
2. AppDepot detects that the privileged helper is missing and shows a short explanation.
3. One authorization prompt installs the helper and polkit policy to `/usr/libexec/appdepot/` and `/usr/share/polkit-1/actions/`.
4. A second step creates the install root, group and permissions (`depot init`), with a plain explanation that a log-out and log-in is needed for group membership.
5. The app offers to scan for existing applications.

### 24.3 Release pipeline

```
 git tag v1.0.0
      │
      ▼
 GitHub Actions (matrix: Ubuntu 22.04, Ubuntu 24.04)
   ├─ cargo fmt --check, clippy -D warnings
   ├─ cargo nextest, frontend tests
   ├─ cargo deny check, cargo audit
   ├─ tauri build  → .deb, .AppImage, .rpm
   ├─ generate SHA256SUMS, sign with minisign
   ├─ build SBOM
   └─ publish GitHub Release + update APT repository
```

### 24.4 Building on the oldest supported OS

Build on the **oldest** supported Ubuntu LTS so that the binary links against an older glibc and runs on newer systems. Test on newer ones. The reverse does not work.

### 24.5 Self-update

- **`.deb` or APT installs:** updates come from the repository.
- **AppImage:** use AppImageUpdate with embedded update information and signature checking.
- All update checks are opt-in or clearly disclosed.

### 24.6 Versioning and channels

Semantic versioning. Channels: **stable**, **beta**, **nightly**. Manifest `schema` numbers are versioned independently, with automatic migration and clear errors for newer schemas.

---

## 25. Testing Strategy

### 25.1 Pyramid

| Layer | Tools | Examples |
|---|---|---|
| **Unit** | `cargo nextest`, `proptest` | Executable scoring, icon ranking, path sanitization, manifest parsing |
| **Golden / snapshot** | `insta` | Generated `.desktop` files, environment fragments, plan output |
| **Integration** | `assert_fs`, `tempfile`, in-memory filesystem trait | Full install, upgrade, remove, and rollback on a fake root |
| **Container matrix** | Podman or Docker with Ubuntu 22.04, 24.04, Debian 12, Fedora | `depot init`, `.deb` handling, apt backend, doctor |
| **Privilege tests** | Rootless namespaces plus a test polkit setup | Helper input validation and path escapes |
| **UI component** | Vitest and Testing Library | Wizard steps, app card states |
| **End-to-end GUI** | Playwright with `tauri-driver` | Drag-and-drop install, terminal visible, doctor fix |
| **Security** | Fuzzing with `cargo-fuzz` on the extractor; malicious-archive corpus | Zip-slip, symlink loops, bombs |
| **Manual QA** | Checklist per release | KDE Plasma (X11 and Wayland), GNOME, XFCE |

### 25.2 Fixture library

A small set of generated archives that cover real-world messiness:

- `electron-like.tar.gz`: main binary, `bin/` copy, `chrome-sandbox`, crashpad handler, and an `extensions/` folder full of misleading icons (modeled on the real case).
- `sdk-like.tar.xz`: nested single root, executables in `bin/`, no desktop file.
- `multi-root.zip`: several top-level folders.
- `evil-slip.tar`: contains `../../etc/passwd` style paths.
- `evil-symlink.tar`: symlink escaping the destination.
- `bomb.zip`: tiny compressed, enormous uncompressed.
- `appimage-stub`: minimal AppImage structure.

### 25.3 Doctor tests

Each doctor check has a **broken fixture** and a **fixed fixture**. The test builds the broken state, runs the check, applies the fix, and asserts the check passes. The prototype's placeholder-icon bug is the first fixture.

### 25.4 Quality gates in CI

- Formatting (`rustfmt`, Prettier) and linting (`clippy -D warnings`, ESLint).
- Coverage reporting with a target above 80% for `appdepot-core`.
- Dependency audits.
- A binary-size budget and a startup-time budget checked on every release build.

---

## 26. Roadmap

Assumes about 8-10 focused hours per week. Adjust the dates, not the order.

### Phase 0: Foundations (week 1)

- Create the repository, license (MIT or Apache-2.0), contribution guide and code of conduct.
- Set up the Rust workspace, CI, formatting and lint gates.
- Write the first three Architecture Decision Records (language, GUI toolkit, privilege model).
- **Deliverable:** green CI on an empty workspace with a documented structure.

### Phase 1: Core and CLI MVP (weeks 2-5)

- Port `add-app` to Rust as the shortcut module, with validation.
- Implement tarball and zip install with safe extraction.
- Implement executable and icon heuristics with tests from the fixture library.
- Implement `depot init`, `install`, `list`, `info`, `remove`, `doctor`.
- **Acceptance:** installing the Electron-like fixture produces a working shortcut and command, `remove` leaves nothing behind, `doctor` catches a placeholder icon.

### Phase 2: Registry, adoption and manifests (weeks 6-8)

- SQLite registry and ledger.
- `.deb` and apt-package support (*linked* mode).
- `depot adopt --scan`, `depot link`.
- Manifest export, import, diff.
- **Acceptance:** a manifest exported on one VM restores on a clean VM with a single command.

### Phase 3: GUI shell (weeks 9-12)

- Tauri shell, theming, library views, app detail, activity panel.
- Install wizard with plan preview and drag-and-drop.
- Unorganized view with drag-to-adopt.
- **Acceptance:** every Phase 1 and 2 capability is usable without the CLI.

### Phase 4: Embedded terminal (weeks 13-14)

- PTY backend, xterm.js integration, tabs, layout modes.
- Visible-mode jobs run in a dedicated terminal tab.
- Teach mode with an initial command dictionary.
- **Acceptance:** side-by-side layout works on X11 and Wayland; installing shows live commands.

### Phase 5: Privilege, services, stacks (weeks 15-18)

- `appdepot-helper`, polkit policy, typed operations, audit log.
- Services panel (systemd through `zbus`).
- Stacks, dependency ordering, built-in templates.
- **Acceptance:** the GUI never runs as root; every privileged action is a typed helper operation and is logged.

### Phase 6: Polish and 1.0 (weeks 19-22)

- Accessibility pass, keyboard navigation, command palette.
- Packaging: `.deb`, AppImage, signed releases, APT repository.
- Documentation site, demo video, README with GIFs.
- Security review: fuzzing, dependency audit, helper threat-model review.
- **Acceptance:** a stranger can install from the website and organize a machine without help.

### Phase 7+: After 1.0

- dnf and pacman backends; `.rpm` and Arch packages.
- TUI mode for SSH sessions.
- Update checking, version pinning, version switching for runtimes.
- Community manifest index; signed manifests.
- Settings backup and restore; Timeshift integration.
- Localization.

### Definition of done for any feature

1. Behavior documented in the user guide.
2. Unit and integration tests, including a failure-path test.
3. Dry-run and rollback behavior verified.
4. CLI and GUI both support it (or the exception is recorded).
5. Accessibility and keyboard path checked for GUI work.
6. Changelog entry written.

---

## 27. Repository Structure

```
appdepot/
├── Cargo.toml                    # workspace
├── rust-toolchain.toml           # pinned toolchain
├── deny.toml                     # cargo-deny policy
├── LICENSE
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md                   # how to report vulnerabilities
├── crates/
│   ├── appdepot-core/            # library: pipeline, analyzer, registry, doctor
│   │   ├── src/
│   │   │   ├── plan/             # Action, Plan, Executor
│   │   │   ├── sources/          # tarball, zip, deb, appimage, git, apt
│   │   │   ├── analyze/          # exec scoring, icon ranking, categories
│   │   │   ├── shortcut/         # desktop entry, wrapper, mime, autostart
│   │   │   ├── env/              # fragments for bash, zsh, fish
│   │   │   ├── registry/         # sqlite, migrations, ledger
│   │   │   ├── manifest/         # parse, validate, diff
│   │   │   ├── doctor/           # checks and fixes
│   │   │   ├── services/         # systemd via zbus
│   │   │   └── fsx/              # filesystem trait and test double
│   │   └── tests/
│   ├── appdepot-cli/             # `depot` binary (clap)
│   ├── appdepot-helper/          # privileged helper, typed operations
│   ├── appdepot-pty/             # PTY session manager
│   └── appdepot-types/           # shared types exported to TypeScript
├── apps/
│   └── gui/
│       ├── src-tauri/            # Tauri Rust backend
│       └── src/                  # React + TypeScript frontend
│           ├── components/
│           ├── views/
│           ├── state/
│           ├── terminal/
│           └── styles/
├── packaging/
│   ├── deb/                      # control, postinst, polkit policy
│   ├── appimage/
│   ├── rpm/
│   └── polkit/org.appdepot.policy
├── fixtures/                     # generated test archives
├── manifests/                    # built-in stack templates
├── docs/
│   ├── adr/                      # architecture decision records
│   ├── history/add-app.sh        # the v0 prototype
│   ├── guide/                    # mdBook user guide
│   └── design/                   # wireframes, tokens
└── .github/
    ├── workflows/                # ci.yml, release.yml, audit.yml
    └── ISSUE_TEMPLATE/
```

### 27.1 Engineering conventions

- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`), which also drives the changelog.
- **Branching:** trunk-based with short-lived feature branches and required CI.
- **Reviews:** self-review checklists, then PR templates (security impact, tests, docs).
- **ADRs:** every significant decision gets a short record (context, decision, consequences).
- **Issue tracking:** GitHub Projects board with milestones that mirror the roadmap phases.

---

## 28. Naming and Branding

### 28.1 Candidates

| Name | Idea | Note |
|---|---|---|
| **AppDepot** | A depot where applications are stored and organized | Clear; check for existing trademarks |
| **Optic** | A play on `/opt` | Short and memorable; likely crowded namespace |
| **Shelf** | Applications neatly arranged on shelves | Friendly; very generic |
| **Dockyard** | A place where things are assembled and launched | Evokes containers; may cause confusion |
| **Hangar** | Where machines are kept ready to launch | Visual and distinctive |
| **Programs** | Windows-friendly meaning | Too generic for search |

Before choosing, search GitHub, crates.io, npm, and domain registrars, and check trademark databases.

### 28.2 Visual identity (starter)

- Logo concept: a simple stack of rounded squares forming a shelf or tree.
- Primary color: a calm blue near `#3DAEE9`, with a warm secondary accent for warnings.
- Voice: friendly, precise, never condescending. Error messages explain, they do not blame.
- CLI name: short (`depot`), with the long name used in packages and the window title.

---

## 29. Portfolio Strategy

### 29.1 What the project demonstrates

| Skill | Evidence in the project |
|---|---|
| **Systems programming** | Safe archive handling, filesystem abstraction, transactional installs, PTYs |
| **Security engineering** | Privilege separation, polkit, threat model, fuzzing, supply-chain checks |
| **Product thinking** | A real problem from first-hand experience, personas, prioritized roadmap |
| **Full-stack engineering** | Rust backend, TypeScript frontend, typed IPC |
| **UX and accessibility** | Design tokens, keyboard navigation, reduced motion, screen readers |
| **Operations and release engineering** | CI matrix, signed releases, packaging in three formats, APT repository |
| **Testing discipline** | Fixture library, golden tests, container matrix, property tests |
| **Communication** | ADRs, user guide, demo video, blog series |

### 29.2 Repository presentation checklist

- A README with a one-sentence pitch, an animated demo (GIF or short video), a feature list, install instructions, and a link to the docs.
- Badges for CI, license, latest release and test coverage.
- An architecture diagram (the layered view from section 20) and a security-model diagram (section 19).
- Screenshots in light and dark themes, in side-by-side and bottom-dock layouts.
- A `docs/history/` page telling the origin story: the Bash script and the real problems it surfaced.
- Tagged releases with release notes and checksums.

### 29.3 Demo script (90 seconds)

1. Start with a fresh Kubuntu VM and a messy Downloads folder.
2. Open AppDepot; the scan finds Chrome and OnlyOffice under **Unorganized**; drag them into categories.
3. Drop an Electron tarball on the window; the wizard finds the launcher and the icon and fixes the sandbox.
4. Show the terminal beside the GUI running the real commands.
5. Click **Install stack: Flutter Mobile**; watch the group install.
6. Run **Doctor**; show a deliberately broken shortcut and fix it with one click.
7. Export a manifest; restore it on a second VM.

### 29.4 Blog and talk ideas

1. "I set up Linux like it was Windows, and here's what broke."
2. "Writing a safe tar extractor: zip-slip, symlinks and bombs."
3. "Why I never run my GUI as root: polkit helpers in Rust."
4. "Embedding a real terminal in a Tauri app with xterm.js and portable-pty."
5. "Heuristics for finding the right executable and icon in a random tarball."

### 29.5 Interview talking points

- Why *plan then apply* makes dry runs, previews and tests the same code path.
- How the ledger enables a reliable uninstall without trusting the filesystem.
- The decision to link rather than move package-managed files.
- Threat-modeling a privileged helper and keeping its interface typed.
- Trade-offs between Tauri, Flutter and Qt, and the tripwires that would change the decision.

### 29.6 Community and growth

- Label starter issues (`good first issue`): more teach-mode explanations, more category rules, translations, new stack templates.
- Publish a short **"How to write a source adapter"** guide to invite backend contributions.
- Post the project in relevant communities with the origin story rather than a feature list.
- Track a few honest metrics: install success rate in the test matrix, startup time, binary size, open issues closed.

---

## 30. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Scope creep (an app store, a package manager, a configuration manager) | High | High | Hold to the non-goals; phase gates; ship the CLI core first |
| 2 | Rust learning curve slows progress | Medium | Medium | Staged learning plan; Plan B (Flutter UI over the same ideas); pair with the CLI first |
| 3 | WebKitGTK rendering issues on some hardware | Medium | Medium | Test matrix, documented workarounds, core decoupled from UI |
| 4 | Privileged helper vulnerability | Low | Very high | Typed operations, fuzzing, minimal code, external review before 1.0 |
| 5 | Heuristics choose the wrong executable or icon | High | Low | Preview step always shows candidates; user can override; learn from corrections later |
| 6 | Breaking package-managed software | Low | High | Never move files owned by dpkg; *linked* and *adopted* modes only touch metadata |
| 7 | AppArmor and SELinux blocking relocated data directories | Medium | Medium | Detect and handle AppArmor on Ubuntu; clear messages; keep the old data until verified |
| 8 | Desktop environment differences (KDE, GNOME, XFCE) | Medium | Medium | Rely on XDG specifications; test on three environments |
| 9 | Immutable or read-only `/opt` systems | Low | Low | Detect and fall back to user scope; document as unsupported for system scope |
| 10 | Naming or trademark conflicts | Medium | Low | Check early; keep the name cheap to change |
| 11 | Abandoned projects look bad on a portfolio | Medium | Medium | Small releases, visible roadmap, an honest "status" section in the README |
| 12 | Users paste untrusted manifests | Medium | High | Preview and diff, hook confirmation, optional signature checking |

---

## 31. Appendices

### Appendix A: User stories (from the real setup session)

1. As a Windows migrant, I want a single place that works like Program Files so that my machine feels organized from day one.
2. As a developer, I want to drop a downloaded tarball onto a window and have it appear in my menu with the right icon.
3. As a developer, I want the tool to refuse a non-existent icon path instead of silently writing it.
4. As a user, I want Chromium-based apps to start without me learning about setuid sandbox helpers.
5. As a user, I want my Chrome installed by `.deb` to appear in my organized tree without breaking its updates.
6. As a user, I want to see which of my installed apps are not yet organized, and drag them into groups.
7. As a user, I want to create a shortcut for any program, even one that is not installed through the tool.
8. As a developer, I want to install the whole Flutter toolchain (SDK, system libraries, IDE) as one group.
9. As a developer, I want Redis, PostgreSQL and MySQL to be stopped by default and started with one click.
10. As a developer, I want to relocate a database's data directory into my organized tree without breaking AppArmor.
11. As a user, I want to see the exact commands run on my behalf, in a terminal next to the interface.
12. As a learner, I want each command explained in plain language.
13. As a user, I want PATH and environment variables set in one consistent place, per app, removable cleanly.
14. As a user, I want to know that my group membership change needs a log-out, and be told so clearly.
15. As a user, I want a failed install to leave no traces.
16. As a user, I want to remove an app and be sure the shortcut, command and environment entries disappear with it.
17. As a user, I want to export my setup and rebuild it on a new machine.
18. As a team lead, I want to share a manifest so a new hire gets the same layout and tools.
19. As an administrator, I want a JSON output mode and stable exit codes for scripting.
20. As a security-conscious user, I want to know the GUI never runs as root and that every privileged action is narrow and logged.
21. As a user, I want thumbnails and previews and other desktop conveniences to be checkable by a health tool rather than a web search.
22. As a user, I want a shell with suggestions and colors to appear in the embedded terminal exactly as it does in my normal one.

### Appendix B: Minimal `doctor` check catalogue

| Code | Check | Fix |
|---|---|---|
| D-001 | Install root exists with expected group and setgid | Re-run permission setup |
| D-002 | User is a member of the install group in the *current* session | Tell the user to log out and in |
| D-003 | Every symlink target exists | Remove link or relink |
| D-004 | Every `.desktop` `Exec=` target exists and is executable | Repair or remove shortcut |
| D-005 | No `Icon=` value is a placeholder or missing file | Re-run icon discovery |
| D-006 | Chromium sandbox helper is root-owned with mode 4755 | Apply through helper |
| D-007 | PATH contains required entries and the loader file exists | Regenerate fragments |
| D-008 | Two apps do not provide the same command | Offer to rename one |
| D-009 | Registry and ledger agree with the disk | Rebuild registry |
| D-010 | Services referenced by stacks exist | Offer to install the package |
| D-011 | Database data directories have correct owner and mode | Fix ownership |
| D-012 | Thumbnail and preview packages are installed for the desktop in use | Offer to install them |

### Appendix C: Glossary

| Term | Meaning |
|---|---|
| **AppArmor** | A Linux security module that restricts what programs may access |
| **AppImage** | A single-file application format that runs without installation |
| **Artifact** | Something created by AppDepot for an entry (link, shortcut, file) |
| **FHS** | Filesystem Hierarchy Standard, defining what each system directory is for |
| **Ledger** | The record of artifacts created for an entry |
| **PATH** | The list of directories searched for commands |
| **polkit** | The framework that lets unprivileged programs ask for authorized privileged actions |
| **PTY** | Pseudo-terminal, which lets a program host a terminal session |
| **setgid (directory)** | Makes new files inherit the directory's group |
| **setuid** | Makes a program run with its owner's privileges |
| **XDG** | The freedesktop.org standards for desktop integration and directories |
| **Zip-slip** | An attack using archive entries whose paths escape the extraction directory |

### Appendix D: Open questions

1. System-wide installs as the default, or user scope as the default with system scope opt-in?
2. Should linked packages appear as symlinks in the tree, or only as virtual entries in the UI?
3. How much of the Teach-mode dictionary can be generated from `man` pages and `tldr` data safely?
4. Is a custom URL scheme (`appdepot://install?...`) worth its security cost?
5. Which update sources are worth building first: GitHub Releases, vendor JSON endpoints, or apt only?
6. Should the app ship a small built-in registry of well-known tools with verified checksums?
7. Do Wayland compositors other than KWin and Mutter need explicit support for window-class detection?
8. When a manifest requires a newer app version than the registry shows, what is the right conflict UI?

### Appendix E: References

- freedesktop.org **Desktop Entry Specification**: https://specifications.freedesktop.org/desktop-entry-spec/latest/
- freedesktop.org **XDG Base Directory Specification**: https://specifications.freedesktop.org/basedir-spec/latest/
- Linux Foundation **Filesystem Hierarchy Standard**: https://refspecs.linuxfoundation.org/fhs.shtml
- **polkit** documentation: https://www.freedesktop.org/software/polkit/docs/latest/
- **Tauri v2** documentation: https://v2.tauri.app/
- **xterm.js**: https://xtermjs.org/
- **portable-pty** (WezTerm project): https://github.com/wez/wezterm
- **The Rust Programming Language**: https://doc.rust-lang.org/book/
- **Command Line Applications in Rust**: https://rust-cli.github.io/book/

### Appendix F: First week checklist

- [ ] Pick a working name and check availability (GitHub, crates.io, domain).
- [ ] Create the repository with license, README skeleton and CI.
- [ ] Move the `add-app` script into `docs/history/`.
- [ ] Install the Rust toolchain and complete the first Rustlings sections.
- [ ] Write ADR-001 (language), ADR-002 (GUI toolkit), ADR-003 (privilege model).
- [ ] Generate the fixture archives, starting with the Electron-like one.
- [ ] Write the first failing test: "the icon finder rejects files under `extensions/`".
- [ ] Draft the first user-facing sentence of the README, then keep it as the project's guiding line.

---

*End of specification v0.1. This document is a living plan: revise it at the end of each roadmap phase, and record every significant change as an ADR.*
