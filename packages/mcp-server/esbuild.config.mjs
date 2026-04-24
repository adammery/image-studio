import esbuild from 'esbuild';
import { argv } from 'node:process';

const watch = argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  sourcemap: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: [
    'sharp',
    'trash',
    'fast-glob',
    '@modelcontextprotocol/sdk'
  ],
  logLevel: 'info'
});

if (watch) {
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Build complete.');
}
