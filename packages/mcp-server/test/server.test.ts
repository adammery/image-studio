import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dispatchTool, TOOL_DEFINITIONS } from '../src/tools.js';
import { makeFixtures, type TestFixtures } from '../../core/test/fixtures.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('MCP tool dispatch', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('exposes 5 tools', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name).sort();
    expect(names).toEqual([
      'batch_convert',
      'convert_image',
      'crop_image',
      'get_image_info',
      'resize_image'
    ]);
  });

  it('get_image_info returns metadata JSON', async () => {
    const result = await dispatchTool('get_image_info', { src: fx.samplePng });
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.width).toBe(64);
    expect(parsed.format).toBe('png');
  });

  it('get_image_info rejects relative paths', async () => {
    const result = await dispatchTool('get_image_info', { src: 'sample.png' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe('InvalidFormat');
    expect(parsed.error.message).toMatch(/absolute/i);
  });

  it('convert_image creates webp next to png source', async () => {
    const result = await dispatchTool('convert_image', {
      src: fx.samplePng,
      format: 'webp',
      quality: 80
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.dst).toBe(join(fx.dir, 'sample.webp'));
    expect(existsSync(parsed.dst)).toBe(true);
  });

  it('convert_image rejects ../ traversal', async () => {
    const result = await dispatchTool('convert_image', {
      src: '/Users/adam/../../etc/passwd',
      format: 'webp'
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe('InvalidFormat');
    expect(parsed.error.message).toMatch(/traversal/i);
  });

  it('batch_convert handles explicit files', async () => {
    const result = await dispatchTool('batch_convert', {
      files: [fx.largePng],
      format: 'webp',
      overwrite: true
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.converted.length).toBe(1);
    expect(parsed.failed.length).toBe(0);
  });

  it('batch_convert rejects glob without base dir', async () => {
    const result = await dispatchTool('batch_convert', {
      pattern: '**/*.png',
      format: 'webp'
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe('InvalidFormat');
    expect(parsed.error.message).toMatch(/base/i);
  });

  it('unknown tool returns InvalidFormat error', async () => {
    const result = await dispatchTool('does_not_exist', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe('InvalidFormat');
  });

  it('get_image_info returns FileNotFound for missing file (not SharpError)', async () => {
    const result = await dispatchTool('get_image_info', {
      src: '/tmp/image-studio-does-not-exist-xyz.png'
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe('FileNotFound');
  });

  it('convert_image returns FileNotFound for missing file (not SharpError)', async () => {
    const result = await dispatchTool('convert_image', {
      src: '/tmp/image-studio-does-not-exist-xyz.png',
      format: 'webp'
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe('FileNotFound');
  });
});
