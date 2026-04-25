import * as path from 'node:path';

export class SelectionStore {
  private readonly _set = new Set<string>();
  reviewMode = false;

  get size(): number { return this._set.size; }

  get distinctFolderCount(): number {
    const folders = new Set<string>();
    for (const p of this._set) folders.add(path.dirname(p));
    return folders.size;
  }

  has(p: string): boolean { return this._set.has(p); }

  add(p: string): void { this._set.add(p); }

  remove(p: string): void { this._set.delete(p); }

  toggle(p: string): void {
    if (this._set.has(p)) this._set.delete(p);
    else this._set.add(p);
  }

  clear(): void {
    this._set.clear();
    this.reviewMode = false;
  }

  toArray(): string[] { return [...this._set]; }
}
