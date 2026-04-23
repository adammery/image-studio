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

if (watch) {
  await Promise.all([extCtx.watch(), wvCtx.watch()]);
  console.log('Watching for changes…');
} else {
  await Promise.all([extCtx.rebuild(), wvCtx.rebuild()]);
  await Promise.all([extCtx.dispose(), wvCtx.dispose()]);
  console.log('Build complete.');
}
