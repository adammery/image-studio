import { describe, it, expect } from 'vitest';
import { BatchEstimator } from '../src/batchEstimator.js';

const settings = { format: 'webp' as const, quality: 80, lossless: false };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('BatchEstimator', () => {
  it('reports an error result for nonexistent file (sharp throws)', async () => {
    const results = new Map<string, unknown>();
    const est = new BatchEstimator((src, r) => results.set(src, r));
    est.schedule('/nonexistent.png', settings);
    await wait(400);
    expect(results.has('/nonexistent.png')).toBe(true);
    const r = results.get('/nonexistent.png') as { ok: boolean };
    expect(r.ok).toBe(false);
    est.dispose();
  });

  it('coalesces rapid schedules for the same key', async () => {
    let calls = 0;
    const est = new BatchEstimator(() => { calls++; });
    est.schedule('/nonexistent.png', settings);
    est.schedule('/nonexistent.png', settings);
    est.schedule('/nonexistent.png', settings);
    await wait(400);
    expect(calls).toBe(1);
    est.dispose();
  });

  it('cancels work on dispose', async () => {
    let calls = 0;
    const est = new BatchEstimator(() => { calls++; });
    est.schedule('/nonexistent.png', settings);
    est.dispose();
    await wait(400);
    expect(calls).toBe(0);
  });

  it('invalidate(srcPath) drops the cached entry', async () => {
    const est = new BatchEstimator(() => {});
    est.schedule('/nonexistent.png', settings);
    await wait(400);
    expect(est.has('/nonexistent.png', settings)).toBe(true);
    est.invalidate('/nonexistent.png');
    expect(est.has('/nonexistent.png', settings)).toBe(false);
    est.dispose();
  });
});
