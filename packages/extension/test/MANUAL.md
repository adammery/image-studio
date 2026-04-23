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
