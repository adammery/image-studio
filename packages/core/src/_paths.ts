import { parse, join } from 'node:path';
import type { ImageFormat } from './types.js';

const FORMAT_EXT: Record<ImageFormat, string> = {
  png: '.png',
  jpeg: '.jpg',
  webp: '.webp',
  avif: '.avif'
};

/**
 * Derive output path when dst is omitted.
 * If format differs from source ext, output goes next to source with new ext.
 * If format matches source ext, output overwrites source.
 */
export function deriveDst(src: string, format: ImageFormat): string {
  const parsed = parse(src);
  const targetExt = FORMAT_EXT[format];
  const currentExt = parsed.ext.toLowerCase();
  const normalizedCurrent = currentExt === '.jpeg' ? '.jpg' : currentExt;
  if (normalizedCurrent === targetExt) {
    return src;
  }
  return join(parsed.dir, parsed.name + targetExt);
}
