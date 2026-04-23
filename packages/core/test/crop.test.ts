import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cropImage } from '../src/crop.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

describe('cropImage', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('crops to specified rect', async () => {
    const dst = join(fx.dir, 'cropped.png');
    const result = await cropImage({
      src: fx.largePng, // 256x256
      dst,
      x: 10,
      y: 20,
      width: 100,
      height: 50
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    const meta = await sharp(dst).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it('overwrites source when dst omitted', async () => {
    const src = join(fx.dir, 'crop-inplace.png');
    writeFileSync(src, readFileSync(fx.largePng));
    await cropImage({ src, x: 0, y: 0, width: 50, height: 50 });
    const meta = await sharp(src).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });

  it('throws FileNotFound for missing src', async () => {
    await expect(cropImage({
      src: '/nowhere.png',
      x: 0, y: 0, width: 10, height: 10
    })).rejects.toMatchObject({ code: 'FileNotFound' });
  });

  it('throws InvalidFormat when rect exceeds image bounds', async () => {
    await expect(cropImage({
      src: fx.samplePng, // 64x64
      x: 0, y: 0, width: 100, height: 100
    })).rejects.toMatchObject({ code: 'InvalidFormat' });
  });

  it('throws InvalidFormat for negative coords', async () => {
    await expect(cropImage({
      src: fx.samplePng,
      x: -1, y: 0, width: 10, height: 10
    })).rejects.toMatchObject({ code: 'InvalidFormat' });
  });

  it('throws InvalidFormat for zero-size rect', async () => {
    await expect(cropImage({
      src: fx.samplePng,
      x: 0, y: 0, width: 0, height: 10
    })).rejects.toMatchObject({ code: 'InvalidFormat' });
  });

  it('throws OutputExists when dst already present and overwrite off', async () => {
    const dst = join(fx.dir, 'crop-exists.png');
    writeFileSync(dst, 'existing');
    await expect(cropImage({
      src: fx.samplePng,
      dst,
      x: 0, y: 0, width: 10, height: 10
    })).rejects.toMatchObject({ code: 'OutputExists' });
  });
});
