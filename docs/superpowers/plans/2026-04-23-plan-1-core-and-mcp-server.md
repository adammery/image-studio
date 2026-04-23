# Image Studio — Plan 1: Core Library & MCP Server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `packages/core/` sharp-wrapper library and the `packages/mcp-server/` MCP tool server so Claude (and any MCP client) can convert, resize, crop, and inspect images programmatically. After this plan, the user's top-priority capability — "convert all PNGs in /icons to webp 80" from chat — works end-to-end. The VSCode extension GUI is deferred to Plan 2.

**Architecture:** npm-workspaces monorepo. `core/` is a pure TypeScript library wrapping `sharp`. `mcp-server/` registers MCP tools that call into `core/`. Both use `vitest`. The packages are independent: `core/` alone is testable in isolation; `mcp-server/` depends on `core/` via npm workspace linking.

**Tech Stack:** TypeScript 5.x, `sharp` 0.33.x, `@modelcontextprotocol/sdk` 1.x, `vitest` 1.x, `fast-glob` 3.x, `eslint` + `@typescript-eslint` 7.x.

**Reference:** Design spec at `docs/superpowers/specs/2026-04-22-image-editor-design.md` — tool schemas (§6.2), security constraints (§6.4), error codes (§6.5).

**Working directory:** `/Users/adam/Projects/image-studio/`. All commands below use absolute paths or `-C` flag to target this repo.

---

## Task 1: Initialize monorepo root

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.nvmrc`
- Create: `.eslintrc.cjs`
- Create: `README.md`

- [ ] **Step 1: Create `.nvmrc`**

Write `/Users/adam/Projects/image-studio/.nvmrc`:
```
20
```

- [ ] **Step 2: Create workspace-root `package.json`**

Write `/Users/adam/Projects/image-studio/package.json`:
```json
{
  "name": "image-studio",
  "version": "0.1.0",
  "private": true,
  "description": "Image editor and AI converter for VSCode",
  "license": "MIT",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "npm-run-all --parallel dev:*",
    "dev:core": "npm run dev --workspace=packages/core",
    "dev:mcp": "npm run dev --workspace=packages/mcp-server",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "eslint 'packages/*/src/**/*.ts'"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.16.0",
    "@typescript-eslint/parser": "^7.16.0",
    "eslint": "^8.57.0",
    "npm-run-all": "^4.1.5",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

Write `/Users/adam/Projects/image-studio/tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- [ ] **Step 4: Create `.eslintrc.cjs`**

Write `/Users/adam/Projects/image-studio/.eslintrc.cjs`:
```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  env: { node: true, es2022: true },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.config.js', '*.cjs']
};
```

- [ ] **Step 5: Replace placeholder `README.md`**

Write `/Users/adam/Projects/image-studio/README.md`:
```markdown
# Image Studio

Image editor and AI converter for VSCode.

## Status

MVP under active development. See `docs/superpowers/specs/` for the design
and `docs/superpowers/plans/` for implementation plans.

## Packages

- `packages/core/` — sharp-based image operations (pure library)
- `packages/mcp-server/` — MCP server exposing operations for AI clients
- `packages/extension/` — VSCode extension (Plan 2, not yet implemented)

## Development

Requires Node 20 LTS.

```bash
nvm use            # activate Node 20 from .nvmrc
npm install        # installs all workspace packages
npm test           # runs all package tests
```

## License

MIT
```

- [ ] **Step 6: Install root devDependencies**

Run:
```bash
npm install --prefix /Users/adam/Projects/image-studio
```
Expected: `node_modules/` populated, `package-lock.json` created, no errors.

- [ ] **Step 7: Commit**

```bash
git -C /Users/adam/Projects/image-studio add package.json package-lock.json tsconfig.base.json .nvmrc .eslintrc.cjs README.md
git -C /Users/adam/Projects/image-studio commit -m "Initialize monorepo root with npm workspaces, TypeScript, ESLint"
```

---

## Task 2: Initialize `core` package skeleton

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/index.ts` (empty exports, will grow)
- Create: `packages/core/vitest.config.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

Write `/Users/adam/Projects/image-studio/packages/core/package.json`:
```json
{
  "name": "@image-studio/core",
  "version": "0.1.0",
  "private": true,
  "description": "Image operations (sharp wrappers) for Image Studio",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "sharp": "^0.33.4"
  },
  "devDependencies": {
    "@types/node": "^20.12.12"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

Write `/Users/adam/Projects/image-studio/packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["test/**/*", "dist/**/*"]
}
```

- [ ] **Step 3: Create type definitions**

Write `/Users/adam/Projects/image-studio/packages/core/src/types.ts`:
```typescript
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif';

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
  colorspace: string;
}

export interface ConvertOptions {
  src: string;
  dst?: string;
  format: ImageFormat;
  quality?: number;
  lossless?: boolean;
  overwrite?: boolean;
}

export interface ResizeOptions {
  src: string;
  dst?: string;
  width?: number;
  height?: number;
  fit?: 'inside' | 'cover' | 'contain';
  overwrite?: boolean;
}

export interface CropRect {
  src: string;
  dst?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  overwrite?: boolean;
}

export interface OperationResult {
  dst: string;
  size: number;
  width: number;
  height: number;
}

export interface BatchOptions {
  files?: string[];
  pattern?: string;
  format: ImageFormat;
  quality?: number;
  lossless?: boolean;
  outSuffix?: string;
  overwrite?: boolean;
}

export interface BatchConvertResult {
  src: string;
  dst: string;
  size: number;
  width: number;
  height: number;
}

export interface BatchFailure {
  src: string;
  error: string;
}

export interface BatchResult {
  converted: BatchConvertResult[];
  failed: BatchFailure[];
  totalIn: number;
  totalOut: number;
}

export class CoreError extends Error {
  constructor(
    public readonly code:
      | 'FileNotFound'
      | 'InvalidFormat'
      | 'OutputExists'
      | 'TooLarge'
      | 'SharpError'
      | 'PermissionDenied'
      | 'NoFilesMatched',
    message: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = 'CoreError';
  }
}
```

- [ ] **Step 4: Create empty `packages/core/src/index.ts`**

Write `/Users/adam/Projects/image-studio/packages/core/src/index.ts`:
```typescript
export * from './types.js';
```

- [ ] **Step 5: Create `vitest.config.ts`**

Write `/Users/adam/Projects/image-studio/packages/core/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['test/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000
  }
});
```

- [ ] **Step 6: Install core dependencies**

Run:
```bash
npm install --prefix /Users/adam/Projects/image-studio
```
Expected: `sharp` and `@types/node` resolved into `packages/core/node_modules` (via workspace hoisting).

- [ ] **Step 7: Verify build succeeds (empty module)**

Run:
```bash
npm run build --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: `packages/core/dist/types.js`, `packages/core/dist/index.js` produced, no errors.

- [ ] **Step 8: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/core/package.json packages/core/tsconfig.json packages/core/src/types.ts packages/core/src/index.ts packages/core/vitest.config.ts package-lock.json
git -C /Users/adam/Projects/image-studio commit -m "Add core package skeleton with type definitions"
```

---

## Task 3: Test fixtures generator

**Goal:** Programmatically generate small test images in a temp directory rather than committing binary files. Produces a helper each test suite can use.

**Files:**
- Create: `packages/core/test/fixtures.ts`
- Create: `packages/core/test/_setup.test.ts`

- [ ] **Step 1: Write fixtures helper**

Write `/Users/adam/Projects/image-studio/packages/core/test/fixtures.ts`:
```typescript
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
```

- [ ] **Step 2: Write smoke test for fixtures helper itself**

Write `/Users/adam/Projects/image-studio/packages/core/test/_setup.test.ts`:
```typescript
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { existsSync, statSync } from 'node:fs';

describe('test fixtures generator', () => {
  let fx: TestFixtures;

  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('creates all expected sample files', () => {
    for (const f of [fx.samplePng, fx.sampleJpg, fx.sampleWebp, fx.largePng, fx.transparentPng]) {
      expect(existsSync(f)).toBe(true);
      expect(statSync(f).size).toBeGreaterThan(0);
    }
  });

  it('cleanup removes the temp directory', () => {
    const fxLocal = fx;
    fxLocal.cleanup();
    expect(existsSync(fxLocal.dir)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/core/test/fixtures.ts packages/core/test/_setup.test.ts
git -C /Users/adam/Projects/image-studio commit -m "Add test fixture generator for core"
```

---

## Task 4: `core/probe.ts` — getImageInfo

**Files:**
- Create: `packages/core/src/probe.ts`
- Create: `packages/core/test/probe.test.ts`
- Modify: `packages/core/src/index.ts` (export probe)

- [ ] **Step 1: Write failing test**

Write `/Users/adam/Projects/image-studio/packages/core/test/probe.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getImageInfo } from '../src/probe.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { CoreError } from '../src/types.js';

describe('getImageInfo', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('returns correct metadata for a 64x64 PNG', async () => {
    const info = await getImageInfo(fx.samplePng);
    expect(info.width).toBe(64);
    expect(info.height).toBe(64);
    expect(info.format).toBe('png');
    expect(info.size).toBeGreaterThan(0);
    expect(info.hasAlpha).toBe(false);
  });

  it('detects alpha channel for transparent PNG', async () => {
    const info = await getImageInfo(fx.transparentPng);
    expect(info.hasAlpha).toBe(true);
  });

  it('returns format "jpeg" for JPG files', async () => {
    const info = await getImageInfo(fx.sampleJpg);
    expect(info.format).toBe('jpeg');
  });

  it('throws FileNotFound for missing path', async () => {
    await expect(getImageInfo('/does/not/exist.png')).rejects.toThrow(CoreError);
    await expect(getImageInfo('/does/not/exist.png')).rejects.toMatchObject({
      code: 'FileNotFound'
    });
  });

  it('throws InvalidFormat for non-image file', async () => {
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const txt = join(fx.dir, 'not-an-image.txt');
    writeFileSync(txt, 'hello world');
    await expect(getImageInfo(txt)).rejects.toThrow(CoreError);
    await expect(getImageInfo(txt)).rejects.toMatchObject({
      code: 'InvalidFormat'
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: FAIL with `Cannot find module '../src/probe.js'` or similar.

- [ ] **Step 3: Implement `probe.ts`**

Write `/Users/adam/Projects/image-studio/packages/core/src/probe.ts`:
```typescript
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { CoreError, type ImageInfo } from './types.js';

export async function getImageInfo(src: string): Promise<ImageInfo> {
  let size: number;
  try {
    size = statSync(src).size;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new CoreError('FileNotFound', `File not found: ${src}`);
    }
    if (e.code === 'EACCES') {
      throw new CoreError('PermissionDenied', `Cannot read file: ${src}`);
    }
    throw new CoreError('SharpError', `Cannot stat file: ${src}`, e.message);
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(src).metadata();
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    throw new CoreError('InvalidFormat', `Not a supported image: ${src}`, msg);
  }

  if (!meta.width || !meta.height || !meta.format) {
    throw new CoreError('InvalidFormat', `Incomplete image metadata: ${src}`);
  }

  return {
    width: meta.width,
    height: meta.height,
    format: meta.format,
    size,
    hasAlpha: meta.hasAlpha ?? false,
    colorspace: meta.space ?? 'srgb'
  };
}
```

- [ ] **Step 4: Add export to `packages/core/src/index.ts`**

Replace `/Users/adam/Projects/image-studio/packages/core/src/index.ts` with:
```typescript
export * from './types.js';
export { getImageInfo } from './probe.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: 5 tests in `probe.test.ts` pass, plus the 2 from `_setup.test.ts` = 7 total passing.

- [ ] **Step 6: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/core/src/probe.ts packages/core/src/index.ts packages/core/test/probe.test.ts
git -C /Users/adam/Projects/image-studio commit -m "Implement core probe.ts (getImageInfo) with tests"
```

---

## Task 5: `core/convert.ts` — convertImage

**Files:**
- Create: `packages/core/src/convert.ts`
- Create: `packages/core/src/_paths.ts` (helper for output path derivation; reused later)
- Create: `packages/core/test/convert.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write path helper (used by convert, resize, crop)**

Write `/Users/adam/Projects/image-studio/packages/core/src/_paths.ts`:
```typescript
import { parse, join } from 'node:path';
import type { ImageFormat } from './types.js';

const FORMAT_EXT: Record<ImageFormat, string> = {
  png: '.png',
  jpeg: '.jpg',
  webp: '.webp',
  avif: '.avif'
};

/**
 * Derive output path when dst is omitted.
 * If format differs from source ext, output goes next to source with new ext.
 * If format matches source ext, output overwrites source.
 */
export function deriveDst(src: string, format: ImageFormat): string {
  const parsed = parse(src);
  const targetExt = FORMAT_EXT[format];
  const currentExt = parsed.ext.toLowerCase();
  const normalizedCurrent = currentExt === '.jpeg' ? '.jpg' : currentExt;
  if (normalizedCurrent === targetExt) {
    return src;
  }
  return join(parsed.dir, parsed.name + targetExt);
}
```

- [ ] **Step 2: Write failing test**

Write `/Users/adam/Projects/image-studio/packages/core/test/convert.test.ts`:
```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: FAIL with `Cannot find module '../src/convert.js'`.

- [ ] **Step 4: Implement `convert.ts`**

Write `/Users/adam/Projects/image-studio/packages/core/src/convert.ts`:
```typescript
import sharp from 'sharp';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { CoreError, type ConvertOptions, type ImageFormat, type OperationResult } from './types.js';
import { deriveDst } from './_paths.js';

export async function convertImage(opts: ConvertOptions): Promise<OperationResult> {
  const { src, format, quality, lossless, overwrite } = opts;

  if (!existsSync(src)) {
    throw new CoreError('FileNotFound', `File not found: ${src}`);
  }

  const dst = opts.dst ?? deriveDst(src, format);

  if (dst !== src && existsSync(dst) && !overwrite) {
    throw new CoreError(
      'OutputExists',
      `Output already exists: ${dst}. Set overwrite: true to replace it.`
    );
  }

  let pipeline: sharp.Sharp;
  try {
    pipeline = sharp(src);
    await pipeline.metadata(); // validate it's a readable image
  } catch (err) {
    throw new CoreError(
      'InvalidFormat',
      `Not a supported image: ${src}`,
      (err as Error).message
    );
  }

  pipeline = sharp(src); // fresh pipeline for output
  pipeline = applyFormat(pipeline, format, quality, lossless);

  try {
    // toFile requires dst != src. If they equal, go through buffer.
    if (dst === src) {
      const buf = await pipeline.toBuffer();
      writeFileSync(dst, buf);
    } else {
      await pipeline.toFile(dst);
    }
  } catch (err) {
    throw new CoreError(
      'SharpError',
      `Failed to encode image: ${(err as Error).message}`,
      String(err)
    );
  }

  const meta = await sharp(dst).metadata();
  const size = statSync(dst).size;
  return {
    dst,
    size,
    width: meta.width ?? 0,
    height: meta.height ?? 0
  };
}

function applyFormat(
  pipeline: sharp.Sharp,
  format: ImageFormat,
  quality?: number,
  lossless?: boolean
): sharp.Sharp {
  switch (format) {
    case 'png':
      return pipeline.png({ compressionLevel: 9 });
    case 'jpeg':
      return pipeline.jpeg({ quality: quality ?? 80 });
    case 'webp':
      return lossless
        ? pipeline.webp({ lossless: true })
        : pipeline.webp({ quality: quality ?? 80 });
    case 'avif':
      return lossless
        ? pipeline.avif({ lossless: true })
        : pipeline.avif({ quality: quality ?? 50 });
    default:
      throw new CoreError('InvalidFormat', `Unsupported format: ${format}`);
  }
}
```

- [ ] **Step 5: Update `packages/core/src/index.ts`**

Replace with:
```typescript
export * from './types.js';
export { getImageInfo } from './probe.js';
export { convertImage } from './convert.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: 8 convert tests pass, plus earlier tests — 15 total passing.

- [ ] **Step 7: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/core/src/convert.ts packages/core/src/_paths.ts packages/core/src/index.ts packages/core/test/convert.test.ts
git -C /Users/adam/Projects/image-studio commit -m "Implement core convert.ts with format, quality, lossless, overwrite options"
```

---

## Task 6: `core/resize.ts` — resizeImage

**Files:**
- Create: `packages/core/src/resize.ts`
- Create: `packages/core/test/resize.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/adam/Projects/image-studio/packages/core/test/resize.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resizeImage } from '../src/resize.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

describe('resizeImage', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('resizes to exact width+height', async () => {
    const dst = join(fx.dir, 'resized.png');
    const result = await resizeImage({
      src: fx.largePng,
      dst,
      width: 100,
      height: 50
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    const meta = await sharp(dst).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it('preserves aspect ratio when only width provided', async () => {
    const dst = join(fx.dir, 'aspect-w.png');
    const result = await resizeImage({
      src: fx.largePng, // 256x256
      dst,
      width: 128
    });
    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
  });

  it('preserves aspect ratio when only height provided', async () => {
    const dst = join(fx.dir, 'aspect-h.png');
    const result = await resizeImage({
      src: fx.largePng,
      dst,
      height: 64
    });
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
  });

  it('overwrites source when dst omitted (in-place resize)', async () => {
    const src = join(fx.dir, 'inplace.png');
    writeFileSync(src, readFileSync(fx.largePng));
    await resizeImage({ src, width: 32, height: 32 });
    const meta = await sharp(src).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(32);
  });

  it('throws FileNotFound for missing src', async () => {
    await expect(resizeImage({
      src: '/nowhere.png',
      width: 100
    })).rejects.toMatchObject({ code: 'FileNotFound' });
  });

  it('throws OutputExists when dst exists without overwrite', async () => {
    const dst = join(fx.dir, 'exists-resize.png');
    writeFileSync(dst, 'existing');
    await expect(resizeImage({
      src: fx.largePng,
      dst,
      width: 100
    })).rejects.toMatchObject({ code: 'OutputExists' });
  });

  it('throws InvalidFormat when no dimensions provided', async () => {
    await expect(resizeImage({
      src: fx.largePng
    })).rejects.toMatchObject({ code: 'InvalidFormat' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: FAIL with `Cannot find module '../src/resize.js'`.

- [ ] **Step 3: Implement `resize.ts`**

Write `/Users/adam/Projects/image-studio/packages/core/src/resize.ts`:
```typescript
import sharp from 'sharp';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { CoreError, type ResizeOptions, type OperationResult } from './types.js';

export async function resizeImage(opts: ResizeOptions): Promise<OperationResult> {
  const { src, width, height, fit, overwrite } = opts;

  if (!existsSync(src)) {
    throw new CoreError('FileNotFound', `File not found: ${src}`);
  }

  if (!width && !height) {
    throw new CoreError(
      'InvalidFormat',
      'At least one of width or height must be provided.'
    );
  }

  const dst = opts.dst ?? src;

  if (dst !== src && existsSync(dst) && !overwrite) {
    throw new CoreError(
      'OutputExists',
      `Output already exists: ${dst}. Set overwrite: true to replace it.`
    );
  }

  let metaBefore: sharp.Metadata;
  try {
    metaBefore = await sharp(src).metadata();
  } catch (err) {
    throw new CoreError(
      'InvalidFormat',
      `Not a supported image: ${src}`,
      (err as Error).message
    );
  }

  try {
    const buf = await sharp(src)
      .resize({
        width,
        height,
        fit: fit ?? 'inside',
        withoutEnlargement: false
      })
      .toBuffer();
    writeFileSync(dst, buf);
  } catch (err) {
    throw new CoreError(
      'SharpError',
      `Resize failed: ${(err as Error).message}`
    );
  }

  const meta = await sharp(dst).metadata();
  const size = statSync(dst).size;
  return {
    dst,
    size,
    width: meta.width ?? 0,
    height: meta.height ?? 0
  };
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

Replace with:
```typescript
export * from './types.js';
export { getImageInfo } from './probe.js';
export { convertImage } from './convert.js';
export { resizeImage } from './resize.js';
```

- [ ] **Step 5: Run tests**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: 7 resize tests pass, earlier tests still pass — 22 total.

- [ ] **Step 6: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/core/src/resize.ts packages/core/src/index.ts packages/core/test/resize.test.ts
git -C /Users/adam/Projects/image-studio commit -m "Implement core resize.ts with aspect ratio preservation"
```

---

## Task 7: `core/crop.ts` — cropImage

**Files:**
- Create: `packages/core/src/crop.ts`
- Create: `packages/core/test/crop.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/adam/Projects/image-studio/packages/core/test/crop.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: FAIL — `Cannot find module '../src/crop.js'`.

- [ ] **Step 3: Implement `crop.ts`**

Write `/Users/adam/Projects/image-studio/packages/core/src/crop.ts`:
```typescript
import sharp from 'sharp';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { CoreError, type CropRect, type OperationResult } from './types.js';

export async function cropImage(opts: CropRect): Promise<OperationResult> {
  const { src, x, y, width, height, overwrite } = opts;

  if (!existsSync(src)) {
    throw new CoreError('FileNotFound', `File not found: ${src}`);
  }

  if (x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new CoreError(
      'InvalidFormat',
      `Invalid crop rect: x=${x}, y=${y}, w=${width}, h=${height}. All must be non-negative; w,h > 0.`
    );
  }

  const dst = opts.dst ?? src;

  if (dst !== src && existsSync(dst) && !overwrite) {
    throw new CoreError(
      'OutputExists',
      `Output already exists: ${dst}. Set overwrite: true to replace it.`
    );
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(src).metadata();
  } catch (err) {
    throw new CoreError(
      'InvalidFormat',
      `Not a supported image: ${src}`,
      (err as Error).message
    );
  }

  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (x + width > srcW || y + height > srcH) {
    throw new CoreError(
      'InvalidFormat',
      `Crop rect (${x},${y},${width}x${height}) exceeds image bounds (${srcW}x${srcH}).`
    );
  }

  try {
    const buf = await sharp(src).extract({ left: x, top: y, width, height }).toBuffer();
    writeFileSync(dst, buf);
  } catch (err) {
    throw new CoreError(
      'SharpError',
      `Crop failed: ${(err as Error).message}`
    );
  }

  const outMeta = await sharp(dst).metadata();
  const size = statSync(dst).size;
  return {
    dst,
    size,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0
  };
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

Replace with:
```typescript
export * from './types.js';
export { getImageInfo } from './probe.js';
export { convertImage } from './convert.js';
export { resizeImage } from './resize.js';
export { cropImage } from './crop.js';
```

- [ ] **Step 5: Run tests**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: 7 crop tests pass, 22 from before — 29 total.

- [ ] **Step 6: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/core/src/crop.ts packages/core/src/index.ts packages/core/test/crop.test.ts
git -C /Users/adam/Projects/image-studio commit -m "Implement core crop.ts with bounds validation"
```

---

## Task 8: `core/batch.ts` — batchConvert

**Files:**
- Create: `packages/core/src/batch.ts`
- Create: `packages/core/test/batch.test.ts`
- Modify: `packages/core/package.json` (add fast-glob)
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add `fast-glob` dependency**

Modify `/Users/adam/Projects/image-studio/packages/core/package.json` — update `dependencies`:
```json
{
  "name": "@image-studio/core",
  "version": "0.1.0",
  "private": true,
  "description": "Image operations (sharp wrappers) for Image Studio",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fast-glob": "^3.3.2",
    "sharp": "^0.33.4"
  },
  "devDependencies": {
    "@types/node": "^20.12.12"
  }
}
```

Run:
```bash
npm install --prefix /Users/adam/Projects/image-studio
```
Expected: `fast-glob` resolved.

- [ ] **Step 2: Write failing test**

Write `/Users/adam/Projects/image-studio/packages/core/test/batch.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { batchConvert } from '../src/batch.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('batchConvert', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx?.cleanup());

  it('converts explicit file list to webp', async () => {
    const result = await batchConvert({
      files: [fx.samplePng, fx.largePng],
      format: 'webp',
      quality: 80
    });
    expect(result.converted.length).toBe(2);
    expect(result.failed.length).toBe(0);
    expect(result.totalIn).toBeGreaterThan(0);
    expect(result.totalOut).toBeGreaterThan(0);
    for (const entry of result.converted) {
      expect(existsSync(entry.dst)).toBe(true);
      expect(entry.dst.endsWith('.webp')).toBe(true);
    }
  });

  it('converts by glob pattern', async () => {
    const pattern = join(fx.dir, '*.png');
    const result = await batchConvert({
      pattern,
      format: 'webp',
      quality: 80
    });
    expect(result.converted.length).toBeGreaterThanOrEqual(2); // samplePng + largePng + transparentPng
    expect(result.failed.length).toBe(0);
  });

  it('applies outSuffix when provided', async () => {
    const result = await batchConvert({
      files: [fx.samplePng],
      format: 'webp',
      outSuffix: '-compressed'
    });
    expect(result.converted[0].dst).toMatch(/sample-compressed\.webp$/);
  });

  it('records failures without aborting other files', async () => {
    const result = await batchConvert({
      files: [fx.samplePng, '/does/not/exist.png'],
      format: 'webp'
    });
    expect(result.converted.length).toBe(1);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].src).toBe('/does/not/exist.png');
    expect(result.failed[0].error).toContain('File not found');
  });

  it('throws NoFilesMatched when glob matches nothing', async () => {
    const pattern = join(fx.dir, 'nothing-here-*.xyz');
    await expect(batchConvert({
      pattern,
      format: 'webp'
    })).rejects.toMatchObject({ code: 'NoFilesMatched' });
  });

  it('throws InvalidFormat when both files and pattern are missing', async () => {
    await expect(batchConvert({
      format: 'webp'
    } as never)).rejects.toMatchObject({ code: 'InvalidFormat' });
  });

  it('respects overwrite flag for existing dst files', async () => {
    const dstA = join(fx.dir, 'sample.webp');
    writeFileSync(dstA, 'pre-existing');
    const result = await batchConvert({
      files: [fx.samplePng],
      format: 'webp',
      overwrite: true
    });
    expect(result.converted.length).toBe(1);
    expect(result.failed.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: FAIL — `Cannot find module '../src/batch.js'`.

- [ ] **Step 4: Implement `batch.ts`**

Write `/Users/adam/Projects/image-studio/packages/core/src/batch.ts`:
```typescript
import fg from 'fast-glob';
import { statSync, existsSync } from 'node:fs';
import { parse, join } from 'node:path';
import { convertImage } from './convert.js';
import { deriveDst } from './_paths.js';
import {
  CoreError,
  type BatchOptions,
  type BatchResult,
  type BatchConvertResult,
  type BatchFailure
} from './types.js';

export async function batchConvert(opts: BatchOptions): Promise<BatchResult> {
  const { files, pattern, format, quality, lossless, outSuffix, overwrite } = opts;

  if (!files && !pattern) {
    throw new CoreError(
      'InvalidFormat',
      'Either `files` or `pattern` must be provided.'
    );
  }

  let resolved: string[];
  if (files && files.length > 0) {
    resolved = files;
  } else if (pattern) {
    resolved = await fg(pattern, { onlyFiles: true, absolute: true });
    if (resolved.length === 0) {
      throw new CoreError(
        'NoFilesMatched',
        `No files matched pattern: ${pattern}`
      );
    }
  } else {
    resolved = [];
  }

  const converted: BatchConvertResult[] = [];
  const failed: BatchFailure[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const src of resolved) {
    try {
      if (existsSync(src)) totalIn += statSync(src).size;
      const dst = computeBatchDst(src, format, outSuffix);
      const result = await convertImage({
        src, dst, format, quality, lossless, overwrite
      });
      converted.push({
        src,
        dst: result.dst,
        size: result.size,
        width: result.width,
        height: result.height
      });
      totalOut += result.size;
    } catch (err) {
      const e = err as CoreError | Error;
      failed.push({
        src,
        error: e.message ?? String(err)
      });
    }
  }

  return { converted, failed, totalIn, totalOut };
}

function computeBatchDst(
  src: string,
  format: BatchOptions['format'],
  outSuffix?: string
): string {
  if (!outSuffix) {
    return deriveDst(src, format);
  }
  const parsed = parse(src);
  const ext = format === 'jpeg' ? '.jpg' : `.${format}`;
  return join(parsed.dir, `${parsed.name}${outSuffix}${ext}`);
}
```

- [ ] **Step 5: Update `packages/core/src/index.ts`**

Replace with:
```typescript
export * from './types.js';
export { getImageInfo } from './probe.js';
export { convertImage } from './convert.js';
export { resizeImage } from './resize.js';
export { cropImage } from './crop.js';
export { batchConvert } from './batch.js';
```

- [ ] **Step 6: Run tests**

Run:
```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
```
Expected: 7 batch tests pass, 29 from before — 36 total.

- [ ] **Step 7: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/core/src/batch.ts packages/core/src/index.ts packages/core/package.json packages/core/test/batch.test.ts package-lock.json
git -C /Users/adam/Projects/image-studio commit -m "Implement core batch.ts with glob and explicit file list support"
```

---

## Task 9: Initialize `mcp-server` package

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/vitest.config.ts`
- Create: `packages/mcp-server/src/index.ts` (entry stub)

- [ ] **Step 1: Create `packages/mcp-server/package.json`**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/package.json`:
```json
{
  "name": "image-studio-mcp",
  "version": "0.1.0",
  "description": "MCP server exposing Image Studio operations to AI clients",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "bin": {
    "image-studio-mcp": "dist/index.js"
  },
  "files": ["dist/"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@image-studio/core": "*",
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.12"
  }
}
```

- [ ] **Step 2: Create `packages/mcp-server/tsconfig.json`**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": false
  },
  "include": ["src/**/*"],
  "exclude": ["test/**/*", "dist/**/*"],
  "references": [
    { "path": "../core" }
  ]
}
```

- [ ] **Step 3: Create `packages/mcp-server/vitest.config.ts`**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['test/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000
  }
});
```

- [ ] **Step 4: Create entry stub**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/src/index.ts`:
```typescript
#!/usr/bin/env node
// Entry point for image-studio-mcp. Wires up the MCP server.
// Full implementation arrives in Task 11.

console.error('image-studio-mcp: not yet wired up');
process.exit(1);
```

- [ ] **Step 5: Install dependencies**

Run:
```bash
npm install --prefix /Users/adam/Projects/image-studio
```
Expected: `@modelcontextprotocol/sdk` resolved; `@image-studio/core` linked via workspace.

- [ ] **Step 6: Verify build**

Run:
```bash
npm run build --workspace=packages/mcp-server --prefix /Users/adam/Projects/image-studio
```
Expected: `packages/mcp-server/dist/index.js` produced.

- [ ] **Step 7: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/mcp-server/package.json packages/mcp-server/tsconfig.json packages/mcp-server/vitest.config.ts packages/mcp-server/src/index.ts package-lock.json
git -C /Users/adam/Projects/image-studio commit -m "Add mcp-server package skeleton with SDK dependency"
```

---

## Task 10: Validation utilities for MCP server

**Goal:** Security constraints from spec §6.4 — absolute paths, no `..` traversal, 100 MB size cap, glob base-dir requirement. These live in `mcp-server/` since they apply at the AI boundary, not to core library internals.

**Files:**
- Create: `packages/mcp-server/src/validation.ts`
- Create: `packages/mcp-server/test/validation.test.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/test/validation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  validateAbsolutePath,
  validateFileSize,
  validateGlobPattern,
  MAX_FILE_SIZE
} from '../src/validation.js';

describe('validateAbsolutePath', () => {
  it('accepts absolute paths', () => {
    expect(() => validateAbsolutePath('/Users/adam/foo.png')).not.toThrow();
  });

  it('rejects relative paths', () => {
    expect(() => validateAbsolutePath('foo.png')).toThrow(/absolute/i);
    expect(() => validateAbsolutePath('./foo.png')).toThrow(/absolute/i);
    expect(() => validateAbsolutePath('../foo.png')).toThrow(/absolute/i);
  });

  it('rejects paths containing ..', () => {
    expect(() => validateAbsolutePath('/Users/adam/../etc/passwd')).toThrow(/traversal/i);
  });

  it('rejects empty string', () => {
    expect(() => validateAbsolutePath('')).toThrow();
  });
});

describe('validateFileSize', () => {
  it('accepts files at or below MAX_FILE_SIZE', () => {
    expect(() => validateFileSize(MAX_FILE_SIZE, '/a.png')).not.toThrow();
    expect(() => validateFileSize(MAX_FILE_SIZE - 1, '/a.png')).not.toThrow();
  });

  it('rejects files above MAX_FILE_SIZE', () => {
    expect(() => validateFileSize(MAX_FILE_SIZE + 1, '/a.png')).toThrow(/too large/i);
  });

  it('MAX_FILE_SIZE is 100 MB', () => {
    expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
  });
});

describe('validateGlobPattern', () => {
  it('accepts patterns with an absolute base directory', () => {
    expect(() => validateGlobPattern('/Users/adam/icons/**/*.png')).not.toThrow();
    expect(() => validateGlobPattern('/Users/adam/foo/*.jpg')).not.toThrow();
  });

  it('rejects patterns starting with glob wildcards', () => {
    expect(() => validateGlobPattern('**/*.png')).toThrow(/base/i);
    expect(() => validateGlobPattern('*.png')).toThrow(/base/i);
  });

  it('rejects relative patterns', () => {
    expect(() => validateGlobPattern('icons/**/*.png')).toThrow(/absolute/i);
  });

  it('rejects patterns containing ..', () => {
    expect(() => validateGlobPattern('/Users/adam/../../**/*.png')).toThrow(/traversal/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test --workspace=packages/mcp-server --prefix /Users/adam/Projects/image-studio
```
Expected: FAIL — `Cannot find module '../src/validation.js'`.

- [ ] **Step 3: Implement `validation.ts`**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/src/validation.ts`:
```typescript
import { isAbsolute } from 'node:path';

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export function validateAbsolutePath(p: string): void {
  if (!p) {
    throw new Error('Path must not be empty.');
  }
  if (!isAbsolute(p)) {
    throw new Error(`Path must be absolute, got: ${p}`);
  }
  if (p.includes('..')) {
    throw new Error(`Path must not contain ".." (traversal rejected): ${p}`);
  }
}

export function validateFileSize(bytes: number, src: string): void {
  if (bytes > MAX_FILE_SIZE) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File too large: ${src} is ${mb} MB (limit: 100 MB).`
    );
  }
}

export function validateGlobPattern(pattern: string): void {
  if (!pattern) {
    throw new Error('Glob pattern must not be empty.');
  }
  if (pattern.includes('..')) {
    throw new Error(`Glob must not contain ".." (traversal rejected): ${pattern}`);
  }
  if (!isAbsolute(pattern) && !pattern.startsWith('/')) {
    throw new Error(`Glob pattern must be absolute, got: ${pattern}`);
  }

  // Base directory must be concrete — pattern must not START with a glob char
  // after the leading slash.
  const afterSlash = pattern.replace(/^\/+/, '');
  if (/^[*?{[]/.test(afterSlash)) {
    throw new Error(
      `Glob must have a concrete base directory. Pattern started with a wildcard: ${pattern}`
    );
  }
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
npm test --workspace=packages/mcp-server --prefix /Users/adam/Projects/image-studio
```
Expected: All validation tests pass (~13 tests in the file).

- [ ] **Step 5: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/mcp-server/src/validation.ts packages/mcp-server/test/validation.test.ts
git -C /Users/adam/Projects/image-studio commit -m "Add validation utilities for MCP boundary (paths, size, globs)"
```

---

## Task 11: MCP server skeleton with tool registration

**Goal:** Wire up the MCP SDK, register tool schemas, and dispatch tool calls. Handlers delegate to `core/`. Security validation runs in every handler. Errors map to structured responses with the spec's error codes.

**Files:**
- Create: `packages/mcp-server/src/errors.ts`
- Create: `packages/mcp-server/src/tools.ts`
- Create: `packages/mcp-server/src/server.ts`
- Modify: `packages/mcp-server/src/index.ts` (replace stub with real entry)
- Create: `packages/mcp-server/test/server.test.ts`

- [ ] **Step 1: Create `errors.ts`**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/src/errors.ts`:
```typescript
import { CoreError } from '@image-studio/core';

export interface StructuredError {
  error: {
    code:
      | 'FileNotFound'
      | 'InvalidFormat'
      | 'OutputExists'
      | 'TooLarge'
      | 'SharpError'
      | 'PermissionDenied'
      | 'NoFilesMatched';
    message: string;
    detail?: string;
  };
}

export function toStructuredError(err: unknown): StructuredError {
  if (err instanceof CoreError) {
    return { error: { code: err.code, message: err.message, detail: err.detail } };
  }
  const e = err as Error;
  const msg = e?.message ?? String(err);

  if (/too large/i.test(msg)) {
    return { error: { code: 'TooLarge', message: msg } };
  }
  if (/absolute|traversal|base directory|empty/i.test(msg)) {
    return { error: { code: 'InvalidFormat', message: msg } };
  }

  return { error: { code: 'SharpError', message: msg } };
}
```

- [ ] **Step 2: Create `tools.ts` with schemas**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/src/tools.ts`:
```typescript
import {
  getImageInfo,
  convertImage,
  resizeImage,
  cropImage,
  batchConvert,
  type ImageFormat
} from '@image-studio/core';
import { statSync } from 'node:fs';
import {
  validateAbsolutePath,
  validateFileSize,
  validateGlobPattern
} from './validation.js';
import { toStructuredError, type StructuredError } from './errors.js';

export const TOOL_DEFINITIONS = [
  {
    name: 'get_image_info',
    description: 'Read image metadata (width, height, format, size, alpha, colorspace) without modifying the file.',
    inputSchema: {
      type: 'object',
      properties: { src: { type: 'string', description: 'Absolute path to the image' } },
      required: ['src']
    }
  },
  {
    name: 'convert_image',
    description: 'Convert a single image to a different format (png, jpeg, webp, avif). When the source and target format match, overwrites the source; when they differ, writes next to the source with the new extension (unless `dst` is specified).',
    inputSchema: {
      type: 'object',
      properties: {
        src: { type: 'string', description: 'Absolute path to source image' },
        dst: { type: 'string', description: 'Optional absolute path to output' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp', 'avif'] },
        quality: { type: 'number', minimum: 1, maximum: 100 },
        lossless: { type: 'boolean', description: 'For webp/avif only' },
        overwrite: { type: 'boolean', description: 'Allow overwriting existing dst' }
      },
      required: ['src', 'format']
    }
  },
  {
    name: 'resize_image',
    description: 'Resize an image. At least one of width or height is required. When only one is provided, aspect ratio is preserved.',
    inputSchema: {
      type: 'object',
      properties: {
        src: { type: 'string' },
        dst: { type: 'string' },
        width: { type: 'number', minimum: 1 },
        height: { type: 'number', minimum: 1 },
        fit: { type: 'string', enum: ['inside', 'cover', 'contain'] },
        overwrite: { type: 'boolean' }
      },
      required: ['src']
    }
  },
  {
    name: 'crop_image',
    description: 'Extract a rectangle from an image.',
    inputSchema: {
      type: 'object',
      properties: {
        src: { type: 'string' },
        dst: { type: 'string' },
        x: { type: 'number', minimum: 0 },
        y: { type: 'number', minimum: 0 },
        width: { type: 'number', minimum: 1 },
        height: { type: 'number', minimum: 1 },
        overwrite: { type: 'boolean' }
      },
      required: ['src', 'x', 'y', 'width', 'height']
    }
  },
  {
    name: 'batch_convert',
    description: 'Convert multiple images to a target format. Accepts either an explicit `files` list or a `pattern` glob. Glob patterns must have an absolute base directory (e.g., /Users/you/icons/**/*.png).',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
        pattern: { type: 'string' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp', 'avif'] },
        quality: { type: 'number', minimum: 1, maximum: 100 },
        lossless: { type: 'boolean' },
        outSuffix: { type: 'string', description: 'e.g., "-compressed" → file-compressed.webp' },
        overwrite: { type: 'boolean' }
      },
      required: ['format']
    }
  }
] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function fail(err: StructuredError): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(err) }] };
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_image_info': {
        const src = String(args.src);
        validateAbsolutePath(src);
        validateFileSize(statSync(src).size, src);
        const info = await getImageInfo(src);
        return ok(info);
      }
      case 'convert_image': {
        const src = String(args.src);
        validateAbsolutePath(src);
        validateFileSize(statSync(src).size, src);
        if (args.dst) validateAbsolutePath(String(args.dst));
        const result = await convertImage({
          src,
          dst: args.dst ? String(args.dst) : undefined,
          format: args.format as ImageFormat,
          quality: args.quality as number | undefined,
          lossless: args.lossless as boolean | undefined,
          overwrite: args.overwrite as boolean | undefined
        });
        return ok(result);
      }
      case 'resize_image': {
        const src = String(args.src);
        validateAbsolutePath(src);
        validateFileSize(statSync(src).size, src);
        if (args.dst) validateAbsolutePath(String(args.dst));
        const result = await resizeImage({
          src,
          dst: args.dst ? String(args.dst) : undefined,
          width: args.width as number | undefined,
          height: args.height as number | undefined,
          fit: args.fit as 'inside' | 'cover' | 'contain' | undefined,
          overwrite: args.overwrite as boolean | undefined
        });
        return ok(result);
      }
      case 'crop_image': {
        const src = String(args.src);
        validateAbsolutePath(src);
        validateFileSize(statSync(src).size, src);
        if (args.dst) validateAbsolutePath(String(args.dst));
        const result = await cropImage({
          src,
          dst: args.dst ? String(args.dst) : undefined,
          x: Number(args.x),
          y: Number(args.y),
          width: Number(args.width),
          height: Number(args.height),
          overwrite: args.overwrite as boolean | undefined
        });
        return ok(result);
      }
      case 'batch_convert': {
        const files = args.files as string[] | undefined;
        const pattern = args.pattern as string | undefined;
        if (files) {
          for (const f of files) validateAbsolutePath(f);
          for (const f of files) {
            try { validateFileSize(statSync(f).size, f); } catch (_) { /* per-file failure handled in batchConvert */ }
          }
        }
        if (pattern) validateGlobPattern(pattern);
        const result = await batchConvert({
          files,
          pattern,
          format: args.format as ImageFormat,
          quality: args.quality as number | undefined,
          lossless: args.lossless as boolean | undefined,
          outSuffix: args.outSuffix as string | undefined,
          overwrite: args.overwrite as boolean | undefined
        });
        return ok(result);
      }
      default:
        return fail({
          error: { code: 'InvalidFormat', message: `Unknown tool: ${name}` }
        });
    }
  } catch (err) {
    return fail(toStructuredError(err));
  }
}
```

- [ ] **Step 3: Create `server.ts`**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/src/server.ts`:
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITIONS, dispatchTool } from './tools.js';

export async function runServer(): Promise<void> {
  const server = new Server(
    { name: 'image-studio-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS as unknown as Array<{
      name: string;
      description: string;
      inputSchema: unknown;
    }>
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    return dispatchTool(name, (args ?? {}) as Record<string, unknown>);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 4: Replace `index.ts` stub with real entry**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/src/index.ts`:
```typescript
#!/usr/bin/env node
import { runServer } from './server.js';

runServer().catch((err) => {
  console.error('image-studio-mcp failed to start:', err);
  process.exit(1);
});
```

- [ ] **Step 5: Write integration test — tool listing and a real convert call**

Write `/Users/adam/Projects/image-studio/packages/mcp-server/test/server.test.ts`:
```typescript
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
});
```

- [ ] **Step 6: Run tests**

Run:
```bash
npm test --workspace=packages/mcp-server --prefix /Users/adam/Projects/image-studio
```
Expected: 8 server tests pass, plus 13 validation = 21 total in mcp-server. Core tests still green.

- [ ] **Step 7: Build and verify binary starts (smoke)**

Run:
```bash
npm run build --workspace=packages/mcp-server --prefix /Users/adam/Projects/image-studio
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node /Users/adam/Projects/image-studio/packages/mcp-server/dist/index.js
```
Expected: JSON response on stdout listing all 5 tools (structure per MCP protocol). No crash. You may see warnings on stderr — that's fine.

- [ ] **Step 8: Commit**

```bash
git -C /Users/adam/Projects/image-studio add packages/mcp-server/src/errors.ts packages/mcp-server/src/tools.ts packages/mcp-server/src/server.ts packages/mcp-server/src/index.ts packages/mcp-server/test/server.test.ts
git -C /Users/adam/Projects/image-studio commit -m "Wire up MCP server with 5 tools, validation, structured errors"
```

---

## Task 12: End-to-end verification with Claude Code

**Goal:** Connect the built MCP server to Claude Code (locally, via direct path) and verify Claude can invoke each tool. This is a MANUAL task — user operates Claude Code while the assistant observes and confirms output.

**Files:**
- Modify: `README.md` (add MCP setup section)

- [ ] **Step 1: Verify the built binary exists**

Run:
```bash
ls -la /Users/adam/Projects/image-studio/packages/mcp-server/dist/index.js
```
Expected: file exists.

- [ ] **Step 2: Create a test image for Claude to operate on**

Create a small test image Claude can convert:
```bash
node -e "
const sharp = require('/Users/adam/Projects/image-studio/node_modules/sharp');
sharp({ create: { width: 128, height: 128, channels: 3, background: { r: 100, g: 150, b: 200 } } })
  .png()
  .toFile('/Users/adam/Projects/image-studio/test-fixture.png')
  .then(() => console.log('Wrote test-fixture.png'));
"
```
Expected: `test-fixture.png` created in project root.

- [ ] **Step 3: Add MCP config block to Claude Code settings**

User opens `~/.claude/settings.json` (or wherever Claude Code stores MCP server configs) and adds:
```json
{
  "mcpServers": {
    "image-studio": {
      "command": "node",
      "args": ["/Users/adam/Projects/image-studio/packages/mcp-server/dist/index.js"]
    }
  }
}
```

(For production distribution later this becomes `"command": "npx", "args": ["-y", "image-studio-mcp"]`.)

- [ ] **Step 4: Restart Claude Code so it picks up the new MCP server**

User exits and re-launches Claude Code.

- [ ] **Step 5: Verify Claude sees the tools**

User asks Claude: "What MCP tools are available from image-studio?"
Expected: Claude lists `get_image_info`, `convert_image`, `resize_image`, `crop_image`, `batch_convert`.

- [ ] **Step 6: Invoke `get_image_info`**

User asks: "Use image-studio to tell me about /Users/adam/Projects/image-studio/test-fixture.png"
Expected: Claude reports width=128, height=128, format=png.

- [ ] **Step 7: Invoke `convert_image`**

User asks: "Convert /Users/adam/Projects/image-studio/test-fixture.png to webp with quality 80."
Expected: Claude confirms creation of `/Users/adam/Projects/image-studio/test-fixture.webp`. User verifies with `ls` that the file exists.

- [ ] **Step 8: Invoke `batch_convert` with a glob**

User creates a few PNGs and asks: "Convert all PNGs in /Users/adam/Projects/image-studio/*.png to webp 80."
Expected: Claude calls batch_convert, reports per-file conversion, totals. User verifies with `ls`.

- [ ] **Step 9: Add MCP setup section to README**

Replace `/Users/adam/Projects/image-studio/README.md` with:
```markdown
# Image Studio

Image editor and AI converter for VSCode.

## Status

MVP under active development. See `docs/superpowers/specs/` for the design
and `docs/superpowers/plans/` for implementation plans.

## Packages

- `packages/core/` — sharp-based image operations (pure library)
- `packages/mcp-server/` — MCP server exposing operations for AI clients
- `packages/extension/` — VSCode extension (Plan 2, not yet implemented)

## Development

Requires Node 20 LTS.

```bash
nvm use            # activate Node 20 from .nvmrc
npm install        # installs all workspace packages
npm test           # runs all package tests
npm run build      # builds all workspace packages
```

## Using the MCP server with Claude Code (local development)

After `npm run build`, add this block to your Claude Code `settings.json`:

```json
{
  "mcpServers": {
    "image-studio": {
      "command": "node",
      "args": ["/absolute/path/to/image-studio/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Code. The following tools become available:

- `get_image_info(src)` — read metadata
- `convert_image({src, format, quality?, lossless?, dst?, overwrite?})` — format conversion
- `resize_image({src, width?, height?, fit?, dst?, overwrite?})` — resize
- `crop_image({src, x, y, width, height, dst?, overwrite?})` — extract rectangle
- `batch_convert({files? | pattern?, format, quality?, outSuffix?, overwrite?})` — multi-file conversion

### Example prompts

- "Convert all PNGs in `/Users/me/icons/` to webp quality 80."
- "What size is `/Users/me/photo.jpg`?"
- "Resize `/Users/me/banner.png` to width 1200 keeping aspect ratio."

## License

MIT
```

- [ ] **Step 10: Clean up test fixtures and commit**

Run:
```bash
rm -f /Users/adam/Projects/image-studio/test-fixture.png /Users/adam/Projects/image-studio/test-fixture.webp
```

Commit:
```bash
git -C /Users/adam/Projects/image-studio add README.md
git -C /Users/adam/Projects/image-studio commit -m "Document MCP server setup for Claude Code in README"
```

---

## Completion checklist

After all tasks above:

- [ ] `core/` package has 5 public functions (`getImageInfo`, `convertImage`, `resizeImage`, `cropImage`, `batchConvert`) plus types and error class
- [ ] `core/` test suite has ≥36 passing tests
- [ ] `mcp-server/` package has 5 registered MCP tools
- [ ] `mcp-server/` test suite has ≥21 passing tests
- [ ] `npm run build` in the root succeeds with zero TypeScript errors
- [ ] `npm run lint` is clean
- [ ] Claude Code can call all 5 tools end-to-end
- [ ] README documents MCP setup
- [ ] Git history is linear, with one commit per task

After this plan is executed, **Plan 2** (VSCode extension GUI) can begin. Plan 2 depends on `@image-studio/core` via workspace linking — no core changes will be needed.
