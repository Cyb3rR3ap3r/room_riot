import type {
  CreateRoomRequest,
  DisplayWatchRequest,
  HostReconnectRequest,
  HostRoomActionRequest,
  HostStartGameRequest,
  JoinRoomRequest,
  PlayerCastVoteRequest,
  PlayerSubmitAnswerRequest,
  RoomCode,
  SessionToken,
} from '@room-riot/contracts';
import type { PublicRoomState } from '@room-riot/game-engine';
import type { GroupthinkPlayerView, GroupthinkPublicView } from '@room-riot/groupthink';
import type { HotTakePlayerView, HotTakePublicView } from '@room-riot/hot-take';

export interface EventError {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export type EventResponse<T extends object> = ({ readonly ok: true } & T) | EventError;

export interface RoomSnapshot {
  readonly state: PublicRoomState;
  readonly game: GroupthinkPublicView | HotTakePublicView | null;
}

export type PlayerGameView = GroupthinkPlayerView | HotTakePlayerView;

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

export type HostCreateResponse = EventResponse<HostCreateSuccess>;
export type HostReconnectResponse = EventResponse<HostReconnectSuccess>;
export type PlayerJoinResponse = EventResponse<PlayerJoinSuccess>;
export type RoomStateResponse = EventResponse<RoomStateSuccess>;
export type PlayerAnswerResponse = EventResponse<PlayerAnswerSuccess>;

export interface SocketLike {
  on(event: 'connect', listener: () => void): this;
  on(event: 'disconnect', listener: (reason: string) => void): this;
  on(event: 'connect_error', listener: (error: Error) => void): this;
  on(event: 'room:state', listener: (snapshot: RoomSnapshot) => void): this;
  on(event: 'player:state', listener: (state: PlayerGameView) => void): this;
  emit(
    event: 'host:create-room',
    payload: CreateRoomRequest,
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
    event: 'player:join',
    payload: JoinRoomRequest,
    ack: (response: PlayerJoinResponse) => void,
  ): this;
  emit(
    event: 'player:submit-answer',
    payload: PlayerSubmitAnswerRequest,
    ack: (response: PlayerAnswerResponse) => void,
  ): this;
  emit(
    event: 'player:cast-vote',
    payload: PlayerCastVoteRequest,
    ack: (response: PlayerAnswerResponse) => void,
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
