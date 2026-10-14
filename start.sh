#!/usr/bin/env bash
# ==============================================================================
# start.sh: Launch AppDepot Interactive Desktop GUI
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUI_DIR="$SCRIPT_DIR/apps/gui"

echo "=========================================================="
echo "  Starting AppDepot Desktop Application"
echo "=========================================================="
echo "• Desktop Framework: React + TypeScript + Vite"
echo "• Design Tokens: Deep Dark Theme (#14161A, #3DAEE9)"
echo "• Mode: Side-by-Side Library & Docked Live Terminal"
echo ""

cd "$GUI_DIR"
exec npm run dev -- --host 127.0.0.1 --port 5173
