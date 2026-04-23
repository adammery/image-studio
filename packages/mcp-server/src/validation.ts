import { isAbsolute } from 'node:path';

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export function validateAbsolutePath(p: string): void {
  if (!p) {
    throw new Error('Path must not be empty.');
  }
  if (!isAbsolute(p)) {
    throw new Error(`Path must be absolute, got: ${p}`);
  }
  if (p.includes('..')) {
    throw new Error(`Path must not contain ".." (traversal rejected): ${p}`);
  }
}

export function validateFileSize(bytes: number, src: string): void {
  if (bytes > MAX_FILE_SIZE) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File too large: ${src} is ${mb} MB (limit: 100 MB).`
    );
  }
}

export function validateGlobPattern(pattern: string): void {
  if (!pattern) {
    throw new Error('Glob pattern must not be empty.');
  }
  if (pattern.includes('..')) {
    throw new Error(`Glob must not contain ".." (traversal rejected): ${pattern}`);
  }

  // Base directory must be concrete — pattern must not START with a glob char.
  if (/^[*?{[]/.test(pattern)) {
    throw new Error(
      `Glob must have a concrete base directory. Pattern started with a wildcard: ${pattern}`
    );
  }

  if (!isAbsolute(pattern) && !pattern.startsWith('/')) {
    throw new Error(`Glob pattern must be absolute, got: ${pattern}`);
  }
}
