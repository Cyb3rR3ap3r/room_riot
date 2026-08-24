import type { Server as HttpServer } from 'node:http';

import {
  CreateRoomRequestSchema,
  DisplayWatchRequestSchema,
  type EventError,
  type EventResponse,
  HostReconnectRequestSchema,
  HostRoomActionRequestSchema,
  HostStartGameRequestSchema,
  JoinRoomRequestSchema,
  PlayerLeaveRoomRequestSchema,
  PlayerSubmitAlibiRequestSchema,
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
  PlayerLeaveRoomRequest,
  PlayerSubmitAlibiRequest,
  PlayerCastVoteRequest,
  PlayerSubmitAnswerRequest,
  RoomCode,
  SessionToken,
} from '@room-riot/contracts';
import { Server, type Socket } from 'socket.io';

import { RoomManagerError } from './room-manager.js';
import type { PlayerGameView, RoomManager, RoomSnapshot } from './room-manager.js';

export type { EventError, EventResponse } from '@room-riot/contracts';

export type EventAck<T extends object> = (response: EventResponse<T>) => void;

export interface LeaveRoomSuccess {
  readonly roomCode: RoomCode;
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

export interface ClientToServerEvents {
  'host:create-room': (payload: CreateRoomRequest, ack: EventAck<HostCreateSuccess>) => void;
  'host:reconnect': (payload: HostReconnectRequest, ack: EventAck<HostReconnectSuccess>) => void;
  'host:start-game': (payload: HostStartGameRequest, ack: EventAck<RoomStateSuccess>) => void;
  'host:reveal-results': (payload: HostRoomActionRequest, ack: EventAck<RoomStateSuccess>) => void;
  'host:next-round': (payload: HostRoomActionRequest, ack: EventAck<RoomStateSuccess>) => void;
  'host:leave': (payload: HostRoomActionRequest, ack: EventAck<LeaveRoomSuccess>) => void;
  'player:join': (payload: JoinRoomRequest, ack: EventAck<PlayerJoinSuccess>) => void;
  'player:submit-answer': (
    payload: PlayerSubmitAnswerRequest,
    ack: EventAck<PlayerAnswerSuccess>,
  ) => void;
  'player:submit-alibi': (
    payload: PlayerSubmitAlibiRequest,
    ack: EventAck<PlayerAnswerSuccess>,
  ) => void;
  'player:cast-vote': (payload: PlayerCastVoteRequest, ack: EventAck<PlayerAnswerSuccess>) => void;
  'player:leave': (payload: PlayerLeaveRoomRequest, ack: EventAck<LeaveRoomSuccess>) => void;
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

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const roomChannel = (roomCode: RoomCode): string => `room:${roomCode}`;
const ROOM_CREATION_WINDOW_MS = 60_000;
const ROOM_CREATION_LIMIT = 10;

export function attachRealtimeServer(httpServer: HttpServer, roomManager: RoomManager) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(
    httpServer,
    {
      serveClient: true,
      allowRequest: (request, callback) => {
        const origin = request.headers.origin;
        if (!origin) {
          callback(null, true);
          return;
        }
        try {
          const originUrl = new URL(origin);
          callback(null, originUrl.host === request.headers.host);
        } catch {
          callback(null, false);
        }
      },
    },
  );
  const roomCreationAttempts = new Map<string, number[]>();

  const broadcastRoomSnapshot = (roomCode: RoomCode, snapshot: RoomSnapshot): void => {
    io.to(roomChannel(roomCode)).emit('room:state', snapshot);
    io.sockets.sockets.forEach((roomSocket) => {
      const binding = roomManager.getSocketBinding(roomSocket.id);
      if (!binding || binding.kind !== 'player' || binding.roomCode !== roomCode) return;
      try {
        const playerState = roomManager.getPlayerState(roomCode, binding.playerId);
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
        assertRoomCreationRateLimit(roomCreationAttempts, socket.id);
        const request = CreateRoomRequestSchema.parse(payload);
        const created = roomManager.createRoom(request);
        clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
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
        const supersededSocketId = roomManager.getHostSocketId(request.roomCode);
        const snapshot = roomManager.bindHost(request.roomCode, request.hostToken, socket.id);
        if (supersededSocketId && supersededSocketId !== socket.id) {
          io.sockets.sockets.get(supersededSocketId)?.disconnect(true);
        }
        if (socket.data.roomCode && socket.data.roomCode !== request.roomCode) {
          socket.leave(roomChannel(socket.data.roomCode));
        }
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
        roomManager.assertHostSocket(request.roomCode, socket.id);
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
        roomManager.assertHostSocket(request.roomCode, socket.id);
        const snapshot = roomManager.revealResults(request.roomCode, request.hostToken);
        broadcastRoomSnapshot(request.roomCode, snapshot);
        return { roomCode: request.roomCode, snapshot };
      });
    });

    socket.on('host:next-round', (payload, ack) => {
      respond(ack, () => {
        const request = HostRoomActionRequestSchema.parse(payload);
        roomManager.assertHostSocket(request.roomCode, socket.id);
        const snapshot = roomManager.advanceRound(request.roomCode, request.hostToken);
        broadcastRoomSnapshot(request.roomCode, snapshot);
        return { roomCode: request.roomCode, snapshot };
      });
    });

    socket.on('host:leave', (payload, ack) => {
      respond(ack, () => {
        const request = HostRoomActionRequestSchema.parse(payload);
        roomManager.assertHostSocket(request.roomCode, socket.id);
        clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
        return { roomCode: request.roomCode };
      });
    });

    socket.on('player:join', (payload, ack) => {
      respond(ack, () => {
        const request = JoinRoomRequestSchema.parse(payload);
        const joined = roomManager.joinRoom(request);
        const supersededSocketId = roomManager.getPlayerSocketId(joined.roomCode, joined.playerId);
        const currentBinding = roomManager.getSocketBinding(socket.id);
        if (
          !currentBinding ||
          currentBinding.kind !== 'player' ||
          currentBinding.roomCode !== joined.roomCode ||
          currentBinding.playerId !== joined.playerId
        ) {
          clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
        }
        if (supersededSocketId && supersededSocketId !== socket.id) {
          io.sockets.sockets.get(supersededSocketId)?.disconnect(true);
        }
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
        roomManager.assertPlayerSocket(request.roomCode, playerId, socket.id);

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

    socket.on('player:submit-alibi', (payload, ack) => {
      respond(ack, () => {
        const request = PlayerSubmitAlibiRequestSchema.parse(payload);
        const playerId = roomManager.getPlayerIdForToken(request.roomCode, request.playerToken);
        roomManager.assertPlayerSocket(request.roomCode, playerId, socket.id);
        const update = roomManager.submitSuspectAlibi(request.roomCode, playerId, request.alibi);
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
        roomManager.assertPlayerSocket(request.roomCode, playerId, socket.id);

        const update = roomManager.castVote(request.roomCode, playerId, request.entryId);
        broadcastRoomSnapshot(request.roomCode, update.snapshot);
        return {
          roomCode: request.roomCode,
          snapshot: update.snapshot,
          playerState: update.playerState,
        };
      });
    });

    socket.on('player:leave', (payload, ack) => {
      respond(ack, () => {
        const request = PlayerLeaveRoomRequestSchema.parse(payload);
        const playerId = roomManager.getPlayerIdForToken(request.roomCode, request.playerToken);
        roomManager.assertPlayerSocket(request.roomCode, playerId, socket.id);
        clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
        return { roomCode: request.roomCode };
      });
    });

    socket.on('display:watch', (payload, ack) => {
      respond(ack, () => {
        const request = DisplayWatchRequestSchema.parse(payload);
        const snapshot = roomManager.getRoomSnapshot(request.roomCode);
        clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
        socket.join(roomChannel(request.roomCode));
        socket.data.roomCode = request.roomCode;

        return {
          roomCode: request.roomCode,
          snapshot,
        };
      });
    });

    socket.on('disconnect', () => {
      roomCreationAttempts.delete(socket.id);
      const state = roomManager.disconnectSocket(socket.id);
      const roomCode = socket.data.roomCode;
      if (state && roomCode) broadcastRoomSnapshot(roomCode, state);
    });
  });

  return io;
}

function respond<T extends object>(ack: EventAck<T> | undefined, action: () => T): void {
  if (typeof ack !== 'function') return;
  try {
    ack({ ok: true, ...action() });
  } catch (error) {
    ack({ ok: false, error: toEventError(error) });
  }
}

function clearSocketBinding(
  socket: RoomSocket,
  roomManager: RoomManager,
  broadcastRoomSnapshot: (roomCode: RoomCode, snapshot: RoomSnapshot) => void,
): void {
  const previousRoomCode = socket.data.roomCode;
  const snapshot = roomManager.disconnectSocket(socket.id);
  if (previousRoomCode) socket.leave(roomChannel(previousRoomCode));
  delete socket.data.roomCode;
  delete socket.data.playerId;
  if (snapshot && previousRoomCode) broadcastRoomSnapshot(previousRoomCode, snapshot);
}

function assertRoomCreationRateLimit(attempts: Map<string, number[]>, socketId: string): void {
  const now = Date.now();
  const recent = (attempts.get(socketId) ?? []).filter(
    (timestamp) => now - timestamp < ROOM_CREATION_WINDOW_MS,
  );
  if (recent.length >= ROOM_CREATION_LIMIT) {
    throw new RoomManagerError('ROOM_LIMIT', 'Too many rooms created from this connection.');
  }
  recent.push(now);
  attempts.set(socketId, recent);
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
