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
const productionAssets = assetManifest.productionAssets;
const optimizedAssets = productionAssets.map(({ output }) => output);
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
const assetDimensions = await Promise.all(
  productionAssets.map(async ({ output, maxEdge }) => ({
    fileName: output,
    maxEdge,
    dimensions: readWebpDimensions(await readFile(resolve(sourceAssetDirectory, output))),
  })),
);
const oversizedDecodedAsset = assetDimensions.find(
  ({ dimensions, maxEdge }) =>
    maxEdge !== null && (dimensions.width > maxEdge || dimensions.height > maxEdge),
);
if (oversizedDecodedAsset) {
  throw new Error(
    `${oversizedDecodedAsset.fileName} decodes to ${oversizedDecodedAsset.dimensions.width}x${oversizedDecodedAsset.dimensions.height}, exceeding its ${oversizedDecodedAsset.maxEdge}px manifest edge budget.`,
  );
}
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

function readWebpDimensions(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('A production asset is not a WebP file.');
  }
  const chunk = bytes.toString('ascii', 12, 16);
  const dataOffset = 20;
  if (chunk === 'VP8X') {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  if (chunk === 'VP8L' && bytes[dataOffset] === 0x2f) {
    const bits =
      bytes[dataOffset + 1] |
      (bytes[dataOffset + 2] << 8) |
      (bytes[dataOffset + 3] << 16) |
      (bytes[dataOffset + 4] << 24);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >>> 14) & 0x3fff),
    };
  }
  if (chunk === 'VP8 ' && bytes[dataOffset + 3] === 0x9d && bytes[dataOffset + 4] === 0x01) {
    return {
      width: bytes[dataOffset + 6] | (bytes[dataOffset + 7] << 8),
      height: bytes[dataOffset + 8] | (bytes[dataOffset + 9] << 8),
    };
  }
  throw new Error(`Unsupported WebP encoding in ${chunk || 'unknown'} asset.`);
}
await Promise.all(
  optimizedAssets.map((fileName) =>
    copyFile(resolve(sourceAssetDirectory, fileName), resolve(outputAssetDirectory, fileName)),
  ),
);
