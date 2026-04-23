import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getImageInfo } from '../src/probe.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { CoreError } from '../src/types.js';

describe('getImageInfo', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('returns correct metadata for a 64x64 PNG', async () => {
    const info = await getImageInfo(fx.samplePng);
    expect(info.width).toBe(64);
    expect(info.height).toBe(64);
    expect(info.format).toBe('png');
    expect(info.size).toBeGreaterThan(0);
    expect(info.hasAlpha).toBe(false);
  });

  it('detects alpha channel for transparent PNG', async () => {
    const info = await getImageInfo(fx.transparentPng);
    expect(info.hasAlpha).toBe(true);
  });

  it('returns format "jpeg" for JPG files', async () => {
    const info = await getImageInfo(fx.sampleJpg);
    expect(info.format).toBe('jpeg');
  });

  it('throws FileNotFound for missing path', async () => {
    await expect(getImageInfo('/does/not/exist.png')).rejects.toThrow(CoreError);
    await expect(getImageInfo('/does/not/exist.png')).rejects.toMatchObject({
      code: 'FileNotFound'
    });
  });

  it('throws InvalidFormat for non-image file', async () => {
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const txt = join(fx.dir, 'not-an-image.txt');
    writeFileSync(txt, 'hello world');
    await expect(getImageInfo(txt)).rejects.toThrow(CoreError);
    await expect(getImageInfo(txt)).rejects.toMatchObject({
      code: 'InvalidFormat'
    });
  });
});
