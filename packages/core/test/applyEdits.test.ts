import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { applyEdits } from '../src/applyEdits.js';
import { CoreError, defaultEditState } from '../src/types.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';

describe('applyEdits', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx.cleanup());

  it('converts format (png → webp)', async () => {
    const dst = join(fx.dir, 'out.webp');
    const result = await applyEdits(fx.samplePng, dst, { ...defaultEditState(), format: 'webp', quality: 80 });
    expect(result.dst).toBe(dst);
    expect(existsSync(dst)).toBe(true);
    const meta = await sharp(dst).metadata();
    expect(meta.format).toBe('webp');
    expect(result.originalTrashed).toBe(false);
  });

  it('crops image to correct dimensions', async () => {
    const dst = join(fx.dir, 'cropped.png');
    const result = await applyEdits(fx.samplePng, dst, {
      ...defaultEditState(),
      crop: { x: 0, y: 0, width: 32, height: 32 },
    }, { overwrite: true });
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });

  it('resizes image', async () => {
    const dst = join(fx.dir, 'resized.png');
    const result = await applyEdits(fx.largePng, dst, {
      ...defaultEditState(),
      resize: { width: 100, height: 100, lockAspect: false },
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('applies crop then resize in order', async () => {
    const dst = join(fx.dir, 'crop-resize.png');
    const result = await applyEdits(fx.largePng, dst, {
      ...defaultEditState(),
      crop:   { x: 0, y: 0, width: 128, height: 128 },
      resize: { width: 64, height: 64, lockAspect: false },
    });
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
  });

  it('lossless webp produces valid file', async () => {
    const dst = join(fx.dir, 'lossless.webp');
    await applyEdits(fx.samplePng, dst, { ...defaultEditState(), format: 'webp', lossless: true });
    const meta = await sharp(dst).metadata();
    expect(meta.format).toBe('webp');
  });

  it('throws OutputExists when dst exists and overwrite not set', async () => {
    const dst = join(fx.dir, 'exists.png');
    await applyEdits(fx.samplePng, dst, defaultEditState());
    await expect(
      applyEdits(fx.samplePng, dst, defaultEditState())
    ).rejects.toMatchObject({ code: 'OutputExists' });
  });

  it('overwrites when overwrite: true', async () => {
    const dst = join(fx.dir, 'overwrite.png');
    await applyEdits(fx.samplePng, dst, defaultEditState());
    await expect(
      applyEdits(fx.samplePng, dst, defaultEditState(), { overwrite: true })
    ).resolves.toBeDefined();
  });

  it('throws FileNotFound for missing source', async () => {
    await expect(
      applyEdits('/nonexistent/image.png', '/tmp/out.png', defaultEditState())
    ).rejects.toMatchObject({ code: 'FileNotFound' });
  });

  it('does not trash when dst === src', async () => {
    const dst = join(fx.dir, 'same-path.png');
    await applyEdits(fx.samplePng, dst, defaultEditState());
    const result = await applyEdits(dst, dst, defaultEditState(), { overwrite: true });
    expect(result.originalTrashed).toBe(false);
    expect(existsSync(dst)).toBe(true);
  });

  // Suppress unused import warning
  void CoreError;
});
