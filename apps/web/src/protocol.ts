import {
  PlayerGameViewSchema,
  PlayerStateEnvelopeSchema,
  ROOM_RIOT_PROTOCOL_VERSION,
  RoomSnapshotSchema,
} from '@room-riot/contracts';
import type {
  CreateRoomActionRequest,
  DisplayWatchRequest,
  EventResponse,
  HostReconnectRequest,
  HostRemovePlayerRequest,
  HostRoomActionRequest,
  HostStartGameRequest,
  JoinRoomActionRequest,
  PlayerCastVoteRequest,
  PlayerLeaveRoomRequest,
  PlayerSubmitDrawingRequest,
  PlayerSubmitAnswerRequest,
  PlayerSubmitAlibiRequest,
  RoomCode,
  SessionToken,
} from '@room-riot/contracts';
import type { DrawnOutPlayerView, DrawnOutPublicView } from '@room-riot/drawn-out';
import type { PublicRoomState } from '@room-riot/game-engine';
import type { GroupthinkPlayerView, GroupthinkPublicView } from '@room-riot/groupthink';
import type { HotTakePlayerView, HotTakePublicView } from '@room-riot/hot-take';
import type { SuspectPlayerView, SuspectPublicView } from '@room-riot/suspect';

export interface RoomSnapshot {
  readonly protocolVersion: typeof ROOM_RIOT_PROTOCOL_VERSION;
  readonly revision: number;
  readonly state: PublicRoomState;
  readonly game:
    GroupthinkPublicView | HotTakePublicView | SuspectPublicView | DrawnOutPublicView | null;
  readonly roster: {
    readonly roundPlayerIds: readonly string[];
    readonly queuedPlayerIds: readonly string[];
  };
}

export type PlayerGameView =
  GroupthinkPlayerView | HotTakePlayerView | SuspectPlayerView | DrawnOutPlayerView;

export interface PlayerStateUpdate {
  readonly protocolVersion: typeof ROOM_RIOT_PROTOCOL_VERSION;
  readonly roomCode: RoomCode;
  readonly revision: number;
  readonly state: PlayerGameView;
}

export type ProtocolPayloadError = 'incompatible-version' | 'malformed-payload';
export type ProtocolPayloadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ProtocolPayloadError; readonly message: string };

export function parseRoomSnapshot(payload: unknown): ProtocolPayloadResult<RoomSnapshot> {
  return parseProtocolPayload(RoomSnapshotSchema, payload);
}

export function parsePlayerStateUpdate(payload: unknown): ProtocolPayloadResult<PlayerStateUpdate> {
  return parseProtocolPayload(PlayerStateEnvelopeSchema, payload);
}

export function parsePlayerGameView(
  payload: unknown,
): ProtocolPayloadResult<PlayerGameView | null> {
  const result = PlayerGameViewSchema.nullable().safeParse(payload);
  return result.success
    ? { ok: true, value: result.data }
    : {
        ok: false,
        error: 'malformed-payload',
        message: 'Room Riot received invalid private game data. Reconnect or refresh to recover.',
      };
}

function parseProtocolPayload<T>(
  schema: { safeParse(payload: unknown): { success: true; data: T } | { success: false } },
  payload: unknown,
): ProtocolPayloadResult<T> {
  const result = schema.safeParse(payload);
  if (result.success) return { ok: true, value: result.data };

  const receivedVersion =
    typeof payload === 'object' && payload !== null && 'protocolVersion' in payload
      ? (payload as { readonly protocolVersion?: unknown }).protocolVersion
      : undefined;
  if (receivedVersion !== undefined && receivedVersion !== ROOM_RIOT_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: 'incompatible-version',
      message: 'This Room Riot client is out of date. Refresh the page to load a compatible build.',
    };
  }
  return {
    ok: false,
    error: 'malformed-payload',
    message: 'Room Riot received invalid game data. Reconnect or refresh to recover.',
  };
}

export interface HostCreateSuccess {
  readonly roomCode: RoomCode;
  readonly hostToken: SessionToken;
  readonly snapshot: RoomSnapshot;
}

export interface HostReconnectSuccess {
  readonly roomCode: RoomCode;
  readonly snapshot: RoomSnapshot;
}

export interface PlayerJoinSuccess {
  readonly roomCode: RoomCode;
  readonly playerId: string;
  readonly playerToken: SessionToken;
  readonly snapshot: RoomSnapshot;
  readonly playerState: PlayerGameView | null;
}

export interface RoomStateSuccess {
  readonly roomCode: RoomCode;
  readonly snapshot: RoomSnapshot;
}

export interface PlayerAnswerSuccess {
  readonly roomCode: RoomCode;
  readonly snapshot: RoomSnapshot;
  readonly playerState: PlayerGameView | null;
}

export interface LeaveRoomSuccess {
  readonly roomCode: RoomCode;
}

export interface RemovePlayerSuccess extends LeaveRoomSuccess {
  readonly playerId: string;
  readonly snapshot: RoomSnapshot;
}

export interface PlayerRemovedNotice {
  readonly roomCode: RoomCode;
  readonly reason: 'left' | 'removed-by-host';
}

export interface RoomClosedNotice {
  readonly roomCode: RoomCode;
  readonly reason: 'closed-by-host';
}

export interface SessionReplacedNotice {
  readonly roomCode: RoomCode;
  readonly role: 'host' | 'player';
}

export type HostCreateResponse = EventResponse<HostCreateSuccess>;
export type HostReconnectResponse = EventResponse<HostReconnectSuccess>;
export type PlayerJoinResponse = EventResponse<PlayerJoinSuccess>;
export type RoomStateResponse = EventResponse<RoomStateSuccess>;
export type PlayerAnswerResponse = EventResponse<PlayerAnswerSuccess>;
export type LeaveRoomResponse = EventResponse<LeaveRoomSuccess>;
export type RemovePlayerResponse = EventResponse<RemovePlayerSuccess>;

export interface SocketLike {
  on(event: 'connect', listener: () => void): this;
  on(event: 'disconnect', listener: (reason: string) => void): this;
  on(event: 'connect_error', listener: (error: Error) => void): this;
  on(event: 'room:state', listener: (snapshot: unknown) => void): this;
  on(event: 'player:state', listener: (update: unknown) => void): this;
  on(event: 'player:removed', listener: (notice: PlayerRemovedNotice) => void): this;
  on(event: 'room:closed', listener: (notice: RoomClosedNotice) => void): this;
  on(event: 'session:replaced', listener: (notice: SessionReplacedNotice) => void): this;
  emit(
    event: 'host:create-room',
    payload: CreateRoomActionRequest,
    ack: (response: HostCreateResponse) => void,
  ): this;
  emit(
    event: 'host:reconnect',
    payload: HostReconnectRequest,
    ack: (response: HostReconnectResponse) => void,
  ): this;
  emit(
    event: 'host:start-game',
    payload: HostStartGameRequest,
    ack: (response: RoomStateResponse) => void,
  ): this;
  emit(
    event: 'host:reveal-results',
    payload: HostRoomActionRequest,
    ack: (response: RoomStateResponse) => void,
  ): this;
  emit(
    event: 'host:next-round',
    payload: HostRoomActionRequest,
    ack: (response: RoomStateResponse) => void,
  ): this;
  emit(
    event: 'host:leave',
    payload: HostRoomActionRequest,
    ack: (response: LeaveRoomResponse) => void,
  ): this;
  emit(
    event: 'host:kick-player',
    payload: HostRemovePlayerRequest,
    ack: (response: RemovePlayerResponse) => void,
  ): this;
  emit(
    event: 'host:close-room',
    payload: HostRoomActionRequest,
    ack: (response: LeaveRoomResponse) => void,
  ): this;
  emit(
    event: 'player:join',
    payload: JoinRoomActionRequest,
    ack: (response: PlayerJoinResponse) => void,
  ): this;
  emit(
    event: 'player:submit-answer',
    payload: PlayerSubmitAnswerRequest,
    ack: (response: PlayerAnswerResponse) => void,
  ): this;
  emit(
    event: 'player:submit-drawing',
    payload: PlayerSubmitDrawingRequest,
    ack: (response: PlayerAnswerResponse) => void,
  ): this;
  emit(
    event: 'player:submit-alibi',
    payload: PlayerSubmitAlibiRequest,
    ack: (response: PlayerAnswerResponse) => void,
  ): this;
  emit(
    event: 'player:cast-vote',
    payload: PlayerCastVoteRequest,
    ack: (response: PlayerAnswerResponse) => void,
  ): this;
  emit(
    event: 'player:leave',
    payload: PlayerLeaveRoomRequest,
    ack: (response: LeaveRoomResponse) => void,
  ): this;
  emit(
    event: 'display:watch',
    payload: DisplayWatchRequest,
    ack: (response: RoomStateResponse) => void,
  ): this;
}

declare global {
  interface Window {
    io: () => SocketLike;
  }
}

export function isSuccess<T extends object>(
  response: EventResponse<T>,
): response is { readonly ok: true } & T {
  return response.ok;
}
