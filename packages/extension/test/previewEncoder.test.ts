import { describe, it, expect } from 'vitest';
import { PreviewEncoder } from '../src/previewEncoder.js';

const fakeContext = {
  globalStorageUri: { fsPath: '/tmp/preview-encoder-test' },
} as any;

const state = { format: 'same' as const, quality: 80, lossless: false, compareMode: 'slider' as const, trashOriginal: false };

function wait(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

describe('PreviewEncoder', () => {
  it('calls onResult after debounce fires (real timers)', async () => {
    const results: unknown[] = [];
    const enc = new PreviewEncoder(fakeContext, (r) => results.push(r));
    enc.schedule('/nonexistent.png', state);
    expect(results).toHaveLength(0);
    await wait(400); // > 300ms debounce
    expect(results).toHaveLength(1);
    enc.dispose();
  });

  it('cancels previous calls when rescheduled rapidly', async () => {
    let callCount = 0;
    const enc = new PreviewEncoder(fakeContext, () => { callCount++; });
    enc.schedule('/nonexistent.png', state);
    enc.schedule('/nonexistent.png', state);
    enc.schedule('/nonexistent.png', state);
    await wait(400);
    expect(callCount).toBe(1); // only one fires despite three calls
    enc.dispose();
  });

  it('cancels on dispose before debounce fires', async () => {
    let callCount = 0;
    const enc = new PreviewEncoder(fakeContext, () => { callCount++; });
    enc.schedule('/nonexistent.png', state);
    enc.dispose();
    await wait(400);
    expect(callCount).toBe(0);
  });
});
