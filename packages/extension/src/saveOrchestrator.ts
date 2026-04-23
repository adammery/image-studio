import { applyEdits } from '@image-studio/core';
import type { EditState, ApplyEditsResult } from '@image-studio/core';

export interface SaveOptions {
  overwrite?: boolean;
}

export class SaveOrchestrator {
  async save(
    src: string,
    dst: string,
    state: EditState,
    opts: SaveOptions,
  ): Promise<ApplyEditsResult> {
    return applyEdits(src, dst, state, {
      overwrite: opts.overwrite ?? (src === dst),
    });
  }
}
