import sharp from 'sharp';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestFixtures {
  dir: string;
  samplePng: string;      // 64x64 red PNG
  sampleJpg: string;      // 64x64 red JPEG
  largePng: string;       // 256x256 red PNG (for resize tests)
  transparentPng: string; // 64x64 red PNG with alpha channel
  cleanup: () => void;
}

export async function makeFixtures(): Promise<TestFixtures> {
  const dir = mkdtempSync(join(tmpdir(), 'image-studio-test-'));

  const [redPng, redJpg, largeRedPng, transparentPng] = await Promise.all([
    sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer(),
    sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg({ quality: 80 }).toBuffer(),
    sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer(),
    sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer(),
  ]);

  const samplePng = join(dir, 'sample.png');
  const sampleJpg = join(dir, 'sample.jpg');
  const largePng = join(dir, 'large.png');
  const transparentPngPath = join(dir, 'transparent.png');

  writeFileSync(samplePng, redPng);
  writeFileSync(sampleJpg, redJpg);
  writeFileSync(largePng, largeRedPng);
  writeFileSync(transparentPngPath, transparentPng);

  return {
    dir,
    samplePng,
    sampleJpg,
    largePng,
    transparentPng: transparentPngPath,
    cleanup: () => {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  };
}
