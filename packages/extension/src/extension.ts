import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ImageEditorProvider } from './imageEditorProvider.js';
import { ImageTreeProvider, type Node } from './imageTreeProvider.js';
import { BatchEditorProvider } from './batchEditorProvider.js';

let sidebarClipboard: { op: 'copy' | 'cut'; uri: vscode.Uri } | null = null;

function uniquePath(dir: string, base: string): string {
  let candidate = path.join(dir, base);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    candidate = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Too many duplicate filenames');
}

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
        supportsMultipleEditorsPerDocument: false,
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
  const treeView = vscode.window.createTreeView('imageStudio.files', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  // Track focused file in tree — click opens, Enter renames (Finder-style)
  let activeFileNode: Node | undefined;
  let suppressOpen = false;

  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.treeFileActivated', async (node: Node) => {
      activeFileNode = node;
      if (suppressOpen) return;
      await vscode.commands.executeCommand('vscode.openWith', node.uri, 'imageStudio.editor');
      await treeView.reveal(node, { focus: true, select: true });
    }),
  );

  treeView.onDidChangeSelection((e) => {
    const node = e.selection[0];
    if (node?.kind === 'file') activeFileNode = node;
  });

  async function resolveTreeFocus(): Promise<Node | undefined> {
    suppressOpen = true;
    try {
      await vscode.commands.executeCommand('list.select');
    } finally {
      suppressOpen = false;
    }
    return activeFileNode?.kind === 'file' ? activeFileNode : undefined;
  }

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

  // Rename file from sidebar tree (Enter key or context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.renameFile', async (arg?: Node) => {
      const node = arg ?? await resolveTreeFocus();
      if (!node || node.kind !== 'file') return;
      const oldPath = node.uri.fsPath;
      const dir = path.dirname(oldPath);
      const oldName = path.basename(oldPath);
      const ext = path.extname(oldName);
      const stem = oldName.slice(0, -ext.length);

      const newName = await vscode.window.showInputBox({
        prompt: 'Rename image',
        value: stem,
        valueSelection: [0, stem.length],
      });
      if (!newName || newName === stem) return;

      const newPath = path.join(dir, newName + ext);
      try {
        await vscode.workspace.fs.rename(
          vscode.Uri.file(oldPath),
          vscode.Uri.file(newPath),
          { overwrite: false },
        );
        activeFileNode = { kind: 'file', uri: vscode.Uri.file(newPath) };
      } catch {
        vscode.window.showErrorMessage(`Image Studio: could not rename to "${newName + ext}".`);
      }
    }),
  );

  // Copy/Cut/Paste in the sidebar tree
  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.copyFile', async (arg?: Node) => {
      const node = arg ?? await resolveTreeFocus();
      if (!node || node.kind !== 'file') return;
      sidebarClipboard = { op: 'copy', uri: node.uri };
      vscode.window.setStatusBarMessage(`Image Studio: copied ${path.basename(node.uri.fsPath)}`, 2000);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.cutFile', async (arg?: Node) => {
      const node = arg ?? await resolveTreeFocus();
      if (!node || node.kind !== 'file') return;
      sidebarClipboard = { op: 'cut', uri: node.uri };
      vscode.window.setStatusBarMessage(`Image Studio: cut ${path.basename(node.uri.fsPath)}`, 2000);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.pasteFile', async (arg?: Node) => {
      if (!sidebarClipboard) return;
      const target = arg ?? treeView.selection[0] ?? activeFileNode;
      let targetDir: string;
      if (!target) {
        const root = vscode.workspace.workspaceFolders?.[0];
        if (!root) return;
        targetDir = root.uri.fsPath;
      } else if (target.kind === 'folder' || target.kind === 'workspace') {
        targetDir = target.uri.fsPath;
      } else {
        targetDir = path.dirname(target.uri.fsPath);
      }
      const srcPath = sidebarClipboard.uri.fsPath;
      if (!fs.existsSync(srcPath)) {
        vscode.window.showErrorMessage('Image Studio: source file no longer exists.');
        sidebarClipboard = null;
        return;
      }
      const dstPath = uniquePath(targetDir, path.basename(srcPath));
      try {
        if (sidebarClipboard.op === 'copy') {
          await fs.promises.copyFile(srcPath, dstPath);
        } else {
          await fs.promises.rename(srcPath, dstPath);
          sidebarClipboard = null;
        }
        treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Image Studio: paste failed: ${(err as Error).message}`);
      }
    }),
  );

  // Delete file from sidebar tree (Del key or context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.deleteFile', async (arg?: Node) => {
      const node = arg ?? await resolveTreeFocus();
      if (!node || node.kind !== 'file') return;
      const name = path.basename(node.uri.fsPath);
      const choice = await vscode.window.showWarningMessage(
        `Move "${name}" to Trash?`,
        { modal: true },
        'Move to Trash',
      );
      if (choice !== 'Move to Trash') return;
      try {
        const { default: trash } = await import('trash');
        await trash(node.uri.fsPath);
        activeFileNode = undefined;
      } catch (err) {
        vscode.window.showErrorMessage(`Image Studio: could not delete: ${(err as Error).message}`);
      }
    }),
  );
}

export function deactivate(): void {}
