import { getGameDefinition, type SupportedGameId } from '../../app/catalog.js';

export interface DisplayRouteViewModel {
  readonly title: string;
  readonly subtitle: string;
  readonly emptyMessage: string;
}

export function getDisplayRouteViewModel(
  roomCode: string,
  gameId: SupportedGameId | null,
): DisplayRouteViewModel {
  return {
    title: roomCode
      ? `Room ${roomCode}`
      : gameId
        ? `${getGameDefinition(gameId).label} Display`
        : 'Display',
    subtitle: roomCode
      ? 'Players, grab your phones.'
      : 'Open this page with a room code to watch a lobby.',
    emptyMessage: 'Use /display?room=CODE after the host creates a room.',
  };
}
