import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import process, { stdout } from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { io } = require('socket.io-client');
const mode = process.argv[2];
const baseUrl = (process.argv[3] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const statePath = process.argv[4];
if (!['seed', 'verify'].includes(mode) || !statePath) {
  throw new Error(
    'Usage: node scripts/container-replacement-smoke.mjs <seed|verify> <url> <state-file>',
  );
}

const clients = [];
const connectClient = () => {
  const client = io(baseUrl, { transports: ['websocket'], timeout: 5_000 });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.disconnect();
      reject(new Error('Timed out connecting to the replacement-test container.'));
    }, 5_000);
    client.once('connect', () => {
      clearTimeout(timeout);
      clients.push(client);
      resolve(client);
    });
    client.once('connect_error', (error) => {
      clearTimeout(timeout);
      client.disconnect();
      reject(error);
    });
  });
};

const emitWithAck = (client, event, payload) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${event} acknowledgement timed out.`)),
      5_000,
    );
    client.emit(event, { actionId: randomUUID(), ...payload }, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });

const assertSuccess = (response, event) => {
  if (!response?.ok) {
    throw new Error(`${event}: ${response?.error?.code ?? 'UNKNOWN_ERROR'}`);
  }
  return response;
};

try {
  if (mode === 'seed') {
    const host = await connectClient();
    const created = assertSuccess(
      await emitWithAck(host, 'host:create-room', { settings: { roundCount: 1 } }),
      'host:create-room',
    );
    const player = await connectClient();
    const joined = assertSuccess(
      await emitWithAck(player, 'player:join', {
        roomCode: created.roomCode,
        name: 'Replacement Smoke Player',
        avatar: '🧪',
      }),
      'player:join',
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    await writeFile(
      statePath,
      `${JSON.stringify({
        roomCode: created.roomCode,
        hostToken: created.hostToken,
        playerToken: joined.playerToken,
        playerId: joined.playerId,
      })}\n`,
    );
    stdout.write(`Replacement seed passed: room ${created.roomCode} persisted.\n`);
  } else {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const host = await connectClient();
    const restored = assertSuccess(
      await emitWithAck(host, 'host:reconnect', {
        roomCode: state.roomCode,
        hostToken: state.hostToken,
      }),
      'host:reconnect',
    );
    if (restored.snapshot?.state?.roomCode !== state.roomCode) {
      throw new Error('Replacement restore returned a different room.');
    }
    const player = await connectClient();
    const rejoined = assertSuccess(
      await emitWithAck(player, 'player:join', {
        roomCode: state.roomCode,
        playerToken: state.playerToken,
        name: 'Ignored Replacement Name',
        avatar: '🧪',
      }),
      'player:join reconnect',
    );
    if (rejoined.playerId !== state.playerId) {
      throw new Error('Replacement restore changed the player identity.');
    }
    stdout.write(
      `Replacement restore passed: room ${state.roomCode} and player ${state.playerId} restored.\n`,
    );
  }
} finally {
  clients.forEach((client) => client.disconnect());
}
