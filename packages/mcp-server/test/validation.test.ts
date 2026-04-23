import { describe, it, expect } from 'vitest';
import {
  validateAbsolutePath,
  validateFileSize,
  validateGlobPattern,
  MAX_FILE_SIZE
} from '../src/validation.js';

describe('validateAbsolutePath', () => {
  it('accepts absolute paths', () => {
    expect(() => validateAbsolutePath('/Users/adam/foo.png')).not.toThrow();
  });

  it('rejects relative paths', () => {
    expect(() => validateAbsolutePath('foo.png')).toThrow(/absolute/i);
    expect(() => validateAbsolutePath('./foo.png')).toThrow(/absolute/i);
    expect(() => validateAbsolutePath('../foo.png')).toThrow(/absolute/i);
  });

  it('rejects paths containing ..', () => {
    expect(() => validateAbsolutePath('/Users/adam/../etc/passwd')).toThrow(/traversal/i);
  });

  it('rejects empty string', () => {
    expect(() => validateAbsolutePath('')).toThrow();
  });
});

describe('validateFileSize', () => {
  it('accepts files at or below MAX_FILE_SIZE', () => {
    expect(() => validateFileSize(MAX_FILE_SIZE, '/a.png')).not.toThrow();
    expect(() => validateFileSize(MAX_FILE_SIZE - 1, '/a.png')).not.toThrow();
  });

  it('rejects files above MAX_FILE_SIZE', () => {
    expect(() => validateFileSize(MAX_FILE_SIZE + 1, '/a.png')).toThrow(/too large/i);
  });

  it('MAX_FILE_SIZE is 100 MB', () => {
    expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
  });
});

describe('validateGlobPattern', () => {
  it('accepts patterns with an absolute base directory', () => {
    expect(() => validateGlobPattern('/Users/adam/icons/**/*.png')).not.toThrow();
    expect(() => validateGlobPattern('/Users/adam/foo/*.jpg')).not.toThrow();
  });

  it('rejects patterns starting with glob wildcards', () => {
    expect(() => validateGlobPattern('**/*.png')).toThrow(/base/i);
    expect(() => validateGlobPattern('*.png')).toThrow(/base/i);
  });

  it('rejects relative patterns', () => {
    expect(() => validateGlobPattern('icons/**/*.png')).toThrow(/absolute/i);
  });

  it('rejects patterns containing ..', () => {
    expect(() => validateGlobPattern('/Users/adam/../../**/*.png')).toThrow(/traversal/i);
  });
});
