import * as vscode from 'vscode';
import { getImageInfo, defaultEditState, applyEdits } from '@image-studio/core';
import type { EditState } from '@image-studio/core';
import { getWebviewContent, postToWebview } from './webviewContent.js';
import type { WvMessage } from './bridge.js';
import { PreviewEncoder } from './previewEncoder.js';
import * as path from 'node:path';

export interface ImageDocument extends vscode.CustomDocument {
  readonly fsPath: string;
}

export class ImageEditorProvider implements vscode.CustomEditorProvider<ImageDocument> {
  public static readonly viewType = 'imageStudio.editor';

  private readonly editStates = new Map<string, EditState>();
  private readonly _panelsForDocument = new Map<string, Set<vscode.WebviewPanel>>();
  private readonly encoders = new Map<string, PreviewEncoder>();

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentContentChangeEvent<ImageDocument>
  >();
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

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
        vscode.Uri.file(path.dirname(document.fsPath)),
      ],
    };
    webviewPanel.webview.html = getWebviewContent(webviewPanel.webview, this.context.extensionUri);

    const key = document.uri.toString();
    if (!this._panelsForDocument.has(key)) this._panelsForDocument.set(key, new Set());
    this._panelsForDocument.get(key)!.add(webviewPanel);

    const encoder = new PreviewEncoder((result) => {
      if (result.ok) {
        postToWebview(webviewPanel, { type: 'previewReady', previewDataUrl: result.previewDataUrl, size: result.size, width: result.width, height: result.height });
      } else {
        postToWebview(webviewPanel, { type: 'previewError', message: result.message });
        vscode.window.showErrorMessage(`Image Studio preview: ${result.message}`);
      }
    });
    this.encoders.set(key, encoder);

    webviewPanel.onDidDispose(() => {
      this._panelsForDocument.get(key)?.delete(webviewPanel);
      this.editStates.delete(key);
      encoder.dispose();
      this.encoders.delete(key);
    });

    this._setupMessageHandler(document, webviewPanel);
    this._setupFileWatcher(document, webviewPanel);
    await this._sendInit(document, webviewPanel);
  }

  private _setupFileWatcher(document: ImageDocument, panel: vscode.WebviewPanel): void {
    const watcher = vscode.workspace.createFileSystemWatcher(document.fsPath);
    watcher.onDidChange(async () => {
      await this._sendInit(document, panel);
    });
    panel.onDidDispose(() => watcher.dispose());
    this.context.subscriptions.push(watcher);
  }

  async saveCustomDocument(
    _document: ImageDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    // Intentional no-op: save only happens via the in-panel Save button.
    // VSCode's Cmd+S / autoSave / saveAll must not trigger image re-encoding.
  }

  async saveCustomDocumentAs(
    _document: ImageDocument,
    _destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    // Intentional no-op: Save As flows through the webview's own Save As… button,
    // which uses vscode.window.showSaveDialog directly.
  }

  async revertCustomDocument(
    _document: ImageDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    // No backup in Plan 2.
  }

  private async _sendInit(document: ImageDocument, panel: vscode.WebviewPanel): Promise<void> {
    try {
      const meta = await getImageInfo(document.fsPath);
      const imageUri = panel.webview.asWebviewUri(vscode.Uri.file(document.fsPath)).toString();
      const editState = defaultEditState();
      const config = vscode.workspace.getConfiguration('imageStudio');
      const configCompareMode = config.get<string>('defaultCompareMode', 'off');
      const configQuality     = config.get<number>('defaultQuality', 92);
      // User's last choice in this session wins; fall back to config default.
      editState.compareMode = (this.context.globalState.get<string>('compareMode', configCompareMode)) as EditState['compareMode'];
      editState.quality     = configQuality;
      postToWebview(panel, { type: 'init', imageUri, meta, editState });
    } catch (err) {
      postToWebview(panel, { type: 'showError', message: (err as Error).message });
    }
  }

  private _setupMessageHandler(document: ImageDocument, panel: vscode.WebviewPanel): void {
    panel.webview.onDidReceiveMessage(async (msg: WvMessage) => {
      switch (msg.type) {
        case 'editStateChanged':
          this.editStates.set(document.uri.toString(), msg.state);
          this.encoders.get(document.uri.toString())?.schedule(document.fsPath, msg.state);
          this.context.globalState.update('compareMode', msg.state.compareMode);
          break;
        case 'save': {
          const state = { ...(this.editStates.get(document.uri.toString()) ?? defaultEditState()), trashOriginal: msg.trashOriginal };
          const dstUri = this._buildDstUri(document, state, msg.filename);
          await this._performSave(document, dstUri, state);
          break;
        }
        case 'saveAs': {
          const state = this.editStates.get(document.uri.toString()) ?? defaultEditState();
          const defaultUri = this._buildDstUri(document, state, msg.filename);
          const picked = await vscode.window.showSaveDialog({
            defaultUri,
            filters: { Image: ['png', 'jpg', 'jpeg', 'webp', 'avif'] },
          });
          if (picked) await this._performSave(document, picked, state);
          break;
        }
      }
    });
  }

  private _buildDstUri(document: ImageDocument, state: EditState, rawFilename: string): vscode.Uri {
    const srcExt = path.extname(document.fsPath).slice(1).toLowerCase();
    const dstExt = state.format === 'same' ? srcExt : (state.format === 'jpeg' ? 'jpg' : state.format);
    const srcBase = path.basename(document.fsPath, path.extname(document.fsPath));
    const cleaned = rawFilename
      .replace(/[\\/\x00-\x1f]/g, '')
      .replace(/\.(png|jpe?g|webp|avif)$/i, '')
      .trim();
    const name = cleaned.length > 0 ? cleaned : srcBase;
    return vscode.Uri.file(path.join(path.dirname(document.fsPath), `${name}.${dstExt}`));
  }

  private async _performSave(
    document: ImageDocument,
    dst: vscode.Uri,
    state: EditState,
  ): Promise<void> {
    const srcPath = document.fsPath;
    const srcExt  = path.extname(srcPath).slice(1).toLowerCase();
    const dstExt  = state.format === 'same' ? srcExt : (state.format === 'jpeg' ? 'jpg' : state.format);
    let dstPath   = dst.fsPath;

    // Correct extension for format change (always, even when dst === src)
    if (path.extname(dstPath).slice(1).toLowerCase() !== dstExt) {
      dstPath = dstPath.replace(/\.[^.]+$/, '') + '.' + dstExt;
    }

    const formatChanged = state.format !== 'same' && dstExt !== srcExt;
    if (formatChanged && dstPath !== srcPath) {
      const pick = await vscode.window.showInformationMessage(
        `Create ${path.basename(dstPath)}?`,
        {
          modal: true,
          detail: state.trashOriginal
            ? `Original .${srcExt} will be moved to Trash.`
            : `Original .${srcExt} will stay.`,
        },
        'Save',
        'Save As…',
      );
      if (!pick) return;
      if (pick === 'Save As…') {
        const picked = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(dstPath),
          filters: { Image: ['png', 'jpg', 'jpeg', 'webp', 'avif'] },
        });
        if (!picked) return;
        dstPath = picked.fsPath;
      }
    }

    try {
      const result = await applyEdits(srcPath, dstPath, state, { overwrite: dstPath === srcPath });

      const freshState = defaultEditState();
      this.editStates.set(document.uri.toString(), freshState);

      const panels = this._panelsForDocument.get(document.uri.toString());
      panels?.forEach((p) =>
        postToWebview(p, { type: 'saveComplete', trashed: result.originalTrashed }),
      );

      if (dstPath !== srcPath) {
        await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(dstPath), ImageEditorProvider.viewType);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Image Studio save failed: ${(err as Error).message}`);
    }
  }
}
