import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequestHandler } from './http.js';
import { RoomManager } from './room-manager.js';
import { attachRealtimeServer } from './socket.js';
import { OperationalMetrics } from './metrics.js';

const runtimes = new WeakMap<
  HttpServer,
  { readonly closeRealtime: (callback: () => void) => void; readonly roomManager: RoomManager }
>();

export interface ServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly version?: string;
  readonly webRoot?: string;
  readonly publicOrigin?: string;
  readonly enableHsts?: boolean;
  readonly roomManager?: RoomManager;
}

export function startServer(options: ServerOptions = {}) {
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const version = options.version ?? process.env.npm_package_version ?? '0.1.0';
  const metrics = new OperationalMetrics();
  const roomManager = options.roomManager ?? new RoomManager({ metrics });
  let realtimeReady = false;
  const webRoot =
    options.webRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  const enableHsts = options.enableHsts ?? process.env.ENABLE_HSTS === 'true';
  const server = createServer(
    createRequestHandler(
      { version },
      {
        roomManager,
        webRoot,
        ...(publicOrigin ? { publicOrigin } : {}),
        ...(enableHsts ? { enableHsts } : {}),
        metrics,
        webReady: () => existsSync(resolve(webRoot, 'index.html')),
        realtimeReady: () => realtimeReady,
      },
    ),
  );
  const realtimeServer = attachRealtimeServer(server, roomManager, { metrics });
  realtimeReady = true;
  runtimes.set(server, {
    closeRealtime: (callback) => realtimeServer.close(callback),
    roomManager,
  });

  server.listen(port, host, () => {
    const address = server.address();
    const location =
      typeof address === 'object' && address ? `${address.address}:${address.port}` : address;
    console.log(JSON.stringify({ event: 'server_started', location, version }));
  });

  return server;
}

export function stopServer(server: HttpServer, callback: () => void): void {
  const runtime = runtimes.get(server);
  if (!runtime) {
    server.close(callback);
    return;
  }
  runtime.roomManager.beginDrain();
  runtime.closeRealtime(() => {
    runtime.roomManager.close();
    server.close(callback);
  });
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
    console.log(JSON.stringify({ event: 'server_shutdown_requested', signal }));
    stopServer(server, () => process.exit(0));
    const forceExit = setTimeout(() => process.exit(1), 5_000);
    forceExit.unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
