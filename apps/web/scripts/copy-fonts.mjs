import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(packageRoot, 'dist', 'assets', 'fonts');
const fonts = [
  {
    packageName: '@fontsource/atkinson-hyperlegible',
    source: 'files/atkinson-hyperlegible-latin-400-normal.woff2',
    output: 'room-riot-ui-latin-400.woff2',
  },
  {
    packageName: '@fontsource/atkinson-hyperlegible',
    source: 'files/atkinson-hyperlegible-latin-700-normal.woff2',
    output: 'room-riot-ui-latin-700.woff2',
  },
  {
    packageName: '@fontsource/baloo-2',
    source: 'files/baloo-2-latin-700-normal.woff2',
    output: 'room-riot-display-latin-700.woff2',
  },
];

await mkdir(outputRoot, { recursive: true });
for (const font of fonts) {
  await copyFile(
    resolve(packageRoot, 'node_modules', font.packageName, font.source),
    resolve(outputRoot, font.output),
  );
}

for (const [packageName, output] of [
  ['@fontsource/atkinson-hyperlegible', 'OFL-1.1-atkinson-hyperlegible.txt'],
  ['@fontsource/baloo-2', 'OFL-1.1-baloo-2.txt'],
]) {
  const license = await readFile(
    resolve(packageRoot, 'node_modules', packageName, 'LICENSE'),
    'utf8',
  );
  await writeFile(resolve(outputRoot, output), license);
}

stdout.write(`Font assets copied: ${fonts.length} Latin WOFF2 subsets with OFL license records.\n`);
