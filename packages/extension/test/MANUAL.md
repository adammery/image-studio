# Image Studio — Manual Test Checklist

Run before each merge. Launch via **fn+F5** (or **Run → Start Debugging**) with `packages/extension/` as the workspace.

## Setup
1. `npm run build --workspace=packages/extension`
2. Press F5 → Extension Development Host opens.
3. Open a folder with PNG, JPG, WebP, and AVIF sample images.

## Default (clean view)
- [ ] Open a PNG → Image Studio editor opens (not default image viewer).
- [ ] Only the image + bottom info bar visible (filename · dimensions · format · size).
- [ ] `✏ Edit` pill visible top-right; Compare pill hidden.
- [ ] Tab has no dirty indicator.

## Edit mode
- [ ] Click `✏ Edit` → panel slides in with three sections (Crop / Resize / Compress).
- [ ] Compare pill (Original / Slider / Preview) appears top-center.
- [ ] Info bar now shows Before + arrow + After (estimate).
- [ ] Click `✕ Close` → back to clean view.

## Compress
- [ ] Change Format to WebP → Quality slider + Lossless checkbox appear.
- [ ] Preset buttons High / Med / Low set the slider to 92 / 85 / 75.
- [ ] Move slider manually → "Custom" label appears; active preset unhighlighted.
- [ ] Format change to PNG → Quality hidden, Lossless hidden.
- [ ] Lossless on WebP → Quality slider grays out.
- [ ] After ~300 ms, After column updates with estimated size + `−X%` green badge.
- [ ] Any compress change → tab shows dirty indicator.

## Compare
- [ ] **Original** (default): single image in canvas.
- [ ] **Slider**: overlaid images with draggable handle. Left of handle = original, right = compressed preview.
- [ ] **Preview**: only the compressed result fills canvas (helpful to inspect artifacts full-screen).
- [ ] Compare mode persists across opening different files.

## Zoom / Pan
- [ ] `Ctrl+scroll` / trackpad pinch → zoom toward cursor. Zoom pill shows percentage.
- [ ] Regular scroll when zoomed → pans image.
- [ ] Drag on canvas when zoomed → pans image (no Space needed).
- [ ] Double-click → reset to Fit.
- [ ] Click `Fit` button in zoom pill → reset to Fit.

## Slider + zoom interaction
- [ ] In Slider mode, zoom to 400%.
- [ ] Slider handle stays centered in viewport (not image center).
- [ ] Pan image → slider reveal line stays at viewport center.

## Resize
- [ ] Width/Height show current image dimensions.
- [ ] Type new Width with Lock on → Height auto-recalculates.
- [ ] Switch unit to `%` → inputs show 100.
- [ ] Type 0 or negative → red border, Apply disabled.
- [ ] Esc in resize input reverts to last applied values.
- [ ] Apply → toast `✓ Resized to W × H px`, After column updates.

## Crop
- [ ] Click `Start crop` → if zoomed, canvas auto-resets to Fit.
- [ ] Overlay with 8 handles; Compare pill replaced by Apply / Cancel.
- [ ] Drag corner / edge handles to resize selection.
- [ ] Drag inside selection to move.
- [ ] Selection clamps to image bounds; min 10×10 px.
- [ ] `Enter` = Apply; `Esc` = Cancel.
- [ ] Apply → toast `✓ Cropped to W × H px`.

## Save (same format)
- [ ] With quality change only → Save → no modal → file overwritten → toast `✓ Saved` → dirty clears.
- [ ] Cmd+S has same effect as Save button.

## Save (format change)
- [ ] Change format to WebP → Save → modal: "Save as .webp" / "Save As… instead" / Cancel.
- [ ] Cancel → nothing changes.
- [ ] Save As… instead → system dialog opens.
- [ ] Save as .webp → `.webp` file created next to original; editor navigates to the new file.

## Replace old image (Save & Trash)
- [ ] Format ≠ Same → `Replace old image` checkbox enabled.
- [ ] Check it → Save → `.webp` created, original `.png` sent to system Trash; toast mentions it.
- [ ] Format = Same → checkbox disabled with tooltip.

## Save As
- [ ] Save As… → system dialog → choose destination → file created there.

## Error states
- [ ] Open a non-image file renamed as `.png` → red banner; panel inputs disabled.
- [ ] Preview encoder error (large/corrupt file) → After column shows `(estimate failed)`; one toast from VSCode.

## External file change
- [ ] Open PNG, no edits.
- [ ] Overwrite file externally → editor auto-reloads.
- [ ] Make an edit (dirty), overwrite externally → VSCode's native "modified externally" prompt.

## Tab switching
- [ ] Open two images in two tabs.
- [ ] Switch between them → state (zoom, compare mode, edits) preserved (thanks to `retainContextWhenHidden`).

## AVIF
- [ ] Open AVIF file → displays correctly.
- [ ] Convert AVIF → PNG → save → PNG created.

## Batch Convert

- [ ] Open Image Studio sidebar (Activity Bar → ⚡ icon or `Cmd+Shift+\`).
- [ ] Verify the ⚡ "Batch Convert…" icon appears in the "Images" view title bar (next to the refresh icon).
- [ ] Click ⚡ → a tab titled "Batch Convert" opens.
- [ ] Folder dropdown lists every workspace folder containing images, plus "All folders" at the top.
- [ ] Format chips (All / PNG / JPG / WebP / AVIF) toggle visible rows; only the active chip is highlighted.
- [ ] Click a column header (Name / Format / Size / →Est.) to sort asc; click again for desc.
- [ ] Check a few rows; counter updates ("3 selected", "5 selected (across 2 folders)").
- [ ] After ~1s, "(working…)" in the →Est. column resolves to a byte count for selected rows.
- [ ] Change Format / Quality / Lossless: estimates recompute for all selected rows.
- [ ] Click "Review" → list narrows to only selected items (regardless of folder dropdown). Click again → restored.
- [ ] Trigger a conflict: in a folder with `hero.png` and an existing `hero.webp`, select `hero.png` + a few non-conflicting PNGs, set format=WebP, click Convert. Verify the modal lists `hero.webp` and offers "Skip these" / "Overwrite all" / Cancel.
- [ ] Choose "Skip these" → only non-conflicting files convert. Status icons cycle ⏳→🔄→✓; failed rows show ✗ with hover tooltip showing the error.
- [ ] During a long convert, click Cancel: the in-progress file finishes, remaining rows stay ⏳, footer hides progress.
- [ ] With "Trash originals" checked: cross-extension conversions move sources to OS trash on success. Same-extension (overwrite-in-place) leaves no trash entry.
- [ ] Open a workspace with no images → batch view shows "No images in this workspace."
- [ ] Add an image to a watched folder while batch view is open → the row appears.
- [ ] Delete an image from disk while it's selected in batch view → the row disappears, selection counter updates.
- [ ] Run a batch on a single WebP source with format=Same as source and quality lowered → file size decreases (overwrite-in-place).

## Batch Convert — Select All & Delete

### Header checkbox (tri-state)
- [ ] Open Batch Convert. Header row shows an unchecked checkbox in the leftmost cell.
- [ ] No selection → header checkbox is unchecked.
- [ ] Tick one row → header checkbox shows indeterminate (`-` filled state).
- [ ] Tick every visible row → header checkbox becomes fully checked.
- [ ] Click header checkbox while fully checked → all visible rows are deselected; counter goes to "0 selected".
- [ ] Click header checkbox while none selected → all currently visible rows become selected; counter updates with folder count if multiple.
- [ ] With format chip = PNG → only PNG rows are visible. Click header checkbox → only PNG rows are added to selection. Switch chip back to "All" → previously selected non-PNGs (if any) are still selected.
- [ ] After bulk select, ~1 s later "(working…)" in the Est. column resolves to byte counts.

### Cmd/Ctrl+A
- [ ] Focus inside the batch view (click anywhere outside an input). `Cmd+A` (macOS) / `Ctrl+A` (Win/Linux) selects all visible rows.
- [ ] Pressing the same shortcut again deselects them.
- [ ] Native "select all text" does NOT fire (no blue text selection in the panel).
- [ ] Click into the Quality slider's text input next to it (or any `<input>`/`<select>`); `Cmd+A` does NOT touch the selection.

### Trash button
- [ ] Footer shows a 🗑 button at the left of "X selected". It is disabled when nothing is selected.
- [ ] Hover tooltip reads "Delete selected (⌘⌫)".
- [ ] Select 2 rows. Click 🗑. Both files move to OS Trash. Toast: "Moved 2 files to Trash". Rows disappear from the list within ~1 s (file watcher).
- [ ] Select 1 row. Click 🗑. Toast says "Moved 1 file to Trash" (singular).
- [ ] Selection counter goes back to "0 selected" after a successful trash.

### Keyboard shortcuts (delete)
- [ ] macOS: `Cmd+Backspace` with rows selected → same as clicking 🗑.
- [ ] Win/Linux: `Ctrl+Backspace` and `Delete` (forward-delete key) → same.
- [ ] Naked `Backspace` does NOT trigger delete.
- [ ] Pressing the shortcut while typing in any input field does not delete anything.
- [ ] Shortcut with no selection is a no-op (nothing happens, no toast).

### Disabled during conversion
- [ ] Start a long batch convert. While it runs:
  - [ ] 🗑 button is disabled.
  - [ ] `Cmd+Backspace` / `Delete` are no-ops.
- [ ] After convert finishes (or is cancelled), the button re-enables provided some rows are still selected.

### Race / failure
- [ ] Select a file, then delete the same file from Finder/Explorer. Click 🗑 in the batch view. Warning toast: "Failed to trash 1 file: <name>". The row is removed by the file watcher anyway.
- [ ] Select 3 files where 1 is locked or already-gone. Toast: "Moved 2 files to Trash" plus warning toast for the failure. The failed path stays in selection.
