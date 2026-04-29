import sharp from 'sharp';

// Sharp's libvips operation cache can return stale metadata and pixel data
// for files (notably WebP) that have been overwritten in place during the
// same process. Disable the cache so every read goes to disk.
sharp.cache(false);

export * from './types.js';
export { getImageInfo } from './probe.js';
export { convertImage } from './convert.js';
export { resizeImage } from './resize.js';
export { cropImage } from './crop.js';
export { batchConvert } from './batch.js';
export { applyEdits } from './applyEdits.js';
