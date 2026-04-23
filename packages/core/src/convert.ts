import sharp from 'sharp';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { CoreError, type ConvertOptions, type ImageFormat, type OperationResult } from './types.js';
import { deriveDst } from './_paths.js';

export async function convertImage(opts: ConvertOptions): Promise<OperationResult> {
  const { src, format, quality, lossless, overwrite } = opts;

  if (!existsSync(src)) {
    throw new CoreError('FileNotFound', `File not found: ${src}`);
  }

  const dst = opts.dst ?? deriveDst(src, format);

  if (dst !== src && existsSync(dst) && !overwrite) {
    throw new CoreError(
      'OutputExists',
      `Output already exists: ${dst}. Set overwrite: true to replace it.`
    );
  }

  let pipeline: sharp.Sharp;
  try {
    pipeline = sharp(src);
    await pipeline.metadata(); // validate it's a readable image
  } catch (err) {
    throw new CoreError(
      'InvalidFormat',
      `Not a supported image: ${src}`,
      (err as Error).message
    );
  }

  pipeline = sharp(src); // fresh pipeline for output
  pipeline = applyFormat(pipeline, format, quality, lossless);

  try {
    // toFile requires dst != src. If they equal, go through buffer.
    if (dst === src) {
      const buf = await pipeline.toBuffer();
      writeFileSync(dst, buf);
    } else {
      await pipeline.toFile(dst);
    }
  } catch (err) {
    throw new CoreError(
      'SharpError',
      `Failed to encode image: ${(err as Error).message}`,
      String(err)
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

function applyFormat(
  pipeline: sharp.Sharp,
  format: ImageFormat,
  quality?: number,
  lossless?: boolean
): sharp.Sharp {
  switch (format) {
    case 'png':
      return pipeline.png({ compressionLevel: 9 });
    case 'jpeg':
      return pipeline.jpeg({ quality: quality ?? 80 });
    case 'webp':
      return lossless
        ? pipeline.webp({ lossless: true })
        : pipeline.webp({ quality: quality ?? 80 });
    case 'avif':
      return lossless
        ? pipeline.avif({ lossless: true })
        : pipeline.avif({ quality: quality ?? 50 });
    default:
      throw new CoreError('InvalidFormat', `Unsupported format: ${format}`);
  }
}
