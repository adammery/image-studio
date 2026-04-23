import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { batchConvert } from '../src/batch.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('batchConvert', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('converts explicit file list to webp', async () => {
    const result = await batchConvert({
      files: [fx.samplePng, fx.largePng],
      format: 'webp',
      quality: 80
    });
    expect(result.converted.length).toBe(2);
    expect(result.failed.length).toBe(0);
    expect(result.totalIn).toBeGreaterThan(0);
    expect(result.totalOut).toBeGreaterThan(0);
    for (const entry of result.converted) {
      expect(existsSync(entry.dst)).toBe(true);
      expect(entry.dst.endsWith('.webp')).toBe(true);
    }
  });

  it('converts by glob pattern', async () => {
    const pattern = join(fx.dir, '*.png');
    const result = await batchConvert({
      pattern,
      format: 'webp',
      quality: 80,
      overwrite: true
    });
    expect(result.converted.length).toBeGreaterThanOrEqual(2);
    expect(result.failed.length).toBe(0);
  });

  it('applies outSuffix when provided', async () => {
    const result = await batchConvert({
      files: [fx.samplePng],
      format: 'webp',
      outSuffix: '-compressed'
    });
    expect(result.converted[0].dst).toMatch(/sample-compressed\.webp$/);
  });

  it('records failures without aborting other files', async () => {
    const result = await batchConvert({
      files: [fx.samplePng, '/does/not/exist.png'],
      format: 'webp',
      overwrite: true
    });
    expect(result.converted.length).toBe(1);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].src).toBe('/does/not/exist.png');
    expect(result.failed[0].error).toContain('File not found');
  });

  it('throws NoFilesMatched when glob matches nothing', async () => {
    const pattern = join(fx.dir, 'nothing-here-*.xyz');
    await expect(batchConvert({
      pattern,
      format: 'webp'
    })).rejects.toMatchObject({ code: 'NoFilesMatched' });
  });

  it('throws InvalidFormat when both files and pattern are missing', async () => {
    await expect(batchConvert({
      format: 'webp'
    } as never)).rejects.toMatchObject({ code: 'InvalidFormat' });
  });

  it('respects overwrite flag for existing dst files', async () => {
    const dstA = join(fx.dir, 'sample.webp');
    writeFileSync(dstA, 'pre-existing');
    const result = await batchConvert({
      files: [fx.samplePng],
      format: 'webp',
      overwrite: true
    });
    expect(result.converted.length).toBe(1);
    expect(result.failed.length).toBe(0);
  });
});
