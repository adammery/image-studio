import * as vscode from 'vscode';
import { getImageInfo, defaultEditState } from '@image-studio/core';
import type { EditState } from '@image-studio/core';
import { getWebviewContent, postToWebview } from './webviewContent.js';
import type { WvMessage } from './bridge.js';
import { PreviewEncoder } from './previewEncoder.js';
import { SaveOrchestrator } from './saveOrchestrator.js';
import * as path from 'node:path';

export interface ImageDocument extends vscode.CustomDocument {
  readonly fsPath: string;
}

export class ImageEditorProvider implements vscode.CustomEditorProvider<ImageDocument> {
  public static readonly viewType = 'imageStudio.editor';

  private readonly editStates = new Map<string, EditState>();
  private readonly _panelsForDocument = new Map<string, Set<vscode.WebviewPanel>>();
  private readonly encoders = new Map<string, PreviewEncoder>();
  private readonly saveOrch = new SaveOrchestrator();

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
        vscode.Uri.file(document.fsPath).with({ path: document.uri.path.replace(/[^/]+$/, '') }),
        this.context.globalStorageUri,
      ],
    };
    webviewPanel.webview.html = getWebviewContent(webviewPanel.webview, this.context.extensionUri);

    const key = document.uri.toString();
    if (!this._panelsForDocument.has(key)) this._panelsForDocument.set(key, new Set());
    this._panelsForDocument.get(key)!.add(webviewPanel);

    const encoder = new PreviewEncoder(this.context, (result) => {
      if (result.ok) {
        const previewUri = webviewPanel.webview.asWebviewUri(
          vscode.Uri.file(result.previewUri),
        ).toString();
        postToWebview(webviewPanel, { type: 'previewReady', previewUri, size: result.size, width: result.width, height: result.height });
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
      const state = this.editStates.get(document.uri.toString());
      const dirty = state ? (
        state.crop !== undefined || state.resize !== undefined ||
        state.format !== 'same'  || state.quality !== 80 || state.lossless !== false
      ) : false;
      if (!dirty) await this._sendInit(document, panel);
      // If dirty: VSCode's native "File was modified externally" toast fires automatically
    });
    panel.onDidDispose(() => watcher.dispose());
    this.context.subscriptions.push(watcher);
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
    // No backup in Plan 2.
  }

  private async _sendInit(document: ImageDocument, panel: vscode.WebviewPanel): Promise<void> {
    try {
      const meta = await getImageInfo(document.fsPath);
      const imageUri = panel.webview.asWebviewUri(vscode.Uri.file(document.fsPath)).toString();
      postToWebview(panel, { type: 'init', imageUri, meta, editState: defaultEditState() });
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
          this.encoders.get(document.uri.toString())?.schedule(document.fsPath, msg.state);
          break;
        case 'save':
          await this._performSave(
            document,
            document.uri,
            { ...(this.editStates.get(document.uri.toString()) ?? defaultEditState()), trashOriginal: msg.trashOriginal },
          );
          break;
        case 'saveAs':
          await vscode.commands.executeCommand('workbench.action.files.saveAs');
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
    const srcPath = document.fsPath;
    const srcExt  = path.extname(srcPath).slice(1).toLowerCase();
    const dstExt  = state.format === 'same' ? srcExt : (state.format === 'jpeg' ? 'jpg' : state.format);
    let dstPath   = dst.fsPath;

    // Correct extension if needed
    if (path.extname(dstPath).slice(1).toLowerCase() !== dstExt && dstPath !== srcPath) {
      dstPath = dstPath.replace(/\.[^.]+$/, '') + '.' + dstExt;
    }

    const formatChanged = state.format !== 'same' && dstExt !== srcExt;
    if (formatChanged && dstPath !== srcPath) {
      const pick = await vscode.window.showInformationMessage(
        `You changed the format from ${srcExt.toUpperCase()} to ${dstExt.toUpperCase()}.\n` +
        `Saving will create ${path.basename(dstPath)}. ` +
        `The original .${srcExt} will remain unless "Move original to Trash" is checked.`,
        { modal: true },
        `Save as .${dstExt}`,
        'Save As… instead',
      );
      if (!pick) return;
      if (pick === 'Save As… instead') {
        await vscode.commands.executeCommand('workbench.action.files.saveAs');
        return;
      }
    }

    try {
      const result = await this.saveOrch.save(srcPath, dstPath, state, { overwrite: dstPath === srcPath });

      const freshState = defaultEditState();
      this.editStates.set(document.uri.toString(), freshState);

      const panels = this._panelsForDocument.get(document.uri.toString());
      panels?.forEach((p) =>
        postToWebview(p, { type: 'saveComplete', trashed: result.originalTrashed, newUri: dstPath !== srcPath ? dstPath : undefined }),
      );

      if (dstPath !== srcPath) {
        await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(dstPath), ImageEditorProvider.viewType);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Image Studio save failed: ${(err as Error).message}`);
    }
  }
}
