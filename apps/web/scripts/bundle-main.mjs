import { resolve } from 'node:path';

import { build } from 'esbuild';

const packageRoot = resolve(import.meta.dirname, '..');

await build({
  bundle: true,
  charset: 'utf8',
  entryPoints: [resolve(packageRoot, 'src/main.ts')],
  format: 'esm',
  legalComments: 'none',
  logLevel: 'info',
  minify: true,
  outfile: resolve(packageRoot, 'dist/main.js'),
  platform: 'browser',
  target: ['es2022'],
});
