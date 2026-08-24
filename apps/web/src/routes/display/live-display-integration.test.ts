import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');

test('live display uses explicit density and phase-aware join components without scale fitting', () => {
  const main = readFileSync(resolve(sourceRoot, 'main.ts'), 'utf8');
  const displayCss = readFileSync(resolve(sourceRoot, 'styles/display.css'), 'utf8');
  const bundleScript = readFileSync(resolve(sourceRoot, '../scripts/bundle-styles.mjs'), 'utf8');

  assert.match(main, /createLiveDisplayDensityViewModel/);
  assert.match(main, /createPhaseAwareJoinViewModel/);
  assert.match(main, /DISPLAY_PAGE_ROTATION_MS = 6_000/);
  assert.match(main, /advanceTvDensityPage/);
  assert.doesNotMatch(main, /fitDisplayExperience|display-scale-/);
  assert.doesNotMatch(displayCss, /transform:\s*scale|--display-scale/);
  assert.doesNotMatch(bundleScript, /display-scales\.css/);
  assert.match(displayCss, /max\(5vh/);
  assert.match(displayCss, /max\(5vw/);
});
