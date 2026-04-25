#!/usr/bin/env bash
# Builds the extension and creates a self-contained, platform-specific .vsix
# using a staging directory so sharp/trash resolve outside workspace hoisting.
#
# Usage:
#   ./scripts/package.sh                # builds for the host platform
#   ./scripts/package.sh darwin-arm64   # builds for macOS Apple Silicon
#   ./scripts/package.sh win32-x64      # builds for Windows x64
#   ./scripts/package.sh linux-x64      # builds for Linux x64
#
# Output: image-studio-<target>.vsix
set -euo pipefail

cd "$(dirname "$0")/.."
EXT_DIR="$(pwd)"

# Resolve target → vsce --target string + npm --os/--cpu flags.
host_target() {
  local os arch
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux)  os=linux ;;
    MINGW*|MSYS*|CYGWIN*) os=win32 ;;
    *) echo "Unknown OS: $(uname -s)" >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch=arm64 ;;
    x86_64|amd64)  arch=x64 ;;
    *) echo "Unknown arch: $(uname -m)" >&2; exit 1 ;;
  esac
  echo "${os}-${arch}"
}

TARGET="${1:-$(host_target)}"

UNIVERSAL=0
case "$TARGET" in
  darwin-arm64) NPM_OS=darwin; NPM_CPU=arm64 ;;
  darwin-x64)   NPM_OS=darwin; NPM_CPU=x64 ;;
  win32-x64)    NPM_OS=win32;  NPM_CPU=x64 ;;
  win32-arm64)  NPM_OS=win32;  NPM_CPU=arm64 ;;
  linux-x64)    NPM_OS=linux;  NPM_CPU=x64 ;;
  linux-arm64)  NPM_OS=linux;  NPM_CPU=arm64 ;;
  universal)    UNIVERSAL=1 ;;
  *) echo "Unsupported target: $TARGET" >&2; exit 1 ;;
esac

PKG_DIR="$EXT_DIR/.vsix-pkg-$TARGET"
OUT_VSIX="$EXT_DIR/image-studio-$TARGET.vsix"

if [ "$UNIVERSAL" = "1" ]; then
  echo "▶ Target: universal (bundles darwin-arm64 + win32-x64 sharp binaries)"
else
  echo "▶ Target: $TARGET (npm --os=$NPM_OS --cpu=$NPM_CPU)"
fi

echo "▶ Building bundle…"
node esbuild.config.mjs

echo "▶ Staging package at $PKG_DIR"
rm -rf "$PKG_DIR" "$OUT_VSIX"
mkdir -p "$PKG_DIR"

cp -R dist media "$PKG_DIR/"
cp README.md "$PKG_DIR/"
[ -f "$EXT_DIR/../../LICENSE" ] && cp "$EXT_DIR/../../LICENSE" "$PKG_DIR/" || true
[ -f "$EXT_DIR/.vscodeignore" ] && cp "$EXT_DIR/.vscodeignore" "$PKG_DIR/" || true

echo "▶ Writing staging package.json (production deps only, no workspace link)"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  const keep = ['sharp', 'trash'];
  pkg.dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies || {}).filter(([k]) => keep.includes(k))
  );
  delete pkg.devDependencies;
  delete pkg.scripts;
  delete pkg.private;
  fs.writeFileSync('$PKG_DIR/package.json', JSON.stringify(pkg, null, 2));
"

echo "▶ Installing production deps in staging (cross-platform sharp binary)…"
(
  cd "$PKG_DIR"
  if [ "$UNIVERSAL" = "1" ]; then
    # Universal: install once for darwin-arm64 (gets full deps + that binary),
    # then drop in the win32-x64 sharp package from a separate isolated
    # install (npm refuses to install a non-host package directly into the
    # main node_modules even with --os/--cpu, so we stage it elsewhere and
    # copy it in).
    npm install --omit=dev --no-package-lock --loglevel=error --no-workspaces \
      --os=darwin --cpu=arm64
    SHARP_VER=$(node -e "console.log(require('./node_modules/sharp/package.json').version)")
    TMP_W32="$(mktemp -d)"
    (
      cd "$TMP_W32"
      npm init -y >/dev/null
      npm install --omit=dev --no-package-lock --loglevel=error \
        --os=win32 --cpu=x64 "sharp@$SHARP_VER"
    )
    mkdir -p node_modules/@img
    cp -R "$TMP_W32/node_modules/@img/sharp-win32-x64" node_modules/@img/
    rm -rf "$TMP_W32"
  else
    # --os/--cpu force npm to fetch optionalDependencies for the requested target,
    # so sharp's @img/sharp-<target> native package is materialized even when
    # building from a different host platform.
    npm install --omit=dev --no-package-lock --loglevel=error --no-workspaces \
      --os="$NPM_OS" --cpu="$NPM_CPU"
  fi
)

echo "▶ Running vsce package…"
# DO include dependencies (sharp has native binary, trash is ESM-only).
(
  cd "$PKG_DIR"
  if [ "$UNIVERSAL" = "1" ]; then
    npx --yes @vscode/vsce@latest package -o "$OUT_VSIX"
  else
    npx --yes @vscode/vsce@latest package --target "$TARGET" -o "$OUT_VSIX"
  fi
)

rm -rf "$PKG_DIR"

echo ""
echo "✓ Created: $OUT_VSIX"
echo ""
echo "Install with:"
echo "  code --install-extension \"$OUT_VSIX\""
