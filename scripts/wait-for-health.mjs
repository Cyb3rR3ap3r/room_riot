import process, { stderr } from 'node:process';
import { setTimeout } from 'node:timers/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/wait-for-health.mjs <health-url>');

for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await fetch(target);
    if (response.ok) process.exit(0);
  } catch {
    // The container may still be starting.
  }
  await setTimeout(500);
}

stderr.write(`Health check timed out: ${target}\n`);
process.exitCode = 1;
