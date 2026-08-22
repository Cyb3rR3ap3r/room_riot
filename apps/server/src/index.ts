import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequestHandler } from './http.js';
import { RoomManager } from './room-manager.js';
import { attachRealtimeServer } from './socket.js';

export interface ServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly version?: string;
  readonly webRoot?: string;
  readonly roomManager?: RoomManager;
}

export function startServer(options: ServerOptions = {}) {
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const version = options.version ?? process.env.npm_package_version ?? '0.1.0';
  const roomManager = options.roomManager ?? new RoomManager();
  const webRoot =
    options.webRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  const server = createServer(createRequestHandler({ version }, { roomManager, webRoot }));
  attachRealtimeServer(server, roomManager);

  server.listen(port, host, () => {
    const address = server.address();
    const location =
      typeof address === 'object' && address ? `${address.address}:${address.port}` : address;
    console.log(`Room Riot server listening on ${location}`);
  });

  return server;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined && resolve(entrypoint) === resolve(fileURLToPath(import.meta.url))
  );
}

if (isMainModule()) {
  const server = startServer();
  const shutdown = (signal: string) => {
    console.log(`Received ${signal}; shutting down.`);
    server.close(() => process.exit(0));
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
