import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(packageRoot, 'src/styles');
const outputRoot = resolve(packageRoot, 'dist');
const outputAssetRoot = resolve(outputRoot, 'assets');
const styleSources = [
  'fonts.css',
  'tokens.css',
  'shell.css',
  'themes.css',
  'components.css',
  'recovery.css',
  'routes.css',
  'experiences.css',
  'controllers.css',
  'display.css',
  'tv-layout.css',
  'games/drawn-out.css',
  'showcase.css',
  'revamp.css',
  'motion.css',
];

const sections = await Promise.all(
  styleSources.map(async (source) => {
    const contents = (await readFile(resolve(sourceRoot, source), 'utf8')).trim();
    return `/* ${source} */\n${contents}`;
  }),
);
const bundle = `${sections.join('\n\n')}\n`;
const fingerprint = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
const fileName = `room-riot.${fingerprint}.css`;

await mkdir(outputAssetRoot, { recursive: true });
await Promise.all(
  (await readdir(outputAssetRoot))
    .filter((entry) => /^room-riot\.[a-f0-9]{12}\.css$/.test(entry) && entry !== fileName)
    .map((entry) => rm(resolve(outputAssetRoot, entry), { force: true })),
);
await writeFile(resolve(outputAssetRoot, fileName), bundle);
await writeFile(
  resolve(outputRoot, 'style-manifest.json'),
  `${JSON.stringify({ fileName }, null, 2)}\n`,
);
