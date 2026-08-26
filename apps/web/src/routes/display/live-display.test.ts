import assert from 'node:assert/strict';
import test from 'node:test';

import { createGamePhaseFixture } from '../../components/component-fixtures.js';
import { createLiveDisplayDensityViewModel } from './live-display.js';

const VIEWPORT = { width: 1920, height: 1080 } as const;

test('maps every production game result to deterministic stage density items', () => {
  const games = ['groupthink', 'hot-take', 'suspect', 'drawn-out'] as const;
  for (const gameId of games) {
    const fixture = createGamePhaseFixture(gameId, 'results', 'maximum');
    const first = createLiveDisplayDensityViewModel(fixture.snapshot, VIEWPORT);
    const second = createLiveDisplayDensityViewModel(fixture.snapshot, VIEWPORT);
    assert.equal(first.target, 'stage');
    assert.deepEqual(first, second);
    assert.equal(first.plan.kind, 'results');
    assert.ok(first.contentSelector.length > 3);
  }
});

test('explains result awards with their cause and authoritative point total', () => {
  const groupthink = createLiveDisplayDensityViewModel(
    createGamePhaseFixture('groupthink', 'results', 'maximum').snapshot,
    VIEWPORT,
  );
  const hotTake = createLiveDisplayDensityViewModel(
    createGamePhaseFixture('hot-take', 'results', 'maximum').snapshot,
    VIEWPORT,
  );

  assert.match(groupthink.plan.pages[0]!.items[0]!.secondary ?? '', /matching player.*points/);
  assert.match(hotTake.plan.pages[0]!.items[0]!.secondary ?? '', /vote.*points/);
});

test('uses roster density during active play and excludes removed players', () => {
  const fixture = createGamePhaseFixture('hot-take', 'input', 'maximum');
  const removedId = fixture.snapshot.state.players[0]!.id;
  const snapshot = {
    ...fixture.snapshot,
    state: {
      ...fixture.snapshot.state,
      players: fixture.snapshot.state.players.map((player) =>
        player.id === removedId ? { ...player, status: 'removed' as const } : player,
      ),
    },
  };
  const model = createLiveDisplayDensityViewModel(snapshot, { width: 1280, height: 720 });
  assert.equal(model.target, 'roster');
  assert.equal(model.plan.kind, 'roster');
  assert.equal(
    model.plan.pages.flatMap((page) => page.items).some((item) => item.id === removedId),
    false,
  );
});

test('creates stable tied scoreboard ranks for winner pagination', () => {
  const fixture = createGamePhaseFixture('groupthink', 'complete', 'dense-tie');
  const snapshot = {
    ...fixture.snapshot,
    state: { ...fixture.snapshot.state, phase: 'winner' as const },
  };
  const model = createLiveDisplayDensityViewModel(snapshot, { width: 1280, height: 720 });
  assert.equal(model.target, 'stage');
  assert.equal(model.plan.kind, 'scores');
  const scores = model.plan.pages.flatMap((page) => page.items);
  assert.ok(scores.length > 1);
  assert.equal(new Set(scores.map((item) => item.rank)).size, 1);
});
