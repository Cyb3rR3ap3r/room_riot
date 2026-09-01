import { getGamePlayerLimits, ROOM_RIOT_PROTOCOL_VERSION } from '@room-riot/contracts';
import type { RoomPhase, SupportedGameId } from '@room-riot/contracts';
import type { BlankLinePlayerView, BlankLinePublicView } from '@room-riot/blank-line';
import type { PublicPlayerState, PublicRoomState } from '@room-riot/game-engine';
import type { DrawnOutPlayerView, DrawnOutPublicView, DrawnOutStatus } from '@room-riot/drawn-out';
import type { GroupthinkPlayerView, GroupthinkPublicView } from '@room-riot/groupthink';
import type { HotTakePlayerView, HotTakePublicView } from '@room-riot/hot-take';
import type { SuspectPlayerView, SuspectPublicView } from '@room-riot/suspect';
import type { WavelengthPlayerView, WavelengthPublicView } from '@room-riot/wavelength';

import type { PlayerGameView, RoomSnapshot } from '../protocol.js';

export const LONG_FIXTURE_TEXT =
  'A spectacularly overcomplicated answer involving a runaway parade float, twelve confused pigeons, and a ceremonial sandwich that absolutely nobody remembered ordering — repeated context keeps this fixture intentionally long for wrapping and overflow characterization.';
const BLANK_LINE_FIXTURE_PROMPT =
  'A runaway parade float carrying twelve confused pigeons and one ceremonial sandwich';

export const GAME_PHASES = {
  groupthink: ['input', 'results', 'complete'],
  'hot-take': ['input', 'voting', 'results', 'complete'],
  suspect: ['input', 'alibi', 'voting', 'results', 'complete'],
  'drawn-out': [
    'drawing',
    'guessing',
    'telephone',
    'fake-drawing',
    'fake-voting',
    'results',
    'complete',
  ],
  'blank-line': ['drawing', 'voting', 'results', 'complete'],
  wavelength: ['clue', 'tuning', 'intercept', 'results', 'complete'],
} as const;

export type GamePhaseMap = typeof GAME_PHASES;
export type GameFixturePhase<G extends SupportedGameId = SupportedGameId> = GamePhaseMap[G][number];
export type FixturePopulation = 'zero' | 'one' | 'minimum' | 'maximum' | 'dense-tie';

export const FIXTURE_POPULATIONS: readonly FixturePopulation[] = [
  'zero',
  'one',
  'minimum',
  'maximum',
  'dense-tie',
];

export interface GamePhaseFixture {
  readonly id: string;
  readonly gameId: SupportedGameId;
  readonly gamePhase: GameFixturePhase;
  readonly population: FixturePopulation;
  readonly snapshot: RoomSnapshot;
  readonly playerState: PlayerGameView | null;
  readonly expectedLongContent: string;
}

export function createGamePhaseFixture(
  gameId: SupportedGameId,
  gamePhase: string,
  population: FixturePopulation,
): GamePhaseFixture {
  const playerCount = getPopulationCount(gameId, population);
  const players = createPlayers(playerCount, population === 'dense-tie');
  const roomPhase = toRoomPhase(gameId, gamePhase);
  const game = createPublicView(gameId, gamePhase, players, population);
  const snapshot: RoomSnapshot = {
    protocolVersion: ROOM_RIOT_PROTOCOL_VERSION,
    revision: 42,
    state: createRoomState(gameId, roomPhase, players),
    game,
    roster: {
      roundPlayerIds: players.map((player) => player.id),
      queuedPlayerIds: [],
    },
  };
  return {
    id: `${gameId}:${gamePhase}:${population}`,
    gameId,
    gamePhase: gamePhase as GameFixturePhase,
    population,
    snapshot,
    playerState: players.length ? createPlayerView(gameId, gamePhase, players) : null,
    expectedLongContent: LONG_FIXTURE_TEXT,
  };
}

export function createAllGamePhaseFixtures(): readonly GamePhaseFixture[] {
  const phaseFixtures = (
    Object.entries(GAME_PHASES) as [SupportedGameId, readonly string[]][]
  ).flatMap(([gameId, phases]) =>
    phases.flatMap((phase) =>
      FIXTURE_POPULATIONS.map((population) => createGamePhaseFixture(gameId, phase, population)),
    ),
  );
  const drawnOutResultVariants = (['telephone', 'fake-artist'] as const).flatMap((mode) =>
    FIXTURE_POPULATIONS.map((population) => createDrawnOutResultFixture(mode, population)),
  );
  return [...phaseFixtures, ...drawnOutResultVariants];
}

export function createDrawnOutResultFixture(
  mode: 'telephone' | 'fake-artist',
  population: FixturePopulation,
): GamePhaseFixture {
  const base = createGamePhaseFixture('drawn-out', 'results', population);
  if (base.snapshot.game?.id !== 'drawn-out') throw new Error('Drawn Out fixture is unavailable.');
  const firstPlayerId = base.snapshot.state.players[0]?.id ?? null;
  const game: DrawnOutPublicView = {
    ...base.snapshot.game,
    mode,
    fakeArtistPlayerId: mode === 'fake-artist' ? firstPlayerId : null,
  };
  const playerState =
    base.playerState?.id === 'drawn-out' ? { ...base.playerState, mode } : base.playerState;
  return {
    ...base,
    id: `${base.id}:${mode}`,
    snapshot: {
      ...base.snapshot,
      state: {
        ...base.snapshot.state,
        settings: { ...base.snapshot.state.settings, drawnOutMode: mode },
      },
      game,
    },
    playerState,
  };
}

function getPopulationCount(gameId: SupportedGameId, population: FixturePopulation): number {
  const limits = getGamePlayerLimits(gameId);
  switch (population) {
    case 'zero':
      return 0;
    case 'one':
      return 1;
    case 'minimum':
      return limits.minimum;
    case 'maximum':
    case 'dense-tie':
      return limits.maximum;
  }
}

function createPlayers(count: number, tied: boolean): readonly PublicPlayerState[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: index === count - 1 && count > 1 ? `Long Name ${index + 1}` : `Player ${index + 1}`,
    avatar: ['⚡', '🎉', '🎨', '🕵️'][index % 4]!,
    status: index === count - 1 && count > 2 ? 'disconnected' : 'connected',
    score: tied ? 1_200 : index * 100,
    disconnectedAt: index === count - 1 && count > 2 ? 1_000 : null,
    reconnectDeadlineAt: index === count - 1 && count > 2 ? 91_000 : null,
  }));
}

function createRoomState(
  gameId: SupportedGameId,
  phase: RoomPhase,
  players: readonly PublicPlayerState[],
): PublicRoomState {
  return {
    roomCode: 'RIOT',
    phase,
    gameId,
    paused: false,
    pauseStartedAt: null,
    settings: {
      maxPlayers: getGamePlayerLimits(gameId).maximum,
      joinLocked: false,
      drawingEnabled: true,
      roundCount: 5,
      contentMode: 'standard',
      promptMode: 'default',
      drawnOutMode: 'classic',
      wavelengthMode: 'signal-clash',
    },
    players,
    readyPlayerIds: [],
    readinessRequired: false,
  };
}

function toRoomPhase(gameId: SupportedGameId, status: string): RoomPhase {
  if (status === 'complete') return 'winner';
  if (status === 'results') return 'results';
  if (status === 'voting' || status === 'fake-voting') return 'voting';
  if (gameId === 'suspect' && status === 'alibi') return 'alibi';
  return 'input';
}

function createPublicView(
  gameId: SupportedGameId,
  status: string,
  players: readonly PublicPlayerState[],
  population: FixturePopulation,
):
  | GroupthinkPublicView
  | HotTakePublicView
  | SuspectPublicView
  | DrawnOutPublicView
  | BlankLinePublicView
  | WavelengthPublicView {
  const totalPlayers = players.length;
  const roundScores = players.map((player, index) => ({
    playerId: player.id,
    points: population === 'dense-tie' ? 300 : (index + 1) * 100,
  }));
  const common = {
    roundNumber: 3,
    totalRounds: 5,
    deadlineAt: status === 'results' || status === 'complete' ? null : 60_000,
    submittedCount: totalPlayers,
    totalPlayers,
    roundScores,
  } as const;

  if (gameId === 'groupthink') {
    const revealed = status !== 'input';
    return {
      id: 'groupthink',
      status: status as GroupthinkPublicView['status'],
      roundNumber: common.roundNumber,
      totalRounds: common.totalRounds,
      prompt: LONG_FIXTURE_TEXT,
      promptId: 'fixture-groupthink',
      inputDeadlineAt: common.deadlineAt,
      submittedCount: common.submittedCount,
      totalPlayers,
      groups: revealed
        ? players.map((_, index) => ({
            answer: index === 0 ? LONG_FIXTURE_TEXT : `Matching answer ${index + 1}`,
            count: population === 'dense-tie' ? 2 : 1,
            points: population === 'dense-tie' ? 200 : 100,
          }))
        : [],
      roundScores: revealed ? roundScores : [],
    };
  }
  if (gameId === 'hot-take') {
    const entriesVisible = status !== 'input';
    const scoresVisible = status === 'results' || status === 'complete';
    return {
      id: 'hot-take',
      status: status as HotTakePublicView['status'],
      roundNumber: common.roundNumber,
      totalRounds: common.totalRounds,
      prompt: LONG_FIXTURE_TEXT,
      promptId: 'fixture-hot-take',
      promptKind: 'open',
      deadlineAt: common.deadlineAt,
      submittedCount: common.submittedCount,
      totalPlayers,
      entries: entriesVisible
        ? players.map((_, index) => ({
            entryId: `entry-${index + 1}`,
            answer: index === 0 ? LONG_FIXTURE_TEXT : `Unreasonably hot take ${index + 1}`,
            voteCount: population === 'dense-tie' ? 2 : index,
            points: population === 'dense-tie' ? 200 : index * 100,
          }))
        : [],
      roundScores: scoresVisible ? roundScores : [],
    };
  }
  if (gameId === 'suspect') {
    const revealed = status === 'results' || status === 'complete';
    return {
      id: 'suspect',
      status: status as SuspectPublicView['status'],
      roundNumber: common.roundNumber,
      totalRounds: common.totalRounds,
      prompt: LONG_FIXTURE_TEXT,
      promptId: 'fixture-suspect',
      roundType: status === 'alibi' ? 'alibi' : 'double-trouble',
      deadlineAt: common.deadlineAt,
      submittedCount: common.submittedCount,
      totalPlayers,
      matchedCount: revealed ? Math.min(2, totalPlayers) : 0,
      selectedPlayerIds: revealed ? players.slice(0, 2).map((player) => player.id) : [],
      alibiPlayerId: players[0]?.id ?? null,
      alibiText: players.length ? LONG_FIXTURE_TEXT : null,
      voteSummary: revealed
        ? players.map((player) => ({
            targetPlayerIds: [player.id],
            count: population === 'dense-tie' ? 2 : 1,
          }))
        : [],
      roundScores: revealed ? roundScores : [],
    };
  }
  if (gameId === 'blank-line') {
    const revealed = status === 'results' || status === 'complete';
    const activePlayerId = status === 'drawing' ? (players[0]?.id ?? null) : null;
    return {
      id: 'blank-line',
      status: status as BlankLinePublicView['status'],
      roundNumber: common.roundNumber,
      totalRounds: common.totalRounds,
      prompt: revealed ? BLANK_LINE_FIXTURE_PROMPT : null,
      promptId: revealed ? 'fixture-blank-line' : null,
      deadlineAt: common.deadlineAt,
      activePlayerId,
      nextPlayerIds: players.slice(1, 3).map((player) => player.id),
      playerOrder: players.map((player) => player.id),
      circuit: 2,
      totalCircuits: 2,
      turnIndex: totalPlayers,
      totalTurns: totalPlayers * 2,
      drawing: { strokes: [] },
      strokeTimeline: [],
      submittedCount: status === 'voting' ? totalPlayers : 0,
      totalPlayers,
      blankPlayerId: revealed ? (players[0]?.id ?? null) : null,
      blankCaught: revealed ? true : null,
      voteSummary: revealed
        ? players.map((player, index) => ({
            playerId: player.id,
            count: index === 0 ? Math.max(1, totalPlayers - 1) : 0,
          }))
        : [],
      roundScores: revealed ? roundScores : [],
    };
  }
  if (gameId === 'wavelength') {
    const revealed = status === 'results' || status === 'complete';
    const activeTeam = players.filter((_, index) => index % 2 === 0).map((player) => player.id);
    const otherTeam = players.filter((_, index) => index % 2 === 1).map((player) => player.id);
    return {
      id: 'wavelength',
      mode: 'signal-clash',
      status: status as WavelengthPublicView['status'],
      roundNumber: common.roundNumber,
      totalRounds: common.totalRounds,
      totalPlayers,
      promptId: 'fixture-wavelength',
      leftPole: 'Barely a signal',
      rightPole: 'Impossible to miss',
      clue: status === 'clue' ? null : 'Sunday sunrise',
      deadlineAt: common.deadlineAt,
      teams: { cyan: activeTeam, magenta: otherTeam },
      activeTeamId: 'cyan',
      broadcasterId: players[0]?.id ?? 'fixture-broadcaster',
      receiverIds: activeTeam.slice(1),
      interceptorIds: otherTeam,
      submittedCount: status === 'tuning' ? Math.max(0, activeTeam.length - 1) : 0,
      expectedCount: status === 'tuning' ? Math.max(0, activeTeam.length - 1) : otherTeam.length,
      target: revealed ? 64 : null,
      consensus: revealed ? 61 : null,
      markers: revealed
        ? activeTeam
            .slice(1)
            .map((playerId) => ({ playerId, position: 61, confidence: 2 as const }))
        : [],
      result: revealed
        ? {
            target: 64,
            consensus: 61,
            distance: 3,
            spread: 0,
            accuracyPoints: 5,
            syncBonus: 1,
            activeTeamPoints: 6,
            interceptPrediction: 'locked',
            interceptOutcome: 'locked',
            interceptCorrect: true,
            interceptPoints: 2,
          }
        : null,
      roomScore: revealed ? 6 : 0,
      teamScores: { cyan: revealed ? 6 : 0, magenta: revealed ? 2 : 0 },
      roundScores: revealed ? roundScores : [],
    };
  }
  const drawnStatus = status as DrawnOutStatus;
  const revealed = drawnStatus === 'results' || drawnStatus === 'complete';
  return {
    id: 'drawn-out',
    status: drawnStatus,
    mode: drawnStatus.startsWith('fake-')
      ? 'fake-artist'
      : drawnStatus === 'telephone'
        ? 'telephone'
        : 'classic',
    roundNumber: common.roundNumber,
    totalRounds: common.totalRounds,
    prompt: revealed ? LONG_FIXTURE_TEXT : null,
    promptId: revealed ? 'fixture-drawn-out' : null,
    deadlineAt: common.deadlineAt,
    artistPlayerId: players[0]?.id ?? null,
    activePlayerId: players[1]?.id ?? players[0]?.id ?? null,
    fakeArtistPlayerId:
      revealed && drawnStatus.startsWith('fake-') ? (players[0]?.id ?? null) : null,
    drawing: { strokes: [] },
    chain: revealed
      ? players.map((player, index) => ({
          kind: 'description' as const,
          playerId: player.id,
          text: index === 0 ? LONG_FIXTURE_TEXT : `Chain description ${index + 1}`,
        }))
      : [],
    guesses: revealed
      ? players.map((player, index) => ({
          playerId: player.id,
          text: index === 0 ? LONG_FIXTURE_TEXT : `Guess ${index + 1}`,
          correct: population === 'dense-tie' || index === 0,
        }))
      : [],
    votes: revealed
      ? players.map((player) => ({
          playerId: player.id,
          count: population === 'dense-tie' ? 2 : 1,
        }))
      : [],
    completedTurnCount: totalPlayers,
    guessCount: totalPlayers,
    voteCount: totalPlayers,
    submittedCount: totalPlayers,
    totalPlayers,
    roundScores: revealed ? roundScores : [],
  };
}

function createPlayerView(
  gameId: SupportedGameId,
  status: string,
  players: readonly PublicPlayerState[],
): PlayerGameView {
  if (gameId === 'groupthink') {
    return {
      id: 'groupthink',
      status: status as GroupthinkPlayerView['status'],
      roundNumber: 3,
      totalRounds: 5,
      prompt: LONG_FIXTURE_TEXT,
      promptId: 'fixture-groupthink',
      inputDeadlineAt: status === 'input' ? 60_000 : null,
      hasSubmitted: status !== 'input',
      ownAnswer: status === 'input' ? null : LONG_FIXTURE_TEXT,
    };
  }
  if (gameId === 'hot-take') {
    return {
      id: 'hot-take',
      status: status as HotTakePlayerView['status'],
      roundNumber: 3,
      totalRounds: 5,
      prompt: LONG_FIXTURE_TEXT,
      promptId: 'fixture-hot-take',
      promptKind: 'open',
      deadlineAt: status === 'results' || status === 'complete' ? null : 60_000,
      hasSubmitted: status !== 'input',
      ownAnswer: status === 'input' ? null : LONG_FIXTURE_TEXT,
      ownEntryId: status === 'input' ? null : 'entry-1',
      hasVoted: status === 'results' || status === 'complete',
      entries: players.map((_, index) => ({
        entryId: `entry-${index + 1}`,
        answer: index === 0 ? LONG_FIXTURE_TEXT : `Take ${index + 1}`,
        voteCount: 2,
        points: 200,
      })),
    };
  }
  if (gameId === 'suspect') {
    return {
      id: 'suspect',
      status: status as SuspectPlayerView['status'],
      roundNumber: 3,
      totalRounds: 5,
      prompt: LONG_FIXTURE_TEXT,
      promptId: 'fixture-suspect',
      roundType: status === 'alibi' ? 'alibi' : 'double-trouble',
      deadlineAt: status === 'results' || status === 'complete' ? null : 60_000,
      hasSubmitted: status !== 'input',
      ownAnswer: status === 'input' ? null : true,
      canSubmitAlibi: status === 'alibi',
      ownAlibi: status === 'alibi' ? LONG_FIXTURE_TEXT : null,
      alibiPlayerId: status === 'alibi' ? (players[0]?.id ?? null) : null,
      hasVoted: status === 'results' || status === 'complete',
      ownVoteTargetIds: status === 'results' ? [players[0]!.id] : [],
      candidatePlayerIds: players.map((player) => player.id),
      selectedPlayerIds: players.slice(0, 2).map((player) => player.id),
    };
  }
  if (gameId === 'blank-line') {
    const blankStatus = status as BlankLinePlayerView['status'];
    const task: BlankLinePlayerView['task'] =
      blankStatus === 'drawing' ? 'draw' : blankStatus === 'voting' ? 'vote' : 'wait';
    return {
      id: 'blank-line',
      status: blankStatus,
      roundNumber: 3,
      totalRounds: 5,
      deadlineAt: blankStatus === 'results' || blankStatus === 'complete' ? null : 60_000,
      task,
      instruction: LONG_FIXTURE_TEXT,
      privatePrompt: BLANK_LINE_FIXTURE_PROMPT,
      isBlank: false,
      isActive: task === 'draw',
      hasSubmitted: task === 'wait',
      drawing: { strokes: [] },
      candidatePlayerIds: players.slice(1).map((player) => player.id),
      ownVotePlayerId: null,
    };
  }
  if (gameId === 'wavelength') {
    const wavelengthStatus = status as WavelengthPlayerView['status'];
    const playerId = players[0]?.id ?? 'fixture-player';
    const task: WavelengthPlayerView['task'] =
      wavelengthStatus === 'clue'
        ? 'clue'
        : wavelengthStatus === 'tuning'
          ? 'tune'
          : wavelengthStatus === 'intercept'
            ? 'intercept'
            : 'wait';
    return {
      id: 'wavelength',
      mode: 'signal-clash',
      status: wavelengthStatus,
      roundNumber: 3,
      totalRounds: 5,
      leftPole: 'Barely a signal',
      rightPole: 'Impossible to miss',
      clue: wavelengthStatus === 'clue' ? null : 'Sunday sunrise',
      deadlineAt: wavelengthStatus === 'results' || wavelengthStatus === 'complete' ? null : 60_000,
      teamId: 'cyan',
      activeTeamId: 'cyan',
      broadcasterId: playerId,
      task,
      instruction: LONG_FIXTURE_TEXT,
      privateTarget: task === 'clue' ? 64 : null,
      ownMarker: task === 'tune' ? null : { playerId, position: 61, confidence: 2 },
      ownIntercept: task === 'intercept' ? null : 'locked',
      isGuestReceiver: false,
      hasSubmitted: task === 'wait',
    };
  }
  const drawnStatus = status as DrawnOutStatus;
  const task: DrawnOutPlayerView['task'] =
    drawnStatus === 'drawing' || drawnStatus === 'fake-drawing'
      ? 'draw'
      : drawnStatus === 'guessing'
        ? 'guess'
        : drawnStatus === 'telephone'
          ? 'describe'
          : drawnStatus === 'fake-voting'
            ? 'vote'
            : 'wait';
  return {
    id: 'drawn-out',
    status: drawnStatus,
    mode: drawnStatus.startsWith('fake-')
      ? 'fake-artist'
      : drawnStatus === 'telephone'
        ? 'telephone'
        : 'classic',
    roundNumber: 3,
    totalRounds: 5,
    deadlineAt: drawnStatus === 'results' || drawnStatus === 'complete' ? null : 60_000,
    task,
    instruction: LONG_FIXTURE_TEXT,
    privatePrompt: task === 'draw' ? LONG_FIXTURE_TEXT : null,
    sourceDescription: task === 'describe' ? LONG_FIXTURE_TEXT : null,
    isFakeArtist: drawnStatus.startsWith('fake-'),
    hasSubmitted: task === 'wait',
    drawing: { strokes: [] },
    candidatePlayerIds: players.map((player) => player.id),
    guessOptions: players.slice(0, 4).map((_, index) => ({
      id: `guess-${index + 1}`,
      text:
        index === 0
          ? 'A long but contract-safe guess option involving a runaway parade float and twelve confused pigeons'
          : `Guess option ${index + 1}`,
    })),
    ownGuess: task === 'wait' ? 'guess-1' : null,
    ownVotePlayerId: task === 'wait' ? (players[0]?.id ?? null) : null,
  };
}
