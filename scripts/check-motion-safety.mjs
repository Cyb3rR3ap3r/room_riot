import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/web/src/styles', import.meta.url));
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const filePath = join(directory, entry);
    if (statSync(filePath).isDirectory()) walk(filePath);
    else if (filePath.endsWith('.css')) files.push(filePath);
  }
}
walk(root);

const failures = [];
for (const filePath of files) {
  const source = readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(/animation(?:-duration)?:[^;{}]*?\b([\d.]+)(ms|s)\b/gi)) {
    const durationMs = Number(match[1]) * (match[2].toLowerCase() === 's' ? 1_000 : 1);
    // The reduced-motion override intentionally collapses animations to 0.01ms.
    if (durationMs > 0.1 && durationMs < 100) {
      failures.push(`${filePath}: animation duration ${match[1]}${match[2]} is below 100ms`);
    }
  }
}

if (failures.length) {
  console.error(`Motion safety check failed:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Motion safety passed: ${files.length} CSS files have no sub-100ms production animations.`,
  );
}
