import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { io } = require('socket.io-client');
const baseUrl = (process.argv[2] ?? process.env.ROOM_RIOT_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);

function connectClient() {
  const client = io(baseUrl, { transports: ['websocket'], timeout: 5_000 });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.disconnect();
      reject(new Error('Timed out connecting to the compiled server.'));
    }, 5_000);
    client.once('connect', () => {
      clearTimeout(timeout);
      resolve(client);
    });
    client.once('connect_error', (error) => {
      clearTimeout(timeout);
      client.disconnect();
      reject(error);
    });
  });
}

function emitWithAck(client, event, payload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${event} acknowledgement timed out.`)),
      5_000,
    );
    const request =
      event.startsWith('host:') || event.startsWith('player:')
        ? { actionId: randomUUID(), ...payload }
        : payload;
    client.emit(event, request, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

function assertSuccess(response, event) {
  if (!response?.ok) {
    throw new Error(
      `${event}: ${response?.error?.code ?? 'UNKNOWN_ERROR'} ${response?.error?.message ?? ''}`,
    );
  }
  return response;
}

const clients = [];
try {
  const host = await connectClient();
  clients.push(host);
  const created = assertSuccess(
    await emitWithAck(host, 'host:create-room', { settings: { roundCount: 1 } }),
    'host:create-room',
  );

  const player = await connectClient();
  clients.push(player);
  const joined = assertSuccess(
    await emitWithAck(player, 'player:join', {
      roomCode: created.roomCode,
      name: 'Compiled Smoke Player',
      avatar: '🎮',
    }),
    'player:join',
  );
  assertSuccess(
    await emitWithAck(host, 'host:start-game', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      gameId: 'groupthink',
    }),
    'host:start-game',
  );
  const submitted = assertSuccess(
    await emitWithAck(player, 'player:submit-answer', {
      roomCode: created.roomCode,
      playerToken: joined.playerToken,
      answer: 'compiled smoke answer',
    }),
    'player:submit-answer',
  );
  if (submitted.snapshot.state.phase !== 'results') {
    throw new Error('Compiled smoke answer did not resolve the one-player round.');
  }
  const winner = assertSuccess(
    await emitWithAck(host, 'host:next-round', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
    }),
    'host:next-round',
  );
  if (winner.snapshot.state.phase !== 'winner') {
    throw new Error('Compiled smoke results did not advance to the winner screen.');
  }

  player.disconnect();
  const reconnected = await connectClient();
  clients.push(reconnected);
  const restored = assertSuccess(
    await emitWithAck(reconnected, 'player:join', {
      roomCode: created.roomCode,
      playerToken: joined.playerToken,
      name: 'Ignored Reconnect Name',
      avatar: '🎮',
    }),
    'player:join reconnect',
  );
  if (restored.playerId !== joined.playerId || restored.snapshot.state.phase !== 'winner') {
    throw new Error('Compiled smoke reconnect did not restore the same player and phase.');
  }
  const rematch = assertSuccess(
    await emitWithAck(host, 'host:rematch', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      gameId: 'groupthink',
      carryScores: false,
      settings: { roundCount: 1 },
    }),
    'host:rematch',
  );
  if (rematch.snapshot.state.phase !== 'lobby' || !rematch.snapshot.state.readinessRequired) {
    throw new Error('Compiled smoke rematch did not return to the readiness lobby.');
  }
  const ready = assertSuccess(
    await emitWithAck(reconnected, 'player:set-ready', {
      roomCode: created.roomCode,
      playerToken: joined.playerToken,
      ready: true,
    }),
    'player:set-ready',
  );
  if (!ready.snapshot.state.readyPlayerIds.includes(joined.playerId)) {
    throw new Error('Compiled smoke readiness acknowledgement did not include the player.');
  }
  const restarted = assertSuccess(
    await emitWithAck(host, 'host:start-game', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      gameId: 'groupthink',
    }),
    'host:start-game rematch',
  );
  if (restarted.snapshot.state.phase !== 'input') {
    throw new Error('Compiled smoke rematch did not start after readiness confirmation.');
  }
  console.log(
    `Compiled smoke passed: room ${created.roomCode}, start, answer, results, reconnect, rematch, and readiness.`,
  );
} finally {
  clients.forEach((client) => client.disconnect());
}
