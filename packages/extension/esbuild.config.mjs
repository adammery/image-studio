import esbuild from 'esbuild';
import { argv } from 'node:process';

const watch = argv.includes('--watch');

// Extension host bundle (CJS, Node, external vscode + native addons)
const extCtx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  sourcemap: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode', 'sharp', 'trash'],
  logLevel: 'info',
});

// Webview bundle (ESM, browser)
const wvCtx = await esbuild.context({
  entryPoints: ['media/webview.ts'],
  outfile: 'media/webview.js',
  bundle: true,
  sourcemap: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome100',
  logLevel: 'info',
});

// Batch webview bundle (ESM, browser)
const batchCtx = await esbuild.context({
  entryPoints: ['media/batch.ts'],
  outfile: 'media/batch.js',
  bundle: true,
  sourcemap: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome100',
  logLevel: 'info',
});

if (watch) {
  await Promise.all([extCtx.watch(), wvCtx.watch(), batchCtx.watch()]);
  console.log('Watching for changes…');
} else {
  await Promise.all([extCtx.rebuild(), wvCtx.rebuild(), batchCtx.rebuild()]);
  await Promise.all([extCtx.dispose(), wvCtx.dispose(), batchCtx.dispose()]);
  console.log('Build complete.');
}
