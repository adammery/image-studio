import type { ImageEntry } from './batchScanner.js';
import type { EstimatorSettings, EstimateResult } from './batchEstimator.js';

export type ConvertStatus = 'pending' | 'in-progress' | 'done' | 'failed';

/** Extension → Webview */
export type BatchExtMessage =
  | { type: 'init'; folders: string[]; images: ImageEntry[] }
  | { type: 'estimate'; srcPath: string; result: EstimateResult }
  | { type: 'convertProgress'; srcPath: string; status: ConvertStatus; error?: string; doneCount: number; totalCount: number }
  | { type: 'convertDone'; converted: number; failed: number; skipped: number }
  | { type: 'showError'; message: string };

// NOTE: settings.format must be 'jpeg', never 'jpg' — see EstimatorSettings union.
/** Webview → Extension */
export type BatchWvMessage =
  | { type: 'selectionChanged'; selected: string[] }
  | { type: 'settingsChanged'; settings: EstimatorSettings }
  | { type: 'estimateRequest'; srcPaths: string[]; settings: EstimatorSettings }
  | { type: 'estimateInvalidate' }
  | { type: 'convertStart'; selected: string[]; settings: EstimatorSettings; trashOriginals: boolean; conflictPolicy: 'skip' | 'overwrite' }
  | { type: 'convertCancel' }
  | { type: 'preflightRequest'; selected: string[]; settings: EstimatorSettings };
