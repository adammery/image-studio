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
