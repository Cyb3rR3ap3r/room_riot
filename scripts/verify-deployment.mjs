const baseUrl = (process.argv[2] ?? process.env.ROOM_RIOT_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);

const checks = [
  {
    path: '/healthz',
    validate: async (response) => {
      const body = await response.json();
      return response.ok && body.status === 'ok' && body.engineReady === true;
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
  ...['groupthink', 'hot-take'].flatMap((gameId) => [
    {
      path: `/host/${gameId}`,
      validate: async (response) =>
        response.ok && (await response.text()).toLowerCase().includes('room riot'),
    },
    {
      path: `/display/${gameId}`,
      validate: async (response) =>
        response.ok && (await response.text()).toLowerCase().includes('room riot'),
    },
  ]),
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
    path: '/protocol.js',
    validate: async (response) => response.ok && (await response.text()).includes('isSuccess'),
  },
  ...['room-riot-logo.png', 'groupthink-icon.png', 'hot-take-icon.png'].map((assetName) => ({
    path: `/assets/${assetName}`,
    validate: async (response) =>
      response.ok && (response.headers.get('content-type') ?? '').includes('image/png'),
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
