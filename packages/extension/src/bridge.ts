import type { EditState, ImageInfo } from '@image-studio/core';

// ── Extension → Webview ───────────────────────────────────────────────────

export type ExtMessage =
  | {
      type: 'init';
      imageUri: string;
      meta: ImageInfo;
      editState: EditState;
    }
  | {
      type: 'previewReady';
      previewUri: string;
      size: number;
      width: number;
      height: number;
    }
  | {
      type: 'previewError';
      message: string;
    }
  | {
      type: 'saveComplete';
      trashed: boolean;
      newUri?: string;
    }
  | {
      type: 'showError';
      message: string;
    }
  | {
      type: 'fileChanged';
      imageUri: string;
      meta: ImageInfo;
    };

// ── Webview → Extension ───────────────────────────────────────────────────

export type WvMessage =
  | {
      type: 'editStateChanged';
      state: EditState;
    }
  | {
      type: 'save';
      trashOriginal: boolean;
    }
  | {
      type: 'saveAs';
    }
  | {
      type: 'formatChangeConfirmed';
      trashOriginal: boolean;
    }
  | {
      type: 'formatChangeCancelled';
    }
  | {
      type: 'formatChangeSaveAs';
    };
