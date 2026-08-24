import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import QRCode from 'qrcode';

import { SupportedGameIdSchema } from '@room-riot/contracts';
import { INTERNAL_ERROR_MESSAGE } from '@room-riot/contracts';
import { createInitialRoomState } from '@room-riot/game-engine';

import { GAME_PAGE_ROUTES, GAME_REGISTRY_METADATA } from './game-registry.js';
import type { RoomManager } from './room-manager.js';

export interface ServerMetadata {
  readonly version: string;
}

export interface HttpOptions {
  readonly roomManager?: RoomManager;
  readonly webRoot?: string;
  readonly publicOrigin?: string;
  readonly enableHsts?: boolean;
}

const BASE_SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' ws: wss:",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
} as const;

type SecurityHeaders = Record<string, string>;

function buildSecurityHeaders(options: HttpOptions): SecurityHeaders {
  if (!options.enableHsts || !isHttpsOrigin(options.publicOrigin)) return BASE_SECURITY_HEADERS;
  return {
    ...BASE_SECURITY_HEADERS,
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
  };
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  securityHeaders: SecurityHeaders,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    ...securityHeaders,
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

export function createRequestHandler(metadata: ServerMetadata, options: HttpOptions = {}) {
  const securityHeaders = buildSecurityHeaders(options);
  return (request: IncomingMessage, response: ServerResponse): void => {
    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      writeJson(
        response,
        400,
        { status: 'error', error: 'invalid_request_target' },
        securityHeaders,
      );
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
      const engineReady = createInitialRoomState({ roomCode: 'READY', now: 0 }).phase === 'lobby';

      writeJson(
        response,
        200,
        {
          status: 'ok',
          service: 'room-riot-server',
          version: metadata.version,
          engineReady,
        },
        securityHeaders,
      );
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/games') {
      writeJson(
        response,
        200,
        {
          games: Object.values(GAME_REGISTRY_METADATA),
        },
        securityHeaders,
      );
      return;
    }

    if (request.method === 'GET' && options.roomManager) {
      const qrMatch = requestUrl.pathname.match(/^\/api\/rooms\/([^/]+)\/qr\.svg$/);
      if (qrMatch) {
        const roomCode = decodeURIComponent(qrMatch[1] ?? '');
        if (!options.roomManager.hasRoom(roomCode)) {
          writeJson(response, 404, { status: 'error', error: 'room_not_found' }, securityHeaders);
          return;
        }

        const gameId = options.roomManager.getRoomSnapshot(roomCode).state.gameId;
        void writeQrCode(
          response,
          buildJoinUrl(request, roomCode, gameId, options.publicOrigin),
          securityHeaders,
        );
        return;
      }
    }

    if (request.method === 'GET' && options.webRoot) {
      if (requestUrl.pathname === '/showcase') {
        void serveFile(
          response,
          resolve(options.webRoot, 'showcase.html'),
          'text/html; charset=utf-8',
          'no-cache',
          securityHeaders,
        );
        return;
      }

      const pagePaths = new Set(['/', '/display', '/host', '/play', ...GAME_PAGE_ROUTES]);
      if (pagePaths.has(requestUrl.pathname)) {
        void serveFile(
          response,
          resolve(options.webRoot, 'index.html'),
          'text/html; charset=utf-8',
          'no-cache',
          securityHeaders,
        );
        return;
      }

      if (requestUrl.pathname === '/main.js' || requestUrl.pathname === '/protocol.js') {
        void serveFile(
          response,
          resolve(options.webRoot, requestUrl.pathname.slice(1)),
          'text/javascript; charset=utf-8',
          'no-cache',
          securityHeaders,
        );
        return;
      }

      const assetMatch = requestUrl.pathname.match(/^\/assets\/([a-z0-9][a-z0-9._-]*)$/i);
      if (assetMatch) {
        const assetName = assetMatch[1] ?? '';
        const contentType = assetName.endsWith('.webp')
          ? 'image/webp'
          : assetName.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'application/octet-stream';
        const cacheControl = /^room-riot\.[a-f0-9]{12}\.css$/.test(assetName)
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=86_400';
        void serveFile(
          response,
          resolve(options.webRoot, 'assets', assetName),
          contentType,
          cacheControl,
          securityHeaders,
        );
        return;
      }
    }

    writeJson(
      response,
      404,
      {
        status: 'error',
        error: 'not_found',
      },
      securityHeaders,
    );
  };
}

async function serveFile(
  response: ServerResponse,
  filePath: string,
  contentType: string,
  cacheControl: string,
  securityHeaders: SecurityHeaders,
): Promise<void> {
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      ...securityHeaders,
      'cache-control': cacheControl,
      'content-type': contentType,
      'content-length': contents.byteLength,
    });
    response.end(contents);
  } catch {
    if (!response.headersSent) {
      writeJson(response, 404, { status: 'error', error: 'not_found' }, securityHeaders);
    }
  }
}

async function writeQrCode(
  response: ServerResponse,
  joinUrl: string,
  securityHeaders: SecurityHeaders,
): Promise<void> {
  try {
    const svg = await QRCode.toString(joinUrl, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    response.writeHead(200, {
      ...securityHeaders,
      'cache-control': 'no-store',
      'content-type': 'image/svg+xml; charset=utf-8',
      'content-length': Buffer.byteLength(svg),
    });
    response.end(svg);
  } catch (error) {
    const correlationId = randomUUID();
    console.error(`[Room Riot ${correlationId}] QR generation failed.`, error);
    writeJson(
      response,
      500,
      {
        status: 'error',
        error: 'qr_generation_failed',
        message: INTERNAL_ERROR_MESSAGE,
        correlationId,
      },
      securityHeaders,
    );
  }
}

function isHttpsOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildJoinPath(roomCode: string, gameId: string | null): string {
  const parsedGameId = SupportedGameIdSchema.safeParse(gameId);
  const gamePath = parsedGameId.success
    ? GAME_REGISTRY_METADATA[parsedGameId.data].routes.play.slice('/play'.length)
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
