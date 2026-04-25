import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectConflicts, computeTargetPath } from '../src/conflictDetection.js';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-'));
  fs.writeFileSync(path.join(dir, 'hero.png'), 'src');
  fs.writeFileSync(path.join(dir, 'hero.webp'), 'existing');
  fs.writeFileSync(path.join(dir, 'about.png'), 'src');
  fs.writeFileSync(path.join(dir, 'logo.jpg'), 'src');
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('computeTargetPath', () => {
  it('replaces extension when format != same', () => {
    expect(computeTargetPath('/a/foo.png', 'webp')).toBe('/a/foo.webp');
    expect(computeTargetPath('/a/foo.PNG', 'webp')).toBe('/a/foo.webp');
    expect(computeTargetPath('/a/foo.jpg', 'jpeg')).toBe('/a/foo.jpg');
  });
  it('returns source path when format = same', () => {
    expect(computeTargetPath('/a/foo.png', 'same')).toBe('/a/foo.png');
  });
});

describe('detectConflicts', () => {
  it('flags cross-extension targets that already exist', () => {
    const conflicts = detectConflicts([path.join(dir, 'hero.png'), path.join(dir, 'about.png')], 'webp');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].src).toBe(path.join(dir, 'hero.png'));
    expect(conflicts[0].dst).toBe(path.join(dir, 'hero.webp'));
  });

  it('does NOT flag overwrite-in-place (target == source)', () => {
    const conflicts = detectConflicts([path.join(dir, 'hero.png')], 'same');
    expect(conflicts).toHaveLength(0);
  });

  it('returns empty when no conflicts', () => {
    const conflicts = detectConflicts([path.join(dir, 'logo.jpg')], 'webp');
    expect(conflicts).toEqual([]);
  });
});
