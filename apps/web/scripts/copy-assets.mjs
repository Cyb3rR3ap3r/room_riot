import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(directory, '..');
const distDirectory = resolve(webRoot, 'dist');

await mkdir(distDirectory, { recursive: true });
await cp(resolve(webRoot, 'index.html'), resolve(distDirectory, 'index.html'));
