import { randomInt, randomUUID } from 'node:crypto';

import {
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  SessionTokenSchema,
} from '@room-riot/contracts';
import type {
  CreateRoomRequest,
  ContentMode,
  JoinRoomRequest,
  PlayerId,
  RoomCode,
  RoomSettings,
  SessionToken,
} from '@room-riot/contracts';
import {
  GROUPTHINK_GAME_ID,
  GROUPTHINK_INPUT_DURATION_MS,
  advanceGroupthinkRound,
  allPlayersSubmitted,
  createGroupthinkSession,
  getGroupthinkPlayerView,
  getGroupthinkPublicView,
  loadGroupthinkPrompts,
  revealGroupthink,
  submitGroupthinkAnswer,
} from '@room-riot/groupthink';
import type {
  GroupthinkPlayerView,
  GroupthinkPrompt,
  GroupthinkPublicView,
  GroupthinkSessionState,
} from '@room-riot/groupthink';
import {
  HOT_TAKE_GAME_ID,
  HOT_TAKE_INPUT_DURATION_MS,
  HOT_TAKE_VOTING_DURATION_MS,
  advanceHotTakeRound,
  allHotTakePlayersSubmitted,
  allHotTakePlayersVoted,
  createHotTakeSession,
  getHotTakePlayerView,
  getHotTakePublicView,
  loadHotTakePrompts,
  revealHotTakeAnswers,
  revealHotTakeVotes,
  submitHotTakeAnswer,
  submitHotTakeVote,
} from '@room-riot/hot-take';
import type {
  HotTakePlayerView,
  HotTakePrompt,
  HotTakePublicView,
  HotTakeSessionState,
} from '@room-riot/hot-take';
import {
  addPlayerScores,
  addPlayer,
  createInitialRoomState,
  setGame,
  setPhase,
  setPlayerConnectionStatus,
  toPublicRoomState,
} from '@room-riot/game-engine';
import type { PublicRoomState, RoomState } from '@room-riot/game-engine';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 4;

export type SocketBinding =
  | { readonly kind: 'host'; readonly roomCode: RoomCode }
  | { readonly kind: 'player'; readonly roomCode: RoomCode; readonly playerId: PlayerId };

interface RoomSession {
  state: RoomState;
  groupthink?: GroupthinkSessionState;
  hotTake?: HotTakeSessionState;
  readonly hostToken: SessionToken;
  lastActivityAt: number;
  hostSocketId?: string;
  readonly playerTokens: Map<SessionToken, PlayerId>;
  readonly playerSocketIds: Map<PlayerId, string>;
}

export class RoomManagerError extends Error {
  constructor(
    readonly code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'ROOM_LIMIT' | 'UNAUTHORIZED' | 'INVALID_STATE',
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

export type PublicGameView = GroupthinkPublicView | HotTakePublicView;
export type PlayerGameView = GroupthinkPlayerView | HotTakePlayerView;

export interface RoomSnapshot {
  readonly state: PublicRoomState;
  readonly game: PublicGameView | null;
}

export interface PlayerGameUpdate {
  readonly snapshot: RoomSnapshot;
  readonly playerState: PlayerGameView | null;
}

export interface RoomManagerOptions {
  readonly groupthinkInputDurationMs?: number;
  readonly hotTakeInputDurationMs?: number;
  readonly hotTakeVotingDurationMs?: number;
  readonly maxRooms?: number;
  readonly roomIdleTtlMs?: number;
  readonly cleanupIntervalMs?: number;
  readonly randomizePrompts?: boolean;
}

export type RoomSnapshotListener = (roomCode: RoomCode, snapshot: RoomSnapshot) => void;

export class RoomManager {
  private readonly rooms = new Map<RoomCode, RoomSession>();
  private readonly socketBindings = new Map<string, SocketBinding>();
  private readonly groupthinkPrompts = new Map<ContentMode, readonly GroupthinkPrompt[]>();
  private readonly hotTakePrompts = new Map<ContentMode, readonly HotTakePrompt[]>();
  private readonly inputTimers = new Map<RoomCode, ReturnType<typeof setTimeout>>();
  private readonly snapshotListeners = new Set<RoomSnapshotListener>();
  private readonly groupthinkInputDurationMs: number;
  private readonly hotTakeInputDurationMs: number;
  private readonly hotTakeVotingDurationMs: number;
  private readonly maxRooms: number;
  private readonly roomIdleTtlMs: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly randomizePrompts: boolean;

  constructor(options: RoomManagerOptions = {}) {
    const groupthinkInputDurationMs =
      options.groupthinkInputDurationMs ?? GROUPTHINK_INPUT_DURATION_MS;
    const hotTakeInputDurationMs = options.hotTakeInputDurationMs ?? HOT_TAKE_INPUT_DURATION_MS;
    const hotTakeVotingDurationMs = options.hotTakeVotingDurationMs ?? HOT_TAKE_VOTING_DURATION_MS;
    const maxRooms = options.maxRooms ?? 1_000;
    const roomIdleTtlMs = options.roomIdleTtlMs ?? 6 * 60 * 60 * 1_000;
    const cleanupIntervalMs = options.cleanupIntervalMs ?? 60_000;
    const randomizePrompts = options.randomizePrompts ?? true;
    if (
      !Number.isInteger(groupthinkInputDurationMs) ||
      groupthinkInputDurationMs < 1 ||
      !Number.isInteger(hotTakeInputDurationMs) ||
      hotTakeInputDurationMs < 1 ||
      !Number.isInteger(hotTakeVotingDurationMs) ||
      hotTakeVotingDurationMs < 1 ||
      !Number.isInteger(maxRooms) ||
      maxRooms < 1 ||
      !Number.isInteger(roomIdleTtlMs) ||
      roomIdleTtlMs < 1 ||
      !Number.isInteger(cleanupIntervalMs) ||
      cleanupIntervalMs < 1
    ) {
      throw new Error('Game timers must be positive integers.');
    }
    this.groupthinkInputDurationMs = groupthinkInputDurationMs;
    this.hotTakeInputDurationMs = hotTakeInputDurationMs;
    this.hotTakeVotingDurationMs = hotTakeVotingDurationMs;
    this.maxRooms = maxRooms;
    this.roomIdleTtlMs = roomIdleTtlMs;
    this.randomizePrompts = randomizePrompts;
    this.cleanupTimer = setInterval(() => this.cleanupExpiredRooms(), cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }

  close(): void {
    clearInterval(this.cleanupTimer);
    this.inputTimers.forEach((timer) => clearTimeout(timer));
    this.inputTimers.clear();
  }

  subscribe(listener: RoomSnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  createRoom(input: CreateRoomRequest = {}): CreatedRoom {
    this.cleanupExpiredRooms();
    if (this.rooms.size >= this.maxRooms) {
      throw new RoomManagerError('ROOM_LIMIT', 'The server is at its active room limit.');
    }
    const request = CreateRoomRequestSchema.parse(input);
    const roomCode = this.createRoomCode();
    const hostToken = SessionTokenSchema.parse(randomUUID());
    const settings = normalizeSettings(request.settings);
    const now = Date.now();
    const initialState = createInitialRoomState({
      roomCode,
      now,
      ...(settings ? { settings } : {}),
    });
    const state: RoomState = request.gameId
      ? { ...initialState, gameId: request.gameId }
      : initialState;

    this.rooms.set(roomCode, {
      state,
      hostToken,
      lastActivityAt: now,
      playerTokens: new Map(),
      playerSocketIds: new Map(),
    });

    return {
      roomCode,
      hostToken,
      snapshot: this.getSnapshot(this.requireRoom(roomCode)),
    };
  }

  joinRoom(input: JoinRoomRequest): JoinedRoom {
    const request = JoinRoomRequestSchema.parse(input);
    const session = this.requireRoom(request.roomCode);

    if (request.playerToken) {
      const existingPlayerId = session.playerTokens.get(request.playerToken);
      if (existingPlayerId) {
        session.state = setPlayerConnectionStatus(session.state, existingPlayerId, 'connected');
        return {
          roomCode: session.state.roomCode,
          playerId: existingPlayerId,
          playerToken: request.playerToken,
          snapshot: this.getSnapshot(session),
          playerState: this.getPrivatePlayerState(session, existingPlayerId),
        };
      }
    }

    if (Object.keys(session.state.players).length >= session.state.settings.maxPlayers) {
      throw new RoomManagerError('ROOM_FULL', `Room ${session.state.roomCode} is full.`);
    }

    const playerId = PlayerIdSchemaFromUuid();
    const playerToken = SessionTokenSchema.parse(randomUUID());
    session.state = addPlayer(session.state, {
      id: playerId,
      name: request.name,
      avatar: request.avatar,
    });
    session.playerTokens.set(playerToken, playerId);

    return {
      roomCode: session.state.roomCode,
      playerId,
      playerToken,
      snapshot: this.getSnapshot(session),
      playerState: this.getPrivatePlayerState(session, playerId),
    };
  }

  startGame(roomCodeInput: string, hostTokenInput: string, gameId: string): RoomSnapshot {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const hostToken = SessionTokenSchema.parse(hostTokenInput);
    const session = this.requireRoom(roomCode);

    this.assertHost(session, hostToken);
    if (session.state.phase !== 'lobby') {
      throw new RoomManagerError('INVALID_STATE', 'A game can only be started from the lobby.');
    }
    if (gameId !== GROUPTHINK_GAME_ID && gameId !== HOT_TAKE_GAME_ID) {
      throw new RoomManagerError('INVALID_STATE', 'That game is not available.');
    }
    if (gameId === HOT_TAKE_GAME_ID && Object.keys(session.state.players).length < 3) {
      throw new RoomManagerError('INVALID_STATE', 'Hot Take requires at least three players.');
    }
    session.state = setGame(session.state, gameId);
    if (session.state.gameId === GROUPTHINK_GAME_ID) {
      delete session.hotTake;
      const prompts = this.getGroupthinkPrompts(session.state.settings.contentMode);
      session.groupthink = createGroupthinkSession(
        prompts,
        session.state.settings.roundCount,
        Date.now(),
        this.groupthinkInputDurationMs,
        this.randomizePrompts,
      );
      session.state = setPhase(session.state, 'input');
      this.scheduleGroupthinkDeadline(roomCode, session);
    } else if (session.state.gameId === HOT_TAKE_GAME_ID) {
      delete session.groupthink;
      const prompts = this.getHotTakePrompts(session.state.settings.contentMode);
      session.hotTake = createHotTakeSession(
        prompts,
        session.state.settings.roundCount,
        Date.now(),
        this.hotTakeInputDurationMs,
        this.randomizePrompts,
      );
      session.state = setPhase(session.state, 'input');
      this.scheduleHotTakeDeadline(roomCode, session);
    } else {
      delete session.groupthink;
      delete session.hotTake;
      this.clearGameDeadline(roomCode);
    }
    return this.getSnapshot(session);
  }

  reconnectHost(roomCodeInput: string, hostTokenInput: string): RoomSnapshot {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const hostToken = SessionTokenSchema.parse(hostTokenInput);
    const session = this.requireRoom(roomCode);

    this.assertHost(session, hostToken);
    return this.getSnapshot(session);
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
    session.state = setPlayerConnectionStatus(session.state, binding.playerId, 'disconnected');
    return this.getSnapshot(session);
  }

  getPlayerIdForToken(roomCodeInput: string, tokenInput: string): PlayerId {
    const roomCode = RoomCodeSchema.parse(roomCodeInput);
    const token = SessionTokenSchema.parse(tokenInput);
    const session = this.requireRoom(roomCode);
    const playerId = session.playerTokens.get(token);
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
    if (!session.state.players[playerId]) {
      throw new RoomManagerError('UNAUTHORIZED', 'Player session is not part of this room.');
    }
    session.groupthink = submitGroupthinkAnswer(game, playerId, answer, Date.now());

    const playerIds = Object.keys(session.state.players).map(PlayerIdSchemaFromInput);
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
  ): PlayerGameUpdate {
    const session = this.requireRoom(roomCodeInput);
    this.expireGameIfNeeded(session);
    const playerId = PlayerIdSchemaFromInput(playerIdInput);
    const targetPlayerId = targetPlayerIdInput
      ? PlayerIdSchemaFromInput(targetPlayerIdInput)
      : undefined;

    if (session.state.gameId === GROUPTHINK_GAME_ID) {
      if (targetPlayerId) {
        throw new RoomManagerError('INVALID_STATE', 'Groupthink does not accept player targets.');
      }
      return this.submitGroupthinkAnswer(roomCodeInput, playerId, answer);
    }

    if (session.state.gameId === HOT_TAKE_GAME_ID) {
      return this.submitHotTakeAnswer(roomCodeInput, playerId, answer, targetPlayerId);
    }

    throw new RoomManagerError('INVALID_STATE', 'This room is not running a playable game.');
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
    const playerIds = Object.keys(session.state.players).map(PlayerIdSchemaFromInput);
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
        this.hotTakeVotingDurationMs,
      );
      session.state = setPhase(session.state, 'voting');
      this.scheduleHotTakeDeadline(session.state.roomCode, session);
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
    const game = this.requireHotTake(session);
    const playerIds = Object.keys(session.state.players).map(PlayerIdSchemaFromInput);
    session.hotTake = submitHotTakeVote(game, playerId, entryId, Date.now());

    if (allHotTakePlayersVoted(session.hotTake, playerIds)) {
      session.hotTake = revealHotTakeVotes(session.hotTake);
      session.state = setPhase(session.state, 'results');
      this.clearGameDeadline(session.state.roomCode);
    }

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

    if (session.state.gameId === GROUPTHINK_GAME_ID) {
      return this.revealGroupthinkResults(roomCodeInput, hostTokenInput);
    }

    if (session.state.gameId !== HOT_TAKE_GAME_ID || !session.hotTake) {
      throw new RoomManagerError('INVALID_STATE', 'This room is not running a playable game.');
    }

    if (session.state.phase === 'input') {
      session.hotTake = revealHotTakeAnswers(
        session.hotTake,
        Date.now(),
        this.hotTakeVotingDurationMs,
      );
      if (Object.keys(session.hotTake.answers).length < 2) {
        session.hotTake = revealHotTakeVotes(session.hotTake);
        session.state = setPhase(session.state, 'results');
        this.clearGameDeadline(session.state.roomCode);
        return this.getSnapshot(session);
      }
      session.state = setPhase(session.state, 'voting');
      this.scheduleHotTakeDeadline(session.state.roomCode, session);
      return this.getSnapshot(session);
    }

    if (session.state.phase === 'voting') {
      session.hotTake = revealHotTakeVotes(session.hotTake);
      session.state = setPhase(session.state, 'results');
      this.clearGameDeadline(session.state.roomCode);
      return this.getSnapshot(session);
    }

    throw new RoomManagerError('INVALID_STATE', 'This round is not waiting for results.');
  }

  advanceGroupthink(roomCodeInput: string, hostTokenInput: string): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    const game = this.requireGroupthink(session);
    if (session.state.phase !== 'results') {
      throw new RoomManagerError('INVALID_STATE', 'Results must be revealed before scoring.');
    }

    session.state = addPlayerScores(session.state, game.roundScores);
    session.groupthink = advanceGroupthinkRound(
      game,
      this.getGroupthinkPrompts(session.state.settings.contentMode),
      Date.now(),
      this.groupthinkInputDurationMs,
    );
    session.state = setPhase(
      session.state,
      session.groupthink.status === 'complete' ? 'winner' : 'input',
    );
    if (session.groupthink.status === 'input') {
      this.scheduleGroupthinkDeadline(session.state.roomCode, session);
    } else {
      this.clearGameDeadline(session.state.roomCode);
    }
    return this.getSnapshot(session);
  }

  advanceRound(roomCodeInput: string, hostTokenInput: string): RoomSnapshot {
    const session = this.requireAuthorizedSession(roomCodeInput, hostTokenInput);
    if (session.state.gameId === GROUPTHINK_GAME_ID) {
      return this.advanceGroupthink(roomCodeInput, hostTokenInput);
    }
    if (session.state.gameId !== HOT_TAKE_GAME_ID || !session.hotTake) {
      throw new RoomManagerError('INVALID_STATE', 'This room is not running a playable game.');
    }
    if (session.state.phase !== 'results') {
      throw new RoomManagerError('INVALID_STATE', 'Results must be revealed before advancing.');
    }

    session.state = addPlayerScores(session.state, session.hotTake.roundScores);
    session.hotTake = advanceHotTakeRound(
      session.hotTake,
      this.getHotTakePrompts(session.state.settings.contentMode),
      Date.now(),
      this.hotTakeInputDurationMs,
    );
    session.state = setPhase(
      session.state,
      session.hotTake.status === 'complete' ? 'winner' : 'input',
    );
    if (session.hotTake.status === 'input') {
      this.scheduleHotTakeDeadline(session.state.roomCode, session);
    } else {
      this.clearGameDeadline(session.state.roomCode);
    }
    return this.getSnapshot(session);
  }

  private expireGameIfNeeded(session: RoomSession, now = Date.now()): void {
    if (session.groupthink?.status === 'input' && session.groupthink.inputDeadlineAt !== null) {
      if (now >= session.groupthink.inputDeadlineAt) {
        session.groupthink = revealGroupthink(session.groupthink);
        session.state = setPhase(session.state, 'results', now);
        this.clearGameDeadline(session.state.roomCode);
      }
      return;
    }

    const game = session.hotTake;
    if (!game) return;
    if (game.status === 'input' && game.inputDeadlineAt !== null && now >= game.inputDeadlineAt) {
      session.hotTake = revealHotTakeAnswers(game, now, this.hotTakeVotingDurationMs);
      if (Object.keys(session.hotTake.answers).length < 2) {
        session.hotTake = revealHotTakeVotes(session.hotTake);
        session.state = setPhase(session.state, 'results', now);
        this.clearGameDeadline(session.state.roomCode);
      } else {
        session.state = setPhase(session.state, 'voting', now);
        this.scheduleHotTakeDeadline(session.state.roomCode, session);
      }
      return;
    }

    if (
      game.status === 'voting' &&
      game.votingDeadlineAt !== null &&
      now >= game.votingDeadlineAt
    ) {
      session.hotTake = revealHotTakeVotes(game);
      session.state = setPhase(session.state, 'results', now);
      this.clearGameDeadline(session.state.roomCode);
    }
  }

  private scheduleGroupthinkDeadline(roomCode: RoomCode, session: RoomSession): void {
    this.clearGameDeadline(roomCode);
    const deadlineAt = session.groupthink?.inputDeadlineAt;
    if (!deadlineAt || session.groupthink?.status !== 'input') return;

    const timer = setTimeout(
      () => {
        const current = this.rooms.get(roomCode);
        if (
          !current ||
          current.groupthink?.status !== 'input' ||
          current.groupthink.inputDeadlineAt !== deadlineAt
        ) {
          return;
        }

        current.groupthink = revealGroupthink(current.groupthink);
        current.state = setPhase(current.state, 'results');
        this.inputTimers.delete(roomCode);
        this.notifySnapshotListeners(roomCode, this.getSnapshot(current));
      },
      Math.max(0, deadlineAt - Date.now()),
    );
    timer.unref?.();
    this.inputTimers.set(roomCode, timer);
  }

  private scheduleHotTakeDeadline(roomCode: RoomCode, session: RoomSession): void {
    this.clearGameDeadline(roomCode);
    const game = session.hotTake;
    const deadlineAt =
      game?.status === 'input'
        ? game.inputDeadlineAt
        : game?.status === 'voting'
          ? game.votingDeadlineAt
          : null;
    if (!deadlineAt || !game || (game.status !== 'input' && game.status !== 'voting')) return;

    const status = game.status;
    const timer = setTimeout(
      () => {
        const current = this.rooms.get(roomCode);
        if (
          !current ||
          current.hotTake?.status !== status ||
          (status === 'input'
            ? current.hotTake.inputDeadlineAt
            : current.hotTake.votingDeadlineAt) !== deadlineAt
        ) {
          return;
        }

        if (status === 'input') {
          current.hotTake = revealHotTakeAnswers(
            current.hotTake,
            Date.now(),
            this.hotTakeVotingDurationMs,
          );
          if (Object.keys(current.hotTake.answers).length < 2) {
            current.hotTake = revealHotTakeVotes(current.hotTake);
            current.state = setPhase(current.state, 'results');
            this.inputTimers.delete(roomCode);
          } else {
            current.state = setPhase(current.state, 'voting');
            this.scheduleHotTakeDeadline(roomCode, current);
          }
        } else {
          current.hotTake = revealHotTakeVotes(current.hotTake);
          current.state = setPhase(current.state, 'results');
          this.inputTimers.delete(roomCode);
        }
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
    this.socketBindings.forEach((binding, socketId) => {
      if (binding.roomCode === roomCode) this.socketBindings.delete(socketId);
    });
    session.playerSocketIds.clear();
    delete session.hostSocketId;
  }

  private assertHost(session: RoomSession, hostToken: SessionToken): void {
    if (session.hostToken !== hostToken) {
      throw new RoomManagerError('UNAUTHORIZED', 'Host authorization failed.');
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

  private getSnapshot(session: RoomSession): RoomSnapshot {
    const playerNames = Object.fromEntries(
      Object.values(session.state.players).map((player) => [player.id, player.name]),
    );
    return {
      state: toPublicRoomState(session.state),
      game:
        session.groupthink && session.state.gameId === GROUPTHINK_GAME_ID
          ? getGroupthinkPublicView(session.groupthink, Object.keys(session.state.players).length)
          : session.hotTake && session.state.gameId === HOT_TAKE_GAME_ID
            ? getHotTakePublicView(
                session.hotTake,
                Object.keys(session.state.players).length,
                playerNames,
              )
            : null,
    };
  }

  private getPrivatePlayerState(session: RoomSession, playerId: PlayerId): PlayerGameView | null {
    const playerNames = Object.fromEntries(
      Object.values(session.state.players).map((player) => [player.id, player.name]),
    );
    if (session.groupthink && session.state.gameId === GROUPTHINK_GAME_ID) {
      return getGroupthinkPlayerView(session.groupthink, playerId);
    }
    if (session.hotTake && session.state.gameId === HOT_TAKE_GAME_ID) {
      return getHotTakePlayerView(session.hotTake, playerId, playerNames);
    }
    return null;
  }

  private getGroupthinkPrompts(contentMode: ContentMode): readonly GroupthinkPrompt[] {
    const cached = this.groupthinkPrompts.get(contentMode);
    if (cached) return cached;
    const prompts = loadGroupthinkPrompts(contentMode);
    this.groupthinkPrompts.set(contentMode, prompts);
    return prompts;
  }

  private getHotTakePrompts(contentMode: ContentMode): readonly HotTakePrompt[] {
    const cached = this.hotTakePrompts.get(contentMode);
    if (cached) return cached;
    const prompts = loadHotTakePrompts(contentMode);
    this.hotTakePrompts.set(contentMode, prompts);
    return prompts;
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

function normalizeSettings(
  settings: CreateRoomRequest['settings'],
): Partial<RoomSettings> | undefined {
  if (!settings) return undefined;

  const normalized: Partial<RoomSettings> = {};
  if (settings.maxPlayers !== undefined) normalized.maxPlayers = settings.maxPlayers;
  if (settings.roundCount !== undefined) normalized.roundCount = settings.roundCount;
  if (settings.contentMode !== undefined) normalized.contentMode = settings.contentMode;
  return normalized;
}

function PlayerIdSchemaFromUuid(): PlayerId {
  return PlayerIdSchemaFromInput(randomUUID());
}

function PlayerIdSchemaFromInput(input: string): PlayerId {
  return PlayerIdSchema.parse(input);
}
