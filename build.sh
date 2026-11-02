#!/usr/bin/env bash
# ==============================================================================
# build.sh: Convenient shortcut to the protected distribution pipeline
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$SCRIPT_DIR/scripts/build-protected-dist.sh"
exec "$SCRIPT_DIR/scripts/build-protected-dist.sh" "$@"
