import * as vscode from 'vscode';
import * as path from 'node:path';
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

  // Refresh when our settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('imageStudio.excludeFolders')) treeProvider.refresh();
    }),
  );

  // Delete command: trash the image in the active Image Studio tab
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
