import type { EditState, ImageInfo } from '@image-studio/core';

// Messages from extension host → webview.
// On external file change the extension resends `init` (not a separate event).
export type ExtMessage =
  | { type: 'init'; imageUri: string; meta: ImageInfo; editState: EditState }
  | { type: 'previewReady'; previewDataUrl: string; size: number; width: number; height: number }
  | { type: 'previewError'; message: string }
  | { type: 'saveComplete'; trashed: boolean }
  | { type: 'showError'; message: string };

// Messages from webview → extension host.
// Format-change modal is shown via VSCode native API from the extension, not
// round-tripped through the webview.
export type WvMessage =
  | { type: 'editStateChanged'; state: EditState }
  | { type: 'save'; trashOriginal: boolean; filename: string }
  | { type: 'saveAs'; filename: string };
