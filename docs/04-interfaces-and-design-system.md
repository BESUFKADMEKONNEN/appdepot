# 04. Interfaces and Design System

> **Source:** Derived from Sections 15, 16, 17, and 18 of [`AppDepot-Project-Spec.md`](file:///home/besu/projects/appdepotforlinux/AppDepot-Project-Spec.md)  
> **Status:** Specification v0.1

---

## 1. CLI Design (`depot`)

The command-line interface shares 100% of its business logic with the desktop GUI through the `appdepot-core` library crate.

### 1.1 Command Reference

```bash
# First-time machine initialization
depot init [--root /opt/Application] [--group devtools]

# Application listing and inspection
depot list [--category <id>] [--json]
depot info <app-id> [--json]

# Lifecycle management
depot install <source-path-or-url> [--category <id>] [--name <name>] [--dry-run]
depot update [<app-id> | --all]
depot remove <app-id> [--yes]
depot move <app-id> <target-category>

# Adoption & shortcuts
depot adopt [--scan]
depot link <external-path> --category <id> [--name <name>]
depot shortcut add <executable-path> [--name <name>] [--icon <path>]
depot shortcut repair [<app-id>]

# Groups & services
depot stack list
depot stack install <stack-id>
depot service list
depot service (start|stop|restart|enable|disable) <service-id>

# Declarative manifests
depot export [-o <path>]
depot import <manifest.toml> [--dry-run]
depot diff <manifest.toml>

# Health & diagnostics
depot doctor [--fix]

# Environment & utilities
depot env (show|apply)
depot completions (bash|zsh|fish)
depot gui
```

### 1.2 CLI Conventions & Output Guarantees
- **Exit Codes:** `0` Success, `1` General error, `2` Usage error, `3` Partial failure, `4` Authorization denied, `5` Cancelled by user.
- **Machine Readability:** Every query command supports `--json` for automation and shell scripting.
- **Progress Displays:** Rich interactive `indicatif` progress bars when attached to a TTY; structured, parseable text lines when piped.
- **Explanatory Error Formatting:** Errors always explain what failed, why, and a recommended fix:
  ```text
  error: icon file does not exist
    path: /path/to/icon.png
    hint: AppDepot found 3 candidate icons; run `depot shortcut repair antigravity`
          or specify one explicitly with --icon <file>
  ```

---

## 2. Desktop GUI Design

### 2.1 Side-by-Side Main Window Layout

```text
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

### 2.2 Layout Modes
1. **Side-by-Side (Default):** Docked right (30–40% width) for wide developer displays.
2. **Bottom Dock:** Terminal positioned below the application library.
3. **Tabbed:** Terminal and library accessible as top-level tabs.
4. **Focus Mode:** Maximizes library or terminal exclusively.
5. **Detached:** Spawns the terminal into an independent secondary window.

### 2.3 The 4-Step Install Wizard

```text
 Step 1: Source          Step 2: Analysis        Step 3: Preview         Step 4: Install
 ┌────────────────┐     ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐
 │ Drop archive   │ ──▶ │ Name: Antigravity│ ──▶│ Files to create: │ ──▶│ ▓▓▓▓▓▓░░ 70%   │
 │ or paste URL   │     │ Category: ide ▾  │    │  • folder        │    │ Live commands  │
 │ [Browse…]      │     │ Launcher: ✓ found│    │  • symlink       │    │ in docked PTY  │
 │                │     │ Icon: ✓ found    │    │  • shortcut      │    │                │
 │                │     │ Sandbox: setuid  │    │  • sandbox fix   │    │ [Open App]     │
 └────────────────┘     └──────────────────┘    └──────────────────┘    └────────────────┘
```
- Every heuristic decision is user-editable in Step 2.
- Step 3 provides a full diff preview before any files are modified.
- Step 4 streams the real underlying commands live into the terminal pane.

### 2.4 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Open Command Palette |
| `Ctrl+N` | Open Install Wizard |
| `Ctrl+F` | Filter and Search Library |
| `` Ctrl+` `` | Toggle Terminal focus/dock |
| `Ctrl+Shift+T` | Create new Terminal tab |
| `Ctrl+\` | Toggle Side-by-Side vs. Bottom Dock layout |
| `Enter` | Launch selected application |
| `Delete` | Remove application (prompts confirmation) |
| `F2` | Rename application / edit metadata |
| `F5` | Force rescan of filesystem and desktop entries |

---

## 3. Embedded Terminal Engine

### 3.1 Architecture (Tauri v2 + `portable-pty` + `xterm.js`)

```
 Frontend (xterm.js in Webview)           Backend (Rust Process)
 ┌─────────────────────────┐             ┌───────────────────────────┐
 │ xterm.js + WebGL addon  │  User keystroke │ PtySession (portable-pty) │
 │ Search & Link Provider  ├────────────▶│  - Spawns $SHELL          │
 │                         │             │  - Async read/write loop  │
 │                         │◀────────────┤  - POSIX winsize update   │
 └─────────────────────────┘ Raw binary  └───────────────────────────┘
                             chunks via
                             Tauri Channel
```

### 3.2 Dual Execution Modes
- **Visible Mode:** User-facing tasks (installations, upgrades, removals) are translated into human-readable shell commands and streamed into a dedicated PTY tab.
- **Background Mode:** Internal tasks (filesystem scans, doctor audits, icon extraction) run asynchronously without interrupting the terminal.

### 3.3 Teach Mode
Whenever a command is executed in Visible Mode, AppDepot displays a contextual explanation card derived from an editable dictionary:

```bash
# Teach: The setgid bit (2775) forces newly created files to inherit the devtools group
$ sudo find /opt/Application -type d -exec chmod 2775 {} +
```

---

## 4. Appearance & Design System

### 4.1 Design Principles
1. **Desktop Native:** Adapts to host system accent colors via XDG Desktop Portal (`org.freedesktop.appearance`).
2. **Calm Density:** Compact spacing designed for developer productivity, avoiding excessive whitespace.
3. **Transparent Machinery:** Exact filesystem paths and command arguments are inspectable with copy-to-clipboard actions.
4. **Safety by Design:** Reversible actions offer 10-second undo toasts; destructive removals require explicit verification.

### 4.2 Design Tokens

| Token | Light Theme | Dark Theme (Default) | Role |
|---|---|---|---|
| `--bg` | `#F6F7F9` | `#14161A` | Canvas background |
| `--surface` | `#FFFFFF` | `#1B1E24` | Sidebar and card container |
| `--surface-raised` | `#FFFFFF` | `#232730` | Modals, popovers, active cards |
| `--border` | `#E1E4EA` | `#2E333D` | 1px control borders |
| `--text` | `#1B1F27` | `#E6E8EC` | Primary text |
| `--text-muted` | `#5B6472` | `#9AA3B2` | Secondary labels and paths |
| `--accent` | System Accent (`#3DAEE9`) | System Accent (`#3DAEE9`) | Interactive focus and active states |
| `--success` | `#1E9E5A` | `#3DD68C` | Healthy status and verified hashes |
| `--warning` | `#B7791F` | `#F5B54A` | Doctor notices and unverified sources |
| `--danger` | `#D03B3B` | `#FF6B6B` | Destructive removal and broken state |

### 4.3 Typography & Components
- **UI Font:** System UI (Inter / Noto Sans fallback) at 13–14px.
- **Monospace Font:** JetBrains Mono Nerd Font at 12–13px for terminal sessions and path badges.
- **Iconography:** Lucide icons with consistent 1.75px stroke width.
- **Application Masks:** Standardized $48 \times 48\text{ px}$ rounded-square masks for grid view.
