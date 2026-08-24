import { once } from 'node:events';
import { createServer } from 'node:http';
import { connect as connectTcp } from 'node:net';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildJoinPath, createRequestHandler } from './http.js';
import { RoomManager } from './room-manager.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      if (!server.listening) return;
      server.close();
      await once(server, 'close');
    }),
  );
});

test('health endpoint reports server and engine readiness', async () => {
  const server = createServer(createRequestHandler({ version: 'test-version' }));
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');

  const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    service: 'room-riot-server',
    version: 'test-version',
    engineReady: true,
  });
});

test('health endpoint returns a JSON 404 for unknown routes', async () => {
  const server = createServer(createRequestHandler({ version: 'test-version' }));
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');

  const response = await fetch(`http://127.0.0.1:${address.port}/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    status: 'error',
    error: 'not_found',
  });
});

test('returns a safe response for malformed Host headers', async () => {
  const server = createServer(createRequestHandler({ version: 'test-version' }));
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');

  const response = await new Promise<string>((resolve, reject) => {
    const client = connectTcp(address.port, '127.0.0.1', () => {
      client.write('GET /missing HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n');
    });
    let body = '';
    client.setEncoding('utf8');
    client.on('data', (chunk: string) => {
      body += chunk;
    });
    client.once('end', () => resolve(body));
    client.once('error', reject);
  });

  assert.match(response, /^HTTP\/1\.1 404/);
});

test('builds game-specific player paths with a generic fallback', () => {
  assert.equal(buildJoinPath('ABCD', 'groupthink'), '/play/groupthink?room=ABCD');
  assert.equal(buildJoinPath('WXYZ', 'hot-take'), '/play/hot-take?room=WXYZ');
  assert.equal(buildJoinPath('RAGE', 'suspect'), '/play/suspect?room=RAGE');
  assert.equal(buildJoinPath('ARTS', 'drawn-out'), '/play/drawn-out?room=ARTS');
  assert.equal(buildJoinPath('RAGE', null), '/play?room=RAGE');
});

test('serves the browser shell and an offline QR code for a room', async () => {
  const roomManager = new RoomManager();
  const room = roomManager.createRoom({});
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  const server = createServer(
    createRequestHandler({ version: 'test-version' }, { roomManager, webRoot }),
  );
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');

  const pageResponse = await fetch(`http://127.0.0.1:${address.port}/play`);
  assert.equal(pageResponse.status, 200);
  assert.equal(pageResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.match(pageResponse.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.equal(pageResponse.headers.get('cache-control'), 'no-cache');
  assert.match(await pageResponse.text(), /socket\.io\/socket\.io\.js/);

  for (const pagePath of [
    '/host/groupthink',
    '/host/hot-take',
    '/display/groupthink',
    '/display/hot-take',
    '/host/suspect',
    '/display/suspect',
    '/play/groupthink',
    '/play/hot-take',
    '/play/suspect',
    '/host/drawn-out',
    '/display/drawn-out',
    '/play/drawn-out',
  ]) {
    const gamePageResponse: Response = await fetch(`http://127.0.0.1:${address.port}${pagePath}`);
    assert.equal(gamePageResponse.status, 200);
    const gamePageHtml = await gamePageResponse.text();
    assert.match(gamePageHtml, /Room Riot/);
    assert.match(gamePageHtml, /src="\/main\.js"/);
  }

  const mainScriptResponse = await fetch(`http://127.0.0.1:${address.port}/main.js`);
  assert.equal(mainScriptResponse.status, 200);
  assert.match(await mainScriptResponse.text(), /protocol\.js/);

  const protocolScriptResponse = await fetch(`http://127.0.0.1:${address.port}/protocol.js`);
  assert.equal(protocolScriptResponse.status, 200);
  assert.match(await protocolScriptResponse.text(), /isSuccess/);

  for (const assetName of [
    'room-riot-logo.png',
    'groupthink-icon.png',
    'hot-take-icon.png',
    'groupthink-lab-bg-v2.png',
    'groupthink-reactor-v2.png',
    'hot-take-stage-bg-v2.png',
    'hot-take-podium-v2.png',
    'suspect-icon-v2.png',
    'suspect-bg-v2.png',
    'suspect-stage-v2.png',
    'drawn-out-icon-v2.png',
    'drawn-out-bg-v2.png',
    'drawn-out-stage-v2.png',
  ]) {
    const assetResponse: Response = await fetch(
      `http://127.0.0.1:${address.port}/assets/${assetName}`,
    );
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type') ?? '', /image\/png/);
    assert.match(assetResponse.headers.get('cache-control') ?? '', /max-age/);
    assert.ok((await assetResponse.arrayBuffer()).byteLength > 1_000);
  }

  const qrResponse = await fetch(
    `http://127.0.0.1:${address.port}/api/rooms/${room.roomCode}/qr.svg`,
  );
  assert.equal(qrResponse.status, 200);
  assert.match(qrResponse.headers.get('content-type') ?? '', /image\/svg\+xml/);
  assert.match(await qrResponse.text(), /<svg/);
});
