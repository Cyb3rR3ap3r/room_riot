import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRoot = join(root, 'apps', 'web', 'dist');
const files = [];
function walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else files.push({ path, bytes: statSync(path).size });
  }
}
walk(webRoot);
const initial = files
  .filter(({ path }) => /\.(html|js|css|woff2?)$/i.test(path))
  .reduce((n, f) => n + f.bytes, 0);
const largest = [...files].sort((a, b) => b.bytes - a.bytes)[0];
const budget = 4 * 1024 * 1024;
if (!files.length) {
  console.error('Performance budget check requires a built web app.');
  process.exitCode = 1;
} else if (initial > budget) {
  console.error(`Initial route assets exceed 4 MiB: ${initial} bytes.`);
  process.exitCode = 1;
} else {
  console.log(
    `Performance budget passed: ${initial} initial bytes; largest asset ${largest?.bytes ?? 0} bytes.`,
  );
}
