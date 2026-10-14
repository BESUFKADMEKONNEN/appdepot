#!/usr/bin/env bash
# ==============================================================================
# Generate Synthetic Fixtures for AppDepot Testing
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Generating synthetic test fixtures in $SCRIPT_DIR..."

# 1. Electron-like fixture: antigravity IDE with sandbox and extensions noise
ELECTRON_DIR="$WORK_DIR/antigravity-ide-0.1.0"
mkdir -p "$ELECTRON_DIR/bin"
mkdir -p "$ELECTRON_DIR/resources"
mkdir -p "$ELECTRON_DIR/extensions/theme-dark"

# Create binaries
echo "#!/bin/sh" > "$ELECTRON_DIR/antigravity-ide"
echo "echo 'Antigravity IDE running'" >> "$ELECTRON_DIR/antigravity-ide"
chmod +x "$ELECTRON_DIR/antigravity-ide"

cp "$ELECTRON_DIR/antigravity-ide" "$ELECTRON_DIR/bin/antigravity-ide"
chmod +x "$ELECTRON_DIR/bin/antigravity-ide"

# Create sandbox helper and crashpad
touch "$ELECTRON_DIR/chrome-sandbox"
chmod 755 "$ELECTRON_DIR/chrome-sandbox"

touch "$ELECTRON_DIR/chrome_crashpad_handler"
chmod +x "$ELECTRON_DIR/chrome_crashpad_handler"

# Create real icon in resources
echo "REAL_ICON_SVG" > "$ELECTRON_DIR/resources/antigravity.svg"

# Create misleading icon in extensions (should be ignored by heuristics)
echo "FAKE_ICON_PNG" > "$ELECTRON_DIR/extensions/theme-dark/icon.png"

# Package into electron-like.tar.gz
tar -czf "$SCRIPT_DIR/electron-like.tar.gz" -C "$WORK_DIR" "antigravity-ide-0.1.0"
echo "✓ Created fixtures/electron-like.tar.gz"

# 2. SDK-like fixture: flutter-like nested root
SDK_DIR="$WORK_DIR/flutter-sdk"
mkdir -p "$SDK_DIR/bin"
echo "#!/bin/sh" > "$SDK_DIR/bin/flutter"
echo "echo 'Flutter SDK 3.x'" >> "$SDK_DIR/bin/flutter"
chmod +x "$SDK_DIR/bin/flutter"

tar -czf "$SCRIPT_DIR/sdk-like.tar.gz" -C "$WORK_DIR" "flutter-sdk"
echo "✓ Created fixtures/sdk-like.tar.gz"

echo "All synthetic fixtures generated successfully."
