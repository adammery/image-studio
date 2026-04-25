import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';

const IMAGE_GLOB = '**/*.{png,jpg,jpeg,webp,avif,PNG,JPG,JPEG,WEBP,AVIF}';

export interface ImageEntry {
  fsPath: string;
  basename: string;
  ext: string;             // lowercase, no leading dot: 'png' / 'jpg' / 'webp' / 'avif'
  size: number;            // bytes
  folderRel: string;       // relative folder path from workspace root, e.g. 'images' or 'assets/icons'
}

export interface ScanResult {
  /** Distinct folder relative paths, sorted, that contain ≥1 image. */
  folders: string[];
  /** Every image grouped by folderRel for fast filtering. */
  images: ImageEntry[];
}

function buildExcludeGlob(): string {
  const cfg = vscode.workspace.getConfiguration('imageStudio');
  const folders = cfg.get<string[]>('excludeFolders', ['node_modules', '.git', 'dist', 'out', 'build']);
  if (!folders.length) return '';
  return `**/{${folders.join(',')}}/**`;
}

export async function scanWorkspaceImages(): Promise<ScanResult> {
  const roots = vscode.workspace.workspaceFolders;
  if (!roots?.length) return { folders: [], images: [] };

  const uris = await vscode.workspace.findFiles(IMAGE_GLOB, buildExcludeGlob());

  const images: ImageEntry[] = [];
  const folderSet = new Set<string>();

  for (const uri of uris) {
    const root = roots.find((r) => {
      const rootPrefix = r.uri.fsPath.endsWith(path.sep) ? r.uri.fsPath : r.uri.fsPath + path.sep;
      return uri.fsPath.startsWith(rootPrefix);
    });
    if (!root) continue;
    let folderRel = path.relative(root.uri.fsPath, path.dirname(uri.fsPath));
    if (folderRel === '') folderRel = '.';
    let size = 0;
    try { size = (await fsp.stat(uri.fsPath)).size; } catch { /* file vanished */ continue; }
    images.push({
      fsPath: uri.fsPath,
      basename: path.basename(uri.fsPath),
      ext: path.extname(uri.fsPath).slice(1).toLowerCase(),
      size,
      folderRel,
    });
    folderSet.add(folderRel);
  }

  return {
    folders: [...folderSet].sort((a, b) => a.localeCompare(b)),
    images: images.sort((a, b) => a.fsPath.localeCompare(b.fsPath)),
  };
}
