# Image Studio — Design Spec

**Date:** 2026-04-22
**Status:** Draft (pending user approval)
**Name:** `image-studio` (npm / git / technical id)
**Display name:** Image Studio

---

## 1. Overview

A VSCode extension that replaces the default read-only image preview with a full-featured image editor. Supports crop, resize, format conversion (PNG / JPEG / WebP / AVIF), and quality control. Ships alongside a bundled MCP server so AI assistants (Claude Code, Cursor, Claude Desktop, any MCP client) can programmatically convert images on user request (e.g., "convert all PNGs in /icons to webp 80").

**Target runtimes:** VSCode 1.90+, and any VSCode-based fork (Cursor, Windsurf, VSCodium).
**Target platforms:** macOS, Windows, Linux — same as VSCode itself.

---

## 2. Goals

- **Replace** the stock read-only image preview with an editor supporting the operations below.
- **Provide AI access** via MCP so image operations can be driven by natural language from any MCP client.
- **Stay focused on image editing.** No scope creep into other tools or broader IDE customization — one thing, done well.

---

## 3. Non-goals (MVP scope bounds)

Explicitly **NOT in MVP.** May come in later iterations:

- Rotate 90° / Flip horizontal / Flip vertical
- GIF support (multi-frame handling complicates the pipeline)
- Undo / Redo history
- Side-by-side before/after split view
- Custom keyboard shortcuts beyond defaults (Escape / Save)
- Live compression preview beyond status-bar estimate
- CLI tool (thin wrapper over `core/`, ~1 hour of work, added when needed)
- Dark/light theme overrides in the webview (uses VSCode's own theme tokens)

---

## 4. Architecture

Monorepo with three packages under `packages/`:

```
image-studio/
├── packages/
│   ├── core/            sharp operations; pure library
│   ├── extension/       VSCode extension + webview
│   └── mcp-server/      MCP protocol handler
```

`core` is the single source of truth for image operations. `extension` and `mcp-server` are thin wrappers that expose `core` to two different consumers: the GUI webview and AI tools.

### 4.1 GUI data flow

```
User opens PNG/JPG/WebP/AVIF
  → VSCode routes to our CustomEditorProvider (contributes.customEditors, priority: "default")
  → Extension host creates webview with HTML/CSS/TS
  → Webview renders canvas + toolbar
  → User interacts (Crop, Resize, Format, Quality, Save)
  → postMessage from webview to extension host
  → Extension host invokes core functions
  → sharp executes operation
  → File written to disk (Save) OR preview buffer returned (in-memory edits)
```

### 4.2 AI (MCP) data flow

```
User in Claude Code (or other MCP client):
  "convert /Users/adam/project/icons/*.png to webp 80"
  → Claude invokes MCP tool batch_convert({pattern, format: "webp", quality: 80})
  → MCP server (separate Node process, spawned by MCP client) receives call via stdio
  → Server calls core batch function
  → sharp executes per-file
  → Aggregated result serialized back to Claude
  → Claude reports outcome to user
```

**Key property:** `core/` is identical for both paths. One implementation, two thin wrappers (WebView ↔ extension host; MCP tool ↔ core function).

---

## 5. UI & UX (GUI editor)

### 5.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [Tab: my-image.png ×]                                       │
├─────────────────────────────────────────────────────────────┤
│ TOOLBAR                                                     │
│  [Crop] [Resize]  |  Format: [Same ▾]  Quality: [──●──] 80  │
│                      ☐ Lossless   [Save]  [Save As…]        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                    CANVAS (fit-to-window)                   │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 1920×1080 PNG  •  2.3 MB  →  est. 412 KB (WebP 80, lossy)   │
└─────────────────────────────────────────────────────────────┘
```

Four zones: **tab header** (VSCode-native), **toolbar**, **canvas**, **status bar** (metadata + live-estimate of resulting size).

### 5.2 Open behavior

- VSCode routes PNG/JPG/WebP/AVIF to our editor (priority: `default`).
- Canvas: fit-to-window zoom, centered.
- Toolbar defaults: `Format = "Same as source"`, `Quality = 80`, no crop/resize applied.
- Status bar: current dimensions, file size. When format/quality changes, an "→ est. XYZ KB" appears (debounced ~300 ms).

### 5.3 Crop flow

1. Click **Crop** → canvas enters crop mode: semi-transparent overlay outside the selection, eight drag handles (four corners + four edge midpoints).
2. User drags handles to resize selection, or mid-drags inside to move the whole selection.
3. Toolbar updates: **Crop** → **Apply Crop** + **Cancel** appears next to it.
4. **Apply Crop** → canvas updates the preview (not yet saved to disk), toolbar returns to normal mode.
5. **Cancel** or `Escape` → selection cleared, no change.

### 5.4 Resize flow

Click **Resize** opens a popover anchored to the button:

```
┌─ Resize ─────────────┐
│ Width:  [1920] px ▾  │   ← unit selector: px | %
│ Height: [1080] px ▾  │
│ ☑ Lock aspect ratio  │
│ [Apply]  [Cancel]    │
└──────────────────────┘
```

Apply → canvas shows the resized preview (still unsaved).

### 5.5 Format + Quality

- **Format dropdown:** `Same as source | PNG | JPEG | WebP | AVIF`.
- **Quality slider (0–100):** visible for JPEG / WebP / AVIF. Hidden for PNG (always lossless).
- **Lossless toggle:** visible for WebP / AVIF. When checked, quality slider grays out (irrelevant).
- **Live size estimate** in the status bar: when format or quality change, a debounced (~300 ms) background call to `sharp(...).toBuffer()` estimates output size; shown as "→ est. XYZ KB (WebP 80, lossy)".

### 5.6 Save / Save As

- **Save:**
  - Format unchanged → overwrites original, no prompt.
  - Format changed (e.g., opened `.png`, now saving as WebP) → modal dialog:
    ```
    You changed the format from PNG to WebP.
    Saving will replace the original file, changing
    its extension from .png to .webp.

    [Cancel]   [Save As… instead]   [Replace with .webp]
    ```
    This protects against unintentional loss of the original file.
- **Save As:** always opens the system file dialog; chosen path and extension are respected.

### 5.7 Error states (MVP)

- **File unreadable** → error banner above canvas, toolbar disabled.
- **Sharp operation fails** → VSCode toast (via `showErrorMessage`) with description; canvas remains at last valid state.
- **Invalid input** (e.g., resize = 0) → inline red helper text near the input; Apply disabled.

### 5.8 External file changes (AI writes while editor is open)

When Claude (via MCP) modifies a file that's currently open in the GUI editor, VSCode detects the file change. Default VSCode behavior takes over: the editor reloads if there are no local preview edits; otherwise a "File was modified externally. Reload? / Keep your changes?" toast appears. No custom handling required.

---

## 6. AI Interface (MCP Tools)

### 6.1 MCP server

Standalone Node process, distributed as npm package `image-studio-mcp`. Launched by the MCP client (Claude Code, Cursor, etc.) per user config. Completely independent from the extension — either can run without the other.

**Sample Claude Code configuration:**

```json
{
  "mcpServers": {
    "image-editor": {
      "command": "npx",
      "args": ["-y", "image-studio-mcp"]
    }
  }
}
```

`npx -y` downloads and runs without requiring a global install.

### 6.2 Tool inventory

Five tools exposed by the MCP server:

**`convert_image`** — single-file format conversion
```
input:  { src, dst?, format: "png"|"jpeg"|"webp"|"avif", quality?, lossless?, overwrite? }
output: { dst, size, width, height }
```

**`resize_image`** — resize by dimensions
```
input:  { src, dst?, width?, height?, fit?: "inside"|"cover"|"contain" }
output: { dst, size, width, height }
```

**`crop_image`** — extract rectangle
```
input:  { src, dst?, x, y, width, height }   // pixels from top-left
output: { dst, size, width, height }
```

**`get_image_info`** — metadata only, read-only
```
input:  { src }
output: { width, height, format, size, hasAlpha, colorspace }
```

**`batch_convert`** — multi-file, glob or explicit list
```
input: {
  files?: string[],         // explicit list of paths, OR
  pattern?: string,         // glob like "/Users/adam/project/icons/**/*.png"
  format, quality?, lossless?,
  outSuffix?: string,       // e.g., "-compressed" → "logo-compressed.webp"
                            // if omitted: replaces extension next to source
  overwrite?: boolean       // default false
}
output: {
  converted: Array<{ src, dst, size, width, height }>,
  failed: Array<{ src, error }>,
  totalIn: bytes,
  totalOut: bytes
}
```

### 6.3 Default `dst` semantics

- If `dst` omitted and format differs from source: output goes to source-with-new-extension (e.g., `foo.png` + format `webp` → `foo.webp`). Source is **not** modified.
- If `dst` omitted and format equals source: output overwrites source.
- If `dst` provided: output goes to `dst`. If `dst` exists and `overwrite: true` is not set, returns `OutputExists` error.

Rationale: AI should never destroy source files unintentionally when changing format.

### 6.4 Security constraints

- **Absolute paths only.** Relative paths rejected (MCP server's cwd is unpredictable). `..` traversal rejected preventively.
- **Max 100 MB per file** in MVP. Above → `TooLarge` error.
- **Glob patterns require a concrete base directory.** Pattern `**/*` without base rejected; must be `/concrete/path/**/*`.
- **Overwrite protection:** `dst` existence check. If exists and `overwrite: true` not specified → `OutputExists` error, AI can retry explicitly.
- **No elevated privileges.** Server runs in user space; can read/write only what the user can.

### 6.5 Error codes

Structured error responses let Claude react appropriately:

```
code: "FileNotFound" | "InvalidFormat" | "OutputExists"
    | "TooLarge"    | "SharpError"    | "PermissionDenied"
message: string
detail?: string
```

---

## 7. Tech Stack

| Layer | Package | Version (MVP) |
|---|---|---|
| Language | TypeScript | 5.x |
| Image processing | `sharp` | 0.33.x |
| VSCode API | `@types/vscode` | 1.90+ |
| MCP protocol | `@modelcontextprotocol/sdk` | latest |
| Build | `esbuild` | latest |
| Tests | `vitest` | latest |
| Linting | `eslint` + `@typescript-eslint` | latest |
| Glob matching | `fast-glob` | latest |
| Extension packaging | `vsce` | latest |

All standard, well-maintained, no vendor lock-in.

---

## 8. File Structure

```
image-studio/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── convert.ts
│   │   │   ├── resize.ts
│   │   │   ├── crop.ts
│   │   │   ├── probe.ts
│   │   │   ├── batch.ts
│   │   │   └── index.ts
│   │   ├── test/
│   │   │   ├── fixtures/              small test images
│   │   │   ├── convert.test.ts
│   │   │   ├── resize.test.ts
│   │   │   └── ...
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── extension/
│   │   ├── src/
│   │   │   ├── extension.ts           activate() / deactivate()
│   │   │   ├── imageEditorProvider.ts CustomEditorProvider impl
│   │   │   ├── webviewContent.ts      HTML generation
│   │   │   └── bridge.ts              postMessage wrapper
│   │   ├── media/
│   │   │   ├── webview.html           webview entry
│   │   │   ├── webview.js             canvas, toolbar, interactions
│   │   │   └── webview.css
│   │   ├── test/
│   │   │   └── integration.test.ts    sparse: extension host tests
│   │   ├── package.json               VSCode extension manifest
│   │   └── tsconfig.json
│   │
│   └── mcp-server/
│       ├── src/
│       │   ├── server.ts              MCP protocol handler
│       │   ├── tools.ts               tool schemas + wrappers
│       │   └── index.ts               entry point (with shebang)
│       ├── test/
│       │   └── server.test.ts         spawn process, verify tool calls
│       └── package.json               bin: image-studio-mcp
│
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-04-22-image-editor-design.md   (this file)
│
├── package.json                       npm workspaces root
├── tsconfig.base.json
├── .gitignore
├── .nvmrc                             Node 20 LTS
├── CLAUDE.md                          project-level guidance
└── README.md                          install + setup guide
```

---

## 9. Testing Strategy

- **`core/`** — full unit coverage via `vitest`. Happy path, edge cases, invalid input. Fixtures in `test/fixtures/` (small PNG/JPG/WebP/AVIF samples). Target >90% coverage — this is where all business logic lives, must be rock-solid.

- **`mcp-server/`** — integration tests: spawn the server process, send tool calls via stdio, verify output files exist with correct format and approximate size. Happy path + error cases (`FileNotFound`, `OutputExists`, `TooLarge`).

- **`extension/`** — sparse automated tests (VSCode extension auto-testing is painful and brittle — not worth heavy investment). Cover only critical flows (custom editor registration, file opening). Primary verification is **manual** via Extension Development Host.

- **Golden file tests** — for conversions, reference output files (e.g., `sample-256.webp.q80`) committed to `test/fixtures/golden/`. Pixel-diff against current output to catch regressions if sharp's internal encoder ever changes.

---

## 10. Development Workflow

```bash
# Terminal 1 (background, continuous)
npm run dev               # parallel watch for all packages, <1s rebuild on save

# Terminal 2 (tests, continuous)
npm test -- --watch       # vitest re-runs affected tests on change
```

**GUI testing (manual, user's role):**
- Open VSCode in the project root.
- Press `F5` → launches Extension Development Host (new VSCode window with extension loaded).
- In the dev host, open a PNG/JPG/WebP/AVIF — our editor appears.
- `Cmd+R` in the dev host to reload after code changes.
- User reports visual behavior back to Claude (e.g., "crop handle doesn't drag" or "works, next").

**MCP testing during development:**
- Point Claude Code config at a local path (not `npx`) while iterating: `{ "command": "node", "args": ["/absolute/path/to/packages/mcp-server/dist/index.js"] }`.
- Restart Claude Code to pick up code changes.
- Watch stdout log of the MCP server for debugging.

---

## 11. Distribution

### 11.1 Extension

```bash
npm run package
# Produces image-studio-0.1.0.vsix
```

User installs via `code --install-extension image-studio-0.1.0.vsix`, or via the VSCode UI (`Extensions panel → ... → Install from VSIX`).

Later: publish to OpenVSX and VSCode Marketplace.

### 11.2 MCP server

```bash
npm publish
```

User adds the config snippet (shown in §6.1) to Claude Code settings. `npx -y` pulls the package on first run; no global install required.

---

## 12. Implementation Phasing

Four phases. After each, the project is in a shippable state — no half-done intermediates.

1. **Setup + core.** Git init, npm workspaces, tooling (`tsconfig.base.json`, eslint, vitest, `.nvmrc`), `core/` package with `convert`, `resize`, `crop`, `probe`, `batch`, plus full unit test coverage.
   *End state:* `npm test` green, all operations verified via fixtures.

2. **MCP server.** Wrap `core` as MCP tools per §6.2. Integration tests spawn the server and verify tool calls. Manual verification: connect to Claude Code locally and confirm Claude can call `convert_image` and receives correct output.
   *End state:* AI-driven image conversion is **already functional**, before the GUI editor exists. This is the "first thing" the user wanted.

3. **Extension base.** `extension/` package with `CustomEditorProvider` + webview. Basic flow: open PNG → see it in our editor → change format dropdown → Save overwrites file. Toolbar present but minimal.
   *End state:* GUI editor open and usable for format conversion.

4. **Polish.** Interactive crop handles (draggable), resize popover, live size estimate in status bar, error UI, packaging to `.vsix`, README.
   *End state:* v0.1.0 ready to share.

**Estimated session count:** Phases 1+2 in one session, Phase 3 in the second, Phase 4 in the third. Session length depends on the user's availability and Claude Code's iteration speed.

---

## 13. Future Work (post-MVP)

Scope stays strictly on image editing. Potential iterations, all within the same extension:

- Rotate 90° / Flip horizontal / Flip vertical
- GIF support (multi-frame animation)
- Undo / Redo history stack
- Split-view before/after comparison
- CLI thin wrapper (`img-convert`) for terminal and scripting use

---

## 14. Open Questions

None. All decision points resolved during brainstorming:

- Fork vs extension → **extension** (focused scope)
- Architecture → **3-package monorepo, shared `core/`**
- Save semantics → **modal confirmation when format changes**
- AI interface → **MCP only for MVP, CLI later**
- Default `dst` → **never overwrite source on format change**
- Overwrite protection → **explicit `overwrite: true` required**
- Security defaults → **absolute paths, base-dir globs, 100 MB limit, no privileges**
