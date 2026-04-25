import * as fs from 'node:fs';
import * as path from 'node:path';

export type TargetFormat = 'same' | 'png' | 'jpeg' | 'webp' | 'avif';

export interface Conflict {
  src: string;
  dst: string;
}

export function computeTargetPath(srcPath: string, format: TargetFormat): string {
  if (format === 'same') return srcPath;
  const ext = format === 'jpeg' ? 'jpg' : format;
  const dir = path.dirname(srcPath);
  const base = path.basename(srcPath, path.extname(srcPath));
  return path.join(dir, `${base}.${ext}`);
}

export function detectConflicts(srcPaths: string[], format: TargetFormat): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const src of srcPaths) {
    const dst = computeTargetPath(src, format);
    // Overwrite-in-place is expected behavior, not a conflict.
    if (dst === src) continue;
    if (fs.existsSync(dst)) conflicts.push({ src, dst });
  }
  return conflicts;
}
