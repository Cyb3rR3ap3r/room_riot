import type { SupportedGameId } from '../app/catalog.js';
import { drawnOutPresentation } from './drawn-out/presentation.js';
import { groupthinkPresentation } from './groupthink/presentation.js';
import { hotTakePresentation } from './hot-take/presentation.js';
import { suspectPresentation } from './suspect/presentation.js';
import type { GamePresentation } from './types.js';

export const GAME_PRESENTATIONS: Readonly<Record<SupportedGameId, GamePresentation>> = {
  groupthink: groupthinkPresentation,
  'hot-take': hotTakePresentation,
  suspect: suspectPresentation,
  'drawn-out': drawnOutPresentation,
};

export function getGamePresentation(gameId: SupportedGameId): GamePresentation {
  return GAME_PRESENTATIONS[gameId];
}
