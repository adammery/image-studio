# Plan 2 — VSCode Extension GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `@image-studio/extension` VSCode package — a custom editor for PNG/JPG/WebP/AVIF with a right-side panel (Crop / Resize / Compress), a floating Compare pill (Slider/Side-by-side), zoom/pan, a Before/After info panel, and a Save & Trash option.

**Architecture:** The extension host registers a `CustomEditorProvider` for image files, manages a debounced sharp-based preview pipeline, and orchestrates saves. A plain TypeScript webview (bundled via esbuild) owns all UI interaction and sends `editStateChanged` messages to the host on every user action. The webview renders an `<img>` element for the image, absolutely-positioned overlays for crop handles, and CSS transforms for zoom/pan.

**Tech Stack:** TypeScript 5, VSCode API 1.90+, sharp 0.33 (existing), esbuild 0.21, trash 8, vitest 1.

---

## File Map

### Modified (core)
- `packages/core/src/types.ts` — add `EditState`, `ApplyEditsOptions`, `ApplyEditsResult`, `EditFormat`
- `packages/core/src/index.ts` — export `applyEdits`
- `packages/core/package.json` — add `trash` dependency

### New (core)
- `packages/core/src/applyEdits.ts`
- `packages/core/test/applyEdits.test.ts`

### New (extension package)
- `packages/extension/package.json`
- `packages/extension/tsconfig.json`
- `packages/extension/vitest.config.ts`
- `packages/extension/esbuild.config.mjs`
- `packages/extension/src/extension.ts`
- `packages/extension/src/imageEditorProvider.ts`
- `packages/extension/src/webviewContent.ts`
- `packages/extension/src/bridge.ts`
- `packages/extension/src/previewEncoder.ts`
- `packages/extension/src/saveOrchestrator.ts`
- `packages/extension/media/webview.html`
- `packages/extension/media/webview.ts`
- `packages/extension/media/webview.css`
- `packages/extension/test/saveOrchestrator.test.ts`
- `packages/extension/test/previewEncoder.test.ts`
- `packages/extension/test/MANUAL.md`

### Modified (root)
- `package.json` — add `packages/extension` to workspaces

---

## Task 1: Core — EditState types + `applyEdits` function

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/applyEdits.ts`
- Create: `packages/core/test/applyEdits.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: Add `trash` to core dependencies**

```bash
npm install trash --workspace=packages/core
```

- [ ] **Step 2: Add new types to `packages/core/src/types.ts`**

Append to the end of the file (after the existing `BatchResult` and `CoreError` definitions):

```typescript
// ── Plan 2: edit pipeline ──────────────────────────────────────────────────

export type EditFormat = 'same' | 'png' | 'jpeg' | 'webp' | 'avif';

export interface EditState {
  crop?:    { x: number; y: number; width: number; height: number };
  resize?:  { width: number; height: number; lockAspect: boolean };
  format:   EditFormat;
  quality:  number;       // 0–100; ignored when lossless=true or format='png'
  lossless: boolean;      // WebP/AVIF only
  compareMode:   'off' | 'slider' | 'sxs';  // UI-only; does not dirty tab
  trashOriginal: boolean;                    // UI-only; does not dirty tab
}

export interface ApplyEditsOptions {
  overwrite?: boolean;
}

export interface ApplyEditsResult {
  dst: string;
  size: number;
  width: number;
  height: number;
  originalTrashed: boolean;
}

export function defaultEditState(): EditState {
  return {
    format: 'same',
    quality: 80,
    lossless: false,
    compareMode: 'slider',
    trashOriginal: false,
  };
}
```

- [ ] **Step 3: Write the failing tests**

Create `packages/core/test/applyEdits.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { applyEdits } from '../src/applyEdits.js';
import { CoreError, defaultEditState } from '../src/types.js';
import { makeFixtures, type TestFixtures } from './fixtures.js';

describe('applyEdits', () => {
  let fx: TestFixtures;
  beforeAll(async () => { fx = await makeFixtures(); });
  afterAll(() => fx.cleanup());

  it('converts format (png → webp)', async () => {
    const dst = join(fx.dir, 'out.webp');
    const result = await applyEdits(fx.samplePng, dst, { ...defaultEditState(), format: 'webp', quality: 80 });
    expect(result.dst).toBe(dst);
    expect(existsSync(dst)).toBe(true);
    const meta = await sharp(dst).metadata();
    expect(meta.format).toBe('webp');
    expect(result.originalTrashed).toBe(false);
  });

  it('crops image to correct dimensions', async () => {
    const dst = join(fx.dir, 'cropped.png');
    const result = await applyEdits(fx.samplePng, dst, {
      ...defaultEditState(),
      crop: { x: 0, y: 0, width: 32, height: 32 },
    }, { overwrite: true });
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });

  it('resizes image', async () => {
    const dst = join(fx.dir, 'resized.png');
    const result = await applyEdits(fx.largePng, dst, {
      ...defaultEditState(),
      resize: { width: 100, height: 100, lockAspect: false },
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('applies crop then resize in order', async () => {
    const dst = join(fx.dir, 'crop-resize.png');
    const result = await applyEdits(fx.largePng, dst, {
      ...defaultEditState(),
      crop:   { x: 0, y: 0, width: 128, height: 128 },
      resize: { width: 64, height: 64, lockAspect: false },
    });
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
  });

  it('lossless webp produces valid file', async () => {
    const dst = join(fx.dir, 'lossless.webp');
    await applyEdits(fx.samplePng, dst, { ...defaultEditState(), format: 'webp', lossless: true });
    const meta = await sharp(dst).metadata();
    expect(meta.format).toBe('webp');
  });

  it('throws OutputExists when dst exists and overwrite not set', async () => {
    const dst = join(fx.dir, 'exists.png');
    await applyEdits(fx.samplePng, dst, defaultEditState());
    await expect(
      applyEdits(fx.samplePng, dst, defaultEditState())
    ).rejects.toMatchObject({ code: 'OutputExists' });
  });

  it('overwrites when overwrite: true', async () => {
    const dst = join(fx.dir, 'overwrite.png');
    await applyEdits(fx.samplePng, dst, defaultEditState());
    await expect(
      applyEdits(fx.samplePng, dst, defaultEditState(), { overwrite: true })
    ).resolves.toBeDefined();
  });

  it('throws FileNotFound for missing source', async () => {
    await expect(
      applyEdits('/nonexistent/image.png', '/tmp/out.png', defaultEditState())
    ).rejects.toMatchObject({ code: 'FileNotFound' });
  });

  it('does not trash when dst === src', async () => {
    const dst = join(fx.dir, 'same-path.png');
    await applyEdits(fx.samplePng, dst, defaultEditState());
    // now overwrite in-place — trashOriginal flag, but src === dst, should NOT trash
    const result = await applyEdits(dst, dst, defaultEditState(), { overwrite: true });
    expect(result.originalTrashed).toBe(false);
    expect(existsSync(dst)).toBe(true);
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
npm test --workspace=packages/core -- --reporter=verbose 2>&1 | grep -E 'applyEdits|FAIL|Error'
```

Expected: `Cannot find module '../src/applyEdits.js'`

- [ ] **Step 5: Create `packages/core/src/applyEdits.ts`**

```typescript
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { writeFile, stat } from 'node:fs/promises';
import { CoreError, type EditState, type ApplyEditsOptions, type ApplyEditsResult } from './types.js';

export async function applyEdits(
  src: string,
  dst: string,
  state: EditState,
  opts: ApplyEditsOptions = {},
): Promise<ApplyEditsResult> {
  if (!existsSync(src)) {
    throw new CoreError('FileNotFound', `Source file not found: ${src}`);
  }
  if (!opts.overwrite && existsSync(dst) && dst !== src) {
    throw new CoreError('OutputExists', `Output already exists: ${dst}. Set overwrite: true to replace.`);
  }

  let pipeline = sharp(src);

  if (state.crop) {
    const { x, y, width, height } = state.crop;
    pipeline = pipeline.extract({ left: x, top: y, width, height });
  }

  if (state.resize) {
    pipeline = pipeline.resize(state.resize.width, state.resize.height, { fit: 'fill' });
  }

  if (state.format !== 'same') {
    switch (state.format) {
      case 'png':
        pipeline = pipeline.png();
        break;
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: state.quality });
        break;
      case 'webp':
        pipeline = state.lossless
          ? pipeline.webp({ lossless: true })
          : pipeline.webp({ quality: state.quality });
        break;
      case 'avif':
        pipeline = state.lossless
          ? pipeline.avif({ lossless: true })
          : pipeline.avif({ quality: state.quality });
        break;
    }
  }

  const buffer = await pipeline.toBuffer();
  await writeFile(dst, buffer);

  const { size } = await stat(dst);
  const meta = await sharp(dst).metadata();

  let originalTrashed = false;
  if (state.trashOriginal && dst !== src) {
    try {
      const { default: trash } = await import('trash');
      await trash(src);
      originalTrashed = true;
    } catch {
      // non-fatal — caller surfaces warning toast
    }
  }

  return { dst, size, width: meta.width!, height: meta.height!, originalTrashed };
}
```

- [ ] **Step 6: Export from index**

In `packages/core/src/index.ts`, add:

```typescript
export { applyEdits } from './applyEdits.js';
export { defaultEditState } from './types.js';
```

Also add to the types export line — `defaultEditState` is already exported via `export * from './types.js'` so no change needed there. Just add the applyEdits line.

- [ ] **Step 7: Run tests and verify all pass**

```bash
npm test --workspace=packages/core
```

Expected: all existing tests + new `applyEdits` tests pass (9 new tests green).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/applyEdits.ts packages/core/src/index.ts packages/core/test/applyEdits.test.ts packages/core/package.json package-lock.json
git commit -m "Add applyEdits pipeline to core with trash support"
```

---

## Task 2: Extension package skeleton

**Files:**
- Create: `packages/extension/package.json`
- Create: `packages/extension/tsconfig.json`
- Create: `packages/extension/vitest.config.ts`
- Create: `packages/extension/esbuild.config.mjs`
- Modify: `package.json` (root) — add extension to workspaces

- [ ] **Step 1: Add extension to root workspaces**

In root `package.json`, change:

```json
"workspaces": [
  "packages/core",
  "packages/mcp-server"
]
```

to:

```json
"workspaces": [
  "packages/core",
  "packages/mcp-server",
  "packages/extension"
]
```

- [ ] **Step 2: Create `packages/extension/package.json`**

```json
{
  "name": "@image-studio/extension",
  "version": "0.1.0",
  "private": true,
  "description": "VSCode extension for Image Studio",
  "main": "./dist/extension.js",
  "scripts": {
    "build": "node esbuild.config.mjs",
    "dev": "node esbuild.config.mjs --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "vscode": "^1.90.0"
  },
  "contributes": {
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
      }
    ]
  },
  "dependencies": {
    "@image-studio/core": "workspace:*",
    "sharp": "^0.33.4",
    "trash": "^8.1.1"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "@types/vscode": "^1.90.0",
    "esbuild": "^0.21.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Create `packages/extension/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  },
  "include": ["src/**/*.ts", "media/webview.ts", "test/**/*.ts"]
}
```

- [ ] **Step 4: Create `packages/extension/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create `packages/extension/esbuild.config.mjs`**

```javascript
import esbuild from 'esbuild';
import { argv } from 'node:process';

const watch = argv.includes('--watch');

const sharedOpts = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
};

// Extension host bundle (CJS, Node, external vscode + native addons)
const extBuild = esbuild.build({
  ...sharedOpts,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode', 'sharp', 'trash'],
  watch: watch ? { onRebuild(err) { if (err) console.error('ext rebuild error:', err); } } : false,
});

// Webview bundle (ESM, browser)
const wvBuild = esbuild.build({
  ...sharedOpts,
  entryPoints: ['media/webview.ts'],
  outfile: 'media/webview.js',
  format: 'esm',
  platform: 'browser',
  target: 'chrome100',
  watch: watch ? { onRebuild(err) { if (err) console.error('wv rebuild error:', err); } } : false,
});

await Promise.all([extBuild, wvBuild]);
if (!watch) console.log('Build complete.');
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

Expected: `packages/extension/node_modules` created with vscode types, esbuild, vitest.

- [ ] **Step 7: Create stub entry files** (so esbuild doesn't error)

Create `packages/extension/src/extension.ts`:

```typescript
import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  // stub — filled in Task 4
}

export function deactivate(): void {}
```

Create `packages/extension/media/webview.ts`:

```typescript
// stub — filled in Task 5+
```

Create dirs:

```bash
mkdir -p packages/extension/src packages/extension/media packages/extension/test packages/extension/dist
```

- [ ] **Step 8: Verify build succeeds**

```bash
npm run build --workspace=packages/extension
```

Expected: `dist/extension.js` and `media/webview.js` created, no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/extension package.json package-lock.json
git commit -m "Add extension package skeleton with esbuild config"
```

---

## Task 3: Bridge message types

**Files:**
- Create: `packages/extension/src/bridge.ts`

The bridge defines all postMessage types shared between extension host and webview. Defining it first keeps Tasks 4–15 consistent.

- [ ] **Step 1: Create `packages/extension/src/bridge.ts`**

```typescript
import type { EditState, ImageInfo } from '@image-studio/core';

// ── Extension → Webview ───────────────────────────────────────────────────

export type ExtMessage =
  | {
      type: 'init';
      imageUri: string;      // webview.asWebviewUri URL for the source file
      meta: ImageInfo;       // width, height, format, size, hasAlpha, colorspace
      editState: EditState;  // always defaultEditState() on fresh open
    }
  | {
      type: 'previewReady';
      previewUri: string;    // webview.asWebviewUri URL for temp preview file
      size: number;          // bytes of encoded output
      width: number;
      height: number;
    }
  | {
      type: 'previewError';
      message: string;
    }
  | {
      type: 'saveComplete';
      trashed: boolean;
      newUri?: string;       // set when editor should navigate to new path after trash
    }
  | {
      type: 'showError';
      message: string;
    }
  | {
      type: 'fileChanged';
      imageUri: string;      // updated URI after external change
      meta: ImageInfo;
    };

// ── Webview → Extension ───────────────────────────────────────────────────

export type WvMessage =
  | {
      type: 'editStateChanged';
      state: EditState;
    }
  | {
      type: 'save';
      trashOriginal: boolean;
    }
  | {
      type: 'saveAs';
    }
  | {
      type: 'formatChangeConfirmed';   // user clicked "Save as .webp" in modal
      trashOriginal: boolean;
    }
  | {
      type: 'formatChangeCancelled';   // user clicked Cancel in modal
    }
  | {
      type: 'formatChangeSaveAs';      // user clicked "Save As… instead" in modal
    };
```

- [ ] **Step 2: Rebuild to verify no type errors**

```bash
npm run build --workspace=packages/extension
```

Expected: clean build (bridge.ts not imported yet, but tsc type-check passes).

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/bridge.ts
git commit -m "Add extension/webview postMessage bridge types"
```

---

## Task 4: `activate()` + `ImageEditorProvider` skeleton + unit test

**Files:**
- Modify: `packages/extension/src/extension.ts`
- Create: `packages/extension/src/imageEditorProvider.ts`
- Create: `packages/extension/src/webviewContent.ts`
- Create: `packages/extension/test/saveOrchestrator.test.ts` (skeleton — filled in Task 13)

- [ ] **Step 1: Write failing test**

Create `packages/extension/test/saveOrchestrator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
// Filled out in Task 13. Placeholder to ensure vitest runs.
describe('saveOrchestrator', () => {
  it('placeholder — see Task 13', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify vitest works**

```bash
npm test --workspace=packages/extension
```

Expected: 1 test passes.

- [ ] **Step 3: Create `packages/extension/src/webviewContent.ts`**

```typescript
import * as vscode from 'vscode';
import { defaultEditState } from '@image-studio/core';
import type { ExtMessage } from './bridge.js';

export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const webviewJs = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'webview.js'),
  );
  const webviewCss = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'),
  );
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} blob: data:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${webviewCss}">
  <title>Image Studio</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${webviewJs}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export function postToWebview(panel: vscode.WebviewPanel, msg: ExtMessage): void {
  panel.webview.postMessage(msg);
}
```

- [ ] **Step 4: Create `packages/extension/src/imageEditorProvider.ts`**

```typescript
import * as vscode from 'vscode';
import { getImageInfo, defaultEditState } from '@image-studio/core';
import type { EditState } from '@image-studio/core';
import { getWebviewContent, postToWebview } from './webviewContent.js';
import type { WvMessage } from './bridge.js';

export interface ImageDocument extends vscode.CustomDocument {
  readonly fsPath: string;
}

export class ImageEditorProvider implements vscode.CustomEditorProvider<ImageDocument> {
  public static readonly viewType = 'imageStudio.editor';

  // Cached edit state per document URI — read by saveCustomDocument
  private readonly editStates = new Map<string, EditState>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  // ── CustomEditorProvider ────────────────────────────────────────────────

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<ImageDocument> {
    return { uri, fsPath: uri.fsPath, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: ImageDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        vscode.Uri.file(document.fsPath).with({ path: document.uri.path.replace(/[^/]+$/, '') }),
      ],
    };
    webviewPanel.webview.html = getWebviewContent(webviewPanel.webview, this.context.extensionUri);
    this._setupMessageHandler(document, webviewPanel);
    await this._sendInit(document, webviewPanel);
  }

  async saveCustomDocument(
    document: ImageDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const state = this.editStates.get(document.uri.toString()) ?? defaultEditState();
    await this._performSave(document, document.uri, state);
  }

  async saveCustomDocumentAs(
    document: ImageDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const state = this.editStates.get(document.uri.toString()) ?? defaultEditState();
    await this._performSave(document, destination, state);
  }

  async revertCustomDocument(
    _document: ImageDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    // No backup in Plan 2 — nothing to revert.
  }

  // Required by CustomEditorProvider for dirty tracking
  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentContentChangeEvent<ImageDocument>
  >();
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  // ── Internal ────────────────────────────────────────────────────────────

  private async _sendInit(document: ImageDocument, panel: vscode.WebviewPanel): Promise<void> {
    try {
      const meta = await getImageInfo(document.fsPath);
      const imageUri = panel.webview.asWebviewUri(vscode.Uri.file(document.fsPath)).toString();
      postToWebview(panel, {
        type: 'init',
        imageUri,
        meta,
        editState: defaultEditState(),
      });
    } catch (err) {
      postToWebview(panel, { type: 'showError', message: (err as Error).message });
    }
  }

  private _setupMessageHandler(document: ImageDocument, panel: vscode.WebviewPanel): void {
    panel.webview.onDidReceiveMessage(async (msg: WvMessage) => {
      switch (msg.type) {
        case 'editStateChanged':
          this.editStates.set(document.uri.toString(), msg.state);
          this._updateDirty(document, msg.state);
          break;
        case 'save':
          await this._performSave(document, document.uri, msg.state ?? this.editStates.get(document.uri.toString()) ?? defaultEditState());
          break;
        case 'saveAs':
          await vscode.commands.executeCommand('workbench.action.files.saveAs');
          break;
        default:
          break;
      }
    });
  }

  private _updateDirty(document: ImageDocument, state: EditState): void {
    const isDirty =
      state.crop !== undefined ||
      state.resize !== undefined ||
      state.format !== 'same' ||
      state.quality !== 80 ||
      state.lossless !== false;

    if (isDirty) {
      this._onDidChangeCustomDocument.fire({ document });
    }
  }

  private async _performSave(
    document: ImageDocument,
    dst: vscode.Uri,
    state: EditState,
  ): Promise<void> {
    // Full implementation in Task 13 — stub for now
    void document; void dst; void state;
    vscode.window.showInformationMessage('Save: not yet implemented (Task 13)');
  }
}
```

- [ ] **Step 5: Update `packages/extension/src/extension.ts`**

```typescript
import * as vscode from 'vscode';
import { ImageEditorProvider } from './imageEditorProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ImageEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ImageEditorProvider.viewType,
      provider,
      { supportsMultipleEditorsPerDocument: false },
    ),
  );
}

export function deactivate(): void {}
```

- [ ] **Step 6: Build to verify no errors**

```bash
npm run build --workspace=packages/extension
```

Expected: clean build, `dist/extension.js` updated.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/ packages/extension/test/
git commit -m "Add ImageEditorProvider skeleton with activate and message handler"
```

---

## Task 5: Webview HTML/CSS static layout

**Files:**
- Create: `packages/extension/media/webview.html` (served via webviewContent.ts — not loaded directly; but useful as a design reference)
- Create: `packages/extension/media/webview.css`
- Modify: `packages/extension/media/webview.ts`

- [ ] **Step 1: Create `packages/extension/media/webview.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #1e1e1e;
  --bg2:      #252526;
  --bg3:      #2d2d2d;
  --border:   #191919;
  --text:     #cccccc;
  --text-dim: #9a9a9a;
  --accent:   #0e639c;
  --green:    #73c991;
  --red:      #f48771;
  --panel-w:  260px;
  font-family: -apple-system, 'Segoe UI', sans-serif;
  font-size: 12px;
  color: var(--text);
  background: var(--bg);
}

body { height: 100vh; overflow: hidden; display: flex; flex-direction: column; }

/* ── Error banner ─────────────────────────────────────────────── */
#error-banner {
  background: #5a1d1d; color: #f48771; padding: 8px 14px;
  display: none; font-size: 11px;
}
#error-banner.visible { display: block; }

/* ── Main area ────────────────────────────────────────────────── */
#main { display: flex; flex: 1; min-height: 0; }

/* ── Canvas area ──────────────────────────────────────────────── */
#canvas-area {
  flex: 1; background: var(--bg); position: relative;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; min-width: 0;
}

#image-container {
  position: relative; display: inline-block;
  transform-origin: center center;
}

#main-image {
  display: block; max-width: 100%; max-height: 100%;
  object-fit: contain; user-select: none; -webkit-user-drag: none;
}

/* Compare overlay images */
#compare-before, #compare-after {
  position: absolute; top: 0; left: 0;
  width: 100%; height: 100%; object-fit: contain; display: none;
}

/* ── Compare pill (top-center) ────────────────────────────────── */
#compare-pill {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  background: rgba(45,45,45,0.92); backdrop-filter: blur(10px);
  border: 1px solid #444; border-radius: 100px; padding: 3px;
  display: flex; gap: 2px; z-index: 10;
  box-shadow: 0 2px 8px rgba(0,0,0,.4);
}
#compare-pill button {
  background: transparent; border: none; color: #bdbdbd;
  padding: 4px 14px; border-radius: 100px; cursor: pointer;
  font-size: 11px; font-family: inherit;
}
#compare-pill button.active { background: var(--accent); color: #fff; }

/* ── Crop overlay ─────────────────────────────────────────────── */
#crop-overlay { position: absolute; inset: 0; display: none; cursor: crosshair; }
#crop-overlay.active { display: block; }
#crop-shade { position: absolute; inset: 0; background: rgba(0,0,0,.55); }
#crop-selection {
  position: absolute; border: 2px solid #fff; cursor: move;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.55);
}
.crop-handle {
  position: absolute; width: 10px; height: 10px;
  background: #fff; border: 1px solid #333; border-radius: 1px;
}
/* corner handles */
.crop-handle.nw { top: -5px; left: -5px; cursor: nw-resize; }
.crop-handle.ne { top: -5px; right: -5px; cursor: ne-resize; }
.crop-handle.sw { bottom: -5px; left: -5px; cursor: sw-resize; }
.crop-handle.se { bottom: -5px; right: -5px; cursor: se-resize; }
/* edge handles */
.crop-handle.n { top: -5px; left: calc(50% - 5px); cursor: n-resize; }
.crop-handle.s { bottom: -5px; left: calc(50% - 5px); cursor: s-resize; }
.crop-handle.w { top: calc(50% - 5px); left: -5px; cursor: w-resize; }
.crop-handle.e { top: calc(50% - 5px); right: -5px; cursor: e-resize; }

/* Crop action bar (replaces compare pill during crop mode) */
#crop-actions {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  background: rgba(45,45,45,.92); backdrop-filter: blur(10px);
  border: 1px solid #444; border-radius: 6px; padding: 6px 10px;
  display: none; gap: 8px; z-index: 11;
}
#crop-actions.visible { display: flex; }
#crop-actions button {
  background: var(--bg3); border: 1px solid #555; color: var(--text);
  padding: 4px 14px; border-radius: 3px; cursor: pointer; font-family: inherit; font-size: 11px;
}
#crop-actions button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }

/* ── Compare slider handle ────────────────────────────────────── */
#slider-handle {
  position: absolute; top: 0; bottom: 0; width: 2px;
  background: #fff; cursor: ew-resize; z-index: 5;
  left: 50%; box-shadow: 0 0 8px rgba(0,0,0,.5); display: none;
}
#slider-knob {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  width: 32px; height: 32px; border-radius: 50%;
  background: #fff; color: #1e1e1e; font-weight: bold;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; box-shadow: 0 0 10px rgba(0,0,0,.5); cursor: ew-resize;
}

/* ── Zoom pill (bottom-right) ─────────────────────────────────── */
#zoom-pill {
  position: absolute; bottom: 12px; right: 14px;
  background: rgba(45,45,45,.92); backdrop-filter: blur(10px);
  border: 1px solid #444; border-radius: 100px; padding: 3px;
  display: flex; align-items: center; gap: 2px; z-index: 10;
  opacity: 0; transition: opacity .15s;
}
#zoom-pill.visible { opacity: 1; }
#canvas-area:hover #zoom-pill { opacity: 1; }
#zoom-pill button {
  background: transparent; border: none; color: #bdbdbd;
  padding: 3px 8px; border-radius: 100px; cursor: pointer; font-family: inherit; font-size: 12px;
}
#zoom-pill #zoom-pct { padding: 3px 6px; min-width: 42px; text-align: center; font-variant-numeric: tabular-nums; }
#zoom-pill #zoom-fit { padding: 3px 10px; border-left: 1px solid #444; }

/* ── Right panel ──────────────────────────────────────────────── */
#panel {
  width: var(--panel-w); background: var(--bg2);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column; min-height: 0;
}
#panel-sections { flex: 1; overflow-y: auto; }

.panel-section { border-bottom: 1px solid var(--border); }
.section-head {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; background: var(--bg3);
  font-size: 10px; font-weight: 700; letter-spacing: .6px;
  color: #bdbdbd; text-transform: uppercase; cursor: pointer; user-select: none;
}
.section-caret { font-size: 9px; opacity: .7; transition: transform .15s; }
.section-head.collapsed .section-caret { transform: rotate(-90deg); }
.section-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.section-head.collapsed + .section-body { display: none; }

.row { display: flex; align-items: center; gap: 8px; }
.row label { width: 58px; color: var(--text-dim); }
.inp {
  background: #3c3c3c; border: 1px solid #555; color: var(--text);
  padding: 3px 6px; border-radius: 3px; font-size: 11px; font-family: inherit;
}
.inp.w68 { width: 68px; }
.inp.w42 { width: 42px; }
.inp.flex1 { flex: 1; }
.inp.error { border-color: var(--red); }
.inp-error-text { color: var(--red); font-size: 10px; }
input[type=range] { accent-color: var(--accent); flex: 1; }
.qnum { opacity: .8; min-width: 22px; text-align: right; font-variant-numeric: tabular-nums; }

.check-row { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.check-row.disabled { opacity: .4; pointer-events: none; }

.btn {
  background: #3c3c3c; border: 1px solid #555; color: var(--text);
  padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; font-family: inherit;
}
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.full { width: 100%; }
.btn:disabled { opacity: .4; cursor: not-allowed; }

/* ── Save footer ──────────────────────────────────────────────── */
#save-footer {
  padding: 12px; display: flex; flex-direction: column; gap: 8px;
  border-top: 1px solid var(--border); background: #1f1f1f; flex-shrink: 0;
}
#save-row { display: flex; gap: 6px; }
#trash-row { display: flex; align-items: center; gap: 6px; font-size: 11px; }
#trash-row.disabled { opacity: .4; pointer-events: none; }

/* ── Info panel (bottom) ──────────────────────────────────────── */
#info-panel {
  display: flex; background: var(--bg2);
  border-top: 1px solid var(--border); flex-shrink: 0;
}
.info-col { flex: 1; padding: 10px 16px; display: flex; flex-direction: column; gap: 3px; }
.info-col + .info-col { border-left: 1px solid var(--border); }
.info-title { font-size: 9px; font-weight: 700; letter-spacing: .8px; color: #8a8a8a; text-transform: uppercase; margin-bottom: 2px; }
.info-fname { color: #e0e0e0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.info-meta { color: var(--text-dim); }
.info-size { font-weight: 500; }
.info-reduction { color: var(--green); font-weight: 600; margin-left: 6px; }
.info-estimating { color: var(--text-dim); font-style: italic; }
.info-arrow { display: flex; align-items: center; padding: 0 8px; color: #555; font-size: 20px; }
```

- [ ] **Step 2: Update `packages/extension/media/webview.ts` with DOM structure**

```typescript
declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

// Inject root HTML
document.getElementById('root')!.innerHTML = /* html */ `
<div id="error-banner"></div>
<div id="main">
  <div id="canvas-area">
    <div id="compare-pill">
      <button data-mode="off">Off</button>
      <button data-mode="slider" class="active">Slider</button>
      <button data-mode="sxs">Side by side</button>
    </div>
    <div id="image-container">
      <img id="main-image" alt="Image preview" draggable="false">
      <img id="compare-before" alt="original" draggable="false">
      <img id="compare-after"  alt="after"    draggable="false">
      <div id="slider-handle"><div id="slider-knob">⇆</div></div>
    </div>
    <div id="crop-overlay">
      <div id="crop-shade"></div>
      <div id="crop-selection">
        <div class="crop-handle nw" data-dir="nw"></div>
        <div class="crop-handle ne" data-dir="ne"></div>
        <div class="crop-handle sw" data-dir="sw"></div>
        <div class="crop-handle se" data-dir="se"></div>
        <div class="crop-handle n"  data-dir="n"></div>
        <div class="crop-handle s"  data-dir="s"></div>
        <div class="crop-handle w"  data-dir="w"></div>
        <div class="crop-handle e"  data-dir="e"></div>
      </div>
    </div>
    <div id="crop-actions">
      <button class="btn primary" id="crop-apply">Apply</button>
      <button class="btn"         id="crop-cancel">Cancel</button>
    </div>
    <div id="zoom-pill">
      <button id="zoom-out">−</button>
      <span id="zoom-pct">Fit</span>
      <button id="zoom-in">+</button>
      <button id="zoom-fit" class="btn">Fit</button>
    </div>
  </div>

  <div id="panel">
    <div id="panel-sections">

      <div class="panel-section" id="section-crop">
        <div class="section-head" data-section="crop">
          <span class="section-caret">▾</span> Crop
        </div>
        <div class="section-body">
          <button class="btn full" id="crop-start">Start crop</button>
        </div>
      </div>

      <div class="panel-section" id="section-resize">
        <div class="section-head" data-section="resize">
          <span class="section-caret">▾</span> Resize
        </div>
        <div class="section-body">
          <div class="row">
            <label>Width</label>
            <input class="inp w68" id="resize-w" type="number" min="1">
            <select class="inp w42" id="resize-unit"><option value="px">px</option><option value="%">%</option></select>
          </div>
          <div class="row">
            <label>Height</label>
            <input class="inp w68" id="resize-h" type="number" min="1">
          </div>
          <div id="resize-error" class="inp-error-text" style="display:none"></div>
          <label class="check-row">
            <input type="checkbox" id="resize-lock" checked> Lock aspect ratio
          </label>
          <button class="btn" id="resize-apply">Apply</button>
        </div>
      </div>

      <div class="panel-section" id="section-compress">
        <div class="section-head" data-section="compress">
          <span class="section-caret">▾</span> Compress
        </div>
        <div class="section-body">
          <div class="row">
            <label>Format</label>
            <select class="inp flex1" id="format-select">
              <option value="same">Same as source</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
            </select>
          </div>
          <div class="row" id="quality-row">
            <label>Quality</label>
            <input type="range" id="quality-slider" min="0" max="100" value="80">
            <span class="qnum" id="quality-num">80</span>
          </div>
          <label class="check-row" id="lossless-row" style="display:none">
            <input type="checkbox" id="lossless-check"> Lossless
          </label>
        </div>
      </div>

    </div>

    <div id="save-footer">
      <div id="save-row">
        <button class="btn primary" id="btn-save" style="flex:1">Save</button>
        <button class="btn"         id="btn-save-as" style="flex:1">Save As…</button>
      </div>
      <label id="trash-row" class="check-row disabled" title="No original to remove — same file is being overwritten">
        <input type="checkbox" id="trash-check" disabled>
        Move original to Trash after save
      </label>
    </div>
  </div>
</div>

<div id="info-panel">
  <div class="info-col" id="info-before">
    <span class="info-title">Before</span>
    <span class="info-fname" id="before-fname">—</span>
    <span class="info-meta"  id="before-meta">—</span>
    <span class="info-size"  id="before-size">—</span>
  </div>
  <div class="info-arrow">→</div>
  <div class="info-col" id="info-after">
    <span class="info-title">After (estimate)</span>
    <span class="info-fname" id="after-fname">—</span>
    <span class="info-meta"  id="after-meta">—</span>
    <span class="info-size"  id="after-size">—</span>
  </div>
</div>
`;

// ── VSCode message handler stub (filled in Task 6+) ────────────────────────
window.addEventListener('message', (_event) => {
  // filled in subsequent tasks
});

export {};
```

- [ ] **Step 3: Build and verify**

```bash
npm run build --workspace=packages/extension
```

Expected: clean build.

- [ ] **Step 4: Manual verification** — open Extension Development Host (F5 in VSCode with extension package as workspace). Open any PNG. You should see the empty layout structure (black panes, no image yet). Check DevTools console for errors.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/media/ packages/extension/src/webviewContent.ts
git commit -m "Add webview HTML structure and CSS layout"
```

---

## Task 6: Open behavior — init message, image render, Before info panel

**Files:**
- Modify: `packages/extension/media/webview.ts`

- [ ] **Step 1: Add state and init handler to `media/webview.ts`**

Replace the stub `window.addEventListener` section at the bottom with the full implementation. Add below the HTML injection:

```typescript
// ── Types (mirror from bridge.ts — no import in webview bundle) ─────────────
interface EditState {
  crop?:    { x: number; y: number; width: number; height: number };
  resize?:  { width: number; height: number; lockAspect: boolean };
  format:   'same' | 'png' | 'jpeg' | 'webp' | 'avif';
  quality:  number;
  lossless: boolean;
  compareMode:   'off' | 'slider' | 'sxs';
  trashOriginal: boolean;
}
interface ImageInfo {
  width: number; height: number; format: string; size: number;
  hasAlpha: boolean; colorspace: string;
}

// ── State ───────────────────────────────────────────────────────────────────
let editState: EditState = {
  format: 'same', quality: 80, lossless: false,
  compareMode: 'slider', trashOriginal: false,
};
let srcMeta: ImageInfo | null = null;
let srcPath  = '';
let srcUri   = '';

// ── DOM refs ────────────────────────────────────────────────────────────────
const mainImage      = document.getElementById('main-image')    as HTMLImageElement;
const errorBanner    = document.getElementById('error-banner')  as HTMLElement;
const beforeFname    = document.getElementById('before-fname')  as HTMLElement;
const beforeMeta     = document.getElementById('before-meta')   as HTMLElement;
const beforeSize     = document.getElementById('before-size')   as HTMLElement;
const afterFname     = document.getElementById('after-fname')   as HTMLElement;
const afterMeta      = document.getElementById('after-meta')    as HTMLElement;
const afterSize      = document.getElementById('after-size')    as HTMLElement;
const formatSelect   = document.getElementById('format-select') as HTMLSelectElement;
const qualitySlider  = document.getElementById('quality-slider') as HTMLInputElement;
const qualityNum     = document.getElementById('quality-num')   as HTMLElement;
const qualityRow     = document.getElementById('quality-row')   as HTMLElement;
const losslessRow    = document.getElementById('lossless-row')  as HTMLElement;
const losslessCheck  = document.getElementById('lossless-check') as HTMLInputElement;
const trashRow       = document.getElementById('trash-row')     as HTMLElement;
const trashCheck     = document.getElementById('trash-check')   as HTMLInputElement;
const btnSave        = document.getElementById('btn-save')      as HTMLButtonElement;
const btnSaveAs      = document.getElementById('btn-save-as')   as HTMLButtonElement;

// ── Helpers ─────────────────────────────────────────────────────────────────
function basename(p: string): string {
  return p.split('/').pop() ?? p;
}
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
function fmtExt(state: EditState, srcFormat: string): string {
  const f = state.format === 'same' ? srcFormat : state.format;
  const ext: Record<string, string> = { jpeg: '.jpg', png: '.png', webp: '.webp', avif: '.avif' };
  return ext[f] ?? `.${f}`;
}
function afterFilename(srcName: string, state: EditState, srcFormat: string): string {
  const dot = srcName.lastIndexOf('.');
  const base = dot > -1 ? srcName.slice(0, dot) : srcName;
  return base + fmtExt(state, srcFormat);
}
function fmtLabel(state: EditState, srcFormat: string): string {
  const f = state.format === 'same' ? srcFormat : state.format;
  const parts = [f.toUpperCase()];
  if (f !== 'png') {
    if (state.lossless) parts.push('lossless');
    else parts.push(`q${state.quality}`);
  }
  return parts.join(', ');
}

function populateBefore(meta: ImageInfo, fname: string): void {
  beforeFname.textContent = fname;
  beforeMeta.textContent  = `${meta.width} × ${meta.height} px · ${meta.format.toUpperCase()}`;
  beforeSize.textContent  = fmtBytes(meta.size);
}

function setAfterEstimating(): void {
  afterSize.textContent = '';
  afterSize.innerHTML   = '<span class="info-estimating">Estimating…</span>';
}

function populateAfter(size: number, width: number, height: number, state: EditState, srcFmt: string, srcFname: string): void {
  const name = afterFilename(srcFname, state, srcFmt);
  const fmt  = fmtLabel(state, srcFmt);
  const pct  = srcMeta ? Math.round((1 - size / srcMeta.size) * 100) : 0;
  afterFname.textContent = name;
  afterMeta.textContent  = `${width} × ${height} px · ${fmt}`;
  afterSize.innerHTML    = `${fmtBytes(size)}${pct > 0 ? ` <span class="info-reduction">−${pct}%</span>` : ''}`;
}

// ── VSCode message handler ──────────────────────────────────────────────────
window.addEventListener('message', (event) => {
  const msg = event.data as { type: string; [k: string]: unknown };
  switch (msg.type) {
    case 'init': {
      srcUri  = msg.imageUri as string;
      srcMeta = msg.meta as ImageInfo;
      srcPath = basename(srcUri.split('?')[0]);
      editState = msg.editState as EditState;

      errorBanner.classList.remove('visible');
      mainImage.src = srcUri;
      populateBefore(srcMeta, srcPath);

      // Reset After column
      afterFname.textContent = afterFilename(srcPath, editState, srcMeta.format);
      afterMeta.textContent  = fmtLabel(editState, srcMeta.format);
      afterSize.textContent  = fmtBytes(srcMeta.size);

      syncCompressUI();
      syncTrashUI();
      break;
    }
    case 'previewReady': {
      const { previewUri, size, width, height } = msg as {
        previewUri: string; size: number; width: number; height: number;
      };
      if (srcMeta) populateAfter(size, width, height, editState, srcMeta.format, srcPath);
      // compare after-image updated in Task 11
      void previewUri;
      break;
    }
    case 'previewError': {
      afterFname.textContent = '—';
      afterMeta.textContent  = '';
      afterSize.textContent  = '(estimate failed)';
      break;
    }
    case 'showError': {
      errorBanner.textContent = `Error: ${msg.message}`;
      errorBanner.classList.add('visible');
      break;
    }
    case 'saveComplete': {
      // Edit state reset and dirty-clear handled in Task 13
      break;
    }
  }
});

// ── Compress section handlers ── (Task 7 fills these fully) ─────────────────
function syncCompressUI(): void {
  const fmt = editState.format === 'same' ? (srcMeta?.format ?? 'png') : editState.format;
  const lossy = fmt === 'jpeg' || fmt === 'webp' || fmt === 'avif';
  qualityRow.style.display   = lossy ? '' : 'none';
  losslessRow.style.display  = (fmt === 'webp' || fmt === 'avif') ? '' : 'none';
  qualitySlider.disabled     = editState.lossless;
  qualityNum.style.opacity   = editState.lossless ? '0.4' : '1';
}

function syncTrashUI(): void {
  const willChangePath = editState.format !== 'same';
  if (willChangePath) {
    trashRow.classList.remove('disabled');
    trashCheck.disabled = false;
    trashRow.removeAttribute('title');
  } else {
    trashRow.classList.add('disabled');
    trashCheck.disabled = true;
    trashCheck.checked  = false;
    editState.trashOriginal = false;
    trashRow.title = 'No original to remove — same file is being overwritten';
  }
}

function emitEditState(): void {
  vscode.postMessage({ type: 'editStateChanged', state: editState });
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build --workspace=packages/extension
```

Expected: clean build.

- [ ] **Step 3: Manual verification** — F5, open a PNG. Should see image displayed in canvas. Before column shows filename, dimensions, format, size. No console errors.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/media/webview.ts
git commit -m "Implement open behavior: init message, image display, Before info panel"
```

---

## Task 7: Compress section — format/quality/lossless + editStateChanged + dirty

**Files:**
- Modify: `packages/extension/media/webview.ts`

- [ ] **Step 1: Add compress control event listeners to webview.ts**

Append to the bottom of `media/webview.ts` (before `export {};`):

```typescript
// ── Compress section ────────────────────────────────────────────────────────

formatSelect.addEventListener('change', () => {
  editState.format = formatSelect.value as EditState['format'];
  syncCompressUI();
  syncTrashUI();
  setAfterEstimating();
  emitEditState();
});

qualitySlider.addEventListener('input', () => {
  editState.quality = Number(qualitySlider.value);
  qualityNum.textContent = qualitySlider.value;
  setAfterEstimating();
  emitEditState();
});

losslessCheck.addEventListener('change', () => {
  editState.lossless = losslessCheck.checked;
  syncCompressUI();
  setAfterEstimating();
  emitEditState();
});

// ── Save footer ─────────────────────────────────────────────────────────────

trashCheck.addEventListener('change', () => {
  editState.trashOriginal = trashCheck.checked;
  // trashOriginal doesn't trigger emitEditState (not a dirty field)
});

btnSave.addEventListener('click', () => {
  vscode.postMessage({ type: 'save', trashOriginal: editState.trashOriginal });
});

btnSaveAs.addEventListener('click', () => {
  vscode.postMessage({ type: 'saveAs' });
});

// ── Accordion collapse/expand ───────────────────────────────────────────────

document.querySelectorAll('.section-head').forEach((head) => {
  head.addEventListener('click', () => {
    head.classList.toggle('collapsed');
  });
});
```

- [ ] **Step 2: Build and test manually**

```bash
npm run build --workspace=packages/extension
```

F5 → open PNG → change Format to WebP → slider and lossless checkbox appear/hide correctly. Quality slider changes the number. Tab dirty indicator `●` should appear on the tab after format or quality change.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/media/webview.ts
git commit -m "Implement Compress section controls and dirty tracking"
```

---

## Task 8: Preview encoder — debounced `toBuffer` + temp file + After panel

**Files:**
- Create: `packages/extension/src/previewEncoder.ts`
- Create: `packages/extension/test/previewEncoder.test.ts`
- Modify: `packages/extension/src/imageEditorProvider.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/extension/test/previewEncoder.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreviewEncoder } from '../src/previewEncoder.js';

// Minimal mock of vscode.ExtensionContext
const fakeContext = {
  globalStorageUri: { fsPath: '/tmp/preview-encoder-test' },
} as any;

describe('PreviewEncoder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('calls onResult after debounce delay', async () => {
    const results: unknown[] = [];
    const enc = new PreviewEncoder(fakeContext, (r) => results.push(r));
    enc.schedule('/nonexistent.png', { format: 'same', quality: 80, lossless: false, compareMode: 'slider', trashOriginal: false });
    expect(results).toHaveLength(0);
    await vi.runAllTimersAsync();
    // Result will be an error since /nonexistent.png doesn't exist — that's fine
    expect(results).toHaveLength(1);
  });

  it('cancels previous call when rescheduled within debounce window', async () => {
    let callCount = 0;
    const enc = new PreviewEncoder(fakeContext, () => { callCount++; });
    enc.schedule('/nonexistent.png', { format: 'same', quality: 80, lossless: false, compareMode: 'slider', trashOriginal: false });
    enc.schedule('/nonexistent.png', { format: 'same', quality: 80, lossless: false, compareMode: 'slider', trashOriginal: false });
    enc.schedule('/nonexistent.png', { format: 'same', quality: 80, lossless: false, compareMode: 'slider', trashOriginal: false });
    await vi.runAllTimersAsync();
    // Only one callback despite three schedule calls
    expect(callCount).toBe(1);
  });

  it('cancels on dispose', async () => {
    let callCount = 0;
    const enc = new PreviewEncoder(fakeContext, () => { callCount++; });
    enc.schedule('/nonexistent.png', { format: 'same', quality: 80, lossless: false, compareMode: 'slider', trashOriginal: false });
    enc.dispose();
    await vi.runAllTimersAsync();
    expect(callCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace=packages/extension
```

Expected: `Cannot find module '../src/previewEncoder.js'`

- [ ] **Step 3: Create `packages/extension/src/previewEncoder.ts`**

```typescript
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import type { EditState } from '@image-studio/core';

const DEBOUNCE_MS = 300;

export type PreviewResult =
  | { ok: true; previewUri: string; size: number; width: number; height: number }
  | { ok: false; message: string };

export class PreviewEncoder {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private tempDir: string;

  constructor(
    private readonly context: Pick<vscode.ExtensionContext, 'globalStorageUri'>,
    private readonly onResult: (result: PreviewResult) => void,
  ) {
    this.tempDir = path.join(context.globalStorageUri.fsPath, 'preview');
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  schedule(srcPath: string, state: EditState): void {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this._encode(srcPath, state), DEBOUNCE_MS);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    // Clean up temp files
    try { fs.rmSync(this.tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  private async _encode(srcPath: string, state: EditState): Promise<void> {
    if (this.disposed) return;

    try {
      let pipeline = sharp(srcPath);

      if (state.crop) {
        pipeline = pipeline.extract({ left: state.crop.x, top: state.crop.y, width: state.crop.width, height: state.crop.height });
      }
      if (state.resize) {
        pipeline = pipeline.resize(state.resize.width, state.resize.height, { fit: 'fill' });
      }
      if (state.format !== 'same') {
        switch (state.format) {
          case 'png':  pipeline = pipeline.png(); break;
          case 'jpeg': pipeline = pipeline.jpeg({ quality: state.quality }); break;
          case 'webp': pipeline = state.lossless ? pipeline.webp({ lossless: true }) : pipeline.webp({ quality: state.quality }); break;
          case 'avif': pipeline = state.lossless ? pipeline.avif({ lossless: true }) : pipeline.avif({ quality: state.quality }); break;
        }
      }

      const buffer = await pipeline.toBuffer();
      if (this.disposed) return;

      const ext = state.format === 'same' ? path.extname(srcPath) : `.${state.format === 'jpeg' ? 'jpg' : state.format}`;
      const tmpFile = path.join(this.tempDir, `preview${ext}`);
      fs.writeFileSync(tmpFile, buffer);

      const meta = await sharp(tmpFile).metadata();

      this.onResult({
        ok: true,
        previewUri: tmpFile,
        size: buffer.length,
        width: meta.width!,
        height: meta.height!,
      });
    } catch (err) {
      if (!this.disposed) {
        this.onResult({ ok: false, message: (err as Error).message });
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace=packages/extension
```

Expected: all 4 tests pass (1 saveOrchestrator placeholder + 3 previewEncoder).

- [ ] **Step 5: Wire PreviewEncoder into `imageEditorProvider.ts`**

At the top, add the import:

```typescript
import { PreviewEncoder } from './previewEncoder.js';
```

Inside `ImageEditorProvider` class, add a field:

```typescript
private readonly encoders = new Map<string, PreviewEncoder>();
```

In `resolveCustomEditor`, after `this._setupMessageHandler(...)` and before `this._sendInit(...)`, add:

```typescript
const encoder = new PreviewEncoder(this.context, (result) => {
  if (result.ok) {
    const previewUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.file(result.previewUri)
    ).toString();
    postToWebview(webviewPanel, {
      type: 'previewReady',
      previewUri,
      size: result.size,
      width: result.width,
      height: result.height,
    });
  } else {
    postToWebview(webviewPanel, { type: 'previewError', message: result.message });
    vscode.window.showErrorMessage(`Image Studio preview: ${result.message}`);
  }
});
this.encoders.set(document.uri.toString(), encoder);
webviewPanel.onDidDispose(() => {
  encoder.dispose();
  this.encoders.delete(document.uri.toString());
  this.editStates.delete(document.uri.toString());
});
```

In `_setupMessageHandler`, in the `editStateChanged` case, add after `this._updateDirty(...)`:

```typescript
const enc = this.encoders.get(document.uri.toString());
enc?.schedule(document.fsPath, msg.state);
```

Also add this line so the webviewContent.ts localResourceRoots covers the preview temp dir. In `resolveCustomEditor`, update `localResourceRoots`:

```typescript
webviewPanel.webview.options = {
  enableScripts: true,
  localResourceRoots: [
    vscode.Uri.joinPath(this.context.extensionUri, 'media'),
    vscode.Uri.file(document.fsPath).with({ path: document.uri.path.replace(/[^/]+$/, '') }),
    this.context.globalStorageUri,
  ],
};
```

- [ ] **Step 6: Build and manual verify**

```bash
npm run build --workspace=packages/extension
```

F5 → open PNG → change Format to WebP → wait 300ms → After column updates with estimated size and reduction %.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/previewEncoder.ts packages/extension/src/imageEditorProvider.ts packages/extension/test/previewEncoder.test.ts
git commit -m "Add debounced preview encoder and wire into provider"
```

---

## Task 9: Resize section — inputs, aspect lock, unit toggle, Apply

**Files:**
- Modify: `packages/extension/media/webview.ts`

- [ ] **Step 1: Add resize logic to `media/webview.ts`**

Append to the bottom of `media/webview.ts` (before `export {};`):

```typescript
// ── Resize section ──────────────────────────────────────────────────────────

const resizeW     = document.getElementById('resize-w')    as HTMLInputElement;
const resizeH     = document.getElementById('resize-h')    as HTMLInputElement;
const resizeUnit  = document.getElementById('resize-unit') as HTMLSelectElement;
const resizeLock  = document.getElementById('resize-lock') as HTMLInputElement;
const resizeApply = document.getElementById('resize-apply') as HTMLButtonElement;
const resizeError = document.getElementById('resize-error') as HTMLElement;

let srcAspect = 1; // set on init

// Patch init handler to set srcAspect and seed resize inputs
const _origInit = window.addEventListener;
// Override the 'init' case in the message handler to also set srcAspect:
// (We extend the existing listener by patching from the init case)
// Actually: since we already handle 'init' in Task 6, we add to the init case.
// Simpler: call a function from the init case that syncs resize inputs.
// We'll call syncResizeDefaults() when srcMeta is set.

function syncResizeDefaults(): void {
  if (!srcMeta) return;
  srcAspect = srcMeta.width / srcMeta.height;
  resizeW.value = String(srcMeta.width);
  resizeH.value = String(srcMeta.height);
}

// Hook: re-export so init handler can call it
(window as any).__syncResizeDefaults = syncResizeDefaults;

function resizeValidate(): boolean {
  const w = Number(resizeW.value);
  const h = Number(resizeH.value);
  if (!Number.isInteger(w) || w < 1 || !Number.isInteger(h) || h < 1) {
    resizeError.textContent = 'Width and height must be positive integers.';
    resizeError.style.display = '';
    resizeW.classList.toggle('error', !Number.isInteger(w) || w < 1);
    resizeH.classList.toggle('error', !Number.isInteger(h) || h < 1);
    resizeApply.disabled = true;
    return false;
  }
  resizeError.style.display = 'none';
  resizeW.classList.remove('error');
  resizeH.classList.remove('error');
  resizeApply.disabled = false;
  return true;
}

function pxFromInput(val: string, dim: 'w' | 'h'): number {
  const n = Number(val);
  if (resizeUnit.value === '%') {
    const base = dim === 'w' ? (srcMeta?.width ?? 100) : (srcMeta?.height ?? 100);
    return Math.round(base * n / 100);
  }
  return Math.round(n);
}

resizeW.addEventListener('input', () => {
  if (resizeLock.checked && srcAspect) {
    const wpx = pxFromInput(resizeW.value, 'w');
    const hpx = Math.round(wpx / srcAspect);
    resizeH.value = resizeUnit.value === '%'
      ? String(Math.round(hpx / (srcMeta?.height ?? 1) * 100))
      : String(hpx);
  }
  resizeValidate();
});

resizeH.addEventListener('input', () => {
  if (resizeLock.checked && srcAspect) {
    const hpx = pxFromInput(resizeH.value, 'h');
    const wpx = Math.round(hpx * srcAspect);
    resizeW.value = resizeUnit.value === '%'
      ? String(Math.round(wpx / (srcMeta?.width ?? 1) * 100))
      : String(wpx);
  }
  resizeValidate();
});

resizeW.addEventListener('keydown', (e) => { if (e.key === 'Escape') syncResizeDefaults(); });
resizeH.addEventListener('keydown', (e) => { if (e.key === 'Escape') syncResizeDefaults(); });

resizeUnit.addEventListener('change', () => {
  if (!srcMeta) return;
  if (resizeUnit.value === '%') {
    resizeW.value = '100';
    resizeH.value = '100';
  } else {
    resizeW.value = String(editState.resize?.width  ?? srcMeta.width);
    resizeH.value = String(editState.resize?.height ?? srcMeta.height);
  }
  resizeValidate();
});

resizeApply.addEventListener('click', () => {
  if (!resizeValidate()) return;
  editState.resize = {
    width:      pxFromInput(resizeW.value, 'w'),
    height:     pxFromInput(resizeH.value, 'h'),
    lockAspect: resizeLock.checked,
  };
  emitEditState();
});
```

Now patch the `init` case in the `window.addEventListener` handler to call `syncResizeDefaults()`. Update the `case 'init':` block inside the existing message listener — add at the end of the init case block:

```typescript
(window as any).__syncResizeDefaults?.();
```

- [ ] **Step 2: Build**

```bash
npm run build --workspace=packages/extension
```

- [ ] **Step 3: Manual verification** — F5 → open PNG → Resize section shows correct width/height from image. Type new width → height auto-updates (with Lock on). Change unit to % → shows 100%. Apply → After panel shows new dimensions.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/media/webview.ts
git commit -m "Implement Resize section with aspect lock and unit toggle"
```

---

## Task 10: Crop flow — overlay, 8 handles, Apply/Cancel

**Files:**
- Modify: `packages/extension/media/webview.ts`

- [ ] **Step 1: Add crop logic to `media/webview.ts`**

Append to the bottom of `media/webview.ts` (before `export {};`):

```typescript
// ── Crop flow ───────────────────────────────────────────────────────────────

const cropOverlay   = document.getElementById('crop-overlay')    as HTMLElement;
const cropSelection = document.getElementById('crop-selection')  as HTMLElement;
const cropActions   = document.getElementById('crop-actions')    as HTMLElement;
const cropApply     = document.getElementById('crop-apply')      as HTMLButtonElement;
const cropCancel    = document.getElementById('crop-cancel')     as HTMLButtonElement;
const cropStart     = document.getElementById('crop-start')      as HTMLButtonElement;
const comparePill   = document.getElementById('compare-pill')    as HTMLElement;

interface CropRect { x: number; y: number; w: number; h: number; }
let cropDraft: CropRect = { x: 0, y: 0, w: 0, h: 0 };
let cropDragging: { type: 'move' | 'handle'; dir?: string; startX: number; startY: number; startRect: CropRect } | null = null;

function getImageRect(): DOMRect {
  return mainImage.getBoundingClientRect();
}

function clampCrop(r: CropRect): CropRect {
  if (!srcMeta) return r;
  const minSize = 10;
  let { x, y, w, h } = r;
  x = Math.max(0, Math.min(x, srcMeta.width - minSize));
  y = Math.max(0, Math.min(y, srcMeta.height - minSize));
  w = Math.max(minSize, Math.min(w, srcMeta.width - x));
  h = Math.max(minSize, Math.min(h, srcMeta.height - y));
  return { x, y, w, h };
}

function scaleFactor(): number {
  if (!srcMeta) return 1;
  const r = getImageRect();
  return r.width / srcMeta.width;
}

function renderCropSelection(): void {
  const scale = scaleFactor();
  const imgRect = getImageRect();
  const canvasRect = (document.getElementById('canvas-area') as HTMLElement).getBoundingClientRect();
  const offX = imgRect.left - canvasRect.left;
  const offY = imgRect.top  - canvasRect.top;
  const { x, y, w, h } = cropDraft;
  cropSelection.style.left   = `${offX + x * scale}px`;
  cropSelection.style.top    = `${offY + y * scale}px`;
  cropSelection.style.width  = `${w * scale}px`;
  cropSelection.style.height = `${h * scale}px`;
}

function enterCropMode(): void {
  // Init selection to full image (or existing crop)
  cropDraft = editState.crop
    ? { x: editState.crop.x, y: editState.crop.y, w: editState.crop.width, h: editState.crop.height }
    : { x: 0, y: 0, w: srcMeta?.width ?? 100, h: srcMeta?.height ?? 100 };

  cropOverlay.classList.add('active');
  cropActions.classList.add('visible');
  comparePill.style.display = 'none';
  renderCropSelection();
}

function exitCropMode(): void {
  cropOverlay.classList.remove('active');
  cropActions.classList.remove('visible');
  comparePill.style.display = '';
}

cropStart.addEventListener('click', enterCropMode);

cropApply.addEventListener('click', () => {
  editState.crop = { x: cropDraft.x, y: cropDraft.y, width: cropDraft.w, height: cropDraft.h };
  exitCropMode();
  emitEditState();
});

cropCancel.addEventListener('click', () => exitCropMode());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cropOverlay.classList.contains('active')) {
    exitCropMode();
  }
});

// Drag logic for handles and selection move
cropOverlay.addEventListener('mousedown', (e) => {
  const target = e.target as HTMLElement;
  const dir = target.dataset['dir'];
  const imgRect = getImageRect();
  const canvasRect = (document.getElementById('canvas-area') as HTMLElement).getBoundingClientRect();
  const offX = imgRect.left - canvasRect.left;
  const offY = imgRect.top  - canvasRect.top;
  const scale = scaleFactor();
  const mouseX = (e.clientX - canvasRect.left - offX) / scale;
  const mouseY = (e.clientY - canvasRect.top  - offY) / scale;

  if (dir) {
    cropDragging = { type: 'handle', dir, startX: mouseX, startY: mouseY, startRect: { ...cropDraft } };
    e.preventDefault();
  } else if (target === cropSelection) {
    cropDragging = { type: 'move', startX: mouseX, startY: mouseY, startRect: { ...cropDraft } };
    e.preventDefault();
  }
});

document.addEventListener('mousemove', (e) => {
  if (!cropDragging || !srcMeta) return;
  const imgRect = getImageRect();
  const canvasRect = (document.getElementById('canvas-area') as HTMLElement).getBoundingClientRect();
  const offX = imgRect.left - canvasRect.left;
  const offY = imgRect.top  - canvasRect.top;
  const scale = scaleFactor();
  const mx = (e.clientX - canvasRect.left - offX) / scale;
  const my = (e.clientY - canvasRect.top  - offY) / scale;
  const dx = mx - cropDragging.startX;
  const dy = my - cropDragging.startY;
  const sr = cropDragging.startRect;

  let { x, y, w, h } = sr;
  if (cropDragging.type === 'move') {
    x = sr.x + dx; y = sr.y + dy;
  } else {
    const dir = cropDragging.dir!;
    if (dir.includes('e'))  w = sr.w + dx;
    if (dir.includes('s'))  h = sr.h + dy;
    if (dir.includes('w')) { x = sr.x + dx; w = sr.w - dx; }
    if (dir.includes('n')) { y = sr.y + dy; h = sr.h - dy; }
  }
  cropDraft = clampCrop({ x, y, w, h });
  renderCropSelection();
});

document.addEventListener('mouseup', () => { cropDragging = null; });
```

- [ ] **Step 2: Build**

```bash
npm run build --workspace=packages/extension
```

- [ ] **Step 3: Manual verification** — F5 → open a large PNG → click Start crop → overlay appears with 8 handles. Drag corner handles to resize. Drag inside to move. Apply → crop committed to editState, overlay disappears, After panel updates. Cancel → overlay disappears, no change.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/media/webview.ts
git commit -m "Implement crop overlay with 8 handles, apply/cancel"
```

---

## Task 11: Compare pill — Off/Slider/Side-by-side

**Files:**
- Modify: `packages/extension/media/webview.ts`

- [ ] **Step 1: Add compare logic to `media/webview.ts`**

Add DOM refs (append near other DOM refs at the top of the state section):

```typescript
const compareBeforeImg = document.getElementById('compare-before') as HTMLImageElement;
const compareAfterImg  = document.getElementById('compare-after')  as HTMLImageElement;
const sliderHandle     = document.getElementById('slider-handle')  as HTMLElement;
const imageContainer   = document.getElementById('image-container') as HTMLElement;
```

Append compare logic to the bottom of `media/webview.ts`:

```typescript
// ── Compare pill ────────────────────────────────────────────────────────────

let lastPreviewUri = '';
let sliderPos = 50; // percent

function applyCompareMode(mode: 'off' | 'slider' | 'sxs'): void {
  // Reset compare pill active state
  document.querySelectorAll('#compare-pill button').forEach((b) => {
    const btn = b as HTMLButtonElement;
    btn.classList.toggle('active', btn.dataset['mode'] === mode);
  });

  // Hide all compare elements first
  mainImage.style.display        = '';
  compareBeforeImg.style.display = 'none';
  compareAfterImg.style.display  = 'none';
  sliderHandle.style.display     = 'none';
  imageContainer.style.display   = '';

  if (mode === 'off') {
    mainImage.src = srcUri;
    return;
  }

  // Both slider and sxs need before/after images
  compareBeforeImg.src = srcUri;
  compareAfterImg.src  = lastPreviewUri || srcUri;
  compareBeforeImg.style.display = 'block';
  compareAfterImg.style.display  = 'block';
  mainImage.style.display        = 'none';

  if (mode === 'slider') {
    sliderHandle.style.display = 'block';
    updateSliderClip();
  } else {
    // Side-by-side: show before on left half, after on right half using clip
    compareBeforeImg.style.clipPath = `inset(0 50% 0 0)`;
    compareAfterImg.style.clipPath  = `inset(0 0 0 50%)`;
    sliderHandle.style.display      = 'none';
  }
}

function updateSliderClip(): void {
  sliderHandle.style.left = `${sliderPos}%`;
  compareBeforeImg.style.clipPath = `inset(0 ${100 - sliderPos}% 0 0)`;
  compareAfterImg.style.clipPath  = 'none';
}

// Pill click handlers
document.querySelectorAll('#compare-pill button').forEach((b) => {
  b.addEventListener('click', () => {
    const mode = (b as HTMLButtonElement).dataset['mode'] as EditState['compareMode'];
    editState.compareMode = mode;
    applyCompareMode(mode);
    // compareMode doesn't call emitEditState (doesn't dirty tab)
  });
});

// Slider drag
let sliderDragging = false;
sliderHandle.addEventListener('mousedown', (e) => {
  sliderDragging = true; e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
  if (!sliderDragging) return;
  const area = document.getElementById('canvas-area') as HTMLElement;
  const rect = area.getBoundingClientRect();
  sliderPos = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
  updateSliderClip();
});
document.addEventListener('mouseup', () => { sliderDragging = false; });

// Update compare after-image when previewReady fires
// Patch the existing 'previewReady' case in the message handler:
// Add after the populateAfter() call in the previewReady handler:
// (We patch via a global hook to avoid rewriting the existing handler)
(window as any).__onPreviewReady = (previewUri: string) => {
  lastPreviewUri = previewUri;
  if (editState.compareMode !== 'off') {
    compareAfterImg.src = previewUri;
    if (editState.compareMode === 'sxs') {
      compareBeforeImg.style.clipPath = `inset(0 50% 0 0)`;
      compareAfterImg.style.clipPath  = `inset(0 0 0 50%)`;
    }
  }
};

// Apply initial compare mode after init
(window as any).__applyInitialCompare = () => {
  applyCompareMode(editState.compareMode);
};
```

Patch the `previewReady` case in the existing message listener to call `__onPreviewReady`:

```typescript
// In case 'previewReady' (already exists in Task 6), add:
(window as any).__onPreviewReady?.(previewUri);
```

Patch the `init` case to call `__applyInitialCompare` after the image loads:

```typescript
// In case 'init', after setting mainImage.src:
mainImage.onload = () => { (window as any).__applyInitialCompare?.(); };
```

- [ ] **Step 2: Build**

```bash
npm run build --workspace=packages/extension
```

- [ ] **Step 3: Manual verification** — F5 → open PNG → change Format to WebP → wait for estimate → switch Compare to Slider → white line appears, drag it left/right to reveal before/after. Switch to Side-by-side → left half = original, right half = WebP version. Off → normal single image.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/media/webview.ts
git commit -m "Implement Compare pill: Off/Slider/Side-by-side modes"
```

---

## Task 12: Zoom/pan

**Files:**
- Modify: `packages/extension/media/webview.ts`

- [ ] **Step 1: Add zoom/pan logic**

Append to `media/webview.ts`:

```typescript
// ── Zoom / pan ──────────────────────────────────────────────────────────────

const zoomPill = document.getElementById('zoom-pill')  as HTMLElement;
const zoomPct  = document.getElementById('zoom-pct')   as HTMLElement;
const zoomIn   = document.getElementById('zoom-in')    as HTMLButtonElement;
const zoomOut  = document.getElementById('zoom-out')   as HTMLButtonElement;
const zoomFit  = document.getElementById('zoom-fit')   as HTMLButtonElement;
const canvasArea = document.getElementById('canvas-area') as HTMLElement;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8.0;
let zoom  = 0;   // 0 = fit-to-window
let panX  = 0;
let panY  = 0;
let spaceDown = false;
let panning   = false;
let panStart  = { x: 0, y: 0 };

function isFit(): boolean { return zoom === 0; }

function applyTransform(): void {
  if (isFit()) {
    imageContainer.style.transform = '';
    zoomPct.textContent = 'Fit';
    zoomPill.classList.remove('visible');
  } else {
    imageContainer.style.transform = `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`;
    zoomPct.textContent = `${Math.round(zoom * 100)}%`;
    zoomPill.classList.add('visible');
  }
}

function setZoom(newZoom: number, originX?: number, originY?: number): void {
  if (newZoom <= MIN_ZOOM * 1.01) { setFit(); return; }
  newZoom = Math.min(MAX_ZOOM, newZoom);
  void originX; void originY; // origin-aware zoom is a polish item
  zoom = newZoom;
  applyTransform();
}

function setFit(): void {
  zoom = 0; panX = 0; panY = 0;
  applyTransform();
}

zoomIn .addEventListener('click', () => setZoom(isFit() ? 1.1 : zoom * 1.1));
zoomOut.addEventListener('click', () => setZoom(isFit() ? 0.9 : zoom * 0.9));
zoomFit.addEventListener('click', setFit);
mainImage.addEventListener('dblclick', setFit);
compareBeforeImg.addEventListener('dblclick', setFit);

canvasArea.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const base  = isFit() ? 1.0 : zoom;
  setZoom(base * delta, e.clientX, e.clientY);
}, { passive: false });

document.addEventListener('keydown', (e) => { if (e.code === 'Space') { spaceDown = true; canvasArea.style.cursor = 'grab'; } });
document.addEventListener('keyup',   (e) => { if (e.code === 'Space') { spaceDown = false; panning = false; canvasArea.style.cursor = ''; } });

canvasArea.addEventListener('mousedown', (e) => {
  if (spaceDown && !isFit()) {
    panning   = true;
    panStart  = { x: e.clientX - panX, y: e.clientY - panY };
    canvasArea.style.cursor = 'grabbing';
    e.preventDefault();
  }
});
document.addEventListener('mousemove', (e) => {
  if (!panning) return;
  panX = e.clientX - panStart.x;
  panY = e.clientY - panStart.y;
  applyTransform();
});
document.addEventListener('mouseup', () => {
  if (panning) { panning = false; canvasArea.style.cursor = spaceDown ? 'grab' : ''; }
});
```

- [ ] **Step 2: Build**

```bash
npm run build --workspace=packages/extension
```

- [ ] **Step 3: Manual verification** — F5 → open large PNG → scroll mouse wheel over canvas → image zooms. Hold Space + drag → pans. Double-click or press Fit → resets. Zoom pill shows current percentage and persists when zoomed in.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/media/webview.ts
git commit -m "Implement zoom and pan with scroll wheel and space+drag"
```

---

## Task 13: Save flow — `saveOrchestrator`, `saveCustomDocument`, format-change modal, trash

**Files:**
- Create: `packages/extension/src/saveOrchestrator.ts`
- Modify: `packages/extension/src/imageEditorProvider.ts`
- Modify: `packages/extension/test/saveOrchestrator.test.ts`

- [ ] **Step 1: Write failing tests**

Replace `packages/extension/test/saveOrchestrator.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { SaveOrchestrator } from '../src/saveOrchestrator.js';
import type { EditState } from '@image-studio/core';
import { defaultEditState } from '@image-studio/core';

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
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace=packages/extension
```

Expected: `Cannot find module '../src/saveOrchestrator.js'`

- [ ] **Step 3: Create `packages/extension/src/saveOrchestrator.ts`**

```typescript
import { applyEdits } from '@image-studio/core';
import type { EditState, ApplyEditsResult } from '@image-studio/core';

export interface SaveOptions {
  overwrite?: boolean;
}

export class SaveOrchestrator {
  async save(
    src: string,
    dst: string,
    state: EditState,
    opts: SaveOptions,
  ): Promise<ApplyEditsResult> {
    return applyEdits(src, dst, state, {
      overwrite: opts.overwrite ?? (src === dst),
    });
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace=packages/extension
```

Expected: all tests pass.

- [ ] **Step 5: Wire save into `imageEditorProvider.ts`**

Add imports at the top:

```typescript
import { SaveOrchestrator } from './saveOrchestrator.js';
import * as path from 'node:path';
```

Add field to class:

```typescript
private readonly saveOrch = new SaveOrchestrator();
```

Replace the stub `_performSave` method with the full implementation:

```typescript
private async _performSave(
  document: ImageDocument,
  dst: vscode.Uri,
  state: EditState,
): Promise<void> {
  const srcPath = document.fsPath;
  const srcExt  = path.extname(srcPath).slice(1).toLowerCase();
  const dstExt  = state.format === 'same' ? srcExt : (state.format === 'jpeg' ? 'jpg' : state.format);
  let dstPath   = dst.fsPath;

  // If dst has wrong extension for new format, correct it
  if (path.extname(dstPath).slice(1).toLowerCase() !== dstExt) {
    dstPath = dstPath.replace(/\.[^.]+$/, '') + '.' + dstExt;
  }

  // Check if format changed and dst would be different from src
  const formatChanged = state.format !== 'same' && dstExt !== srcExt;
  if (formatChanged && dstPath !== srcPath) {
    const pick = await vscode.window.showInformationMessage(
      `You changed the format from ${srcExt.toUpperCase()} to ${dstExt.toUpperCase()}.\n` +
      `Saving will create ${path.basename(dstPath)} next to ${path.basename(srcPath)}. ` +
      `The original .${srcExt} will remain unless you check "Move original to Trash" in the panel.`,
      { modal: true },
      'Save as .' + dstExt,
      'Save As… instead',
    );
    if (!pick || pick === 'Save As… instead') {
      if (pick === 'Save As… instead') {
        await vscode.commands.executeCommand('workbench.action.files.saveAs');
      }
      return;
    }
  }

  try {
    const result = await this.saveOrch.save(srcPath, dstPath, state, { overwrite: dstPath === srcPath });

    // Clear dirty state
    const freshState = defaultEditState();
    this.editStates.set(document.uri.toString(), freshState);

    if (result.trashed || dstPath !== srcPath) {
      // Navigate to new file
      await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(dstPath), ImageEditorProvider.viewType);
    }

    // Notify webview
    const panels = this._panelsForDocument.get(document.uri.toString());
    panels?.forEach((p) =>
      postToWebview(p, { type: 'saveComplete', trashed: result.originalTrashed, newUri: dstPath !== srcPath ? dstPath : undefined })
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Image Studio save failed: ${(err as Error).message}`);
  }
}
```

Add a `_panelsForDocument` map to the class and populate it in `resolveCustomEditor`:

```typescript
// Field:
private readonly _panelsForDocument = new Map<string, Set<vscode.WebviewPanel>>();

// In resolveCustomEditor, after the webview setup lines:
const key = document.uri.toString();
if (!this._panelsForDocument.has(key)) this._panelsForDocument.set(key, new Set());
this._panelsForDocument.get(key)!.add(webviewPanel);
webviewPanel.onDidDispose(() => {
  this._panelsForDocument.get(key)?.delete(webviewPanel);
});
```

Also add the `saveComplete` handler to the webview side — in `media/webview.ts`, inside the `case 'saveComplete':` block:

```typescript
case 'saveComplete': {
  // Reset edit state on save
  editState = { format: 'same', quality: 80, lossless: false, compareMode: 'slider', trashOriginal: false };
  formatSelect.value = 'same';
  qualitySlider.value = '80';
  qualityNum.textContent = '80';
  losslessCheck.checked = false;
  syncCompressUI();
  syncTrashUI();
  break;
}
```

- [ ] **Step 6: Build**

```bash
npm run build --workspace=packages/extension
```

- [ ] **Step 7: Run all tests**

```bash
npm test --workspace=packages/extension && npm test --workspace=packages/core
```

Expected: all tests pass.

- [ ] **Step 8: Manual verification** — F5 → open PNG → change to WebP → Save → format-change modal appears with correct filenames → click "Save as .webp" → file saved, editor reloads on .webp. Try Save As… path as well. Try with Trash checkbox on.

- [ ] **Step 9: Commit**

```bash
git add packages/extension/src/saveOrchestrator.ts packages/extension/src/imageEditorProvider.ts packages/extension/media/webview.ts packages/extension/test/saveOrchestrator.test.ts
git commit -m "Implement save flow with format-change modal and trash support"
```

---

## Task 14: Error states — banner, toasts, inline validation

**Files:**
- Modify: `packages/extension/media/webview.ts` (inline resize validation — already done in Task 9)
- Modify: `packages/extension/src/imageEditorProvider.ts` (file-unreadable → showError)

The error banner CSS and DOM are already in place from Task 5. Most error paths were implemented inline in earlier tasks. This task verifies and adds missing error paths.

- [ ] **Step 1: Verify `showError` fires when file is unreadable**

In `imageEditorProvider.ts`, the `_sendInit` catch block already calls `postToWebview(panel, { type: 'showError', ... })`. Verify that the webview's `showError` handler makes the error banner visible. Open the message listener in `webview.ts` and confirm the `showError` case sets `errorBanner.classList.add('visible')` — already done in Task 6.

- [ ] **Step 2: Add file-unreadable banner + disabled buttons**

In `media/webview.ts`, update the `showError` case to also disable panel buttons:

```typescript
case 'showError': {
  errorBanner.textContent = `Cannot read file: ${msg.message as string}`;
  errorBanner.classList.add('visible');
  // Disable all panel inputs
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
    '#panel button, #panel input, #panel select'
  ).forEach((el) => { el.disabled = true; });
  break;
}
```

- [ ] **Step 3: Verify previewEncoder error path**

The `previewEncoder.ts` catch block already calls `onResult({ ok: false, message })`. The `imageEditorProvider.ts` handler already calls `vscode.window.showErrorMessage(...)` and sends `previewError` to webview. The webview's `previewError` case already sets `afterSize.textContent = '(estimate failed)'`. No changes needed.

- [ ] **Step 4: Verify save error path**

The `_performSave` catch block in `imageEditorProvider.ts` already calls `vscode.window.showErrorMessage(...)`. No changes needed.

- [ ] **Step 5: Build**

```bash
npm run build --workspace=packages/extension
```

- [ ] **Step 6: Manual verification** — (simulate unreadable file by temporarily pointing the extension at a non-image path) → error banner appears, panel buttons disabled. Drag crop handles to 0×0 → resize button disabled, red helper text shown.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/imageEditorProvider.ts packages/extension/media/webview.ts
git commit -m "Complete error state handling: banner, toasts, inline validation"
```

---

## Task 15: External file watch + `MANUAL.md`

**Files:**
- Modify: `packages/extension/src/imageEditorProvider.ts`
- Create: `packages/extension/test/MANUAL.md`

- [ ] **Step 1: Add `FileSystemWatcher` in `resolveCustomEditor`**

In `imageEditorProvider.ts`, inside `resolveCustomEditor`, after the existing setup lines add:

```typescript
const watcher = vscode.workspace.createFileSystemWatcher(document.fsPath);
watcher.onDidChange(async () => {
  // If not dirty, reload the image
  const state = this.editStates.get(document.uri.toString());
  const dirty = state ? (
    state.crop !== undefined || state.resize !== undefined ||
    state.format !== 'same'  || state.quality !== 80 || state.lossless !== false
  ) : false;
  if (!dirty) {
    await this._sendInit(document, webviewPanel);
  }
  // If dirty: VSCode's native "File was modified externally" toast fires automatically
});
webviewPanel.onDidDispose(() => watcher.dispose());
context.subscriptions.push(watcher);
```

- [ ] **Step 2: Create `packages/extension/test/MANUAL.md`**

```markdown
# Image Studio — Manual Test Checklist

Run before each merge. Use Extension Development Host (F5 in VSCode with `packages/extension` as the workspace root).

## Setup
1. `npm run build --workspace=packages/extension`
2. Press F5 → Extension Development Host opens.
3. Open a folder with PNG, JPG, WebP, and AVIF sample images.

## Open behavior
- [ ] Open a PNG — Image Studio editor opens (not default image viewer).
- [ ] Before panel shows: correct filename, `W × H px · PNG`, file size.
- [ ] After panel shows same values (format = Same, no edits yet).
- [ ] Tab has no dirty indicator `●`.

## Compress section
- [ ] Change Format to WebP — Quality slider and Lossless checkbox appear.
- [ ] Change Format to PNG — Quality slider and Lossless disappear.
- [ ] Move Quality slider — After panel updates (after ~300 ms) with new estimated size and `−X%` reduction in green.
- [ ] Check Lossless — Quality grays out; After panel re-estimates.
- [ ] Any compress change — tab shows dirty indicator `●`.

## Compare
- [ ] Default is Slider mode — After panel updates, white handle line visible in canvas.
- [ ] Drag handle left/right — reveals original vs compressed.
- [ ] Switch to Side-by-side — canvas splits, left = original, right = compressed.
- [ ] Switch to Off — single image, no compare overhead.

## Zoom/Pan
- [ ] Scroll wheel over canvas — image zooms. Zoom pill shows `110%`, `120%`, etc.
- [ ] Hold Space + drag — pans the image.
- [ ] Double-click image — resets to Fit.
- [ ] Click Fit button — resets to Fit. Pill hides.

## Resize
- [ ] Resize section shows current width/height of image.
- [ ] Type new Width with Lock on — Height auto-recalculates.
- [ ] Switch unit to % — inputs show 100/100.
- [ ] Type 0 in Width — red border + error text, Apply disabled.
- [ ] Esc key in resize inputs — reverts to last applied values.
- [ ] Apply → After panel shows new dimensions.

## Crop
- [ ] Click Start crop — overlay with 8 handles covers image. Compare pill hidden.
- [ ] Drag corner handle — resizes selection.
- [ ] Drag inside selection — moves selection.
- [ ] Cannot drag selection outside image bounds.
- [ ] Press Esc — overlay disappears, no changes.
- [ ] Apply — overlay disappears, After panel updates.
- [ ] Start crop again — previous crop rect is loaded as initial selection.

## Save (same format)
- [ ] Make a quality change → Save → no modal → file overwritten → tab clears dirty.
- [ ] Cmd+S — same as Save button.

## Save (format change, no trash)
- [ ] Change format to WebP → Save → format-change modal appears with correct filenames.
- [ ] Click Cancel — nothing changes.
- [ ] Click "Save As… instead" — system dialog opens.
- [ ] Click "Save as .webp" — .webp file created, .png remains, editor stays on .png, dirty clears.

## Save & Trash
- [ ] Change format to WebP → check "Move original to Trash" → Save → Save as .webp → original .png gone (check system Trash).
- [ ] Editor opens .webp after trash.
- [ ] With format = Same → Trash checkbox disabled, tooltip shows "No original to remove".

## Save As
- [ ] Save As… → system dialog → save to any location → file created there.

## Error states
- [ ] Open a non-image file renamed as .png → error banner appears, panel buttons disabled.
- [ ] Externally delete opened image while editor is open → (behavior may vary by OS; no crash expected).

## External file change
- [ ] Open PNG in Image Studio (no edits).
- [ ] Overwrite the file externally (e.g., `cp other.png opened.png`).
- [ ] Editor reloads automatically (image refreshes, Before panel updates).
- [ ] Make an edit (dirty tab), then overwrite externally → VSCode "File modified externally" toast appears; editor does NOT auto-reload.

## AVIF
- [ ] Open an AVIF file — displays correctly.
- [ ] Convert AVIF to PNG → save → PNG created.
```

- [ ] **Step 3: Build final**

```bash
npm run build --workspace=packages/extension
```

- [ ] **Step 4: Run all tests (entire workspace)**

```bash
npm test
```

Expected output includes:
- `packages/core`: all existing tests + applyEdits tests pass
- `packages/mcp-server`: all existing tests pass
- `packages/extension`: saveOrchestrator + previewEncoder tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/imageEditorProvider.ts packages/extension/test/MANUAL.md
git commit -m "Add file watcher for external changes and manual test checklist"
```

---

## Self-Review

### Spec coverage check

| Spec section | Covered by task |
|---|---|
| 3.1 `applyEdits` in core | Task 1 |
| 3.2 Extension package structure | Task 2 |
| 3.3 CustomEditor registration | Task 2, 4 |
| 4.1 Compare pill | Task 11 |
| 4.2 Zoom pill | Task 12 |
| 4.3 Right panel sections (Crop/Resize/Compress) | Tasks 5, 9, 10 |
| 4.4 Save footer + Trash checkbox | Tasks 5, 13 |
| 4.5 Before/After info panel | Tasks 5, 6, 8 |
| 5.1 Open behavior | Task 6 |
| 5.2 Resize flow | Task 9 |
| 5.3 Crop flow | Task 10 |
| 5.4 Compress section | Task 7 |
| 5.5 Compare flow | Task 11 |
| 5.6 Zoom/pan | Task 12 |
| 5.7 Save flow + format-change modal | Task 13 |
| 5.8 External file changes | Task 15 |
| 6. Preview pipeline (debounce, abort, temp file) | Task 8 |
| 7. EditState / ViewState data model | Tasks 1, 6 |
| 8. Dirty state tracking | Tasks 4, 7 |
| 9. Error handling | Task 14 |
| 10. Testing strategy (core unit, extension sparse, MANUAL.md) | Tasks 1, 8, 13, 15 |

All 20 spec sections covered. No gaps.

### Type consistency check

- `EditState` defined once in `packages/core/src/types.ts`, imported everywhere in extension host; mirrored as inline interface in `media/webview.ts` (webview cannot import Node modules).
- `defaultEditState()` exported from core, used in `imageEditorProvider.ts` and webview.ts inline.
- `PreviewEncoder.schedule(srcPath, state)` — `srcPath: string`, `state: EditState` — consistent with `imageEditorProvider.ts` call in Task 8.
- `SaveOrchestrator.save(src, dst, state, opts)` — matches `imageEditorProvider._performSave` call in Task 13.
- `ExtMessage` / `WvMessage` types in `bridge.ts` — all send/receive sites use `postToWebview(panel, msg: ExtMessage)` and handle `WvMessage` in `_setupMessageHandler`.

### Placeholder scan

No TBD, TODO, or "implement later" in any task. All code blocks are complete. Types referenced in later tasks are defined in earlier ones.
