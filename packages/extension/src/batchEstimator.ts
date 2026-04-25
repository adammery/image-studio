import sharp from 'sharp';
import * as os from 'node:os';

const DEBOUNCE_MS = 300;

export interface EstimatorSettings {
  format: 'same' | 'png' | 'jpeg' | 'webp' | 'avif';
  quality: number;
  lossless: boolean;
}

export type EstimateResult =
  | { ok: true; size: number }
  | { ok: false; message: string };

interface CachedEntry {
  key: string;
  result: EstimateResult;
}

function cacheKey(srcPath: string, s: EstimatorSettings): string {
  return `${srcPath}|${s.format}|${s.quality}|${s.lossless ? 1 : 0}`;
}

export class BatchEstimator {
  private readonly cache = new Map<string, CachedEntry>();
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inflight = new Set<string>();
  private readonly queue: Array<{ srcPath: string; settings: EstimatorSettings }> = [];
  private readonly concurrency = Math.max(1, os.cpus().length);
  private active = 0;
  private disposed = false;

  constructor(private readonly onResult: (srcPath: string, result: EstimateResult) => void) {}

  has(srcPath: string, s: EstimatorSettings): boolean {
    return this.cache.has(cacheKey(srcPath, s));
  }

  /** Forget any cached entries for this srcPath across all settings. */
  invalidate(srcPath: string): void {
    for (const k of [...this.cache.keys()]) {
      if (k.startsWith(srcPath + '|')) this.cache.delete(k);
    }
  }

  schedule(srcPath: string, settings: EstimatorSettings): void {
    if (this.disposed) return;
    const key = cacheKey(srcPath, settings);
    const cached = this.cache.get(key);
    if (cached) {
      this.onResult(srcPath, cached.result);
      return;
    }
    const existing = this.pending.get(srcPath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pending.delete(srcPath);
      this.queue.push({ srcPath, settings });
      this._drain();
    }, DEBOUNCE_MS);
    this.pending.set(srcPath, timer);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    this.queue.length = 0;
  }

  private _drain(): void {
    while (!this.disposed && this.active < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      void this._run(job.srcPath, job.settings);
    }
  }

  private async _run(srcPath: string, settings: EstimatorSettings): Promise<void> {
    if (this.inflight.has(srcPath)) { this.active--; this._drain(); return; }
    this.inflight.add(srcPath);
    try {
      const result = await this._encode(srcPath, settings);
      if (this.disposed) return;
      this.cache.set(cacheKey(srcPath, settings), { key: cacheKey(srcPath, settings), result });
      this.onResult(srcPath, result);
    } finally {
      this.inflight.delete(srcPath);
      this.active--;
      this._drain();
    }
  }

  private async _encode(srcPath: string, s: EstimatorSettings): Promise<EstimateResult> {
    try {
      let pipeline = sharp(srcPath);
      if (s.format !== 'same') {
        switch (s.format) {
          case 'png':  pipeline = pipeline.png(); break;
          case 'jpeg': pipeline = pipeline.jpeg({ quality: s.quality }); break;
          case 'webp': pipeline = s.lossless ? pipeline.webp({ lossless: true }) : pipeline.webp({ quality: s.quality }); break;
          case 'avif': pipeline = s.lossless ? pipeline.avif({ lossless: true }) : pipeline.avif({ quality: s.quality }); break;
        }
      } else {
        const meta = await sharp(srcPath).metadata();
        switch (meta.format) {
          case 'jpeg': pipeline = pipeline.jpeg({ quality: s.quality }); break;
          case 'webp': pipeline = pipeline.webp({ quality: s.quality }); break;
          case 'avif': pipeline = pipeline.avif({ quality: s.quality }); break;
          // png and others fall through unchanged
        }
      }
      const buffer = await pipeline.toBuffer();
      return { ok: true, size: buffer.length };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}
