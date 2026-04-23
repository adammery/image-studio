# Plan 2 — VSCode Extension GUI (design)

**Status:** Ready for implementation planning
**Date:** 2026-04-23
**Supersedes:** Sections 5.1, 5.3, 5.4, 5.6 of `2026-04-22-image-editor-design.md` (main spec). All other sections of the main spec remain authoritative.

## 1. Purpose

This document is the authoritative design for **Plan 2**, which implements the VSCode extension GUI portion of Image Studio. It refines and extends the original spec's Section 5 based on UI decisions made during brainstorming.

Plan 1 (already merged) delivered `@image-studio/core` and `image-studio-mcp`. Plan 2 adds `@image-studio/extension` — a VSCode extension that registers a `CustomEditorProvider` for PNG/JPG/WebP/AVIF and opens them in a webview-based image editor.

## 2. Scope

Plan 2 implements:

1. Everything in the main spec Section 5 (as amended by this document)
2. **Compare** mode — floating pill, Off / Slider / Side-by-side, default Slider
3. **Zoom and pan** — scroll-wheel zoom, space-drag pan, Fit reset
4. **Save & Trash** — option to move the original file to the system Trash after saving to a new format or path
5. **Rich Before/After info panel** — replaces the single-line status bar from Section 5.1

Out of scope (deferred to Plan 3+):

- Backup / hot-exit support (unsaved edits do not persist across tab close or crash)
- Icon-tab right panel variant (current inline accordion sections are fine for MVP)
- All items in main spec Section 13 "Future Work" (GIF, rotate/flip, undo/redo, etc.)

## 3. Architecture

Three concerns, three layers:

```
┌──────────────────────────────────────────────────────┐
│  VSCode extension host (Node)                        │
│  ┌────────────────────────────────────────────────┐  │
│  │  @image-studio/extension                       │  │
│  │  • CustomEditorProvider                        │  │
│  │  • save / saveAs / trash orchestration         │  │
│  │  • debounced preview encoder                   │  │
│  │  • postMessage bridge                          │  │
│  └───────────────┬────────────────────────────────┘  │
│                  │                                    │
│                  │ dynamic import                     │
│                  ▼                                    │
│  ┌────────────────────────────────────────────────┐  │
│  │  @image-studio/core  (already shipped)         │  │
│  │  • applyEdits()  ← NEW in Plan 2               │  │
│  │  • convertImage, resizeImage, cropImage        │  │
│  │  • probe                                       │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                         ▲ postMessage
                         │
┌────────────────────────┴─────────────────────────────┐
│  Webview (Chromium sandbox)                          │
│  • plain HTML + TS bundled via esbuild               │
│  • <img> for preview, absolutely-positioned overlays │
│  • CSS transform for zoom/pan                        │
│  • no framework (plain JS, module-scoped state)      │
└──────────────────────────────────────────────────────┘
```

### 3.1 New core function: `applyEdits`

A single entry point that runs the full edit pipeline in order `crop → resize → format/quality` and writes the result.

```ts
export interface EditState {
  crop?:   { x: number; y: number; width: number; height: number };
  resize?: { width: number; height: number; lockAspect: boolean };
  format:  'same' | 'png' | 'jpeg' | 'webp' | 'avif';
  quality: number;    // 0–100, ignored for PNG and when lossless=true
  lossless: boolean;  // WebP/AVIF only
}

export interface ApplyEditsOptions {
  overwrite?: boolean;       // default false
  trashOriginal?: boolean;   // if true and dst !== src, move src to Trash after write
}

export interface ApplyEditsResult {
  dst: string;
  size: number;
  width: number;
  height: number;
  originalTrashed: boolean;
}

export async function applyEdits(
  src: string,
  dst: string,
  state: EditState,
  opts?: ApplyEditsOptions,
): Promise<ApplyEditsResult>;
```

Trash is performed via the npm `trash` package (cross-platform: macOS Trash, Linux XDG Trash, Windows Recycle Bin). If trashing fails, the save itself has already succeeded; `originalTrashed: false` is returned and the caller surfaces a non-fatal warning.

### 3.2 Extension package

New package `@image-studio/extension`, directory `packages/extension/`. Bundled to a single `dist/extension.js` via esbuild. Webview bundle `media/webview.js` built separately (also via esbuild, target `chrome100`, ESM).

Key files:

```
packages/extension/
├── package.json               contributes.customEditors
├── src/
│   ├── extension.ts           activate / deactivate
│   ├── imageEditorProvider.ts CustomEditorProvider impl
│   ├── webviewContent.ts      HTML + CSP + asWebviewUri
│   ├── bridge.ts              postMessage protocol types + dispatcher
│   ├── previewEncoder.ts      debounced sharp.toBuffer pipeline
│   └── saveOrchestrator.ts    save / saveAs / trash logic
├── media/
│   ├── webview.html           entry HTML (served via asWebviewUri)
│   ├── webview.ts             webview source (bundled to webview.js)
│   └── webview.css
└── test/
    └── integration.test.ts    sparse: activation + customEditor registration
```

### 3.3 CustomEditor registration

`package.json`:

```json
"contributes": {
  "customEditors": [{
    "viewType": "imageStudio.editor",
    "displayName": "Image Studio",
    "selector": [
      { "filenamePattern": "*.png" },
      { "filenamePattern": "*.jpg" },
      { "filenamePattern": "*.jpeg" },
      { "filenamePattern": "*.webp" },
      { "filenamePattern": "*.avif" }
    ],
    "priority": "default"
  }]
}
```

## 4. UI layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [Tab: landscape.png ●  ×]                                        │
├──────────────────────────────────────────┬───────────────────────┤
│        ┌──────────────────────┐          │ ▾ CROP                │
│        │ Off | SLIDER | S×S  │          │   [Start crop]        │
│        └──────────────────────┘          │                       │
│                                          │ ▾ RESIZE              │
│                                          │   Width  [1920] px    │
│             ┌────────────────┐           │   Height [1080] px    │
│             │                │           │   ☑ Lock aspect       │
│             │    CANVAS      │           │   [Apply]             │
│             │  (image + compare +        │                       │
│             │    crop overlay)           │ ▾ COMPRESS            │
│             │                │           │   Format: [WebP ▾]    │
│             └────────────────┘           │   Quality: [──●──] 80 │
│                                          │   ☐ Lossless          │
│                                          ├───────────────────────┤
│                            [− 100% + Fit]│   [Save] [Save As…]   │
│                                          │   ☐ Move original to  │
│                                          │      Trash after save │
├──────────────────────────────────────────┴───────────────────────┤
│  BEFORE                     →    AFTER (estimate)                │
│  landscape.png                   landscape.webp                  │
│  1920 × 1080 px  ·  PNG          1920 × 1080 px  ·  WebP, q80    │
│  2.3 MB                          412 KB   −82%                   │
└──────────────────────────────────────────────────────────────────┘
```

Four zones:

1. **Tab header** — VSCode-native, with dirty indicator `●`.
2. **Canvas** (left) — fit-to-window by default. Hosts: the image, Compare pill (top-center floating), Zoom pill (bottom-right floating), and the crop overlay when in crop mode.
3. **Right panel** (260 px fixed) — three collapsible accordion sections (Crop / Resize / Compress) + bottom-pinned Save footer.
4. **Bottom info panel** — Before | → | After (estimate) in two columns separated by an arrow. Replaces the single-line status bar from the main spec.

### 4.1 Compare pill (top-center of canvas)

Three modes:

- **Off** (no preview generation — fastest, only size estimate runs)
- **Slider** — two full-canvas images layered; top clipped via `clip-path: inset(0 Y% 0 0)`; user drags a vertical handle. Left of handle = original, right = after.
- **Side by side** — canvas splits into two halves; original left, after right; each fit-to-window inside its half. A thin separator between.

Default is **Slider** on editor open.

### 4.2 Zoom pill (bottom-right of canvas)

Controls: `[−]  pct  [+]  [Fit]`. Additional input:

- **Scroll wheel** — zoom toward cursor position (zoom increments of 10% above 100%, 5% below 100%).
- **Space + drag** — pan (cursor changes to grab).
- **Double-click on image** — reset to Fit.
- **Zoom range** — 10% (min) to 800% (max).
- Applying a zoom at >100% or panning shows the pill persistently; at exactly Fit it fades in only on hover.

Zoom and pan are view-state only — they do not affect the edit state or the saved output.

### 4.3 Right panel sections

All three sections are open by default. Clicking the header caret collapses / expands the body. Section state is not persisted (session-local).

- **Crop** — `[Start crop]` button. Clicking enters crop mode (see §5.3).
- **Resize** — Width + Height numeric inputs, unit selector (`px` | `%`), Lock aspect ratio checkbox (default on), `[Apply]` button. Apply commits to `editState.resize`.
- **Compress** — Format dropdown (Same | PNG | JPEG | WebP | AVIF), Quality slider (0–100), Lossless checkbox. Quality hidden for PNG; Lossless only visible for WebP / AVIF; when Lossless on, Quality grays out.

### 4.4 Save footer

Pinned to the bottom of the right panel (no scroll). Contains:

- `[Save]` (primary button)
- `[Save As…]` (secondary button)
- `☐ Move original to Trash after save` — checkbox, enabled only when the target path would differ from the source (format changed OR Save As was selected). Disabled with reduced opacity otherwise, with a tooltip `No original to remove — same file is being overwritten`.

### 4.5 Bottom info panel (Before / After)

Two columns separated by a large `→` divider. Each column shows:

- **Filename** (shown bold, slightly brighter)
- **Dimensions × format** (e.g., `1920 × 1080 px · WebP, q80`)
- **Size** (with `−82%` reduction badge in green on the After column if it is smaller than Before)

Updates reactively as edit state changes (debounced 300 ms via the preview pipeline, §6).

## 5. Interaction flows

### 5.1 Open behavior

When the user opens a PNG/JPG/WebP/AVIF:

1. VSCode routes it to our CustomEditorProvider (priority `default`).
2. Provider creates the webview, loads `media/webview.html`, and sends an `init` message with:
   - `imageUri` — `webview.asWebviewUri(vscode.Uri.file(path))`
   - `meta` — result of `core.getImageInfo(path)` (width, height, format, size)
3. Webview renders the image and populates the Before column.
4. Default edit state: no crop, no resize, format = 'same', quality = 80, lossless = false, compareMode = 'slider'.
5. Tab is **not** dirty (no deviation from defaults — see §8).

### 5.2 Resize flow

Inline in the right panel (not a popover — changed from main spec 5.4):

1. User types Width or Height. If Lock aspect is on, the other dimension recalculates from the source aspect ratio on blur.
2. Unit selector (`px` | `%`) toggles between absolute pixels and percentage of source.
3. `[Apply]` commits the values to `editState.resize`. The canvas preview does not visibly change (canvas stays fit-to-window); only the After info panel reflects the new dimensions.
4. `[Cancel]` (keyboard `Esc` when focused in resize inputs) reverts any typed but not-applied values to the current resize state.

### 5.3 Crop flow

1. `[Start crop]` → canvas enters crop mode:
   - Dimming overlay on the portions of the image outside the selection (semi-transparent black).
   - Selection rectangle with 8 drag handles (4 corners + 4 edge midpoints).
   - Toolbar (top center above canvas) changes from Compare pill to `[Apply] [Cancel]`.
   - Panel's Crop section body becomes `[Apply] [Cancel]` as well (both trigger same action).
2. User drags handles to resize; drags inside the selection to move.
3. `[Apply]` → commits rect to `editState.crop`, canvas re-fits showing only the cropped region (visually zooms to the cropped area), Compare pill reappears.
4. `[Cancel]` / `Esc` → selection cleared, no edit state change.
5. Minimum selection size: 10 × 10 pixels. Cannot drag outside image bounds.
6. A crop can be re-cropped: user clicks Start crop again, existing crop rect is loaded as the initial selection.

### 5.4 Compress section

- Quality slider changes are debounced 300 ms before triggering preview pipeline (§6).
- Changing Format to a lossy format (JPEG/WebP/AVIF) reveals Quality; to PNG hides it.
- Toggling Lossless grays out Quality.

### 5.5 Compare flow

- `Off` — no after-image generated; canvas shows only source with current transform. Fastest.
- `Slider` — on entry, extension generates an after-image buffer via the preview pipeline (§6). Webview displays both images stacked; user drags the handle to reveal.
- `Side by side` — same as Slider for encoding, but webview lays the two images in split halves.
- Switching between Slider ↔ Side-by-side reuses the cached after-image buffer (does not trigger a re-encode).
- Switching format/quality while Compare is on triggers a new encode (debounced).
- Crop and Resize edits apply to both sides equally — the "original" side always shows the source with pre-compression pixels but with crop/resize applied client-side for visual parity.

### 5.6 Zoom / pan

- Scroll wheel on canvas → zoom centered on cursor position.
- Holding `Space` then drag → pan.
- Zoom pct input is read-only in MVP (display only; no direct-enter).
- `[+]` / `[−]` zoom in 10% increments; `[Fit]` resets to fit-to-window.
- Zoom/pan state is local to canvas only; does not persist across editor reopens.

### 5.7 Save flow

Three user-initiated paths:

1. **`[Save]` button or `Cmd+S`** when focus is on the webview:
   - If `editState.format` is `same` or equal to source format, and no crop/resize applied: no-op (shouldn't happen because button would be disabled at non-dirty).
   - If format changed (`.png` → `.webp`): show format-change modal (see below).
   - Else overwrite source file.
   - If `trashOriginal` checkbox checked AND destination path ≠ source path: after successful write, call `trash(sourcePath)`.
2. **`[Save As…]`**: show VSCode's native save dialog. User picks destination (filename + extension). Save executes to that path. Trash checkbox applies identically.
3. **Format-change modal** (retained from main spec 5.6, adjusted):

   ```
   You changed the format from PNG to WebP.

   Saving will create landscape.webp next to landscape.png.
   The original .png file will remain unless you check
   "Move original to Trash" in the side panel.

   [Cancel]   [Save As… instead]   [Save as .webp]
   ```

Save lifecycle transitions:

- **Save where dst = src** (overwrite): edit state resets to defaults, tab clears dirty.
- **Save where dst ≠ src, trashOriginal = false** (Save As, or format change without trash): editor stays on the source document. Edit state resets; the source file on disk is unchanged; the new file exists alongside it and the user can open it from the explorer. Tab clears dirty.
- **Save where dst ≠ src, trashOriginal = true**: after write, `trash(src)` runs. On success the source file no longer exists — the editor closes its current document and opens `dst` in a new Image Studio editor, preserving the user's "I'm working on this image" context.

### 5.8 External file changes

Retained from main spec 5.8: default VSCode behavior. CustomEditor implements `onDidChangeFile` listener that, when the document is not dirty, triggers a reload (fresh `init` to webview). When dirty, VSCode's native "File was modified externally" toast is shown by the platform.

## 6. Preview pipeline (size estimate + after-image)

Runs in the extension host, not the webview. Triggered when `editState` changes (anything except `compareMode` and view state).

```
┌─ webview ──────────────────────────────┐
│ editStateChanged(state) ───────────────┼──► extension
└────────────────────────────────────────┘
                                         │
                                         │ 300 ms debounce (per document)
                                         ▼
                                 previousAbort?.abort()
                                 abort = new AbortController()
                                         │
                                         ▼
                          sharp(src).applyEditsPipeline(state).toBuffer()
                                         │
                               ┌─────────┴─────────┐
                               │ success            │ aborted/error
                               ▼                    ▼
                    send previewReady(       swallow (next debounce
                      {buffer, size, meta})    invocation supersedes)
                                         │
                                         ▼
                          webview updates After panel
                          + (if Compare ≠ off) after-image <img>
```

Key points:

- Debounce is **per document**, using a `Map<documentId, Timer>`.
- Each new trigger aborts the in-flight sharp pipeline via `AbortController` (supported by sharp ≥ 0.33's `.destroy()` semantics; if not cleanly abortable, we race the result against `abort.signal` and discard late results).
- If the source image exceeds 20 MB, the After panel shows `Estimating…` during compute; status transitions to final values when done (no skip, no downscale trick).
- Buffer is sent to webview as a binary `Uint8Array` via `postMessage` with `transferable` handling, or as a blob URL generated by `URL.createObjectURL` in the webview after base64 decode. For MVP: we write the buffer to a temp file inside the extension's `globalStorageUri` directory, send its `asWebviewUri` back to the webview, and clean up on next encode / editor close.

## 7. Data model

### 7.1 EditState (owned by webview, mirrored to extension on every change)

```ts
interface EditState {
  crop?:    { x: number; y: number; width: number; height: number };
  resize?:  { width: number; height: number; lockAspect: boolean };
  format:   'same' | 'png' | 'jpeg' | 'webp' | 'avif';
  quality:  number;
  lossless: boolean;
  compareMode: 'off' | 'slider' | 'sxs';
  trashOriginal: boolean;
}
```

### 7.2 ViewState (webview-only; not saved, not sent to extension)

```ts
interface ViewState {
  zoom: number;          // 0.1–8.0; 1 = fit-to-window
  pan:  { x: number; y: number };   // px, relative to fit-to-window center
  cropMode: boolean;
  cropDraft?: { x, y, width, height };   // while crop-mode active, before Apply
}
```

## 8. Dirty state

Tab shows `●` when `editState` differs from the default at open time:

- Any `crop` set
- Any `resize` set
- `format` ≠ `'same'`
- `quality` ≠ 80
- `lossless` ≠ false

`compareMode` and `trashOriginal` do **not** dirty the tab (they are UI-only).

The extension caches the last-known `EditState` per document (keyed by document URI) from `editStateChanged` messages. When VSCode invokes `saveCustomDocument` (triggered by `Cmd+S`, File menu, or tab close "Save" prompt), the provider reads the cached state and routes through the same `saveOrchestrator` used by the UI Save buttons — so `Cmd+S` and the Save button are behaviorally identical. `saveCustomDocumentAs` does the same with a caller-supplied destination URI.

Backup is not implemented in Plan 2. The provider omits `backupCustomDocument` entirely (it is optional in the `CustomEditorProvider` interface). If the tab is closed while dirty, VSCode shows its native "save changes?" prompt; closing without saving discards the edit state.

## 9. Error handling (per main spec 5.7, refined)

- **File unreadable** — webview shows a banner above canvas: "Cannot read file: {message}". Right panel buttons disabled. Tab is not dirty.
- **Sharp operation fails during preview** — the After panel shows `—` and the Size value shows `(estimate failed)`. The Compare after-image falls back to showing the original for that side. A VSCode `showErrorMessage` toast reports the error once per failure (not per debounce).
- **Sharp fails during save** — VSCode `showErrorMessage` with the `core` error code + message; file on disk is untouched; edit state preserved.
- **Invalid resize input** (≤ 0 or non-numeric) — inline red helper text under the input; `[Apply]` disabled; no message to extension.
- **Trash fails** — save is already complete; show a warning toast "Saved, but could not move original to Trash: {message}". Edit state resets normally.

## 10. Testing strategy

- **`@image-studio/core`** — new unit tests for `applyEdits` covering:
  - crop only, resize only, both, neither
  - each format + quality combination
  - trashOriginal on / off, src == dst edge case
  - overwrite protection
  - sharp failure modes (corrupted input)
  Golden-file pixel-diff tests as per main spec Section 9 (reused from Plan 1 fixtures where applicable).

- **`@image-studio/extension`** — sparse automated:
  - CustomEditorProvider registers for all 4 extensions (vscode-test harness)
  - `saveOrchestrator` save/saveAs/trash unit tests with mocked `vscode.workspace.fs`
  - `previewEncoder` debounce + abort behavior unit tests
  - Zero DOM / webview tests — those are manual.

- **Manual verification** (user's role) — via Extension Development Host (F5). Per the main spec, the user exercises the UI and reports symptoms back. A manual test checklist ships in `packages/extension/test/MANUAL.md` covering every flow in §5.

## 11. Dependencies added in Plan 2

| Package | Purpose | Where |
|---|---|---|
| `trash` | cross-platform send-to-trash | `@image-studio/core` |
| `@types/vscode` | VSCode API types | `@image-studio/extension` |
| `esbuild` | bundling extension + webview | `@image-studio/extension` |
| `@vscode/test-electron` | extension test harness | `@image-studio/extension` dev |

`sharp` is already a dependency of `@image-studio/core` from Plan 1 and is reused directly — no re-install.

## 12. Deferred to Plan 3+

- **Backup / hot-exit** (`backupCustomDocument` full impl with session restore)
- **Icon-tab right panel** — visual refinement of §4 where the panel becomes a vertical column of icons (Crop / Resize / Compress) and only the clicked icon's tool body renders
- **Undo/redo** within edit state (history stack)
- **Rotate 90° / Flip H/V**
- **GIF multi-frame support**
- Extension distribution / `.vsix` packaging (can come in Plan 3 alongside icon-tab polish)

## 13. Open questions

None at spec-write time. All design-relevant decisions are captured above.
