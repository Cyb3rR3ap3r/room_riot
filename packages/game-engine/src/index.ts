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

export type PlayerConnectionStatus = 'connected' | 'disconnected';

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: PlayerName;
  readonly avatar: Avatar;
  readonly status: PlayerConnectionStatus;
  readonly score: number;
  readonly joinedAt: number;
}

export interface RoomState {
  readonly roomCode: RoomCode;
  readonly phase: RoomPhase;
  readonly gameId: GameId | null;
  readonly settings: RoomSettings;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
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
}

export interface PublicRoomState {
  readonly roomCode: RoomCode;
  readonly phase: RoomPhase;
  readonly gameId: GameId | null;
  readonly settings: RoomSettings;
  readonly players: readonly PublicPlayerState[];
}

export function createInitialRoomState(input: CreateRoomStateInput): RoomState {
  const roomCode = RoomCodeSchema.parse(input.roomCode);
  const settings = RoomSettingsSchema.parse({ ...DEFAULT_ROOM_SETTINGS, ...input.settings });
  const now = input.now ?? Date.now();

  return {
    roomCode,
    phase: 'lobby',
    gameId: null,
    settings,
    players: {},
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

  if (Object.keys(state.players).length >= state.settings.maxPlayers) {
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
    updatedAt: Date.now(),
  };
}

export function setPhase(state: RoomState, phase: RoomPhase, now = Date.now()): RoomState {
  return {
    ...state,
    phase,
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
): RoomState {
  const id = PlayerIdSchema.parse(playerId);
  const player = state.players[id];

  if (!player) {
    throw new Error(`Player ${id} is not in room ${state.roomCode}.`);
  }

  return {
    ...state,
    players: {
      ...state.players,
      [id]: {
        ...player,
        status,
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
    settings: state.settings,
    players: Object.values(state.players).map(({ id, name, avatar, status, score }) => ({
      id,
      name,
      avatar,
      status,
      score,
    })),
  };
}
