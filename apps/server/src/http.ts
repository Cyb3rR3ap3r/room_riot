import { readFile } from 'node:fs/promises';
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
  readonly publicOrigin?: string;
}

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
} as const;

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

export function createRequestHandler(metadata: ServerMetadata, options: HttpOptions = {}) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      writeJson(response, 400, { status: 'error', error: 'invalid_request_target' });
      return;
    }

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
        void writeQrCode(response, buildJoinUrl(request, roomCode, gameId, options.publicOrigin));
        return;
      }
    }

    if (request.method === 'GET' && options.webRoot) {
      const pagePaths = new Set([
        '/',
        '/display',
        '/display/groupthink',
        '/display/hot-take',
        '/display/suspect',
        '/display/drawn-out',
        '/host',
        '/host/groupthink',
        '/host/hot-take',
        '/host/suspect',
        '/host/drawn-out',
        '/play',
        '/play/groupthink',
        '/play/hot-take',
        '/play/suspect',
        '/play/drawn-out',
      ]);
      if (pagePaths.has(requestUrl.pathname)) {
        void serveFile(
          response,
          resolve(options.webRoot, 'index.html'),
          'text/html; charset=utf-8',
          'no-cache',
        );
        return;
      }

      if (requestUrl.pathname === '/main.js' || requestUrl.pathname === '/protocol.js') {
        void serveFile(
          response,
          resolve(options.webRoot, requestUrl.pathname.slice(1)),
          'text/javascript; charset=utf-8',
          'no-cache',
        );
        return;
      }

      const assetMatch = requestUrl.pathname.match(/^\/assets\/([a-z0-9][a-z0-9._-]*)$/i);
      if (assetMatch) {
        const assetName = assetMatch[1] ?? '';
        const contentType = assetName.endsWith('.png') ? 'image/png' : 'application/octet-stream';
        void serveFile(
          response,
          resolve(options.webRoot, 'assets', assetName),
          contentType,
          'public, max-age=86_400',
        );
        return;
      }
    }

    writeJson(response, 404, {
      status: 'error',
      error: 'not_found',
    });
  };
}

async function serveFile(
  response: ServerResponse,
  filePath: string,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      'cache-control': cacheControl,
      'content-type': contentType,
      'content-length': contents.byteLength,
    });
    response.end(contents);
  } catch {
    if (!response.headersSent) writeJson(response, 404, { status: 'error', error: 'not_found' });
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
      ...SECURITY_HEADERS,
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
  const gamePath =
    gameId === 'groupthink' ||
    gameId === 'hot-take' ||
    gameId === 'suspect' ||
    gameId === 'drawn-out'
      ? `/${gameId}`
      : '';
  return `/play${gamePath}?room=${encodeURIComponent(roomCode)}`;
}

function buildJoinUrl(
  request: IncomingMessage,
  roomCode: string,
  gameId: string | null,
  configuredOrigin?: string,
): string {
  if (configuredOrigin) {
    try {
      const origin = new URL(configuredOrigin);
      if (origin.protocol === 'http:' || origin.protocol === 'https:') {
        return `${origin.origin}${buildJoinPath(roomCode, gameId)}`;
      }
    } catch {
      // Fall back to a validated request origin below.
    }
  }

  const forwardedProtocol = request.headers['x-forwarded-proto'];
  const protocol =
    typeof forwardedProtocol === 'string' && forwardedProtocol.split(',')[0]?.trim() === 'https'
      ? 'https'
      : 'http';
  const host = request.headers.host ?? 'localhost:3000';
  try {
    const origin = new URL(`${protocol}://${host}`);
    return `${origin.origin}${buildJoinPath(roomCode, gameId)}`;
  } catch {
    return `http://localhost:3000${buildJoinPath(roomCode, gameId)}`;
  }
}
