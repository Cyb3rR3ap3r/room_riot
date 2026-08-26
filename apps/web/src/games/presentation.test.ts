import assert from 'node:assert/strict';
import test from 'node:test';

import { GAME_PLAYER_LIMITS, getGamePlayerLimits } from '@room-riot/contracts';
import type { DrawnOutMode } from '@room-riot/contracts';

import { GAME_CATALOG } from '../app/catalog.js';
import { GAME_PRESENTATIONS, getGamePresentation } from './presentation.js';

test('every catalog game has one matching presentation definition', () => {
  assert.deepEqual(
    Object.keys(GAME_PRESENTATIONS).sort(),
    GAME_CATALOG.map((game) => game.id).sort(),
  );
  for (const game of GAME_CATALOG) {
    const presentation = getGamePresentation(game.id);
    assert.equal(presentation.id, game.id);
    const limits = getGamePlayerLimits(game.id);
    assert.equal(presentation.minPlayers, limits.minimum);
    assert.equal(presentation.maxPlayers, limits.maximum);
    assert.deepEqual(presentation.getPlayerLimits(), limits);
    assert.ok(presentation.shellClass);
    assert.ok(presentation.controllerClass);
  }
});

test('Drawn Out presentation exposes mode-specific contract limits', () => {
  const presentation = getGamePresentation('drawn-out');
  const modes = Object.keys(GAME_PLAYER_LIMITS['drawn-out']) as DrawnOutMode[];
  for (const mode of modes) {
    assert.deepEqual(presentation.getPlayerLimits(mode), getGamePlayerLimits('drawn-out', mode));
  }
});

test('phase presentation fixtures preserve game-specific stage and sound direction', () => {
  assert.equal(
    getGamePresentation('groupthink').stageCue('lobby'),
    'Calibrating the consensus reactor',
  );
  assert.equal(getGamePresentation('hot-take').stageCue('voting'), 'The vote is live');
  assert.equal(getGamePresentation('suspect').stageCue('alibi'), 'The suspect has the floor');
  assert.equal(getGamePresentation('drawn-out').stageCue('results'), 'Fresh sketchbook');
  assert.deepEqual(
    getGamePresentation('groupthink').soundCue('winner').notes,
    [523, 659, 784, 1047],
  );
  assert.deepEqual(getGamePresentation('hot-take').soundCue('voting').notes, [260, 390, 520]);
  assert.equal(getGamePresentation('suspect').soundCue('input').waveform(0), 'triangle');
  assert.equal(getGamePresentation('drawn-out').soundCue('input').waveform(0), 'sawtooth');
});

test('every game provides distinct choreography for the full phase contract', () => {
  const choreography = GAME_CATALOG.map((game) => {
    const presentation = getGamePresentation(game.id);
    const phases = Object.values(presentation.phaseChoreography);
    assert.equal(phases.length, 9);
    assert.ok(phases.every((phase) => phase.length > 0));
    return phases.join('|');
  });
  assert.equal(new Set(choreography).size, GAME_CATALOG.length);
});
