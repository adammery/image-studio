import * as vscode from 'vscode';
import * as path from 'node:path';

const IMAGE_GLOB = '**/*.{png,jpg,jpeg,webp,avif,PNG,JPG,JPEG,WEBP,AVIF}';

function buildExcludeGlob(): string {
  const cfg = vscode.workspace.getConfiguration('imageStudio');
  const folders = cfg.get<string[]>('excludeFolders', ['node_modules', '.git', 'dist', 'out', 'build']);
  if (!folders.length) return '';
  return `**/{${folders.join(',')}}/**`;
}

type NodeKind = 'workspace' | 'folder' | 'file';

interface Node {
  kind: NodeKind;
  uri: vscode.Uri;
}

export class ImageTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChange = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private files: vscode.Uri[] | null = null;

  async getChildren(element?: Node): Promise<Node[]> {
    const roots = vscode.workspace.workspaceFolders;
    if (!roots?.length) return [];

    if (!this.files) {
      this.files = await vscode.workspace.findFiles(IMAGE_GLOB, buildExcludeGlob());
    }

    // Root level
    if (!element) {
      if (roots.length === 1) {
        // Single workspace folder → show its direct contents
        return this._childrenOf(roots[0].uri.fsPath);
      }
      // Multi-root → show each root as a workspace node
      return roots.map((r) => ({ kind: 'workspace' as const, uri: r.uri }));
    }

    // Expanding a folder or workspace node → show its direct contents
    return this._childrenOf(element.uri.fsPath);
  }

  private _childrenOf(folderPath: string): Node[] {
    if (!this.files) return [];
    const folders = new Set<string>();
    const files: vscode.Uri[] = [];
    const prefix = folderPath.endsWith(path.sep) ? folderPath : folderPath + path.sep;

    for (const f of this.files) {
      if (!f.fsPath.startsWith(prefix)) continue;
      const rel = f.fsPath.slice(prefix.length);
      const segs = rel.split(path.sep);
      if (segs.length === 1) {
        files.push(f);
      } else {
        folders.add(path.join(folderPath, segs[0]));
      }
    }

    const folderNodes: Node[] = [...folders]
      .sort((a, b) => a.localeCompare(b))
      .map((p) => ({ kind: 'folder', uri: vscode.Uri.file(p) }));
    const fileNodes: Node[] = files
      .sort((a, b) => a.fsPath.localeCompare(b.fsPath))
      .map((uri) => ({ kind: 'file', uri }));

    return [...folderNodes, ...fileNodes];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'file') {
      const item = new vscode.TreeItem(node.uri, vscode.TreeItemCollapsibleState.None);
      item.label = path.basename(node.uri.fsPath);
      item.tooltip = node.uri.fsPath;
      item.command = {
        command: 'vscode.openWith',
        title: 'Open in Image Studio',
        arguments: [node.uri, 'imageStudio.editor'],
      };
      // resourceUri set automatically from TreeItem constructor → file icon theme applies
      return item;
    }
    // Folder or workspace node
    const item = new vscode.TreeItem(node.uri, vscode.TreeItemCollapsibleState.Collapsed);
    item.label = path.basename(node.uri.fsPath) || node.uri.fsPath;
    item.tooltip = node.uri.fsPath;
    item.iconPath = new vscode.ThemeIcon(node.kind === 'workspace' ? 'root-folder' : 'folder');
    return item;
  }

  refresh(): void {
    this.files = null;
    this._onDidChange.fire();
  }
}
