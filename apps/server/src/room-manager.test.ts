import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  GAME_PLAYER_LIMITS,
  PlayerGameViewSchema,
  RoomSnapshotSchema,
  getGamePlayerLimits,
} from '@room-riot/contracts';
import type { DrawnOutMode, RoomCode, SupportedGameId } from '@room-riot/contracts';

import {
  generateDrawnOutPrompts,
  generateGroupthinkPrompts,
  generateHotTakePrompts,
} from './prompt-generator.js';
import { RoomManager, RoomManagerError } from './room-manager.js';
import { RoomPersistence } from './room-persistence.js';

function joinPlayers(manager: RoomManager, roomCode: RoomCode, count: number, offset = 0): void {
  for (let index = 0; index < count; index += 1) {
    manager.joinRoom({
      roomCode,
      name: `Player ${offset + index + 1}`,
      avatar: '🎮',
    });
  }
}

function isPlayerLimitError(error: unknown): boolean {
  return error instanceof RoomManagerError && error.code === 'PLAYER_LIMIT';
}

test('creates a room with a valid host token and lobby state', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({});

  assert.match(room.roomCode, /^[A-Z0-9]{4,6}$/);
  assert.equal(room.roomCode.length, 6);
  assert.match(room.hostToken, /^[0-9a-f-]{36}$/);
  assert.equal(room.snapshot.state.roomCode, room.roomCode);
  assert.equal(room.snapshot.state.phase, 'lobby');
  assert.equal(room.snapshot.state.settings.maxPlayers, 12);
});

test('host join lock rejects new players and can be lifted', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({});
  const locked = manager.setJoinLocked(room.roomCode, room.hostToken, true);
  assert.equal(locked.state.settings.joinLocked, true);
  assert.throws(
    () => manager.joinRoom({ roomCode: room.roomCode, name: 'Blocked', avatar: '🎮' }),
    (error: unknown) => error instanceof RoomManagerError && error.code === 'INVALID_STATE',
  );
  manager.setJoinLocked(room.roomCode, room.hostToken, false);
  assert.equal(
    manager.joinRoom({ roomCode: room.roomCode, name: 'Allowed', avatar: '🎮' }).snapshot.state
      .players.length,
    1,
  );
  manager.close();
});

test('host can pause and resume active games without consuming the deadline', () => {
  const manager = new RoomManager({ groupthinkInputDurationMs: 100, randomizePrompts: false });
  const room = manager.createRoom({});
  const players = [1, 2, 3].map((index) =>
    manager.joinRoom({ roomCode: room.roomCode, name: `Player ${index}`, avatar: '🎮' }),
  );
  manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  const paused = manager.setPaused(room.roomCode, room.hostToken, true);
  assert.equal(paused.state.paused, true);
  assert.equal(paused.state.pauseStartedAt !== null, true);
  assert.throws(() => manager.submitAnswer(room.roomCode, players[0]!.playerId, 'blocked'), {
    code: 'INVALID_STATE',
  });
  const resumed = manager.setPaused(room.roomCode, room.hostToken, false);
  assert.equal(resumed.state.paused, false);
  assert.equal(resumed.state.pauseStartedAt, null);
  manager.close();
});

test('host can explicitly skip disconnected players during an active round', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({});
  const player = manager.joinRoom({ roomCode: room.roomCode, name: 'Offline', avatar: '🎮' });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Online', avatar: '🎮' });
  manager.joinRoom({ roomCode: room.roomCode, name: 'Online 2', avatar: '🎮' });
  manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  manager.bindPlayer(room.roomCode, player.playerId, 'offline-socket');
  manager.disconnectSocket('offline-socket');
  const skipped = manager.skipDisconnected(room.roomCode, room.hostToken);
  assert.equal(
    skipped.state.players.find((entry) => entry.id === player.playerId)?.status,
    'removed',
  );
  assert.equal(
    skipped.state.players.some((entry) => entry.status === 'disconnected'),
    false,
  );
  manager.close();
});

test('host can disable drawing input for accessibility constraints', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({ settings: { maxPlayers: 10, drawnOutMode: 'telephone' } });
  const players = [1, 2, 3].map((index) =>
    manager.joinRoom({ roomCode: room.roomCode, name: `Player ${index}`, avatar: '🎮' }),
  );
  manager.startGame(room.roomCode, room.hostToken, 'drawn-out');
  const disabled = manager.setDrawingEnabled(room.roomCode, room.hostToken, false);
  assert.equal(disabled.state.settings.drawingEnabled, false);
  assert.throws(
    () => manager.submitDrawing(room.roomCode, players[0]!.playerId, { strokes: [] } as never),
    /Drawing input is disabled/,
  );
  manager.close();
});

test('drawing accessibility setting does not disable text answers', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({
    gameId: 'groupthink',
    settings: { maxPlayers: 2, roundCount: 1, drawingEnabled: false },
  });
  const first = manager.joinRoom({ roomCode: room.roomCode, name: 'Text Player', avatar: '🎮' });
  const second = manager.joinRoom({ roomCode: room.roomCode, name: 'Text Player 2', avatar: '🎮' });
  manager.startGame(room.roomCode, room.hostToken, 'groupthink');

  const submitted = manager.submitAnswer(room.roomCode, first.playerId, 'still available');
  assert.equal(submitted.snapshot.game?.submittedCount, 1);
  const results = manager.submitAnswer(room.roomCode, second.playerId, 'still available');
  assert.equal(results.snapshot.state.phase, 'results');
  manager.close();
});

test('restores persisted rooms and authenticates hashed tokens after restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'room-riot-'));
  const databasePath = join(directory, 'rooms.sqlite');
  const first = new RoomManager({ persistencePath: databasePath, randomizePrompts: false });
  const room = first.createRoom({});
  const player = first.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' });
  first.close();

  const restored = new RoomManager({ persistencePath: databasePath, randomizePrompts: false });
  assert.equal(restored.hasRoom(room.roomCode), true);
  assert.equal(restored.getPlayerIdForToken(room.roomCode, player.playerToken), player.playerId);
  assert.equal(restored.reconnectHost(room.roomCode, room.hostToken).state.roomCode, room.roomCode);
  restored.close();
  rmSync(directory, { recursive: true, force: true });
});

test('coalesces persistence writes outside snapshot generation and flushes on the next turn', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'room-riot-queued-persistence-'));
  const databasePath = join(directory, 'rooms.sqlite');
  const manager = new RoomManager({ persistencePath: databasePath });
  const room = manager.createRoom({});
  const observer = new RoomPersistence(databasePath);
  assert.equal(
    observer.load().some((record) => record.roomCode === room.roomCode),
    false,
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(
    observer.load().some((record) => record.roomCode === room.roomCode),
    true,
  );
  assert.equal(manager.getOperationalStatus().persistenceWriteFailures, 0);
  observer.close();
  manager.close();
  rmSync(directory, { recursive: true, force: true });
});

test('ignores corrupt persisted snapshots and exposes a recovery signal', () => {
  const directory = mkdtempSync(join(tmpdir(), 'room-riot-corrupt-'));
  const databasePath = join(directory, 'rooms.sqlite');
  const persistence = new RoomPersistence(databasePath);
  persistence.save({ roomCode: 'ABC123', payload: '{"not":"a room"}', updatedAt: Date.now() });
  persistence.close();
  const manager = new RoomManager({ persistencePath: databasePath });
  assert.equal(manager.hasRoom('ABC123'), false);
  assert.equal(manager.getOperationalStatus().persistenceRecoveryIssues, 1);
  manager.close();
  rmSync(directory, { recursive: true, force: true });
});

test('increments room revisions only when authoritative visible state changes', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({ gameId: 'groupthink', settings: { roundCount: 1 } });
  const createdRevision = room.snapshot.revision;
  assert.ok(Number.isInteger(createdRevision) && createdRevision > 0);
  assert.equal(manager.getRoomSnapshot(room.roomCode).revision, createdRevision);

  const joined = manager.joinRoom({
    roomCode: room.roomCode,
    name: 'Revision Tester',
    avatar: '🎮',
  });
  assert.ok(joined.snapshot.revision > createdRevision);
  assert.equal(manager.getRoomSnapshot(room.roomCode).revision, joined.snapshot.revision);

  const started = manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  assert.ok(started.revision > joined.snapshot.revision);
  assert.equal(manager.reconnectHost(room.roomCode, room.hostToken).revision, started.revision);
  manager.close();
});

test('publishes the selected game while the room is in the lobby', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({ gameId: 'hot-take' });

  assert.equal(room.snapshot.state.phase, 'lobby');
  assert.equal(room.snapshot.state.gameId, 'hot-take');
  assert.equal(room.snapshot.game, null);
});

test('projects schema-valid public and private snapshots for every game', () => {
  const gameIds: readonly SupportedGameId[] = [
    'groupthink',
    'hot-take',
    'suspect',
    'drawn-out',
    'blank-line',
  ];
  for (const gameId of gameIds) {
    const manager = new RoomManager({ randomizePrompts: false });
    const room = manager.createRoom({ gameId });
    const minimum = getGamePlayerLimits(gameId).minimum;
    joinPlayers(manager, room.roomCode, minimum);
    const started = manager.startGame(room.roomCode, room.hostToken, gameId);
    assert.doesNotThrow(() => RoomSnapshotSchema.parse(started));
    const playerId = started.roster.roundPlayerIds[0];
    assert.ok(playerId);
    assert.doesNotThrow(() =>
      PlayerGameViewSchema.parse(manager.getPlayerState(room.roomCode, playerId)),
    );
    manager.close();
  }
});

test('uses shared per-game limits for selected-room defaults and capacity validation', () => {
  const cases: readonly {
    gameId: SupportedGameId;
    drawnOutMode?: DrawnOutMode;
  }[] = [
    { gameId: 'groupthink' },
    { gameId: 'hot-take' },
    { gameId: 'suspect' },
    { gameId: 'drawn-out', drawnOutMode: 'classic' },
    { gameId: 'drawn-out', drawnOutMode: 'telephone' },
    { gameId: 'drawn-out', drawnOutMode: 'fake-artist' },
    { gameId: 'blank-line' },
  ];

  for (const { gameId, drawnOutMode } of cases) {
    const manager = new RoomManager();
    const limits = getGamePlayerLimits(gameId, drawnOutMode);
    const modeSettings = drawnOutMode ? { drawnOutMode } : {};

    const defaultRoom = manager.createRoom({ gameId, settings: modeSettings });
    assert.equal(defaultRoom.snapshot.state.settings.maxPlayers, limits.maximum);

    const minimumRoom = manager.createRoom({
      gameId,
      settings: { ...modeSettings, maxPlayers: limits.minimum },
    });
    assert.equal(minimumRoom.snapshot.state.settings.maxPlayers, limits.minimum);

    const maximumRoom = manager.createRoom({
      gameId,
      settings: { ...modeSettings, maxPlayers: limits.maximum },
    });
    assert.equal(maximumRoom.snapshot.state.settings.maxPlayers, limits.maximum);

    if (limits.minimum > 1) {
      assert.throws(
        () =>
          manager.createRoom({
            gameId,
            settings: { ...modeSettings, maxPlayers: limits.minimum - 1 },
          }),
        isPlayerLimitError,
      );
    }
    assert.throws(
      () =>
        manager.createRoom({
          gameId,
          settings: { ...modeSettings, maxPlayers: limits.maximum + 1 },
        }),
      isPlayerLimitError,
    );
    manager.close();
  }

  assert.equal(GAME_PLAYER_LIMITS.groupthink.minimum, 1);
  assert.equal(GAME_PLAYER_LIMITS['drawn-out'].classic.maximum, 10);
});

test('enforces every game player-count boundary when starting', () => {
  const cases: readonly {
    gameId: SupportedGameId;
    drawnOutMode?: DrawnOutMode;
  }[] = [
    { gameId: 'groupthink' },
    { gameId: 'hot-take' },
    { gameId: 'suspect' },
    { gameId: 'drawn-out', drawnOutMode: 'classic' },
    { gameId: 'drawn-out', drawnOutMode: 'telephone' },
    { gameId: 'drawn-out', drawnOutMode: 'fake-artist' },
  ];

  for (const { gameId, drawnOutMode } of cases) {
    const limits = getGamePlayerLimits(gameId, drawnOutMode);
    const manager = new RoomManager({ randomizePrompts: false });
    const room = manager.createRoom({
      gameId,
      settings: {
        ...(drawnOutMode ? { drawnOutMode } : {}),
        maxPlayers: limits.maximum,
        roundCount: 1,
      },
    });
    joinPlayers(manager, room.roomCode, limits.minimum - 1);
    assert.throws(
      () => manager.startGame(room.roomCode, room.hostToken, gameId),
      isPlayerLimitError,
    );
    joinPlayers(manager, room.roomCode, 1, limits.minimum - 1);
    const started = manager.startGame(room.roomCode, room.hostToken, gameId);
    assert.equal(started.state.players.length, limits.minimum);
    manager.close();

    const maximumManager = new RoomManager({ randomizePrompts: false });
    const maximumRoom = maximumManager.createRoom({
      gameId,
      settings: {
        ...(drawnOutMode ? { drawnOutMode } : {}),
        maxPlayers: limits.maximum,
        roundCount: 1,
      },
    });
    joinPlayers(maximumManager, maximumRoom.roomCode, limits.maximum);
    const maximumStarted = maximumManager.startGame(
      maximumRoom.roomCode,
      maximumRoom.hostToken,
      gameId,
    );
    assert.equal(maximumStarted.state.players.length, limits.maximum);
    maximumManager.close();

    const overCapacityManager = new RoomManager({ randomizePrompts: false });
    const overCapacityRoom = overCapacityManager.createRoom({
      settings: { maxPlayers: 32, roundCount: 1, ...(drawnOutMode ? { drawnOutMode } : {}) },
    });
    joinPlayers(overCapacityManager, overCapacityRoom.roomCode, limits.maximum + 1);
    assert.throws(
      () =>
        overCapacityManager.startGame(
          overCapacityRoom.roomCode,
          overCapacityRoom.hostToken,
          gameId,
        ),
      isPlayerLimitError,
    );
    overCapacityManager.close();
  }
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
  manager.joinRoom({ roomCode: firstRoom.roomCode, name: 'Alex', avatar: '😎' });
  manager.joinRoom({ roomCode: secondRoom.roomCode, name: 'Blair', avatar: '👽' });

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
  manager.joinRoom({ roomCode: firstRoom.roomCode, name: 'Alex', avatar: '😎' });
  manager.joinRoom({ roomCode: secondRoom.roomCode, name: 'Blair', avatar: '👽' });

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

test('freezes the active roster and activates late joins at the next round for every game', () => {
  const cases: readonly {
    gameId: SupportedGameId;
    drawnOutMode?: DrawnOutMode;
  }[] = [
    { gameId: 'groupthink' },
    { gameId: 'hot-take' },
    { gameId: 'suspect' },
    { gameId: 'drawn-out', drawnOutMode: 'classic' },
  ];

  for (const { gameId, drawnOutMode } of cases) {
    const manager = new RoomManager({ randomizePrompts: false });
    const limits = getGamePlayerLimits(gameId, drawnOutMode);
    const room = manager.createRoom({
      gameId,
      settings: {
        roundCount: 2,
        ...(drawnOutMode ? { drawnOutMode } : {}),
      },
    });
    joinPlayers(manager, room.roomCode, limits.minimum);
    const started = manager.startGame(room.roomCode, room.hostToken, gameId);
    const initialRoundPlayerIds = started.roster.roundPlayerIds;
    assert.equal(initialRoundPlayerIds.length, limits.minimum);
    assert.deepEqual(started.roster.queuedPlayerIds, []);

    const latePlayer = manager.joinRoom({
      roomCode: room.roomCode,
      name: 'Late Player',
      avatar: '⏳',
    });
    assert.equal(latePlayer.playerState, null);
    assert.deepEqual(latePlayer.snapshot.roster.roundPlayerIds, initialRoundPlayerIds);
    assert.deepEqual(latePlayer.snapshot.roster.queuedPlayerIds, [latePlayer.playerId]);
    assert.equal(latePlayer.snapshot.game?.totalPlayers, limits.minimum);

    const reconnected = manager.joinRoom({
      roomCode: room.roomCode,
      name: 'Ignored reconnect name',
      avatar: '🎮',
      playerToken: latePlayer.playerToken,
    });
    assert.equal(reconnected.playerId, latePlayer.playerId);
    assert.equal(reconnected.snapshot.state.players.length, limits.minimum + 1);
    assert.deepEqual(reconnected.snapshot.roster.queuedPlayerIds, [latePlayer.playerId]);

    assert.throws(
      () =>
        manager.submitAnswer(
          room.roomCode,
          latePlayer.playerId,
          gameId === 'suspect' ? 'yes' : 'spectator answer',
        ),
      (error: unknown) =>
        error instanceof RoomManagerError &&
        error.code === 'INVALID_STATE' &&
        /spectating.*next round/i.test(error.message),
    );
    assert.equal(manager.getRoomSnapshot(room.roomCode).game?.totalPlayers, limits.minimum);

    let results = manager.getRoomSnapshot(room.roomCode);
    for (let step = 0; results.state.phase !== 'results' && step < 20; step += 1) {
      results = manager.revealResults(room.roomCode, room.hostToken);
    }
    assert.equal(results.state.phase, 'results', `${gameId} did not reach results`);

    const nextRound = manager.advanceRound(room.roomCode, room.hostToken);
    assert.equal(nextRound.roster.roundPlayerIds.length, limits.minimum + 1);
    assert.ok(nextRound.roster.roundPlayerIds.includes(latePlayer.playerId));
    assert.deepEqual(nextRound.roster.queuedPlayerIds, []);
    assert.equal(nextRound.game?.totalPlayers, limits.minimum + 1);
    assert.notEqual(manager.getPlayerState(room.roomCode, latePlayer.playerId), null);
    manager.close();
  }
});

test('requires the host token to start a game', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({});
  manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' });

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
  const manager = new RoomManager({ reconnectGraceMs: 5_000 });
  const room = manager.createRoom({});
  const joined = manager.joinRoom({ roomCode: room.roomCode, name: 'Sarah', avatar: '👽' });
  manager.bindPlayer(room.roomCode, joined.playerId, 'socket-1');

  const state = manager.disconnectSocket('socket-1');
  assert.equal(state?.state.players[0]?.status, 'disconnected');
  assert.equal(state?.state.players[0]?.disconnectedAt !== null, true);
  assert.equal(
    (state?.state.players[0]?.reconnectDeadlineAt ?? 0) -
      (state?.state.players[0]?.disconnectedAt ?? 0),
    5_000,
  );
  manager.close();
});

test('reconnects during grace with the same identity and prior submission', () => {
  const manager = new RoomManager({ randomizePrompts: false, reconnectGraceMs: 5_000 });
  const room = manager.createRoom({ gameId: 'groupthink', settings: { roundCount: 1 } });
  const player = manager.joinRoom({ roomCode: room.roomCode, name: 'Sarah', avatar: '👽' });
  const other = manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' });
  manager.bindPlayer(room.roomCode, player.playerId, 'socket-1');
  manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  manager.submitAnswer(room.roomCode, player.playerId, 'preserved answer');
  const disconnected = manager.disconnectSocket('socket-1');
  const deadline = disconnected?.state.players.find(
    (candidate) => candidate.id === player.playerId,
  )?.reconnectDeadlineAt;
  assert.ok(deadline);

  const rejoined = manager.joinRoom({
    roomCode: room.roomCode,
    name: 'Ignored name',
    avatar: '🎮',
    playerToken: player.playerToken,
  });
  manager.bindPlayer(room.roomCode, rejoined.playerId, 'socket-2');
  assert.equal(rejoined.playerId, player.playerId);
  assert.equal(
    rejoined.snapshot.state.players.find((candidate) => candidate.id === player.playerId)?.status,
    'connected',
  );
  assert.equal(manager.expireDisconnectedPlayers(deadline + 1), 0);

  const results = manager.submitAnswer(room.roomCode, other.playerId, 'preserved answer');
  assert.equal(results.snapshot.state.phase, 'results');
  assert.equal(results.snapshot.game?.submittedCount, 2);
  manager.close();
});

test('expires disconnected active players across every game and revokes their seat', () => {
  const cases: readonly SupportedGameId[] = ['groupthink', 'hot-take', 'suspect', 'drawn-out'];

  for (const gameId of cases) {
    const manager = new RoomManager({ randomizePrompts: false, reconnectGraceMs: 5_000 });
    const minimum = getGamePlayerLimits(gameId).minimum;
    const room = manager.createRoom({ gameId, settings: { roundCount: 1 } });
    const players = Array.from({ length: minimum }, (_, index) =>
      manager.joinRoom({
        roomCode: room.roomCode,
        name: `Player ${index + 1}`,
        avatar: '🎮',
      }),
    );
    const dropped = players.at(-1);
    if (!dropped) throw new Error('Expected an active player.');
    manager.bindPlayer(room.roomCode, dropped.playerId, `${gameId}-socket`);
    manager.startGame(room.roomCode, room.hostToken, gameId);

    if (gameId === 'groupthink') {
      players
        .slice(0, -1)
        .forEach((player) => manager.submitAnswer(room.roomCode, player.playerId, 'same answer'));
    }

    const disconnected = manager.disconnectSocket(`${gameId}-socket`);
    const deadline = disconnected?.state.players.find(
      (candidate) => candidate.id === dropped.playerId,
    )?.reconnectDeadlineAt;
    assert.ok(deadline);
    assert.equal(manager.expireDisconnectedPlayers(deadline + 1), 1);

    const snapshot = manager.getRoomSnapshot(room.roomCode);
    assert.equal(
      snapshot.state.players.find((candidate) => candidate.id === dropped.playerId)?.status,
      'removed',
    );
    if (gameId !== 'drawn-out') assert.equal(snapshot.game?.totalPlayers, minimum - 1);
    if (gameId === 'groupthink') assert.equal(snapshot.state.phase, 'results');
    assert.throws(
      () => manager.getPlayerIdForToken(room.roomCode, dropped.playerToken),
      (error: unknown) => error instanceof RoomManagerError && error.code === 'UNAUTHORIZED',
    );
    manager.close();
  }
});

test('voluntary leave revokes the token and immediately frees room capacity', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({ settings: { maxPlayers: 1 } });
  const joined = manager.joinRoom({ roomCode: room.roomCode, name: 'Sarah', avatar: '👽' });
  manager.bindPlayer(room.roomCode, joined.playerId, 'socket-1');

  const removed = manager.leavePlayer(room.roomCode, joined.playerToken);
  assert.equal(removed.playerId, joined.playerId);
  assert.equal(removed.socketId, 'socket-1');
  assert.deepEqual(removed.snapshot.state.players, []);
  assert.throws(
    () => manager.getPlayerIdForToken(room.roomCode, joined.playerToken),
    (error: unknown) => error instanceof RoomManagerError && error.code === 'UNAUTHORIZED',
  );
  assert.throws(
    () =>
      manager.joinRoom({
        roomCode: room.roomCode,
        name: 'Sarah',
        avatar: '👽',
        playerToken: joined.playerToken,
      }),
    (error: unknown) => error instanceof RoomManagerError && error.code === 'UNAUTHORIZED',
  );

  const replacement = manager.joinRoom({
    roomCode: room.roomCode,
    name: 'Replacement',
    avatar: '🎮',
  });
  assert.notEqual(replacement.playerId, joined.playerId);
  manager.close();
});

test('host removal preserves a frozen-round tombstone without blocking completion or scoring', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({ settings: { maxPlayers: 2, roundCount: 2 } });
  const active = manager.joinRoom({ roomCode: room.roomCode, name: 'Active', avatar: '😎' });
  const removed = manager.joinRoom({ roomCode: room.roomCode, name: 'Removed', avatar: '👽' });
  manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  manager.submitAnswer(room.roomCode, active.playerId, 'same');

  const result = manager.removePlayerByHost(room.roomCode, room.hostToken, removed.playerId);
  assert.equal(result.snapshot.state.phase, 'results');
  assert.equal(
    result.snapshot.state.players.find((player) => player.id === removed.playerId)?.status,
    'removed',
  );
  assert.ok(result.snapshot.roster.roundPlayerIds.includes(removed.playerId));
  assert.equal(result.snapshot.game?.totalPlayers, 1);
  assert.throws(
    () => manager.getPlayerIdForToken(room.roomCode, removed.playerToken),
    (error: unknown) => error instanceof RoomManagerError && error.code === 'UNAUTHORIZED',
  );

  const queued = manager.joinRoom({ roomCode: room.roomCode, name: 'Queued', avatar: '🎮' });
  assert.ok(
    manager.getRoomSnapshot(room.roomCode).roster.queuedPlayerIds.includes(queued.playerId),
  );
  const next = manager.advanceRound(room.roomCode, room.hostToken);
  assert.equal(
    next.state.players.some((player) => player.id === removed.playerId),
    false,
  );
  assert.deepEqual(
    new Set(next.roster.roundPlayerIds),
    new Set([active.playerId, queued.playerId]),
  );
  assert.equal(next.state.players.find((player) => player.id === active.playerId)?.score, 0);
  manager.close();
});

test('closing a room invalidates host and player sessions', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({});
  const player = manager.joinRoom({ roomCode: room.roomCode, name: 'Alex', avatar: '😎' });
  manager.bindHost(room.roomCode, room.hostToken, 'host-socket');
  manager.bindPlayer(room.roomCode, player.playerId, 'player-socket');

  const closed = manager.closeRoom(room.roomCode, room.hostToken);
  assert.deepEqual(new Set(closed.socketIds), new Set(['host-socket', 'player-socket']));
  assert.equal(manager.hasRoom(room.roomCode), false);
  assert.throws(
    () => manager.reconnectHost(room.roomCode, room.hostToken),
    (error: unknown) => error instanceof RoomManagerError && error.code === 'ROOM_NOT_FOUND',
  );
  assert.throws(
    () => manager.getPlayerIdForToken(room.roomCode, player.playerToken),
    (error: unknown) => error instanceof RoomManagerError && error.code === 'ROOM_NOT_FOUND',
  );
  manager.close();
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
  assert.equal(started.game.promptId, null);
  const artistId = started.game.artistPlayerId!;
  const artist = players.find((player) => player.playerId === artistId)!;
  const artistState = manager.getPlayerState(room.roomCode, artistId);
  assert.equal(artistState?.id, 'drawn-out');
  if (artistState?.id !== 'drawn-out') throw new Error('Expected Drawn Out artist state.');
  const privatePrompt = artistState.privatePrompt;
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
  const guesserState = manager.getPlayerState(room.roomCode, guessers[0]!.playerId);
  assert.equal(guesserState?.id, 'drawn-out');
  if (guesserState?.id !== 'drawn-out') throw new Error('Expected Drawn Out player state.');
  assert.equal(guesserState.guessOptions.length, 4);
  const correctOption = guesserState.guessOptions.find((option) => option.text === privatePrompt)!;
  const wrongOption = guesserState.guessOptions.find((option) => option.id !== correctOption.id)!;
  manager.submitAnswer(room.roomCode, guessers[0]!.playerId, correctOption.id);
  const results = manager.submitAnswer(room.roomCode, guessers[1]!.playerId, wrongOption.id);
  assert.equal(results.snapshot.state.phase, 'results');
  assert.equal(results.snapshot.game?.id, 'drawn-out');
  const winner = manager.advanceRound(room.roomCode, room.hostToken);
  assert.equal(winner.state.phase, 'winner');
  assert.equal(
    winner.state.players.find((player) => player.id === guessers[0]!.playerId)?.score,
    100,
  );
  const rematch = manager.rematch(room.roomCode, room.hostToken, 'drawn-out', false);
  assert.equal(rematch.state.phase, 'lobby');
  assert.equal(
    rematch.state.players.every((player) => player.score === 0),
    true,
  );
  players.forEach((player) => manager.setPlayerReady(room.roomCode, player.playerToken, true));
  const restarted = manager.startGame(room.roomCode, room.hostToken, 'drawn-out');
  assert.equal(restarted.state.phase, 'input');
  manager.close();
});

test('runs Blank Line through two live circuits, private roles, voting, and reveal', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({
    gameId: 'blank-line',
    settings: { roundCount: 1, contentMode: 'family' },
  });
  const players = ['Alex', 'Blair', 'Casey'].map((name) =>
    manager.joinRoom({ roomCode: room.roomCode, name, avatar: '🎨' }),
  );
  let snapshot = manager.startGame(room.roomCode, room.hostToken, 'blank-line');
  assert.equal(snapshot.game?.id, 'blank-line');
  if (snapshot.game?.id !== 'blank-line') throw new Error('Expected Blank Line state.');
  assert.equal(snapshot.game.prompt, null);
  assert.equal(snapshot.game.blankPlayerId, null);

  const privateStates = players.map((player) => ({
    player,
    state: manager.getPlayerState(room.roomCode, player.playerId),
  }));
  const blank = privateStates.find(
    (entry) => entry.state?.id === 'blank-line' && entry.state.isBlank,
  );
  assert.ok(blank);
  assert.equal(blank.state?.id === 'blank-line' ? blank.state.privatePrompt : 'unexpected', null);
  assert.equal(
    privateStates.filter(
      (entry) => entry.state?.id === 'blank-line' && entry.state.privatePrompt !== null,
    ).length,
    2,
  );

  const stroke = {
    strokes: [
      {
        color: '#ffffff',
        width: 0.012,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.7, y: 0.8 },
        ],
      },
    ],
  };
  for (let turn = 0; turn < 6; turn += 1) {
    if (snapshot.game?.id !== 'blank-line') throw new Error('Expected Blank Line drawing.');
    const activePlayerId = snapshot.game.activePlayerId;
    assert.ok(activePlayerId);
    snapshot = manager.submitDrawing(room.roomCode, activePlayerId, stroke).snapshot;
    assert.equal(
      snapshot.game?.id === 'blank-line' ? snapshot.game.drawing.strokes.length : -1,
      turn + 1,
    );
  }
  assert.equal(snapshot.state.phase, 'voting');

  const blankId = blank.player.playerId;
  const informedPlayers = players.filter((player) => player.playerId !== blankId);
  manager.castVote(room.roomCode, informedPlayers[0]!.playerId, blankId);
  manager.castVote(room.roomCode, blankId, informedPlayers[0]!.playerId);
  const results = manager.castVote(room.roomCode, informedPlayers[1]!.playerId, blankId);
  assert.equal(results.snapshot.state.phase, 'results');
  assert.equal(results.snapshot.game?.id, 'blank-line');
  if (results.snapshot.game?.id !== 'blank-line') throw new Error('Expected Blank Line reveal.');
  assert.equal(results.snapshot.game.blankCaught, true);
  assert.equal(results.snapshot.game.blankPlayerId, blankId);
  assert.ok(results.snapshot.game.prompt);
  assert.equal(manager.advanceRound(room.roomCode, room.hostToken).state.phase, 'winner');
  manager.close();
});

test('rematch applies adjusted settings without replacing the roster', () => {
  const manager = new RoomManager({ randomizePrompts: false });
  const room = manager.createRoom({
    gameId: 'groupthink',
    settings: { maxPlayers: 2, roundCount: 1 },
  });
  const first = manager.joinRoom({ roomCode: room.roomCode, name: 'First', avatar: '😎' });
  const second = manager.joinRoom({ roomCode: room.roomCode, name: 'Second', avatar: '👽' });
  manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  manager.submitAnswer(room.roomCode, first.playerId, 'same');
  manager.submitAnswer(room.roomCode, second.playerId, 'same');
  manager.advanceRound(room.roomCode, room.hostToken);

  const rematch = manager.rematch(room.roomCode, room.hostToken, 'groupthink', false, {
    roundCount: 3,
    contentMode: 'after-dark',
  });
  assert.equal(rematch.state.phase, 'lobby');
  assert.equal(rematch.state.settings.roundCount, 3);
  assert.equal(rematch.state.settings.contentMode, 'after-dark');
  assert.deepEqual(
    rematch.state.players.map((player) => player.id),
    [first.playerId, second.playerId],
  );
  assert.throws(
    () => manager.startGame(room.roomCode, room.hostToken, 'groupthink'),
    /confirm readiness/i,
  );
  manager.setPlayerReady(room.roomCode, first.playerToken, true);
  manager.setPlayerReady(room.roomCode, second.playerToken, true);
  const restarted = manager.startGame(room.roomCode, room.hostToken, 'groupthink');
  assert.equal(restarted.state.phase, 'input');
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
