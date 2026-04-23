#!/usr/bin/env bash
# Builds the extension and creates a self-contained .vsix using a staging
# directory so sharp/trash resolve outside workspace hoisting.
set -euo pipefail

cd "$(dirname "$0")/.."
EXT_DIR="$(pwd)"
PKG_DIR="$EXT_DIR/.vsix-pkg"

echo "▶ Building bundle…"
node esbuild.config.mjs

echo "▶ Staging package at $PKG_DIR"
rm -rf "$PKG_DIR" image-studio.vsix
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

echo "▶ Installing production deps in staging…"
(
  cd "$PKG_DIR"
  npm install --omit=dev --no-package-lock --loglevel=error --no-workspaces
)

echo "▶ Running vsce package…"
# DO include dependencies (sharp has native binary, trash is ESM-only).
# Staging dir has only production deps installed, so this stays small.
(
  cd "$PKG_DIR"
  npx --yes @vscode/vsce@latest package -o "$EXT_DIR/image-studio.vsix"
)

rm -rf "$PKG_DIR"

echo ""
echo "✓ Created: $EXT_DIR/image-studio.vsix"
echo ""
echo "Install with:"
echo "  code --install-extension \"$EXT_DIR/image-studio.vsix\""
