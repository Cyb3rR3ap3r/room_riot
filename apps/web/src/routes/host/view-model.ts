import type { DrawnOutMode, RoomPhase } from '@room-riot/contracts';

import type { SupportedGameId } from '../../app/catalog.js';
import { getGamePresentation } from '../../games/presentation.js';

export interface HostPrimaryActionModel {
  readonly event: 'host:start-game' | 'host:reveal-results' | 'host:next-round';
  readonly label: string;
  readonly disabled: boolean;
}

export interface HostRouteViewModel {
  readonly controlsClass: string;
  readonly maxPlayers: number;
  readonly primaryAction: HostPrimaryActionModel | null;
}

export function getHostRouteViewModel(
  gameId: SupportedGameId,
  phase: RoomPhase,
  playerCount: number,
  drawnOutMode: DrawnOutMode = 'classic',
): HostRouteViewModel {
  const presentation = getGamePresentation(gameId);
  const playerLimits = presentation.getPlayerLimits(drawnOutMode);
  const primaryAction: HostPrimaryActionModel | null =
    phase === 'lobby'
      ? {
          event: 'host:start-game',
          label: presentation.hostLabels.start,
          disabled: playerCount < playerLimits.minimum,
        }
      : phase === 'input' || phase === 'alibi' || phase === 'voting'
        ? {
            event: 'host:reveal-results',
            label: presentation.hostLabels[phase],
            disabled: false,
          }
        : phase === 'results'
          ? {
              event: 'host:next-round',
              label: presentation.hostLabels.results,
              disabled: false,
            }
          : null;
  return {
    controlsClass: presentation.hostControlsClass,
    maxPlayers: playerLimits.maximum,
    primaryAction,
  };
}
