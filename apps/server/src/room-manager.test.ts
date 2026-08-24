import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateDrawnOutPrompts,
  generateGroupthinkPrompts,
  generateHotTakePrompts,
} from './prompt-generator.js';
import { RoomManager, RoomManagerError } from './room-manager.js';

test('creates a room with a valid host token and lobby state', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({});

  assert.match(room.roomCode, /^[A-Z0-9]{4,6}$/);
  assert.match(room.hostToken, /^[0-9a-f-]{36}$/);
  assert.equal(room.snapshot.state.roomCode, room.roomCode);
  assert.equal(room.snapshot.state.phase, 'lobby');
  assert.equal(room.snapshot.state.settings.maxPlayers, 12);
});

test('publishes the selected game while the room is in the lobby', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({ gameId: 'hot-take' });

  assert.equal(room.snapshot.state.phase, 'lobby');
  assert.equal(room.snapshot.state.gameId, 'hot-take');
  assert.equal(room.snapshot.game, null);
});

test('supports a room-specific AI remix prompt deck', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const firstRoom = manager.createRoom({
    gameId: 'groupthink',
    settings: { promptMode: 'ai', roundCount: 3 },
  });
  const secondRoom = manager.createRoom({
    gameId: 'groupthink',
    settings: { promptMode: 'ai', roundCount: 3 },
  });

  const first = manager.startGame(firstRoom.roomCode, firstRoom.hostToken, 'groupthink');
  const second = manager.startGame(secondRoom.roomCode, secondRoom.hostToken, 'groupthink');

  assert.equal(first.state.settings.promptMode, 'ai');
  assert.equal(second.state.settings.promptMode, 'ai');
  assert.ok(first.game?.id === 'groupthink' && first.game.prompt.length > 0);
  assert.ok(second.game?.id === 'groupthink' && second.game.prompt.length > 0);
  assert.notEqual(
    first.game?.id === 'groupthink' ? first.game.promptId : '',
    second.game?.id === 'groupthink' ? second.game.promptId : '',
  );
  manager.close();
});

test('uses the same AI remix setting for Hot Take', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({
    gameId: 'hot-take',
    settings: { promptMode: 'ai', roundCount: 2 },
  });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Blair', avatar: '👽' });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Casey', avatar: '🤖' });

  const started = manager.startGame(room.roomCode, room.hostToken, 'hot-take');
  assert.equal(started.state.settings.promptMode, 'ai');
  assert.equal(started.game?.id, 'hot-take');
  if (started.game?.id === 'hot-take') {
    assert.ok(started.game.promptId.startsWith('ai-hot-take-'));
    assert.ok(started.game.prompt.length > 0);
  }
  manager.close();
});

test('AI remix creates at least 100 unique prompts for every content mode', () => {
  (['family', 'standard', 'after-dark'] as const).forEach((contentMode) => {
    const groupthink = generateGroupthinkPrompts(contentMode);
    const hotTake = generateHotTakePrompts(contentMode);
    const drawnOut = generateDrawnOutPrompts(contentMode);
    assert.ok(groupthink.length >= 100);
    assert.ok(hotTake.length >= 100);
    assert.ok(drawnOut.length >= 100);
    assert.equal(new Set(groupthink.map((prompt) => prompt.id)).size, groupthink.length);
    assert.equal(new Set(hotTake.map((prompt) => prompt.id)).size, hotTake.length);
    assert.equal(new Set(drawnOut.map((prompt) => prompt.id)).size, drawnOut.length);
  });
});

test('does not reuse the previous curated opening prompt', () => {
  const manager = new RoomManager();
  const firstRoom = manager.createRoom({ gameId: 'groupthink' });
  const secondRoom = manager.createRoom({ gameId: 'groupthink' });

  const first = manager.startGame(firstRoom.roomCode, firstRoom.hostToken, 'groupthink');
  const second = manager.startGame(secondRoom.roomCode, secondRoom.hostToken, 'groupthink');

  assert.equal(first.game?.id, 'groupthink');
  assert.equal(second.game?.id, 'groupthink');
  if (first.game?.id === 'groupthink' && second.game?.id === 'groupthink') {
    assert.notEqual(first.game.promptId, second.game.promptId);
  }
  manager.close();
});

test('joins a player and reconnects them with the same identity', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({});
  const joined = manager.joinRoom({
    roomCode: room.roomCode,
    name: 'Joe',
    avatar: '😎',
  });

  assert.equal(joined.snapshot.state.players.length, 1);
  assert.equal(joined.snapshot.state.players[0]?.status, 'connected');

  const rejoined = manager.joinRoom({
    roomCode: room.roomCode,
    name: 'Joe',
    avatar: '😎',
    playerToken: joined.playerToken,
  });

  assert.equal(rejoined.playerId, joined.playerId);
  assert.equal(rejoined.playerToken, joined.playerToken);
  assert.equal(rejoined.snapshot.state.players.length, 1);
});

test('requires the host token to start a game', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({});

  assert.throws(
    () => manager.startGame(room.roomCode, '00000000-0000-4000-8000-000000000000', 'groupthink'),
    (error: unknown) => error instanceof RoomManagerError && error.code === 'UNAUTHORIZED',
  );

  const state = manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  assert.equal(state.state.gameId, 'groupthink');
  assert.equal(state.state.phase, 'input');
});

test('rejects unsupported games and enforces the active-room limit', () => {
  const manager = new RoomManager({ maxRooms: 1 });
  const room = manager.createRoom({});

  assert.throws(
    () => manager.startGame(room.roomCode, room.hostToken, 'made-up'),
    (error: unknown) => error instanceof RoomManagerError && error.code === 'INVALID_STATE',
  );
  assert.throws(
    () => manager.createRoom({}),
    (error: unknown) => error instanceof RoomManagerError && error.code === 'ROOM_LIMIT',
  );
  manager.close();
});

test('expires inactive rooms and rejects answers after a deadline', () => {
  const manager = new RoomManager({ groupthinkInputDurationMs: 10, roomIdleTtlMs: 100 });
  const room = manager.createRoom({ settings: { roundCount: 1 } });
  const player = manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' });
  manager.startGame(room.roomCode, room.hostToken, 'groupthink');

  const deadlineStart = Date.now();
  while (Date.now() - deadlineStart < 20) {
    // Keep the test deterministic even when the timer callback is delayed.
  }
  assert.throws(
    () => manager.submitAnswer(room.roomCode, player.playerId, 'late'),
    /deadline|no longer accepting/i,
  );
  assert.equal(manager.getRoomSnapshot(room.roomCode).state.phase, 'results');
  const removed = manager.cleanupExpiredRooms(Date.now() + 101);
  assert.equal(removed, 1);
  assert.equal(manager.hasRoom(room.roomCode), false);
  manager.close();
});

test('marks a connected player offline when their socket disconnects', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({});
  const joined = manager.joinRoom({ roomCode: room.roomCode, name: 'Sarah', avatar: '👽' });
  manager.bindPlayer(room.roomCode, joined.playerId, 'socket-1');

  const state = manager.disconnectSocket('socket-1');
  assert.equal(state?.state.players[0]?.status, 'disconnected');
});

test('runs Groupthink from input through results, scoring, and winner', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({ settings: { roundCount: 1 } });
  const first = manager.joinRoom({ roomCode: room.roomCode, name: 'Joe', avatar: '😎' });
  const second = manager.joinRoom({ roomCode: room.roomCode, name: 'Sarah', avatar: '👽' });
  const started = manager.startGame(room.roomCode, room.hostToken, 'groupthink');

  assert.equal(started.state.phase, 'input');
  assert.equal(started.game?.submittedCount, 0);

  const firstAnswer = manager.submitGroupthinkAnswer(room.roomCode, first.playerId, 'phone');
  assert.equal(firstAnswer.snapshot.state.phase, 'input');
  assert.equal(firstAnswer.snapshot.game?.submittedCount, 1);

  const results = manager.submitGroupthinkAnswer(room.roomCode, second.playerId, ' Phone! ');
  assert.equal(results.snapshot.state.phase, 'results');
  assert.equal(results.snapshot.game?.id, 'groupthink');
  if (results.snapshot.game?.id === 'groupthink') {
    assert.equal(results.snapshot.game.groups[0]?.count, 2);
    assert.equal(results.snapshot.game.groups[0]?.points, 200);
  }

  const winner = manager.advanceGroupthink(room.roomCode, room.hostToken);
  assert.equal(winner.state.phase, 'winner');
  assert.equal(winner.state.players.find((player) => player.id === first.playerId)?.score, 200);
  assert.equal(winner.state.players.find((player) => player.id === second.playerId)?.score, 200);
});

test('automatically reveals Groupthink when the input deadline expires', async () => {
  const manager = new RoomManager({ groupthinkInputDurationMs: 15 });
  const room = manager.createRoom({ settings: { roundCount: 1 } });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Joe', avatar: '😎' });
  const resultsPhase = waitForRoomPhase(manager, room.roomCode, 'results');

  manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  await resultsPhase;

  const snapshot = manager.getRoomSnapshot(room.roomCode);
  assert.equal(snapshot.game?.id, 'groupthink');
  if (snapshot.game?.id === 'groupthink') {
    assert.equal(snapshot.game.inputDeadlineAt, null);
  }
});

test('runs Hot Take from anonymous answers through voting and winner scoring', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({ settings: { roundCount: 1 } });
  const first = manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' });
  const second = manager.joinRoom({ roomCode: room.roomCode, name: 'Blair', avatar: '👽' });
  const third = manager.joinRoom({ roomCode: room.roomCode, name: 'Casey', avatar: '🤖' });
  const started = manager.startGame(room.roomCode, room.hostToken, 'hot-take');

  assert.equal(started.state.phase, 'input');
  manager.submitAnswer(room.roomCode, first.playerId, 'Pizza');
  manager.submitAnswer(room.roomCode, second.playerId, 'Sushi');
  const voting = manager.submitAnswer(room.roomCode, third.playerId, 'Tacos');
  assert.equal(voting.snapshot.state.phase, 'voting');
  assert.equal(voting.snapshot.game?.id, 'hot-take');

  if (voting.snapshot.game?.id !== 'hot-take') throw new Error('Expected Hot Take state.');
  const pizza = voting.snapshot.game.entries.find((entry) => entry.answer === 'Pizza');
  const sushi = voting.snapshot.game.entries.find((entry) => entry.answer === 'Sushi');
  assert.ok(pizza);
  assert.ok(sushi);

  manager.castVote(room.roomCode, first.playerId, sushi.entryId);
  manager.castVote(room.roomCode, second.playerId, pizza.entryId);
  const results = manager.castVote(room.roomCode, third.playerId, pizza.entryId);
  assert.equal(results.snapshot.state.phase, 'results');

  const winner = manager.advanceRound(room.roomCode, room.hostToken);
  assert.equal(winner.state.phase, 'winner');
  assert.equal(winner.state.players.find((player) => player.id === first.playerId)?.score, 200);
  assert.equal(winner.state.players.find((player) => player.id === second.playerId)?.score, 100);
});

test('automatically resolves Hot Take with no submitted answers', async () => {
  const manager = new RoomManager({
    hotTakeInputDurationMs: 15,
    hotTakeVotingDurationMs: 15,
  });
  const room = manager.createRoom({ settings: { roundCount: 1 } });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Blair', avatar: '👽' });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Casey', avatar: '🤖' });
  const phases: string[] = [];
  const resultsPhase = waitForRoomPhase(manager, room.roomCode, 'results');
  manager.subscribe((roomCode, snapshot) => {
    if (roomCode === room.roomCode) phases.push(snapshot.state.phase);
  });

  manager.startGame(room.roomCode, room.hostToken, 'hot-take');
  await resultsPhase;
  assert.equal(phases.at(-1), 'results');
});

test('runs Suspect through private answers, accusations, and scoring', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({ gameId: 'suspect', settings: { roundCount: 1 } });
  const players = [
    manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' }),
    manager.joinRoom({ roomCode: room.roomCode, name: 'Blair', avatar: '👽' }),
    manager.joinRoom({ roomCode: room.roomCode, name: 'Casey', avatar: '🤖' }),
    manager.joinRoom({ roomCode: room.roomCode, name: 'Drew', avatar: '🐸' }),
  ];

  const started = manager.startGame(room.roomCode, room.hostToken, 'suspect');
  assert.equal(started.state.phase, 'input');
  assert.equal(started.game?.id, 'suspect');
  if (started.game?.id !== 'suspect') throw new Error('Expected Suspect state.');

  const firstAnswer = manager.submitAnswer(room.roomCode, players[0]!.playerId, 'yes');
  assert.equal(firstAnswer.snapshot.state.phase, 'input');
  assert.equal(firstAnswer.snapshot.game?.id, 'suspect');
  assert.equal(firstAnswer.snapshot.game?.matchedCount, 0);
  assert.equal(firstAnswer.playerState?.id, 'suspect');
  if (firstAnswer.playerState?.id === 'suspect')
    assert.equal(firstAnswer.playerState.ownAnswer, true);

  manager.submitAnswer(room.roomCode, players[1]!.playerId, 'no');
  manager.submitAnswer(room.roomCode, players[2]!.playerId, 'no');
  const voting = manager.submitAnswer(room.roomCode, players[3]!.playerId, 'no');
  assert.equal(voting.snapshot.state.phase, 'voting');

  manager.castVote(room.roomCode, players[0]!.playerId, `player:${players[1]!.playerId}`);
  manager.castVote(room.roomCode, players[1]!.playerId, `player:${players[0]!.playerId}`);
  manager.castVote(room.roomCode, players[2]!.playerId, `player:${players[0]!.playerId}`);
  const results = manager.castVote(
    room.roomCode,
    players[3]!.playerId,
    `player:${players[1]!.playerId}`,
  );
  assert.equal(results.snapshot.state.phase, 'results');
  assert.equal(results.snapshot.game?.id, 'suspect');
  if (results.snapshot.game?.id === 'suspect') {
    assert.deepEqual(results.snapshot.game.selectedPlayerIds, [players[0]!.playerId]);
    assert.equal(
      results.snapshot.game.roundScores.find((score) => score.playerId === players[1]!.playerId)
        ?.points,
      100,
    );
    assert.equal(
      results.snapshot.game.roundScores.find((score) => score.playerId === players[2]!.playerId)
        ?.points,
      100,
    );
  }

  const winner = manager.advanceRound(room.roomCode, room.hostToken);
  assert.equal(winner.state.phase, 'winner');
  assert.equal(
    winner.state.players.find((player) => player.id === players[1]!.playerId)?.score,
    100,
  );
  manager.close();
});

test('runs Drawn Out Classic through drawing, guesses, and winner scoring', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({
    gameId: 'drawn-out',
    settings: { roundCount: 1, drawnOutMode: 'classic', contentMode: 'family' },
  });
  const players = [
    manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' }),
    manager.joinRoom({ roomCode: room.roomCode, name: 'Blair', avatar: '👽' }),
    manager.joinRoom({ roomCode: room.roomCode, name: 'Casey', avatar: '🤖' }),
  ];
  const started = manager.startGame(room.roomCode, room.hostToken, 'drawn-out');
  assert.equal(started.state.phase, 'input');
  assert.equal(started.game?.id, 'drawn-out');
  if (started.game?.id !== 'drawn-out') throw new Error('Expected Drawn Out state.');
  assert.equal(started.game.prompt, null);
  const artistId = started.game.artistPlayerId!;
  const artist = players.find((player) => player.playerId === artistId)!;
  const drawing = {
    strokes: [
      {
        color: '#ff2ea6',
        width: 0.012,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.8, y: 0.8 },
        ],
      },
    ],
  };
  const guessing = manager.submitDrawing(room.roomCode, artist.playerId, drawing);
  assert.equal(guessing.snapshot.state.phase, 'voting');
  const guessers = players.filter((player) => player.playerId !== artistId);
  manager.submitAnswer(room.roomCode, guessers[0]!.playerId, 'raccoon pancake restaurant');
  const results = manager.submitAnswer(room.roomCode, guessers[1]!.playerId, 'sleepy airplane');
  assert.equal(results.snapshot.state.phase, 'results');
  assert.equal(results.snapshot.game?.id, 'drawn-out');
  const winner = manager.advanceRound(room.roomCode, room.hostToken);
  assert.equal(winner.state.phase, 'winner');
  assert.equal(
    winner.state.players.find((player) => player.id === guessers[0]!.playerId)?.score,
    100,
  );
  manager.close();
});

function waitForRoomPhase(manager: RoomManager, roomCode: string, phase: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const state: {
      unsubscribe: () => void;
      timeout?: ReturnType<typeof setTimeout>;
    } = {
      unsubscribe: () => undefined,
    };
    state.timeout = setTimeout(() => {
      state.unsubscribe();
      reject(new Error(`Timed out waiting for room ${roomCode} to reach ${phase}.`));
    }, 1_000);

    state.unsubscribe = manager.subscribe((observedRoomCode, snapshot) => {
      if (observedRoomCode !== roomCode || snapshot.state.phase !== phase) return;
      if (state.timeout) clearTimeout(state.timeout);
      state.unsubscribe();
      resolve();
    });
  });
}
