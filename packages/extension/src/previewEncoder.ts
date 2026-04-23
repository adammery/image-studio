import sharp from 'sharp';
import type { EditState } from '@image-studio/core';

const DEBOUNCE_MS = 300;

export type PreviewResult =
  | { ok: true; previewDataUrl: string; size: number; width: number; height: number }
  | { ok: false; message: string };

/**
 * Debounced sharp-based preview encoder. On each `schedule()` call it resets
 * the timer; when the timer fires it encodes the source with the current
 * edit state and passes a base64 data URL to `onResult`. Consumers use the
 * data URL directly as an `<img src>` — this avoids CSP and
 * `localResourceRoots` friction that happens with temp files.
 */
export class PreviewEncoder {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly onResult: (result: PreviewResult) => void,
  ) {}

  schedule(srcPath: string, state: EditState): void {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this._encode(srcPath, state), DEBOUNCE_MS);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private async _encode(srcPath: string, state: EditState): Promise<void> {
    if (this.disposed) return;
    try {
      let pipeline = sharp(srcPath);
      if (state.crop) pipeline = pipeline.extract({
        left:   Math.round(state.crop.x),
        top:    Math.round(state.crop.y),
        width:  Math.round(state.crop.width),
        height: Math.round(state.crop.height),
      });
      if (state.resize) pipeline = pipeline.resize(Math.round(state.resize.width), Math.round(state.resize.height), { fit: 'fill' });
      if (state.format !== 'same') {
        switch (state.format) {
          case 'png':  pipeline = pipeline.png(); break;
          case 'jpeg': pipeline = pipeline.jpeg({ quality: state.quality }); break;
          case 'webp': pipeline = state.lossless ? pipeline.webp({ lossless: true }) : pipeline.webp({ quality: state.quality }); break;
          case 'avif': pipeline = state.lossless ? pipeline.avif({ lossless: true }) : pipeline.avif({ quality: state.quality }); break;
        }
      }
      const buffer = await pipeline.toBuffer();
      if (this.disposed) return;
      const meta = await sharp(buffer).metadata();
      const mime = state.format === 'same'
        ? `image/${(meta.format ?? 'png').replace('jpg', 'jpeg')}`
        : `image/${state.format === 'jpeg' ? 'jpeg' : state.format}`;
      const previewDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      this.onResult({ ok: true, previewDataUrl, size: buffer.length, width: meta.width!, height: meta.height! });
    } catch (err) {
      if (!this.disposed) this.onResult({ ok: false, message: (err as Error).message });
    }
  }
}
