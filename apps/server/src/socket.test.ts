import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

import { io as createClient } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';

import {
  EventErrorSchema,
  INTERNAL_ERROR_MESSAGE,
  INVALID_REQUEST_MESSAGE,
} from '@room-riot/contracts';

import { createRequestHandler } from './http.js';
import { RoomManager } from './room-manager.js';
import {
  attachRealtimeServer,
  type EventResponse,
  type HostCreateSuccess,
  type PlayerAnswerSuccess,
  type PlayerJoinSuccess,
  type PlayerStateEnvelope,
  type RoomStateSuccess,
} from './socket.js';
import type { RoomSnapshot } from './room-manager.js';

test('coordinates host, player, display, and game-start events', async () => {
  const roomManager = new RoomManager();
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  const clients: ClientSocket[] = [];

  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  const url = `http://127.0.0.1:${address.port}`;

  try {
    const host = await connectClient(url);
    clients.push(host);
    const created = await emitWithAck<HostCreateSuccess>(host, 'host:create-room', {});
    assertSuccess(created);

    const player = await connectClient(url);
    clients.push(player);
    const playerJoinedPromise = waitForClientEvent(player, 'room:state');
    const joined = await emitWithAck<PlayerJoinSuccess>(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Joe',
      avatar: '😎',
    });
    assertSuccess(joined);
    assert.equal(joined.snapshot.state.players.length, 1);
    await playerJoinedPromise;

    const display = await connectClient(url);
    clients.push(display);
    const watched = await emitWithAck<RoomStateSuccess>(display, 'display:watch', {
      roomCode: created.roomCode,
    });
    assertSuccess(watched);
    assert.equal(watched.snapshot.state.players[0]?.name, 'Joe');

    const privateStatePromise = waitForSocketNotice<PlayerStateEnvelope>(player, 'player:state');
    const gameStarted = await emitWithAck<RoomStateSuccess>(host, 'host:start-game', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      gameId: 'groupthink',
    });
    assertSuccess(gameStarted);
    assert.equal(gameStarted.snapshot.state.phase, 'input');
    assert.equal(gameStarted.snapshot.state.gameId, 'groupthink');
    const privateUpdate = await privateStatePromise;
    assert.equal(privateUpdate.protocolVersion, gameStarted.snapshot.protocolVersion);
    assert.equal(privateUpdate.roomCode, created.roomCode);
    assert.equal(privateUpdate.revision, gameStarted.snapshot.revision);
    assert.equal(privateUpdate.state.id, 'groupthink');
  } finally {
    clients.forEach((client) => client.disconnect());
    realtimeServer.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('deduplicates repeated player submissions and host phase advances', async () => {
  const roomManager = new RoomManager();
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  const clients: ClientSocket[] = [];

  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  const url = `http://127.0.0.1:${address.port}`;

  try {
    const host = await connectClient(url);
    const player = await connectClient(url);
    clients.push(host, player);

    const created = await emitWithAck<HostCreateSuccess>(host, 'host:create-room', {
      settings: { roundCount: 1 },
    });
    assertSuccess(created);
    const joined = await emitWithAck<PlayerJoinSuccess>(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Retry Tester',
      avatar: '🎮',
    });
    assertSuccess(joined);

    const startRequest = {
      actionId: randomUUID(),
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      gameId: 'groupthink',
    };
    const [firstStart, duplicateStart] = await Promise.all([
      emitWithAck<RoomStateSuccess>(host, 'host:start-game', startRequest),
      emitWithAck<RoomStateSuccess>(host, 'host:start-game', startRequest),
    ]);
    assertSuccess(firstStart);
    assertSuccess(duplicateStart);
    assert.deepEqual(duplicateStart.snapshot, firstStart.snapshot);

    const answerRequest = {
      actionId: randomUUID(),
      roomCode: created.roomCode,
      playerToken: joined.playerToken,
      answer: 'Same logical submission',
    };
    const [firstAnswer, duplicateAnswer] = await Promise.all([
      emitWithAck<PlayerAnswerSuccess>(player, 'player:submit-answer', answerRequest),
      emitWithAck<PlayerAnswerSuccess>(player, 'player:submit-answer', answerRequest),
    ]);
    assertSuccess(firstAnswer);
    assertSuccess(duplicateAnswer);
    assert.equal(firstAnswer.snapshot.state.phase, 'results');
    assert.deepEqual(duplicateAnswer, firstAnswer);

    const conflictingAnswer = await emitWithAck<PlayerAnswerSuccess>(
      player,
      'player:submit-answer',
      { ...answerRequest, answer: 'Altered retry payload' },
    );
    assert.equal(conflictingAnswer.ok, false);
    if (conflictingAnswer.ok) throw new Error('Expected altered action payload to be rejected.');
    assert.equal(conflictingAnswer.error.code, 'IDEMPOTENCY_CONFLICT');

    const nextRoundRequest = {
      actionId: randomUUID(),
      roomCode: created.roomCode,
      hostToken: created.hostToken,
    };
    const [firstAdvance, duplicateAdvance] = await Promise.all([
      emitWithAck<RoomStateSuccess>(host, 'host:next-round', nextRoundRequest),
      emitWithAck<RoomStateSuccess>(host, 'host:next-round', nextRoundRequest),
    ]);
    assertSuccess(firstAdvance);
    assertSuccess(duplicateAdvance);
    assert.equal(firstAdvance.snapshot.state.phase, 'winner');
    assert.deepEqual(duplicateAdvance.snapshot, firstAdvance.snapshot);
    assert.ok(firstAdvance.snapshot.revision > firstAnswer.snapshot.revision);

    const staleAnswerReceipt = await emitWithAck<PlayerAnswerSuccess>(
      player,
      'player:submit-answer',
      answerRequest,
    );
    assertSuccess(staleAnswerReceipt);
    assert.equal(staleAnswerReceipt.snapshot.revision, firstAnswer.snapshot.revision);
    assert.ok(staleAnswerReceipt.snapshot.revision < firstAdvance.snapshot.revision);

    const currentReplay = await emitWithAck<RoomStateSuccess>(host, 'host:reconnect', {
      actionId: randomUUID(),
      roomCode: created.roomCode,
      hostToken: created.hostToken,
    });
    assertSuccess(currentReplay);
    assert.equal(currentReplay.snapshot.revision, firstAdvance.snapshot.revision);
  } finally {
    clients.forEach((client) => client.disconnect());
    realtimeServer.close();
    roomManager.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('retains unexpired actor receipts under pressure and frees capacity after TTL', async () => {
  let now = 1_000;
  const roomManager = new RoomManager({ randomizePrompts: false });
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager, {
    actionDeduplicationTtlMs: 100,
    actionDeduplicationLimitPerActor: 2,
    actionDeduplicationBootstrapLimit: 10,
    actionDeduplicationTotalLimit: 20,
    now: () => now,
  });
  const clients: ClientSocket[] = [];

  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  const url = `http://127.0.0.1:${address.port}`;

  try {
    const host = await connectClient(url);
    const player = await connectClient(url);
    clients.push(host, player);
    const created = await emitWithAck<HostCreateSuccess>(host, 'host:create-room', {
      gameId: 'groupthink',
      settings: { roundCount: 1 },
    });
    assertSuccess(created);
    const joined = await emitWithAck<PlayerJoinSuccess>(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Capacity Tester',
      avatar: '🎮',
    });
    assertSuccess(joined);

    const startRequest = {
      actionId: randomUUID(),
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      gameId: 'groupthink',
    };
    const started = await emitWithAck<RoomStateSuccess>(host, 'host:start-game', startRequest);
    assertSuccess(started);
    const revealRequest = {
      actionId: randomUUID(),
      roomCode: created.roomCode,
      hostToken: created.hostToken,
    };
    const revealed = await emitWithAck<RoomStateSuccess>(
      host,
      'host:reveal-results',
      revealRequest,
    );
    assertSuccess(revealed);

    const advanceRequest = {
      actionId: randomUUID(),
      roomCode: created.roomCode,
      hostToken: created.hostToken,
    };
    const atCapacity = await emitWithAck<RoomStateSuccess>(host, 'host:next-round', advanceRequest);
    assert.equal(atCapacity.ok, false);
    if (atCapacity.ok) throw new Error('Expected actor receipt capacity to be enforced.');
    assert.equal(atCapacity.error.code, 'IDEMPOTENCY_CAPACITY');
    assert.equal(roomManager.getRoomSnapshot(created.roomCode).state.phase, 'results');

    const preservedStart = await emitWithAck<RoomStateSuccess>(
      host,
      'host:start-game',
      startRequest,
    );
    assertSuccess(preservedStart);
    assert.deepEqual(preservedStart.snapshot, started.snapshot);

    const otherActorRequest = {
      actionId: randomUUID(),
      roomCode: created.roomCode,
      playerToken: joined.playerToken,
      answer: 'Separate actor capacity',
    };
    const otherActor = await emitWithAck<PlayerAnswerSuccess>(
      player,
      'player:submit-answer',
      otherActorRequest,
    );
    assert.equal(otherActor.ok, false);
    if (otherActor.ok) throw new Error('Expected the results phase to reject an answer.');
    assert.notEqual(otherActor.error.code, 'IDEMPOTENCY_CAPACITY');

    now += 101;
    const advanced = await emitWithAck<RoomStateSuccess>(host, 'host:next-round', advanceRequest);
    assertSuccess(advanced);
    assert.equal(advanced.snapshot.state.phase, 'winner');
  } finally {
    clients.forEach((client) => client.disconnect());
    realtimeServer.close();
    roomManager.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('replays create and unauthenticated join receipts across socket reconnects', async () => {
  const roomManager = new RoomManager({ maxRooms: 1 });
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  const clients: ClientSocket[] = [];

  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  const url = `http://127.0.0.1:${address.port}`;

  try {
    const createActionId = randomUUID();
    const firstHost = await connectClient(url);
    clients.push(firstHost);
    const firstCreate = await emitWithAck<HostCreateSuccess>(firstHost, 'host:create-room', {
      actionId: createActionId,
      gameId: 'groupthink',
      settings: { roundCount: 1 },
    });
    assertSuccess(firstCreate);
    firstHost.disconnect();

    const replacementHost = await connectClient(url);
    clients.push(replacementHost);
    const replayedCreate = await emitWithAck<HostCreateSuccess>(
      replacementHost,
      'host:create-room',
      {
        actionId: createActionId,
        gameId: 'groupthink',
        settings: { roundCount: 1 },
      },
    );
    assertSuccess(replayedCreate);
    assert.equal(replayedCreate.roomCode, firstCreate.roomCode);
    assert.equal(replayedCreate.hostToken, firstCreate.hostToken);

    const conflictingCreate = await emitWithAck<HostCreateSuccess>(
      replacementHost,
      'host:create-room',
      {
        actionId: createActionId,
        gameId: 'hot-take',
      },
    );
    assert.equal(conflictingCreate.ok, false);
    if (conflictingCreate.ok) throw new Error('Expected the altered retry to be rejected.');
    assert.equal(conflictingCreate.error.code, 'IDEMPOTENCY_CONFLICT');

    const joinActionId = randomUUID();
    const firstPlayer = await connectClient(url);
    clients.push(firstPlayer);
    const firstJoin = await emitWithAck<PlayerJoinSuccess>(firstPlayer, 'player:join', {
      actionId: joinActionId,
      roomCode: firstCreate.roomCode,
      name: 'Reliable Retry',
      avatar: '🎮',
    });
    assertSuccess(firstJoin);
    firstPlayer.disconnect();

    const replacementPlayer = await connectClient(url);
    clients.push(replacementPlayer);
    const replayedJoin = await emitWithAck<PlayerJoinSuccess>(replacementPlayer, 'player:join', {
      actionId: joinActionId,
      roomCode: firstCreate.roomCode,
      name: 'Reliable Retry',
      avatar: '🎮',
    });
    assertSuccess(replayedJoin);
    assert.equal(replayedJoin.playerId, firstJoin.playerId);
    assert.equal(replayedJoin.playerToken, firstJoin.playerToken);
    assert.equal(replayedJoin.snapshot.state.players.length, 1);

    const started = await emitWithAck<RoomStateSuccess>(replacementHost, 'host:start-game', {
      roomCode: firstCreate.roomCode,
      hostToken: firstCreate.hostToken,
      gameId: 'groupthink',
    });
    assertSuccess(started);
    const answered = await emitWithAck<PlayerAnswerSuccess>(
      replacementPlayer,
      'player:submit-answer',
      {
        roomCode: firstCreate.roomCode,
        playerToken: firstJoin.playerToken,
        answer: 'Still the same player',
      },
    );
    assertSuccess(answered);
  } finally {
    clients.forEach((client) => client.disconnect());
    realtimeServer.close();
    roomManager.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('rejects player-limit violations sent directly over the socket protocol', async () => {
  const roomManager = new RoomManager();
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  const client = await listenForClient(httpServer);

  try {
    const oversized = await emitWithAck<HostCreateSuccess>(client, 'host:create-room', {
      gameId: 'drawn-out',
      settings: { maxPlayers: 11, drawnOutMode: 'fake-artist' },
    });
    assert.equal(oversized.ok, false);
    if (oversized.ok) throw new Error('Expected oversized Drawn Out room to be rejected.');
    assert.equal(oversized.error.code, 'PLAYER_LIMIT');

    const created = await emitWithAck<HostCreateSuccess>(client, 'host:create-room', {
      gameId: 'groupthink',
    });
    assertSuccess(created);

    const emptyStart = await emitWithAck<RoomStateSuccess>(client, 'host:start-game', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      gameId: 'groupthink',
    });
    assert.equal(emptyStart.ok, false);
    if (emptyStart.ok) throw new Error('Expected empty Groupthink room to be rejected.');
    assert.equal(emptyStart.error.code, 'PLAYER_LIMIT');
  } finally {
    client.disconnect();
    realtimeServer.close();
    roomManager.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('supports twelve concurrent players and reconnecting a player session', async () => {
  const roomManager = new RoomManager();
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  const clients: ClientSocket[] = [];

  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  const url = `http://127.0.0.1:${address.port}`;

  try {
    const host = await connectClient(url);
    clients.push(host);
    const created = await emitWithAck<HostCreateSuccess>(host, 'host:create-room', {
      settings: { maxPlayers: 12, roundCount: 1 },
    });
    assertSuccess(created);

    const players: Array<{
      client: ClientSocket;
      playerId: string;
      playerToken: string;
    }> = [];
    for (let index = 0; index < 12; index += 1) {
      const client = await connectClient(url);
      clients.push(client);
      const joined: EventResponse<PlayerJoinSuccess> = await emitWithAck<PlayerJoinSuccess>(
        client,
        'player:join',
        {
          roomCode: created.roomCode,
          name: `Player ${index + 1}`,
          avatar: '🎮',
        },
      );
      assertSuccess(joined);
      players.push({
        client,
        playerId: joined.playerId,
        playerToken: joined.playerToken,
      });
      assert.equal(joined.snapshot.state.players.length, index + 1);
    }

    assert.equal(players.length, 12);
    const originalPlayer = players[0];
    if (!originalPlayer) throw new Error('The first player was not created.');
    const disconnectedState = waitForRoomState(
      host,
      (snapshot) =>
        snapshot.state.players.find((player) => player.id === originalPlayer.playerId)?.status ===
        'disconnected',
    );
    originalPlayer.client.disconnect();
    await disconnectedState;

    const replacement = await connectClient(url);
    clients.push(replacement);
    const rejoined = await emitWithAck<PlayerJoinSuccess>(replacement, 'player:join', {
      roomCode: created.roomCode,
      name: 'Player 1',
      avatar: '🎮',
      playerToken: originalPlayer.playerToken,
    });
    assertSuccess(rejoined);
    assert.equal(rejoined.playerId, originalPlayer.playerId);
    assert.equal(rejoined.snapshot.state.players.length, 12);
    assert.equal(
      rejoined.snapshot.state.players.find((player) => player.id === originalPlayer.playerId)
        ?.status,
      'connected',
    );
    players[0] = { ...originalPlayer, client: replacement };

    const started = await emitWithAck<RoomStateSuccess>(host, 'host:start-game', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      gameId: 'groupthink',
    });
    assertSuccess(started);

    const submittedResponses = await Promise.all(
      players.map((player) =>
        emitWithAck<PlayerAnswerSuccess>(player.client, 'player:submit-answer', {
          roomCode: created.roomCode,
          playerToken: player.playerToken,
          answer: 'Pizza',
        }),
      ),
    );
    submittedResponses.forEach((response) => assertSuccess(response));

    const results = submittedResponses.find(
      (response) => response.ok && response.snapshot.state.phase === 'results',
    );
    assert(results?.ok, 'The final concurrent answer should reveal results.');
    assert.equal(results.snapshot.state.players.length, 12);
    assert.equal(results.snapshot.game?.id, 'groupthink');
    assert.equal(results.snapshot.game?.status, 'results');

    const winner = await emitWithAck<RoomStateSuccess>(host, 'host:next-round', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
    });
    assertSuccess(winner);
    assert.equal(winner.snapshot.state.phase, 'winner');
  } finally {
    clients.forEach((client) => client.disconnect());
    realtimeServer.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('ignores events without acknowledgements without crashing the server', async () => {
  const roomManager = new RoomManager();
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  const client = await listenForClient(httpServer);

  try {
    client.emit('host:create-room', {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    const created = await emitWithAck<HostCreateSuccess>(client, 'host:create-room', {});
    assertSuccess(created);
  } finally {
    client.disconnect();
    realtimeServer.close();
    roomManager.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('distinguishes voluntary leave from disconnect and rejects the revoked token', async () => {
  const roomManager = new RoomManager();
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  const url = `http://127.0.0.1:${address.port}`;
  const clients: ClientSocket[] = [];

  try {
    const host = await connectClient(url);
    const player = await connectClient(url);
    clients.push(host, player);
    const created = await emitWithAck<HostCreateSuccess>(host, 'host:create-room', {
      settings: { maxPlayers: 1 },
    });
    assertSuccess(created);
    const joined = await emitWithAck<PlayerJoinSuccess>(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Alex',
      avatar: '😎',
    });
    assertSuccess(joined);

    const playerRemoved = waitForRoomState(host, (snapshot) => snapshot.state.players.length === 0);
    const left = await emitWithAck<{ roomCode: string }>(player, 'player:leave', {
      roomCode: created.roomCode,
      playerToken: joined.playerToken,
    });
    assertSuccess(left);
    await playerRemoved;

    const rejoined = await emitWithAck<PlayerJoinSuccess>(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Alex',
      avatar: '😎',
      playerToken: joined.playerToken,
    });
    assert.equal(rejoined.ok, false);
    if (!rejoined.ok) assert.equal(rejoined.error.code, 'UNAUTHORIZED');

    const replacement = await connectClient(url);
    clients.push(replacement);
    const replaced = await emitWithAck<PlayerJoinSuccess>(replacement, 'player:join', {
      roomCode: created.roomCode,
      name: 'Replacement',
      avatar: '🎮',
    });
    assertSuccess(replaced);
    assert.notEqual(replaced.playerId, joined.playerId);
  } finally {
    clients.forEach((client) => client.disconnect());
    realtimeServer.close();
    roomManager.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('host kick notifies the player and close room invalidates every session', async () => {
  const roomManager = new RoomManager();
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  const url = `http://127.0.0.1:${address.port}`;
  const clients: ClientSocket[] = [];

  try {
    const host = await connectClient(url);
    const player = await connectClient(url);
    const spectator = await connectClient(url);
    clients.push(host, player, spectator);
    const created = await emitWithAck<HostCreateSuccess>(host, 'host:create-room', {});
    assertSuccess(created);
    const joined = await emitWithAck<PlayerJoinSuccess>(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Alex',
      avatar: '😎',
    });
    assertSuccess(joined);
    const watched = await emitWithAck<RoomStateSuccess>(spectator, 'display:watch', {
      roomCode: created.roomCode,
    });
    assertSuccess(watched);

    const removedNotice = waitForSocketNotice<{ roomCode: string; reason: string }>(
      player,
      'player:removed',
    );
    const kicked = await emitWithAck<RoomStateSuccess>(host, 'host:kick-player', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      playerId: joined.playerId,
    });
    assertSuccess(kicked);
    assert.equal((await removedNotice).reason, 'removed-by-host');

    const staleJoin = await emitWithAck<PlayerJoinSuccess>(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Alex',
      avatar: '😎',
      playerToken: joined.playerToken,
    });
    assert.equal(staleJoin.ok, false);
    if (!staleJoin.ok) assert.equal(staleJoin.error.code, 'UNAUTHORIZED');

    const roomClosed = waitForSocketNotice<{ roomCode: string; reason: string }>(
      spectator,
      'room:closed',
    );
    const closed = await emitWithAck<{ roomCode: string }>(host, 'host:close-room', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
    });
    assertSuccess(closed);
    assert.equal((await roomClosed).reason, 'closed-by-host');

    const reconnect = await emitWithAck<RoomStateSuccess>(host, 'host:reconnect', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
    });
    assert.equal(reconnect.ok, false);
    if (!reconnect.ok) assert.equal(reconnect.error.code, 'ROOM_NOT_FOUND');
  } finally {
    clients.forEach((client) => client.disconnect());
    realtimeServer.close();
    roomManager.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('replacing a live player session explicitly retires the old socket without marking the seat offline', async () => {
  const roomManager = new RoomManager({ reconnectGraceMs: 50 });
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  const url = `http://127.0.0.1:${address.port}`;
  const clients: ClientSocket[] = [];

  try {
    const host = await connectClient(url);
    const firstTab = await connectClient(url);
    const secondTab = await connectClient(url);
    clients.push(host, firstTab, secondTab);
    const created = await emitWithAck<HostCreateSuccess>(host, 'host:create-room', {});
    assertSuccess(created);
    const joined = await emitWithAck<PlayerJoinSuccess>(firstTab, 'player:join', {
      roomCode: created.roomCode,
      name: 'Alex',
      avatar: '😎',
    });
    assertSuccess(joined);

    const replacedNotice = waitForSocketNotice<{
      roomCode: string;
      role: 'host' | 'player';
    }>(firstTab, 'session:replaced');
    const oldTabDisconnected = waitForSocketNotice<string>(firstTab, 'disconnect');
    const rejoined = await emitWithAck<PlayerJoinSuccess>(secondTab, 'player:join', {
      roomCode: created.roomCode,
      name: 'Ignored',
      avatar: '🎮',
      playerToken: joined.playerToken,
    });
    assertSuccess(rejoined);
    assert.equal(rejoined.playerId, joined.playerId);
    assert.deepEqual(await replacedNotice, { roomCode: created.roomCode, role: 'player' });
    assert.equal(await oldTabDisconnected, 'io server disconnect');

    await new Promise((resolve) => setTimeout(resolve, 75));
    const snapshot = roomManager.getRoomSnapshot(created.roomCode);
    const player = snapshot.state.players.find((candidate) => candidate.id === joined.playerId);
    assert.equal(player?.status, 'connected');
    assert.equal(player?.reconnectDeadlineAt, null);
  } finally {
    clients.forEach((client) => client.disconnect());
    realtimeServer.close();
    roomManager.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

test('returns stable parser and internal errors without leaking implementation details', async () => {
  const secret = 'C:\\private\\room-manager.ts:777 database-password';
  class FailingRoomManager extends RoomManager {
    override createRoom(): never {
      throw new Error(secret);
    }
  }

  const roomManager = new FailingRoomManager();
  const httpServer = createServer(createRequestHandler({ version: 'test' }, { roomManager }));
  const realtimeServer = attachRealtimeServer(httpServer, roomManager);
  const originalConsoleError = console.error;
  const reported: unknown[][] = [];
  console.error = (...args: unknown[]) => reported.push(args);
  let client: ClientSocket | undefined;

  try {
    client = await listenForClient(httpServer);
    const malformed = await emitWithAck<RoomStateSuccess>(client, 'display:watch', {
      roomCode: 'not a room code',
    });
    assert.equal(malformed.ok, false);
    if (!malformed.ok) {
      assert.deepEqual(malformed.error, {
        code: 'INVALID_REQUEST',
        message: INVALID_REQUEST_MESSAGE,
      });
      assert.doesNotMatch(JSON.stringify(malformed), /issues|invalid_format|path/i);
    }

    const unexpectedRequest = { actionId: randomUUID() };
    const unexpected = await emitWithAck<HostCreateSuccess>(
      client,
      'host:create-room',
      unexpectedRequest,
    );
    assert.equal(unexpected.ok, false);
    if (!unexpected.ok) {
      let correlationId = '';
      assert.equal(unexpected.error.code, 'INTERNAL_ERROR');
      if (unexpected.error.code === 'INTERNAL_ERROR') {
        assert.equal(unexpected.error.message, INTERNAL_ERROR_MESSAGE);
        assert.match(unexpected.error.correlationId, /^[0-9a-f-]{36}$/i);
        correlationId = unexpected.error.correlationId;
      }
      assert.equal(EventErrorSchema.safeParse(unexpected).success, true);
      assert.doesNotMatch(JSON.stringify(unexpected), /private|room-manager|password|stack/i);
      assert.match(String(reported[0]?.[0]), new RegExp(correlationId));
      assert.equal(reported[0]?.[1] instanceof Error, true);

      const retry = await emitWithAck<HostCreateSuccess>(
        client,
        'host:create-room',
        unexpectedRequest,
      );
      assert.deepEqual(retry, unexpected);
      assert.equal(reported.length, 1);
    }
  } finally {
    console.error = originalConsoleError;
    client?.disconnect();
    realtimeServer.close();
    roomManager.close();
    httpServer.close();
    await once(httpServer, 'close');
  }
});

async function connectClient(url: string): Promise<ClientSocket> {
  const client = createClient(url, { transports: ['websocket'] });
  await waitForClientEvent(client, 'connect');
  return client;
}

async function listenForClient(httpServer: ReturnType<typeof createServer>): Promise<ClientSocket> {
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  return connectClient(`http://127.0.0.1:${address.port}`);
}

function waitForClientEvent(client: ClientSocket, event: 'connect' | 'room:state'): Promise<void> {
  return new Promise((resolve) => {
    client.once(event, () => resolve());
  });
}

function waitForRoomState(
  client: ClientSocket,
  predicate: (snapshot: RoomSnapshot) => boolean,
): Promise<RoomSnapshot> {
  return new Promise((resolve) => {
    const listener = (snapshot: RoomSnapshot): void => {
      if (!predicate(snapshot)) return;
      client.off('room:state', listener);
      resolve(snapshot);
    };
    client.on('room:state', listener);
  });
}

function waitForSocketNotice<T>(client: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    client.once(event, (notice: T) => resolve(notice));
  });
}

function emitWithAck<T extends object>(
  client: ClientSocket,
  event: string,
  payload: object,
): Promise<EventResponse<T>> {
  return new Promise((resolve) => {
    const request = isMutatingEvent(event) ? { actionId: randomUUID(), ...payload } : payload;
    client.emit(event, request, (response: EventResponse<T>) => resolve(response));
  });
}

function isMutatingEvent(event: string): boolean {
  return event.startsWith('host:') || event.startsWith('player:');
}

function assertSuccess<T extends object>(
  response: EventResponse<T>,
): asserts response is { ok: true } & T {
  if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
}
