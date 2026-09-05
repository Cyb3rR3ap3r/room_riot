import type { RoomPhase } from '@room-riot/contracts';

import type { SupportedGameId } from '../../app/catalog.js';
import { getGameDefinition } from '../../app/catalog.js';
import { buildPlayRoute } from '../routes.js';

export type JoinAvailability = 'open' | 'queued' | 'full' | 'locked' | 'closed';
export type JoinPresentationMode = 'full' | 'compact' | 'hidden' | 'locked';

export interface PhaseAwareJoinInput {
  readonly gameId: SupportedGameId;
  readonly roomCode: string;
  readonly phase: RoomPhase;
  readonly availability: JoinAvailability;
  readonly origin: string;
  readonly showDuringPlay?: boolean;
}

export interface PhaseAwareJoinViewModel {
  readonly mode: JoinPresentationMode;
  readonly availability: JoinAvailability;
  readonly title: string;
  readonly instruction: string;
  readonly roomCode: string | null;
  readonly manualUrl: string | null;
  /** Short, typable form of {@link manualUrl} shown to the room. */
  readonly manualUrlLabel: string | null;
  readonly qr: Readonly<{ src: string; alt: string }> | null;
  readonly advertisesJoin: boolean;
  readonly accessibleLabel: string;
}

export function createPhaseAwareJoinViewModel(input: PhaseAwareJoinInput): PhaseAwareJoinViewModel {
  const roomCode = input.roomCode.trim().toUpperCase();
  const game = getGameDefinition(input.gameId);
  const usable = input.availability === 'open' || input.availability === 'queued';
  const lobby = input.phase === 'lobby';
  const mode: JoinPresentationMode = !usable
    ? 'locked'
    : lobby
      ? 'full'
      : input.showDuringPlay
        ? 'compact'
        : 'hidden';
  const advertisesJoin = mode === 'full' || mode === 'compact';
  const manualUrl =
    mode === 'full' ? buildAbsoluteJoinUrl(input.origin, input.gameId, roomCode) : null;
  const qr =
    mode === 'full'
      ? {
          src: `/api/rooms/${encodeURIComponent(roomCode)}/qr.svg`,
          alt: `QR code to join ${game.label}, room ${roomCode}`,
        }
      : null;

  if (mode === 'locked') {
    const title =
      input.availability === 'full'
        ? 'Room full'
        : input.availability === 'closed'
          ? 'Room closed'
          : 'Joining locked';
    return {
      mode,
      availability: input.availability,
      title,
      instruction: 'This room is not accepting new players. Watch the game on this screen.',
      roomCode: null,
      manualUrl: null,
      manualUrlLabel: null,
      qr: null,
      advertisesJoin: false,
      accessibleLabel: `${title}. New players cannot join.`,
    };
  }

  if (mode === 'hidden') {
    return {
      mode,
      availability: input.availability,
      title: 'Join badge hidden',
      instruction: 'The current game has priority on the shared screen.',
      roomCode: null,
      manualUrl: null,
      manualUrlLabel: null,
      qr: null,
      advertisesJoin: false,
      accessibleLabel: 'Join information hidden during active play',
    };
  }

  return {
    mode,
    availability: input.availability,
    title: mode === 'full' ? 'Join the room' : 'Join next round',
    instruction:
      input.availability === 'queued'
        ? 'Enter this code on a phone to join the queue.'
        : mode === 'full'
          ? 'Scan the QR code or type the address, then enter the room code.'
          : 'Use the address and room code to join from a phone.',
    roomCode,
    manualUrl,
    // People type this off a television, so show the host and path only. The
    // full absolute URL overflowed the panel and was cut mid-query-string.
    manualUrlLabel: manualUrl ? buildJoinUrlLabel(input.origin, input.gameId) : null,
    qr,
    advertisesJoin,
    accessibleLabel: `${mode === 'full' ? 'Full' : 'Compact'} join information for room ${roomCode}`,
  };
}

function buildJoinUrlLabel(origin: string, gameId: SupportedGameId): string {
  return `${new URL(origin).host}${buildPlayRoute(gameId)}`;
}

function buildAbsoluteJoinUrl(origin: string, gameId: SupportedGameId, roomCode: string): string {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    throw new TypeError('Join origin must use HTTP or HTTPS.');
  }
  return new URL(buildPlayRoute(gameId, roomCode), parsedOrigin.origin).toString();
}
