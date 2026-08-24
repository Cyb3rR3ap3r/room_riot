import { getGamePlayerLimits, ROOM_RIOT_PROTOCOL_VERSION } from '@room-riot/contracts';
import type { RoomPhase, SupportedGameId } from '@room-riot/contracts';
import type { PublicPlayerState, PublicRoomState } from '@room-riot/game-engine';
import type { DrawnOutPlayerView, DrawnOutPublicView, DrawnOutStatus } from '@room-riot/drawn-out';
import type { GroupthinkPlayerView, GroupthinkPublicView } from '@room-riot/groupthink';
import type { HotTakePlayerView, HotTakePublicView } from '@room-riot/hot-take';
import type { SuspectPlayerView, SuspectPublicView } from '@room-riot/suspect';

import type { PlayerGameView, RoomSnapshot } from '../protocol.js';

export const LONG_FIXTURE_TEXT =
  'A spectacularly overcomplicated answer involving a runaway parade float, twelve confused pigeons, and a ceremonial sandwich that absolutely nobody remembered ordering — repeated context keeps this fixture intentionally long for wrapping and overflow characterization.';

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
    settings: {
      maxPlayers: getGamePlayerLimits(gameId).maximum,
      roundCount: 5,
      contentMode: 'standard',
      promptMode: 'default',
      drawnOutMode: 'classic',
    },
    players,
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
): GroupthinkPublicView | HotTakePublicView | SuspectPublicView | DrawnOutPublicView {
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
