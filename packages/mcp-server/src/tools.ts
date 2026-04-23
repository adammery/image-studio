import {
  getImageInfo,
  convertImage,
  resizeImage,
  cropImage,
  batchConvert,
  type ImageFormat
} from '@image-studio/core';
import { statSync } from 'node:fs';
import {
  validateAbsolutePath,
  validateFileSize,
  validateGlobPattern
} from './validation.js';
import { toStructuredError, type StructuredError } from './errors.js';

export const TOOL_DEFINITIONS = [
  {
    name: 'get_image_info',
    description: 'Read image metadata (width, height, format, size, alpha, colorspace) without modifying the file.',
    inputSchema: {
      type: 'object',
      properties: { src: { type: 'string', description: 'Absolute path to the image' } },
      required: ['src']
    }
  },
  {
    name: 'convert_image',
    description: 'Convert a single image to a different format (png, jpeg, webp, avif). When the source and target format match, overwrites the source; when they differ, writes next to the source with the new extension (unless `dst` is specified).',
    inputSchema: {
      type: 'object',
      properties: {
        src: { type: 'string', description: 'Absolute path to source image' },
        dst: { type: 'string', description: 'Optional absolute path to output' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp', 'avif'] },
        quality: { type: 'number', minimum: 1, maximum: 100 },
        lossless: { type: 'boolean', description: 'For webp/avif only' },
        overwrite: { type: 'boolean', description: 'Allow overwriting existing dst' }
      },
      required: ['src', 'format']
    }
  },
  {
    name: 'resize_image',
    description: 'Resize an image. At least one of width or height is required. When only one is provided, aspect ratio is preserved.',
    inputSchema: {
      type: 'object',
      properties: {
        src: { type: 'string' },
        dst: { type: 'string' },
        width: { type: 'number', minimum: 1 },
        height: { type: 'number', minimum: 1 },
        fit: { type: 'string', enum: ['inside', 'cover', 'contain'] },
        overwrite: { type: 'boolean' }
      },
      required: ['src']
    }
  },
  {
    name: 'crop_image',
    description: 'Extract a rectangle from an image.',
    inputSchema: {
      type: 'object',
      properties: {
        src: { type: 'string' },
        dst: { type: 'string' },
        x: { type: 'number', minimum: 0 },
        y: { type: 'number', minimum: 0 },
        width: { type: 'number', minimum: 1 },
        height: { type: 'number', minimum: 1 },
        overwrite: { type: 'boolean' }
      },
      required: ['src', 'x', 'y', 'width', 'height']
    }
  },
  {
    name: 'batch_convert',
    description: 'Convert multiple images to a target format. Accepts either an explicit `files` list or a `pattern` glob. Glob patterns must have an absolute base directory (e.g., /Users/you/icons/**/*.png).',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
        pattern: { type: 'string' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp', 'avif'] },
        quality: { type: 'number', minimum: 1, maximum: 100 },
        lossless: { type: 'boolean' },
        outSuffix: { type: 'string', description: 'e.g., "-compressed" → file-compressed.webp' },
        overwrite: { type: 'boolean' }
      },
      required: ['format']
    }
  }
] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function fail(err: StructuredError): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(err) }] };
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_image_info': {
        const src = String(args.src);
        validateAbsolutePath(src);
        validateFileSize(statSync(src).size, src);
        const info = await getImageInfo(src);
        return ok(info);
      }
      case 'convert_image': {
        const src = String(args.src);
        validateAbsolutePath(src);
        validateFileSize(statSync(src).size, src);
        if (args.dst) validateAbsolutePath(String(args.dst));
        const result = await convertImage({
          src,
          dst: args.dst ? String(args.dst) : undefined,
          format: args.format as ImageFormat,
          quality: args.quality as number | undefined,
          lossless: args.lossless as boolean | undefined,
          overwrite: args.overwrite as boolean | undefined
        });
        return ok(result);
      }
      case 'resize_image': {
        const src = String(args.src);
        validateAbsolutePath(src);
        validateFileSize(statSync(src).size, src);
        if (args.dst) validateAbsolutePath(String(args.dst));
        const result = await resizeImage({
          src,
          dst: args.dst ? String(args.dst) : undefined,
          width: args.width as number | undefined,
          height: args.height as number | undefined,
          fit: args.fit as 'inside' | 'cover' | 'contain' | undefined,
          overwrite: args.overwrite as boolean | undefined
        });
        return ok(result);
      }
      case 'crop_image': {
        const src = String(args.src);
        validateAbsolutePath(src);
        validateFileSize(statSync(src).size, src);
        if (args.dst) validateAbsolutePath(String(args.dst));
        const result = await cropImage({
          src,
          dst: args.dst ? String(args.dst) : undefined,
          x: Number(args.x),
          y: Number(args.y),
          width: Number(args.width),
          height: Number(args.height),
          overwrite: args.overwrite as boolean | undefined
        });
        return ok(result);
      }
      case 'batch_convert': {
        const filesArg = args.files as string[] | undefined;
        const pattern = args.pattern as string | undefined;

        if (filesArg) {
          for (const f of filesArg) validateAbsolutePath(f);
        }
        if (pattern) validateGlobPattern(pattern);

        // Resolve glob to explicit list so we can size-check uniformly
        let workingFiles: string[] | undefined = filesArg;
        if (!filesArg && pattern) {
          const fg = (await import('fast-glob')).default;
          workingFiles = await fg(pattern, { onlyFiles: true, absolute: true });
          if (workingFiles.length === 0) {
            return fail({
              error: {
                code: 'NoFilesMatched',
                message: `No files matched pattern: ${pattern}`
              }
            });
          }
        }

        // Per-file size check: oversized → preFailed, missing → pass through
        // (core's batchConvert records missing files in its own failed[] array).
        const preFailed: Array<{ src: string; error: string }> = [];
        if (workingFiles) {
          const passing: string[] = [];
          for (const f of workingFiles) {
            try {
              validateFileSize(statSync(f).size, f);
              passing.push(f);
            } catch (err) {
              const e = err as NodeJS.ErrnoException;
              if (e.code === 'ENOENT') {
                passing.push(f);
              } else {
                preFailed.push({ src: f, error: (err as Error).message });
              }
            }
          }
          workingFiles = passing;
        }

        const result = await batchConvert({
          files: workingFiles,
          pattern: workingFiles ? undefined : pattern,
          format: args.format as ImageFormat,
          quality: args.quality as number | undefined,
          lossless: args.lossless as boolean | undefined,
          outSuffix: args.outSuffix as string | undefined,
          overwrite: args.overwrite as boolean | undefined
        });

        return ok({
          ...result,
          failed: [...result.failed, ...preFailed]
        });
      }
      default:
        return fail({
          error: { code: 'InvalidFormat', message: `Unknown tool: ${name}` }
        });
    }
  } catch (err) {
    return fail(toStructuredError(err));
  }
}
