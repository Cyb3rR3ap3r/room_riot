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

export const RoomPhaseSchema = z.enum([
  'lobby',
  'intro',
  'prompt',
  'input',
  'voting',
  'results',
  'scoring',
  'winner',
]);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

export const ContentModeSchema = z.enum(['family', 'standard', 'after-dark']);
export type ContentMode = z.infer<typeof ContentModeSchema>;

export const RoomSettingsSchema = z
  .object({
    maxPlayers: z.number().int().min(2).max(32).default(12),
    roundCount: z.number().int().min(1).max(20).default(5),
    contentMode: ContentModeSchema.default('standard'),
  })
  .strict();

export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const CreateRoomRequestSchema = z
  .object({
    gameId: GameIdSchema.optional(),
    settings: RoomSettingsSchema.partial().optional(),
  })
  .strict();

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const JoinRoomRequestSchema = z
  .object({
    roomCode: RoomCodeSchema,
    name: PlayerNameSchema,
    avatar: AvatarSchema,
    playerToken: SessionTokenSchema.optional(),
  })
  .strict();

export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

export const HostReconnectRequestSchema = z
  .object({
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
    roomCode: RoomCodeSchema,
    hostToken: SessionTokenSchema,
    gameId: GameIdSchema,
  })
  .strict();

export type HostStartGameRequest = z.infer<typeof HostStartGameRequestSchema>;

export const HostRoomActionRequestSchema = z
  .object({
    roomCode: RoomCodeSchema,
    hostToken: SessionTokenSchema,
  })
  .strict();

export type HostRoomActionRequest = z.infer<typeof HostRoomActionRequestSchema>;

export const PlayerSubmitAnswerRequestSchema = z
  .object({
    roomCode: RoomCodeSchema,
    playerToken: SessionTokenSchema,
    answer: z.string().trim().min(1).max(500),
    targetPlayerId: PlayerIdSchema.optional(),
  })
  .strict();

export type PlayerSubmitAnswerRequest = z.infer<typeof PlayerSubmitAnswerRequestSchema>;

export const PlayerCastVoteRequestSchema = z
  .object({
    roomCode: RoomCodeSchema,
    playerToken: SessionTokenSchema,
    entryId: z.string().trim().min(1).max(128),
  })
  .strict();

export type PlayerCastVoteRequest = z.infer<typeof PlayerCastVoteRequestSchema>;

export const ClientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('host_start_game') }).strict(),
  z.object({ type: z.literal('host_next_round') }).strict(),
  z.object({ type: z.literal('submit_answer'), answer: z.string().trim().max(500) }).strict(),
  z.object({ type: z.literal('cast_vote'), targetPlayerId: PlayerIdSchema }).strict(),
]);

export type ClientAction = z.infer<typeof ClientActionSchema>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = RoomSettingsSchema.parse({});
