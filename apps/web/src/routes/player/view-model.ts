import type { RoomPhase } from '@room-riot/contracts';

import type { SupportedGameId } from '../../app/catalog.js';
import { getGamePresentation } from '../../games/presentation.js';

export interface PlayerRouteViewModel {
  readonly joinKicker: string;
  readonly joinHelper: string;
  readonly controllerClass: string;
  readonly controllerTitle: string;
}

export function getPlayerRouteViewModel(
  gameId: SupportedGameId,
  phase: RoomPhase | 'lobby' = 'lobby',
): PlayerRouteViewModel {
  const presentation = getGamePresentation(gameId);
  return {
    joinKicker: presentation.joinKicker,
    joinHelper: presentation.joinHelper,
    controllerClass: presentation.controllerClass,
    controllerTitle:
      phase === 'lobby' ? presentation.controllerLobbyTitle : presentation.controllerActiveTitle,
  };
}
