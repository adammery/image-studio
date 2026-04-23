import { describe, it, expect } from 'vitest';
import { PreviewEncoder } from '../src/previewEncoder.js';

const state = { format: 'same' as const, quality: 80, lossless: false, compareMode: 'slider' as const, trashOriginal: false };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('PreviewEncoder', () => {
  it('calls onResult after debounce fires', async () => {
    const results: unknown[] = [];
    const enc = new PreviewEncoder((r) => results.push(r));
    enc.schedule('/nonexistent.png', state);
    expect(results).toHaveLength(0);
    await wait(400);
    expect(results).toHaveLength(1);
    enc.dispose();
  });

  it('cancels previous calls when rescheduled rapidly', async () => {
    let callCount = 0;
    const enc = new PreviewEncoder(() => { callCount++; });
    enc.schedule('/nonexistent.png', state);
    enc.schedule('/nonexistent.png', state);
    enc.schedule('/nonexistent.png', state);
    await wait(400);
    expect(callCount).toBe(1);
    enc.dispose();
  });

  it('cancels on dispose before debounce fires', async () => {
    let callCount = 0;
    const enc = new PreviewEncoder(() => { callCount++; });
    enc.schedule('/nonexistent.png', state);
    enc.dispose();
    await wait(400);
    expect(callCount).toBe(0);
  });
});
