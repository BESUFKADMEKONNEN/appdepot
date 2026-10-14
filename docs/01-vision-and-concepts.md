# 01. Vision, Problems, and Core Concepts

> **Source:** Derived from Sections 1–6 of [`AppDepot-Project-Spec.md`](file:///home/besu/projects/appdepotforlinux/AppDepot-Project-Spec.md)  
> **Status:** Specification v0.1

---

## 1. Vision

Linux gives you excellent package managers and no single place to see, organize, and launch **everything** you run. Software arrives from many sources: `apt`, `.deb` files, Flatpak, Snap, AppImages, tarballs, `git clone`, and vendor install scripts. Each source puts files in a different place, creates different shortcuts (or none), and is removed in a different way.

**AppDepot** is a desktop application and command-line tool that gives all of those sources **one organized home**:

- **Categorized library:** (IDEs, SDKs, browsers, databases, runtimes, tools) like folders under Windows' *Program Files*.
- **One-click install:** of tarballs, zips, `.deb` files, AppImages, and git repositories into that library, with shortcuts, icons, PATH entries, and permissions created correctly.
- **Group operations:** install, update, remove, launch, or export a whole *stack* (for example "Flutter Mobile") in one action.
- **Adoption:** of software already installed, so it can be organized and given shortcuts without being moved or modified.
- **Terminal docked beside the GUI:** the user sees the exact commands being run and can type their own without switching windows.
- **Portable profiles:** describe a workstation in a single TOML file and recreate it on another machine.

**The Pitch:** *Windows' "Program Files" experience, done the Linux way: group, install, organize, and launch every application from one window, with a real terminal sitting beside it.*

---

## 2. Problem Statement

These problems were observed firsthand while setting up a fresh Kubuntu machine for development:

| # | Pain Point | What Actually Happens |
|---|---|---|
| 1 | **No standard home for manual installs** | `/opt`, `/usr/local`, `~/.local`, `~/dev/tools`: the user must choose, and every tutorial chooses differently. |
| 2 | **Tarball apps never appear in the menu** | The app runs from a folder, but there is no launcher, no icon, and no way to pin it, until someone hand-writes a `.desktop` file. |
| 3 | **Placeholder values leak into real files** | A copy-pasted `Icon=/path/to/icon.png` is silently accepted and the desktop shows a generic fallback icon. |
| 4 | **Electron/Chromium sandbox permissions** | Apps built on Chromium ship a `chrome-sandbox` helper that must be owned by root with the setuid bit (`4755`), or the app fails to start. |
| 5 | **PATH is configured in many places** | `~/.bashrc`, `~/.zshrc`, `~/.profile`, `/etc/profile.d/*.sh`, each behaving differently for GUI versus terminal sessions. |
| 6 | **Permissions and groups are confusing** | Managing a shared tree without `sudo` every time needs a dedicated group, `chgrp`, and the setgid bit (`2775`). |
| 7 | **Package-managed apps pick their own folders** | `.deb` installs put Chrome in `/opt/google` and OnlyOffice in `/opt/onlyoffice`. Moving them breaks updates. |
| 8 | **Uninstall is manual detective work** | A tarball install leaves behind a symlink, a `.desktop` file, a PATH line, and permissions. Nothing tracks them. |
| 9 | **Nothing is reproducible** | A new machine means repeating every step from memory or scattered notes. |
| 10 | **Fragmented formats** | `apt`, Snap, Flatpak, AppImage, and tarballs each have their own commands, locations, and update stories. |
| 11 | **Typos in long commands** | A wrong folder name (`/opt/sdk` vs `/opt/Application/sdk`) produces cryptic errors and stalled progress. |
| 12 | **The terminal is intimidating** | Newcomers do not know what each command did, so they cannot learn from running it. |

### 2.1 The Gap in Existing Tools

| Tool | What It Does Well | What It Does Not Do |
|---|---|---|
| `apt`, `dnf`, `pacman` | Package install, dependencies, updates | No grouping by purpose; no tarballs; no shortcuts for non-packaged apps |
| Flatpak / Snap | Sandboxed apps, central stores | Different filesystem model; poor fit for SDKs and toolchains |
| AppImageLauncher | Integrates AppImages into the menu | AppImages only |
| Discover / GNOME Software | Browsing and installing from stores | No organization of manual installs, no stacks |
| `asdf`, `mise`, `nvm` | Language-runtime version management | Each manages only its own runtime |
| Ansible / Nix / Brew | Reproducible setups | High learning curve; no GUI; no desktop shortcut handling |
| Windows Installer experience | Familiar, one place for everything | Not available natively on Linux |

**AppDepot's niche is the organization and lifecycle layer above all of them. It does not replace them; it cooperates with them.**

---

## 3. Origin Story: The v0 Prototype

The initial concept began as a 25-line Bash script called `add-app`:

```bash
add-app "Antigravity" /opt/Application/ide/antigravity/antigravity-ide /path/to/icon.png "Development;IDE;"
```

It resolved the executable, symlinked into `/usr/local/bin`, created a `.desktop` entry, and called `update-desktop-database`. While functional, it highlighted why a robust product is required:

| Weakness of v0 Script | Real-Product Requirement |
|---|---|
| Accepted a non-existent icon path silently | Validate every path before writing; discover icons automatically |
| Could not find the executable on its own | Executable scoring heuristics (see Doc 03) |
| Ignored Chromium sandbox requirements | Detect and fix sandbox helpers via polkit authorization |
| No record of what it created | Ledger of every artifact for clean transactional uninstall |
| One app at a time | Groups, stacks, and TOML manifests |
| Required `sudo` directly | Privileged helper with polkit, never `sudo` in the GUI |
| No undo | Transactional install with automatic rollback on failure |
| No view of what is installed | SQLite registry database and visual desktop library |
| Intimidating to Linux newcomers | Interactive GUI, transparent docked terminal, Teach Mode |

*The original script is preserved in [`docs/history/add-app.sh`](file:///home/besu/projects/appdepotforlinux/docs/history/add-app.sh).*

---

## 4. Target Users & Personas

- **Persona A: The Windows Migrant ("Besu")**  
  Developer with 1–2 years of experience, transitioning to Linux. Accustomed to `C:\Program Files`, the Start menu, and system environment variables. Desires an organized workstation and wants to learn what happens under the hood.  
  *Needs:* Clear guidance, visible terminal commands, safe defaults.
- **Persona B: The Polyglot Developer ("Mira")**  
  Uses Flutter, Node, Java, and Python. Installs bleeding-edge SDKs via tarball because distro packages lag behind.  
  *Needs:* Stacks, manifests, and rapid machine restoration.
- **Persona C: The Team Lead ("Daniel")**  
  Onboards new engineers and requires consistent development toolchains across all team laptops.  
  *Needs:* Shareable workstation profiles, `doctor` command, uniform layout.
- **Persona D: The Workstation Admin ("Priya")**  
  Manages 20–50 developer machines in a studio or lab.  
  *Needs:* Robust CLI, `--json` output, idempotent operations, audit log.
- **Persona E: The Student / Bootcamp Learner**  
  Shares a multi-user lab machine without `sudo` privileges.  
  *Needs:* User-scope installs (`~/Applications`) with the exact same interface.

---

## 5. Goals and Non-Goals

### 5.1 Goals
1. **Organized by default:** Every application belongs to a functional category in a predictable path.
2. **Safe & privilege-separated:** GUI never runs as root. Privileged actions go through a narrow, typed helper.
3. **Reversible & transactional:** Every install is tracked by a ledger. Uninstall is 100% clean.
4. **Cooperative:** Integrates alongside `apt`, Flatpak, Snap, and AppImages.
5. **Transparent:** Real terminal commands are always visible in the docked terminal.
6. **Portable:** Single manifest recreates a machine setup on fresh hardware.
7. **Fast & lightweight:** Startup under 1s; GUI idle memory under 150 MB.
8. **Single-artifact distribution:** Native `.deb` and AppImage packages.
9. **Fully scriptable:** 100% of GUI features available via `depot` CLI with `--json`.
10. **High portfolio impact:** Demonstrates systems programming, UI engineering, security design, and CI/CD.

### 5.2 Non-Goals
- Replacing system package managers (`apt`, `dnf`, `pacman`).
- Hosting a private app store or central repository (manifests are shared as text/git).
- Application sandboxing (delegated to Flatpak/bubblewrap).
- Supporting immutable OS roots (like Fedora Silverblue) in v1.
- Language-level package management (`pip`, `npm`, `cargo`).
- Windows or macOS support.

---

## 6. Core Concepts & Vocabulary

| Term | Definition |
|---|---|
| **Application** | Anything launchable or usable: GUI app, CLI tool, SDK, runtime, service. |
| **Category** | Folder-like label (`ide`, `sdk`, `browsers`, `databases`). Maps to a directory in the install root. |
| **Install Root** | Base directory managed by AppDepot. Default: `/opt/Application` (System) or `~/Applications` (User). |
| **Source** | Where an application originates: tarball, zip, `.deb`, AppImage, git, apt, Flatpak, or Snap. |
| **Entry** | An application record in the SQLite registry. |
| **Artifact** | Any filesystem entity created for an entry: symlinks, `.desktop` files, wrappers, PATH fragments, service overrides. |
| **Ledger** | Per-entry list of created artifacts, ensuring clean uninstall and automated health repair. |
| **Launcher** | The invocation mechanism: terminal command, desktop menu shortcut, or both. |
| **Shortcut** | A standard freedesktop `.desktop` file in an XDG applications directory. |
| **Stack** | A named collection of entries and services managed as a single unit (e.g. "Flutter Mobile"). |
| **Manifest** | A TOML profile declaring categories, apps, stacks, and services. |
| **Job** | An asynchronous operation (install, update, remove) with progress tracking and logs. |
| **Helper** | Small privileged binary (`appdepot-helper`) executing authorized root tasks via polkit. |

### 6.1 The Three Ownership Modes

This is the architectural cornerstone of AppDepot:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AppDepot Ownership Modes                        │
├───────────────────┬──────────────────────────────────┬─────────────────┤
│ Mode              │ Files Live In                    │ AppDepot Owns   │
├───────────────────┼──────────────────────────────────┼─────────────────┤
│ 1. MANAGED        │ <root>/<category>/<app>          │ Files & Lifetime│
│    (Tarball, SDK) │ Example: /opt/Application/sdk/…  │ Full control    │
├───────────────────┼──────────────────────────────────┼─────────────────┤
│ 2. LINKED         │ Wherever package manager put it  │ Symlink & Meta  │
│    (Chrome, Deb)  │ Example: /opt/google/chrome      │ Read-only link  │
├───────────────────┼──────────────────────────────────┼─────────────────┤
│ 3. ADOPTED        │ System dirs, Flatpak, Snap       │ Tags & Shortcut │
│    (VLC, GIMP)    │ Unchanged system location        │ No disk files   │
└───────────────────┴──────────────────────────────────┴─────────────────┘
```

> **Cardinal Invariant:** **AppDepot never moves or deletes files owned by another package manager.** It points at them via symlinks or organizes them virtually.

### 6.2 Windows-to-Linux Concept Translator

Built directly into AppDepot's onboarding and help system:

| Windows Concept | Linux Standard | AppDepot Equivalent |
|---|---|---|
| `C:\Program Files` | `/opt`, `/usr/local` | Categorized Install Root (`/opt/Application`) |
| Start Menu Shortcut | `.desktop` file in XDG dir | Validated Shortcut |
| Environment Variables Dialog | `/etc/profile.d`, `~/.profile` | Modular Environment Fragments (`appdepot.d/*.sh`) |
| `.exe` Installer | `.deb`, tarball, AppImage | 4-Step Install Wizard |
| Add or Remove Programs | `apt remove`, manual directory deletion | Library View + Ledger-backed Clean Removal |
| Windows Services (`services.msc`) | `systemctl` / systemd units | Dedicated Services Panel |
| Run as Administrator (UAC) | `sudo`, `pkexec` | Polkit Authorization with `appdepot-helper` |
