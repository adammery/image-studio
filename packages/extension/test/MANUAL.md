# Image Studio — Manual Test Checklist

Run before each merge. Use Extension Development Host (F5 in VSCode with `packages/extension` as the workspace root).

## Setup
1. `npm run build --workspace=packages/extension`
2. Press F5 → Extension Development Host opens.
3. Open a folder with PNG, JPG, WebP, and AVIF sample images.

## Open behavior
- [ ] Open a PNG — Image Studio editor opens (not default image viewer).
- [ ] Before panel shows: correct filename, `W × H px · PNG`, file size.
- [ ] After panel shows same values (format = Same, no edits yet).
- [ ] Tab has no dirty indicator `●`.

## Compress section
- [ ] Change Format to WebP — Quality slider and Lossless checkbox appear.
- [ ] Change Format to PNG — Quality slider and Lossless disappear.
- [ ] Move Quality slider — After panel updates (~300 ms) with estimated size and `−X%` reduction in green.
- [ ] Check Lossless — Quality grays out; After panel re-estimates.
- [ ] Any compress change — tab shows dirty indicator `●`.

## Compare
- [ ] Default is Slider mode — white handle line visible in canvas.
- [ ] Drag handle left/right — reveals original vs compressed.
- [ ] Switch to Side-by-side — canvas splits, left = original, right = compressed.
- [ ] Switch to Off — single image, no compare overhead.

## Zoom/Pan
- [ ] Scroll wheel over canvas — image zooms. Zoom pill shows `110%`, `120%`, etc.
- [ ] Hold Space + drag — pans the image.
- [ ] Double-click image — resets to Fit.
- [ ] Click Fit button — resets to Fit. Pill hides.

## Resize
- [ ] Resize section shows current width/height of image.
- [ ] Type new Width with Lock on — Height auto-recalculates.
- [ ] Switch unit to % — inputs show 100/100.
- [ ] Type 0 in Width — red border + error text, Apply disabled.
- [ ] Esc key in resize inputs — reverts to last applied values.
- [ ] Apply → After panel shows new dimensions.

## Crop
- [ ] Click Start crop — overlay with 8 handles covers image. Compare pill hidden.
- [ ] Drag corner handle — resizes selection.
- [ ] Drag inside selection — moves selection.
- [ ] Cannot drag selection outside image bounds.
- [ ] Press Esc — overlay disappears, no changes.
- [ ] Apply — overlay disappears, After panel updates.
- [ ] Start crop again — previous crop rect is loaded as initial selection.

## Save (same format)
- [ ] Make a quality change → Save → no modal → file overwritten → tab clears dirty.
- [ ] Cmd+S — same as Save button.

## Save (format change, no trash)
- [ ] Change format to WebP → Save → format-change modal appears with correct filenames.
- [ ] Click Cancel — nothing changes.
- [ ] Click "Save As… instead" — system dialog opens.
- [ ] Click "Save as .webp" — .webp file created, .png remains, tab clears dirty.

## Save & Trash
- [ ] Change format to WebP → check "Move original to Trash" → Save → original .png gone (check system Trash).
- [ ] Editor opens .webp after trash.
- [ ] With format = Same → Trash checkbox disabled, tooltip shows "No original to remove".

## Save As
- [ ] Save As… → system dialog → save to any location → file created there.

## Error states
- [ ] Open a non-image file renamed as .png → error banner appears, panel buttons disabled.

## External file change
- [ ] Open PNG in Image Studio (no edits).
- [ ] Overwrite the file externally (e.g., `cp other.png opened.png`).
- [ ] Editor reloads automatically (image refreshes, Before panel updates).
- [ ] Make an edit (dirty tab), then overwrite externally → VSCode "File modified externally" toast appears; editor does NOT auto-reload.

## AVIF
- [ ] Open an AVIF file — displays correctly.
- [ ] Convert AVIF to PNG → save → PNG created.
