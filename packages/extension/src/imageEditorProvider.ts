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

  private readonly editStates = new Map<string, EditState>();
  private readonly _panelsForDocument = new Map<string, Set<vscode.WebviewPanel>>();

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
    webviewPanel.onDidDispose(() => {
      this._panelsForDocument.get(key)?.delete(webviewPanel);
      this.editStates.delete(key);
    });

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
    _dst: vscode.Uri,
    _state: EditState,
  ): Promise<void> {
    // Full implementation in Task 13
    void document;
    vscode.window.showInformationMessage('Save: implemented in Task 13');
  }
}
