import sharp from 'sharp';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestFixtures {
  dir: string;
  samplePng: string;      // 64x64 red PNG
  sampleJpg: string;      // 64x64 red JPEG
  sampleWebp: string;     // 64x64 red WebP
  largePng: string;       // 256x256 red PNG (for resize tests)
  transparentPng: string; // 64x64 red PNG with alpha channel
  cleanup: () => void;
}

export async function makeFixtures(): Promise<TestFixtures> {
  const dir = mkdtempSync(join(tmpdir(), 'image-studio-test-'));

  const redPng = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).png().toBuffer();

  const redJpg = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).jpeg({ quality: 80 }).toBuffer();

  const redWebp = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).webp().toBuffer();

  const largeRedPng = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).png().toBuffer();

  const transparentPng = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } }
  }).png().toBuffer();

  const samplePng = join(dir, 'sample.png');
  const sampleJpg = join(dir, 'sample.jpg');
  const sampleWebp = join(dir, 'sample.webp');
  const largePng = join(dir, 'large.png');
  const transparentPngPath = join(dir, 'transparent.png');

  writeFileSync(samplePng, redPng);
  writeFileSync(sampleJpg, redJpg);
  writeFileSync(sampleWebp, redWebp);
  writeFileSync(largePng, largeRedPng);
  writeFileSync(transparentPngPath, transparentPng);

  return {
    dir,
    samplePng,
    sampleJpg,
    sampleWebp,
    largePng,
    transparentPng: transparentPngPath,
    cleanup: () => {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  };
}
