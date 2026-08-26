import fs from 'node:fs';
import path from 'node:path';

const tokenPath = path.resolve('apps/web/src/styles/tokens.css');
const source = fs.readFileSync(tokenPath, 'utf8');
const tokens = Object.fromEntries(
  [...source.matchAll(/(--color-[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((match) => [
    match[1],
    match[2],
  ]),
);

function relativeLuminance(hex) {
  const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset + 1, offset + 3), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

const backgroundTokens = ['--color-ink', '--color-surface-solid'];
const foregroundTokens = [
  '--color-text',
  '--color-muted',
  '--color-accent',
  '--color-accent-hot',
  '--color-focus',
  '--color-success',
  '--color-warning',
  '--color-error',
];
const failures = [];
for (const foreground of foregroundTokens) {
  for (const background of backgroundTokens) {
    const ratio = contrastRatio(tokens[foreground], tokens[background]);
    console.log(`${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
    if (ratio < 4.5) failures.push(`${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
  }
}
const buttonRatio = contrastRatio(tokens['--color-on-accent'], tokens['--color-accent']);
console.log(`--color-on-accent on --color-accent: ${buttonRatio.toFixed(2)}:1`);
if (buttonRatio < 4.5)
  failures.push(`--color-on-accent on --color-accent is ${buttonRatio.toFixed(2)}:1`);

if (failures.length) {
  console.error(`Contrast budget failed:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Contrast budget passed at WCAG AA normal-text threshold (4.5:1).');
}
