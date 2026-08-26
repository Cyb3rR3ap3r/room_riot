import {
  AvatarSchema,
  DEFAULT_ROOM_SETTINGS,
  GameIdSchema,
  PlayerIdSchema,
  PlayerNameSchema,
  RoomCodeSchema,
  RoomSettingsSchema,
} from '@room-riot/contracts';
import type {
  Avatar,
  GameId,
  PlayerId,
  PlayerName,
  RoomCode,
  RoomPhase,
  RoomSettings,
} from '@room-riot/contracts';

export type PlayerConnectionStatus = 'connected' | 'disconnected' | 'removed';

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: PlayerName;
  readonly avatar: Avatar;
  readonly status: PlayerConnectionStatus;
  readonly score: number;
  readonly joinedAt: number;
  readonly disconnectedAt: number | null;
  readonly reconnectDeadlineAt: number | null;
}

export interface RoomState {
  readonly roomCode: RoomCode;
  readonly phase: RoomPhase;
  readonly gameId: GameId | null;
  readonly paused: boolean;
  readonly pauseStartedAt: number | null;
  readonly settings: RoomSettings;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly readyPlayerIds: readonly PlayerId[];
  readonly readinessRequired: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateRoomStateInput {
  readonly roomCode: string;
  readonly now?: number;
  readonly settings?: Partial<RoomSettings>;
}

export interface AddPlayerInput {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly now?: number;
}

export interface PublicPlayerState {
  readonly id: PlayerId;
  readonly name: PlayerName;
  readonly avatar: Avatar;
  readonly status: PlayerConnectionStatus;
  readonly score: number;
  readonly disconnectedAt: number | null;
  readonly reconnectDeadlineAt: number | null;
}

export interface PublicRoomState {
  readonly roomCode: RoomCode;
  readonly phase: RoomPhase;
  readonly gameId: GameId | null;
  readonly paused: boolean;
  readonly pauseStartedAt: number | null;
  readonly settings: RoomSettings;
  readonly players: readonly PublicPlayerState[];
  readonly readyPlayerIds: readonly PlayerId[];
  readonly readinessRequired: boolean;
}

export function createInitialRoomState(input: CreateRoomStateInput): RoomState {
  const roomCode = RoomCodeSchema.parse(input.roomCode);
  const settings = RoomSettingsSchema.parse({ ...DEFAULT_ROOM_SETTINGS, ...input.settings });
  const now = input.now ?? Date.now();

  return {
    roomCode,
    phase: 'lobby',
    gameId: null,
    paused: false,
    pauseStartedAt: null,
    settings,
    players: {},
    readyPlayerIds: [],
    readinessRequired: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function addPlayer(state: RoomState, input: AddPlayerInput): RoomState {
  const id = PlayerIdSchema.parse(input.id);
  const name = PlayerNameSchema.parse(input.name);
  const avatar = AvatarSchema.parse(input.avatar);

  if (state.players[id]) {
    throw new Error(`Player ${id} is already in room ${state.roomCode}.`);
  }

  if (
    Object.values(state.players).filter((player) => player.status !== 'removed').length >=
    state.settings.maxPlayers
  ) {
    throw new Error(`Room ${state.roomCode} is full.`);
  }

  const now = input.now ?? Date.now();
  const player: PlayerState = {
    id,
    name,
    avatar,
    status: 'connected',
    score: 0,
    joinedAt: now,
    disconnectedAt: null,
    reconnectDeadlineAt: null,
  };

  return {
    ...state,
    players: { ...state.players, [id]: player },
    updatedAt: now,
  };
}

export function setGame(state: RoomState, gameId: string): RoomState {
  return {
    ...state,
    gameId: GameIdSchema.parse(gameId),
    phase: 'intro',
    readyPlayerIds: [],
    readinessRequired: false,
    updatedAt: Date.now(),
  };
}

export function setPlayerReady(
  state: RoomState,
  playerIdInput: string,
  ready: boolean,
  now = Date.now(),
): RoomState {
  const playerId = PlayerIdSchema.parse(playerIdInput);
  const player = state.players[playerId];
  if (!player || player.status === 'removed') {
    throw new Error(`Player ${playerId} is not active in room ${state.roomCode}.`);
  }
  const readyPlayerIds = new Set(state.readyPlayerIds);
  if (ready) readyPlayerIds.add(playerId);
  else readyPlayerIds.delete(playerId);
  return { ...state, readyPlayerIds: [...readyPlayerIds], updatedAt: now };
}

export function setPhase(state: RoomState, phase: RoomPhase, now = Date.now()): RoomState {
  return {
    ...state,
    phase,
    updatedAt: now,
  };
}

export function setPaused(
  state: RoomState,
  paused: boolean,
  now = Date.now(),
  pauseStartedAt: number | null = paused ? now : null,
): RoomState {
  return {
    ...state,
    paused,
    pauseStartedAt,
    updatedAt: now,
  };
}

export function addPlayerScores(
  state: RoomState,
  scores: Readonly<Record<string, number>>,
  now = Date.now(),
): RoomState {
  const players = { ...state.players };

  Object.entries(scores).forEach(([playerId, points]) => {
    const id = PlayerIdSchema.parse(playerId);
    const player = players[id];
    if (!player) throw new Error(`Player ${id} is not in room ${state.roomCode}.`);
    if (!Number.isInteger(points) || points < 0) {
      throw new Error(`Invalid score for player ${id}.`);
    }
    players[id] = { ...player, score: player.score + points };
  });

  return {
    ...state,
    players,
    updatedAt: now,
  };
}

export function setPlayerConnectionStatus(
  state: RoomState,
  playerId: string,
  status: PlayerConnectionStatus,
  now = Date.now(),
  reconnectDeadlineAt: number | null = null,
): RoomState {
  const id = PlayerIdSchema.parse(playerId);
  const player = state.players[id];

  if (!player) {
    throw new Error(`Player ${id} is not in room ${state.roomCode}.`);
  }

  const readyPlayerIds =
    status === 'removed'
      ? state.readyPlayerIds.filter((readyId) => readyId !== id)
      : state.readyPlayerIds;

  return {
    ...state,
    readyPlayerIds,
    players: {
      ...state.players,
      [id]: {
        ...player,
        status,
        disconnectedAt: status === 'disconnected' ? now : null,
        reconnectDeadlineAt: status === 'disconnected' ? reconnectDeadlineAt : null,
      },
    },
    updatedAt: now,
  };
}

export function toPublicRoomState(state: RoomState): PublicRoomState {
  return {
    roomCode: state.roomCode,
    phase: state.phase,
    gameId: state.gameId,
    paused: state.paused,
    pauseStartedAt: state.pauseStartedAt,
    settings: state.settings,
    readyPlayerIds: state.readyPlayerIds,
    readinessRequired: state.readinessRequired,
    players: Object.values(state.players).map(
      ({ id, name, avatar, status, score, disconnectedAt, reconnectDeadlineAt }) => ({
        id,
        name,
        avatar,
        status,
        score,
        disconnectedAt,
        reconnectDeadlineAt,
      }),
    ),
  };
}
