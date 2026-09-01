import { createHash, randomInt, randomUUID } from 'node:crypto';

import {
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  PlayerIdSchema,
  ROOM_RIOT_PROTOCOL_VERSION,
  RoomCodeSchema,
  SessionTokenSchema,
  SupportedGameIdSchema,
} from '@room-riot/contracts';
import type {
  CreateRoomRequest,
  DrawingData,
  JoinRoomRequest,
  PlayerId,
  RoomCode,
  RoomSettings,
  SessionToken,
  SupportedGameId,
} from '@room-riot/contracts';
import { revealBlankLineStep } from '@room-riot/blank-line';
import type { BlankLineSessionState } from '@room-riot/blank-line';
import { revealWavelengthStep } from '@room-riot/wavelength';
import type { WavelengthSessionState } from '@room-riot/wavelength';
import { DRAWN_OUT_GAME_ID, revealDrawnOutStep } from '@room-riot/drawn-out';
import type { DrawnOutSessionState } from '@room-riot/drawn-out';
import {
  GROUPTHINK_GAME_ID,
  advanceGroupthinkRound,
  allPlayersSubmitted,
  revealGroupthink,
  submitGroupthinkAnswer,
} from '@room-riot/groupthink';
import type { GroupthinkSessionState } from '@room-riot/groupthink';
import {
  HOT_TAKE_GAME_ID,
  allHotTakePlayersSubmitted,
  allHotTakePlayersVoted,
  revealHotTakeAnswers,
  revealHotTakeVotes,
  submitHotTakeAnswer,
} from '@room-riot/hot-take';
import type { HotTakeSessionState } from '@room-riot/hot-take';
import {
  SUSPECT_GAME_ID,
  allSuspectPlayersAnswered,
  allSuspectPlayersVoted,
  expireSuspectAlibi,
  revealSuspectAnswers,
  revealSuspectVotes,
  submitSuspectAnswer,
} from '@room-riot/suspect';
import type { SuspectSessionState } from '@room-riot/suspect';
import {
  addPlayerScores,
  addPlayer,
  createInitialRoomState,
  setGame,
  setPhase,
  setPaused,
  setPlayerReady,
  setPlayerConnectionStatus,
  toPublicRoomState,
} from '@room-riot/game-engine';
import type { PublicRoomState, RoomState } from '@room-riot/game-engine';
import { ServerGameRegistry } from './game-registry.js';
import type {
  GameActionContext,
  GameRuntimeSlots,
  GameTransition,
  PlayerGameView,
  PublicGameView,
} from './game-registry.js';
import { RoomPersistence } from './room-persistence.js';
import type { PersistedRoomRecord } from './room-persistence.js';
import type { OperationalMetrics } from './metrics.js';

export type { PlayerGameView, PublicGameView } from './game-registry.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

export type SocketBinding =
  | { readonly kind: 'host'; readonly roomCode: RoomCode }
  | { readonly kind: 'player'; readonly roomCode: RoomCode; readonly playerId: PlayerId };

interface RoomSession extends GameRuntimeSlots {
  state: RoomState;
  roundPlayerIds: readonly PlayerId[];
  snapshotRevision: number;
  snapshotFingerprint: string | null;
  readonly hostToken: SessionToken;
  readonly hostTokenHash: string;
  lastActivityAt: number;
  hostSocketId?: string;
  readonly playerTokens: Map<SessionToken, PlayerId>;
  readonly playerTokenHashes: Map<string, PlayerId>;
  readonly playerSocketIds: Map<PlayerId, string>;
}

interface PersistedRoomSession {
  readonly state: RoomState;
  readonly roundPlayerIds: readonly PlayerId[];
  readonly snapshotRevision: number;
  readonly snapshotFingerprint: string | null;
  readonly hostTokenHash: string;
  readonly lastActivityAt: number;
  readonly playerTokenHashes: readonly (readonly [string, PlayerId])[];
  readonly slots: GameRuntimeSlots;
}

const DEFAULT_RECONNECT_GRACE_MS = 15_000;

export class RoomManagerError extends Error {
  constructor(
    readonly code:
      | 'ROOM_NOT_FOUND'
      | 'ROOM_FULL'
      | 'ROOM_LIMIT'
      | 'PLAYER_LIMIT'
      | 'UNAUTHORIZED'
      | 'INVALID_STATE',
    message: string,
  ) {
    super(message);
    this.name = 'RoomManagerError';
  }
}

export interface CreatedRoom {
  readonly roomCode: RoomCode;
  readonly hostToken: SessionToken;
  readonly snapshot: RoomSnapshot;
}

export interface JoinedRoom {
  readonly roomCode: RoomCode;
  readonly playerId: PlayerId;
  readonly playerToken: SessionToken;
  readonly snapshot: RoomSnapshot;
  readonly playerState: PlayerGameView | null;
}

export interface RoomSnapshot {
  readonly protocolVersion: typeof ROOM_RIOT_PROTOCOL_VERSION;
  /** Monotonic room-local ordering for rejecting stale cached/reordered snapshots. */
  readonly revision: number;
  readonly state: PublicRoomState;
  readonly game: PublicGameView | null;
  readonly roster: {
    readonly roundPlayerIds: readonly PlayerId[];
    readonly queuedPlayerIds: readonly PlayerId[];
  };
}

export interface PlayerGameUpdate {
  readonly snapshot: RoomSnapshot;
  readonly playerState: PlayerGameView | null;
}

export interface RemovedPlayer {
  readonly roomCode: RoomCode;
  readonly playerId: PlayerId;
  readonly socketId: string | null;
  readonly snapshot: RoomSnapshot;
}

export interface ClosedRoom {
  readonly roomCode: RoomCode;
  readonly socketIds: readonly string[];
}

export interface RoomManagerOptions {
  readonly groupthinkInputDurationMs?: number;
  readonly hotTakeInputDurationMs?: number;
  readonly hotTakeVotingDurationMs?: number;
  readonly suspectInputDurationMs?: number;
  readonly suspectAlibiDurationMs?: number;
  readonly suspectVotingDurationMs?: number;
  readonly drawnOutTurnDurationMs?: number;
  readonly drawnOutGuessDurationMs?: number;
  readonly blankLineDrawDurationMs?: number;
  readonly blankLineVotingDurationMs?: number;
  readonly wavelengthClueDurationMs?: number;
  readonly wavelengthTuningDurationMs?: number;
  readonly wavelengthInterceptDurationMs?: number;
  readonly maxRooms?: number;
  readonly roomIdleTtlMs?: number;
  readonly cleanupIntervalMs?: number;
  readonly randomizePrompts?: boolean;
  /** Server-owned time in which an interrupted player may reclaim the same identity. */
  readonly reconnectGraceMs?: number;
  /** Optional SQLite path used for restart-safe room snapshots. */
  readonly persistencePath?: string;
  readonly metrics?: OperationalMetrics;
}

export interface RoomManagerOperationalStatus {
  readonly activeRooms: number;
  readonly activePlayers: number;
  readonly draining: boolean;
  readonly persistenceConfigured: boolean;
  readonly persistenceRecoveryIssues: number;
  readonly persistenceWriteFailures: number;
}

export type RoomSnapshotListener = (roomCode: RoomCode, snapshot: RoomSnapshot) => void;

export class RoomManager {
  private readonly rooms = new Map<RoomCode, RoomSession>();
  private readonly socketBindings = new Map<string, SocketBinding>();
  private readonly gameRegistry: ServerGameRegistry;
  private readonly inputTimers = new Map<RoomCode, ReturnType<typeof setTimeout>>();
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly snapshotListeners = new Set<RoomSnapshotListener>();
  private readonly maxRooms: number;
  private readonly roomIdleTtlMs: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly randomizePrompts: boolean;
  private readonly reconnectGraceMs: number;
  private readonly persistence: RoomPersistence | null;
  private readonly pendingPersistence = new Map<RoomCode, PersistedRoomRecord>();
  private readonly metrics: OperationalMetrics | undefined;
  private persistenceFlushTimer: ReturnType<typeof setImmediate> | null = null;
  private persistenceWriteFailures = 0;
  private draining = false;
  private persistenceRecoveryIssues = 0;

  constructor(options: RoomManagerOptions = {}) {
    const maxRooms = options.maxRooms ?? 1_000;
    const roomIdleTtlMs = options.roomIdleTtlMs ?? 6 * 60 * 60 * 1_000;
    const cleanupIntervalMs = options.cleanupIntervalMs ?? 60_000;
    const randomizePrompts = options.randomizePrompts ?? true;
    const reconnectGraceMs = options.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS;
    if (
      !Number.isInteger(maxRooms) ||
      maxRooms < 1 ||
      !Number.isInteger(roomIdleTtlMs) ||
      roomIdleTtlMs < 1 ||
      !Number.isInteger(cleanupIntervalMs) ||
      cleanupIntervalMs < 1 ||
      !Number.isInteger(reconnectGraceMs) ||
      reconnectGraceMs < 0
    ) {
      throw new Error('Room limits and timers must be valid integers.');
    }
    this.gameRegistry = new ServerGameRegistry(options);
    this.maxRooms = maxRooms;
    this.roomIdleTtlMs = roomIdleTtlMs;
    this.randomizePrompts = randomizePrompts;
    this.reconnectGraceMs = reconnectGraceMs;
    this.metrics = options.metrics;
    this.persistence = options.persistencePath
      ? new RoomPersistence(options.persistencePath)
      : null;
    this.cleanupTimer = setInterval(() => this.cleanupExpiredRooms(), cleanupIntervalMs);
    this.cleanupTimer.unref?.();
    this.restorePersistedRooms();
  }

  close(): void {
    clearInterval(this.cleanupTimer);
    this.inputTimers.forEach((timer) => clearTimeout(timer));
    this.inputTimers.clear();
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();
    this.flushPendingPersistence();
    this.persistence?.close();
  }

  beginDrain(): void {
    this.draining = true;
  }

  getOperationalStatus(): RoomManagerOperationalStatus {
    return {
      activeRooms: this.rooms.size,
      activePlayers: [...this.rooms.values()].reduce(
        (total, session) =>
          total +
          Object.values(session.state.players).filter((player) => player.status !== 'removed')
            .length,
        0,
      ),
      draining: this.draining,
      persistenceConfigured: this.persistence !== null,
      persistenceRecoveryIssues: this.persistenceRecoveryIssues,
      persistenceWriteFailures: this.persistenceWriteFailures,
    };
  }

  subscribe(listener: RoomSnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  createRoom(input: CreateRoomRequest = {}): CreatedRoom {
    if (this.draining) {
      throw new RoomManagerError(
        'INVALID_STATE',
        'The server is shutting down; new rooms are disabled.',
      );
    }
    this.cleanupExpiredRooms();
    if (this.rooms.size >= this.maxRooms) {
      throw new RoomManagerError('ROOM_LIMIT', 'The server is at its active room limit.');
    }
    const request = CreateRoomRequestSchema.parse(input);
    const roomCode = this.createRoomCode();
    const hostToken = SessionTokenSchema.parse(randomUUID());
    const settings = normalizeSettings(request.settings) ?? {};
    if (request.gameId) {
      const limits = this.gameRegistry.playerLimits(
        request.gameId,
        settings.drawnOutMode ?? 'classic',
      );
      if (request.settings?.maxPlayers === undefined) {
        settings.maxPlayers = limits.maximum;
      }
    }
    const now = Date.now();
    const initialState = createInitialRoomState({
      roomCode,
      now,
      settings,
    });
    if (request.gameId) this.assertSupportedRoomCapacity(request.gameId, initialState.settings);
    const state: RoomState = request.gameId
      ? { ...initialState, gameId: request.gameId }
      : initialState;

    this.rooms.set(roomCode, {
      state,
      roundPlayerIds: [],
      snapshotRevision: 0,
      snapshotFingerprint: null,
      hostToken,
      hostTokenHash: hashToken(hostToken),
      lastActivityAt: now,
      playerTokens: new Map(),
      playerTokenHashes: new Map(),
      playerSocketIds: new Map(),
    });
    logOperational('room_created', { roomCode });

    return {
      roomCode,
      hostToken,
      snapshot: this.getSnapshot(this.requireRoom(roomCode)),
    };
  }

  joinRoom(input: JoinRoomRequest): JoinedRoom {
    const request = JoinRoomRequestSchema.parse(input);
    const session = this.requireRoom(request.roomCode);
    if (this.draining && !request.playerToken) {
      throw new RoomManagerError(
        'INVALID_STATE',
        'The server is shutting down; new joins are disabled.',
      );
    }

    if (request.playerToken) {
      const existingPlayerId = this.getPlayerIdForSessionToken(session, request.playerToken);
      if (existingPlayerId) {
        this.cancelReconnectExpiry(session.state.roomCode, existingPlayerId);
        session.state = setPlayerConnectionStatus(session.state, existingPlayerId, 'connected');
        return {
          roomCode: session.state.roomCode,
          playerId: existingPlayerId,
          playerToken: request.playerToken,
          snapshot: this.getSnapshot(session),
          playerState: this.getPrivatePlayerState(session, existingPlayerId),
        };
      }
      throw new RoomManagerError('UNAUTHORIZED', 'Player session has expired or was revoked.');
    }

    if (
      Object.values(session.state.players).filter((player) => player.status !== 'removed').length >=
      session.state.settings.maxPlayers
    ) {
      throw new RoomManagerError('ROOM_FULL', `Room ${session.state.roomCode} is full.`);
    }

    if (session.state.settings.joinLocked) {
      throw new RoomManagerError('INVALID_STATE', 'The host has locked new joins for this room.');
    }

    const playerId = PlayerIdSchemaFromUuid();
    const playerToken = SessionTokenSchema.parse(randomUUID());
    session.state = addPlayer(session.state, {
      id: playerId,
      name: request.name,
      avatar: request.avatar,
    });
    session.playerTokens.set(playerToken, playerId);
    session.playerTokenHashes.set(hashToken(playerToken), playerId);

    return {
      roomCode: session.state.roomCode,
      playerId,
      playerToken,
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  startGame(roomCodeInput: string, hostTokenInput: string, gameIdInput: string): RoomSnapshot {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const hostToken = SessionTokenSchema.parse(hostTokenInput);
    const session = this.requireRoom(roomCode);

    this.assertHost(session, hostToken);
    if (session.state.phase !== 'lobby') {
      throw new RoomManagerError('INVALID_STATE', 'A game can only be started from the lobby.');
    }
    if (session.state.readinessRequired) {
      const activePlayerIds = Object.values(session.state.players)
        .filter((player) => player.status !== 'removed')
        .map((player) => player.id);
      const readyPlayerIds = new Set(session.state.readyPlayerIds);
      if (activePlayerIds.some((playerId) => !readyPlayerIds.has(playerId))) {
        throw new RoomManagerError(
          'INVALID_STATE',
          'Every connected player must confirm readiness before the rematch starts.',
        );
      }
    }
    const parsedGameId = SupportedGameIdSchema.safeParse(gameIdInput);
    if (!parsedGameId.success) {
      throw new RoomManagerError('INVALID_STATE', 'That game is not available.');
    }
    const gameId = parsedGameId.data;
    this.assertSupportedRoomCapacity(gameId, session.state.settings);
    this.assertSupportedPlayerCount(
      gameId,
      session.state.settings,
      Object.keys(session.state.players).length,
    );
    session.state = setGame(session.state, gameId);
    session.roundPlayerIds = Object.keys(session.state.players).map(PlayerIdSchemaFromInput);
    const phase = this.gameRegistry.start(
      gameId,
      session,
      this.getRoundPlayerIds(session),
      session.state.settings,
      this.randomizePrompts,
    );
    session.state = setPhase(session.state, phase);
    this.scheduleCurrentGameDeadline(roomCode, session);
    return this.getSnapshot(session);
  }

  setJoinLocked(roomCodeInput: string, hostTokenInput: string, locked: boolean): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    session.state = {
      ...session.state,
      settings: { ...session.state.settings, joinLocked: locked },
      updatedAt: Date.now(),
    };
    return this.getSnapshot(session);
  }

  setDrawingEnabled(roomCodeInput: string, hostTokenInput: string, enabled: boolean): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    session.state = {
      ...session.state,
      settings: { ...session.state.settings, drawingEnabled: enabled },
      updatedAt: Date.now(),
    };
    return this.getSnapshot(session);
  }

  setPaused(roomCodeInput: string, hostTokenInput: string, paused: boolean): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    if (session.state.phase === 'lobby' || session.state.phase === 'winner') {
      throw new RoomManagerError('INVALID_STATE', 'The room can only be paused during a game.');
    }
    if (session.state.paused === paused) return this.getSnapshot(session);

    const now = Date.now();
    if (paused) {
      this.clearGameDeadline(session.state.roomCode);
      session.state = setPaused(session.state, true, now);
      return this.getSnapshot(session);
    }

    const pauseStartedAt = session.state.pauseStartedAt;
    const elapsed = pauseStartedAt === null ? 0 : Math.max(0, now - pauseStartedAt);
    if (elapsed > 0) this.shiftGameDeadlines(session, elapsed);
    session.state = setPaused(session.state, false, now);
    this.scheduleCurrentGameDeadline(session.state.roomCode, session);
    return this.getSnapshot(session);
  }

  setPlayerReady(roomCodeInput: string, playerTokenInput: string, ready: boolean): RoomSnapshot {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const playerToken = SessionTokenSchema.parse(playerTokenInput);
    const session = this.requireRoom(roomCode);
    const playerId = this.getPlayerIdForToken(roomCode, playerToken);
    if (
      session.state.phase !== 'lobby' ||
      session.state.gameId === null ||
      !session.state.readinessRequired
    ) {
      throw new RoomManagerError(
        'INVALID_STATE',
        'Readiness is only available while a rematch is waiting to start.',
      );
    }
    session.state = setPlayerReady(session.state, playerId, ready);
    return this.getSnapshot(session);
  }

  skipDisconnected(roomCodeInput: string, hostTokenInput: string): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    const disconnected = Object.values(session.state.players).filter(
      (player) => player.status === 'disconnected',
    );
    if (disconnected.length === 0) {
      throw new RoomManagerError('INVALID_STATE', 'There are no disconnected players to skip.');
    }
    disconnected.forEach((player) => this.expireDisconnectedPlayer(session, player.id));
    if (!session.state.paused) this.expireGameIfNeeded(session, Date.now(), true);
    return this.getSnapshot(session);
  }

  rematch(
    roomCodeInput: string,
    hostTokenInput: string,
    gameIdInput: string,
    carryScores: boolean,
    settingsInput?: RoomSettingsPatch,
  ): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    if (session.state.phase !== 'winner') {
      throw new RoomManagerError(
        'INVALID_STATE',
        'A rematch is available after the winner screen.',
      );
    }
    const gameId = SupportedGameIdSchema.parse(gameIdInput);
    const nextSettings = {
      ...session.state.settings,
      ...normalizeSettings(settingsInput),
      joinLocked: false,
    };
    this.assertSupportedRoomCapacity(gameId, nextSettings);
    const now = Date.now();
    this.clearGameDeadline(session.state.roomCode);
    let state = createInitialRoomState({
      roomCode: session.state.roomCode,
      now,
      settings: nextSettings,
    });
    const previousPlayers = Object.values(session.state.players).filter(
      (player) => player.status !== 'removed',
    );
    this.assertSupportedPlayerCount(gameId, nextSettings, previousPlayers.length);
    for (const player of previousPlayers) {
      state = addPlayer(state, { id: player.id, name: player.name, avatar: player.avatar, now });
    }
    state = {
      ...setGame(state, gameId),
      phase: 'lobby',
      readyPlayerIds: [],
      readinessRequired: true,
      updatedAt: now,
    };
    if (carryScores) {
      state = {
        ...state,
        players: Object.fromEntries(
          previousPlayers.flatMap((player) => {
            const nextPlayer = state.players[player.id];
            return nextPlayer ? [[player.id, { ...nextPlayer, score: player.score }] as const] : [];
          }),
        ),
      };
    }
    session.state = state;
    session.roundPlayerIds = previousPlayers.map((player) => player.id);
    delete session.groupthink;
    delete session.hotTake;
    delete session.suspect;
    delete session.drawnOut;
    delete session.blankLine;
    delete session.wavelength;
    delete session.groupthinkPrompts;
    delete session.hotTakePrompts;
    delete session.suspectPrompts;
    delete session.drawnOutPrompts;
    delete session.blankLinePrompts;
    delete session.wavelengthPrompts;
    return this.getSnapshot(session);
  }

  reconnectHost(roomCodeInput: string, hostTokenInput: string): RoomSnapshot {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const hostToken = SessionTokenSchema.parse(hostTokenInput);
    const session = this.requireRoom(roomCode);

    this.assertHost(session, hostToken);
    return this.getSnapshot(session);
  }

  leavePlayer(roomCodeInput: string, playerTokenInput: string): RemovedPlayer {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const playerToken = SessionTokenSchema.parse(playerTokenInput);
    const session = this.requireRoom(roomCode);
    const playerId = this.getPlayerIdForSessionToken(session, playerToken);
    if (!playerId) throw new RoomManagerError('UNAUTHORIZED', 'Player authorization failed.');
    return this.removePlayer(session, playerId);
  }

  removePlayerByHost(
    roomCodeInput: string,
    hostTokenInput: string,
    playerIdInput: string,
  ): RemovedPlayer {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    if (!session.state.players[playerId] || session.state.players[playerId].status === 'removed') {
      throw new RoomManagerError('INVALID_STATE', 'That player is no longer in the room.');
    }
    return this.removePlayer(session, playerId);
  }

  closeRoom(roomCodeInput: string, hostTokenInput: string): ClosedRoom {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const hostToken = SessionTokenSchema.parse(hostTokenInput);
    const session = this.requireRoom(roomCode);
    this.assertHost(session, hostToken);
    const socketIds = [
      ...(session.hostSocketId ? [session.hostSocketId] : []),
      ...session.playerSocketIds.values(),
    ];
    this.removeRoom(roomCode, session);
    session.playerTokens.clear();
    session.playerTokenHashes.clear();
    logOperational('room_closed', { roomCode });
    return { roomCode, socketIds };
  }

  getRoomSnapshot(roomCodeInput: string): RoomSnapshot {
    return this.getSnapshot(this.requireRoom(roomCodeInput));
  }

  hasRoom(roomCodeInput: string): boolean {
    const parsed = RoomCodeSchema.safeParse(roomCodeInput);
    return parsed.success && this.rooms.has(parsed.data);
  }

  cleanupExpiredRooms(now = Date.now()): number {
    let removed = 0;
    this.rooms.forEach((session, roomCode) => {
      if (now - session.lastActivityAt < this.roomIdleTtlMs) return;
      this.removeRoom(roomCode, session);
      removed += 1;
    });
    return removed;
  }

  bindHost(roomCodeInput: string, hostTokenInput: string, socketId: string): RoomSnapshot {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const hostToken = SessionTokenSchema.parse(hostTokenInput);
    const session = this.requireRoom(roomCode);

    this.assertHost(session, hostToken);
    this.releaseSocket(socketId);
    if (session.hostSocketId && session.hostSocketId !== socketId) {
      this.socketBindings.delete(session.hostSocketId);
    }
    session.hostSocketId = socketId;
    this.socketBindings.set(socketId, { kind: 'host', roomCode });
    return this.getSnapshot(session);
  }

  bindPlayer(roomCodeInput: string, playerId: string, socketId: string): RoomSnapshot {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const session = this.requireRoom(roomCode);
    const parsedPlayerId = PlayerIdSchemaFromInput(playerId);

    if (!session.state.players[parsedPlayerId]) {
      throw new RoomManagerError('UNAUTHORIZED', 'Player session is not part of this room.');
    }

    if (session.state.players[parsedPlayerId]?.status === 'removed') {
      throw new RoomManagerError('UNAUTHORIZED', 'Player session has expired or was revoked.');
    }

    const currentBinding = this.socketBindings.get(socketId);
    if (
      !currentBinding ||
      currentBinding.kind !== 'player' ||
      currentBinding.roomCode !== roomCode ||
      currentBinding.playerId !== parsedPlayerId
    ) {
      this.releaseSocket(socketId);
    }
    const previousSocketId = session.playerSocketIds.get(parsedPlayerId);
    if (previousSocketId && previousSocketId !== socketId) {
      this.socketBindings.delete(previousSocketId);
    }
    session.playerSocketIds.set(parsedPlayerId, socketId);
    this.cancelReconnectExpiry(roomCode, parsedPlayerId);
    session.state = setPlayerConnectionStatus(session.state, parsedPlayerId, 'connected');
    this.socketBindings.set(socketId, {
      kind: 'player',
      roomCode,
      playerId: parsedPlayerId,
    });
    return this.getSnapshot(session);
  }

  disconnectSocket(socketId: string): RoomSnapshot | null {
    return this.releaseSocket(socketId);
  }

  /** Deterministic expiry hook used by cleanup and tests; production also schedules exact timers. */
  expireDisconnectedPlayers(now = Date.now()): number {
    let expired = 0;
    this.rooms.forEach((session) => {
      Object.values(session.state.players).forEach((player) => {
        if (
          player.status !== 'disconnected' ||
          player.reconnectDeadlineAt === null ||
          player.reconnectDeadlineAt > now
        ) {
          return;
        }
        this.expireDisconnectedPlayer(session, player.id);
        expired += 1;
      });
    });
    return expired;
  }

  getSocketBinding(socketId: string): SocketBinding | null {
    return this.socketBindings.get(socketId) ?? null;
  }

  getPlayerSocketId(roomCodeInput: string, playerIdInput: string): string | null {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    const session = this.requireRoom(roomCode);
    return session.playerSocketIds.get(playerId) ?? null;
  }

  getHostSocketId(roomCodeInput: string): string | null {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const session = this.requireRoom(roomCode);
    return session.hostSocketId ?? null;
  }

  assertPlayerSocket(roomCodeInput: string, playerIdInput: string, socketId: string): void {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    const binding = this.socketBindings.get(socketId);
    if (
      !binding ||
      binding.kind !== 'player' ||
      binding.roomCode !== roomCode ||
      binding.playerId !== playerId
    ) {
      throw new RoomManagerError('UNAUTHORIZED', 'Player socket is not authorized.');
    }
  }

  assertHostSocket(roomCodeInput: string, socketId: string): void {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const binding = this.socketBindings.get(socketId);
    if (!binding || binding.kind !== 'host' || binding.roomCode !== roomCode) {
      throw new RoomManagerError('UNAUTHORIZED', 'Host socket is not authorized.');
    }
  }

  private releaseSocket(socketId: string): RoomSnapshot | null {
    const binding = this.socketBindings.get(socketId);
    if (!binding) return null;

    this.socketBindings.delete(socketId);
    const session = this.rooms.get(binding.roomCode);
    if (!session) return null;

    if (binding.kind === 'host') {
      if (session.hostSocketId === socketId) delete session.hostSocketId;
      return null;
    }

    if (session.playerSocketIds.get(binding.playerId) !== socketId) return null;
    session.playerSocketIds.delete(binding.playerId);
    const now = Date.now();
    const reconnectDeadlineAt = now + this.reconnectGraceMs;
    session.state = setPlayerConnectionStatus(
      session.state,
      binding.playerId,
      'disconnected',
      now,
      reconnectDeadlineAt,
    );
    this.scheduleReconnectExpiry(session, binding.playerId, reconnectDeadlineAt);
    return this.getSnapshot(session);
  }

  getPlayerIdForToken(roomCodeInput: string, tokenInput: string): PlayerId {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const token = SessionTokenSchema.parse(tokenInput);
    const session = this.requireRoom(roomCode);
    const playerId = this.getPlayerIdForSessionToken(session, token);
    if (!playerId) throw new RoomManagerError('UNAUTHORIZED', 'Player authorization failed.');
    return playerId;
  }

  getPlayerState(roomCodeInput: string, playerIdInput: string): PlayerGameView | null {
    const session = this.requireRoom(roomCodeInput);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    return this.getPrivatePlayerState(session, playerId);
  }

  submitGroupthinkAnswer(
    roomCodeInput: string,
    playerIdInput: string,
    answer: string,
  ): PlayerGameUpdate {
    const session = this.requireRoom(roomCodeInput);
    this.expireGameIfNeeded(session);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    const game = this.requireGroupthink(session);
    this.assertActiveRoundPlayer(session, playerId);
    session.groupthink = submitGroupthinkAnswer(game, playerId, answer, Date.now());

    const playerIds = this.getRoundPlayerIds(session);
    if (allPlayersSubmitted(session.groupthink, playerIds)) {
      session.groupthink = revealGroupthink(session.groupthink);
      session.state = setPhase(session.state, 'results');
      this.clearGameDeadline(session.state.roomCode);
    }

    return {
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  submitAnswer(
    roomCodeInput: string,
    playerIdInput: string,
    answer: string,
    targetPlayerIdInput?: string,
    skip = false,
  ): PlayerGameUpdate {
    const session = this.requireRoom(roomCodeInput);
    this.expireGameIfNeeded(session);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    const targetPlayerId = targetPlayerIdInput
      ? PlayerIdSchemaFromInput(targetPlayerIdInput)
      : undefined;
    this.assertActiveRoundPlayer(session, playerId);
    const now = Date.now();
    const transition = this.gameRegistry.submitAnswer(
      session.state.gameId,
      this.getGameActionContext(session, now),
      playerId,
      answer,
      targetPlayerId,
      skip,
    );
    this.applyGameTransition(session, transition, now);
    return {
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  submitDrawing(
    roomCodeInput: string,
    playerIdInput: string,
    drawing: DrawingData,
  ): PlayerGameUpdate {
    const session = this.requireRoom(roomCodeInput);
    this.expireGameIfNeeded(session);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    this.assertActiveRoundPlayer(session, playerId);
    if (!session.state.settings.drawingEnabled) {
      throw new RoomManagerError('INVALID_STATE', 'Drawing input is disabled by the host.');
    }
    const now = Date.now();
    const transition = this.gameRegistry.submitDrawing(
      session.state.gameId,
      this.getGameActionContext(session, now),
      playerId,
      drawing,
    );
    this.applyGameTransition(session, transition, now);
    return {
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  submitSuspectAnswer(
    roomCodeInput: string,
    playerIdInput: string,
    answer: string,
  ): PlayerGameUpdate {
    const session = this.requireRoom(roomCodeInput);
    this.expireGameIfNeeded(session);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    const game = this.requireSuspect(session);
    this.assertActiveRoundPlayer(session, playerId);
    const normalized = answer.trim().toLowerCase();
    if (normalized !== 'yes' && normalized !== 'no') {
      throw new RoomManagerError('INVALID_STATE', 'Suspect answers must be Yes or No.');
    }
    session.suspect = submitSuspectAnswer(game, playerId, normalized === 'yes', Date.now());
    const playerIds = this.getRoundPlayerIds(session);
    if (allSuspectPlayersAnswered(session.suspect, playerIds)) {
      session.suspect = revealSuspectAnswers(
        session.suspect,
        playerIds,
        Date.now(),
        this.gameRegistry.duration('suspect', 'alibi'),
        this.gameRegistry.duration('suspect', 'voting'),
      );
      session.state = setPhase(
        session.state,
        session.suspect.status === 'alibi' ? 'alibi' : 'voting',
      );
      this.scheduleCurrentGameDeadline(session.state.roomCode, session);
    }
    return {
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  submitSuspectAlibi(
    roomCodeInput: string,
    playerIdInput: string,
    alibi: string,
  ): PlayerGameUpdate {
    const session = this.requireRoom(roomCodeInput);
    this.expireGameIfNeeded(session);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    this.assertActiveRoundPlayer(session, playerId);
    const now = Date.now();
    const transition = this.gameRegistry.submitAlibi(
      session.state.gameId,
      this.getGameActionContext(session, now),
      playerId,
      alibi,
    );
    this.applyGameTransition(session, transition, now);
    return {
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  submitHotTakeAnswer(
    roomCodeInput: string,
    playerIdInput: string,
    answer: string,
    targetPlayerId?: PlayerId,
  ): PlayerGameUpdate {
    const session = this.requireRoom(roomCodeInput);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    const game = this.requireHotTake(session);
    this.assertActiveRoundPlayer(session, playerId);
    const playerIds = this.getRoundPlayerIds(session);
    session.hotTake = submitHotTakeAnswer(
      game,
      playerId,
      answer,
      targetPlayerId,
      playerIds,
      Date.now(),
    );

    if (allHotTakePlayersSubmitted(session.hotTake, playerIds)) {
      session.hotTake = revealHotTakeAnswers(
        session.hotTake,
        Date.now(),
        this.gameRegistry.duration('hot-take', 'voting'),
      );
      session.state = setPhase(session.state, 'voting');
      this.scheduleCurrentGameDeadline(session.state.roomCode, session);
    }

    return {
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  castVote(roomCodeInput: string, playerIdInput: string, entryId: string): PlayerGameUpdate {
    const session = this.requireRoom(roomCodeInput);
    this.expireGameIfNeeded(session);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    this.assertActiveRoundPlayer(session, playerId);
    const now = Date.now();
    const transition = this.gameRegistry.castVote(
      session.state.gameId,
      this.getGameActionContext(session, now),
      playerId,
      entryId,
    );
    this.applyGameTransition(session, transition, now);
    return {
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  castSuspectVote(roomCodeInput: string, playerIdInput: string, choice: string): PlayerGameUpdate {
    const session = this.requireRoom(roomCodeInput);
    this.expireGameIfNeeded(session);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    this.assertActiveRoundPlayer(session, playerId);
    const now = Date.now();
    const transition = this.gameRegistry.castVote(
      session.state.gameId,
      this.getGameActionContext(session, now),
      playerId,
      choice,
    );
    this.applyGameTransition(session, transition, now);
    return {
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  revealGroupthinkResults(roomCodeInput: string, hostTokenInput: string): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    const game = this.requireGroupthink(session);
    session.groupthink = revealGroupthink(game);
    session.state = setPhase(session.state, 'results');
    this.clearGameDeadline(session.state.roomCode);
    return this.getSnapshot(session);
  }

  revealResults(roomCodeInput: string, hostTokenInput: string): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    const now = Date.now();
    const transition = this.gameRegistry.reveal(
      session.state.gameId,
      this.getGameActionContext(session, now),
    );
    this.applyGameTransition(session, transition, now);
    return this.getSnapshot(session);
  }

  advanceGroupthink(roomCodeInput: string, hostTokenInput: string): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    const game = this.requireGroupthink(session);
    if (session.state.phase !== 'results') {
      throw new RoomManagerError('INVALID_STATE', 'Results must be revealed before scoring.');
    }

    this.applyRoundScores(session, game.roundScores);
    this.purgeRemovedPlayers(session);
    if (game.roundNumber < game.totalRounds) this.activateQueuedPlayers(session);
    session.groupthink = advanceGroupthinkRound(
      game,
      session.groupthinkPrompts ??
        this.gameRegistry.getGroupthinkPrompts(
          session.state.settings.contentMode,
          session.state.settings.promptMode,
        ),
      Date.now(),
      this.gameRegistry.duration('groupthink', 'input'),
    );
    session.state = setPhase(
      session.state,
      session.groupthink.status === 'complete' ? 'winner' : 'input',
    );
    if (session.groupthink.status === 'input') {
      this.scheduleCurrentGameDeadline(session.state.roomCode, session);
    } else {
      this.clearGameDeadline(session.state.roomCode);
    }
    return this.getSnapshot(session);
  }

  advanceRound(roomCodeInput: string, hostTokenInput: string): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    if (session.state.phase !== 'results') {
      throw new RoomManagerError('INVALID_STATE', 'Results must be revealed before advancing.');
    }
    const now = Date.now();
    const transition = this.gameRegistry.advance(
      session.state.gameId,
      this.getGameActionContext(session, now),
      (roundScores, hasNextRound) => {
        this.applyRoundScores(session, roundScores);
        this.purgeRemovedPlayers(session);
        if (hasNextRound) this.activateQueuedPlayers(session);
        return this.getRoundPlayerIds(session);
      },
    );
    this.applyGameTransition(session, transition, now);
    return this.getSnapshot(session);
  }

  private expireGameIfNeeded(session: RoomSession, now = Date.now(), force = false): void {
    if (session.state.paused && !force) return;
    if (!session.state.gameId) return;
    const deadlineAt = this.gameRegistry.deadlineAt(session.state.gameId, session);
    if (deadlineAt === null || now < deadlineAt) return;
    const transition = this.gameRegistry.expire(
      session.state.gameId,
      this.getGameActionContext(session, now),
    );
    this.applyGameTransition(session, transition, now);
  }

  private getGameActionContext(session: RoomSession, now: number): GameActionContext {
    if (session.state.paused) {
      throw new RoomManagerError('INVALID_STATE', 'The host has paused this room.');
    }
    return {
      slots: session,
      playerIds: this.getRoundPlayerIds(session),
      playerNames: Object.fromEntries(
        Object.values(session.state.players).map((player) => [player.id, player.name]),
      ),
      settings: session.state.settings,
      now,
    };
  }

  private shiftGameDeadlines(session: RoomSession, elapsedMs: number): void {
    const keys = [
      'groupthink',
      'hotTake',
      'suspect',
      'drawnOut',
      'blankLine',
      'wavelength',
    ] as const;
    keys.forEach((key) => {
      const game = session[key];
      if (!game) return;
      const next = { ...game } as Record<string, unknown>;
      Object.entries(next).forEach(([field, value]) => {
        if (/deadlineAt$/i.test(field) && typeof value === 'number') {
          next[field] = value + elapsedMs;
        }
      });
      session[key] = next as never;
    });
  }

  private applyGameTransition(session: RoomSession, transition: GameTransition, now: number): void {
    const previousPhase = session.state.phase;
    session.state = setPhase(session.state, transition.phase, now);
    if (previousPhase !== transition.phase) {
      logOperational('phase_changed', {
        roomCode: session.state.roomCode,
        gameId: session.state.gameId,
        from: previousPhase,
        to: transition.phase,
      });
    }
    if (transition.scheduleDeadline) {
      this.scheduleCurrentGameDeadline(session.state.roomCode, session);
    } else {
      this.clearGameDeadline(session.state.roomCode);
    }
  }

  private scheduleCurrentGameDeadline(roomCode: RoomCode, session: RoomSession): void {
    this.clearGameDeadline(roomCode);
    if (session.state.paused) return;
    if (!session.state.gameId) return;
    const gameId = session.state.gameId;
    const deadlineAt = this.gameRegistry.deadlineAt(gameId, session);
    if (deadlineAt === null) return;
    const timer = setTimeout(
      () => {
        this.metrics?.observe('timer.drift_ms', Date.now() - deadlineAt);
        const current = this.rooms.get(roomCode);
        if (!current || current.state.gameId !== gameId) return;
        const currentDeadline = this.gameRegistry.deadlineAt(gameId, current);
        if (currentDeadline !== deadlineAt) return;
        const now = Date.now();
        const transition = this.gameRegistry.expire(
          gameId,
          this.getGameActionContext(current, now),
        );
        this.applyGameTransition(current, transition, now);
        this.notifySnapshotListeners(roomCode, this.getSnapshot(current));
      },
      Math.max(0, deadlineAt - Date.now()),
    );
    timer.unref?.();
    this.inputTimers.set(roomCode, timer);
  }

  private clearGameDeadline(roomCode: RoomCode): void {
    const timer = this.inputTimers.get(roomCode);
    if (!timer) return;
    clearTimeout(timer);
    this.inputTimers.delete(roomCode);
  }

  private notifySnapshotListeners(roomCode: RoomCode, snapshot: RoomSnapshot): void {
    this.snapshotListeners.forEach((listener) => listener(roomCode, snapshot));
  }

  private requireRoom(roomCodeInput: string): RoomSession {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const session = this.rooms.get(roomCode);
    if (!session) {
      throw new RoomManagerError('ROOM_NOT_FOUND', `Room ${roomCode} does not exist.`);
    }
    session.lastActivityAt = Date.now();
    return session;
  }

  private removeRoom(roomCode: RoomCode, session: RoomSession): void {
    this.clearGameDeadline(roomCode);
    this.rooms.delete(roomCode);
    this.persistence?.remove(roomCode);
    this.socketBindings.forEach((binding, socketId) => {
      if (binding.roomCode === roomCode) this.socketBindings.delete(socketId);
    });
    session.playerSocketIds.clear();
    Object.keys(session.state.players).forEach((playerId) =>
      this.cancelReconnectExpiry(roomCode, PlayerIdSchemaFromInput(playerId)),
    );
    delete session.hostSocketId;
  }

  private removePlayer(session: RoomSession, playerId: PlayerId): RemovedPlayer {
    const roomCode = session.state.roomCode;
    const player = session.state.players[playerId];
    if (!player || player.status === 'removed') {
      throw new RoomManagerError('UNAUTHORIZED', 'Player authorization failed.');
    }

    const socketId = session.playerSocketIds.get(playerId) ?? null;
    this.cancelReconnectExpiry(roomCode, playerId);
    if (socketId) this.socketBindings.delete(socketId);
    session.playerSocketIds.delete(playerId);
    for (const [token, tokenPlayerId] of session.playerTokens) {
      if (tokenPlayerId === playerId) session.playerTokens.delete(token);
    }
    for (const [tokenHash, tokenPlayerId] of session.playerTokenHashes) {
      if (tokenPlayerId === playerId) session.playerTokenHashes.delete(tokenHash);
    }

    if (session.roundPlayerIds.includes(playerId)) {
      session.state = setPlayerConnectionStatus(session.state, playerId, 'removed');
      this.reconcileRemovedRoundPlayer(session, playerId);
    } else {
      const players = { ...session.state.players };
      delete players[playerId];
      session.state = { ...session.state, players, updatedAt: Date.now() };
    }

    return { roomCode, playerId, socketId, snapshot: this.getSnapshot(session) };
  }

  private reconnectTimerKey(roomCode: RoomCode, playerId: PlayerId): string {
    return `${roomCode}:${playerId}`;
  }

  private cancelReconnectExpiry(roomCode: RoomCode, playerId: PlayerId): void {
    const key = this.reconnectTimerKey(roomCode, playerId);
    const timer = this.reconnectTimers.get(key);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(key);
  }

  private scheduleReconnectExpiry(
    session: RoomSession,
    playerId: PlayerId,
    reconnectDeadlineAt: number,
  ): void {
    const roomCode = session.state.roomCode;
    this.cancelReconnectExpiry(roomCode, playerId);
    const timer = setTimeout(
      () => {
        const current = this.rooms.get(roomCode);
        const player = current?.state.players[playerId];
        if (
          !current ||
          player?.status !== 'disconnected' ||
          player.reconnectDeadlineAt !== reconnectDeadlineAt
        ) {
          return;
        }
        const removed = this.expireDisconnectedPlayer(current, playerId);
        this.notifySnapshotListeners(roomCode, removed.snapshot);
      },
      Math.max(0, reconnectDeadlineAt - Date.now()),
    );
    timer.unref?.();
    this.reconnectTimers.set(this.reconnectTimerKey(roomCode, playerId), timer);
  }

  private expireDisconnectedPlayer(session: RoomSession, playerId: PlayerId): RemovedPlayer {
    const player = session.state.players[playerId];
    if (!player || player.status !== 'disconnected') {
      throw new RoomManagerError('INVALID_STATE', 'That player is no longer reconnecting.');
    }
    return this.removePlayer(session, playerId);
  }

  private reconcileRemovedRoundPlayer(session: RoomSession, playerId: PlayerId): void {
    const playerIds = this.getRoundPlayerIds(session);
    const now = Date.now();

    if (
      session.groupthink?.status === 'input' &&
      (playerIds.length === 0 || allPlayersSubmitted(session.groupthink, playerIds))
    ) {
      session.groupthink = revealGroupthink(session.groupthink);
      session.state = setPhase(session.state, 'results', now);
      this.clearGameDeadline(session.state.roomCode);
      return;
    }

    if (
      session.hotTake?.status === 'input' &&
      (playerIds.length === 0 || allHotTakePlayersSubmitted(session.hotTake, playerIds))
    ) {
      session.hotTake = revealHotTakeAnswers(
        session.hotTake,
        now,
        this.gameRegistry.duration('hot-take', 'voting'),
      );
      if (Object.keys(session.hotTake.answers).length < 2) {
        session.hotTake = revealHotTakeVotes(session.hotTake);
        session.state = setPhase(session.state, 'results', now);
        this.clearGameDeadline(session.state.roomCode);
      } else {
        session.state = setPhase(session.state, 'voting', now);
        this.scheduleCurrentGameDeadline(session.state.roomCode, session);
      }
      return;
    }

    if (session.hotTake?.status === 'voting') {
      const eligibleVoters = playerIds.filter(
        (id) =>
          session.hotTake?.answers[id] &&
          Object.keys(session.hotTake.answers).some((ownerId) => ownerId !== id),
      );
      if (eligibleVoters.length === 0 || allHotTakePlayersVoted(session.hotTake, playerIds)) {
        session.hotTake = revealHotTakeVotes(session.hotTake);
        session.state = setPhase(session.state, 'results', now);
        this.clearGameDeadline(session.state.roomCode);
      }
      return;
    }

    if (
      session.suspect?.status === 'input' &&
      (playerIds.length === 0 || allSuspectPlayersAnswered(session.suspect, playerIds))
    ) {
      session.suspect = revealSuspectAnswers(
        session.suspect,
        playerIds,
        now,
        this.gameRegistry.duration('suspect', 'alibi'),
        this.gameRegistry.duration('suspect', 'voting'),
      );
      session.state = setPhase(
        session.state,
        session.suspect.status === 'alibi' ? 'alibi' : 'voting',
        now,
      );
      this.scheduleCurrentGameDeadline(session.state.roomCode, session);
      return;
    }

    if (session.suspect?.status === 'alibi' && session.suspect.alibiPlayerId === playerId) {
      session.suspect = expireSuspectAlibi(
        session.suspect,
        now,
        this.gameRegistry.duration('suspect', 'voting'),
      );
      session.state = setPhase(session.state, 'voting', now);
      this.scheduleCurrentGameDeadline(session.state.roomCode, session);
      return;
    }

    if (
      session.suspect?.status === 'voting' &&
      (playerIds.length === 0 || allSuspectPlayersVoted(session.suspect, playerIds))
    ) {
      session.suspect = revealSuspectVotes(session.suspect);
      session.state = setPhase(session.state, 'results', now);
      this.clearGameDeadline(session.state.roomCode);
      return;
    }

    if (session.drawnOut) this.reconcileRemovedDrawnOutPlayer(session, playerId, now);
    if (session.blankLine) this.reconcileRemovedBlankLinePlayer(session, playerId, now);
    if (session.wavelength) this.reconcileRemovedWavelengthPlayer(session, playerId, now);
  }

  private reconcileRemovedDrawnOutPlayer(
    session: RoomSession,
    playerId: PlayerId,
    now: number,
  ): void {
    let game = this.requireDrawnOut(session);
    if (game.activePlayerId === playerId) {
      game = revealDrawnOutStep(
        game,
        now,
        this.gameRegistry.duration('drawn-out', 'turn'),
        this.gameRegistry.duration('drawn-out', 'guess'),
      );
    }
    for (let skipped = 0; skipped < game.playerOrder.length; skipped += 1) {
      const activePlayerId = game.activePlayerId;
      if (
        !activePlayerId ||
        session.state.players[activePlayerId]?.status !== 'removed' ||
        !['telephone', 'fake-drawing'].includes(game.status)
      ) {
        break;
      }
      game = revealDrawnOutStep(
        game,
        now,
        this.gameRegistry.duration('drawn-out', 'turn'),
        this.gameRegistry.duration('drawn-out', 'guess'),
      );
    }

    const activePlayers = this.getRoundPlayerIds(session);
    if (
      game.status === 'guessing' &&
      activePlayers
        .filter((id) => id !== game.artistPlayerId)
        .every((id) => game.guesses[id] !== undefined)
    ) {
      game = revealDrawnOutStep(
        game,
        now,
        this.gameRegistry.duration('drawn-out', 'turn'),
        this.gameRegistry.duration('drawn-out', 'guess'),
      );
    } else if (
      game.status === 'fake-voting' &&
      activePlayers.every((id) => game.votes[id] !== undefined)
    ) {
      game = revealDrawnOutStep(
        game,
        now,
        this.gameRegistry.duration('drawn-out', 'turn'),
        this.gameRegistry.duration('drawn-out', 'guess'),
      );
    }

    session.drawnOut = game;
    session.state = setPhase(session.state, drawnOutRoomPhase(game.status), now);
    if (game.status === 'results') this.clearGameDeadline(session.state.roomCode);
    else this.scheduleCurrentGameDeadline(session.state.roomCode, session);
  }

  private reconcileRemovedBlankLinePlayer(
    session: RoomSession,
    playerId: PlayerId,
    now: number,
  ): void {
    let game = session.blankLine;
    if (!game) return;
    const activePlayers = this.getRoundPlayerIds(session);
    if (activePlayers.length < 3) return;

    for (let skipped = 0; skipped < game.playerOrder.length * 2; skipped += 1) {
      const activePlayerId =
        game.status === 'drawing'
          ? game.playerOrder[game.turnIndex % game.playerOrder.length]
          : undefined;
      if (
        !activePlayerId ||
        (activePlayerId !== playerId && activePlayers.includes(activePlayerId))
      ) {
        break;
      }
      game = revealBlankLineStep(
        game,
        now,
        this.gameRegistry.duration('blank-line', 'turn'),
        this.gameRegistry.duration('blank-line', 'voting'),
      );
    }
    const currentVotes = game.votes;
    if (
      game.status === 'voting' &&
      activePlayers.every((activePlayerId) => currentVotes[activePlayerId] !== undefined)
    ) {
      game = revealBlankLineStep(
        game,
        now,
        this.gameRegistry.duration('blank-line', 'turn'),
        this.gameRegistry.duration('blank-line', 'voting'),
      );
    }
    session.blankLine = game;
    session.state = setPhase(session.state, blankLineRoomPhase(game.status), now);
    if (game.status === 'results') this.clearGameDeadline(session.state.roomCode);
    else this.scheduleCurrentGameDeadline(session.state.roomCode, session);
  }

  private reconcileRemovedWavelengthPlayer(
    session: RoomSession,
    playerId: PlayerId,
    now: number,
  ): void {
    let game = session.wavelength;
    if (!game || game.status === 'results' || game.status === 'complete') return;
    const activePlayers = this.getRoundPlayerIds(session);
    const broadcasterGone = game.status === 'clue' && game.broadcasterId === playerId;
    const remainingReceiversDone =
      game.status === 'tuning' &&
      game.receiverIds
        .filter((id) => activePlayers.includes(id))
        .every((id) => game?.markers[id] !== undefined);
    const remainingInterceptorsDone =
      game.status === 'intercept' &&
      game.interceptorIds
        .filter((id) => activePlayers.includes(id))
        .every((id) => game?.intercepts[id] !== undefined);
    if (broadcasterGone || remainingReceiversDone || remainingInterceptorsDone) {
      game = revealWavelengthStep(
        game,
        now,
        this.gameRegistry.duration('wavelength', 'turn'),
        this.gameRegistry.duration('wavelength', 'voting'),
      );
    }
    session.wavelength = game;
    session.state = setPhase(session.state, wavelengthRoomPhase(game.status), now);
    if (game.status === 'results') this.clearGameDeadline(session.state.roomCode);
    else this.scheduleCurrentGameDeadline(session.state.roomCode, session);
  }

  private getPlayerIdForSessionToken(
    session: RoomSession,
    token: SessionToken,
  ): PlayerId | undefined {
    return session.playerTokens.get(token) ?? session.playerTokenHashes.get(hashToken(token));
  }

  private restorePersistedRooms(): void {
    if (!this.persistence) return;
    const now = Date.now();
    for (const record of this.persistence.load()) {
      try {
        const value = JSON.parse(record.payload) as PersistedRoomSession;
        const roomCode = RoomCodeSchema.parse(value.state?.roomCode);
        if (
          roomCode !== record.roomCode ||
          !value.state ||
          typeof value.state.players !== 'object' ||
          value.state.players === null ||
          !value.hostTokenHash ||
          !Array.isArray(value.playerTokenHashes)
        ) {
          throw new Error('invalid persisted room shape');
        }
        if (now - value.lastActivityAt >= this.roomIdleTtlMs) {
          this.persistence.remove(roomCode);
          continue;
        }
        const persistedSettings = value.state.settings as Partial<RoomSettings>;
        const migratedState: RoomState = {
          ...value.state,
          paused: value.state.paused ?? false,
          pauseStartedAt: value.state.pauseStartedAt ?? null,
          readyPlayerIds: Array.isArray(value.state.readyPlayerIds)
            ? value.state.readyPlayerIds
            : [],
          readinessRequired: value.state.readinessRequired ?? false,
          settings: {
            ...persistedSettings,
            joinLocked: persistedSettings.joinLocked ?? false,
            drawingEnabled: persistedSettings.drawingEnabled ?? true,
          } as RoomSettings,
        };
        const session: RoomSession = {
          ...value.slots,
          state: migratedState,
          roundPlayerIds: value.roundPlayerIds,
          snapshotRevision: value.snapshotRevision,
          snapshotFingerprint: value.snapshotFingerprint,
          hostToken: SessionTokenSchema.parse(randomUUID()),
          hostTokenHash: value.hostTokenHash,
          lastActivityAt: value.lastActivityAt,
          playerTokens: new Map(),
          playerTokenHashes: new Map(value.playerTokenHashes),
          playerSocketIds: new Map(),
        };
        this.rooms.set(roomCode, session);
        this.scheduleCurrentGameDeadline(roomCode, session);
      } catch {
        this.persistenceRecoveryIssues += 1;
        console.warn(`[Room Riot] Ignoring incompatible persisted room ${record.roomCode}.`);
        this.persistence.remove(record.roomCode);
      }
    }
  }

  private persistSession(session: RoomSession): void {
    if (!this.persistence) return;
    const slots: GameRuntimeSlots = {};
    if (session.groupthink) slots.groupthink = session.groupthink;
    if (session.hotTake) slots.hotTake = session.hotTake;
    if (session.suspect) slots.suspect = session.suspect;
    if (session.drawnOut) slots.drawnOut = session.drawnOut;
    if (session.blankLine) slots.blankLine = session.blankLine;
    if (session.wavelength) slots.wavelength = session.wavelength;
    if (session.groupthinkPrompts) slots.groupthinkPrompts = session.groupthinkPrompts;
    if (session.hotTakePrompts) slots.hotTakePrompts = session.hotTakePrompts;
    if (session.suspectPrompts) slots.suspectPrompts = session.suspectPrompts;
    if (session.drawnOutPrompts) slots.drawnOutPrompts = session.drawnOutPrompts;
    if (session.blankLinePrompts) slots.blankLinePrompts = session.blankLinePrompts;
    if (session.wavelengthPrompts) slots.wavelengthPrompts = session.wavelengthPrompts;
    const payload: PersistedRoomSession = {
      state: session.state,
      roundPlayerIds: session.roundPlayerIds,
      snapshotRevision: session.snapshotRevision,
      snapshotFingerprint: session.snapshotFingerprint,
      hostTokenHash: session.hostTokenHash,
      lastActivityAt: session.lastActivityAt,
      playerTokenHashes: [...session.playerTokenHashes.entries()],
      slots,
    };
    this.pendingPersistence.set(session.state.roomCode, {
      roomCode: session.state.roomCode,
      payload: JSON.stringify(payload),
      updatedAt: Date.now(),
    });
    if (this.persistenceFlushTimer === null) {
      this.persistenceFlushTimer = setImmediate(() => {
        this.persistenceFlushTimer = null;
        this.flushPendingPersistence();
      });
      this.persistenceFlushTimer.unref?.();
    }
  }

  private flushPendingPersistence(): void {
    if (this.persistenceFlushTimer !== null) {
      clearImmediate(this.persistenceFlushTimer);
      this.persistenceFlushTimer = null;
    }
    if (!this.persistence || this.pendingPersistence.size === 0) return;
    const pending = [...this.pendingPersistence.values()];
    this.pendingPersistence.clear();
    for (const record of pending) {
      try {
        this.persistence.save(record);
      } catch {
        this.persistenceWriteFailures += 1;
        logOperational('persistence_write_failed', { roomCode: record.roomCode });
      }
    }
  }

  private assertHost(session: RoomSession, hostToken: SessionToken): void {
    if (session.hostTokenHash !== hashToken(hostToken)) {
      throw new RoomManagerError('UNAUTHORIZED', 'Host authorization failed.');
    }
  }

  private getRoundPlayerIds(session: RoomSession): readonly PlayerId[] {
    return session.roundPlayerIds.filter(
      (playerId) => session.state.players[playerId]?.status !== 'removed',
    );
  }

  private assertActiveRoundPlayer(session: RoomSession, playerId: PlayerId): void {
    if (!session.state.players[playerId] || session.state.players[playerId].status === 'removed') {
      throw new RoomManagerError('UNAUTHORIZED', 'Player session is not part of this room.');
    }
    if (!session.roundPlayerIds.includes(playerId)) {
      throw new RoomManagerError(
        'INVALID_STATE',
        'This player is spectating the current round and will join the next round.',
      );
    }
  }

  private activateQueuedPlayers(session: RoomSession): void {
    const nextRoundPlayerIds = Object.values(session.state.players)
      .filter((player) => player.status !== 'removed')
      .map((player) => player.id);
    const queuedPlayerIds = nextRoundPlayerIds.filter(
      (playerId) => !session.roundPlayerIds.includes(playerId),
    );
    if (queuedPlayerIds.length === 0) return;

    session.roundPlayerIds = nextRoundPlayerIds;
    if (session.drawnOut) {
      session.drawnOut = {
        ...session.drawnOut,
        playerOrder: [
          ...session.drawnOut.playerOrder.filter((playerId) =>
            nextRoundPlayerIds.includes(playerId),
          ),
          ...queuedPlayerIds,
        ],
      };
    }
  }

  private applyRoundScores(session: RoomSession, scores: Readonly<Record<string, number>>): void {
    const activeScores = Object.fromEntries(
      Object.entries(scores).filter(
        ([playerId]) => session.state.players[playerId]?.status !== 'removed',
      ),
    );
    session.state = addPlayerScores(session.state, activeScores);
  }

  private purgeRemovedPlayers(session: RoomSession): void {
    const players = Object.fromEntries(
      Object.entries(session.state.players).filter(([, player]) => player.status !== 'removed'),
    ) as RoomState['players'];
    session.state = { ...session.state, players, updatedAt: Date.now() };
    session.roundPlayerIds = session.roundPlayerIds.filter((playerId) =>
      Boolean(players[playerId]),
    );
    if (session.drawnOut) {
      session.drawnOut = {
        ...session.drawnOut,
        playerOrder: session.drawnOut.playerOrder.filter((playerId) => Boolean(players[playerId])),
      };
    }
  }

  private requireAuthorizedSession(roomCodeInput: string, hostTokenInput: string): RoomSession {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const hostToken = SessionTokenSchema.parse(hostTokenInput);
    const session = this.requireRoom(roomCode);
    this.assertHost(session, hostToken);
    return session;
  }

  private requireGroupthink(session: RoomSession): GroupthinkSessionState {
    if (session.state.gameId !== GROUPTHINK_GAME_ID || !session.groupthink) {
      throw new RoomManagerError('INVALID_STATE', 'This room is not running Groupthink.');
    }
    return session.groupthink;
  }

  private requireHotTake(session: RoomSession): HotTakeSessionState {
    if (session.state.gameId !== HOT_TAKE_GAME_ID || !session.hotTake) {
      throw new RoomManagerError('INVALID_STATE', 'This room is not running Hot Take.');
    }
    return session.hotTake;
  }

  private requireSuspect(session: RoomSession): SuspectSessionState {
    if (session.state.gameId !== SUSPECT_GAME_ID || !session.suspect) {
      throw new RoomManagerError('INVALID_STATE', 'This room is not running Suspect.');
    }
    return session.suspect;
  }

  private requireDrawnOut(session: RoomSession): DrawnOutSessionState {
    if (session.state.gameId !== DRAWN_OUT_GAME_ID || !session.drawnOut) {
      throw new RoomManagerError('INVALID_STATE', 'This room is not running Drawn Out.');
    }
    return session.drawnOut;
  }

  private getSnapshot(session: RoomSession): RoomSnapshot {
    const playerNames = Object.fromEntries(
      Object.values(session.state.players).map((player) => [player.id, player.name]),
    );
    const visibleState = {
      state: toPublicRoomState(session.state),
      roster: {
        roundPlayerIds: session.roundPlayerIds,
        queuedPlayerIds:
          session.state.phase === 'lobby'
            ? []
            : Object.keys(session.state.players)
                .map(PlayerIdSchemaFromInput)
                .filter(
                  (playerId) =>
                    session.state.players[playerId]?.status !== 'removed' &&
                    !session.roundPlayerIds.includes(playerId),
                ),
      },
      game: this.gameRegistry.publicView(session.state.gameId, {
        slots: session,
        playerIds: this.getRoundPlayerIds(session),
        playerNames,
      }),
    };
    const fingerprint = JSON.stringify(visibleState);
    if (session.snapshotFingerprint !== fingerprint) {
      session.snapshotRevision += 1;
      session.snapshotFingerprint = fingerprint;
    }
    const snapshot = {
      protocolVersion: ROOM_RIOT_PROTOCOL_VERSION,
      revision: session.snapshotRevision,
      ...visibleState,
    };
    this.persistSession(session);
    return snapshot;
  }

  private getPrivatePlayerState(session: RoomSession, playerId: PlayerId): PlayerGameView | null {
    if (!session.roundPlayerIds.includes(playerId)) return null;
    const playerNames = Object.fromEntries(
      Object.values(session.state.players).map((player) => [player.id, player.name]),
    );
    return this.gameRegistry.playerView(
      session.state.gameId,
      {
        slots: session,
        playerIds: this.getRoundPlayerIds(session),
        playerNames,
      },
      playerId,
    );
  }

  private assertSupportedRoomCapacity(gameId: SupportedGameId, settings: RoomSettings): void {
    const limits = this.gameRegistry.playerLimits(gameId, settings.drawnOutMode);
    if (settings.maxPlayers < limits.minimum || settings.maxPlayers > limits.maximum) {
      throw new RoomManagerError(
        'PLAYER_LIMIT',
        `${gameId} rooms support a capacity of ${limits.minimum} to ${limits.maximum} players.`,
      );
    }
  }

  private assertSupportedPlayerCount(
    gameId: SupportedGameId,
    settings: RoomSettings,
    playerCount: number,
  ): void {
    const limits = this.gameRegistry.playerLimits(gameId, settings.drawnOutMode);
    if (playerCount < limits.minimum || playerCount > limits.maximum) {
      throw new RoomManagerError(
        'PLAYER_LIMIT',
        `${gameId} requires ${limits.minimum} to ${limits.maximum} players; this room has ${playerCount}.`,
      );
    }
  }

  private createRoomCode(): RoomCode {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let candidate = '';
      for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        candidate += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length));
      }

      const roomCode = RoomCodeSchema.parse(candidate);
      if (!this.rooms.has(roomCode)) return roomCode;
    }

    throw new RoomManagerError('INVALID_STATE', 'Could not allocate a unique room code.');
  }
}

type RoomSettingsPatch = {
  [Key in keyof RoomSettings]?: RoomSettings[Key] | undefined;
};

function normalizeSettings(
  settings: RoomSettingsPatch | undefined,
): Partial<RoomSettings> | undefined {
  if (!settings) return undefined;

  const normalized: Partial<RoomSettings> = {};
  if (settings.maxPlayers !== undefined) normalized.maxPlayers = settings.maxPlayers;
  if (settings.joinLocked !== undefined) normalized.joinLocked = settings.joinLocked;
  if (settings.drawingEnabled !== undefined) normalized.drawingEnabled = settings.drawingEnabled;
  if (settings.roundCount !== undefined) normalized.roundCount = settings.roundCount;
  if (settings.contentMode !== undefined) normalized.contentMode = settings.contentMode;
  if (settings.promptMode !== undefined) normalized.promptMode = settings.promptMode;
  if (settings.drawnOutMode !== undefined) normalized.drawnOutMode = settings.drawnOutMode;
  if (settings.wavelengthMode !== undefined) normalized.wavelengthMode = settings.wavelengthMode;
  return normalized;
}

function drawnOutRoomPhase(
  status: DrawnOutSessionState['status'],
): 'input' | 'voting' | 'results' | 'winner' {
  if (status === 'guessing' || status === 'fake-voting') return 'voting';
  if (status === 'results') return 'results';
  if (status === 'complete') return 'winner';
  return 'input';
}

function blankLineRoomPhase(
  status: BlankLineSessionState['status'],
): 'input' | 'voting' | 'results' | 'winner' {
  if (status === 'voting') return 'voting';
  if (status === 'results') return 'results';
  if (status === 'complete') return 'winner';
  return 'input';
}

function wavelengthRoomPhase(
  status: WavelengthSessionState['status'],
): 'input' | 'voting' | 'results' | 'winner' {
  if (status === 'intercept') return 'voting';
  if (status === 'results') return 'results';
  if (status === 'complete') return 'winner';
  return 'input';
}

function PlayerIdSchemaFromUuid(): PlayerId {
  return PlayerIdSchemaFromInput(randomUUID());
}

function PlayerIdSchemaFromInput(input: string): PlayerId {
  return PlayerIdSchema.parse(input);
}

function hashToken(token: SessionToken): string {
  return createHash('sha256').update(token).digest('hex');
}

function logOperational(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...fields }));
}
