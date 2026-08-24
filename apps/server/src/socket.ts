import type { Server as HttpServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

import {
  CreateRoomActionRequestSchema,
  DisplayWatchRequestSchema,
  type EventError,
  type EventResponse,
  HostReconnectRequestSchema,
  HostRemovePlayerRequestSchema,
  HostRoomActionRequestSchema,
  HostStartGameRequestSchema,
  JoinRoomActionRequestSchema,
  PlayerLeaveRoomRequestSchema,
  PlayerSubmitDrawingRequestSchema,
  PlayerSubmitAlibiRequestSchema,
  PlayerCastVoteRequestSchema,
  PlayerSubmitAnswerRequestSchema,
  INTERNAL_ERROR_MESSAGE,
  INVALID_REQUEST_MESSAGE,
} from '@room-riot/contracts';
import type {
  CreateRoomActionRequest,
  DisplayWatchRequest,
  HostReconnectRequest,
  HostRemovePlayerRequest,
  HostRoomActionRequest,
  HostStartGameRequest,
  JoinRoomActionRequest,
  PlayerLeaveRoomRequest,
  PlayerSubmitDrawingRequest,
  PlayerSubmitAlibiRequest,
  PlayerCastVoteRequest,
  PlayerSubmitAnswerRequest,
  RoomCode,
  SessionToken,
} from '@room-riot/contracts';
import { Server, type Socket } from 'socket.io';

import { RoomManagerError } from './room-manager.js';
import { GameActionError } from './game-registry.js';
import type { PlayerGameView, RoomManager, RoomSnapshot } from './room-manager.js';

export type { EventError, EventResponse } from '@room-riot/contracts';

export type EventAck<T extends object> = (response: EventResponse<T>) => void;

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
  'host:create-room': (payload: CreateRoomActionRequest, ack: EventAck<HostCreateSuccess>) => void;
  'host:reconnect': (payload: HostReconnectRequest, ack: EventAck<HostReconnectSuccess>) => void;
  'host:start-game': (payload: HostStartGameRequest, ack: EventAck<RoomStateSuccess>) => void;
  'host:reveal-results': (payload: HostRoomActionRequest, ack: EventAck<RoomStateSuccess>) => void;
  'host:next-round': (payload: HostRoomActionRequest, ack: EventAck<RoomStateSuccess>) => void;
  'host:leave': (payload: HostRoomActionRequest, ack: EventAck<LeaveRoomSuccess>) => void;
  'host:kick-player': (
    payload: HostRemovePlayerRequest,
    ack: EventAck<RemovePlayerSuccess>,
  ) => void;
  'host:close-room': (payload: HostRoomActionRequest, ack: EventAck<LeaveRoomSuccess>) => void;
  'player:join': (payload: JoinRoomActionRequest, ack: EventAck<PlayerJoinSuccess>) => void;
  'player:submit-answer': (
    payload: PlayerSubmitAnswerRequest,
    ack: EventAck<PlayerAnswerSuccess>,
  ) => void;
  'player:submit-drawing': (
    payload: PlayerSubmitDrawingRequest,
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
  'player:state': (update: PlayerStateEnvelope) => void;
  'player:removed': (notice: PlayerRemovedNotice) => void;
  'room:closed': (notice: RoomClosedNotice) => void;
  'session:replaced': (notice: SessionReplacedNotice) => void;
}

export interface PlayerStateEnvelope {
  readonly protocolVersion: RoomSnapshot['protocolVersion'];
  readonly roomCode: RoomCode;
  readonly revision: number;
  readonly state: PlayerGameView;
}

interface SocketData {
  roomCode?: RoomCode;
  playerId?: string;
}

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const roomChannel = (roomCode: RoomCode): string => `room:${roomCode}`;
const ROOM_CREATION_WINDOW_MS = 60_000;
const ROOM_CREATION_LIMIT = 10;
const ACTION_DEDUPLICATION_TTL_MS = 10 * 60_000;
const ACTION_DEDUPLICATION_LIMIT_PER_ACTOR = 64;
const ACTION_DEDUPLICATION_BOOTSTRAP_LIMIT = 2_048;
const ACTION_DEDUPLICATION_TOTAL_LIMIT = 16_384;

interface CachedActionResponse {
  readonly expiresAt: number;
  readonly requestFingerprint: string;
  readonly response: EventResponse<object>;
}

export interface RealtimeServerOptions {
  readonly actionDeduplicationTtlMs?: number;
  readonly actionDeduplicationLimitPerActor?: number;
  readonly actionDeduplicationBootstrapLimit?: number;
  readonly actionDeduplicationTotalLimit?: number;
  readonly now?: () => number;
}

export function attachRealtimeServer(
  httpServer: HttpServer,
  roomManager: RoomManager,
  options: RealtimeServerOptions = {},
) {
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
  const actionResponses = new ActionReceiptStore(options);

  const broadcastRoomSnapshot = (roomCode: RoomCode, snapshot: RoomSnapshot): void => {
    io.to(roomChannel(roomCode)).emit('room:state', snapshot);
    io.sockets.sockets.forEach((roomSocket) => {
      const binding = roomManager.getSocketBinding(roomSocket.id);
      if (!binding || binding.kind !== 'player' || binding.roomCode !== roomCode) return;
      try {
        const playerState = roomManager.getPlayerState(roomCode, binding.playerId);
        if (playerState) {
          roomSocket.emit('player:state', {
            protocolVersion: snapshot.protocolVersion,
            roomCode,
            revision: snapshot.revision,
            state: playerState,
          });
        }
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
        const request = CreateRoomActionRequestSchema.parse(payload);
        const { actionId, ...roomRequest } = request;
        return deduplicateAction(
          actionResponses,
          'bootstrap:create',
          'host:create-room',
          actionId,
          () => {
            assertRoomCreationRateLimit(roomCreationAttempts, socket.id);
            const created = roomManager.createRoom(roomRequest);
            clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
            roomManager.bindHost(created.roomCode, created.hostToken, socket.id);
            socket.join(roomChannel(created.roomCode));
            socket.data.roomCode = created.roomCode;

            return {
              roomCode: created.roomCode,
              hostToken: created.hostToken,
              snapshot: created.snapshot,
            };
          },
          fingerprintRequest(request),
          (cached) => {
            clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
            const snapshot = roomManager.bindHost(cached.roomCode, cached.hostToken, socket.id);
            socket.join(roomChannel(cached.roomCode));
            socket.data.roomCode = cached.roomCode;
            return { ...cached, snapshot };
          },
        );
      });
    });

    socket.on('host:reconnect', (payload, ack) => {
      respond(ack, () => {
        const request = HostReconnectRequestSchema.parse(payload);
        const reconnectHost = (): HostReconnectSuccess => {
          const supersededSocketId = roomManager.getHostSocketId(request.roomCode);
          const snapshot = roomManager.bindHost(request.roomCode, request.hostToken, socket.id);
          if (supersededSocketId && supersededSocketId !== socket.id) {
            const supersededSocket = io.sockets.sockets.get(supersededSocketId);
            supersededSocket?.emit('session:replaced', {
              roomCode: request.roomCode,
              role: 'host',
            });
            supersededSocket?.disconnect(true);
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
        };
        return deduplicateAction(
          actionResponses,
          request.hostToken,
          'host:reconnect',
          request.actionId,
          reconnectHost,
          fingerprintRequest(request),
          reconnectHost,
        );
      });
    });

    socket.on('host:start-game', (payload, ack) => {
      respond(ack, () => {
        const request = HostStartGameRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.hostToken,
          'host:start-game',
          request.actionId,
          () => {
            roomManager.assertHostSocket(request.roomCode, socket.id);
            const snapshot = roomManager.startGame(
              request.roomCode,
              request.hostToken,
              request.gameId,
            );
            broadcastRoomSnapshot(request.roomCode, snapshot);

            return { roomCode: request.roomCode, snapshot };
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('host:reveal-results', (payload, ack) => {
      respond(ack, () => {
        const request = HostRoomActionRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.hostToken,
          'host:reveal-results',
          request.actionId,
          () => {
            roomManager.assertHostSocket(request.roomCode, socket.id);
            const snapshot = roomManager.revealResults(request.roomCode, request.hostToken);
            broadcastRoomSnapshot(request.roomCode, snapshot);
            return { roomCode: request.roomCode, snapshot };
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('host:next-round', (payload, ack) => {
      respond(ack, () => {
        const request = HostRoomActionRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.hostToken,
          'host:next-round',
          request.actionId,
          () => {
            roomManager.assertHostSocket(request.roomCode, socket.id);
            const snapshot = roomManager.advanceRound(request.roomCode, request.hostToken);
            broadcastRoomSnapshot(request.roomCode, snapshot);
            return { roomCode: request.roomCode, snapshot };
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('host:leave', (payload, ack) => {
      respond(ack, () => {
        const request = HostRoomActionRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.hostToken,
          'host:leave',
          request.actionId,
          () => {
            roomManager.assertHostSocket(request.roomCode, socket.id);
            clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
            return { roomCode: request.roomCode };
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('host:kick-player', (payload, ack) => {
      respond(ack, () => {
        const request = HostRemovePlayerRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.hostToken,
          'host:kick-player',
          request.actionId,
          () => {
            roomManager.assertHostSocket(request.roomCode, socket.id);
            const removed = roomManager.removePlayerByHost(
              request.roomCode,
              request.hostToken,
              request.playerId,
            );
            if (removed.socketId) {
              const removedSocket = io.sockets.sockets.get(removed.socketId);
              removedSocket?.emit('player:removed', {
                roomCode: request.roomCode,
                reason: 'removed-by-host',
              });
              removedSocket?.leave(roomChannel(request.roomCode));
              if (removedSocket) {
                delete removedSocket.data.roomCode;
                delete removedSocket.data.playerId;
              }
            }
            broadcastRoomSnapshot(request.roomCode, removed.snapshot);
            return {
              roomCode: request.roomCode,
              playerId: removed.playerId,
              snapshot: removed.snapshot,
            };
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('host:close-room', (payload, ack) => {
      respond(ack, () => {
        const request = HostRoomActionRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.hostToken,
          'host:close-room',
          request.actionId,
          () => {
            roomManager.assertHostSocket(request.roomCode, socket.id);
            const closed = roomManager.closeRoom(request.roomCode, request.hostToken);
            io.to(roomChannel(request.roomCode)).emit('room:closed', {
              roomCode: request.roomCode,
              reason: 'closed-by-host',
            });
            io.in(roomChannel(request.roomCode)).socketsLeave(roomChannel(request.roomCode));
            closed.socketIds.forEach((socketId) => {
              const roomSocket = io.sockets.sockets.get(socketId);
              roomSocket?.leave(roomChannel(request.roomCode));
              if (roomSocket) {
                delete roomSocket.data.roomCode;
                delete roomSocket.data.playerId;
              }
            });
            return { roomCode: request.roomCode };
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('player:join', (payload, ack) => {
      respond(ack, () => {
        const request = JoinRoomActionRequestSchema.parse(payload);
        const { actionId, ...joinRequest } = request;
        const actorKey = joinRequest.playerToken ?? `bootstrap:join:${joinRequest.roomCode}`;
        return deduplicateAction(
          actionResponses,
          actorKey,
          'player:join',
          actionId,
          () => {
            const joined = roomManager.joinRoom(joinRequest);
            const supersededSocketId = roomManager.getPlayerSocketId(
              joined.roomCode,
              joined.playerId,
            );
            const currentBinding = roomManager.getSocketBinding(socket.id);
            if (
              !currentBinding ||
              currentBinding.kind !== 'player' ||
              currentBinding.roomCode !== joined.roomCode ||
              currentBinding.playerId !== joined.playerId
            ) {
              clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
            }
            const snapshot = roomManager.bindPlayer(joined.roomCode, joined.playerId, socket.id);
            if (supersededSocketId && supersededSocketId !== socket.id) {
              const supersededSocket = io.sockets.sockets.get(supersededSocketId);
              supersededSocket?.emit('session:replaced', {
                roomCode: joined.roomCode,
                role: 'player',
              });
              supersededSocket?.disconnect(true);
            }
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
          },
          fingerprintRequest(request),
          (cached) => {
            const supersededSocketId = roomManager.getPlayerSocketId(
              cached.roomCode,
              cached.playerId,
            );
            clearSocketBinding(socket, roomManager, broadcastRoomSnapshot);
            const snapshot = roomManager.bindPlayer(cached.roomCode, cached.playerId, socket.id);
            if (supersededSocketId && supersededSocketId !== socket.id) {
              const supersededSocket = io.sockets.sockets.get(supersededSocketId);
              supersededSocket?.emit('session:replaced', {
                roomCode: cached.roomCode,
                role: 'player',
              });
              supersededSocket?.disconnect(true);
            }
            socket.join(roomChannel(cached.roomCode));
            socket.data.roomCode = cached.roomCode;
            socket.data.playerId = cached.playerId;
            broadcastRoomSnapshot(cached.roomCode, snapshot);
            return {
              ...cached,
              snapshot,
              playerState: roomManager.getPlayerState(cached.roomCode, cached.playerId),
            };
          },
        );
      });
    });

    socket.on('player:submit-answer', (payload, ack) => {
      respond(ack, () => {
        const request = PlayerSubmitAnswerRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.playerToken,
          'player:submit-answer',
          request.actionId,
          () => {
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
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('player:submit-drawing', (payload, ack) => {
      respond(ack, () => {
        const request = PlayerSubmitDrawingRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.playerToken,
          'player:submit-drawing',
          request.actionId,
          () => {
            const playerId = roomManager.getPlayerIdForToken(request.roomCode, request.playerToken);
            roomManager.assertPlayerSocket(request.roomCode, playerId, socket.id);
            const update = roomManager.submitDrawing(request.roomCode, playerId, request.drawing);
            broadcastRoomSnapshot(request.roomCode, update.snapshot);
            return {
              roomCode: request.roomCode,
              snapshot: update.snapshot,
              playerState: update.playerState,
            };
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('player:submit-alibi', (payload, ack) => {
      respond(ack, () => {
        const request = PlayerSubmitAlibiRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.playerToken,
          'player:submit-alibi',
          request.actionId,
          () => {
            const playerId = roomManager.getPlayerIdForToken(request.roomCode, request.playerToken);
            roomManager.assertPlayerSocket(request.roomCode, playerId, socket.id);
            const update = roomManager.submitSuspectAlibi(
              request.roomCode,
              playerId,
              request.alibi,
            );
            broadcastRoomSnapshot(request.roomCode, update.snapshot);
            return {
              roomCode: request.roomCode,
              snapshot: update.snapshot,
              playerState: update.playerState,
            };
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('player:cast-vote', (payload, ack) => {
      respond(ack, () => {
        const request = PlayerCastVoteRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.playerToken,
          'player:cast-vote',
          request.actionId,
          () => {
            const playerId = roomManager.getPlayerIdForToken(request.roomCode, request.playerToken);
            roomManager.assertPlayerSocket(request.roomCode, playerId, socket.id);

            const update = roomManager.castVote(request.roomCode, playerId, request.entryId);
            broadcastRoomSnapshot(request.roomCode, update.snapshot);
            return {
              roomCode: request.roomCode,
              snapshot: update.snapshot,
              playerState: update.playerState,
            };
          },
          fingerprintRequest(request),
        );
      });
    });

    socket.on('player:leave', (payload, ack) => {
      respond(ack, () => {
        const request = PlayerLeaveRoomRequestSchema.parse(payload);
        return deduplicateAction(
          actionResponses,
          request.playerToken,
          'player:leave',
          request.actionId,
          () => {
            const playerId = roomManager.getPlayerIdForToken(request.roomCode, request.playerToken);
            roomManager.assertPlayerSocket(request.roomCode, playerId, socket.id);
            const removed = roomManager.leavePlayer(request.roomCode, request.playerToken);
            socket.leave(roomChannel(request.roomCode));
            delete socket.data.roomCode;
            delete socket.data.playerId;
            broadcastRoomSnapshot(request.roomCode, removed.snapshot);
            return { roomCode: request.roomCode };
          },
          fingerprintRequest(request),
        );
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

function deduplicateAction<T extends object>(
  cache: ActionReceiptStore,
  actorKey: string,
  event: string,
  actionId: string,
  action: () => T,
  requestFingerprint: string,
  replay: (response: T) => T = (response) => response,
): T {
  const cached = cache.get(actorKey, event, actionId);
  if (cached) {
    if (cached.requestFingerprint !== requestFingerprint) {
      throw new CachedEventError({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'That action ID was already used for a different request.',
      });
    }
    if (!cached.response.ok) throw new CachedEventError(cached.response.error);
    return replay(cached.response as { ok: true } & T);
  }

  cache.assertCanStore(actorKey, event, actionId);
  try {
    const result = action();
    cache.set(actorKey, event, actionId, requestFingerprint, { ok: true, ...result });
    return result;
  } catch (error) {
    const eventError = toEventError(error);
    cache.set(actorKey, event, actionId, requestFingerprint, { ok: false, error: eventError });
    throw new CachedEventError(eventError);
  }
}

class CachedEventError extends Error {
  constructor(readonly eventError: EventError['error']) {
    super(eventError.message);
  }
}

class ActionReceiptStore {
  private readonly actors = new Map<string, Map<string, CachedActionResponse>>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly limitPerActor: number;
  private readonly bootstrapLimit: number;
  private readonly totalLimit: number;

  constructor(options: RealtimeServerOptions) {
    this.now = options.now ?? Date.now;
    this.ttlMs = positiveInteger(
      options.actionDeduplicationTtlMs ?? ACTION_DEDUPLICATION_TTL_MS,
      'actionDeduplicationTtlMs',
    );
    this.limitPerActor = positiveInteger(
      options.actionDeduplicationLimitPerActor ?? ACTION_DEDUPLICATION_LIMIT_PER_ACTOR,
      'actionDeduplicationLimitPerActor',
    );
    this.bootstrapLimit = positiveInteger(
      options.actionDeduplicationBootstrapLimit ?? ACTION_DEDUPLICATION_BOOTSTRAP_LIMIT,
      'actionDeduplicationBootstrapLimit',
    );
    this.totalLimit = positiveInteger(
      options.actionDeduplicationTotalLimit ?? ACTION_DEDUPLICATION_TOTAL_LIMIT,
      'actionDeduplicationTotalLimit',
    );
  }

  get(actorKey: string, event: string, actionId: string): CachedActionResponse | undefined {
    const now = this.now();
    this.pruneActor(actorKey, now);
    return this.actors.get(actorKey)?.get(receiptKey(event, actionId));
  }

  assertCanStore(actorKey: string, event: string, actionId: string): void {
    const now = this.now();
    this.pruneAll(now);
    const actor = this.actors.get(actorKey);
    const key = receiptKey(event, actionId);
    if (actor?.has(key)) return;

    const actorLimit = actorKey.startsWith('bootstrap:') ? this.bootstrapLimit : this.limitPerActor;
    if ((actor?.size ?? 0) >= actorLimit || this.receiptCount() >= this.totalLimit) {
      throw new CachedEventError({
        code: 'IDEMPOTENCY_CAPACITY',
        message: 'Too many actions are awaiting safe retry. Try again after the retry window.',
      });
    }
  }

  set(
    actorKey: string,
    event: string,
    actionId: string,
    requestFingerprint: string,
    response: EventResponse<object>,
  ): void {
    let actor = this.actors.get(actorKey);
    if (!actor) {
      actor = new Map();
      this.actors.set(actorKey, actor);
    }
    actor.set(receiptKey(event, actionId), {
      expiresAt: this.now() + this.ttlMs,
      requestFingerprint,
      response,
    });
  }

  private pruneActor(actorKey: string, now: number): void {
    const actor = this.actors.get(actorKey);
    if (!actor) return;
    for (const [key, cached] of actor) {
      if (cached.expiresAt <= now) actor.delete(key);
    }
    if (actor.size === 0) this.actors.delete(actorKey);
  }

  private pruneAll(now: number): void {
    for (const actorKey of this.actors.keys()) this.pruneActor(actorKey, now);
  }

  private receiptCount(): number {
    let count = 0;
    for (const actor of this.actors.values()) count += actor.size;
    return count;
  }
}

function receiptKey(event: string, actionId: string): string {
  return `${event}:${actionId}`;
}

function fingerprintRequest(request: object): string {
  const { actionId: _actionId, ...payload } = request as Record<string, unknown>;
  return createHash('sha256').update(canonicalJson(payload)).digest('base64url');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
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
  if (error instanceof CachedEventError) return error.eventError;
  if (error instanceof RoomManagerError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof GameActionError) {
    return { code: 'INVALID_REQUEST', message: error.message };
  }

  if (isProtocolValidationError(error)) {
    return { code: 'INVALID_REQUEST', message: INVALID_REQUEST_MESSAGE };
  }

  const correlationId = randomUUID();
  console.error(`[Room Riot ${correlationId}] Unexpected realtime request failure.`, error);
  return { code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE, correlationId };
}

function isProtocolValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'ZodError' &&
    Array.isArray((error as Error & { readonly issues?: unknown }).issues)
  );
}
