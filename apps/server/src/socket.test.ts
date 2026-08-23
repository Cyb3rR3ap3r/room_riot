import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

import { io as createClient } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';

import { createRequestHandler } from './http.js';
import { RoomManager } from './room-manager.js';
import {
  attachRealtimeServer,
  type EventResponse,
  type HostCreateSuccess,
  type PlayerAnswerSuccess,
  type PlayerJoinSuccess,
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

    const gameStarted = await emitWithAck<RoomStateSuccess>(host, 'host:start-game', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      gameId: 'groupthink',
    });
    assertSuccess(gameStarted);
    assert.equal(gameStarted.snapshot.state.phase, 'input');
    assert.equal(gameStarted.snapshot.state.gameId, 'groupthink');
  } finally {
    clients.forEach((client) => client.disconnect());
    realtimeServer.close();
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

test('leaves a room cleanly and revokes a superseded player socket', async () => {
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
    const created = await emitWithAck<HostCreateSuccess>(host, 'host:create-room', {});
    assertSuccess(created);
    const joined = await emitWithAck<PlayerJoinSuccess>(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Alex',
      avatar: '😎',
    });
    assertSuccess(joined);

    const disconnected = waitForRoomState(
      host,
      (snapshot) => snapshot.state.players[0]?.status === 'disconnected',
    );
    const left = await emitWithAck<{ roomCode: string }>(player, 'player:leave', {
      roomCode: created.roomCode,
      playerToken: joined.playerToken,
    });
    assertSuccess(left);
    await disconnected;

    const rejoined = await emitWithAck<PlayerJoinSuccess>(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Alex',
      avatar: '😎',
      playerToken: joined.playerToken,
    });
    assertSuccess(rejoined);
    assert.equal(rejoined.playerId, joined.playerId);

    const replacement = await connectClient(url);
    clients.push(replacement);
    const replaced = await emitWithAck<PlayerJoinSuccess>(replacement, 'player:join', {
      roomCode: created.roomCode,
      name: 'Alex',
      avatar: '😎',
      playerToken: joined.playerToken,
    });
    assertSuccess(replaced);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(player.connected, false);
  } finally {
    clients.forEach((client) => client.disconnect());
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

function emitWithAck<T extends object>(
  client: ClientSocket,
  event: string,
  payload: object,
): Promise<EventResponse<T>> {
  return new Promise((resolve) => {
    client.emit(event, payload, (response: EventResponse<T>) => resolve(response));
  });
}

function assertSuccess<T extends object>(
  response: EventResponse<T>,
): asserts response is { ok: true } & T {
  if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
}
