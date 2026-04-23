import { CoreError } from '@image-studio/core';

export interface StructuredError {
  error: {
    code:
      | 'FileNotFound'
      | 'InvalidFormat'
      | 'OutputExists'
      | 'TooLarge'
      | 'SharpError'
      | 'PermissionDenied'
      | 'NoFilesMatched';
    message: string;
    detail?: string;
  };
}

export function toStructuredError(err: unknown): StructuredError {
  if (err instanceof CoreError) {
    return { error: { code: err.code, message: err.message, detail: err.detail } };
  }
  const e = err as Error;
  const msg = e?.message ?? String(err);

  if (/ENOENT|no such file or directory/i.test(msg)) {
    return { error: { code: 'FileNotFound', message: msg } };
  }
  if (/too large/i.test(msg)) {
    return { error: { code: 'TooLarge', message: msg } };
  }
  if (/absolute|traversal|base directory|empty/i.test(msg)) {
    return { error: { code: 'InvalidFormat', message: msg } };
  }

  return { error: { code: 'SharpError', message: msg } };
}
