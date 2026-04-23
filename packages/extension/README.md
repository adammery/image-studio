# Image Studio

A VSCode image editor with **live Before/After preview**. Open PNG, JPG, WebP, or AVIF files directly in your editor and crop, resize, or compress without leaving VSCode.

![Image Studio — editing a PNG with the compare slider active](https://raw.githubusercontent.com/adammery/image-studio/feat/plan-2-extension-gui/packages/extension/media/screenshot.png)

## What it does

- **Opens image files as a custom editor** — PNG / JPG / WebP / AVIF. Right-click any supported file → it opens in Image Studio instead of the generic viewer.
- **Crop** with 8-handle overlay. Drag, press **Enter** to apply or **Esc** to cancel.
- **Resize** with aspect ratio lock, width/height in `px` or `%`.
- **Compress** — change format or dial in quality with presets (**High 92 / Med 85 / Low 75**) or a custom slider. Lossless toggle for WebP / AVIF.
- **Compare modes** — see the effect of your changes before saving:
  - **Original** — just the source file.
  - **Slider** — draggable reveal handle, split the view live.
  - **Preview** — only the compressed output, full-screen, to inspect artifacts.
- **Zoom & pan** — `Ctrl+scroll` (or pinch) to zoom, drag to pan, double-click to reset.
- **Before/After info panel** — filename, dimensions, format, file size, and a `−87%` green reduction badge when the new file is smaller.
- **Save & Replace** — change format to WebP and tick "Replace old image" → the original is moved to the system Trash after save. Reversible via the OS.
- **Activity Bar sidebar** — browse every image in your workspace in a tree, click to open. Respects `.gitignore`-style excludes.

## How it works

1. Open a folder containing images.
2. Click the **Image Studio** icon in the Activity Bar (or press **`Cmd+Shift+\`** on Mac / **`Ctrl+Shift+\`** elsewhere).
3. Pick an image from the tree — it opens in a custom editor tab.
4. By default you see a clean view (image + file info). Click **✏ Edit** top-right to reveal the edit panel.
5. Change Format / Quality / Resize / Crop. The extension re-encodes via **sharp** in the background (debounced ~300 ms) and shows:
   - The estimated output size with **reduction %** badge.
   - A live preview image in Slider / Preview mode.
6. Press **Save**. If you changed the format, a modal confirms whether to save as the new extension alongside the original, or choose Save As…
7. Optionally check **Replace old image** to move the original to Trash on save.

All image operations run through `sharp` inside VSCode's extension host — no cloud, no uploads, no data leaves your machine.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+\\` / `Ctrl+Shift+\\` | Open Image Studio sidebar |
| `Cmd+S` | Save current image |
| `Cmd+Backspace` / `Ctrl+Delete` | Move the open image to Trash |
| `Enter` (in crop) | Apply crop |
| `Esc` (in crop) | Cancel crop |
| `Ctrl+scroll` | Zoom in/out on the canvas |
| `Drag` when zoomed | Pan |
| `Double-click` | Reset zoom to Fit |

Rebind anything in **Preferences → Keyboard Shortcuts** — search "Image Studio".

## Settings

Search "Image Studio" in **Settings** (`Cmd+,`):

| Setting | Default | Description |
|---|---|---|
| `imageStudio.defaultCompareMode` | `off` | Default compare mode when opening a new image (Off / Slider / Preview). |
| `imageStudio.defaultQuality` | `92` | Quality preset for lossy formats (75 / 85 / 92). |
| `imageStudio.excludeFolders` | `["node_modules", ".git", "dist", "out", "build", ".next", ".vscode", ".idea"]` | Folder names skipped in the sidebar tree. |

## Supported formats

Read & write: **PNG, JPEG, WebP, AVIF**.

Lossless encoding is available for WebP and AVIF — note that **quality 100 is not the same as lossless**: quality 100 is the max-quality lossy encoder, while lossless uses a different codec (VP8L for WebP, AV1 lossless for AVIF) that guarantees pixel-identical output.

## Privacy

Nothing leaves your machine. All encoding runs locally through `sharp`'s native libvips binary bundled in the extension.
