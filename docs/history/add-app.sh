#!/usr/bin/env bash
# ==============================================================================
# add-app (v0 Prototype - 2026-10-14)
# ==============================================================================
# The original 25-line Bash script that started the AppDepot project.
# Takes an application name, executable path, icon, and categories, then:
#   1. Resolves the real path.
#   2. Symlinks into /usr/local/bin.
#   3. Generates a .desktop file in /usr/share/applications.
#   4. Refreshes the desktop database.
#
# Lessons learned from this script directly shaped the AppDepot specification:
#   - It blindly accepted invalid icon paths.
#   - It required manual executable path selection.
#   - It ignored Chromium setuid sandbox requirements.
#   - It left no ledger for clean uninstallation.
#   - It required raw sudo privileges.
# ==============================================================================

set -euo pipefail

APP_NAME="${1:?Usage: add-app <Name> <ExecPath> [IconPath] [Categories]}"
EXEC_PATH="${2:?Missing executable path}"
ICON_PATH="${3:-""}"
CATEGORIES="${4:-"Development;IDE;"}"

REAL_EXEC="$(realpath "$EXEC_PATH")"
APP_ID="$(echo "$APP_NAME" | tr '[:upper:]' '[:lower:]' | tr -s ' ' '-')"

echo "Creating symlink for $APP_NAME in /usr/local/bin/$APP_ID..."
sudo ln -sf "$REAL_EXEC" "/usr/local/bin/$APP_ID"

DESKTOP_FILE="/usr/share/applications/${APP_ID}.desktop"
echo "Writing desktop entry to $DESKTOP_FILE..."
sudo tee "$DESKTOP_FILE" > /dev/null <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_NAME
Exec=$REAL_EXEC %U
Icon=$ICON_PATH
Terminal=false
Categories=$CATEGORIES
StartupNotify=true
EOF

echo "Refreshing desktop database..."
sudo update-desktop-database /usr/share/applications || true

echo "Done! $APP_NAME is now launchable from menu and terminal ($APP_ID)."
