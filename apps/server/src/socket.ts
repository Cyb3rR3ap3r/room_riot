import type { Server as HttpServer } from 'node:http';

import {
  CreateRoomRequestSchema,
  DisplayWatchRequestSchema,
  HostReconnectRequestSchema,
  HostRoomActionRequestSchema,
  HostStartGameRequestSchema,
  JoinRoomRequestSchema,
  PlayerCastVoteRequestSchema,
  PlayerSubmitAnswerRequestSchema,
} from '@room-riot/contracts';
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
import { Server } from 'socket.io';

import { RoomManagerError } from './room-manager.js';
import type { PlayerGameView, RoomManager, RoomSnapshot } from './room-manager.js';

export interface EventError {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export type EventResponse<T extends object> = ({ readonly ok: true } & T) | EventError;
export type EventAck<T extends object> = (response: EventResponse<T>) => void;

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

export interface ClientToServerEvents {
  'host:create-room': (payload: CreateRoomRequest, ack: EventAck<HostCreateSuccess>) => void;
  'host:reconnect': (payload: HostReconnectRequest, ack: EventAck<HostReconnectSuccess>) => void;
  'host:start-game': (payload: HostStartGameRequest, ack: EventAck<RoomStateSuccess>) => void;
  'host:reveal-results': (payload: HostRoomActionRequest, ack: EventAck<RoomStateSuccess>) => void;
  'host:next-round': (payload: HostRoomActionRequest, ack: EventAck<RoomStateSuccess>) => void;
  'player:join': (payload: JoinRoomRequest, ack: EventAck<PlayerJoinSuccess>) => void;
  'player:submit-answer': (
    payload: PlayerSubmitAnswerRequest,
    ack: EventAck<PlayerAnswerSuccess>,
  ) => void;
  'player:cast-vote': (payload: PlayerCastVoteRequest, ack: EventAck<PlayerAnswerSuccess>) => void;
  'display:watch': (payload: DisplayWatchRequest, ack: EventAck<RoomStateSuccess>) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'player:state': (state: PlayerGameView) => void;
}

interface SocketData {
  roomCode?: RoomCode;
  playerId?: string;
}

const roomChannel = (roomCode: RoomCode): string => `room:${roomCode}`;

export function attachRealtimeServer(httpServer: HttpServer, roomManager: RoomManager) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(
    httpServer,
    { serveClient: true },
  );

  const broadcastRoomSnapshot = (roomCode: RoomCode, snapshot: RoomSnapshot): void => {
    io.to(roomChannel(roomCode)).emit('room:state', snapshot);
    io.sockets.sockets.forEach((roomSocket) => {
      if (roomSocket.data.roomCode !== roomCode || !roomSocket.data.playerId) return;
      try {
        const playerState = roomManager.getPlayerState(roomCode, roomSocket.data.playerId);
        if (playerState) roomSocket.emit('player:state', playerState);
      } catch {
        // The public room snapshot is still useful if a stale socket outlives its session.
      }
    });
  };

  roomManager.subscribe((roomCode, snapshot) => {
    broadcastRoomSnapshot(roomCode, snapshot);
  });

  io.on('connection', (socket) => {
    socket.on('host:create-room', (payload, ack) => {
      respond(ack, () => {
        const request = CreateRoomRequestSchema.parse(payload);
        const created = roomManager.createRoom(request);
        roomManager.bindHost(created.roomCode, created.hostToken, socket.id);
        socket.join(roomChannel(created.roomCode));
        socket.data.roomCode = created.roomCode;

        return {
          roomCode: created.roomCode,
          hostToken: created.hostToken,
          snapshot: created.snapshot,
        };
      });
    });

    socket.on('host:reconnect', (payload, ack) => {
      respond(ack, () => {
        const request = HostReconnectRequestSchema.parse(payload);
        const snapshot = roomManager.bindHost(request.roomCode, request.hostToken, socket.id);
        socket.join(roomChannel(request.roomCode));
        socket.data.roomCode = request.roomCode;

        return {
          roomCode: request.roomCode,
          snapshot,
        };
      });
    });

    socket.on('host:start-game', (payload, ack) => {
      respond(ack, () => {
        const request = HostStartGameRequestSchema.parse(payload);
        const snapshot = roomManager.startGame(request.roomCode, request.hostToken, request.gameId);
        broadcastRoomSnapshot(request.roomCode, snapshot);

        return {
          roomCode: request.roomCode,
          snapshot,
        };
      });
    });

    socket.on('host:reveal-results', (payload, ack) => {
      respond(ack, () => {
        const request = HostRoomActionRequestSchema.parse(payload);
        const snapshot = roomManager.revealResults(request.roomCode, request.hostToken);
        broadcastRoomSnapshot(request.roomCode, snapshot);
        return { roomCode: request.roomCode, snapshot };
      });
    });

    socket.on('host:next-round', (payload, ack) => {
      respond(ack, () => {
        const request = HostRoomActionRequestSchema.parse(payload);
        const snapshot = roomManager.advanceRound(request.roomCode, request.hostToken);
        broadcastRoomSnapshot(request.roomCode, snapshot);
        return { roomCode: request.roomCode, snapshot };
      });
    });

    socket.on('player:join', (payload, ack) => {
      respond(ack, () => {
        const request = JoinRoomRequestSchema.parse(payload);
        const joined = roomManager.joinRoom(request);
        const snapshot = roomManager.bindPlayer(joined.roomCode, joined.playerId, socket.id);
        socket.join(roomChannel(joined.roomCode));
        socket.data.roomCode = joined.roomCode;
        socket.data.playerId = joined.playerId;
        broadcastRoomSnapshot(joined.roomCode, snapshot);

        return {
          roomCode: joined.roomCode,
          playerId: joined.playerId,
          playerToken: joined.playerToken,
          snapshot,
          playerState: joined.playerState,
        };
      });
    });

    socket.on('player:submit-answer', (payload, ack) => {
      respond(ack, () => {
        const request = PlayerSubmitAnswerRequestSchema.parse(payload);
        const playerId = roomManager.getPlayerIdForToken(request.roomCode, request.playerToken);
        if (socket.data.playerId !== playerId) {
          throw new RoomManagerError('UNAUTHORIZED', 'Player socket is not authorized.');
        }

        const update = roomManager.submitAnswer(
          request.roomCode,
          playerId,
          request.answer,
          request.targetPlayerId,
        );
        broadcastRoomSnapshot(request.roomCode, update.snapshot);
        return {
          roomCode: request.roomCode,
          snapshot: update.snapshot,
          playerState: update.playerState,
        };
      });
    });

    socket.on('player:cast-vote', (payload, ack) => {
      respond(ack, () => {
        const request = PlayerCastVoteRequestSchema.parse(payload);
        const playerId = roomManager.getPlayerIdForToken(request.roomCode, request.playerToken);
        if (socket.data.playerId !== playerId) {
          throw new RoomManagerError('UNAUTHORIZED', 'Player socket is not authorized.');
        }

        const update = roomManager.castVote(request.roomCode, playerId, request.entryId);
        broadcastRoomSnapshot(request.roomCode, update.snapshot);
        return {
          roomCode: request.roomCode,
          snapshot: update.snapshot,
          playerState: update.playerState,
        };
      });
    });

    socket.on('display:watch', (payload, ack) => {
      respond(ack, () => {
        const request = DisplayWatchRequestSchema.parse(payload);
        const snapshot = roomManager.getRoomSnapshot(request.roomCode);
        socket.join(roomChannel(request.roomCode));
        socket.data.roomCode = request.roomCode;

        return {
          roomCode: request.roomCode,
          snapshot,
        };
      });
    });

    socket.on('disconnect', () => {
      const state = roomManager.disconnectSocket(socket.id);
      const roomCode = socket.data.roomCode;
      if (state && roomCode) broadcastRoomSnapshot(roomCode, state);
    });
  });

  return io;
}

function respond<T extends object>(ack: EventAck<T>, action: () => T): void {
  try {
    ack({ ok: true, ...action() });
  } catch (error) {
    ack({ ok: false, error: toEventError(error) });
  }
}

function toEventError(error: unknown): EventError['error'] {
  if (error instanceof RoomManagerError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: 'INVALID_REQUEST', message: error.message };
  }

  return { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' };
}
