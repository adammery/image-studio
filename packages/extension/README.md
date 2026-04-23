# Image Studio

A VSCode image editor and AI converter. Open PNG, JPG, WebP, or AVIF files directly in VSCode with a right-side panel for crop, resize, and compress.

## Features

- **Custom image editor** — opens images in a dedicated editor tab.
- **Compress** — Format (PNG / JPEG / WebP / AVIF), Quality presets (High 92 / Med 85 / Low 75) or custom slider, Lossless toggle for WebP / AVIF.
- **Resize** — width / height with aspect lock, `px` or `%` units.
- **Crop** — 8-handle overlay, drag or Enter to apply, Esc to cancel.
- **Compare** — Original / Slider / Preview modes with draggable reveal.
- **Zoom & Pan** — `Ctrl+scroll` to zoom, drag to pan, double-click to fit.
- **Save & Replace** — optionally send the old file to Trash after saving to a new format.
- **Before / After info panel** — file metadata + estimated output size with reduction %.
- **Activity Bar sidebar** — browse all images in your workspace; click to open.

## Keyboard Shortcuts

- `Cmd+Shift+\\` (`Ctrl+Shift+\\`) — open the Image Studio sidebar.
- `Enter` in crop mode — Apply.
- `Esc` in crop mode — Cancel.
- `Cmd+S` — Save (with format-change modal when needed).

## Settings

Search "Image Studio" in `Settings`:

- `imageStudio.defaultCompareMode` — Off / Slider / Preview on new files.
- `imageStudio.defaultQuality` — 75 / 85 / 92 for lossy formats (default 92).
- `imageStudio.excludeFolders` — folder names skipped in the sidebar.

## Development

See `test/MANUAL.md` for the manual test checklist.
