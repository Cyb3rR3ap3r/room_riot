import type {
  ContentMode,
  DrawingData,
  DrawnOutMode,
  GamePlayerLimits,
  PlayerId,
  PromptMode,
  RoomPhase,
  RoomSettings,
  SupportedGameId,
} from '@room-riot/contracts';
import {
  GAME_PLAYER_LIMITS,
  PlayerIdSchema,
  SupportedGameIdSchema,
  getGamePlayerLimits,
} from '@room-riot/contracts';
import {
  DRAWN_OUT_GAME_ID,
  DRAWN_OUT_GUESS_DURATION_MS,
  DRAWN_OUT_TURN_DURATION_MS,
  advanceDrawnOutRound,
  createDrawnOutSession,
  expireDrawnOutStep,
  getDrawnOutPlayerView,
  getDrawnOutPublicView,
  loadDrawnOutPrompts,
  revealDrawnOutStep,
  submitDrawnOutDrawing,
  submitDrawnOutText,
  submitDrawnOutVote,
} from '@room-riot/drawn-out';
import type {
  DrawnOutPlayerView,
  DrawnOutPrompt,
  DrawnOutPublicView,
  DrawnOutSessionState,
} from '@room-riot/drawn-out';
import {
  GROUPTHINK_GAME_ID,
  GROUPTHINK_INPUT_DURATION_MS,
  advanceGroupthinkRound,
  allPlayersSubmitted,
  createGroupthinkSession,
  getGroupthinkPlayerView,
  getGroupthinkPublicView,
  loadGroupthinkPrompts,
  revealGroupthink,
  submitGroupthinkAnswer,
} from '@room-riot/groupthink';
import type {
  GroupthinkPlayerView,
  GroupthinkPrompt,
  GroupthinkPublicView,
  GroupthinkSessionState,
} from '@room-riot/groupthink';
import {
  HOT_TAKE_GAME_ID,
  HOT_TAKE_INPUT_DURATION_MS,
  HOT_TAKE_VOTING_DURATION_MS,
  advanceHotTakeRound,
  allHotTakePlayersSubmitted,
  allHotTakePlayersVoted,
  createHotTakeSession,
  getHotTakePlayerView,
  getHotTakePublicView,
  loadHotTakePrompts,
  revealHotTakeAnswers,
  revealHotTakeVotes,
  submitHotTakeAnswer,
  submitHotTakeVote,
} from '@room-riot/hot-take';
import type {
  HotTakePlayerView,
  HotTakePrompt,
  HotTakePublicView,
  HotTakeSessionState,
} from '@room-riot/hot-take';
import {
  SUSPECT_ALIBI_DURATION_MS,
  SUSPECT_GAME_ID,
  SUSPECT_INPUT_DURATION_MS,
  SUSPECT_VOTING_DURATION_MS,
  advanceSuspectRound,
  allSuspectPlayersAnswered,
  allSuspectPlayersVoted,
  createSuspectSession,
  expireSuspectAlibi,
  getSuspectPlayerView,
  getSuspectPublicView,
  loadSuspectPrompts,
  revealSuspectAnswers,
  revealSuspectVotes,
  submitSuspectAlibi,
  submitSuspectAnswer,
  submitSuspectVote,
} from '@room-riot/suspect';
import type {
  SuspectPlayerView,
  SuspectPrompt,
  SuspectPublicView,
  SuspectSessionState,
} from '@room-riot/suspect';

import {
  generateDrawnOutPrompts,
  generateGroupthinkPrompts,
  generateHotTakePrompts,
  generateSuspectPrompts,
} from './prompt-generator.js';

export type PublicGameView =
  GroupthinkPublicView | HotTakePublicView | SuspectPublicView | DrawnOutPublicView;
export type PlayerGameView =
  GroupthinkPlayerView | HotTakePlayerView | SuspectPlayerView | DrawnOutPlayerView;

export interface GameRuntimeSlots {
  groupthink?: GroupthinkSessionState;
  hotTake?: HotTakeSessionState;
  suspect?: SuspectSessionState;
  drawnOut?: DrawnOutSessionState;
  groupthinkPrompts?: readonly GroupthinkPrompt[];
  hotTakePrompts?: readonly HotTakePrompt[];
  suspectPrompts?: readonly SuspectPrompt[];
  drawnOutPrompts?: readonly DrawnOutPrompt[];
}

export type GameDurationKey = 'input' | 'voting' | 'alibi' | 'turn' | 'guess';

export interface GameCapabilities {
  readonly textAnswer: boolean;
  readonly targetedAnswer: boolean;
  readonly drawing: boolean;
  readonly voting: boolean;
  readonly alibi: boolean;
  readonly aiPromptMode: boolean;
}

export interface GameRegistryMetadata {
  readonly id: SupportedGameId;
  readonly title: string;
  readonly packageName: `@room-riot/${string}`;
  readonly playerLimits: GamePlayerLimits | Readonly<Record<DrawnOutMode, GamePlayerLimits>>;
  readonly modes: readonly string[];
  readonly contentModes: readonly ContentMode[];
  readonly promptModes: readonly PromptMode[];
  readonly durationsMs: Readonly<Partial<Record<GameDurationKey, number>>>;
  readonly routes: {
    readonly host: `/host/${SupportedGameId}`;
    readonly display: `/display/${SupportedGameId}`;
    readonly play: `/play/${SupportedGameId}`;
  };
  readonly capabilities: GameCapabilities;
  readonly integration: {
    readonly workspacePath: `games/${SupportedGameId}`;
    readonly clientCatalogId: SupportedGameId;
  };
}

const CONTENT_MODES = ['family', 'standard', 'after-dark'] as const;
const PROMPT_MODES = ['default', 'ai'] as const;

function routesFor(id: SupportedGameId): GameRegistryMetadata['routes'] {
  return {
    host: `/host/${id}`,
    display: `/display/${id}`,
    play: `/play/${id}`,
  };
}

/** Serializable, operational metadata for every server-supported game. */
export const GAME_REGISTRY_METADATA = {
  groupthink: {
    id: GROUPTHINK_GAME_ID,
    title: 'Groupthink',
    packageName: '@room-riot/groupthink',
    playerLimits: GAME_PLAYER_LIMITS.groupthink,
    modes: [],
    contentModes: CONTENT_MODES,
    promptModes: PROMPT_MODES,
    durationsMs: { input: GROUPTHINK_INPUT_DURATION_MS },
    routes: routesFor(GROUPTHINK_GAME_ID),
    capabilities: {
      textAnswer: true,
      targetedAnswer: false,
      drawing: false,
      voting: false,
      alibi: false,
      aiPromptMode: true,
    },
    integration: {
      workspacePath: 'games/groupthink',
      clientCatalogId: GROUPTHINK_GAME_ID,
    },
  },
  'hot-take': {
    id: HOT_TAKE_GAME_ID,
    title: 'Hot Take',
    packageName: '@room-riot/hot-take',
    playerLimits: GAME_PLAYER_LIMITS['hot-take'],
    modes: [],
    contentModes: CONTENT_MODES,
    promptModes: PROMPT_MODES,
    durationsMs: { input: HOT_TAKE_INPUT_DURATION_MS, voting: HOT_TAKE_VOTING_DURATION_MS },
    routes: routesFor(HOT_TAKE_GAME_ID),
    capabilities: {
      textAnswer: true,
      targetedAnswer: true,
      drawing: false,
      voting: true,
      alibi: false,
      aiPromptMode: true,
    },
    integration: {
      workspacePath: 'games/hot-take',
      clientCatalogId: HOT_TAKE_GAME_ID,
    },
  },
  suspect: {
    id: SUSPECT_GAME_ID,
    title: 'Suspect',
    packageName: '@room-riot/suspect',
    playerLimits: GAME_PLAYER_LIMITS.suspect,
    modes: [],
    contentModes: CONTENT_MODES,
    promptModes: PROMPT_MODES,
    durationsMs: {
      input: SUSPECT_INPUT_DURATION_MS,
      alibi: SUSPECT_ALIBI_DURATION_MS,
      voting: SUSPECT_VOTING_DURATION_MS,
    },
    routes: routesFor(SUSPECT_GAME_ID),
    capabilities: {
      textAnswer: true,
      targetedAnswer: false,
      drawing: false,
      voting: true,
      alibi: true,
      aiPromptMode: true,
    },
    integration: {
      workspacePath: 'games/suspect',
      clientCatalogId: SUSPECT_GAME_ID,
    },
  },
  'drawn-out': {
    id: DRAWN_OUT_GAME_ID,
    title: 'Drawn Out',
    packageName: '@room-riot/drawn-out',
    playerLimits: GAME_PLAYER_LIMITS['drawn-out'],
    modes: ['classic', 'telephone', 'fake-artist'],
    contentModes: CONTENT_MODES,
    promptModes: PROMPT_MODES,
    durationsMs: { turn: DRAWN_OUT_TURN_DURATION_MS, guess: DRAWN_OUT_GUESS_DURATION_MS },
    routes: routesFor(DRAWN_OUT_GAME_ID),
    capabilities: {
      textAnswer: true,
      targetedAnswer: false,
      drawing: true,
      voting: true,
      alibi: false,
      aiPromptMode: true,
    },
    integration: {
      workspacePath: 'games/drawn-out',
      clientCatalogId: DRAWN_OUT_GAME_ID,
    },
  },
} as const satisfies Record<SupportedGameId, GameRegistryMetadata>;

export const GAME_PAGE_ROUTES = Object.values(GAME_REGISTRY_METADATA).flatMap((game) => [
  game.routes.host,
  game.routes.display,
  game.routes.play,
]);

interface StartContext {
  readonly slots: GameRuntimeSlots;
  readonly playerIds: readonly PlayerId[];
  readonly settings: RoomSettings;
  readonly now: number;
  readonly randomizePrompts: boolean;
}

interface ViewContext {
  readonly slots: GameRuntimeSlots;
  readonly playerIds: readonly PlayerId[];
  readonly playerNames: Readonly<Record<PlayerId, string>>;
}

export interface GameActionContext extends ViewContext {
  readonly settings: RoomSettings;
  readonly now: number;
}

export interface GameTransition {
  readonly phase: RoomPhase;
  readonly scheduleDeadline: boolean;
}

export interface AdvancePreparation {
  (roundScores: Readonly<Record<string, number>>, hasNextRound: boolean): readonly PlayerId[];
}

interface GameAdapter {
  readonly metadata: GameRegistryMetadata;
  start(context: StartContext, registry: ServerGameRegistry): RoomPhase;
  publicView(context: ViewContext): PublicGameView | null;
  playerView(context: ViewContext, playerId: PlayerId): PlayerGameView | null;
  submitAnswer(
    context: GameActionContext,
    registry: ServerGameRegistry,
    playerId: PlayerId,
    answer: string,
    targetPlayerId?: PlayerId,
  ): GameTransition;
  submitDrawing(
    context: GameActionContext,
    registry: ServerGameRegistry,
    playerId: PlayerId,
    drawing: DrawingData,
  ): GameTransition;
  submitAlibi(
    context: GameActionContext,
    registry: ServerGameRegistry,
    playerId: PlayerId,
    alibi: string,
  ): GameTransition;
  castVote(
    context: GameActionContext,
    registry: ServerGameRegistry,
    playerId: PlayerId,
    choice: string,
  ): GameTransition;
  reveal(context: GameActionContext, registry: ServerGameRegistry): GameTransition;
  advance(
    context: GameActionContext,
    registry: ServerGameRegistry,
    prepare: AdvancePreparation,
  ): GameTransition;
  deadlineAt(slots: GameRuntimeSlots): number | null;
  expire(context: GameActionContext, registry: ServerGameRegistry): GameTransition;
}

const GAME_ADAPTERS = {
  groupthink: {
    metadata: GAME_REGISTRY_METADATA.groupthink,
    start(context, registry) {
      const prompts = registry.getGroupthinkPrompts(
        context.settings.contentMode,
        context.settings.promptMode,
      );
      context.slots.groupthinkPrompts = prompts;
      context.slots.groupthink = createGroupthinkSession(
        prompts,
        context.settings.roundCount,
        context.now,
        registry.duration('groupthink', 'input'),
        context.randomizePrompts,
        registry.previousPromptId('groupthink', context.settings.contentMode),
      );
      registry.rememberPrompt(
        'groupthink',
        context.settings.contentMode,
        context.slots.groupthink.prompt.id,
      );
      return 'input';
    },
    publicView({ slots, playerIds }) {
      return slots.groupthink ? getGroupthinkPublicView(slots.groupthink, playerIds.length) : null;
    },
    playerView({ slots }, playerId) {
      return slots.groupthink ? getGroupthinkPlayerView(slots.groupthink, playerId) : null;
    },
    submitAnswer(context, _registry, playerId, answer, targetPlayerId) {
      if (targetPlayerId) throw new Error('Groupthink does not accept player targets.');
      const game = requireSlot(context.slots.groupthink, 'Groupthink');
      context.slots.groupthink = submitGroupthinkAnswer(game, playerId, answer, context.now);
      if (allPlayersSubmitted(context.slots.groupthink, context.playerIds)) {
        context.slots.groupthink = revealGroupthink(context.slots.groupthink);
      }
      return groupthinkTransition(context.slots.groupthink);
    },
    submitDrawing: unsupportedDrawing,
    submitAlibi: unsupportedAlibi,
    castVote: unsupportedVote,
    reveal(context) {
      context.slots.groupthink = revealGroupthink(
        requireSlot(context.slots.groupthink, 'Groupthink'),
      );
      return groupthinkTransition(context.slots.groupthink);
    },
    advance(context, registry, prepare) {
      const game = requireSlot(context.slots.groupthink, 'Groupthink');
      prepare(game.roundScores, game.roundNumber < game.totalRounds);
      context.slots.groupthink = advanceGroupthinkRound(
        game,
        context.slots.groupthinkPrompts ??
          registry.getGroupthinkPrompts(context.settings.contentMode, context.settings.promptMode),
        context.now,
        registry.duration('groupthink', 'input'),
      );
      return groupthinkTransition(context.slots.groupthink);
    },
    deadlineAt(slots) {
      return slots.groupthink?.status === 'input' ? slots.groupthink.inputDeadlineAt : null;
    },
    expire(context) {
      context.slots.groupthink = revealGroupthink(
        requireSlot(context.slots.groupthink, 'Groupthink'),
      );
      return groupthinkTransition(context.slots.groupthink);
    },
  },
  'hot-take': {
    metadata: GAME_REGISTRY_METADATA['hot-take'],
    start(context, registry) {
      const prompts = registry.getHotTakePrompts(
        context.settings.contentMode,
        context.settings.promptMode,
      );
      context.slots.hotTakePrompts = prompts;
      context.slots.hotTake = createHotTakeSession(
        prompts,
        context.settings.roundCount,
        context.now,
        registry.duration('hot-take', 'input'),
        context.randomizePrompts,
        registry.previousPromptId('hot-take', context.settings.contentMode),
      );
      registry.rememberPrompt(
        'hot-take',
        context.settings.contentMode,
        context.slots.hotTake.prompt.id,
      );
      return 'input';
    },
    publicView({ slots, playerIds, playerNames }) {
      return slots.hotTake
        ? getHotTakePublicView(slots.hotTake, playerIds.length, playerNames)
        : null;
    },
    playerView({ slots, playerNames }, playerId) {
      return slots.hotTake ? getHotTakePlayerView(slots.hotTake, playerId, playerNames) : null;
    },
    submitAnswer(context, registry, playerId, answer, targetPlayerId) {
      const game = requireSlot(context.slots.hotTake, 'Hot Take');
      context.slots.hotTake = submitHotTakeAnswer(
        game,
        playerId,
        answer,
        targetPlayerId,
        context.playerIds,
        context.now,
      );
      if (allHotTakePlayersSubmitted(context.slots.hotTake, context.playerIds)) {
        context.slots.hotTake = revealHotTakeAnswers(
          context.slots.hotTake,
          context.now,
          registry.duration('hot-take', 'voting'),
        );
      }
      return hotTakeTransition(context.slots.hotTake);
    },
    submitDrawing: unsupportedDrawing,
    submitAlibi: unsupportedAlibi,
    castVote(context, _registry, playerId, choice) {
      const game = requireSlot(context.slots.hotTake, 'Hot Take');
      context.slots.hotTake = submitHotTakeVote(game, playerId, choice, context.now);
      if (allHotTakePlayersVoted(context.slots.hotTake, context.playerIds)) {
        context.slots.hotTake = revealHotTakeVotes(context.slots.hotTake);
      }
      return hotTakeTransition(context.slots.hotTake);
    },
    reveal(context, registry) {
      const game = requireSlot(context.slots.hotTake, 'Hot Take');
      if (game.status === 'input') {
        context.slots.hotTake = revealHotTakeAnswers(
          game,
          context.now,
          registry.duration('hot-take', 'voting'),
        );
        if (Object.keys(context.slots.hotTake.answers).length < 2) {
          context.slots.hotTake = revealHotTakeVotes(context.slots.hotTake);
        }
      } else if (game.status === 'voting') {
        context.slots.hotTake = revealHotTakeVotes(game);
      } else {
        throw new Error('This Hot Take round is not waiting for results.');
      }
      return hotTakeTransition(context.slots.hotTake);
    },
    advance(context, registry, prepare) {
      const game = requireSlot(context.slots.hotTake, 'Hot Take');
      prepare(game.roundScores, game.roundNumber < game.totalRounds);
      context.slots.hotTake = advanceHotTakeRound(
        game,
        context.slots.hotTakePrompts ??
          registry.getHotTakePrompts(context.settings.contentMode, context.settings.promptMode),
        context.now,
        registry.duration('hot-take', 'input'),
      );
      return hotTakeTransition(context.slots.hotTake);
    },
    deadlineAt(slots) {
      const game = slots.hotTake;
      return game?.status === 'input'
        ? game.inputDeadlineAt
        : game?.status === 'voting'
          ? game.votingDeadlineAt
          : null;
    },
    expire(context, registry) {
      return this.reveal(context, registry);
    },
  },
  suspect: {
    metadata: GAME_REGISTRY_METADATA.suspect,
    start(context, registry) {
      const prompts = registry.getSuspectPrompts(
        context.settings.contentMode,
        context.settings.promptMode,
      );
      context.slots.suspectPrompts = prompts;
      context.slots.suspect = createSuspectSession(
        prompts,
        context.settings.roundCount,
        context.now,
        registry.duration('suspect', 'input'),
        registry.duration('suspect', 'alibi'),
        registry.duration('suspect', 'voting'),
        context.randomizePrompts,
        registry.previousPromptId('suspect', context.settings.contentMode),
      );
      registry.rememberPrompt(
        'suspect',
        context.settings.contentMode,
        context.slots.suspect.prompt.id,
      );
      return context.slots.suspect.status === 'voting' ? 'voting' : 'input';
    },
    publicView({ slots, playerIds }) {
      return slots.suspect ? getSuspectPublicView(slots.suspect, playerIds.length) : null;
    },
    playerView({ slots, playerIds }, playerId) {
      return slots.suspect ? getSuspectPlayerView(slots.suspect, playerId, playerIds) : null;
    },
    submitAnswer(context, registry, playerId, answer, targetPlayerId) {
      if (targetPlayerId) throw new Error('Suspect answers are private Yes or No choices.');
      const normalized = answer.trim().toLowerCase();
      if (normalized !== 'yes' && normalized !== 'no') {
        throw new Error('Suspect answers must be Yes or No.');
      }
      const game = requireSlot(context.slots.suspect, 'Suspect');
      context.slots.suspect = submitSuspectAnswer(
        game,
        playerId,
        normalized === 'yes',
        context.now,
      );
      if (allSuspectPlayersAnswered(context.slots.suspect, context.playerIds)) {
        context.slots.suspect = revealSuspectAnswers(
          context.slots.suspect,
          context.playerIds,
          context.now,
          registry.duration('suspect', 'alibi'),
          registry.duration('suspect', 'voting'),
        );
      }
      return suspectTransition(context.slots.suspect);
    },
    submitDrawing: unsupportedDrawing,
    submitAlibi(context, registry, playerId, alibi) {
      context.slots.suspect = submitSuspectAlibi(
        requireSlot(context.slots.suspect, 'Suspect'),
        playerId,
        alibi,
        context.now,
        registry.duration('suspect', 'voting'),
      );
      return suspectTransition(context.slots.suspect);
    },
    castVote(context, _registry, playerId, choice) {
      context.slots.suspect = submitSuspectVote(
        requireSlot(context.slots.suspect, 'Suspect'),
        playerId,
        parseSuspectVoteChoice(choice),
        context.playerIds,
        context.now,
      );
      if (allSuspectPlayersVoted(context.slots.suspect, context.playerIds)) {
        context.slots.suspect = revealSuspectVotes(context.slots.suspect);
      }
      return suspectTransition(context.slots.suspect);
    },
    reveal(context, registry) {
      const game = requireSlot(context.slots.suspect, 'Suspect');
      if (game.status === 'input') {
        context.slots.suspect = revealSuspectAnswers(
          game,
          context.playerIds,
          context.now,
          registry.duration('suspect', 'alibi'),
          registry.duration('suspect', 'voting'),
        );
      } else if (game.status === 'alibi') {
        context.slots.suspect = expireSuspectAlibi(
          game,
          context.now,
          registry.duration('suspect', 'voting'),
        );
      } else if (game.status === 'voting') {
        context.slots.suspect = revealSuspectVotes(game);
      } else {
        throw new Error('This Suspect round is not waiting for results.');
      }
      return suspectTransition(context.slots.suspect);
    },
    advance(context, registry, prepare) {
      const game = requireSlot(context.slots.suspect, 'Suspect');
      prepare(game.roundScores, game.roundNumber < game.totalRounds);
      context.slots.suspect = advanceSuspectRound(
        game,
        context.slots.suspectPrompts ??
          registry.getSuspectPrompts(context.settings.contentMode, context.settings.promptMode),
        context.now,
        registry.duration('suspect', 'input'),
        registry.duration('suspect', 'alibi'),
        registry.duration('suspect', 'voting'),
      );
      return suspectTransition(context.slots.suspect);
    },
    deadlineAt(slots) {
      const game = slots.suspect;
      return game?.status === 'input'
        ? game.inputDeadlineAt
        : game?.status === 'alibi'
          ? game.alibiDeadlineAt
          : game?.status === 'voting'
            ? game.votingDeadlineAt
            : null;
    },
    expire(context, registry) {
      return this.reveal(context, registry);
    },
  },
  'drawn-out': {
    metadata: GAME_REGISTRY_METADATA['drawn-out'],
    start(context, registry) {
      const prompts = registry.getDrawnOutPrompts(
        context.settings.contentMode,
        context.settings.promptMode,
      );
      context.slots.drawnOutPrompts = prompts;
      context.slots.drawnOut = createDrawnOutSession(
        prompts,
        context.playerIds,
        context.settings.drawnOutMode,
        context.settings.roundCount,
        context.now,
        registry.duration('drawn-out', 'turn'),
        context.randomizePrompts,
        registry.previousPromptId('drawn-out', context.settings.contentMode),
      );
      registry.rememberPrompt(
        'drawn-out',
        context.settings.contentMode,
        context.slots.drawnOut.prompt.id,
      );
      return drawnOutRoomPhase(context.slots.drawnOut.status);
    },
    publicView({ slots, playerIds }) {
      return slots.drawnOut ? getDrawnOutPublicView(slots.drawnOut, playerIds.length) : null;
    },
    playerView({ slots }, playerId) {
      return slots.drawnOut ? getDrawnOutPlayerView(slots.drawnOut, playerId) : null;
    },
    submitAnswer(context, registry, playerId, answer, targetPlayerId) {
      if (targetPlayerId) throw new Error('Drawn Out text does not accept a target.');
      context.slots.drawnOut = submitDrawnOutText(
        requireSlot(context.slots.drawnOut, 'Drawn Out'),
        playerId,
        answer,
        context.now,
        registry.duration('drawn-out', 'turn'),
      );
      return drawnOutTransition(context.slots.drawnOut);
    },
    submitDrawing(context, registry, playerId, drawing) {
      context.slots.drawnOut = submitDrawnOutDrawing(
        requireSlot(context.slots.drawnOut, 'Drawn Out'),
        playerId,
        drawing,
        context.now,
        registry.duration('drawn-out', 'turn'),
        registry.duration('drawn-out', 'guess'),
      );
      return drawnOutTransition(context.slots.drawnOut);
    },
    submitAlibi: unsupportedAlibi,
    castVote(context, _registry, playerId, choice) {
      const targetPlayerId = parsePlayerId(choice);
      context.slots.drawnOut = submitDrawnOutVote(
        requireSlot(context.slots.drawnOut, 'Drawn Out'),
        playerId,
        targetPlayerId,
        context.now,
      );
      return drawnOutTransition(context.slots.drawnOut);
    },
    reveal(context, registry) {
      context.slots.drawnOut = revealDrawnOutStep(
        requireSlot(context.slots.drawnOut, 'Drawn Out'),
        context.now,
        registry.duration('drawn-out', 'turn'),
        registry.duration('drawn-out', 'guess'),
      );
      return drawnOutTransition(context.slots.drawnOut);
    },
    advance(context, registry, prepare) {
      const game = requireSlot(context.slots.drawnOut, 'Drawn Out');
      const playerIds = prepare(game.roundScores, game.roundNumber < game.totalRounds);
      context.slots.drawnOut = advanceDrawnOutRound(
        game,
        context.slots.drawnOutPrompts ??
          registry.getDrawnOutPrompts(context.settings.contentMode, context.settings.promptMode),
        context.now,
        registry.duration('drawn-out', 'turn'),
        playerIds,
      );
      return drawnOutTransition(context.slots.drawnOut);
    },
    deadlineAt(slots) {
      const game = slots.drawnOut;
      return game && !['results', 'complete'].includes(game.status) ? game.deadlineAt : null;
    },
    expire(context, registry) {
      context.slots.drawnOut = expireDrawnOutStep(
        requireSlot(context.slots.drawnOut, 'Drawn Out'),
        context.now,
        registry.duration('drawn-out', 'turn'),
        registry.duration('drawn-out', 'guess'),
      );
      return drawnOutTransition(context.slots.drawnOut);
    },
  },
} as const satisfies Record<SupportedGameId, GameAdapter>;

export interface ServerGameRegistryOptions {
  readonly groupthinkInputDurationMs?: number;
  readonly hotTakeInputDurationMs?: number;
  readonly hotTakeVotingDurationMs?: number;
  readonly suspectInputDurationMs?: number;
  readonly suspectAlibiDurationMs?: number;
  readonly suspectVotingDurationMs?: number;
  readonly drawnOutTurnDurationMs?: number;
  readonly drawnOutGuessDurationMs?: number;
}

export class ServerGameRegistry {
  private readonly promptCaches = new Map<string, readonly unknown[]>();
  private readonly previousPromptIds = new Map<string, string>();
  private readonly configuredDurations: Record<
    SupportedGameId,
    Partial<Record<GameDurationKey, number>>
  >;

  constructor(options: ServerGameRegistryOptions = {}) {
    this.configuredDurations = {
      groupthink: { input: options.groupthinkInputDurationMs ?? GROUPTHINK_INPUT_DURATION_MS },
      'hot-take': {
        input: options.hotTakeInputDurationMs ?? HOT_TAKE_INPUT_DURATION_MS,
        voting: options.hotTakeVotingDurationMs ?? HOT_TAKE_VOTING_DURATION_MS,
      },
      suspect: {
        input: options.suspectInputDurationMs ?? SUSPECT_INPUT_DURATION_MS,
        alibi: options.suspectAlibiDurationMs ?? SUSPECT_ALIBI_DURATION_MS,
        voting: options.suspectVotingDurationMs ?? SUSPECT_VOTING_DURATION_MS,
      },
      'drawn-out': {
        turn: options.drawnOutTurnDurationMs ?? DRAWN_OUT_TURN_DURATION_MS,
        guess: options.drawnOutGuessDurationMs ?? DRAWN_OUT_GUESS_DURATION_MS,
      },
    };
    Object.values(this.configuredDurations).forEach((durations) =>
      Object.values(durations).forEach((duration) => {
        if (!Number.isInteger(duration) || (duration ?? 0) < 1) {
          throw new Error('Game timers must be positive integers.');
        }
      }),
    );
    validateGameRegistry();
  }

  metadata(gameId: SupportedGameId): GameRegistryMetadata {
    return GAME_ADAPTERS[gameId].metadata;
  }

  playerLimits(gameId: SupportedGameId, mode: DrawnOutMode): GamePlayerLimits {
    return getGamePlayerLimits(gameId, mode);
  }

  duration(gameId: SupportedGameId, key: GameDurationKey): number {
    const duration = this.configuredDurations[gameId][key];
    if (duration === undefined) throw new Error(`${gameId} does not define a ${key} duration.`);
    return duration;
  }

  start(
    gameId: SupportedGameId,
    slots: GameRuntimeSlots,
    playerIds: readonly PlayerId[],
    settings: RoomSettings,
    randomizePrompts: boolean,
    now = Date.now(),
  ): RoomPhase {
    clearRuntimeSlots(slots);
    return GAME_ADAPTERS[gameId].start({ slots, playerIds, settings, now, randomizePrompts }, this);
  }

  publicView(gameId: string | null, context: ViewContext): PublicGameView | null {
    const parsed = SupportedGameIdSchema.safeParse(gameId);
    return parsed.success ? GAME_ADAPTERS[parsed.data].publicView(context) : null;
  }

  playerView(
    gameId: string | null,
    context: ViewContext,
    playerId: PlayerId,
  ): PlayerGameView | null {
    const parsed = SupportedGameIdSchema.safeParse(gameId);
    return parsed.success ? GAME_ADAPTERS[parsed.data].playerView(context, playerId) : null;
  }

  submitAnswer(
    gameId: string | null,
    context: GameActionContext,
    playerId: PlayerId,
    answer: string,
    targetPlayerId?: PlayerId,
  ): GameTransition {
    return this.runPublicAction(() =>
      this.adapter(gameId).submitAnswer(context, this, playerId, answer, targetPlayerId),
    );
  }

  submitDrawing(
    gameId: string | null,
    context: GameActionContext,
    playerId: PlayerId,
    drawing: DrawingData,
  ): GameTransition {
    return this.runPublicAction(() =>
      this.adapter(gameId).submitDrawing(context, this, playerId, drawing),
    );
  }

  submitAlibi(
    gameId: string | null,
    context: GameActionContext,
    playerId: PlayerId,
    alibi: string,
  ): GameTransition {
    return this.runPublicAction(() =>
      this.adapter(gameId).submitAlibi(context, this, playerId, alibi),
    );
  }

  castVote(
    gameId: string | null,
    context: GameActionContext,
    playerId: PlayerId,
    choice: string,
  ): GameTransition {
    return this.runPublicAction(() =>
      this.adapter(gameId).castVote(context, this, playerId, choice),
    );
  }

  reveal(gameId: string | null, context: GameActionContext): GameTransition {
    return this.runPublicAction(() => this.adapter(gameId).reveal(context, this));
  }

  advance(
    gameId: string | null,
    context: GameActionContext,
    prepare: AdvancePreparation,
  ): GameTransition {
    return this.runPublicAction(() => this.adapter(gameId).advance(context, this, prepare));
  }

  deadlineAt(gameId: string | null, slots: GameRuntimeSlots): number | null {
    return this.adapter(gameId).deadlineAt(slots);
  }

  expire(gameId: string | null, context: GameActionContext): GameTransition {
    return this.adapter(gameId).expire(context, this);
  }

  previousPromptId(gameId: SupportedGameId, contentMode: ContentMode): string | undefined {
    return this.previousPromptIds.get(`${gameId}:${contentMode}`);
  }

  rememberPrompt(gameId: SupportedGameId, contentMode: ContentMode, promptId: string): void {
    this.previousPromptIds.set(`${gameId}:${contentMode}`, promptId);
  }

  getGroupthinkPrompts(
    contentMode: ContentMode,
    promptMode: PromptMode,
  ): readonly GroupthinkPrompt[] {
    if (promptMode === 'ai') return generateGroupthinkPrompts(contentMode);
    return this.cachedPrompts('groupthink', contentMode, loadGroupthinkPrompts);
  }

  getHotTakePrompts(contentMode: ContentMode, promptMode: PromptMode): readonly HotTakePrompt[] {
    if (promptMode === 'ai') return generateHotTakePrompts(contentMode);
    return this.cachedPrompts('hot-take', contentMode, loadHotTakePrompts);
  }

  getSuspectPrompts(contentMode: ContentMode, promptMode: PromptMode): readonly SuspectPrompt[] {
    if (promptMode === 'ai') return generateSuspectPrompts(contentMode);
    return this.cachedPrompts('suspect', contentMode, loadSuspectPrompts);
  }

  getDrawnOutPrompts(contentMode: ContentMode, promptMode: PromptMode): readonly DrawnOutPrompt[] {
    if (promptMode === 'ai') return generateDrawnOutPrompts(contentMode);
    return this.cachedPrompts('drawn-out', contentMode, loadDrawnOutPrompts);
  }

  private cachedPrompts<T>(
    gameId: SupportedGameId,
    contentMode: ContentMode,
    loader: (contentMode: ContentMode) => readonly T[],
  ): readonly T[] {
    const key = `${gameId}:${contentMode}`;
    const cached = this.promptCaches.get(key) as readonly T[] | undefined;
    if (cached) return cached;
    const prompts = loader(contentMode);
    this.promptCaches.set(key, prompts);
    return prompts;
  }

  private adapter(gameId: string | null): GameAdapter {
    const parsed = SupportedGameIdSchema.safeParse(gameId);
    if (!parsed.success) throw new GameActionError('This room is not running a playable game.');
    return GAME_ADAPTERS[parsed.data];
  }

  private runPublicAction<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      if (error instanceof GameActionError) throw error;
      if (error instanceof Error) throw new GameActionError(error.message);
      throw error;
    }
  }
}

/** A player-correctable game-rule rejection whose message is safe for the public UI. */
export class GameActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameActionError';
  }
}

export function validateGameRegistry(): void {
  const supportedIds = new Set(SupportedGameIdSchema.options);
  const adapterIds = new Set(Object.keys(GAME_ADAPTERS));
  const metadataIds = new Set(Object.keys(GAME_REGISTRY_METADATA));
  for (const id of supportedIds) {
    if (!adapterIds.has(id) || !metadataIds.has(id)) {
      throw new Error(`Supported game ${id} is missing a complete server adapter.`);
    }
    const adapter = GAME_ADAPTERS[id];
    if (adapter.metadata.id !== id || adapter.metadata.integration.clientCatalogId !== id) {
      throw new Error(`Server adapter metadata is inconsistent for ${id}.`);
    }
  }
  for (const id of [...adapterIds, ...metadataIds]) {
    if (!supportedIds.has(id as SupportedGameId)) {
      throw new Error(`Registry contains unsupported game ${id}.`);
    }
  }
}

function clearRuntimeSlots(slots: GameRuntimeSlots): void {
  delete slots.groupthink;
  delete slots.groupthinkPrompts;
  delete slots.hotTake;
  delete slots.hotTakePrompts;
  delete slots.suspect;
  delete slots.suspectPrompts;
  delete slots.drawnOut;
  delete slots.drawnOutPrompts;
}

function drawnOutRoomPhase(status: DrawnOutSessionState['status']): RoomPhase {
  if (status === 'guessing' || status === 'fake-voting') return 'voting';
  if (status === 'results') return 'results';
  if (status === 'complete') return 'winner';
  return 'input';
}

function groupthinkTransition(game: GroupthinkSessionState): GameTransition {
  return {
    phase: game.status === 'input' ? 'input' : game.status === 'results' ? 'results' : 'winner',
    scheduleDeadline: game.status === 'input',
  };
}

function hotTakeTransition(game: HotTakeSessionState): GameTransition {
  return {
    phase:
      game.status === 'input'
        ? 'input'
        : game.status === 'voting'
          ? 'voting'
          : game.status === 'results'
            ? 'results'
            : 'winner',
    scheduleDeadline: game.status === 'input' || game.status === 'voting',
  };
}

function suspectTransition(game: SuspectSessionState): GameTransition {
  return {
    phase:
      game.status === 'input'
        ? 'input'
        : game.status === 'alibi'
          ? 'alibi'
          : game.status === 'voting'
            ? 'voting'
            : game.status === 'results'
              ? 'results'
              : 'winner',
    scheduleDeadline: ['input', 'alibi', 'voting'].includes(game.status),
  };
}

function drawnOutTransition(game: DrawnOutSessionState): GameTransition {
  return {
    phase: drawnOutRoomPhase(game.status),
    scheduleDeadline: !['results', 'complete'].includes(game.status),
  };
}

function requireSlot<T>(slot: T | undefined, title: string): T {
  if (!slot) throw new Error(`This room is not running ${title}.`);
  return slot;
}

function unsupportedDrawing(..._args: Parameters<GameAdapter['submitDrawing']>): GameTransition {
  throw new Error('This game does not accept drawings.');
}

function unsupportedAlibi(..._args: Parameters<GameAdapter['submitAlibi']>): GameTransition {
  throw new Error('This game does not accept alibis.');
}

function unsupportedVote(..._args: Parameters<GameAdapter['castVote']>): GameTransition {
  throw new Error('This game does not accept votes.');
}

function parsePlayerId(input: string): PlayerId {
  return PlayerIdSchema.parse(input);
}

function parseSuspectVoteChoice(choice: string): readonly PlayerId[] {
  if (choice === 'none') return [];
  const [prefix, value] = choice.split(':', 2);
  if (!value || (prefix !== 'player' && prefix !== 'players')) {
    throw new Error('Suspect votes must choose a valid player option.');
  }
  const values = value.split(',').filter(Boolean);
  if (prefix === 'player' && values.length !== 1) {
    throw new Error('This vote must choose exactly one player.');
  }
  if (prefix === 'players' && values.length !== 2) {
    throw new Error('This vote must choose exactly two players.');
  }
  return values.map(parsePlayerId);
}
