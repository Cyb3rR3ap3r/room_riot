import assert from 'node:assert/strict';
import test from 'node:test';

import { getHostRouteViewModel } from './view-model.js';

test('host lobby models preserve player gates and game-specific launch copy', () => {
  const fixtures = [
    ['groupthink', 1, 'Start Groupthink'],
    ['hot-take', 3, 'Start Hot Take'],
    ['suspect', 4, 'Start Suspect'],
    ['drawn-out', 3, 'Start Drawn Out'],
  ] as const;
  for (const [gameId, minimum, label] of fixtures) {
    assert.equal(getHostRouteViewModel(gameId, 'lobby', minimum - 1).primaryAction?.disabled, true);
    const ready = getHostRouteViewModel(gameId, 'lobby', minimum);
    assert.deepEqual(ready.primaryAction, { event: 'host:start-game', label, disabled: false });
  }
});

test('host phase models own reveal/next dispatch and winner has no primary action', () => {
  assert.equal(
    getHostRouteViewModel('hot-take', 'input', 3).primaryAction?.label,
    'Put the Takes on Stage',
  );
  assert.equal(
    getHostRouteViewModel('suspect', 'alibi', 4).primaryAction?.event,
    'host:reveal-results',
  );
  assert.equal(
    getHostRouteViewModel('drawn-out', 'voting', 3).primaryAction?.label,
    'Reveal the Art Disaster',
  );
  assert.deepEqual(getHostRouteViewModel('groupthink', 'results', 1).primaryAction, {
    event: 'host:next-round',
    label: 'Sync the Next Round',
    disabled: false,
  });
  assert.equal(getHostRouteViewModel('groupthink', 'winner', 1).primaryAction, null);
});
