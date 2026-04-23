# Image Studio

Image editor and AI converter for VSCode.

## Status

MVP under active development. See `docs/superpowers/specs/` for the design
and `docs/superpowers/plans/` for implementation plans.

## Packages

- `packages/core/` — sharp-based image operations (pure library)
- `packages/mcp-server/` — MCP server exposing operations for AI clients
- `packages/extension/` — VSCode extension (Plan 2, not yet implemented)

## Development

Requires Node 20 LTS.

```bash
nvm use            # activate Node 20 from .nvmrc
npm install        # installs all workspace packages
npm test           # runs all package tests
npm run build      # compiles dist/ for all packages
```

## Using the MCP server with Claude Code (local development)

After `npm run build`, register the server with Claude Code's CLI:

```bash
claude mcp add --transport stdio --scope user image-studio \
  -- node /absolute/path/to/image-studio/packages/mcp-server/dist/index.js
```

This writes to `~/.claude.json` (Claude Code's MCP config — distinct from `~/.claude/settings.json`). Verify with:

```bash
claude mcp list                  # should show image-studio with ✓ Connected
claude mcp get image-studio      # details
```

Restart your active Claude Code session so it picks up the new server. The following tools then become available:

- `get_image_info(src)` — read metadata without modifying the file
- `convert_image({src, format, quality?, lossless?, dst?, overwrite?})` — single-file format conversion
- `resize_image({src, width?, height?, fit?, dst?, overwrite?})` — resize by dimensions
- `crop_image({src, x, y, width, height, dst?, overwrite?})` — extract rectangle
- `batch_convert({files? | pattern?, format, quality?, outSuffix?, overwrite?})` — multi-file conversion

### Example prompts

- "Convert all PNGs in `/Users/me/icons/` to webp quality 80."
- "What size is `/Users/me/photo.jpg`?"
- "Resize `/Users/me/banner.png` to width 1200 keeping aspect ratio."
- "Crop the top-left 500x500 pixels out of `/Users/me/screenshot.png`."

### Security constraints

The MCP server enforces the following at the AI boundary:

- Absolute paths only (no relative paths, no `..` traversal)
- Max 100 MB per file
- Glob patterns must have a concrete base directory (`/Users/me/foo/**/*.png`, not `**/*.png`)
- Overwrite protection: `dst` existence is checked; requires explicit `overwrite: true` to replace

## License

MIT
