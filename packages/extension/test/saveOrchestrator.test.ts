import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { SaveOrchestrator } from '../src/saveOrchestrator.js';
import { defaultEditState } from '@image-studio/core';
import type { EditState } from '@image-studio/core';

let dir: string;
let samplePng: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'save-orch-test-'));
  const buf = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  samplePng = join(dir, 'sample.png');
  writeFileSync(samplePng, buf);
});
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('SaveOrchestrator', () => {
  it('overwrites in-place when format is same', async () => {
    const orch = new SaveOrchestrator();
    const state: EditState = { ...defaultEditState(), quality: 70 };
    const result = await orch.save(samplePng, samplePng, state, { overwrite: true });
    expect(result.dst).toBe(samplePng);
    expect(existsSync(samplePng)).toBe(true);
  });

  it('saves to a new destination', async () => {
    const orch = new SaveOrchestrator();
    const dst = join(dir, 'out-orch.webp');
    const state: EditState = { ...defaultEditState(), format: 'webp' };
    const result = await orch.save(samplePng, dst, state, {});
    expect(existsSync(dst)).toBe(true);
    expect(result.dst).toBe(dst);
  });

  it('reports originalTrashed=false when dst === src', async () => {
    const orch = new SaveOrchestrator();
    const state: EditState = { ...defaultEditState(), trashOriginal: true };
    const result = await orch.save(samplePng, samplePng, state, { overwrite: true });
    expect(result.originalTrashed).toBe(false);
  });
});
