import type { SupportedGameId } from '@room-riot/contracts';
import type { DrawnOutPublicView } from '@room-riot/drawn-out';
import type { PublicRoomState } from '@room-riot/game-engine';
import type { GroupthinkPublicView } from '@room-riot/groupthink';
import type { HotTakePublicView } from '@room-riot/hot-take';
import type { SuspectPublicView } from '@room-riot/suspect';

import type { RoomSnapshot } from '../protocol.js';
import { renderDrawnOutPublicStage } from './drawn-out/public-stage.js';
import { renderGroupthinkPublicStage } from './groupthink/public-stage.js';
import { renderHotTakePublicStage } from './hot-take/public-stage.js';
import type { PublicStageDependencies } from './public-stage.js';
import { renderSuspectPublicStage } from './suspect/public-stage.js';

export interface PublicGameViewById {
  readonly groupthink: GroupthinkPublicView;
  readonly 'hot-take': HotTakePublicView;
  readonly suspect: SuspectPublicView;
  readonly 'drawn-out': DrawnOutPublicView;
}

export interface PublicStageRenderer<K extends SupportedGameId> {
  readonly gameId: K;
  render(
    state: PublicRoomState,
    game: PublicGameViewById[K],
    dependencies: PublicStageDependencies,
  ): HTMLElement;
}

type PublicGameView = NonNullable<RoomSnapshot['game']>;

export interface PublicStageRendererAdapter {
  readonly gameId: SupportedGameId;
  readonly render: (
    state: PublicRoomState,
    game: PublicGameView,
    dependencies: PublicStageDependencies,
  ) => HTMLElement;
}

export type PublicStageRendererRegistry = Readonly<
  Record<SupportedGameId, PublicStageRendererAdapter>
>;

function adaptPublicStageRenderer<K extends SupportedGameId>(
  renderer: PublicStageRenderer<K>,
): PublicStageRendererAdapter {
  return {
    gameId: renderer.gameId,
    render: (state, game, dependencies) =>
      renderer.render(state, game as PublicGameViewById[K], dependencies),
  };
}

export const PUBLIC_STAGE_RENDERERS: PublicStageRendererRegistry = {
  groupthink: adaptPublicStageRenderer({
    gameId: 'groupthink',
    render: renderGroupthinkPublicStage,
  }),
  'hot-take': adaptPublicStageRenderer({ gameId: 'hot-take', render: renderHotTakePublicStage }),
  suspect: adaptPublicStageRenderer({ gameId: 'suspect', render: renderSuspectPublicStage }),
  'drawn-out': adaptPublicStageRenderer({ gameId: 'drawn-out', render: renderDrawnOutPublicStage }),
};

export function renderPublicGameStage(
  snapshot: RoomSnapshot,
  dependencies: PublicStageDependencies,
): HTMLElement | null {
  const game = snapshot.game;
  if (!game) return null;
  return PUBLIC_STAGE_RENDERERS[game.id].render(snapshot.state, game, dependencies);
}
