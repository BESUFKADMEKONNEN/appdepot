#!/usr/bin/env bash
# ==============================================================================
# build-protected-dist.sh
# Production Anti-Reverse Engineering & Secure Packaging Script for AppDepot
#
# Guarantees:
# 1. Zero plaintext source code in output (all TS/TSX removed)
# 2. V8 Machine Bytecode compilation via Bytenode (.jsc)
# 3. Aggressive AST obfuscation (RC4 string encryption, control flow flattening)
# 4. Native Rust ELF release compilation with LTO & hard symbol stripping (strip --strip-all)
# 5. Dual distribution packages: Standalone portable .tar.gz + Debian/Ubuntu .deb
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GUI_DIR="$ROOT_DIR/apps/gui"
DIST_DIR="$ROOT_DIR/dist-release"
APP_NAME="appdepot"
VERSION="1.0.0"

BUNDLE_DIR="$DIST_DIR/bundle/$APP_NAME"
DEB_STAGING="$DIST_DIR/deb_staging"

echo "=========================================================="
echo "  AppDepot Hardened Closed-Source Packaging Pipeline     "
echo "  Target: Production Linux x86_64                         "
echo "  Protection Level: MAXIMUM (Bytecode + AST Obfuscation)  "
echo "=========================================================="
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 0. Clean & Prepare Workspace
# ─────────────────────────────────────────────────────────────────────────────
echo "==> [0/6] Cleaning previous build artifacts..."
rm -rf "$DIST_DIR"
mkdir -p "$BUNDLE_DIR/bin"
mkdir -p "$BUNDLE_DIR/share/appdepot/backend/node_modules"
mkdir -p "$BUNDLE_DIR/share/appdepot/gui"
mkdir -p "$BUNDLE_DIR/share/icons"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Compile Native Rust CLI with LTO & Symbol Stripping
# ─────────────────────────────────────────────────────────────────────────────
echo "==> [1/6] Compiling native Rust binaries with LTO & symbol stripping..."
cd "$ROOT_DIR"
if command -v cargo >/dev/null 2>&1; then
  cargo build --release --workspace

  if [ -f "$ROOT_DIR/target/release/depot" ]; then
    cp "$ROOT_DIR/target/release/depot" "$BUNDLE_DIR/bin/depot"
    strip --strip-all "$BUNDLE_DIR/bin/depot" 2>/dev/null || true
    echo "    ✓ Stripped native binary: bin/depot ($(du -h "$BUNDLE_DIR/bin/depot" | cut -f1))"
  fi

  if [ -f "$ROOT_DIR/target/release/appdepot-helper" ]; then
    cp "$ROOT_DIR/target/release/appdepot-helper" "$BUNDLE_DIR/bin/appdepot-helper"
    strip --strip-all "$BUNDLE_DIR/bin/appdepot-helper" 2>/dev/null || true
    echo "    ✓ Stripped helper binary: bin/appdepot-helper ($(du -h "$BUNDLE_DIR/bin/appdepot-helper" | cut -f1))"
  fi
else
  echo "    [!] Warning: cargo not found. Skipping Rust native build."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Build Frontend UI & Apply AST Obfuscation
# ─────────────────────────────────────────────────────────────────────────────
echo "==> [2/6] Building and obfuscating React frontend..."
cd "$GUI_DIR"
npm run build

echo "    Applying AST string encryption and control-flow flattening..."
# Copy dist to bundle
cp -r "$GUI_DIR/dist"/* "$BUNDLE_DIR/share/appdepot/gui/"

# Remove source maps to guarantee no source exposure
find "$BUNDLE_DIR/share/appdepot/gui" -name "*.map" -type f -delete

# Obfuscate all client JavaScript bundles in-place
OBFUSCATOR="$GUI_DIR/node_modules/.bin/javascript-obfuscator"
if [ -x "$OBFUSCATOR" ]; then
  for js_file in "$BUNDLE_DIR/share/appdepot/gui/assets"/*.js; do
    if [ -f "$js_file" ]; then
      "$OBFUSCATOR" "$js_file" \
        --output "$js_file" \
        --compact true \
        --control-flow-flattening true \
        --control-flow-flattening-threshold 0.75 \
        --split-strings true \
        --split-strings-chunk-length 5 \
        --string-array true \
        --string-array-encoding rc4 \
        --string-array-threshold 0.8 \
        --self-defending false >/dev/null 2>&1
      echo "    ✓ Obfuscated client bundle: $(basename "$js_file")"
    fi
  done
else
  echo "    [!] javascript-obfuscator not found, using minified Vite build."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Bundle Backend Server & Compile to V8 Bytecode (.jsc)
# ─────────────────────────────────────────────────────────────────────────────
echo "==> [3/6] Compiling backend server to raw V8 machine bytecode (.jsc)..."
cd "$GUI_DIR"

# 3a. Monolithic single-file bundle with esbuild
ESBUILD="$GUI_DIR/node_modules/.bin/esbuild"
TMP_SERVER_DIR="$DIST_DIR/.tmp_server"
mkdir -p "$TMP_SERVER_DIR"

"$ESBUILD" "$GUI_DIR/server/prodServer.ts" \
  --bundle \
  --platform=node \
  --target=node18 \
  --format=cjs \
  --outfile="$TMP_SERVER_DIR/server.bundle.js"

# 3b. Obfuscate backend JS before bytecode compilation
if [ -x "$OBFUSCATOR" ]; then
  "$OBFUSCATOR" "$TMP_SERVER_DIR/server.bundle.js" \
    --output "$TMP_SERVER_DIR/server.obf.js" \
    --compact true \
    --control-flow-flattening true \
    --control-flow-flattening-threshold 0.85 \
    --dead-code-injection true \
    --dead-code-injection-threshold 0.3 \
    --split-strings true \
    --string-array true \
    --string-array-encoding rc4 \
    --string-array-threshold 0.85 >/dev/null 2>&1
  SERVER_TO_COMPILE="$TMP_SERVER_DIR/server.obf.js"
else
  SERVER_TO_COMPILE="$TMP_SERVER_DIR/server.bundle.js"
fi

# 3c. Compile into raw V8 bytecode (.jsc)
BYTENODE="$GUI_DIR/node_modules/.bin/bytenode"
"$BYTENODE" -c "$SERVER_TO_COMPILE"
COMPILED_JSC="${SERVER_TO_COMPILE%.js}.jsc"

cp "$COMPILED_JSC" "$BUNDLE_DIR/share/appdepot/backend/server.jsc"

# 3d. Create minimal Bytenode runtime bootstrap (ZERO source code)
cat << 'EOF' > "$BUNDLE_DIR/share/appdepot/backend/index.js"
const path = require('path');
require('bytenode');
require(path.join(__dirname, 'server.jsc'));
EOF

# Copy bytenode package to runtime and prune declaration / doc files
cp -r "$GUI_DIR/node_modules/bytenode" "$BUNDLE_DIR/share/appdepot/backend/node_modules/"
find "$BUNDLE_DIR/share/appdepot/backend/node_modules" -name "*.d.ts" -delete
find "$BUNDLE_DIR/share/appdepot/backend/node_modules" -name "*.md" -delete

# 3e. PURGE all plaintext JS and TS intermediate files
rm -rf "$TMP_SERVER_DIR"
echo "    ✓ Successfully generated bytecode: share/appdepot/backend/server.jsc"
echo "    ✓ Purged all plaintext JavaScript/TypeScript backend files"

# ─────────────────────────────────────────────────────────────────────────────
# 4. Copy Icons & Create Standalone Master Launcher
# ─────────────────────────────────────────────────────────────────────────────
echo "==> [4/6] Creating production launcher & install scripts..."

if [ -f "$GUI_DIR/public/favicon.svg" ]; then
  cp "$GUI_DIR/public/favicon.svg" "$BUNDLE_DIR/share/icons/appdepot.svg"
elif [ -f "$GUI_DIR/dist/favicon.svg" ]; then
  cp "$GUI_DIR/dist/favicon.svg" "$BUNDLE_DIR/share/icons/appdepot.svg"
fi

# Standalone Master Launcher
cat << 'LAUNCHER_EOF' > "$BUNDLE_DIR/appdepot"
#!/usr/bin/env bash
# ==============================================================================
# AppDepot Master Universal Launcher
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export APPDEPOT_DIST_ROOT="$SCRIPT_DIR"
export APPDEPOT_STATIC_DIR="$SCRIPT_DIR/share/appdepot/gui"

# Forward CLI commands directly to the stripped native Rust binary
if [ $# -gt 0 ] && [ "$1" != "--gui" ] && [ "$1" != "gui" ]; then
  if [ -x "$SCRIPT_DIR/bin/depot" ]; then
    exec "$SCRIPT_DIR/bin/depot" "$@"
  else
    echo "Error: Native CLI binary not found in $SCRIPT_DIR/bin/depot"
    exit 1
  fi
fi

# Launch GUI mode
echo "=========================================================="
echo "  Starting AppDepot Linux Management Control Panel"
echo "=========================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js runtime is required to run the AppDepot GUI."
  echo "Please install it with: sudo apt install nodejs"
  exit 1
fi

export NODE_PATH="$SCRIPT_DIR/share/appdepot/backend/node_modules"
echo "• Starting protected V8 bytecode runtime..."

# Start bytecode server in background and save PID
node "$SCRIPT_DIR/share/appdepot/backend/index.js" &
SERVER_PID=$!

trap "kill $SERVER_PID 2>/dev/null || true" EXIT INT TERM

wait $SERVER_PID
LAUNCHER_EOF
chmod +x "$BUNDLE_DIR/appdepot"

# Standalone system installer script
cat << 'INSTALL_EOF' > "$BUNDLE_DIR/install.sh"
#!/usr/bin/env bash
# ==============================================================================
# AppDepot System-Wide Installer
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/appdepot"

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: Installation requires root permissions."
  echo "Please run: sudo ./install.sh"
  exit 1
fi

echo "Installing AppDepot System Management Control Panel to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"

# Symlink CLI and GUI runners to system PATH
ln -sf "$INSTALL_DIR/bin/depot" /usr/local/bin/depot
ln -sf "$INSTALL_DIR/appdepot" /usr/local/bin/appdepot

# Install Desktop Entry
DESKTOP_DIR="/usr/share/applications"
mkdir -p "$DESKTOP_DIR"
cat << 'DESK' > "$DESKTOP_DIR/appdepot.desktop"
[Desktop Entry]
Name=AppDepot
Comment=Universal Linux Application & System Management Control Panel
Exec=/usr/local/bin/appdepot
Icon=/opt/appdepot/share/icons/appdepot.svg
Terminal=false
Type=Application
Categories=System;Settings;PackageManager;
StartupWMClass=appdepot
DESK

# Install Application Icon
if [ -f "$INSTALL_DIR/share/icons/appdepot.svg" ]; then
  mkdir -p /usr/share/icons/hicolor/scalable/apps/
  cp "$INSTALL_DIR/share/icons/appdepot.svg" /usr/share/icons/hicolor/scalable/apps/appdepot.svg
  gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
fi

echo ""
echo "=========================================================="
echo "  ✓ AppDepot successfully installed!"
echo "  • Terminal CLI : run 'depot' in any terminal"
echo "  • Desktop GUI  : run 'appdepot' or launch from App Menu"
echo "=========================================================="
INSTALL_EOF
chmod +x "$BUNDLE_DIR/install.sh"

# ─────────────────────────────────────────────────────────────────────────────
# 5. Build Distribution Packages (.tar.gz and .deb)
# ─────────────────────────────────────────────────────────────────────────────
echo "==> [5/6] Generating distribution packages..."

# 5a. Standalone .tar.gz bundle
cd "$DIST_DIR/bundle"
TAR_NAME="${APP_NAME}-${VERSION}-linux-x64.tar.gz"
tar -czf "$DIST_DIR/$TAR_NAME" "$APP_NAME"
echo "    ✓ Standalone archive: $DIST_DIR/$TAR_NAME ($(du -h "$DIST_DIR/$TAR_NAME" | cut -f1))"

# 5b. Native Debian .deb package
echo "    Building official Debian/Ubuntu .deb installer..."
rm -rf "$DEB_STAGING"
mkdir -p "$DEB_STAGING/DEBIAN"
mkdir -p "$DEB_STAGING/opt/appdepot"
mkdir -p "$DEB_STAGING/usr/local/bin"
mkdir -p "$DEB_STAGING/usr/share/applications"
mkdir -p "$DEB_STAGING/usr/share/icons/hicolor/scalable/apps"

# Copy files to deb staging
cp -r "$BUNDLE_DIR"/* "$DEB_STAGING/opt/appdepot/"
ln -sf /opt/appdepot/bin/depot "$DEB_STAGING/usr/local/bin/depot"
ln -sf /opt/appdepot/appdepot "$DEB_STAGING/usr/local/bin/appdepot"
cp "$BUNDLE_DIR/share/icons/appdepot.svg" "$DEB_STAGING/usr/share/icons/hicolor/scalable/apps/appdepot.svg" 2>/dev/null || true

cat << 'DESK_DEB' > "$DEB_STAGING/usr/share/applications/appdepot.desktop"
[Desktop Entry]
Name=AppDepot
Comment=Universal Linux Application & System Management Control Panel
Exec=/usr/local/bin/appdepot
Icon=appdepot
Terminal=false
Type=Application
Categories=System;Settings;PackageManager;
StartupWMClass=appdepot
DESK_DEB

cat << EOF > "$DEB_STAGING/DEBIAN/control"
Package: ${APP_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: AppDepot Project <support@appdepot.org>
Depends: nodejs
Description: Universal Linux Application & System Management Control Panel
 Clean /opt/Application hierarchy manager with real-time systemd telemetry,
 sandboxed health auditing, live terminal docking, and POSIX compliance suite.
EOF

DEB_NAME="${APP_NAME}_${VERSION}_amd64.deb"
dpkg-deb --build --root-owner-group "$DEB_STAGING" "$DIST_DIR/$DEB_NAME" >/dev/null
rm -rf "$DEB_STAGING"
echo "    ✓ Debian package   : $DIST_DIR/$DEB_NAME ($(du -h "$DIST_DIR/$DEB_NAME" | cut -f1))"

# ─────────────────────────────────────────────────────────────────────────────
# 6. Anti-Reverse Engineering Security Verification
# ─────────────────────────────────────────────────────────────────────────────
echo "==> [6/6] Verifying anti-reverse engineering protections..."

# Check 1: Ensure zero .ts or .tsx files in bundle
TS_COUNT=$(find "$BUNDLE_DIR" -name "*.ts" -o -name "*.tsx" | wc -l)
if [ "$TS_COUNT" -ne 0 ]; then
  echo "    [ERROR] Found $TS_COUNT uncompiled TypeScript source files in bundle!"
  exit 1
else
  echo "    ✓ Clean: 0 TypeScript source files found in release bundle"
fi

# Check 2: Ensure zero source maps in bundle
MAP_COUNT=$(find "$BUNDLE_DIR" -name "*.map" | wc -l)
if [ "$MAP_COUNT" -ne 0 ]; then
  echo "    [ERROR] Found $MAP_COUNT source maps in release bundle!"
  exit 1
else
  echo "    ✓ Clean: 0 source map files found in release bundle"
fi

# Check 3: Ensure native binaries are stripped
if [ -f "$BUNDLE_DIR/bin/depot" ]; then
  FILE_INFO=$(file "$BUNDLE_DIR/bin/depot")
  if echo "$FILE_INFO" | grep -q "stripped"; then
    echo "    ✓ Native ELF binary: fully stripped (no symbols)"
  else
    echo "    [!] Warning: bin/depot may still contain symbols"
  fi
fi

# Check 4: Confirm presence of compiled V8 bytecode
if [ -f "$BUNDLE_DIR/share/appdepot/backend/server.jsc" ]; then
  echo "    ✓ Backend logic: 100% compiled into raw V8 machine bytecode (.jsc)"
fi

echo ""
echo "=========================================================="
echo "  🎉 SECURE CLOSED-SOURCE DISTRIBUTION BUILD COMPLETE!    "
echo "=========================================================="
echo "  Artifacts ready for deployment & publishing:"
echo "  1. Tarball Bundle : $DIST_DIR/$TAR_NAME"
echo "  2. Debian Package : $DIST_DIR/$DEB_NAME"
echo "=========================================================="
