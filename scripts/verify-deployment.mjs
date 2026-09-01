const baseUrl = (process.argv[2] ?? process.env.ROOM_RIOT_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);
const expectHsts = process.env.ROOM_RIOT_EXPECT_HSTS === 'true';

function hasExpectedSecurityHeaders(response) {
  const contentSecurityPolicy = response.headers.get('content-security-policy') ?? '';
  const permissionsPolicy = response.headers.get('permissions-policy') ?? '';
  const hsts = response.headers.get('strict-transport-security');
  return (
    contentSecurityPolicy.includes("frame-ancestors 'none'") &&
    contentSecurityPolicy.includes("object-src 'none'") &&
    !contentSecurityPolicy.includes('unsafe-inline') &&
    permissionsPolicy.includes('camera=()') &&
    permissionsPolicy.includes('microphone=()') &&
    response.headers.get('cross-origin-opener-policy') === 'same-origin' &&
    response.headers.get('cross-origin-resource-policy') === 'same-origin' &&
    response.headers.get('referrer-policy') === 'no-referrer' &&
    (expectHsts ? hsts?.includes('max-age=') === true : true)
  );
}

const registryUrl = `${baseUrl}/api/games`;
let games;
try {
  const response = await fetch(registryUrl);
  const body = await response.json();
  games = body.games;
  if (
    !response.ok ||
    !Array.isArray(games) ||
    games.length === 0 ||
    new Set(games.map((game) => game.id)).size !== games.length ||
    games.some(
      (game) =>
        typeof game.id !== 'string' ||
        typeof game.packageName !== 'string' ||
        !game.playerLimits ||
        !game.durationsMs ||
        !game.capabilities ||
        !game.routes ||
        !['host', 'display', 'play'].every(
          (route) => game.routes[route] === `/${route}/${game.id}`,
        ),
    )
  ) {
    throw new Error('registry manifest is incomplete or inconsistent');
  }
  console.log(`PASS ${registryUrl}`);
} catch (error) {
  console.log(`FAIL ${registryUrl} (${error instanceof Error ? error.message : String(error)})`);
  process.exit(1);
}

let stylePath;
try {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  stylePath = html.match(/href="(\/assets\/room-riot\.[a-f0-9]{12}\.css)"/)?.[1];
  if (
    !response.ok ||
    !stylePath ||
    /<style[\s>]/i.test(html) ||
    !hasExpectedSecurityHeaders(response)
  ) {
    throw new Error(
      'browser shell is missing its fingerprinted stylesheet or required security headers',
    );
  }
} catch (error) {
  console.log(`FAIL ${baseUrl}/ (${error instanceof Error ? error.message : String(error)})`);
  process.exit(1);
}

const checks = [
  {
    path: '/healthz',
    validate: async (response) => {
      const body = await response.json();
      return response.ok && body.status === 'ok' && body.engineReady === true;
    },
  },
  {
    path: '/readyz',
    validate: async (response) => {
      const body = await response.json();
      return response.ok && body.status === 'ready' && body.engineReady === true;
    },
  },
  {
    path: '/metrics',
    validate: async (response) => {
      const body = await response.json();
      return response.ok && typeof body.uptimeSeconds === 'number' && body.process?.rssBytes > 0;
    },
  },
  {
    path: '/host',
    validate: async (response) =>
      response.ok && (await response.text()).toLowerCase().includes('room riot'),
  },
  {
    path: '/display',
    validate: async (response) =>
      response.ok && (await response.text()).toLowerCase().includes('room riot'),
  },
  {
    path: '/showcase',
    validate: async (response) =>
      response.ok &&
      hasExpectedSecurityHeaders(response) &&
      (await response.text()).toLowerCase().includes('room riot'),
  },
  ...games.flatMap((game) =>
    Object.values(game.routes).map((path) => ({
      path,
      validate: async (response) =>
        response.ok && (await response.text()).toLowerCase().includes('room riot'),
    })),
  ),
  {
    path: '/play',
    validate: async (response) =>
      response.ok && (await response.text()).toLowerCase().includes('room riot'),
  },
  {
    path: '/socket.io/socket.io.js',
    validate: async (response) => response.ok && (await response.text()).includes('socket'),
  },
  {
    path: '/main.js',
    validate: async (response) =>
      response.ok &&
      (response.headers.get('content-type') ?? '').includes('javascript') &&
      (await response.text()).includes('room:state'),
  },
  {
    path: '/protocol.js',
    validate: async (response) => response.ok && (await response.text()).includes('isSuccess'),
  },
  {
    path: stylePath,
    validate: async (response) =>
      response.ok &&
      (response.headers.get('content-type') ?? '').includes('text/css') &&
      (response.headers.get('cache-control') ?? '').includes('immutable') &&
      (await response.text()).includes('--cyan:'),
  },
  ...[
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
    'drawn-out-icon-v2-256.webp',
    'drawn-out-bg-v2.webp',
    'drawn-out-stage-v2.webp',
    'drawn-out-stage-v2-480.webp',
    'blank-line-icon-v1.webp',
    'blank-line-icon-v1-256.webp',
    'blank-line-bg-v1.webp',
    'blank-line-stage-v1.webp',
    'blank-line-stage-v1-480.webp',
    'wavelength-icon-v1.webp',
    'wavelength-icon-v1-256.webp',
    'wavelength-bg-v1.webp',
    'wavelength-stage-v1.webp',
    'wavelength-stage-v1-480.webp',
    'groupthink-icon-256.webp',
    'groupthink-reactor-v2-480.webp',
    'hot-take-icon-256.webp',
    'hot-take-podium-v2-480.webp',
    'suspect-icon-v2-256.webp',
    'suspect-stage-v2-480.webp',
  ].map((assetName) => ({
    path: `/assets/${assetName}`,
    validate: async (response) =>
      response.ok && (response.headers.get('content-type') ?? '').includes('image/webp'),
  })),
  ...[
    'room-riot-ui-latin-400.woff2',
    'room-riot-ui-latin-700.woff2',
    'room-riot-display-latin-700.woff2',
  ].map((assetName) => ({
    path: `/assets/fonts/${assetName}`,
    validate: async (response) =>
      response.ok &&
      (response.headers.get('content-type') ?? '').includes('font/woff2') &&
      (await response.arrayBuffer()).byteLength > 1_000,
  })),
];

let failed = false;
for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  try {
    const response = await fetch(url);
    const passed = await check.validate(response);
    console.log(`${passed ? 'PASS' : 'FAIL'} ${url}`);
    failed ||= !passed;
  } catch (error) {
    console.log(`FAIL ${url} (${error instanceof Error ? error.message : String(error)})`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
