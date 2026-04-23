import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { convertImage } from '../src/convert.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { existsSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

describe('convertImage', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('converts PNG to WebP next to source (format differs)', async () => {
    const result = await convertImage({
      src: fx.samplePng,
      format: 'webp',
      quality: 80
    });
    const expectedDst = join(fx.dir, 'sample.webp');
    expect(result.dst).toBe(expectedDst);
    expect(existsSync(expectedDst)).toBe(true);
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    const probed = await sharp(expectedDst).metadata();
    expect(probed.format).toBe('webp');
  });

  it('respects explicit dst path', async () => {
    const dst = join(fx.dir, 'explicit.avif');
    const result = await convertImage({
      src: fx.samplePng,
      dst,
      format: 'avif',
      quality: 50
    });
    expect(result.dst).toBe(dst);
    expect(existsSync(dst)).toBe(true);
  });

  it('overwrites source when format matches source extension', async () => {
    const pngCopy = join(fx.dir, 'overwrite-target.png');
    writeFileSync(pngCopy, readFileSync(fx.samplePng));
    const originalSize = statSync(pngCopy).size;
    const result = await convertImage({
      src: pngCopy,
      format: 'png'
    });
    expect(result.dst).toBe(pngCopy);
    expect(existsSync(pngCopy)).toBe(true);
    expect(statSync(pngCopy).size).toBeGreaterThan(0);
    expect(typeof originalSize).toBe('number');
  });

  it('honors lossless option for WebP', async () => {
    const dst = join(fx.dir, 'lossless.webp');
    await convertImage({
      src: fx.samplePng,
      dst,
      format: 'webp',
      lossless: true
    });
    expect(existsSync(dst)).toBe(true);
  });

  it('throws OutputExists when dst exists and overwrite flag not set', async () => {
    const dst = join(fx.dir, 'will-exist.webp');
    writeFileSync(dst, 'existing content');
    await expect(convertImage({
      src: fx.samplePng,
      dst,
      format: 'webp'
    })).rejects.toMatchObject({ code: 'OutputExists' });
  });

  it('allows overwrite when overwrite: true', async () => {
    const dst = join(fx.dir, 'overwritable.webp');
    writeFileSync(dst, 'existing');
    const result = await convertImage({
      src: fx.samplePng,
      dst,
      format: 'webp',
      overwrite: true
    });
    expect(result.dst).toBe(dst);
    const probed = await sharp(dst).metadata();
    expect(probed.format).toBe('webp');
  });

  it('throws FileNotFound for missing src', async () => {
    await expect(convertImage({
      src: '/nowhere.png',
      format: 'webp'
    })).rejects.toMatchObject({ code: 'FileNotFound' });
  });

  it('throws InvalidFormat for non-image source', async () => {
    const txt = join(fx.dir, 'text.txt');
    writeFileSync(txt, 'hello');
    await expect(convertImage({
      src: txt,
      format: 'webp'
    })).rejects.toMatchObject({ code: 'InvalidFormat' });
  });
});
