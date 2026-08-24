import assert from 'node:assert/strict';
import test from 'node:test';

import { ROOM_RIOT_PROTOCOL_VERSION } from '@room-riot/contracts';

import { parsePlayerGameView, parsePlayerStateUpdate, parseRoomSnapshot } from './protocol.js';

const lobbySnapshot = {
  protocolVersion: ROOM_RIOT_PROTOCOL_VERSION,
  revision: 1,
  state: {
    roomCode: 'ABCD',
    phase: 'lobby',
    gameId: null,
    settings: {
      maxPlayers: 12,
      roundCount: 5,
      contentMode: 'standard',
      promptMode: 'default',
      drawnOutMode: 'classic',
    },
    players: [],
  },
  game: null,
  roster: { roundPlayerIds: [], queuedPlayerIds: [] },
} as const;

test('accepts a compatible public snapshot and rejects unknown fields', () => {
  assert.deepEqual(parseRoomSnapshot(lobbySnapshot), { ok: true, value: lobbySnapshot });
  const malformed = parseRoomSnapshot({ ...lobbySnapshot, leakedAnswer: 'secret' });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error, 'malformed-payload');
});

test('returns a safe refresh message for an incompatible protocol version', () => {
  const result = parseRoomSnapshot({ ...lobbySnapshot, protocolVersion: 2 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, 'incompatible-version');
    assert.match(result.message, /refresh/i);
  }
});

test('validates correlated private envelopes and nullable acknowledgement state', () => {
  const state = {
    id: 'groupthink',
    status: 'input',
    roundNumber: 1,
    totalRounds: 5,
    prompt: 'Name a rainy-day activity.',
    promptId: 'prompt-1',
    inputDeadlineAt: null,
    hasSubmitted: false,
    ownAnswer: null,
  } as const;
  const envelope = {
    protocolVersion: ROOM_RIOT_PROTOCOL_VERSION,
    roomCode: 'ABCD',
    revision: 3,
    state,
  } as const;

  assert.deepEqual(parsePlayerStateUpdate(envelope), { ok: true, value: envelope });
  assert.deepEqual(parsePlayerGameView(null), { ok: true, value: null });
  assert.equal(parsePlayerStateUpdate({ ...envelope, roomCode: 'bad room' }).ok, false);
  assert.equal(parsePlayerGameView({ ...state, ownAnswer: 'leak', unexpected: true }).ok, false);
});
