import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'games', 'content-manifest.json'), 'utf8'));
const games = ['groupthink', 'hot-take', 'suspect', 'drawn-out', 'blank-line', 'wavelength'];
const modes = ['family', 'standard', 'after-dark'];
const supportedRoundTypes = new Set([
  'standard',
  'alibi',
  'double-trouble',
  'false-accusation',
  'most-likely',
]);
const supportedPlayerTargetPolicies = new Set(['skip']);
const forbidden =
  /\b(minor|child|teen|underage|child porn|rape|coerc|doxx|suicide|self-harm|racial slur|non-consensual|trauma|hate)\b/i;
let failures = [];
let total = 0;

for (const game of games) {
  for (const mode of modes) {
    const key = `${game}/${mode}`;
    const metadata = manifest.packs[key];
    if (
      !metadata ||
      !metadata.categories?.length ||
      !metadata.audience ||
      !metadata.answerShape ||
      !metadata.riskTags ||
      !Number.isInteger(metadata.curatedPromptCount)
    ) {
      failures.push(`${key}: missing taxonomy metadata`);
    }
    if (mode === 'after-dark' && metadata.audience !== 'adults') {
      failures.push(`${key}: after-dark packs must be adults-only`);
    }
    const file = join(root, 'games', game, 'content', `${mode}.json`);
    const prompts = JSON.parse(readFileSync(file, 'utf8')).prompts;
    if (metadata.curatedPromptCount !== prompts.length) {
      failures.push(`${key}: manifest count does not match curated prompt count`);
    }
    const hasPlayerTargetedPrompt = prompts.some((prompt) => prompt.kind === 'player-targeted');
    if (
      hasPlayerTargetedPrompt &&
      !supportedPlayerTargetPolicies.has(metadata.playerTargetedPolicy)
    ) {
      failures.push(`${key}: player-targeted prompts need an explicit opt-out policy`);
    }
    const ids = new Set();
    const texts = new Set();
    for (const prompt of prompts) {
      total += 1;
      const promptText =
        metadata.answerShape === 'spectrum-pair'
          ? `${prompt.left ?? ''} | ${prompt.right ?? ''}`
          : (prompt.text ?? '');
      const normalized = promptText.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!prompt.id || ids.has(prompt.id)) failures.push(`${key}: duplicate/missing id`);
      if (!normalized || texts.has(normalized)) failures.push(`${key}: duplicate/empty text`);
      if (normalized.length < 8 || normalized.length > 240) {
        failures.push(`${key}/${prompt.id}: prompt length must be between 8 and 240 characters`);
      }
      if (metadata.answerShape === 'spectrum-pair') {
        if (
          !prompt.left?.trim() ||
          !prompt.right?.trim() ||
          prompt.left.trim() === prompt.right.trim()
        ) {
          failures.push(`${key}/${prompt.id}: spectrum poles must be non-empty and distinct`);
        }
        if (!metadata.categories.includes(prompt.category)) {
          failures.push(`${key}/${prompt.id}: unsupported spectrum category`);
        }
      }
      if (forbidden.test(promptText)) failures.push(`${key}/${prompt.id}: prohibited safety term`);
      if (prompt.kind && !['open', 'player-targeted'].includes(prompt.kind)) {
        failures.push(`${key}/${prompt.id}: unsupported prompt kind`);
      }
      if (prompt.roundType && !supportedRoundTypes.has(prompt.roundType)) {
        failures.push(`${key}/${prompt.id}: unsupported round type`);
      }
      ids.add(prompt.id);
      texts.add(normalized);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Content validation passed: ${total} authored prompts across ${games.length * modes.length} packs.`,
  );
}
