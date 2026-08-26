import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_PROCEDURAL_CUE_PEAK, normalizeProceduralCueVolume } from './audio.js';

test('normalizes procedural cues below the shared peak and compensates for polyphony', () => {
  assert.equal(normalizeProceduralCueVolume(0.02, 1), 0.02);
  assert.equal(normalizeProceduralCueVolume(0.08, 4), 0.04);
  assert.equal(normalizeProceduralCueVolume(Number.NaN, 3), 0);
  assert.ok(normalizeProceduralCueVolume(1, 16) <= MAX_PROCEDURAL_CUE_PEAK);
});
