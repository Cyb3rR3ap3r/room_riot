import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import QRCode from 'qrcode';

import { createInitialRoomState } from '@room-riot/game-engine';

import type { RoomManager } from './room-manager.js';

export interface ServerMetadata {
  readonly version: string;
}

export interface HttpOptions {
  readonly roomManager?: RoomManager;
  readonly webRoot?: string;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

export function createRequestHandler(metadata: ServerMetadata, options: HttpOptions = {}) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
      const engineReady = createInitialRoomState({ roomCode: 'READY', now: 0 }).phase === 'lobby';

      writeJson(response, 200, {
        status: 'ok',
        service: 'room-riot-server',
        version: metadata.version,
        engineReady,
      });
      return;
    }

    if (request.method === 'GET' && options.roomManager) {
      const qrMatch = requestUrl.pathname.match(/^\/api\/rooms\/([^/]+)\/qr\.svg$/);
      if (qrMatch) {
        const roomCode = decodeURIComponent(qrMatch[1] ?? '');
        if (!options.roomManager.hasRoom(roomCode)) {
          writeJson(response, 404, { status: 'error', error: 'room_not_found' });
          return;
        }

        const gameId = options.roomManager.getRoomSnapshot(roomCode).state.gameId;
        void writeQrCode(response, buildJoinUrl(request, roomCode, gameId));
        return;
      }
    }

    if (request.method === 'GET' && options.webRoot) {
      const pagePaths = new Set([
        '/',
        '/display',
        '/display/groupthink',
        '/display/hot-take',
        '/host',
        '/host/groupthink',
        '/host/hot-take',
        '/play',
        '/play/groupthink',
        '/play/hot-take',
      ]);
      if (pagePaths.has(requestUrl.pathname)) {
        serveFile(response, resolve(options.webRoot, 'index.html'), 'text/html; charset=utf-8');
        return;
      }

      if (requestUrl.pathname === '/main.js' || requestUrl.pathname === '/protocol.js') {
        serveFile(
          response,
          resolve(options.webRoot, requestUrl.pathname.slice(1)),
          'text/javascript; charset=utf-8',
        );
        return;
      }

      const assetMatch = requestUrl.pathname.match(/^\/assets\/([a-z0-9][a-z0-9._-]*)$/i);
      if (assetMatch) {
        const assetName = assetMatch[1] ?? '';
        const contentType = assetName.endsWith('.png') ? 'image/png' : 'application/octet-stream';
        serveFile(response, resolve(options.webRoot, 'assets', assetName), contentType);
        return;
      }
    }

    writeJson(response, 404, {
      status: 'error',
      error: 'not_found',
    });
  };
}

function serveFile(response: ServerResponse, filePath: string, contentType: string): void {
  try {
    const contents = readFileSync(filePath);
    response.writeHead(200, {
      'content-type': contentType,
      'content-length': contents.byteLength,
    });
    response.end(contents);
  } catch {
    writeJson(response, 404, { status: 'error', error: 'not_found' });
  }
}

async function writeQrCode(response: ServerResponse, joinUrl: string): Promise<void> {
  try {
    const svg = await QRCode.toString(joinUrl, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'image/svg+xml; charset=utf-8',
      'content-length': Buffer.byteLength(svg),
    });
    response.end(svg);
  } catch {
    writeJson(response, 500, { status: 'error', error: 'qr_generation_failed' });
  }
}

export function buildJoinPath(roomCode: string, gameId: string | null): string {
  const gamePath = gameId === 'groupthink' || gameId === 'hot-take' ? `/${gameId}` : '';
  return `/play${gamePath}?room=${encodeURIComponent(roomCode)}`;
}

function buildJoinUrl(request: IncomingMessage, roomCode: string, gameId: string | null): string {
  const forwardedProtocol = request.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProtocol === 'string' ? forwardedProtocol : 'http';
  const host = request.headers.host ?? 'localhost:3000';
  return `${protocol}://${host}${buildJoinPath(roomCode, gameId)}`;
}
