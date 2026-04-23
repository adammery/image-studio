import * as vscode from 'vscode';
import * as path from 'node:path';

const IMAGE_GLOB = '**/*.{png,jpg,jpeg,webp,avif,PNG,JPG,JPEG,WEBP,AVIF}';
const EXCLUDE_GLOB = '**/{node_modules,.git,dist,out,build}/**';

class ImageItem extends vscode.TreeItem {
  constructor(public readonly resourceUri: vscode.Uri) {
    super(resourceUri, vscode.TreeItemCollapsibleState.None);
    const rel = vscode.workspace.asRelativePath(resourceUri, false);
    const dir = path.dirname(rel);
    this.label = path.basename(resourceUri.fsPath);
    this.description = dir === '.' ? '' : dir;
    this.tooltip = resourceUri.fsPath;
    this.iconPath = new vscode.ThemeIcon('file-media');
    this.command = {
      command: 'vscode.openWith',
      title: 'Open in Image Studio',
      arguments: [resourceUri, 'imageStudio.editor'],
    };
  }
}

export class ImageTreeProvider implements vscode.TreeDataProvider<ImageItem> {
  private readonly _onDidChange = new vscode.EventEmitter<ImageItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  async getChildren(element?: ImageItem): Promise<ImageItem[]> {
    if (element) return [];
    if (!vscode.workspace.workspaceFolders?.length) return [];
    const files = await vscode.workspace.findFiles(IMAGE_GLOB, EXCLUDE_GLOB);
    return files
      .sort((a, b) => a.fsPath.localeCompare(b.fsPath))
      .map((uri) => new ImageItem(uri));
  }

  getTreeItem(item: ImageItem): vscode.TreeItem {
    return item;
  }

  refresh(): void {
    this._onDidChange.fire();
  }
}
