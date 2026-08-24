import { isSupportedGameId, type SupportedGameId } from '../app/catalog.js';

export const routes = {
  display: '/display',
  host: '/host',
  play: '/play',
} as const;

export function getGameFromPathname(pathname: string): SupportedGameId | null {
  const match = pathname.match(/^\/(?:host|display|play)\/([^/?#]+)$/);
  return isSupportedGameId(match?.[1]) ? match[1] : null;
}

function roomQuery(roomCode: string): string {
  return roomCode ? `?room=${encodeURIComponent(roomCode)}` : '';
}

export function buildHostRoute(gameId: SupportedGameId, roomCode = ''): string {
  return `/host/${gameId}${roomQuery(roomCode)}`;
}

export function buildDisplayRoute(gameId: SupportedGameId, roomCode: string): string {
  return `/display/${gameId}${roomQuery(roomCode)}`;
}

export function buildPlayRoute(gameId: SupportedGameId, roomCode = ''): string {
  return `/play/${gameId}${roomQuery(roomCode)}`;
}

export function getRoomCodeFromSearch(search: string): string {
  return new URLSearchParams(search).get('room')?.trim().toUpperCase() ?? '';
}
