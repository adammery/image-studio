import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { existsSync, statSync } from 'node:fs';

describe('test fixtures generator', () => {
  let fx: TestFixtures;

  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('creates all expected sample files', () => {
    for (const f of [fx.samplePng, fx.sampleJpg, fx.largePng, fx.transparentPng]) {
      expect(existsSync(f)).toBe(true);
      expect(statSync(f).size).toBeGreaterThan(0);
    }
  });
});

describe('fixture cleanup', () => {
  it('cleanup removes the temp directory', async () => {
    const tmp = await makeFixtures();
    tmp.cleanup();
    expect(existsSync(tmp.dir)).toBe(false);
  });
});
