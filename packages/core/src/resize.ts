import sharp from 'sharp';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { CoreError, type ResizeOptions, type OperationResult } from './types.js';

export async function resizeImage(opts: ResizeOptions): Promise<OperationResult> {
  const { src, width, height, fit, overwrite } = opts;

  if (!existsSync(src)) {
    throw new CoreError('FileNotFound', `File not found: ${src}`);
  }

  if (!width && !height) {
    throw new CoreError(
      'InvalidFormat',
      'At least one of width or height must be provided.'
    );
  }

  const dst = opts.dst ?? src;

  if (dst !== src && existsSync(dst) && !overwrite) {
    throw new CoreError(
      'OutputExists',
      `Output already exists: ${dst}. Set overwrite: true to replace it.`
    );
  }

  try {
    await sharp(src).metadata();
  } catch (err) {
    throw new CoreError(
      'InvalidFormat',
      `Not a supported image: ${src}`,
      (err as Error).message
    );
  }

  try {
    const buf = await sharp(src)
      .resize({
        width,
        height,
        fit: fit ?? (width && height ? 'fill' : 'inside'),
        withoutEnlargement: false
      })
      .toBuffer();
    writeFileSync(dst, buf);
  } catch (err) {
    throw new CoreError(
      'SharpError',
      `Resize failed: ${(err as Error).message}`
    );
  }

  const meta = await sharp(dst).metadata();
  const size = statSync(dst).size;
  return {
    dst,
    size,
    width: meta.width ?? 0,
    height: meta.height ?? 0
  };
}
