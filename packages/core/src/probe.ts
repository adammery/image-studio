import sharp from 'sharp';
import { statSync } from 'node:fs';
import { CoreError, type ImageInfo } from './types.js';

export async function getImageInfo(src: string): Promise<ImageInfo> {
  let size: number;
  try {
    size = statSync(src).size;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new CoreError('FileNotFound', `File not found: ${src}`);
    }
    if (e.code === 'EACCES') {
      throw new CoreError('PermissionDenied', `Cannot read file: ${src}`);
    }
    throw new CoreError('SharpError', `Cannot stat file: ${src}`, e.message);
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(src).metadata();
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    throw new CoreError('InvalidFormat', `Not a supported image: ${src}`, msg);
  }

  if (!meta.width || !meta.height || !meta.format) {
    throw new CoreError('InvalidFormat', `Incomplete image metadata: ${src}`);
  }

  return {
    width: meta.width,
    height: meta.height,
    format: meta.format,
    size,
    hasAlpha: meta.hasAlpha ?? false,
    colorspace: meta.space ?? 'srgb'
  };
}
