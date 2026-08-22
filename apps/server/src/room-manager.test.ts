import assert from 'node:assert/strict';
import test from 'node:test';

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

test('marks a connected player offline when their socket disconnects', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({});
  const joined = manager.joinRoom({ roomCode: room.roomCode, name: 'Sarah', avatar: '👽' });
  manager.bindPlayer(room.roomCode, joined.playerId, 'socket-1');

  const state = manager.disconnectSocket('socket-1');
  assert.equal(state?.state.players[0]?.status, 'disconnected');
});

test('runs Groupthink from input through results, scoring, and winner', () => {
  const manager = new RoomManager();
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
  let observedPhase: string | undefined;
  manager.subscribe((roomCode, snapshot) => {
    if (roomCode === room.roomCode) observedPhase = snapshot.state.phase;
  });

  manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(observedPhase, 'results');
  const snapshot = manager.getRoomSnapshot(room.roomCode);
  assert.equal(snapshot.game?.id, 'groupthink');
  if (snapshot.game?.id === 'groupthink') {
    assert.equal(snapshot.game.inputDeadlineAt, null);
  }
});

test('runs Hot Take from anonymous answers through voting and winner scoring', () => {
  const manager = new RoomManager();
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

test('automatically advances Hot Take from answer deadline to vote deadline', async () => {
  const manager = new RoomManager({
    hotTakeInputDurationMs: 15,
    hotTakeVotingDurationMs: 15,
  });
  const room = manager.createRoom({ settings: { roundCount: 1 } });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Blair', avatar: '👽' });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Casey', avatar: '🤖' });
  const phases: string[] = [];
  let resolveVoting!: () => void;
  let resolveResults!: () => void;
  const votingPhase = new Promise<void>((resolve) => {
    resolveVoting = resolve;
  });
  const resultsPhase = new Promise<void>((resolve) => {
    resolveResults = resolve;
  });
  manager.subscribe((roomCode, snapshot) => {
    if (roomCode === room.roomCode) phases.push(snapshot.state.phase);
    if (roomCode !== room.roomCode) return;
    if (snapshot.state.phase === 'voting') resolveVoting();
    if (snapshot.state.phase === 'results') resolveResults();
  });

  manager.startGame(room.roomCode, room.hostToken, 'hot-take');
  await votingPhase;
  assert.equal(phases.at(-1), 'voting');
  await resultsPhase;
  assert.equal(phases.at(-1), 'results');
});
