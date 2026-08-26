import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const workflowDir = join(root, '.github', 'workflows');
const violations = [];

for (const file of readdirSync(workflowDir)) {
  if (!/\.ya?ml$/i.test(file)) continue;
  const lines = readFileSync(join(workflowDir, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*uses:\s*([^\s#]+)@([^\s#]+)/);
    if (match && !/^[0-9a-f]{40}$/i.test(match[2])) {
      violations.push(`${file}:${index + 1} ${match[1]} must use a 40-character commit SHA`);
    }
  });
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Workflow pin check passed: ${readdirSync(workflowDir).filter((file) => /\.ya?ml$/i.test(file)).length} workflow files.`,
  );
}
