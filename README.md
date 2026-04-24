# Image Studio

Image editor + AI converter for VSCode. **Two ways to use one tool**, install whichever (or both):

- **AI (MCP server)** — Claude Code / Cursor / Claude Desktop converts images on your disk via natural language: *"convert all PNGs in /icons to webp quality 80"*.
- **GUI (VSCode extension)** — custom image editor tab with live Before/After preview, crop, resize, compress.

Both run locally through [sharp](https://sharp.pixelplumbing.com/). No uploads, no cloud, no telemetry.

---

## Install & use the AI side (MCP)

**One command** — no cloning, no building:

```bash
claude mcp add --transport stdio --scope user image-studio -- npx -y image-studio-mcp
```

`npx -y` downloads [`image-studio-mcp`](https://www.npmjs.com/package/image-studio-mcp) from npm on first run and caches it. Restart your Claude Code session, then verify:

```bash
claude mcp list
# → image-studio: npx -y image-studio-mcp - ✓ Connected
```

**That's it.** Now ask Claude anything like:

- *"Convert all PNGs in /Users/me/icons/ to webp quality 80."*
- *"What's the size of /Users/me/photo.jpg?"*
- *"Resize /Users/me/banner.png to width 1200 keeping aspect ratio."*
- *"Crop the top-left 500×500 out of /Users/me/screenshot.png."*

Five tools exposed: `get_image_info`, `convert_image`, `resize_image`, `crop_image`, `batch_convert`. Full tool reference on the [npm page](https://www.npmjs.com/package/image-studio-mcp).

### Cursor / Claude Desktop

Add to your MCP config (`~/.cursor/mcp.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "image-studio": {
      "command": "npx",
      "args": ["-y", "image-studio-mcp"]
    }
  }
}
```

### AI security constraints

Enforced at every tool call:

- **Absolute paths only** — no `..` traversal.
- **Max 100 MB per file.**
- **Globs need a concrete base directory** (`/Users/me/foo/**/*.png`, not bare `**/*.png`).
- **Overwrite protection** — `dst` existence check, requires explicit `overwrite: true` to replace.

---

## Install & use the GUI side (VSCode extension)

1. **Download** `image-studio-<your-platform>.vsix` from the [GitHub Releases](https://github.com/adammery/image-studio/releases) page.
2. **Install**:
   ```bash
   code --install-extension image-studio-<platform>.vsix
   ```
   (or drag the `.vsix` into a VSCode window)
3. **Use**:
   - Click the **Image Studio** icon in the Activity Bar (or press `Cmd+Shift+\` on Mac / `Ctrl+Shift+\` elsewhere).
   - Pick any PNG / JPG / WebP / AVIF from the sidebar tree.
   - Crop / Resize / Compress in the right panel. Watch the live Before/After size reduction badge.
   - Press **Save** (or tick "Replace old image" to trash the original on save).

Full feature list, keyboard shortcuts, and settings: [`packages/extension/README.md`](packages/extension/README.md).

> **Note on platforms.** The `.vsix` bundles sharp's native libvips binary, so each `.vsix` is OS- and CPU-specific. Currently only `darwin-arm64` (Apple Silicon Mac) is published. Linux / Windows / Intel Mac builds coming.

---

## Status

**MVP complete.** 69 tests pass (45 core + 21 mcp-server + 3 extension).

- **Plan 1 shipped** — `@image-studio/core` + `image-studio-mcp` (5 MCP tools).
- **Plan 2 shipped** — `@image-studio/extension` (custom editor, sidebar, `.vsix` packaging).

## Repository layout (monorepo)

- `packages/core/` — sharp-based image operations (pure library, no VSCode/MCP deps)
- `packages/mcp-server/` — MCP server → published on npm as [`image-studio-mcp`](https://www.npmjs.com/package/image-studio-mcp)
- `packages/extension/` — VSCode extension → packaged as `.vsix`

## Development

Requires Node 20 LTS.

```bash
nvm use            # activate Node 20 from .nvmrc
npm install        # installs all workspace packages
npm test           # runs all package tests (69 expected)
npm run build      # compiles dist/ for all packages
```

### Running the MCP server from a local clone

Skips the npm registry — useful while hacking on the server:

```bash
npm run build
claude mcp add --transport stdio --scope user image-studio-dev \
  -- node /absolute/path/to/image-studio/packages/mcp-server/dist/index.js
```

Uses a different name (`image-studio-dev`) so it coexists with the published `image-studio` registration.

### Building a `.vsix` for the extension

```bash
cd packages/extension
./scripts/package.sh
code --install-extension image-studio.vsix
```

The script produces `image-studio.vsix` in `packages/extension/`. It bundles sharp for the host platform only.

## License

MIT
