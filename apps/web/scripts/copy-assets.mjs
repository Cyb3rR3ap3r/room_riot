import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(directory, '..');
const distDirectory = resolve(webRoot, 'dist');

await mkdir(distDirectory, { recursive: true });
const styleManifest = JSON.parse(
  await readFile(resolve(distDirectory, 'style-manifest.json'), 'utf8'),
);
if (!/^room-riot\.[a-f0-9]{12}\.css$/.test(styleManifest.fileName)) {
  throw new Error('The generated style manifest is invalid.');
}
const sourceHtml = await readFile(resolve(webRoot, 'index.html'), 'utf8');
const sourceShowcaseHtml = await readFile(resolve(webRoot, 'showcase.html'), 'utf8');
const placeholder = '__ROOM_RIOT_STYLES__';
if (!sourceHtml.includes(placeholder) || !sourceShowcaseHtml.includes(placeholder)) {
  throw new Error('A browser shell is missing its generated stylesheet placeholder.');
}
await writeFile(
  resolve(distDirectory, 'index.html'),
  sourceHtml.replace(placeholder, styleManifest.fileName),
);
await writeFile(
  resolve(distDirectory, 'showcase.html'),
  sourceShowcaseHtml.replace(placeholder, styleManifest.fileName),
);
const sourceAssetDirectory = resolve(webRoot, 'assets');
const outputAssetDirectory = resolve(distDirectory, 'assets');
const assetManifest = JSON.parse(await readFile(resolve(webRoot, 'asset-manifest.json'), 'utf8'));
const optimizedAssets = assetManifest.productionAssets.map(({ output }) => output);
if (
  optimizedAssets.length === 0 ||
  new Set(optimizedAssets).size !== optimizedAssets.length ||
  optimizedAssets.some((fileName) => !/^[a-z0-9][a-z0-9-]*\.webp$/.test(fileName))
) {
  throw new Error('The production asset manifest is empty, duplicated, or invalid.');
}
const assetSizes = await Promise.all(
  optimizedAssets.map(async (fileName) => ({
    fileName,
    bytes: (await stat(resolve(sourceAssetDirectory, fileName))).size,
  })),
);
const oversizedAsset = assetSizes.find(({ bytes }) => bytes > 350 * 1024);
if (oversizedAsset) {
  throw new Error(`${oversizedAsset.fileName} exceeds the 350 KiB production asset budget.`);
}
const totalAssetBytes = assetSizes.reduce((total, { bytes }) => total + bytes, 0);
if (totalAssetBytes > 3 * 1024 * 1024) {
  throw new Error('Optimized production assets exceed the 3 MiB aggregate budget.');
}
await mkdir(outputAssetDirectory, { recursive: true });
await Promise.all(
  (await readdir(outputAssetDirectory))
    .filter((fileName) => fileName.endsWith('.webp') && !optimizedAssets.includes(fileName))
    .map((fileName) => rm(resolve(outputAssetDirectory, fileName), { force: true })),
);
await Promise.all(
  optimizedAssets.map((fileName) =>
    copyFile(resolve(sourceAssetDirectory, fileName), resolve(outputAssetDirectory, fileName)),
  ),
);
