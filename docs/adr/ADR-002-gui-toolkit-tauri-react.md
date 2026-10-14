# ADR-002: GUI Toolkit (Tauri v2 + React + TypeScript)

- **Status:** Accepted
- **Deciders:** Besifkad
- **Date:** 2026-10-14

## Context and Problem Statement
AppDepot requires a responsive, visually rich desktop interface on Linux. It must:
1. Feature a docked, high-performance embedded terminal.
2. Maintain low memory overhead (<150 MB idle) to suit developers running demanding IDEs and runtimes.
3. Leverage existing TypeScript/React skills for fast UI iteration.
4. Integrate seamlessly with the Rust `appdepot-core` library.
5. Produce native `.deb` and standalone AppImage bundles.

## Decision Outcome
Chosen option: **Tauri v2 with React, TypeScript, and Vite**, because:
- **Lightweight Architecture:** Uses the operating system's native WebKitGTK webview instead of bundling Chromium, reducing bundle size to tens of megabytes and idle memory under 150 MB.
- **Direct Rust IPC:** Tauri v2 provides typed IPC commands and high-throughput binary `Channel` streaming for terminal data without JSON overhead.
- **Terminal Integration:** `xterm.js` is the industry-standard web terminal (used by VS Code) with WebGL acceleration and addon support.
- **Rapid UI Prototyping:** React + Tailwind CSS + Radix UI primitives enable polished design tokens, keyboard navigation, and calm developer density.
- **Multi-Format Packaging:** Built-in Tauri CLI tooling generates `.deb`, AppImage, and `.rpm` binaries out of the box.

## Fallback Tripwire
If WebKitGTK rendering or Wayland issues are observed across diverse GPU drivers, GTK4/libadwaita or Qt/Kirigami can interface with `appdepot-core`, since presentation is decoupled from domain logic.
