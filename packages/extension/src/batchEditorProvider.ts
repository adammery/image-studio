import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { applyEdits, defaultEditState } from '@image-studio/core';
import { getBatchWebviewContent, postToBatchWebview } from './batchWebviewContent.js';
import { scanWorkspaceImages } from './batchScanner.js';
import { BatchEstimator } from './batchEstimator.js';
import type { BatchWvMessage } from './batchBridge.js';
import { detectConflicts, computeTargetPath, type TargetFormat } from './conflictDetection.js';

export interface BatchDocument extends vscode.CustomDocument {}

export class BatchEditorProvider implements vscode.CustomReadonlyEditorProvider<BatchDocument> {
  public static readonly viewType = 'imageStudio.batchView';
  /** Synthetic untitled URI used when opening the batch view. */
  public static readonly virtualUri = vscode.Uri.parse('untitled:image-studio-batch.batch');

  private readonly estimators = new Map<vscode.WebviewPanel, BatchEstimator>();
  private readonly cancelTokens = new Map<vscode.WebviewPanel, { cancelled: boolean }>();

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

    const estimator = new BatchEstimator((srcPath, result) => {
      postToBatchWebview(panel, { type: 'estimate', srcPath, result });
    });
    this.estimators.set(panel, estimator);

    panel.onDidDispose(() => {
      this.estimators.get(panel)?.dispose();
      this.estimators.delete(panel);
      this.cancelTokens.delete(panel);
    });

    panel.webview.onDidReceiveMessage(async (msg: BatchWvMessage) => {
      switch (msg.type) {
        case 'estimateRequest': {
          for (const srcPath of msg.srcPaths) estimator.schedule(srcPath, msg.settings);
          break;
        }
        case 'estimateInvalidate': {
          // No explicit invalidation needed: estimator's cache key includes settings,
          // so a settings change naturally produces a cache miss.
          break;
        }
        case 'preflightRequest': {
          const conflicts = detectConflicts(msg.selected, msg.settings.format);
          // Filter out conflicts that are actually overwrite-in-place on
          // case-insensitive filesystems (foo.PNG → foo.png, same inode).
          const realConflicts = conflicts.filter((c) => {
            try {
              const srcStat = fs.statSync(c.src);
              const dstStat = fs.statSync(c.dst);
              return srcStat.ino !== dstStat.ino;
            } catch {
              return true; // if stat fails, treat as a real conflict
            }
          });
          if (realConflicts.length === 0) {
            void this._runConvert(panel, msg.selected, msg.settings, msg.trashOriginals, 'overwrite');
            return;
          }
          const list = realConflicts.slice(0, 5).map((c) => `• ${path.basename(c.dst)}`).join('\n');
          const more = realConflicts.length > 5 ? `\n…and ${realConflicts.length - 5} more` : '';
          const choice = await vscode.window.showWarningMessage(
            `${realConflicts.length} of ${msg.selected.length} selected images would replace an existing file:`,
            { modal: true, detail: `${list}${more}` },
            'Skip these',
            'Overwrite all',
          );
          if (!choice) return;
          const policy: 'skip' | 'overwrite' = choice === 'Skip these' ? 'skip' : 'overwrite';
          // For 'skip', drop only the REAL conflicts (overwrite-in-place files keep going)
          const conflictSrcs = new Set(realConflicts.map((c) => c.src));
          const work = policy === 'skip' ? msg.selected.filter((s) => !conflictSrcs.has(s)) : msg.selected;
          void this._runConvert(panel, work, msg.settings, msg.trashOriginals, 'overwrite');
          break;
        }
        case 'convertCancel': {
          const token = this.cancelTokens.get(panel);
          if (token) token.cancelled = true;
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

  private async _runConvert(
    panel: vscode.WebviewPanel,
    work: string[],
    settings: { format: TargetFormat; quality: number; lossless: boolean },
    trashOriginals: boolean,
    _conflictPolicy: 'skip' | 'overwrite',
  ): Promise<void> {
    postToBatchWebview(panel, { type: 'convertStarted', total: work.length });
    const token = { cancelled: false };
    this.cancelTokens.set(panel, token);

    let converted = 0;
    let failed = 0;
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
        if (trashOriginals && dst !== src) {
          try { await trashFn(src); } catch { /* trash failures are non-fatal */ }
        }
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
    postToBatchWebview(panel, { type: 'convertDone', converted, failed, skipped: 0 });
    vscode.window.showInformationMessage(
      `Batch convert: ${converted} converted${failed ? `, ${failed} failed` : ''}`,
    );
  }
}
