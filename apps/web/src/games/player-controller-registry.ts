import type { SupportedGameId } from '@room-riot/contracts';
import type { BlankLinePlayerView } from '@room-riot/blank-line';
import type { DrawnOutPlayerView } from '@room-riot/drawn-out';
import type { GroupthinkPlayerView } from '@room-riot/groupthink';
import type { HotTakePlayerView } from '@room-riot/hot-take';
import type { SuspectPlayerView } from '@room-riot/suspect';
import type { WavelengthPlayerView } from '@room-riot/wavelength';

import type { PlayerGameView, RoomSnapshot } from '../protocol.js';
import { renderBlankLinePlayerController } from './blank-line/player-controller.js';
import { renderDrawnOutPlayerController } from './drawn-out/player-controller.js';
import { renderGroupthinkPlayerController } from './groupthink/player-controller.js';
import { renderHotTakePlayerController } from './hot-take/player-controller.js';
import type {
  PlayerControllerContext,
  PlayerControllerDependencies,
  PlayerControllerRenderResult,
} from './player-controller.js';
import type { PublicGameViewById } from './public-stage-registry.js';
import { renderSuspectPlayerController } from './suspect/player-controller.js';
import { renderWavelengthPlayerController } from './wavelength/player-controller.js';

export interface PlayerGameViewById {
  readonly groupthink: GroupthinkPlayerView;
  readonly 'hot-take': HotTakePlayerView;
  readonly suspect: SuspectPlayerView;
  readonly 'drawn-out': DrawnOutPlayerView;
  readonly 'blank-line': BlankLinePlayerView;
  readonly wavelength: WavelengthPlayerView;
}

export interface PlayerControllerRenderer<K extends SupportedGameId> {
  readonly gameId: K;
  render(
    context: PlayerControllerContext,
    game: PublicGameViewById[K],
    player: PlayerGameViewById[K],
    dependencies: PlayerControllerDependencies,
  ): PlayerControllerRenderResult;
}

type PublicGameView = NonNullable<RoomSnapshot['game']>;

export interface PlayerControllerRendererAdapter {
  readonly gameId: SupportedGameId;
  readonly render: (
    context: PlayerControllerContext,
    game: PublicGameView,
    player: PlayerGameView,
    dependencies: PlayerControllerDependencies,
  ) => PlayerControllerRenderResult;
}

export type PlayerControllerRendererRegistry = Readonly<
  Record<SupportedGameId, PlayerControllerRendererAdapter>
>;

function adaptPlayerControllerRenderer<K extends SupportedGameId>(
  renderer: PlayerControllerRenderer<K>,
): PlayerControllerRendererAdapter {
  return {
    gameId: renderer.gameId,
    render: (context, game, player, dependencies) =>
      renderer.render(
        context,
        game as PublicGameViewById[K],
        player as PlayerGameViewById[K],
        dependencies,
      ),
  };
}

export const PLAYER_CONTROLLER_RENDERERS: PlayerControllerRendererRegistry = {
  groupthink: adaptPlayerControllerRenderer({
    gameId: 'groupthink',
    render: renderGroupthinkPlayerController,
  }),
  'hot-take': adaptPlayerControllerRenderer({
    gameId: 'hot-take',
    render: renderHotTakePlayerController,
  }),
  suspect: adaptPlayerControllerRenderer({
    gameId: 'suspect',
    render: renderSuspectPlayerController,
  }),
  'drawn-out': adaptPlayerControllerRenderer({
    gameId: 'drawn-out',
    render: renderDrawnOutPlayerController,
  }),
  'blank-line': adaptPlayerControllerRenderer({
    gameId: 'blank-line',
    render: renderBlankLinePlayerController,
  }),
  wavelength: adaptPlayerControllerRenderer({
    gameId: 'wavelength',
    render: renderWavelengthPlayerController,
  }),
};

export function renderPlayerController(
  snapshot: RoomSnapshot,
  playerState: PlayerGameView | null,
  context: Omit<PlayerControllerContext, 'gameId' | 'room' | 'phase'>,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult | null {
  const game = snapshot.game;
  if (!game || !playerState || game.id !== playerState.id) return null;
  const completeContext: PlayerControllerContext = {
    ...context,
    gameId: game.id,
    room: snapshot.state,
    phase: snapshot.state.phase,
  };
  return PLAYER_CONTROLLER_RENDERERS[game.id].render(
    completeContext,
    game,
    playerState,
    dependencies,
  );
}
