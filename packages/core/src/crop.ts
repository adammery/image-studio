import sharp from 'sharp';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { CoreError, type CropRect, type OperationResult } from './types.js';

export async function cropImage(opts: CropRect): Promise<OperationResult> {
  const { src, x, y, width, height, overwrite } = opts;

  if (!existsSync(src)) {
    throw new CoreError('FileNotFound', `File not found: ${src}`);
  }

  if (x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new CoreError(
      'InvalidFormat',
      `Invalid crop rect: x=${x}, y=${y}, w=${width}, h=${height}. All must be non-negative; w,h > 0.`
    );
  }

  const dst = opts.dst ?? src;

  if (dst !== src && existsSync(dst) && !overwrite) {
    throw new CoreError(
      'OutputExists',
      `Output already exists: ${dst}. Set overwrite: true to replace it.`
    );
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(src).metadata();
  } catch (err) {
    throw new CoreError(
      'InvalidFormat',
      `Not a supported image: ${src}`,
      (err as Error).message
    );
  }

  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (x + width > srcW || y + height > srcH) {
    throw new CoreError(
      'InvalidFormat',
      `Crop rect (${x},${y},${width}x${height}) exceeds image bounds (${srcW}x${srcH}).`
    );
  }

  try {
    const buf = await sharp(src).extract({ left: x, top: y, width, height }).toBuffer();
    writeFileSync(dst, buf);
  } catch (err) {
    throw new CoreError(
      'SharpError',
      `Crop failed: ${(err as Error).message}`
    );
  }

  const outMeta = await sharp(dst).metadata();
  const size = statSync(dst).size;
  return {
    dst,
    size,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0
  };
}
