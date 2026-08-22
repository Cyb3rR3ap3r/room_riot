import assert from 'node:assert/strict';
import test from 'node:test';

import { addPlayer, createInitialRoomState, setGame, toPublicRoomState } from './index.js';

test('creates a normalized lobby with default settings', () => {
  const room = createInitialRoomState({ roomCode: ' riot ', now: 100 });

  assert.equal(room.roomCode, 'RIOT');
  assert.equal(room.phase, 'lobby');
  assert.equal(room.settings.maxPlayers, 12);
  assert.deepEqual(room.players, {});
  assert.equal(room.createdAt, 100);
});

test('adds validated players without mutating the prior state', () => {
  const room = createInitialRoomState({ roomCode: 'RAGE', now: 100 });
  const updated = addPlayer(room, {
    id: 'player-1',
    name: ' Joe ',
    avatar: '😎',
    now: 200,
  });

  assert.deepEqual(room.players, {});
  assert.deepEqual(updated.players['player-1'], {
    id: 'player-1',
    name: 'Joe',
    avatar: '😎',
    status: 'connected',
    score: 0,
    joinedAt: 200,
  });
  assert.equal(updated.updatedAt, 200);
});

test('rejects duplicate players and full rooms', () => {
  const room = createInitialRoomState({ roomCode: 'RAGE', settings: { maxPlayers: 2 } });
  const withJoe = addPlayer(room, { id: 'joe', name: 'Joe', avatar: '😎' });

  assert.throws(
    () => addPlayer(withJoe, { id: 'joe', name: 'Joe 2', avatar: '🤡' }),
    /already in room/,
  );

  const withSarah = addPlayer(withJoe, { id: 'sarah', name: 'Sarah', avatar: '👽' });
  assert.throws(() => addPlayer(withSarah, { id: 'mike', name: 'Mike', avatar: '💀' }), /is full/);
});

test('exposes a client-safe projection and supports selecting a game', () => {
  const room = addPlayer(createInitialRoomState({ roomCode: 'BOOM' }), {
    id: 'joe',
    name: 'Joe',
    avatar: '😎',
  });
  const gameRoom = setGame(room, 'groupthink');
  const publicState = toPublicRoomState(gameRoom);

  assert.equal(publicState.gameId, 'groupthink');
  assert.equal(publicState.phase, 'intro');
  assert.equal(publicState.players.length, 1);
  assert.equal('joinedAt' in (publicState.players[0] ?? {}), false);
});
