import { once } from 'node:events';
import { createServer } from 'node:http';
import { connect as connectTcp } from 'node:net';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildJoinPath, createRequestHandler } from './http.js';
import { GAME_PAGE_ROUTES, GAME_REGISTRY_METADATA } from './game-registry.js';
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

test('publishes the authoritative game registry manifest', async () => {
  const server = createServer(createRequestHandler({ version: 'test-version' }));
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');

  const response = await fetch(`http://127.0.0.1:${address.port}/api/games`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { games: Object.values(GAME_REGISTRY_METADATA) });
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
  const contentSecurityPolicy = pageResponse.headers.get('content-security-policy') ?? '';
  assert.match(contentSecurityPolicy, /default-src 'self'/);
  assert.match(contentSecurityPolicy, /base-uri 'self'/);
  assert.match(contentSecurityPolicy, /object-src 'none'/);
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  assert.doesNotMatch(contentSecurityPolicy, /unsafe-inline/);
  assert.equal(pageResponse.headers.get('x-frame-options'), 'DENY');
  assert.equal(pageResponse.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(pageResponse.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(pageResponse.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.match(pageResponse.headers.get('permissions-policy') ?? '', /camera=\(\)/);
  assert.match(pageResponse.headers.get('permissions-policy') ?? '', /microphone=\(\)/);
  assert.equal(pageResponse.headers.get('strict-transport-security'), null);
  assert.equal(pageResponse.headers.get('cache-control'), 'no-cache');
  const pageHtml = await pageResponse.text();
  assert.match(pageHtml, /socket\.io\/socket\.io\.js/);
  assert.doesNotMatch(pageHtml, /<style[\s>]/i);
  const stylePath = pageHtml.match(/href="(\/assets\/room-riot\.[a-f0-9]{12}\.css)"/)?.[1];
  assert.ok(stylePath);
  const styleResponse = await fetch(`http://127.0.0.1:${address.port}${stylePath}`);
  assert.equal(styleResponse.status, 200);
  assert.equal(styleResponse.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.match(styleResponse.headers.get('content-type') ?? '', /text\/css/);
  assert.match(styleResponse.headers.get('cache-control') ?? '', /immutable/);
  assert.match(await styleResponse.text(), /--cyan:/);

  for (const pagePath of GAME_PAGE_ROUTES) {
    const gamePageResponse: Response = await fetch(`http://127.0.0.1:${address.port}${pagePath}`);
    assert.equal(gamePageResponse.status, 200);
    const gamePageHtml = await gamePageResponse.text();
    assert.match(gamePageHtml, /Room Riot/);
    assert.match(gamePageHtml, /src="\/main\.js"/);
  }

  const showcaseResponse = await fetch(`http://127.0.0.1:${address.port}/showcase`);
  assert.equal(showcaseResponse.status, 200);
  assert.equal(showcaseResponse.headers.get('cache-control'), 'no-cache');
  assert.equal(showcaseResponse.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.match(await showcaseResponse.text(), /Room Riot/i);

  const mainScriptResponse = await fetch(`http://127.0.0.1:${address.port}/main.js`);
  assert.equal(mainScriptResponse.status, 200);
  const mainScript = await mainScriptResponse.text();
  assert.match(mainScript, /room:state/);
  assert.doesNotMatch(mainScript, /^\s*import\s/m);

  const protocolScriptResponse = await fetch(`http://127.0.0.1:${address.port}/protocol.js`);
  assert.equal(protocolScriptResponse.status, 200);
  assert.match(await protocolScriptResponse.text(), /isSuccess/);

  for (const assetName of [
    'room-riot-logo.webp',
    'room-riot-display-bg.webp',
    'groupthink-icon.webp',
    'hot-take-icon.webp',
    'groupthink-lab-bg-v2.webp',
    'groupthink-reactor-v2.webp',
    'hot-take-stage-bg-v2.webp',
    'hot-take-podium-v2.webp',
    'suspect-icon-v2.webp',
    'suspect-bg-v2.webp',
    'suspect-stage-v2.webp',
    'drawn-out-icon-v2.webp',
    'drawn-out-bg-v2.webp',
    'drawn-out-stage-v2.webp',
  ]) {
    const assetResponse: Response = await fetch(
      `http://127.0.0.1:${address.port}/assets/${assetName}`,
    );
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type') ?? '', /image\/webp/);
    assert.match(assetResponse.headers.get('cache-control') ?? '', /max-age/);
    assert.ok((await assetResponse.arrayBuffer()).byteLength > 1_000);
  }

  const qrResponse = await fetch(
    `http://127.0.0.1:${address.port}/api/rooms/${room.roomCode}/qr.svg`,
  );
  assert.equal(qrResponse.status, 200);
  assert.equal(qrResponse.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.match(qrResponse.headers.get('content-type') ?? '', /image\/svg\+xml/);
  assert.match(await qrResponse.text(), /<svg/);
});

test('emits HSTS only when explicitly enabled for a configured HTTPS origin', async () => {
  for (const testCase of [
    { publicOrigin: 'http://room-riot.local', expected: null },
    { publicOrigin: 'http://room-riot.local', enableHsts: true, expected: null },
    { publicOrigin: 'https://room-riot.example', expected: null },
    {
      publicOrigin: 'https://room-riot.example',
      enableHsts: true,
      expected: 'max-age=31536000; includeSubDomains',
    },
  ] as const) {
    const server = createServer(
      createRequestHandler(
        { version: 'test-version' },
        {
          publicOrigin: testCase.publicOrigin,
          ...('enableHsts' in testCase ? { enableHsts: testCase.enableHsts } : {}),
        },
      ),
    );
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(response.headers.get('strict-transport-security'), testCase.expected);
    server.close();
    await once(server, 'close');
  }
});
