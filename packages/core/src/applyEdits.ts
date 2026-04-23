import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { writeFile, stat } from 'node:fs/promises';
import { CoreError, type EditState, type ApplyEditsOptions, type ApplyEditsResult } from './types.js';

export async function applyEdits(
  src: string,
  dst: string,
  state: EditState,
  opts: ApplyEditsOptions = {},
): Promise<ApplyEditsResult> {
  if (!existsSync(src)) {
    throw new CoreError('FileNotFound', `Source file not found: ${src}`);
  }
  if (!opts.overwrite && existsSync(dst) && dst !== src) {
    throw new CoreError('OutputExists', `Output already exists: ${dst}. Set overwrite: true to replace.`);
  }

  let pipeline = sharp(src);

  if (state.crop) {
    pipeline = pipeline.extract({
      left:   Math.round(state.crop.x),
      top:    Math.round(state.crop.y),
      width:  Math.round(state.crop.width),
      height: Math.round(state.crop.height),
    });
  }

  if (state.resize) {
    pipeline = pipeline.resize(Math.round(state.resize.width), Math.round(state.resize.height), { fit: 'fill' });
  }

  if (state.format !== 'same') {
    switch (state.format) {
      case 'png':
        pipeline = pipeline.png();
        break;
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: state.quality });
        break;
      case 'webp':
        pipeline = state.lossless
          ? pipeline.webp({ lossless: true })
          : pipeline.webp({ quality: state.quality });
        break;
      case 'avif':
        pipeline = state.lossless
          ? pipeline.avif({ lossless: true })
          : pipeline.avif({ quality: state.quality });
        break;
    }
  }

  const buffer = await pipeline.toBuffer();
  await writeFile(dst, buffer);

  const { size } = await stat(dst);
  const meta = await sharp(dst).metadata();

  let originalTrashed = false;
  if (state.trashOriginal && dst !== src) {
    try {
      const { default: trash } = await import('trash');
      await trash(src);
      originalTrashed = true;
    } catch {
      // non-fatal — caller surfaces warning toast
    }
  }

  return { dst, size, width: meta.width!, height: meta.height!, originalTrashed };
}
