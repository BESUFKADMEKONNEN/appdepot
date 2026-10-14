# ADR-003: Privilege Model (Polkit + Typed Helper)

- **Status:** Accepted
- **Deciders:** Besifkad
- **Date:** 2026-10-14

## Context and Problem Statement
AppDepot manages software in `/opt/Application` and creates desktop shortcuts in `/usr/share/applications`. These require administrative rights on multi-user systems. However:
1. Running desktop GUI applications directly with `sudo` is a severe security antipattern that creates file ownership messes and security vulnerabilities.
2. Prompting the user for a password on every minor action degrades user experience.
3. Passing raw shell command strings to elevated processes risks shell injection.

## Decision Outcome
Chosen option: **Privilege separation with Polkit and `appdepot-helper`**, because:
- **Never Run GUI as Root:** Both the GUI and CLI run as the unprivileged user.
- **Typed JSON Protocol:** The helper accepts only strictly validated JSON commands over `stdin` (e.g. `set_sandbox`, `install_tree`, `write_system_shortcut`), completely rejecting arbitrary shell strings.
- **Scoped Polkit Actions:** Actions are governed by an XML policy (`org.appdepot.policy`) with `auth_admin_keep` so users enter their password once per session.
- **Setgid Group Strategy:** `depot init` establishes the `devtools` group with the setgid bit (`2775`) on `/opt/Application`, allowing daily management without elevation.
- **Auditing:** Every privileged execution appends to `/var/log/appdepot/audit.log`.
