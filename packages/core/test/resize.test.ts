import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resizeImage } from '../src/resize.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

describe('resizeImage', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('resizes to exact width+height', async () => {
    const dst = join(fx.dir, 'resized.png');
    const result = await resizeImage({
      src: fx.largePng,
      dst,
      width: 100,
      height: 50
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    const meta = await sharp(dst).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it('preserves aspect ratio when only width provided', async () => {
    const dst = join(fx.dir, 'aspect-w.png');
    const result = await resizeImage({
      src: fx.largePng, // 256x256
      dst,
      width: 128
    });
    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
  });

  it('preserves aspect ratio when only height provided', async () => {
    const dst = join(fx.dir, 'aspect-h.png');
    const result = await resizeImage({
      src: fx.largePng,
      dst,
      height: 64
    });
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
  });

  it('overwrites source when dst omitted (in-place resize)', async () => {
    const src = join(fx.dir, 'inplace.png');
    writeFileSync(src, readFileSync(fx.largePng));
    await resizeImage({ src, width: 32, height: 32 });
    const meta = await sharp(src).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(32);
  });

  it('throws FileNotFound for missing src', async () => {
    await expect(resizeImage({
      src: '/nowhere.png',
      width: 100
    })).rejects.toMatchObject({ code: 'FileNotFound' });
  });

  it('throws OutputExists when dst exists without overwrite', async () => {
    const dst = join(fx.dir, 'exists-resize.png');
    writeFileSync(dst, 'existing');
    await expect(resizeImage({
      src: fx.largePng,
      dst,
      width: 100
    })).rejects.toMatchObject({ code: 'OutputExists' });
  });

  it('throws InvalidFormat when no dimensions provided', async () => {
    await expect(resizeImage({
      src: fx.largePng
    })).rejects.toMatchObject({ code: 'InvalidFormat' });
  });
});
