# Batch Convert UI — design

**Status:** Ready for implementation planning
**Date:** 2026-04-25
**Relates to:** `2026-04-23-plan-2-extension-gui-design.md` (extension shell). This adds a second `CustomEditorProvider` view-type alongside the existing single-image editor.

## 1. Purpose

Today, users can compress / convert images one-at-a-time in the single-image editor, or — via the AI route — invoke `batch_convert` through the MCP server. There is no GUI surface for a user who wants to take 5–50 images, pick a format and quality, and run them all at once.

This spec adds a **Batch Convert** view: same shell as the existing editor (left sidebar, center, right panel, footer), but the center holds a list of images instead of a single canvas, and the right panel exposes only **Compress** controls (Crop and Resize don't make sense as uniform batch operations).

## 2. Scope

In:

- Sidebar header icon button (⚡) opens a new `imageStudio.batchView` editor tab
- Folder dropdown enumerating every workspace folder containing ≥1 image, plus an "All folders" item
- Selection persists across folder switches; counter + "Review" mode shows the current accumulated set
- Filter chips by source format: `[All] [PNG] [JPG] [WebP] [AVIF]`
- Sortable text columns: Name, Format, Size, Estimated post-compression size
- Right panel: Format select, Quality slider, Lossless checkbox (mirrors the existing editor's Compress section)
- Pre-flight conflict review (3-button: Skip existing / Overwrite all / Cancel)
- Per-row status icons during convert (⏳ → 🔄 → ✓ / ✗) + footer progress bar with Cancel
- "Trash originals" toggle in footer (same semantics as single editor)
- After convert: status icons remain visible until user starts a new batch or closes the tab

Out:

- Per-image overrides (every selected image uses the same Compress settings — that's the whole point of "batch")
- Crop / Resize in batch
- Thumbnails (decision: list-only, scales to thousands of items without thumbnail-load cost)
- Image search input in sidebar (deferred — option B "🔍 header button → QuickPick" is the chosen approach when implemented separately)
- SVG batch (SVG support is parked entirely)
- GIF / animated formats (out of MVP across the project)
- Concurrent batch tabs sharing state (each tab is independent; no cross-tab selection sync)

## 3. Architecture

```
┌──────────────────────────────────────────────────────┐
│  VSCode extension host (Node)                        │
│  ┌────────────────────────────────────────────────┐  │
│  │  @image-studio/extension                       │  │
│  │  • ImageEditorProvider          (existing)     │  │
│  │  • BatchEditorProvider          (NEW)          │  │
│  │  • imageStudio.openBatchView    (NEW command)  │  │
│  │  • per-tab BatchEstimator       (NEW)          │  │
│  └───────────────┬────────────────────────────────┘  │
│                  │                                    │
│                  ▼                                    │
│  ┌────────────────────────────────────────────────┐  │
│  │  @image-studio/core                            │  │
│  │  • applyEdits()           (reused)             │  │
│  │  • batchConvert()         (reused → wraps loop)│  │
│  │  • probe / encoded-size helper (reused)        │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                         ▲ postMessage
                         │
┌────────────────────────┴─────────────────────────────┐
│  Batch webview (Chromium sandbox)                    │
│  • shared CSS with single-image editor                │
│  • center = virtualized text list                    │
│  • right panel = Compress section (reused HTML)      │
│  • footer = selection counter + trash + convert + bar │
└──────────────────────────────────────────────────────┘
```

The Batch view is **a second `CustomEditorProvider`** (`imageStudio.batchView`), opened via a synthetic untitled URI (e.g. `imageStudio://batch/<workspace-name>`). This gives us tab semantics, dispose / re-open, and postMessage isolation for free, mirroring the single-image editor's lifecycle.

`@image-studio/core` does **not** change. The new `BatchEditorProvider` orchestrates: enumerates files, holds selection state, drives the estimator, and on Convert iterates over selected items invoking `applyEdits` per file.

## 4. Entry point

`package.json` `contributes`:

```jsonc
"menus": {
  "view/title": [
    {
      "command": "imageStudio.openBatchView",
      "when": "view == imageStudio.files",
      "group": "navigation"
    }
  ]
},
"commands": [
  { "command": "imageStudio.openBatchView", "title": "Batch Convert…", "icon": "$(zap)", "category": "Image Studio" }
]
```

`$(zap)` is VSCode's built-in lightning-bolt codicon (matches our ⚡ visual). The command opens the batch tab via `vscode.commands.executeCommand('vscode.openWith', uri, 'imageStudio.batchView')`.

There is exactly **one** entry point in this spec. Folder right-click and tree multi-select context-menu entries are deferred — they can be added later as additional menu contributions without touching the panel itself.

## 5. Layout

```
┌──────────────────────────────────────┬──────────────────┐
│ Folder ▾  [images/                ▾] │  ◆ Compress      │
│ Format    [✓ All] [PNG][JPG][WebP][AVIF]│  Format: WebP ▾  │
│ ─────────────────────────────────────│  Quality: 85 ━━●─│
│ [☑] Name ▴   Format  Size      → Est.│  ☐ Lossless      │
│ [☑] hero.png   PNG    245 KB    ~120 KB                  │
│ [☐] logo.jpg   JPG     88 KB     ~52 KB                  │
│ [☑] icon.webp  WebP    12 KB     ~10 KB                  │
│ [☑] avatar.png ⏳ PNG  200 KB     —                      │
│ [✓] banner.jpg ✓ done                                    │
│ [✗] broken.png ✗ Failed: invalid file                    │
│ ─────────────────────────────────────────────────────────│
│  5 selected (across 2 folders)  [Review]  ☐ Trash orig.  │
│  [████░░░░░░░░] 12/47    [Cancel]    [Convert 5]         │
└──────────────────────────────────────────────────────────┘
```

### 5.1. Folder dropdown

Populated at view-open time by enumerating every distinct folder in the workspace that contains ≥1 image (same `IMAGE_GLOB` and `excludeFolders` as the existing tree provider). Items show **relative paths** from the workspace root: `images`, `assets/icons`, `src/components/avatars`, etc. The first item is `All folders` (flat union). Refreshed on `vscode.workspace.onDidChangeWorkspaceFolders` and on file create/delete events for image extensions (subscribed via the same FileSystemWatcher pattern already in use for refresh).

### 5.2. Filter chips

Source-format chips above the list. Default state: `All` selected. Toggling a chip narrows the visible rows. Affects only **what's visible**; selection state of hidden rows is preserved.

### 5.3. List (center)

Virtualized text list (no thumbnails). Each row:

- Checkbox
- Status icon (only present during/after convert: ⏳ pending, 🔄 in-progress, ✓ done, ✗ failed)
- Name (basename, with folder hint when "All folders" is active: `images/hero.png`)
- Source format badge
- Source size
- → Estimated post-compression size, OR `—` if not yet computed, OR `(working…)` while being computed

Header row provides asc/desc sort by clicking Name / Format / Size / Est. Size column header. Default: Name asc.

### 5.4. Right panel (Compress)

Single section reusing the existing editor's Compress HTML/CSS:

- Format select (Same as source / PNG / JPEG / WebP / AVIF)
- Quality presets (75 / 85 / 92) + slider 1–100
- Lossless checkbox (only enabled when format is WebP or AVIF)

Format `Same as source` in batch context means "re-encode each image at the new quality, preserving its current format." Useful for "compress all WebPs harder" without changing extensions.

### 5.5. Footer

- Selection counter: `5 selected (across 2 folders)` — folder count derived from the distinct folders in the current selection
- `[Review]` button: temporarily switches the list filter to show **only currently-selected items** (regardless of folder dropdown / filter chips). Clicking again returns to the previous view. This is how the user audits a multi-folder pick before converting.
- `☐ Trash originals` checkbox: same semantics as the single editor — when an image is converted to a *different* extension, the original is moved to trash on success. For images where dst path equals src path (overwrite-in-place), the toggle has no effect on that file.
- Progress bar + counter `12/47` (visible only during run)
- `[Cancel]` (visible only during run; aborts after the currently-encoding file finishes — no partial files left on disk)
- `[Convert N]` (primary; disabled while another batch is running)

## 6. Selection persistence model

Selection state lives in the `BatchEditorProvider` per tab as `Set<string>` of absolute fsPaths. Folder dropdown and filter chips affect **rendering only**, never selection. Switching folders never clears or trims selection.

`Review` mode is a transient view-state flag — when on, the list renders the union of all selected items as one flat list, ignoring the folder dropdown.

When the user closes the batch tab, selection is dropped. Re-opening starts a new empty selection. (We don't persist across sessions — too much hidden state for a workflow that takes <2 minutes.)

## 7. Estimate column

Estimated post-compression size is computed lazily and only for **selected** rows. When format / quality / lossless changes in the right panel, every selected row's estimate is invalidated and re-scheduled.

Each estimate runs the source through `sharp().toBuffer()` with the current settings and reports `buffer.length`. A small queue with concurrency limit (e.g. `os.cpus().length`) processes them in the background. UI shows `(working…)` while pending and the byte count once done. Estimates are cached per `(srcPath, format, quality, lossless)` tuple per session.

Selecting a row triggers an estimate. Deselecting drops the cached entry from active display (cache stays for re-selection).

This intentionally costs nothing for unselected rows, so the user never pays for images they don't intend to convert.

## 8. Conflict pre-flight

When the user clicks `Convert N`:

1. Compute target paths for each selected image: `path.dirname(src) + basename(src, .ext) + '.' + targetExt`. (When format=same, target == source.)
2. Check existence of each target. If `target === src` (overwrite-in-place), it's not a conflict — that's expected.
3. If any cross-extension conflicts found (i.e., target is a *different* file that happens to exist), show a modal:

> **3 of 47 selected images would replace an existing file.**
> `images/hero.webp` (would replace existing hero.webp)
> `images/about.webp` (would replace existing about.webp)
> `assets/icons/cart.webp` (would replace existing cart.webp)
>
> [ Skip these ]   [ Overwrite all ]   [ Cancel ]

`Skip these` removes the conflicting items from this run only (they stay selected for next time). `Overwrite all` proceeds with all selected. `Cancel` aborts.

When format=same, every selected image's target equals its source — that's an overwrite-in-place which we treat as expected; no pre-flight dialog. (Equivalent to clicking Save in the single editor: the user clearly wants this.)

## 9. Convert execution

Sequential per-file (not parallel) so progress reporting is monotonic and Cancel is responsive:

```
for each selected file:
  if cancelled: break
  set row icon = 🔄
  applyEdits(src, dst, state, { overwrite: shouldOverwrite })
    on success: row icon = ✓, increment counter
    on failure: row icon = ✗, store error message in row tooltip
  if Trash originals AND src !== dst AND success:
    await trash(src)
```

Errors do NOT abort the batch — one bad file shouldn't kill 49 good ones. Failed rows show ✗ with the error in the row's title attribute (hover tooltip).

After completion, a VSCode toast: `Converted 44, failed 3, skipped 0`. Status icons remain in the list until the user changes selection or closes the tab.

## 10. Edge cases

- **Source file deleted between selection and convert**: `applyEdits` throws → row gets ✗ with "File not found". Batch continues.
- **Format=same on a PNG with quality slider at 50**: sharp's PNG encoder ignores `quality` for lossless PNG. The estimate still runs, and the file gets re-encoded with default sharp PNG options. We document this as expected — the slider is a no-op for PNG sources at format=same. (UI doesn't currently warn; this is a 5%-case acceptable footgun.)
- **Image currently open in single editor**: that editor has its own FileSystemWatcher and refreshes on disk change. If batch trashes the source, single editor receives a delete event — its current behavior is to leave the panel showing stale data with an error if the file is later touched. This is a pre-existing behavior, not regressed by batch.
- **Mid-run "Cancel"**: completes the currently-encoding file (already in sharp's pipeline), then stops. Leaves the list in a partially-completed state with mixed icons. User can re-run; previously-converted items are now in their target format.
- **Workspace folder removed during run**: same as a source-deleted error — that row gets ✗ and run continues.
- **Empty workspace (no images)**: open command shows the existing `viewsWelcome` message in the batch panel ("No images in this workspace.").
- **Case-insensitive filesystems**: `foo.JPG` (source) with format=jpeg produces target `foo.jpg`. On macOS APFS / Windows NTFS (case-insensitive by default), this overwrites the source in place even though the strings differ. Conflict detection uses `fs.existsSync` which respects the underlying FS semantics, so this is correctly classified as overwrite-in-place (no pre-flight dialog). On case-sensitive Linux ext4, the same operation produces a *new* sibling file `foo.jpg` alongside `foo.JPG` — also acceptable; user explicitly chose JPEG format. No special handling needed.

## 11. Testing

Following the project's existing strategy:

**Core** — already tested. No core changes.

**Extension unit tests** (`packages/extension/test/`):

- `BatchEstimator.test.ts` — debounce, queue concurrency, cache key correctness, dispose
- `selectionStore.test.ts` — add / remove / cross-folder counter, distinct-folder count, Review mode flag
- `conflictDetection.test.ts` — pure function: given selected paths + target format → list of conflicts (excluding overwrite-in-place)

**Manual checklist** (`packages/extension/test/MANUAL.md` — append a new section):

- Open batch view from sidebar header
- Folder dropdown enumerates expected folders
- Filter chips narrow visible rows; selection of hidden rows preserved
- Sort columns (asc/desc per click)
- Estimate appears for selected rows only; updates on format/quality change
- Conflict dialog appears when cross-extension target collides with existing file
- Convert run shows per-row icons, footer progress, cancel mid-run
- Trash originals: source files moved to OS trash on cross-extension success
- Empty workspace shows welcome message

## 12. Future work (parked, not in this spec)

- Folder right-click → "Batch convert this folder" menu entry (additive, no panel changes)
- Tree multi-select → "Batch convert selected" menu entry (also additive)
- Persistent batch sessions across reopens
- Image search via 🔍 sidebar header button (option B from brainstorm: VSCode QuickPick fuzzy search)
- SVG support (parked in separate memory entry)
- Per-image overrides ("convert these as JPEG, those as WebP" in one run)
- Estimate column for unselected rows (background pre-warm)

## 13. Open implementation questions (not blockers)

These are micro-decisions that can be settled during the implementation plan, not now:

- Exact untitled URI scheme for `imageStudio://batch/...` (must survive serialization)
- Virtualization threshold (e.g. plain `<ul>` up to 200 rows, switch to virtualized rendering above)
- Whether to share the right-panel HTML between the single editor and the batch view via a shared template, or duplicate (~80 LOC)
- Codicon vs custom SVG for the ⚡ button
