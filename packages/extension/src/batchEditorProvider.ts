import * as vscode from 'vscode';
import { getBatchWebviewContent, postToBatchWebview } from './batchWebviewContent.js';
import { scanWorkspaceImages } from './batchScanner.js';
import { BatchEstimator } from './batchEstimator.js';
import type { BatchWvMessage } from './batchBridge.js';

export interface BatchDocument extends vscode.CustomDocument {}

export class BatchEditorProvider implements vscode.CustomReadonlyEditorProvider<BatchDocument> {
  public static readonly viewType = 'imageStudio.batchView';
  /** Synthetic untitled URI used when opening the batch view. */
  public static readonly virtualUri = vscode.Uri.parse('untitled:image-studio-batch.batch');

  private readonly estimators = new Map<vscode.WebviewPanel, BatchEstimator>();

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
