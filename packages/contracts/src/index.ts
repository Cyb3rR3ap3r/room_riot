import { z } from 'zod';

export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,6}$/, 'Room codes must be 4 to 6 alphanumeric characters.');

export type RoomCode = z.infer<typeof RoomCodeSchema>;

export const PlayerIdSchema = z.string().trim().min(1).max(64);
export type PlayerId = z.infer<typeof PlayerIdSchema>;

export const SessionTokenSchema = z.string().uuid();
export type SessionToken = z.infer<typeof SessionTokenSchema>;

/** A client-generated idempotency key for one logical mutation attempt. */
export const ActionIdSchema = z.string().uuid();
export type ActionId = z.infer<typeof ActionIdSchema>;

export const PlayerNameSchema = z.string().trim().min(1).max(24);
export type PlayerName = z.infer<typeof PlayerNameSchema>;

export const AvatarSchema = z.string().trim().min(1).max(32);
export type Avatar = z.infer<typeof AvatarSchema>;

export const GameIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{1,31}$/, 'Game IDs must be lowercase kebab-case.');
export type GameId = z.infer<typeof GameIdSchema>;

export const SupportedGameIdSchema = z.enum(['groupthink', 'hot-take', 'suspect', 'drawn-out']);
export type SupportedGameId = z.infer<typeof SupportedGameIdSchema>;

export const DrawnOutModeSchema = z.enum(['classic', 'telephone', 'fake-artist']);
export type DrawnOutMode = z.infer<typeof DrawnOutModeSchema>;

export interface GamePlayerLimits {
  readonly minimum: number;
  readonly recommended: number;
  readonly maximum: number;
}

/**
 * Product and server limits for every supported game. Drawn Out keeps an explicit entry for each
 * variant so a future mode can change capacity without introducing another source of truth.
 */
export const GAME_PLAYER_LIMITS = {
  groupthink: { minimum: 1, recommended: 4, maximum: 12 },
  'hot-take': { minimum: 3, recommended: 4, maximum: 12 },
  suspect: { minimum: 4, recommended: 6, maximum: 12 },
  'drawn-out': {
    classic: { minimum: 3, recommended: 4, maximum: 10 },
    telephone: { minimum: 3, recommended: 4, maximum: 10 },
    'fake-artist': { minimum: 3, recommended: 5, maximum: 10 },
  },
} as const satisfies Record<
  SupportedGameId,
  GamePlayerLimits | Record<DrawnOutMode, GamePlayerLimits>
>;

export function getGamePlayerLimits(
  gameId: SupportedGameId,
  drawnOutMode: DrawnOutMode = 'classic',
): GamePlayerLimits {
  return gameId === 'drawn-out'
    ? GAME_PLAYER_LIMITS[gameId][drawnOutMode]
    : GAME_PLAYER_LIMITS[gameId];
}

export const RoomPhaseSchema = z.enum([
  'lobby',
  'intro',
  'prompt',
  'input',
  'alibi',
  'voting',
  'results',
  'scoring',
  'winner',
]);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

export const ContentModeSchema = z.enum(['family', 'standard', 'after-dark']);
export type ContentMode = z.infer<typeof ContentModeSchema>;

/** Controls whether a room uses the curated prompt packs or the local AI remix generator. */
export const PromptModeSchema = z.enum(['default', 'ai']);
export type PromptMode = z.infer<typeof PromptModeSchema>;

export const RoomSettingsSchema = z
  .object({
    maxPlayers: z.number().int().min(1).max(32).default(12),
    roundCount: z.number().int().min(1).max(20).default(5),
    contentMode: ContentModeSchema.default('standard'),
    promptMode: PromptModeSchema.default('default'),
    drawnOutMode: DrawnOutModeSchema.default('classic'),
  })
  .strict();

export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const CreateRoomRequestSchema = z
  .object({
    gameId: SupportedGameIdSchema.optional(),
    settings: RoomSettingsSchema.partial().optional(),
  })
  .strict();

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const CreateRoomActionRequestSchema = CreateRoomRequestSchema.extend({
  actionId: ActionIdSchema,
});
export type CreateRoomActionRequest = z.infer<typeof CreateRoomActionRequestSchema>;

export const JoinRoomRequestSchema = z
  .object({
    roomCode: RoomCodeSchema,
    name: PlayerNameSchema,
    avatar: AvatarSchema,
    playerToken: SessionTokenSchema.optional(),
  })
  .strict();

export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

export const JoinRoomActionRequestSchema = JoinRoomRequestSchema.extend({
  actionId: ActionIdSchema,
});
export type JoinRoomActionRequest = z.infer<typeof JoinRoomActionRequestSchema>;

export const HostReconnectRequestSchema = z
  .object({
    actionId: ActionIdSchema,
    roomCode: RoomCodeSchema,
    hostToken: SessionTokenSchema,
  })
  .strict();

export type HostReconnectRequest = z.infer<typeof HostReconnectRequestSchema>;

export const DisplayWatchRequestSchema = z
  .object({
    roomCode: RoomCodeSchema,
  })
  .strict();

export type DisplayWatchRequest = z.infer<typeof DisplayWatchRequestSchema>;

export const HostStartGameRequestSchema = z
  .object({
    actionId: ActionIdSchema,
    roomCode: RoomCodeSchema,
    hostToken: SessionTokenSchema,
    gameId: SupportedGameIdSchema,
  })
  .strict();

export type HostStartGameRequest = z.infer<typeof HostStartGameRequestSchema>;

export const HostRoomActionRequestSchema = z
  .object({
    actionId: ActionIdSchema,
    roomCode: RoomCodeSchema,
    hostToken: SessionTokenSchema,
  })
  .strict();

export type HostRoomActionRequest = z.infer<typeof HostRoomActionRequestSchema>;

export const HostRemovePlayerRequestSchema = HostRoomActionRequestSchema.extend({
  playerId: PlayerIdSchema,
});

export type HostRemovePlayerRequest = z.infer<typeof HostRemovePlayerRequestSchema>;

export const PlayerLeaveRoomRequestSchema = z
  .object({
    actionId: ActionIdSchema,
    roomCode: RoomCodeSchema,
    playerToken: SessionTokenSchema,
  })
  .strict();

export type PlayerLeaveRoomRequest = z.infer<typeof PlayerLeaveRoomRequestSchema>;

export const PlayerSubmitAnswerRequestSchema = z
  .object({
    actionId: ActionIdSchema,
    roomCode: RoomCodeSchema,
    playerToken: SessionTokenSchema,
    answer: z.string().trim().min(1).max(500),
    targetPlayerId: PlayerIdSchema.optional(),
  })
  .strict();

export type PlayerSubmitAnswerRequest = z.infer<typeof PlayerSubmitAnswerRequestSchema>;

export const DrawingPointSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

export const DrawingStrokeSchema = z
  .object({
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    width: z.number().finite().min(0.002).max(0.08),
    points: z.array(DrawingPointSchema).min(1).max(256),
  })
  .strict();

export const DrawingDataSchema = z
  .object({
    strokes: z.array(DrawingStrokeSchema).max(160),
  })
  .strict();

export type DrawingData = z.infer<typeof DrawingDataSchema>;

export const PlayerSubmitDrawingRequestSchema = z
  .object({
    actionId: ActionIdSchema,
    roomCode: RoomCodeSchema,
    playerToken: SessionTokenSchema,
    drawing: DrawingDataSchema.refine(
      (drawing) => drawing.strokes.length <= 16,
      'A drawing turn can contain at most 16 strokes.',
    ),
  })
  .strict();

export type PlayerSubmitDrawingRequest = z.infer<typeof PlayerSubmitDrawingRequestSchema>;

export const PlayerSubmitAlibiRequestSchema = z
  .object({
    actionId: ActionIdSchema,
    roomCode: RoomCodeSchema,
    playerToken: SessionTokenSchema,
    alibi: z.string().trim().min(1).max(280),
  })
  .strict();

export type PlayerSubmitAlibiRequest = z.infer<typeof PlayerSubmitAlibiRequestSchema>;

export const PlayerCastVoteRequestSchema = z
  .object({
    actionId: ActionIdSchema,
    roomCode: RoomCodeSchema,
    playerToken: SessionTokenSchema,
    entryId: z.string().trim().min(1).max(128),
  })
  .strict();

export type PlayerCastVoteRequest = z.infer<typeof PlayerCastVoteRequestSchema>;

export const ExpectedEventErrorCodeSchema = z.enum([
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_LIMIT',
  'PLAYER_LIMIT',
  'UNAUTHORIZED',
  'INVALID_STATE',
  'INVALID_REQUEST',
  'IDEMPOTENCY_CONFLICT',
  'IDEMPOTENCY_CAPACITY',
]);
export type ExpectedEventErrorCode = z.infer<typeof ExpectedEventErrorCodeSchema>;

export const INVALID_REQUEST_MESSAGE = 'The request payload is invalid.' as const;
export const INTERNAL_ERROR_MESSAGE = 'The request could not be completed.' as const;

export type EventErrorDetail =
  | {
      readonly code: ExpectedEventErrorCode;
      readonly message: string;
    }
  | {
      readonly code: 'INTERNAL_ERROR';
      readonly message: typeof INTERNAL_ERROR_MESSAGE;
      readonly correlationId: string;
    };

export const EventErrorDetailSchema: z.ZodType<EventErrorDetail> = z.discriminatedUnion('code', [
  z
    .object({
      code: ExpectedEventErrorCodeSchema,
      message: z.string().trim().min(1).max(240),
    })
    .strict(),
  z
    .object({
      code: z.literal('INTERNAL_ERROR'),
      message: z.literal(INTERNAL_ERROR_MESSAGE),
      correlationId: z.string().uuid(),
    })
    .strict(),
]);

export interface EventError {
  readonly ok: false;
  readonly error: EventErrorDetail;
}

export const EventErrorSchema: z.ZodType<EventError> = z
  .object({
    ok: z.literal(false),
    error: EventErrorDetailSchema,
  })
  .strict();

export type EventResponse<T extends object> = ({ readonly ok: true } & T) | EventError;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = RoomSettingsSchema.parse({});

/** Increment when a deployed client and server can no longer safely exchange snapshots. */
export const ROOM_RIOT_PROTOCOL_VERSION = 1 as const;
export const ProtocolVersionSchema = z.literal(ROOM_RIOT_PROTOCOL_VERSION);
export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>;

export const PlayerConnectionStatusSchema = z.enum(['connected', 'disconnected', 'removed']);
export type PlayerConnectionStatus = z.infer<typeof PlayerConnectionStatusSchema>;

export const PublicPlayerStateSchema = z
  .object({
    id: PlayerIdSchema,
    name: PlayerNameSchema,
    avatar: AvatarSchema,
    status: PlayerConnectionStatusSchema,
    score: z.number().int().nonnegative(),
    disconnectedAt: z.number().int().nonnegative().nullable(),
    reconnectDeadlineAt: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type PublicPlayerState = z.infer<typeof PublicPlayerStateSchema>;

export const PublicRoomStateSchema = z
  .object({
    roomCode: RoomCodeSchema,
    phase: RoomPhaseSchema,
    gameId: SupportedGameIdSchema.nullable(),
    settings: RoomSettingsSchema,
    players: z.array(PublicPlayerStateSchema),
  })
  .strict();
export type PublicRoomState = z.infer<typeof PublicRoomStateSchema>;

const RoundScoreSchema = z
  .object({ playerId: PlayerIdSchema, points: z.number().int().nonnegative() })
  .strict();
const RoundFieldsSchema = {
  roundNumber: z.number().int().positive(),
  totalRounds: z.number().int().positive(),
} as const;
const PromptFieldsSchema = {
  prompt: z.string().min(1),
  promptId: z.string().min(1),
} as const;
const DeadlineSchema = z.number().int().nonnegative().nullable();

export const GroupthinkPublicViewSchema = z
  .object({
    id: z.literal('groupthink'),
    status: z.enum(['input', 'results', 'complete']),
    ...RoundFieldsSchema,
    ...PromptFieldsSchema,
    inputDeadlineAt: DeadlineSchema,
    submittedCount: z.number().int().nonnegative(),
    totalPlayers: z.number().int().nonnegative(),
    groups: z.array(
      z
        .object({
          answer: z.string().min(1),
          count: z.number().int().positive(),
          points: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    roundScores: z.array(RoundScoreSchema),
  })
  .strict();

export const GroupthinkPlayerViewSchema = z
  .object({
    id: z.literal('groupthink'),
    status: z.enum(['input', 'results', 'complete']),
    ...RoundFieldsSchema,
    ...PromptFieldsSchema,
    inputDeadlineAt: DeadlineSchema,
    hasSubmitted: z.boolean(),
    ownAnswer: z.string().min(1).nullable(),
  })
  .strict();

const HotTakeEntryViewSchema = z
  .object({
    entryId: z.string().min(1),
    answer: z.string().min(1),
    voteCount: z.number().int().nonnegative(),
    points: z.number().int().nonnegative(),
  })
  .strict();

export const HotTakePublicViewSchema = z
  .object({
    id: z.literal('hot-take'),
    status: z.enum(['input', 'voting', 'results', 'complete']),
    ...RoundFieldsSchema,
    ...PromptFieldsSchema,
    promptKind: z.enum(['open', 'player-targeted']),
    deadlineAt: DeadlineSchema,
    submittedCount: z.number().int().nonnegative(),
    totalPlayers: z.number().int().nonnegative(),
    entries: z.array(HotTakeEntryViewSchema),
    roundScores: z.array(RoundScoreSchema),
  })
  .strict();

export const HotTakePlayerViewSchema = z
  .object({
    id: z.literal('hot-take'),
    status: z.enum(['input', 'voting', 'results', 'complete']),
    ...RoundFieldsSchema,
    ...PromptFieldsSchema,
    promptKind: z.enum(['open', 'player-targeted']),
    deadlineAt: DeadlineSchema,
    hasSubmitted: z.boolean(),
    ownAnswer: z.string().min(1).nullable(),
    ownEntryId: z.string().min(1).nullable(),
    hasVoted: z.boolean(),
    entries: z.array(HotTakeEntryViewSchema),
  })
  .strict();

export const SuspectRoundTypeSchema = z.enum([
  'standard',
  'alibi',
  'double-trouble',
  'false-accusation',
  'most-likely',
]);

const SuspectVoteSummarySchema = z
  .object({
    targetPlayerIds: z.array(PlayerIdSchema).max(2),
    count: z.number().int().nonnegative(),
  })
  .strict();

export const SuspectPublicViewSchema = z
  .object({
    id: z.literal('suspect'),
    status: z.enum(['input', 'alibi', 'voting', 'results', 'complete']),
    ...RoundFieldsSchema,
    ...PromptFieldsSchema,
    roundType: SuspectRoundTypeSchema,
    deadlineAt: DeadlineSchema,
    submittedCount: z.number().int().nonnegative(),
    totalPlayers: z.number().int().nonnegative(),
    matchedCount: z.number().int().nonnegative(),
    selectedPlayerIds: z.array(PlayerIdSchema),
    alibiPlayerId: PlayerIdSchema.nullable(),
    alibiText: z.string().min(1).nullable(),
    voteSummary: z.array(SuspectVoteSummarySchema),
    roundScores: z.array(RoundScoreSchema),
  })
  .strict();

export const SuspectPlayerViewSchema = z
  .object({
    id: z.literal('suspect'),
    status: z.enum(['input', 'alibi', 'voting', 'results', 'complete']),
    ...RoundFieldsSchema,
    ...PromptFieldsSchema,
    roundType: SuspectRoundTypeSchema,
    deadlineAt: DeadlineSchema,
    hasSubmitted: z.boolean(),
    ownAnswer: z.boolean().nullable(),
    canSubmitAlibi: z.boolean(),
    ownAlibi: z.string().min(1).nullable(),
    alibiPlayerId: PlayerIdSchema.nullable(),
    hasVoted: z.boolean(),
    ownVoteTargetIds: z.array(PlayerIdSchema).max(2),
    candidatePlayerIds: z.array(PlayerIdSchema),
    selectedPlayerIds: z.array(PlayerIdSchema),
  })
  .strict();

export const DrawnOutStatusSchema = z.enum([
  'drawing',
  'guessing',
  'telephone',
  'fake-drawing',
  'fake-voting',
  'results',
  'complete',
]);

const DrawnOutPromptSchema = z
  .object({ id: z.string().min(1), text: z.string().min(1).max(180) })
  .strict();
const DrawnOutChainEntrySchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('phrase'), playerId: PlayerIdSchema, text: z.string().min(1) })
    .strict(),
  z
    .object({ kind: z.literal('description'), playerId: PlayerIdSchema, text: z.string().min(1) })
    .strict(),
  z
    .object({ kind: z.literal('drawing'), playerId: PlayerIdSchema, drawing: DrawingDataSchema })
    .strict(),
]);

export const DrawnOutPublicViewSchema = z
  .object({
    id: z.literal('drawn-out'),
    status: DrawnOutStatusSchema,
    mode: DrawnOutModeSchema,
    ...RoundFieldsSchema,
    prompt: z.string().min(1).nullable(),
    promptId: z.string().min(1).nullable(),
    deadlineAt: DeadlineSchema,
    artistPlayerId: PlayerIdSchema.nullable(),
    activePlayerId: PlayerIdSchema.nullable(),
    fakeArtistPlayerId: PlayerIdSchema.nullable(),
    drawing: DrawingDataSchema.nullable(),
    chain: z.array(DrawnOutChainEntrySchema),
    guesses: z.array(
      z
        .object({ playerId: PlayerIdSchema, text: z.string().min(1), correct: z.boolean() })
        .strict(),
    ),
    votes: z.array(
      z.object({ playerId: PlayerIdSchema, count: z.number().int().nonnegative() }).strict(),
    ),
    completedTurnCount: z.number().int().nonnegative(),
    guessCount: z.number().int().nonnegative(),
    voteCount: z.number().int().nonnegative(),
    submittedCount: z.number().int().nonnegative(),
    totalPlayers: z.number().int().nonnegative(),
    roundScores: z.array(RoundScoreSchema),
  })
  .strict();

export const DrawnOutPlayerViewSchema = z
  .object({
    id: z.literal('drawn-out'),
    status: DrawnOutStatusSchema,
    mode: DrawnOutModeSchema,
    ...RoundFieldsSchema,
    deadlineAt: DeadlineSchema,
    task: z.enum(['draw', 'describe', 'guess', 'vote', 'wait']),
    instruction: z.string().min(1),
    privatePrompt: z.string().min(1).nullable(),
    sourceDescription: z.string().min(1).nullable(),
    isFakeArtist: z.boolean(),
    hasSubmitted: z.boolean(),
    drawing: DrawingDataSchema.nullable(),
    candidatePlayerIds: z.array(PlayerIdSchema),
    guessOptions: z.array(DrawnOutPromptSchema),
    ownGuess: z.string().min(1).nullable(),
    ownVotePlayerId: PlayerIdSchema.nullable(),
  })
  .strict();

const PublicGameViewBaseSchema = z.discriminatedUnion('id', [
  GroupthinkPublicViewSchema,
  HotTakePublicViewSchema,
  SuspectPublicViewSchema,
  DrawnOutPublicViewSchema,
]);

export const PublicGameViewSchema = PublicGameViewBaseSchema.superRefine((view, context) => {
  if (view.id === 'groupthink' && view.status === 'input') {
    requireEmptyPublicFields(view, ['groups', 'roundScores'], context);
  }
  if (view.id === 'hot-take') {
    if (view.status === 'input') requireEmptyPublicFields(view, ['entries'], context);
    if (view.status === 'input' || view.status === 'voting') {
      requireEmptyPublicFields(view, ['roundScores'], context);
    }
  }
  if (view.id === 'suspect' && view.status !== 'results' && view.status !== 'complete') {
    if (view.matchedCount !== 0) addPrivacyIssue(context, 'matchedCount');
    requireEmptyPublicFields(view, ['selectedPlayerIds', 'voteSummary', 'roundScores'], context);
  }
  if (view.id === 'drawn-out' && view.status !== 'results' && view.status !== 'complete') {
    if (view.prompt !== null) addPrivacyIssue(context, 'prompt');
    if (view.promptId !== null) addPrivacyIssue(context, 'promptId');
    if (view.fakeArtistPlayerId !== null) addPrivacyIssue(context, 'fakeArtistPlayerId');
    requireEmptyPublicFields(view, ['chain', 'guesses', 'votes', 'roundScores'], context);
  }
});
export type PublicGameView = z.infer<typeof PublicGameViewSchema>;

export const PlayerGameViewSchema = z.discriminatedUnion('id', [
  GroupthinkPlayerViewSchema,
  HotTakePlayerViewSchema,
  SuspectPlayerViewSchema,
  DrawnOutPlayerViewSchema,
]);
export type PlayerGameView = z.infer<typeof PlayerGameViewSchema>;

export const RoomSnapshotSchema = z
  .object({
    protocolVersion: ProtocolVersionSchema,
    revision: z.number().int().positive(),
    state: PublicRoomStateSchema,
    game: PublicGameViewSchema.nullable(),
    roster: z
      .object({
        roundPlayerIds: z.array(PlayerIdSchema),
        queuedPlayerIds: z.array(PlayerIdSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.game && snapshot.state.gameId !== snapshot.game.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Room and game snapshot IDs do not match.',
        path: ['game', 'id'],
      });
    }
  });
export type RuntimeRoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const PlayerStateEnvelopeSchema = z
  .object({
    protocolVersion: ProtocolVersionSchema,
    roomCode: RoomCodeSchema,
    revision: z.number().int().positive(),
    state: PlayerGameViewSchema,
  })
  .strict();
export type PlayerStateEnvelope = z.infer<typeof PlayerStateEnvelopeSchema>;

function requireEmptyPublicFields(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  context: z.RefinementCtx,
): void {
  fields.forEach((field) => {
    const contents = value[field];
    if (Array.isArray(contents) && contents.length > 0) addPrivacyIssue(context, field);
  });
}

function addPrivacyIssue(context: z.RefinementCtx, field: string): void {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Private round data cannot appear in an unrevealed public view.',
    path: [field],
  });
}
