import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process, { stderr, stdout } from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRoot = join(root, 'apps', 'web');
const required = [
  'node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2',
  'node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2',
  'node_modules/@fontsource/baloo-2/files/baloo-2-latin-700-normal.woff2',
];
const failures = required.filter((file) => !existsSync(join(webRoot, file)));
const css = readFileSync(join(webRoot, 'src', 'styles', 'fonts.css'), 'utf8');
const html = readFileSync(join(webRoot, 'index.html'), 'utf8');
for (const token of [
  'font-display: swap',
  'font-variant-numeric: tabular-nums',
  'room-riot-ui-latin-400.woff2',
  'room-riot-ui-latin-700.woff2',
  'room-riot-display-latin-700.woff2',
]) {
  if (!css.includes(token)) failures.push(`fonts.css missing ${token}`);
}
for (const token of ['room-riot-ui-latin-400.woff2', 'room-riot-display-latin-700.woff2']) {
  if (!html.includes(token)) failures.push(`index.html missing preload for ${token}`);
}

const distRoot = join(webRoot, 'dist', 'assets', 'fonts');
if (existsSync(distRoot)) {
  for (const file of [
    'room-riot-ui-latin-400.woff2',
    'room-riot-ui-latin-700.woff2',
    'room-riot-display-latin-700.woff2',
    'OFL-1.1-atkinson-hyperlegible.txt',
    'OFL-1.1-baloo-2.txt',
  ]) {
    if (!existsSync(join(distRoot, file))) failures.push(`built font asset missing ${file}`);
  }
}

if (failures.length) {
  stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  stdout.write(
    'Font asset check passed: licensed Latin subsets, fallbacks, numeric widths, and preloads are present.',
  );
}
