export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif';

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
  colorspace: string;
}

export interface ConvertOptions {
  src: string;
  dst?: string;
  format: ImageFormat;
  quality?: number;
  lossless?: boolean;
  overwrite?: boolean;
}

export interface ResizeOptions {
  src: string;
  dst?: string;
  width?: number;
  height?: number;
  fit?: 'inside' | 'cover' | 'contain';
  overwrite?: boolean;
}

export interface CropRect {
  src: string;
  dst?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  overwrite?: boolean;
}

export interface OperationResult {
  dst: string;
  size: number;
  width: number;
  height: number;
}

export interface BatchOptions {
  files?: string[];
  pattern?: string;
  format: ImageFormat;
  quality?: number;
  lossless?: boolean;
  outSuffix?: string;
  overwrite?: boolean;
}

export interface BatchConvertResult {
  src: string;
  dst: string;
  size: number;
  width: number;
  height: number;
}

export interface BatchFailure {
  src: string;
  error: string;
}

export interface BatchResult {
  converted: BatchConvertResult[];
  failed: BatchFailure[];
  totalIn: number;
  totalOut: number;
}

export class CoreError extends Error {
  constructor(
    public readonly code:
      | 'FileNotFound'
      | 'InvalidFormat'
      | 'OutputExists'
      | 'TooLarge'
      | 'SharpError'
      | 'PermissionDenied'
      | 'NoFilesMatched',
    message: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = 'CoreError';
  }
}
