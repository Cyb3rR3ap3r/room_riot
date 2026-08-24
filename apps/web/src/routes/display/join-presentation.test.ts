import assert from 'node:assert/strict';
import test from 'node:test';

import type { RoomPhase } from '@room-riot/contracts';

import { createPhaseAwareJoinViewModel, type JoinAvailability } from './join-presentation.js';

const activePhases: readonly RoomPhase[] = [
  'intro',
  'prompt',
  'input',
  'alibi',
  'voting',
  'results',
  'scoring',
  'winner',
];

test('makes QR, full instructions, manual URL, and room code dominant only in an open lobby', () => {
  const model = createPhaseAwareJoinViewModel({
    gameId: 'hot-take',
    roomCode: 'rage',
    phase: 'lobby',
    availability: 'open',
    origin: 'https://party.local/display?room=RAGE',
  });

  assert.equal(model.mode, 'full');
  assert.equal(model.roomCode, 'RAGE');
  assert.equal(model.manualUrl, 'https://party.local/play/hot-take?room=RAGE');
  assert.equal(model.qr?.src, '/api/rooms/RAGE/qr.svg');
  assert.match(model.qr?.alt ?? '', /hot take.*RAGE/i);
  assert.match(model.instruction, /scan the QR code or type the address/i);
});

test('hides active-play joining by default and offers a compact queued badge explicitly', () => {
  for (const phase of activePhases) {
    const hidden = createPhaseAwareJoinViewModel({
      gameId: 'groupthink',
      roomCode: 'MIND',
      phase,
      availability: 'queued',
      origin: 'http://room-riot.local',
    });
    assert.equal(hidden.mode, 'hidden');
    assert.equal(hidden.advertisesJoin, false);

    const compact = createPhaseAwareJoinViewModel({
      gameId: 'groupthink',
      roomCode: 'MIND',
      phase,
      availability: 'queued',
      origin: 'http://room-riot.local',
      showDuringPlay: true,
    });
    assert.equal(compact.mode, 'compact');
    assert.equal(compact.qr, null);
    assert.equal(compact.manualUrl, null);
    assert.equal(compact.roomCode, 'MIND');
    assert.match(compact.instruction, /join the queue/i);
  }
});

test('never advertises a QR, URL, or room code when joining is unusable', () => {
  const unavailable: readonly JoinAvailability[] = ['full', 'locked', 'closed'];
  for (const availability of unavailable) {
    for (const phase of ['lobby', 'input'] as const) {
      const model = createPhaseAwareJoinViewModel({
        gameId: 'suspect',
        roomCode: 'CASE',
        phase,
        availability,
        origin: 'https://party.local',
        showDuringPlay: true,
      });
      assert.equal(model.mode, 'locked');
      assert.equal(model.advertisesJoin, false);
      assert.equal(model.qr, null);
      assert.equal(model.manualUrl, null);
      assert.equal(model.roomCode, null);
      assert.match(model.accessibleLabel, /cannot join/i);
    }
  }
});

test('rejects ambiguous non-web join origins', () => {
  assert.throws(
    () =>
      createPhaseAwareJoinViewModel({
        gameId: 'drawn-out',
        roomCode: 'DRAW',
        phase: 'lobby',
        availability: 'open',
        origin: 'javascript:alert(1)',
      }),
    /HTTP or HTTPS/,
  );
});
