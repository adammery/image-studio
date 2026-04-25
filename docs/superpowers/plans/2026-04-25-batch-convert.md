# Batch Convert UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Batch Convert view to the Image Studio extension that lets users multi-select workspace images, set Compress (format / quality / lossless), and run a batch conversion with conflict pre-flight, per-row progress, and Trash-originals support.

**Architecture:** A second `CustomEditorProvider` (`imageStudio.batchView`) opens via a synthetic untitled URI from a sidebar header icon. The provider orchestrates four pure-logic helpers (selection store, conflict detection, batch scanner, batch estimator) and delegates per-file conversion to existing `@image-studio/core::applyEdits`. The webview is a separate esbuild bundle that mirrors the editor's shell (left = list, right = Compress panel, footer = action bar) and reuses the editor's CSS for the Compress section.

**Tech Stack:** TypeScript 5.x · `vscode` extension API ≥1.90 · `sharp` ~0.33 · `trash` ~8 · `vitest` 1.x · `esbuild` 0.21. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-04-25-batch-convert-design.md`

**Branch:** `feat/batch-convert` (already created)

---

## File Structure

**New files:**

- `packages/extension/src/selectionStore.ts` — pure class: `Set<string>` of fsPaths, distinct-folder counter, Review-mode flag.
- `packages/extension/src/conflictDetection.ts` — pure function: `(selected: string[], format, srcExtMap) => Conflict[]`. Uses `fs.existsSync`.
- `packages/extension/src/batchScanner.ts` — async function: enumerate folders that contain ≥1 image; honor `imageStudio.excludeFolders`.
- `packages/extension/src/batchEstimator.ts` — class: per-(srcPath, format, quality, lossless) cache, concurrency-limited queue, debounced re-scheduling on settings change.
- `packages/extension/src/batchBridge.ts` — postMessage type definitions (`BatchExtMessage`, `BatchWvMessage`).
- `packages/extension/src/batchEditorProvider.ts` — `CustomEditorProvider` for `imageStudio.batchView`; orchestrates the four helpers and the convert loop.
- `packages/extension/src/batchWebviewContent.ts` — HTML template + CSP for the batch webview (mirrors `webviewContent.ts`).
- `packages/extension/media/batch.ts` — webview UI: dropdown, chips, list, Compress panel, footer.
- `packages/extension/media/batch.css` — batch-specific styles (list rows, chips, status icons). Imports `webview.css` for shared section/btn classes.
- `packages/extension/test/selectionStore.test.ts`
- `packages/extension/test/conflictDetection.test.ts`
- `packages/extension/test/batchEstimator.test.ts`

**Modified files:**

- `packages/extension/package.json` — add `imageStudio.batchView` customEditor, `imageStudio.openBatchView` command, `view/title` menu contribution.
- `packages/extension/src/extension.ts` — register `BatchEditorProvider`, register `imageStudio.openBatchView` command.
- `packages/extension/esbuild.config.mjs` — add second webview entry for `media/batch.ts` → `media/batch.js`.
- `packages/extension/test/MANUAL.md` — append Batch view checklist section.

---

## Task 1: SelectionStore — pure selection state with cross-folder counter

**Files:**
- Create: `packages/extension/src/selectionStore.ts`
- Test: `packages/extension/test/selectionStore.test.ts`

- [ ] **Step 1.1: Write the failing test**

```ts
// packages/extension/test/selectionStore.test.ts
import { describe, it, expect } from 'vitest';
import { SelectionStore } from '../src/selectionStore.js';

describe('SelectionStore', () => {
  it('starts empty', () => {
    const s = new SelectionStore();
    expect(s.size).toBe(0);
    expect(s.distinctFolderCount).toBe(0);
    expect(s.toArray()).toEqual([]);
    expect(s.reviewMode).toBe(false);
  });

  it('adds and removes paths', () => {
    const s = new SelectionStore();
    s.add('/a/x.png');
    s.add('/a/y.png');
    expect(s.size).toBe(2);
    expect(s.has('/a/x.png')).toBe(true);
    s.remove('/a/x.png');
    expect(s.size).toBe(1);
    expect(s.has('/a/x.png')).toBe(false);
  });

  it('toggle flips membership', () => {
    const s = new SelectionStore();
    s.toggle('/a/x.png');
    expect(s.has('/a/x.png')).toBe(true);
    s.toggle('/a/x.png');
    expect(s.has('/a/x.png')).toBe(false);
  });

  it('distinctFolderCount counts unique parent dirs', () => {
    const s = new SelectionStore();
    s.add('/a/x.png');
    s.add('/a/y.png');
    s.add('/b/z.png');
    expect(s.distinctFolderCount).toBe(2);
  });

  it('clear empties the set and resets review mode', () => {
    const s = new SelectionStore();
    s.add('/a/x.png');
    s.reviewMode = true;
    s.clear();
    expect(s.size).toBe(0);
    expect(s.reviewMode).toBe(false);
  });

  it('add is idempotent', () => {
    const s = new SelectionStore();
    s.add('/a/x.png');
    s.add('/a/x.png');
    expect(s.size).toBe(1);
  });

  it('toArray returns insertion order', () => {
    const s = new SelectionStore();
    s.add('/a/2.png');
    s.add('/a/1.png');
    expect(s.toArray()).toEqual(['/a/2.png', '/a/1.png']);
  });
});
```

- [ ] **Step 1.2: Run test, verify it fails**

Run: `cd packages/extension && npx vitest run test/selectionStore.test.ts`
Expected: FAIL with "Cannot find module '../src/selectionStore.js'".

- [ ] **Step 1.3: Implement SelectionStore**

```ts
// packages/extension/src/selectionStore.ts
import * as path from 'node:path';

export class SelectionStore {
  private readonly _set = new Set<string>();
  reviewMode = false;

  get size(): number { return this._set.size; }

  get distinctFolderCount(): number {
    const folders = new Set<string>();
    for (const p of this._set) folders.add(path.dirname(p));
    return folders.size;
  }

  has(p: string): boolean { return this._set.has(p); }

  add(p: string): void { this._set.add(p); }

  remove(p: string): void { this._set.delete(p); }

  toggle(p: string): void {
    if (this._set.has(p)) this._set.delete(p);
    else this._set.add(p);
  }

  clear(): void {
    this._set.clear();
    this.reviewMode = false;
  }

  toArray(): string[] { return [...this._set]; }
}
```

- [ ] **Step 1.4: Run test, verify all pass**

Run: `cd packages/extension && npx vitest run test/selectionStore.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 1.5: Commit**

```bash
git add packages/extension/src/selectionStore.ts packages/extension/test/selectionStore.test.ts
git commit -m "Add SelectionStore for batch view selection state"
```

---

## Task 2: ConflictDetection — pure function with fs.existsSync

**Files:**
- Create: `packages/extension/src/conflictDetection.ts`
- Test: `packages/extension/test/conflictDetection.test.ts`

- [ ] **Step 2.1: Write the failing test**

```ts
// packages/extension/test/conflictDetection.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectConflicts, computeTargetPath } from '../src/conflictDetection.js';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-'));
  fs.writeFileSync(path.join(dir, 'hero.png'), 'src');
  fs.writeFileSync(path.join(dir, 'hero.webp'), 'existing');
  fs.writeFileSync(path.join(dir, 'about.png'), 'src');
  fs.writeFileSync(path.join(dir, 'logo.jpg'), 'src');
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('computeTargetPath', () => {
  it('replaces extension when format != same', () => {
    expect(computeTargetPath('/a/foo.png', 'webp')).toBe('/a/foo.webp');
    expect(computeTargetPath('/a/foo.PNG', 'webp')).toBe('/a/foo.webp');
    expect(computeTargetPath('/a/foo.jpg', 'jpeg')).toBe('/a/foo.jpg');
  });
  it('returns source path when format = same', () => {
    expect(computeTargetPath('/a/foo.png', 'same')).toBe('/a/foo.png');
  });
});

describe('detectConflicts', () => {
  it('flags cross-extension targets that already exist', () => {
    const conflicts = detectConflicts([path.join(dir, 'hero.png'), path.join(dir, 'about.png')], 'webp');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].src).toBe(path.join(dir, 'hero.png'));
    expect(conflicts[0].dst).toBe(path.join(dir, 'hero.webp'));
  });

  it('does NOT flag overwrite-in-place (target == source)', () => {
    const conflicts = detectConflicts([path.join(dir, 'hero.png')], 'same');
    expect(conflicts).toHaveLength(0);
  });

  it('returns empty when no conflicts', () => {
    const conflicts = detectConflicts([path.join(dir, 'logo.jpg')], 'webp');
    expect(conflicts).toEqual([]);
  });
});
```

- [ ] **Step 2.2: Run test, verify it fails**

Run: `cd packages/extension && npx vitest run test/conflictDetection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement conflictDetection**

```ts
// packages/extension/src/conflictDetection.ts
import * as fs from 'node:fs';
import * as path from 'node:path';

export type TargetFormat = 'same' | 'png' | 'jpeg' | 'webp' | 'avif';

export interface Conflict {
  src: string;
  dst: string;
}

export function computeTargetPath(srcPath: string, format: TargetFormat): string {
  if (format === 'same') return srcPath;
  const ext = format === 'jpeg' ? 'jpg' : format;
  const dir = path.dirname(srcPath);
  const base = path.basename(srcPath, path.extname(srcPath));
  return path.join(dir, `${base}.${ext}`);
}

export function detectConflicts(srcPaths: string[], format: TargetFormat): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const src of srcPaths) {
    const dst = computeTargetPath(src, format);
    // Overwrite-in-place is expected behavior, not a conflict.
    if (dst === src) continue;
    if (fs.existsSync(dst)) conflicts.push({ src, dst });
  }
  return conflicts;
}
```

- [ ] **Step 2.4: Run test, verify all pass**

Run: `cd packages/extension && npx vitest run test/conflictDetection.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 2.5: Commit**

```bash
git add packages/extension/src/conflictDetection.ts packages/extension/test/conflictDetection.test.ts
git commit -m "Add conflict detection for batch convert pre-flight"
```

---

## Task 3: BatchScanner — enumerate folders containing images

**Files:**
- Create: `packages/extension/src/batchScanner.ts`

This module wraps `vscode.workspace.findFiles` and the `imageStudio.excludeFolders` config. It cannot be unit-tested without a vscode mock; coverage is via the manual checklist (Task 14). Keep the function pure-ish so a smoke check is easy.

- [ ] **Step 3.1: Implement batchScanner**

```ts
// packages/extension/src/batchScanner.ts
import * as vscode from 'vscode';
import * as path from 'node:path';

const IMAGE_GLOB = '**/*.{png,jpg,jpeg,webp,avif,PNG,JPG,JPEG,WEBP,AVIF}';

export interface ImageEntry {
  fsPath: string;
  basename: string;
  ext: string;             // lowercase, no leading dot: 'png' / 'jpg' / 'webp' / 'avif'
  size: number;            // bytes
  folderRel: string;       // relative folder path from workspace root, e.g. 'images' or 'assets/icons'
}

export interface ScanResult {
  /** Distinct folder relative paths, sorted, that contain ≥1 image. */
  folders: string[];
  /** Every image grouped by folderRel for fast filtering. */
  images: ImageEntry[];
}

function buildExcludeGlob(): string {
  const cfg = vscode.workspace.getConfiguration('imageStudio');
  const folders = cfg.get<string[]>('excludeFolders', ['node_modules', '.git', 'dist', 'out', 'build']);
  if (!folders.length) return '';
  return `**/{${folders.join(',')}}/**`;
}

export async function scanWorkspaceImages(): Promise<ScanResult> {
  const roots = vscode.workspace.workspaceFolders;
  if (!roots?.length) return { folders: [], images: [] };

  const uris = await vscode.workspace.findFiles(IMAGE_GLOB, buildExcludeGlob());
  const fs = await import('node:fs/promises');

  const images: ImageEntry[] = [];
  const folderSet = new Set<string>();

  for (const uri of uris) {
    const root = roots.find((r) => uri.fsPath.startsWith(r.uri.fsPath));
    if (!root) continue;
    let folderRel = path.relative(root.uri.fsPath, path.dirname(uri.fsPath));
    if (folderRel === '') folderRel = '.';
    let size = 0;
    try { size = (await fs.stat(uri.fsPath)).size; } catch { /* file vanished */ continue; }
    images.push({
      fsPath: uri.fsPath,
      basename: path.basename(uri.fsPath),
      ext: path.extname(uri.fsPath).slice(1).toLowerCase(),
      size,
      folderRel,
    });
    folderSet.add(folderRel);
  }

  return {
    folders: [...folderSet].sort((a, b) => a.localeCompare(b)),
    images: images.sort((a, b) => a.fsPath.localeCompare(b.fsPath)),
  };
}
```

- [ ] **Step 3.2: Verify it compiles**

Run: `cd packages/extension && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add packages/extension/src/batchScanner.ts
git commit -m "Add batchScanner to enumerate workspace images and folders"
```

---

## Task 4: BatchEstimator — debounced sharp-based size estimator with cache

**Files:**
- Create: `packages/extension/src/batchEstimator.ts`
- Test: `packages/extension/test/batchEstimator.test.ts`

- [ ] **Step 4.1: Write the failing test**

```ts
// packages/extension/test/batchEstimator.test.ts
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
```

- [ ] **Step 4.2: Run test, verify it fails**

Run: `cd packages/extension && npx vitest run test/batchEstimator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement BatchEstimator**

```ts
// packages/extension/src/batchEstimator.ts
import sharp from 'sharp';
import * as os from 'node:os';

const DEBOUNCE_MS = 300;

export interface EstimatorSettings {
  format: 'same' | 'png' | 'jpeg' | 'webp' | 'avif';
  quality: number;
  lossless: boolean;
}

export type EstimateResult =
  | { ok: true; size: number }
  | { ok: false; message: string };

interface CachedEntry {
  key: string;
  result: EstimateResult;
}

function cacheKey(srcPath: string, s: EstimatorSettings): string {
  return `${srcPath}|${s.format}|${s.quality}|${s.lossless ? 1 : 0}`;
}

export class BatchEstimator {
  private readonly cache = new Map<string, CachedEntry>();
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inflight = new Set<string>();
  private readonly queue: Array<{ srcPath: string; settings: EstimatorSettings }> = [];
  private readonly concurrency = Math.max(1, os.cpus().length);
  private active = 0;
  private disposed = false;

  constructor(private readonly onResult: (srcPath: string, result: EstimateResult) => void) {}

  has(srcPath: string, s: EstimatorSettings): boolean {
    return this.cache.has(cacheKey(srcPath, s));
  }

  /** Forget any cached entries for this srcPath across all settings. */
  invalidate(srcPath: string): void {
    for (const k of [...this.cache.keys()]) {
      if (k.startsWith(srcPath + '|')) this.cache.delete(k);
    }
  }

  schedule(srcPath: string, settings: EstimatorSettings): void {
    if (this.disposed) return;
    const key = cacheKey(srcPath, settings);
    const cached = this.cache.get(key);
    if (cached) {
      this.onResult(srcPath, cached.result);
      return;
    }
    const existing = this.pending.get(srcPath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pending.delete(srcPath);
      this.queue.push({ srcPath, settings });
      this._drain();
    }, DEBOUNCE_MS);
    this.pending.set(srcPath, timer);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    this.queue.length = 0;
  }

  private _drain(): void {
    while (!this.disposed && this.active < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      void this._run(job.srcPath, job.settings);
    }
  }

  private async _run(srcPath: string, settings: EstimatorSettings): Promise<void> {
    if (this.inflight.has(srcPath)) { this.active--; this._drain(); return; }
    this.inflight.add(srcPath);
    try {
      const result = await this._encode(srcPath, settings);
      if (this.disposed) return;
      this.cache.set(cacheKey(srcPath, settings), { key: cacheKey(srcPath, settings), result });
      this.onResult(srcPath, result);
    } finally {
      this.inflight.delete(srcPath);
      this.active--;
      this._drain();
    }
  }

  private async _encode(srcPath: string, s: EstimatorSettings): Promise<EstimateResult> {
    try {
      let pipeline = sharp(srcPath);
      if (s.format !== 'same') {
        switch (s.format) {
          case 'png':  pipeline = pipeline.png(); break;
          case 'jpeg': pipeline = pipeline.jpeg({ quality: s.quality }); break;
          case 'webp': pipeline = s.lossless ? pipeline.webp({ lossless: true }) : pipeline.webp({ quality: s.quality }); break;
          case 'avif': pipeline = s.lossless ? pipeline.avif({ lossless: true }) : pipeline.avif({ quality: s.quality }); break;
        }
      } else {
        const meta = await sharp(srcPath).metadata();
        switch (meta.format) {
          case 'jpeg': pipeline = pipeline.jpeg({ quality: s.quality }); break;
          case 'webp': pipeline = pipeline.webp({ quality: s.quality }); break;
          case 'avif': pipeline = pipeline.avif({ quality: s.quality }); break;
          // png and others fall through unchanged
        }
      }
      const buffer = await pipeline.toBuffer();
      return { ok: true, size: buffer.length };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}
```

- [ ] **Step 4.4: Run test, verify all pass**

Run: `cd packages/extension && npx vitest run test/batchEstimator.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 4.5: Commit**

```bash
git add packages/extension/src/batchEstimator.ts packages/extension/test/batchEstimator.test.ts
git commit -m "Add BatchEstimator for lazy per-row size estimates"
```

---

## Task 5: Bridge types + package.json contributes + esbuild entry

**Files:**
- Create: `packages/extension/src/batchBridge.ts`
- Modify: `packages/extension/package.json`
- Modify: `packages/extension/esbuild.config.mjs`

- [ ] **Step 5.1: Define batchBridge types**

```ts
// packages/extension/src/batchBridge.ts
import type { ImageEntry } from './batchScanner.js';
import type { EstimatorSettings, EstimateResult } from './batchEstimator.js';

export type ConvertStatus = 'pending' | 'in-progress' | 'done' | 'failed';

/** Extension → Webview */
export type BatchExtMessage =
  | { type: 'init'; folders: string[]; images: ImageEntry[] }
  | { type: 'estimate'; srcPath: string; result: EstimateResult }
  | { type: 'convertProgress'; srcPath: string; status: ConvertStatus; error?: string; doneCount: number; totalCount: number }
  | { type: 'convertDone'; converted: number; failed: number; skipped: number }
  | { type: 'showError'; message: string };

/** Webview → Extension */
export type BatchWvMessage =
  | { type: 'selectionChanged'; selected: string[] }
  | { type: 'settingsChanged'; settings: EstimatorSettings }
  | { type: 'estimateRequest'; srcPaths: string[]; settings: EstimatorSettings }
  | { type: 'estimateInvalidate' }
  | { type: 'convertStart'; selected: string[]; settings: EstimatorSettings; trashOriginals: boolean; conflictPolicy: 'skip' | 'overwrite' }
  | { type: 'convertCancel' }
  | { type: 'preflightRequest'; selected: string[]; settings: EstimatorSettings };
```

- [ ] **Step 5.2: Update package.json — register batchView, command, view/title menu**

Modify `packages/extension/package.json` `contributes`:

Replace the `customEditors` block (currently one entry) with two entries — keep the existing `imageStudio.editor` and add `imageStudio.batchView`. The batch view uses a synthetic untitled URI that does not match a real filename, so its selector pattern is a path that exists only in our scheme:

```jsonc
"customEditors": [
  {
    "viewType": "imageStudio.editor",
    "displayName": "Image Studio",
    "selector": [
      { "filenamePattern": "*.png" },
      { "filenamePattern": "*.jpg" },
      { "filenamePattern": "*.jpeg" },
      { "filenamePattern": "*.webp" },
      { "filenamePattern": "*.avif" }
    ],
    "priority": "default"
  },
  {
    "viewType": "imageStudio.batchView",
    "displayName": "Image Studio — Batch Convert",
    "selector": [{ "filenamePattern": "image-studio-batch.batch" }],
    "priority": "default"
  }
],
```

Add to `commands`:

```jsonc
{
  "command": "imageStudio.openBatchView",
  "title": "Batch Convert…",
  "icon": "$(zap)",
  "category": "Image Studio"
}
```

Add `menus` block (at the same level as `commands`, `keybindings`, `configuration`):

```jsonc
"menus": {
  "view/title": [
    {
      "command": "imageStudio.openBatchView",
      "when": "view == imageStudio.files",
      "group": "navigation"
    }
  ]
},
```

- [ ] **Step 5.3: Update esbuild config to bundle batch.ts**

Modify `packages/extension/esbuild.config.mjs`. Replace the single `wvCtx` block with two webview contexts (existing webview + new batch):

```js
import esbuild from 'esbuild';
import { argv } from 'node:process';

const watch = argv.includes('--watch');

const extCtx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  sourcemap: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode', 'sharp', 'trash'],
  logLevel: 'info',
});

const wvCtx = await esbuild.context({
  entryPoints: ['media/webview.ts'],
  outfile: 'media/webview.js',
  bundle: true,
  sourcemap: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome100',
  logLevel: 'info',
});

const batchCtx = await esbuild.context({
  entryPoints: ['media/batch.ts'],
  outfile: 'media/batch.js',
  bundle: true,
  sourcemap: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome100',
  logLevel: 'info',
});

if (watch) {
  await Promise.all([extCtx.watch(), wvCtx.watch(), batchCtx.watch()]);
  console.log('Watching for changes…');
} else {
  await Promise.all([extCtx.rebuild(), wvCtx.rebuild(), batchCtx.rebuild()]);
  await Promise.all([extCtx.dispose(), wvCtx.dispose(), batchCtx.dispose()]);
  console.log('Build complete.');
}
```

- [ ] **Step 5.4: Stub the new entry files so esbuild succeeds**

Create stubs so build doesn't fail; we'll fill them in later tasks.

```ts
// packages/extension/media/batch.ts
// Stub — populated in Task 7+.
export {};
```

```css
/* packages/extension/media/batch.css */
/* Stub — populated in Task 7. */
```

- [ ] **Step 5.5: Run build, verify clean**

Run: `cd packages/extension && npm run build`
Expected: "Build complete." with no errors.

- [ ] **Step 5.6: Commit**

```bash
git add packages/extension/src/batchBridge.ts packages/extension/package.json packages/extension/esbuild.config.mjs packages/extension/media/batch.ts packages/extension/media/batch.css
git commit -m "Wire batch view contributes, esbuild entry, and bridge types"
```

---

## Task 6: BatchEditorProvider scaffold + register in extension.ts

**Files:**
- Create: `packages/extension/src/batchEditorProvider.ts`
- Create: `packages/extension/src/batchWebviewContent.ts`
- Modify: `packages/extension/src/extension.ts`

- [ ] **Step 6.1: Implement batchWebviewContent**

```ts
// packages/extension/src/batchWebviewContent.ts
import * as vscode from 'vscode';
import type { BatchExtMessage } from './batchBridge.js';

export function getBatchWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const batchJs = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'batch.js'));
  const sharedCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'));
  const batchCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'batch.css'));
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${sharedCss}">
  <link rel="stylesheet" href="${batchCss}">
  <title>Image Studio — Batch Convert</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${batchJs}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

export function postToBatchWebview(panel: vscode.WebviewPanel, msg: BatchExtMessage): void {
  panel.webview.postMessage(msg);
}
```

- [ ] **Step 6.2: Implement BatchEditorProvider scaffold**

```ts
// packages/extension/src/batchEditorProvider.ts
import * as vscode from 'vscode';
import { getBatchWebviewContent, postToBatchWebview } from './batchWebviewContent.js';
import { scanWorkspaceImages } from './batchScanner.js';
import type { BatchWvMessage } from './batchBridge.js';

export interface BatchDocument extends vscode.CustomDocument {}

export class BatchEditorProvider implements vscode.CustomReadonlyEditorProvider<BatchDocument> {
  public static readonly viewType = 'imageStudio.batchView';
  /** Synthetic untitled URI used when opening the batch view. */
  public static readonly virtualUri = vscode.Uri.parse('untitled:image-studio-batch.batch');

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(uri: vscode.Uri): Promise<BatchDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    _document: BatchDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    panel.webview.html = getBatchWebviewContent(panel.webview, this.context.extensionUri);
    panel.title = 'Batch Convert';

    panel.webview.onDidReceiveMessage(async (_msg: BatchWvMessage) => {
      // wired in later tasks
    });

    try {
      const scan = await scanWorkspaceImages();
      postToBatchWebview(panel, { type: 'init', folders: scan.folders, images: scan.images });
    } catch (err) {
      postToBatchWebview(panel, { type: 'showError', message: (err as Error).message });
    }
  }
}
```

- [ ] **Step 6.3: Register provider + command in extension.ts**

Modify `packages/extension/src/extension.ts`. Add imports and registrations:

```ts
import * as vscode from 'vscode';
import * as path from 'node:path';
import { ImageEditorProvider } from './imageEditorProvider.js';
import { ImageTreeProvider } from './imageTreeProvider.js';
import { BatchEditorProvider } from './batchEditorProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  const editorProvider = new ImageEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ImageEditorProvider.viewType,
      editorProvider,
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
  );

  // Batch convert view
  const batchProvider = new BatchEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      BatchEditorProvider.viewType,
      batchProvider,
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.openBatchView', async () => {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        BatchEditorProvider.virtualUri,
        BatchEditorProvider.viewType,
      );
    }),
  );

  // Activity Bar view: list of images in the workspace
  const treeProvider = new ImageTreeProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('imageStudio.files', {
      treeDataProvider: treeProvider,
      showCollapseAll: false,
    }),
  );

  // (… rest unchanged: file watcher, workspace folder change, config change, deleteImage)
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{png,jpg,jpeg,webp,avif,PNG,JPG,JPEG,WEBP,AVIF}',
  );
  watcher.onDidCreate(() => treeProvider.refresh());
  watcher.onDidDelete(() => treeProvider.refresh());
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => treeProvider.refresh()),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('imageStudio.excludeFolders')) treeProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.deleteImage', async () => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (!activeTab || !(activeTab.input instanceof vscode.TabInputCustom)) {
        return;
      }
      const uri = activeTab.input.uri;
      const choice = await vscode.window.showWarningMessage(
        `Move "${path.basename(uri.fsPath)}" to Trash?`,
        { modal: true, detail: 'The file will be sent to the system Trash — you can restore it from there.' },
        'Move to Trash',
      );
      if (choice !== 'Move to Trash') return;
      try {
        const { default: trash } = await import('trash');
        await trash(uri.fsPath);
        await vscode.window.tabGroups.close(activeTab);
      } catch (err) {
        vscode.window.showErrorMessage(`Image Studio: could not delete: ${(err as Error).message}`);
      }
    }),
  );
}

export function deactivate(): void {}
```

- [ ] **Step 6.4: Build + manual smoke**

Run: `cd packages/extension && npm run build`
Then in VSCode: open `packages/extension/`, press F5. In the Extension Development Host, open a folder with images. Click the ⚡ icon in the "Images" view header.

Expected: a new tab opens titled "Batch Convert" with an empty `<div id="root">`. (No UI yet — that comes next.)

- [ ] **Step 6.5: Commit**

```bash
git add packages/extension/src/batchEditorProvider.ts packages/extension/src/batchWebviewContent.ts packages/extension/src/extension.ts
git commit -m "Scaffold BatchEditorProvider and register openBatchView command"
```

---

## Task 7: Webview UI shell — folder dropdown, filter chips, list, Compress panel, footer

**Files:**
- Modify: `packages/extension/media/batch.ts`
- Modify: `packages/extension/media/batch.css`

This task lays the static HTML and styles. State wiring comes in Task 8.

- [ ] **Step 7.1: Write batch.ts UI shell**

```ts
// packages/extension/media/batch.ts
declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

document.getElementById('root')!.innerHTML = /* html */ `
<div id="batch-main">
  <div id="batch-list-area">
    <div id="batch-toolbar">
      <div class="bt-row">
        <label class="bt-label">Folder</label>
        <select id="folder-select"></select>
      </div>
      <div class="bt-row">
        <label class="bt-label">Format</label>
        <div id="format-chips" class="chips">
          <button class="chip active" data-fmt="all">All</button>
          <button class="chip" data-fmt="png">PNG</button>
          <button class="chip" data-fmt="jpg">JPG</button>
          <button class="chip" data-fmt="webp">WebP</button>
          <button class="chip" data-fmt="avif">AVIF</button>
        </div>
      </div>
    </div>
    <div id="batch-list-header">
      <div class="bl-cb"></div>
      <div class="bl-stat"></div>
      <div class="bl-name sortable" data-sort="name">Name</div>
      <div class="bl-fmt sortable" data-sort="format">Format</div>
      <div class="bl-size sortable" data-sort="size">Size</div>
      <div class="bl-est sortable" data-sort="est">→ Est.</div>
    </div>
    <div id="batch-list" role="list"></div>
    <div id="batch-empty" class="empty hidden">No images in this workspace.</div>
  </div>

  <div id="batch-panel">
    <div id="panel-sections">
      <div class="panel-section" id="section-compress">
        <div class="section-head"><span class="section-icon">◆</span> Compress<span class="section-caret">▾</span></div>
        <div class="section-body">
          <div class="row">
            <label>Format</label>
            <select class="inp flex1" id="format-select">
              <option value="same">Same as source</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp" selected>WebP</option>
              <option value="avif">AVIF</option>
            </select>
          </div>
          <div id="quality-presets" class="quality-presets">
            <button class="preset-btn" data-q="92">High</button>
            <button class="preset-btn" data-q="85">Med</button>
            <button class="preset-btn" data-q="75">Low</button>
          </div>
          <div class="row" id="quality-row">
            <label>Quality</label>
            <input type="range" id="quality-slider" min="1" max="100" value="85">
            <span class="qnum" id="quality-num">85</span>
          </div>
          <label class="check-row" id="lossless-row">
            <input type="checkbox" id="lossless-check"> Lossless
          </label>
        </div>
      </div>
    </div>

    <div id="batch-footer">
      <div id="batch-footer-info">
        <span id="batch-counter">0 selected</span>
        <button class="btn small" id="btn-review">Review</button>
        <label class="check-row inline"><input type="checkbox" id="trash-check"> Trash originals</label>
      </div>
      <div id="batch-footer-progress" class="hidden">
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <span id="progress-text">0/0</span>
        <button class="btn small" id="btn-cancel">Cancel</button>
      </div>
      <div id="batch-footer-actions">
        <button class="btn primary" id="btn-convert" disabled>Convert 0</button>
      </div>
    </div>
  </div>
</div>
`;

window.addEventListener('message', (event) => {
  const msg = event.data as { type: string; [k: string]: unknown };
  // wired in Task 8
  void msg;
});
```

- [ ] **Step 7.2: Write batch.css**

```css
/* packages/extension/media/batch.css */
html, body { height: 100%; margin: 0; padding: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: 13px; }
#root, #batch-main { height: 100%; }

#batch-main { display: grid; grid-template-columns: 1fr 320px; height: 100%; }
#batch-list-area { display: flex; flex-direction: column; min-width: 0; border-right: 1px solid var(--vscode-panel-border, rgba(255,255,255,.08)); }
#batch-panel { display: flex; flex-direction: column; min-width: 0; }

#batch-toolbar { padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,.08)); display: flex; flex-direction: column; gap: 8px; }
.bt-row { display: flex; align-items: center; gap: 8px; }
.bt-label { width: 60px; font-size: 12px; color: var(--vscode-descriptionForeground); }
#folder-select { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 4px 6px; border-radius: 3px; font: inherit; }

.chips { display: flex; gap: 4px; flex-wrap: wrap; }
.chip { background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border, rgba(255,255,255,.12)); border-radius: 999px; padding: 2px 10px; cursor: pointer; font: inherit; font-size: 12px; }
.chip:hover { background: rgba(255,255,255,.04); }
.chip.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }

#batch-list-header, .batch-row { display: grid; grid-template-columns: 28px 24px 1fr 80px 90px 110px; gap: 8px; align-items: center; padding: 4px 12px; }
#batch-list-header { font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,.08)); user-select: none; }
.sortable { cursor: pointer; }
.sortable:hover { color: var(--vscode-foreground); }
.sort-asc::after  { content: ' ▴'; }
.sort-desc::after { content: ' ▾'; }

#batch-list { flex: 1; overflow-y: auto; }
.batch-row { font-size: 13px; cursor: default; }
.batch-row:hover { background: rgba(255,255,255,.03); }
.batch-row input[type=checkbox] { margin: 0; }
.batch-row .bl-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.batch-row .bl-fmt  { color: var(--vscode-descriptionForeground); }
.batch-row .bl-size { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
.batch-row .bl-est  { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
.batch-row.failed .bl-est, .batch-row.failed .bl-name { color: var(--vscode-errorForeground); }
.batch-row .bl-stat { font-size: 13px; text-align: center; }

.empty { padding: 24px 12px; color: var(--vscode-descriptionForeground); text-align: center; }
.hidden { display: none !important; }

#batch-footer { border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,.08)); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
#batch-footer-info, #batch-footer-progress, #batch-footer-actions { display: flex; align-items: center; gap: 12px; }
#batch-counter { color: var(--vscode-descriptionForeground); font-size: 12px; flex: 1; }
.progress-bar { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; }
.progress-fill { height: 100%; width: 0%; background: var(--vscode-progressBar-background, #0e639c); transition: width 120ms linear; }
#progress-text { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--vscode-descriptionForeground); min-width: 64px; text-align: right; }

.check-row.inline { display: inline-flex; align-items: center; gap: 6px; color: var(--vscode-descriptionForeground); font-size: 12px; }

.btn { background: var(--vscode-button-secondaryBackground, rgba(255,255,255,.08)); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); border: 0; padding: 4px 10px; border-radius: 3px; cursor: pointer; font: inherit; }
.btn:hover { background: rgba(255,255,255,.14); }
.btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.btn.primary:disabled { opacity: .5; cursor: not-allowed; }
.btn.small { padding: 2px 8px; font-size: 12px; }

#batch-panel #panel-sections { flex: 1; overflow-y: auto; }
```

- [ ] **Step 7.3: Build + smoke**

Run: `cd packages/extension && npm run build`
F5 → ⚡ button → tab opens with the empty shell (folder dropdown empty, no rows yet, footer "0 selected", Convert disabled).

- [ ] **Step 7.4: Commit**

```bash
git add packages/extension/media/batch.ts packages/extension/media/batch.css
git commit -m "Add Batch Convert webview shell (toolbar, list, panel, footer)"
```

---

## Task 8: Init flow, list rendering, selection state ↔ extension

**Files:**
- Modify: `packages/extension/media/batch.ts`
- Modify: `packages/extension/src/batchEditorProvider.ts`

- [ ] **Step 8.1: Extend batch.ts with state, render, selection**

Replace the current `window.addEventListener('message', …)` stub in `media/batch.ts` and append all helpers below the existing innerHTML block:

```ts
// State
type ImageRow = {
  fsPath: string;
  basename: string;
  ext: string;
  size: number;
  folderRel: string;
};

let allImages: ImageRow[] = [];
let folders: string[] = [];
let currentFolder = '__all__';
let activeChip: 'all' | 'png' | 'jpg' | 'webp' | 'avif' = 'all';
let sortBy: 'name' | 'format' | 'size' | 'est' = 'name';
let sortDir: 'asc' | 'desc' = 'asc';
let estimates = new Map<string, { ok: boolean; size?: number; message?: string }>();
let selected = new Set<string>();
let reviewMode = false;
let converting = false;
let rowStatus = new Map<string, { status: 'pending' | 'in-progress' | 'done' | 'failed'; error?: string }>();

// Settings (right panel)
const formatSelect = () => document.getElementById('format-select') as HTMLSelectElement;
const qualitySlider = () => document.getElementById('quality-slider') as HTMLInputElement;
const qualityNum = () => document.getElementById('quality-num') as HTMLSpanElement;
const losslessCheck = () => document.getElementById('lossless-check') as HTMLInputElement;
const losslessRow = () => document.getElementById('lossless-row') as HTMLLabelElement;
const trashCheck = () => document.getElementById('trash-check') as HTMLInputElement;

function currentSettings() {
  return {
    format: formatSelect().value as 'same' | 'png' | 'jpeg' | 'webp' | 'avif',
    quality: parseInt(qualitySlider().value, 10),
    lossless: losslessCheck().checked,
  };
}

function visibleImages(): ImageRow[] {
  let rows = allImages;
  if (reviewMode) rows = rows.filter((r) => selected.has(r.fsPath));
  else if (currentFolder !== '__all__') rows = rows.filter((r) => r.folderRel === currentFolder);
  if (activeChip !== 'all') rows = rows.filter((r) => normExt(r.ext) === activeChip);
  rows = rows.slice().sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'name':   cmp = a.basename.localeCompare(b.basename); break;
      case 'format': cmp = a.ext.localeCompare(b.ext); break;
      case 'size':   cmp = a.size - b.size; break;
      case 'est': {
        const ea = estimates.get(a.fsPath);
        const eb = estimates.get(b.fsPath);
        const sa = ea?.ok ? ea.size! : Number.POSITIVE_INFINITY;
        const sb = eb?.ok ? eb.size! : Number.POSITIVE_INFINITY;
        cmp = sa - sb; break;
      }
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return rows;
}

function normExt(ext: string): 'png' | 'jpg' | 'webp' | 'avif' | 'all' {
  const e = ext.toLowerCase();
  if (e === 'jpeg') return 'jpg';
  if (e === 'png' || e === 'jpg' || e === 'webp' || e === 'avif') return e;
  return 'all';
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1_048_576).toFixed(2)} MB`;
}

function statusIcon(s: 'pending' | 'in-progress' | 'done' | 'failed' | undefined): string {
  switch (s) {
    case 'pending':     return '⏳';
    case 'in-progress': return '🔄';
    case 'done':        return '✓';
    case 'failed':      return '✗';
    default:            return '';
  }
}

function renderList(): void {
  const list = document.getElementById('batch-list') as HTMLDivElement;
  const empty = document.getElementById('batch-empty') as HTMLDivElement;
  const rows = visibleImages();
  if (rows.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const showFolderPrefix = currentFolder === '__all__' || reviewMode;
  list.innerHTML = rows.map((r) => {
    const checked = selected.has(r.fsPath) ? 'checked' : '';
    const est = estimates.get(r.fsPath);
    let estText = '—';
    if (est) estText = est.ok ? fmtBytes(est.size!) : 'error';
    else if (selected.has(r.fsPath)) estText = '(working…)';
    const stat = rowStatus.get(r.fsPath);
    const failed = stat?.status === 'failed';
    const name = showFolderPrefix && r.folderRel !== '.' ? `${r.folderRel}/${r.basename}` : r.basename;
    const title = stat?.error ? ` title="${escapeAttr(stat.error)}"` : '';
    return `<div class="batch-row${failed ? ' failed' : ''}" data-fs="${escapeAttr(r.fsPath)}"${title}>
      <div class="bl-cb"><input type="checkbox" ${checked}></div>
      <div class="bl-stat">${statusIcon(stat?.status)}</div>
      <div class="bl-name">${escapeHtml(name)}</div>
      <div class="bl-fmt">${r.ext.toUpperCase()}</div>
      <div class="bl-size">${fmtBytes(r.size)}</div>
      <div class="bl-est">${estText}</div>
    </div>`;
  }).join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }

function distinctFolderCount(): number {
  const set = new Set<string>();
  for (const fs of selected) {
    const row = allImages.find((r) => r.fsPath === fs);
    if (row) set.add(row.folderRel);
  }
  return set.size;
}

function renderCounter(): void {
  const c = document.getElementById('batch-counter')!;
  const n = selected.size;
  const f = distinctFolderCount();
  c.textContent = n === 0 ? '0 selected' :
                  f <= 1   ? `${n} selected` :
                             `${n} selected (across ${f} folders)`;
  const btn = document.getElementById('btn-convert') as HTMLButtonElement;
  btn.textContent = `Convert ${n}`;
  btn.disabled = n === 0 || converting;
}

function renderSortHeader(): void {
  document.querySelectorAll('#batch-list-header .sortable').forEach((el) => {
    el.classList.remove('sort-asc', 'sort-desc');
    if ((el as HTMLElement).dataset.sort === sortBy) {
      el.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

function syncLossless(): void {
  const f = formatSelect().value;
  losslessRow().style.display = (f === 'webp' || f === 'avif') ? '' : 'none';
}

// Events
document.getElementById('folder-select')!.addEventListener('change', (e) => {
  currentFolder = (e.target as HTMLSelectElement).value;
  reviewMode = false;
  renderList();
});

document.getElementById('format-chips')!.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
  if (!t) return;
  document.querySelectorAll('#format-chips .chip').forEach((c) => c.classList.remove('active'));
  t.classList.add('active');
  activeChip = t.dataset.fmt as typeof activeChip;
  renderList();
});

document.getElementById('batch-list-header')!.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('.sortable') as HTMLElement | null;
  if (!t) return;
  const key = t.dataset.sort as typeof sortBy;
  if (key === sortBy) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortBy = key; sortDir = 'asc'; }
  renderSortHeader();
  renderList();
});

document.getElementById('batch-list')!.addEventListener('change', (e) => {
  const cb = e.target as HTMLInputElement;
  if (cb.tagName !== 'INPUT' || cb.type !== 'checkbox') return;
  const row = cb.closest('.batch-row') as HTMLElement;
  const fs = row.dataset.fs!;
  if (cb.checked) selected.add(fs);
  else { selected.delete(fs); estimates.delete(fs); }
  vscode.postMessage({ type: 'selectionChanged', selected: [...selected] });
  if (cb.checked) {
    vscode.postMessage({ type: 'estimateRequest', srcPaths: [fs], settings: currentSettings() });
  }
  renderCounter();
  renderList();
});

document.getElementById('btn-review')!.addEventListener('click', () => {
  reviewMode = !reviewMode;
  (document.getElementById('btn-review') as HTMLButtonElement).classList.toggle('primary', reviewMode);
  renderList();
});

formatSelect().addEventListener('change', () => {
  syncLossless();
  estimates.clear();
  vscode.postMessage({ type: 'estimateInvalidate' });
  if (selected.size > 0) {
    vscode.postMessage({ type: 'estimateRequest', srcPaths: [...selected], settings: currentSettings() });
  }
  renderList();
});

qualitySlider().addEventListener('input', () => {
  qualityNum().textContent = qualitySlider().value;
});
qualitySlider().addEventListener('change', () => {
  estimates.clear();
  vscode.postMessage({ type: 'estimateInvalidate' });
  if (selected.size > 0) {
    vscode.postMessage({ type: 'estimateRequest', srcPaths: [...selected], settings: currentSettings() });
  }
  renderList();
});
losslessCheck().addEventListener('change', () => {
  estimates.clear();
  vscode.postMessage({ type: 'estimateInvalidate' });
  if (selected.size > 0) {
    vscode.postMessage({ type: 'estimateRequest', srcPaths: [...selected], settings: currentSettings() });
  }
  renderList();
});

document.querySelectorAll('.preset-btn').forEach((b) => {
  b.addEventListener('click', () => {
    const q = parseInt((b as HTMLElement).dataset.q!, 10);
    qualitySlider().value = String(q);
    qualityNum().textContent = String(q);
    estimates.clear();
    vscode.postMessage({ type: 'estimateInvalidate' });
    if (selected.size > 0) {
      vscode.postMessage({ type: 'estimateRequest', srcPaths: [...selected], settings: currentSettings() });
    }
    renderList();
  });
});

window.addEventListener('message', (event) => {
  const msg = event.data as { type: string; [k: string]: unknown };
  switch (msg.type) {
    case 'init': {
      folders = msg.folders as string[];
      allImages = msg.images as ImageRow[];
      const sel = document.getElementById('folder-select') as HTMLSelectElement;
      sel.innerHTML = `<option value="__all__">All folders</option>` +
        folders.map((f) => `<option value="${escapeAttr(f)}">${escapeHtml(f === '.' ? '(workspace root)' : f)}</option>`).join('');
      renderSortHeader();
      syncLossless();
      renderList();
      renderCounter();
      break;
    }
    case 'estimate': {
      estimates.set(msg.srcPath as string, msg.result as { ok: boolean; size?: number; message?: string });
      renderList();
      break;
    }
    // convertProgress / convertDone wired in Task 9
  }
});
```

- [ ] **Step 8.2: Wire estimate request handling in BatchEditorProvider**

Modify `packages/extension/src/batchEditorProvider.ts`. Replace the `onDidReceiveMessage` stub:

```ts
import { BatchEstimator } from './batchEstimator.js';
// … existing imports …

export class BatchEditorProvider implements vscode.CustomReadonlyEditorProvider<BatchDocument> {
  // … existing fields …
  private readonly estimators = new Map<vscode.WebviewPanel, BatchEstimator>();

  async resolveCustomEditor(
    _document: BatchDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    panel.webview.html = getBatchWebviewContent(panel.webview, this.context.extensionUri);
    panel.title = 'Batch Convert';

    const estimator = new BatchEstimator((srcPath, result) => {
      postToBatchWebview(panel, { type: 'estimate', srcPath, result });
    });
    this.estimators.set(panel, estimator);

    panel.onDidDispose(() => {
      this.estimators.get(panel)?.dispose();
      this.estimators.delete(panel);
    });

    panel.webview.onDidReceiveMessage(async (msg: BatchWvMessage) => {
      switch (msg.type) {
        case 'estimateRequest': {
          for (const srcPath of msg.srcPaths) estimator.schedule(srcPath, msg.settings);
          break;
        }
        case 'estimateInvalidate': {
          for (const srcPath of [...this.estimators.keys()]) void srcPath; // no-op for now
          // We don't track per-srcPath here; estimator's internal cache key includes settings,
          // so a settings change naturally produces a cache miss. No explicit invalidation needed.
          break;
        }
      }
    });

    try {
      const scan = await scanWorkspaceImages();
      postToBatchWebview(panel, { type: 'init', folders: scan.folders, images: scan.images });
    } catch (err) {
      postToBatchWebview(panel, { type: 'showError', message: (err as Error).message });
    }
  }
}
```

- [ ] **Step 8.3: Build + smoke**

Run: `cd packages/extension && npm run build`
F5 → ⚡ → click into folder dropdown (shows folders), click chips (filters list), click checkboxes (counter updates, "(working…)" appears in Est. column, then changes to actual size after ~300ms-1s), change format/quality (estimates re-compute).

- [ ] **Step 8.4: Commit**

```bash
git add packages/extension/media/batch.ts packages/extension/src/batchEditorProvider.ts
git commit -m "Wire batch view init, list rendering, selection, and estimates"
```

---

## Task 9: Conflict pre-flight + convert execution + per-row status + cancel

**Files:**
- Modify: `packages/extension/media/batch.ts`
- Modify: `packages/extension/src/batchEditorProvider.ts`

- [ ] **Step 9.1: Wire convert button in batch.ts**

Append to the bottom of `packages/extension/media/batch.ts` (before the final `window.addEventListener` if it has not been touched, or add to the existing message switch):

```ts
document.getElementById('btn-convert')!.addEventListener('click', () => {
  vscode.postMessage({
    type: 'preflightRequest',
    selected: [...selected],
    settings: currentSettings(),
  });
});

document.getElementById('btn-cancel')!.addEventListener('click', () => {
  vscode.postMessage({ type: 'convertCancel' });
});
```

In the existing `window.addEventListener('message', …)` switch, add cases for `convertProgress` and `convertDone`:

```ts
case 'convertProgress': {
  const m = msg as { srcPath: string; status: 'pending' | 'in-progress' | 'done' | 'failed'; error?: string; doneCount: number; totalCount: number };
  rowStatus.set(m.srcPath, { status: m.status, error: m.error });
  const fill = document.getElementById('progress-fill') as HTMLDivElement;
  const text = document.getElementById('progress-text') as HTMLSpanElement;
  fill.style.width = `${(m.doneCount / m.totalCount) * 100}%`;
  text.textContent = `${m.doneCount}/${m.totalCount}`;
  renderList();
  break;
}
case 'convertDone': {
  converting = false;
  document.getElementById('batch-footer-progress')!.classList.add('hidden');
  document.getElementById('batch-footer-actions')!.classList.remove('hidden');
  renderCounter();
  break;
}
```

Also add a small helper to enter "converting" mode (called by extension via a new message — added below):

```ts
case 'convertStarted': {
  converting = true;
  document.getElementById('batch-footer-progress')!.classList.remove('hidden');
  document.getElementById('batch-footer-actions')!.classList.add('hidden');
  rowStatus.clear();
  for (const fs of selected) rowStatus.set(fs, { status: 'pending' });
  renderList();
  break;
}
```

Add `'convertStarted'` to the `BatchExtMessage` union in `packages/extension/src/batchBridge.ts`:

```ts
| { type: 'convertStarted'; total: number }
```

- [ ] **Step 9.2: Implement preflight + convert in BatchEditorProvider**

Modify `packages/extension/src/batchEditorProvider.ts`. Add imports:

```ts
import * as path from 'node:path';
import { applyEdits, defaultEditState } from '@image-studio/core';
import { detectConflicts, computeTargetPath, type TargetFormat } from './conflictDetection.js';
import type { BatchExtMessage } from './batchBridge.js';
```

Add fields and methods to the class:

```ts
private readonly cancelTokens = new Map<vscode.WebviewPanel, { cancelled: boolean }>();

private async _runConvert(
  panel: vscode.WebviewPanel,
  selected: string[],
  settings: { format: TargetFormat; quality: number; lossless: boolean },
  trashOriginals: boolean,
  conflictPolicy: 'skip' | 'overwrite',
): Promise<void> {
  const conflicts = new Set(
    detectConflicts(selected, settings.format).map((c) => c.src),
  );
  const work = conflictPolicy === 'skip'
    ? selected.filter((s) => !conflicts.has(s))
    : selected;

  postToBatchWebview(panel, { type: 'convertStarted', total: work.length });
  const token = { cancelled: false };
  this.cancelTokens.set(panel, token);

  let converted = 0;
  let failed = 0;
  const skipped = selected.length - work.length;
  let done = 0;
  const trashFn = await import('trash').then((m) => m.default);

  for (const src of work) {
    if (token.cancelled) break;
    postToBatchWebview(panel, {
      type: 'convertProgress', srcPath: src, status: 'in-progress',
      doneCount: done, totalCount: work.length,
    });
    const dst = computeTargetPath(src, settings.format);
    try {
      const state = {
        ...defaultEditState(),
        format: settings.format,
        quality: settings.quality,
        lossless: settings.lossless,
      };
      await applyEdits(src, dst, state, { overwrite: true });
      if (trashOriginals && dst !== src) await trashFn(src);
      converted++;
      done++;
      postToBatchWebview(panel, {
        type: 'convertProgress', srcPath: src, status: 'done',
        doneCount: done, totalCount: work.length,
      });
    } catch (err) {
      failed++;
      done++;
      postToBatchWebview(panel, {
        type: 'convertProgress', srcPath: src, status: 'failed',
        error: (err as Error).message,
        doneCount: done, totalCount: work.length,
      });
    }
  }

  this.cancelTokens.delete(panel);
  postToBatchWebview(panel, { type: 'convertDone', converted, failed, skipped });
  vscode.window.showInformationMessage(
    `Batch convert: ${converted} converted${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''}`,
  );
}
```

Extend the `onDidReceiveMessage` switch with `preflightRequest` and `convertCancel`:

```ts
case 'preflightRequest': {
  const conflicts = detectConflicts(msg.selected, msg.settings.format);
  if (conflicts.length === 0) {
    void this._runConvert(panel, msg.selected, msg.settings, this._trashFromState(panel), 'overwrite');
    return;
  }
  const list = conflicts.slice(0, 5).map((c) => `• ${path.basename(c.dst)}`).join('\n');
  const more = conflicts.length > 5 ? `\n…and ${conflicts.length - 5} more` : '';
  const choice = await vscode.window.showWarningMessage(
    `${conflicts.length} of ${msg.selected.length} selected images would replace an existing file:`,
    { modal: true, detail: `${list}${more}` },
    'Skip these',
    'Overwrite all',
  );
  if (!choice) return;
  const policy: 'skip' | 'overwrite' = choice === 'Skip these' ? 'skip' : 'overwrite';
  void this._runConvert(panel, msg.selected, msg.settings, this._trashFromState(panel), policy);
  break;
}
case 'convertCancel': {
  const token = this.cancelTokens.get(panel);
  if (token) token.cancelled = true;
  break;
}
```

The webview owns the trash-toggle state, so we need it in the message. Update `convertStart`/`preflightRequest` in `batchBridge.ts`:

```ts
| { type: 'preflightRequest'; selected: string[]; settings: EstimatorSettings; trashOriginals: boolean }
```

Then in `media/batch.ts` `btn-convert` click handler, include `trashOriginals: trashCheck().checked`. And in the provider, replace the `_trashFromState(panel)` calls with `msg.trashOriginals`. Drop the unused helper.

- [ ] **Step 9.3: Build + smoke**

Run: `cd packages/extension && npm run build`
F5 → select 3 PNGs in a folder where one already has a `.webp` sibling → set format=webp → click Convert. Expected: modal with conflict list, Skip-these path runs only the non-conflicting two. Per-row icons cycle ⏳→🔄→✓. Footer shows `2/2`. Toast on done.

Test cancel: select many large images, click Convert, then Cancel mid-run. Expected: current file finishes, remaining stay as ⏳, no half-files on disk.

- [ ] **Step 9.4: Commit**

```bash
git add packages/extension/media/batch.ts packages/extension/src/batchEditorProvider.ts packages/extension/src/batchBridge.ts
git commit -m "Add conflict pre-flight, sequential convert, cancel, and toast"
```

---

## Task 10: Empty workspace + showError handling

**Files:**
- Modify: `packages/extension/media/batch.ts`

- [ ] **Step 10.1: Handle showError + empty list edge case**

Append a case to the `window.addEventListener('message', …)` switch:

```ts
case 'showError': {
  const list = document.getElementById('batch-list') as HTMLDivElement;
  list.innerHTML = `<div class="empty">${escapeHtml(msg.message as string)}</div>`;
  break;
}
```

The existing `renderList` already handles empty `allImages` by showing `#batch-empty`. Verify the message text matches the spec: change `#batch-empty` content to `"No images in this workspace."` (already is — confirm). No other changes needed.

- [ ] **Step 10.2: Build + smoke**

F5 with a workspace containing no images: ⚡ → tab opens → "No images in this workspace." visible.

- [ ] **Step 10.3: Commit**

```bash
git add packages/extension/media/batch.ts
git commit -m "Handle empty workspace and showError in batch view"
```

---

## Task 11: Scanner refresh on file/folder/config changes

**Files:**
- Modify: `packages/extension/src/batchEditorProvider.ts`

- [ ] **Step 11.1: Add file watcher per panel**

In `BatchEditorProvider.resolveCustomEditor`, after registering the estimator and before the initial `scanWorkspaceImages` call, add a watcher that re-scans and re-posts `init` whenever images change or the config changes. Disposed on panel close.

```ts
const refreshWatcher = vscode.workspace.createFileSystemWatcher(
  '**/*.{png,jpg,jpeg,webp,avif,PNG,JPG,JPEG,WEBP,AVIF}',
);
const reScan = async () => {
  try {
    const scan = await scanWorkspaceImages();
    postToBatchWebview(panel, { type: 'init', folders: scan.folders, images: scan.images });
  } catch { /* ignore */ }
};
refreshWatcher.onDidCreate(reScan);
refreshWatcher.onDidDelete(reScan);
const folderSub = vscode.workspace.onDidChangeWorkspaceFolders(reScan);
const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('imageStudio.excludeFolders')) void reScan();
});

panel.onDidDispose(() => {
  this.estimators.get(panel)?.dispose();
  this.estimators.delete(panel);
  refreshWatcher.dispose();
  folderSub.dispose();
  configSub.dispose();
});
```

(The previous `panel.onDidDispose` block is replaced — it now disposes all four resources.)

The webview re-renders on every `init`. Selection state is currently reset because the webview re-creates `allImages` and chooses default folder. To keep selection across refresh, the webview should preserve `selected` and only re-render — verify by reviewing the `init` case in `media/batch.ts`. The current code does NOT reset `selected`, but it does reset `currentFolder` to `'__all__'`. Patch the `init` handler to leave `currentFolder` and `activeChip` alone after the first init:

```ts
case 'init': {
  folders = msg.folders as string[];
  allImages = msg.images as ImageRow[];
  // Drop selection of files that no longer exist
  for (const fs of [...selected]) if (!allImages.find((r) => r.fsPath === fs)) selected.delete(fs);
  const sel = document.getElementById('folder-select') as HTMLSelectElement;
  const prev = sel.value || '__all__';
  sel.innerHTML = `<option value="__all__">All folders</option>` +
    folders.map((f) => `<option value="${escapeAttr(f)}">${escapeHtml(f === '.' ? '(workspace root)' : f)}</option>`).join('');
  // Restore previous folder if still valid
  const stillValid = prev === '__all__' || folders.includes(prev);
  sel.value = stillValid ? prev : '__all__';
  currentFolder = sel.value;
  renderSortHeader();
  syncLossless();
  renderList();
  renderCounter();
  break;
}
```

- [ ] **Step 11.2: Build + smoke**

F5 → ⚡ → add a new image to the workspace folder via the OS file manager → see it appear in the list. Delete one → it disappears. Update `imageStudio.excludeFolders` to include a folder that has images → those images vanish. Selection across these events stays where possible (only entries for vanished files drop).

- [ ] **Step 11.3: Commit**

```bash
git add packages/extension/src/batchEditorProvider.ts packages/extension/media/batch.ts
git commit -m "Refresh batch view on file/folder/config changes"
```

---

## Task 12: Sidebar header icon — verify discoverability

**Files:**
- Modify: `packages/extension/test/MANUAL.md`

This task has no code change; it formalizes the manual checks that verify the icon is reachable.

- [ ] **Step 12.1: Append batch view section to MANUAL.md**

Append at the end of `packages/extension/test/MANUAL.md`:

```markdown
## Batch Convert

- [ ] Open Image Studio sidebar (Activity Bar → ⚡ icon or `Cmd+Shift+\`).
- [ ] Verify the ⚡ "Batch Convert…" icon appears in the "Images" view title bar (next to the refresh icon).
- [ ] Click ⚡ → a tab titled "Batch Convert" opens.
- [ ] Folder dropdown lists every workspace folder containing images, plus "All folders" at the top.
- [ ] Format chips (All / PNG / JPG / WebP / AVIF) toggle visible rows; only the active chip is highlighted.
- [ ] Click a column header (Name / Format / Size / →Est.) to sort asc; click again for desc.
- [ ] Check a few rows; counter updates ("3 selected", "5 selected (across 2 folders)").
- [ ] After ~1s, "(working…)" in the →Est. column resolves to a byte count for selected rows.
- [ ] Change Format / Quality / Lossless: estimates recompute for all selected rows.
- [ ] Click "Review" → list narrows to only selected items (regardless of folder dropdown). Click again → restored.
- [ ] Trigger a conflict: in a folder with `hero.png` and an existing `hero.webp`, select `hero.png` + a few non-conflicting PNGs, set format=WebP, click Convert. Verify the modal lists `hero.webp` and offers "Skip these" / "Overwrite all" / Cancel.
- [ ] Choose "Skip these" → only non-conflicting files convert. Status icons cycle ⏳→🔄→✓; failed rows show ✗ with hover tooltip showing the error.
- [ ] During a long convert, click Cancel: the in-progress file finishes, remaining rows stay ⏳, footer hides progress.
- [ ] With "Trash originals" checked: cross-extension conversions move sources to OS trash on success. Same-extension (overwrite-in-place) leaves no trash entry.
- [ ] Open a workspace with no images → batch view shows "No images in this workspace."
- [ ] Add an image to a watched folder while batch view is open → the row appears.
- [ ] Delete an image from disk while it's selected in batch view → the row disappears, selection counter updates.
- [ ] Run a batch on a single WebP source with format=Same as source and quality lowered → file size decreases (overwrite-in-place).
```

- [ ] **Step 12.2: Run all tests**

Run: `npm test`
Expected: 69 + 4 (BatchEstimator) + 5 (conflictDetection) + 7 (SelectionStore) = **85 passing**.

- [ ] **Step 12.3: Commit**

```bash
git add packages/extension/test/MANUAL.md
git commit -m "Add batch view manual test checklist"
```

---

## Task 13: Cross-platform .vsix rebuild + smoke install

**Files:** none (build artifact only).

- [ ] **Step 13.1: Build both .vsix targets**

Run:
```bash
cd packages/extension
bash scripts/package.sh darwin-arm64
bash scripts/package.sh win32-x64
```

Expected: `image-studio-darwin-arm64.vsix` (~7.4 MB) and `image-studio-win32-x64.vsix` (~8.4 MB).

- [ ] **Step 13.2: Install host-platform .vsix and smoke-test the icon + tab**

```bash
code --install-extension packages/extension/image-studio-darwin-arm64.vsix
```

Open a folder with images, hit ⚡, verify the panel opens and a small batch convert succeeds. (Full manual checklist runs only on dedicated QA passes; this is a release-readiness smoke.)

- [ ] **Step 13.3: No commit** — `.vsix` files are git-ignored.

---

## Self-review

**Spec coverage:**

| Spec section | Implementing task(s) |
|---|---|
| §2 Scope: header icon entry point | T5, T6, T12 |
| §2 Folder dropdown enumeration | T3, T8 |
| §2 Selection persists across folders | T1, T8 |
| §2 Filter chips | T7 (HTML), T8 (logic) |
| §2 Sortable text columns | T7, T8 |
| §2 Compress right panel reuse | T7 |
| §2 Conflict pre-flight | T2, T9 |
| §2 Per-row status icons + footer progress + Cancel | T7, T9 |
| §2 Trash originals | T9 |
| §2 After-convert state | T9 |
| §2 Out-of-scope items | not implemented (correct) |
| §3 Architecture (BatchEditorProvider + 4 helpers) | T1–T6 |
| §4 Entry point + commands + menus | T5, T6 |
| §5 Layout | T7 |
| §6 Selection persistence model | T1, T8 |
| §7 Estimate column | T4, T8 |
| §8 Conflict pre-flight | T2, T9 |
| §9 Convert execution | T9 |
| §10 Edge cases (deleted, empty, format=same, mid-cancel, FS case) | T9, T10, T11 |
| §11 Testing (unit + manual) | T1, T2, T4 (unit), T12 (manual) |

No spec section is unimplemented.

**Placeholder scan:** No `TBD`, `TODO`, `etc`, "implement later", "fill in details", or unguided "handle edge cases" appear in any task. Every code step contains the actual code.

**Type consistency:** `EstimatorSettings` is defined in `batchEstimator.ts` (T4) and re-imported in `batchBridge.ts` (T5) and used in `BatchWvMessage`/`BatchExtMessage`. `TargetFormat` is defined in `conflictDetection.ts` (T2) and imported in `batchEditorProvider.ts` (T9). `ImageEntry` from `batchScanner.ts` (T3) flows to `BatchExtMessage.init` (T5) and to webview state (T8). `ConvertStatus` in `batchBridge.ts` matches the four-string union used in `convertProgress` (T9) and the webview's `rowStatus` map (T8/T9).

One inconsistency in T9 step 9.2: an early draft used `_trashFromState(panel)` without defining the helper. The corrected step explicitly drops the helper and reads `msg.trashOriginals` directly from the `preflightRequest` message — verified by the bridge update note at the end of step 9.2.

**Scope:** One feature, ~13 tasks, single FF-mergeable branch. Plan is appropriately sized.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-04-25-batch-convert.md` and implementation commits will land on `feat/batch-convert`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
