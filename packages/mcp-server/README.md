# image-studio-mcp

MCP server that exposes image operations (crop, resize, format conversion, batch) to AI clients via [sharp](https://sharp.pixelplumbing.com/). Works with any MCP-compatible client: Claude Code, Cursor, Claude Desktop.

Part of [Image Studio](https://github.com/adammery/image-studio) — a VSCode image editor with AI-driven conversion. This package is the standalone AI side; the VSCode extension is separate.

## Install

No manual install needed. Register with your MCP client and `npx -y` will download the package on first run.

### Claude Code

```bash
claude mcp add --transport stdio --scope user image-studio -- npx -y image-studio-mcp
```

Restart Claude Code and verify:

```bash
claude mcp list
# → image-studio: npx -y image-studio-mcp - ✓ Connected
```

**Now ask Claude anything like:**

- *"Convert all PNGs in /Users/me/icons/ to webp quality 80."*
- *"What's the size of /Users/me/photo.jpg?"*
- *"Resize /Users/me/banner.png to width 1200 keeping aspect ratio."*

### Cursor / Claude Desktop

Add to your MCP config (usually `~/.cursor/mcp.json` or `claude_desktop_config.json`):

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

## Tools

Five tools, all operating on local files (absolute paths only).

### `get_image_info(src)`

Read metadata without modifying the file.

```
{ width: 1920, height: 1080, format: "png", size: 234521, hasAlpha: true, colorspace: "srgb" }
```

### `convert_image({ src, format, quality?, lossless?, dst?, overwrite? })`

Single-file format conversion. `format` is one of `png`, `jpeg`, `webp`, `avif`. When `dst` is omitted and the source/target formats differ, the output is written next to the source with the new extension.

### `resize_image({ src, width?, height?, fit?, dst?, overwrite? })`

Resize by dimensions. `fit` is one of `cover`, `contain`, `fill`, `inside`, `outside` (default `inside`, i.e. aspect-preserving).

### `crop_image({ src, x, y, width, height, dst?, overwrite? })`

Extract a rectangle from the image.

### `batch_convert({ files? | pattern?, format, quality?, outSuffix?, overwrite? })`

Multi-file conversion. Either `files` (array of absolute paths) or `pattern` (glob with a concrete base directory, e.g. `/Users/me/icons/**/*.png`).

## Example prompts

- "Convert all PNGs in `/Users/me/icons/` to webp quality 80."
- "What's the size of `/Users/me/photo.jpg`?"
- "Resize `/Users/me/banner.png` to width 1200 keeping aspect ratio."
- "Crop the top-left 500x500 pixels out of `/Users/me/screenshot.png`."

## Security constraints

Enforced at the AI boundary:

- **Absolute paths only.** No relative paths, no `..` traversal.
- **Max 100 MB per file.**
- **Glob patterns must have a concrete base directory.** `/Users/me/foo/**/*.png` is allowed; bare `**/*.png` is rejected.
- **Overwrite protection.** If `dst` exists and `overwrite: true` is not set, the call returns an `OutputExists` error rather than silently replacing the file.

All encoding runs locally through sharp's native libvips binary. No network I/O, no uploads, no telemetry.

## Requirements

- Node.js 20 LTS or later
- An MCP-compatible client (Claude Code, Cursor, Claude Desktop, etc.)

## Links

- Source: [github.com/adammery/image-studio](https://github.com/adammery/image-studio)
- VSCode extension (GUI counterpart): same repo, `packages/extension/`
- Issues: [github.com/adammery/image-studio/issues](https://github.com/adammery/image-studio/issues)

## License

MIT
