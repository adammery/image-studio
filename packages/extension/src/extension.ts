import * as vscode from 'vscode';
import { ImageEditorProvider } from './imageEditorProvider.js';
import { ImageTreeProvider } from './imageTreeProvider.js';

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

  // Activity Bar view: list of images in the workspace
  const treeProvider = new ImageTreeProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('imageStudio.files', {
      treeDataProvider: treeProvider,
      showCollapseAll: false,
    }),
  );

  // Refresh tree when image files are added / removed / renamed
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{png,jpg,jpeg,webp,avif,PNG,JPG,JPEG,WEBP,AVIF}',
  );
  watcher.onDidCreate(() => treeProvider.refresh());
  watcher.onDidDelete(() => treeProvider.refresh());
  context.subscriptions.push(watcher);

  // Refresh when workspace folders change (e.g., user opens a folder)
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => treeProvider.refresh()),
  );
}

export function deactivate(): void {}
