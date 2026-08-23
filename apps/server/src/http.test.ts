import { once } from 'node:events';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequestHandler } from './http.js';
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
  assert.match(await pageResponse.text(), /socket\.io\/socket\.io\.js/);

  const mainScriptResponse = await fetch(`http://127.0.0.1:${address.port}/main.js`);
  assert.equal(mainScriptResponse.status, 200);
  assert.match(await mainScriptResponse.text(), /protocol\.js/);

  const protocolScriptResponse = await fetch(`http://127.0.0.1:${address.port}/protocol.js`);
  assert.equal(protocolScriptResponse.status, 200);
  assert.match(await protocolScriptResponse.text(), /isSuccess/);

  for (const assetName of ['room-riot-logo.png', 'groupthink-icon.png', 'hot-take-icon.png']) {
    const assetResponse: Response = await fetch(
      `http://127.0.0.1:${address.port}/assets/${assetName}`,
    );
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type') ?? '', /image\/png/);
    assert.ok((await assetResponse.arrayBuffer()).byteLength > 1_000);
  }

  const qrResponse = await fetch(
    `http://127.0.0.1:${address.port}/api/rooms/${room.roomCode}/qr.svg`,
  );
  assert.equal(qrResponse.status, 200);
  assert.match(qrResponse.headers.get('content-type') ?? '', /image\/svg\+xml/);
  assert.match(await qrResponse.text(), /<svg/);
});
