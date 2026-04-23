import fg from 'fast-glob';
import { statSync, existsSync } from 'node:fs';
import { parse, join } from 'node:path';
import { convertImage } from './convert.js';
import { deriveDst } from './_paths.js';
import {
  CoreError,
  type BatchOptions,
  type BatchResult,
  type BatchConvertResult,
  type BatchFailure
} from './types.js';

export async function batchConvert(opts: BatchOptions): Promise<BatchResult> {
  const { files, pattern, format, quality, lossless, outSuffix, overwrite } = opts;

  if (!files && !pattern) {
    throw new CoreError(
      'InvalidFormat',
      'Either `files` or `pattern` must be provided.'
    );
  }

  let resolved: string[];
  if (files && files.length > 0) {
    resolved = files;
  } else if (pattern) {
    resolved = await fg(pattern, { onlyFiles: true, absolute: true });
    if (resolved.length === 0) {
      throw new CoreError(
        'NoFilesMatched',
        `No files matched pattern: ${pattern}`
      );
    }
  } else {
    resolved = [];
  }

  const converted: BatchConvertResult[] = [];
  const failed: BatchFailure[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const src of resolved) {
    try {
      if (existsSync(src)) totalIn += statSync(src).size;
      const dst = computeBatchDst(src, format, outSuffix);
      const result = await convertImage({
        src, dst, format, quality, lossless, overwrite
      });
      converted.push({
        src,
        dst: result.dst,
        size: result.size,
        width: result.width,
        height: result.height
      });
      totalOut += result.size;
    } catch (err) {
      const e = err as CoreError | Error;
      failed.push({
        src,
        error: e.message ?? String(err)
      });
    }
  }

  return { converted, failed, totalIn, totalOut };
}

function computeBatchDst(
  src: string,
  format: BatchOptions['format'],
  outSuffix?: string
): string {
  if (!outSuffix) {
    return deriveDst(src, format);
  }
  const parsed = parse(src);
  const ext = format === 'jpeg' ? '.jpg' : `.${format}`;
  return join(parsed.dir, `${parsed.name}${outSuffix}${ext}`);
}
