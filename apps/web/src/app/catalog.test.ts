import assert from 'node:assert/strict';
import test from 'node:test';

import { GAME_PLAYER_LIMITS, getGamePlayerLimits } from '@room-riot/contracts';
import type { DrawnOutMode } from '@room-riot/contracts';

import {
  GAME_CATALOG,
  getGameDefinition,
  getGamePlayerRangeLabel,
  isSupportedGameId,
} from './catalog.js';

test('catalog exposes one complete, uniquely identified definition per supported game', () => {
  assert.deepEqual(
    GAME_CATALOG.map((game) => game.id),
    ['groupthink', 'hot-take', 'suspect', 'drawn-out'],
  );
  assert.equal(new Set(GAME_CATALOG.map((game) => game.id)).size, GAME_CATALOG.length);
  for (const game of GAME_CATALOG) {
    assert.ok(game.label);
    assert.match(game.icon, /^\/assets\/.+\.webp$/);
    assert.match(game.background, /^\/assets\/.+\.webp$/);
    assert.match(game.stageArt, /^\/assets\/.+\.webp$/);
    assert.equal(isSupportedGameId(game.id), true);
    assert.equal(getGameDefinition(game.id), game);
    const limits = getGamePlayerLimits(game.id);
    assert.equal(game.players, `${limits.minimum}–${limits.maximum} players`);
    assert.match(game.duration, /min$/);
    assert.ok(game.contentRating.length > 0);
    assert.ok(game.controller.length > 0);
    assert.ok(game.mechanics.length >= 3);
    assert.equal(new Set(game.mechanics).size, game.mechanics.length);
  }
});

test('catalog player labels follow every Drawn Out mode limit', () => {
  const modes = Object.keys(GAME_PLAYER_LIMITS['drawn-out']) as DrawnOutMode[];
  for (const mode of modes) {
    const limits = getGamePlayerLimits('drawn-out', mode);
    assert.equal(
      getGamePlayerRangeLabel('drawn-out', mode),
      `${limits.minimum}–${limits.maximum} players`,
    );
  }
});

test('unknown catalog IDs safely use the default game', () => {
  assert.equal(isSupportedGameId('unknown'), false);
  assert.equal(getGameDefinition('unknown').id, 'groupthink');
});
