import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import {
  DrawingDataSchema,
  type ContentMode,
  type DrawingData,
  type PlayerId,
} from '@room-riot/contracts';

export const BLANK_LINE_GAME_ID = 'blank-line' as const;
export const BLANK_LINE_MIN_PLAYERS = 3;
export const BLANK_LINE_MAX_PLAYERS = 10;
export const BLANK_LINE_TOTAL_CIRCUITS = 2 as const;
export const BLANK_LINE_DRAW_DURATION_MS = 25_000;
export const BLANK_LINE_VOTING_DURATION_MS = 45_000;
export const BLANK_LINE_POINTS_CORRECT_READ = 2;
export const BLANK_LINE_POINTS_ESCAPE = 3;
export const BLANK_LINE_MAX_POINTS_PER_STROKE = 96;

const BlankLineCategorySchema = z.enum(['creatures', 'objects', 'places', 'actions', 'wildcards']);

const PromptSchema = z
  .object({
    id: z.string().trim().min(1),
    text: z.string().trim().min(1).max(180),
    category: BlankLineCategorySchema,
  })
  .strict();

const PromptFileSchema = z
  .object({ prompts: z.array(PromptSchema).min(1) })
  .strict()
  .superRefine((file, context) => {
    const ids = new Set(file.prompts.map((prompt) => prompt.id));
    const texts = new Set(file.prompts.map((prompt) => normalizeText(prompt.text)));
    if (ids.size !== file.prompts.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Prompt IDs must be unique.' });
    }
    if (texts.size !== file.prompts.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Prompt text must be unique.' });
    }
  });

export type BlankLineCategory = z.infer<typeof BlankLineCategorySchema>;
export type BlankLineStatus = 'drawing' | 'voting' | 'results' | 'complete';

export interface BlankLinePrompt {
  readonly id: string;
  readonly text: string;
  readonly category: BlankLineCategory;
}

export interface BlankLineStrokeEntry {
  readonly playerId: PlayerId;
  readonly turnIndex: number;
  readonly circuit: number;
  readonly stroke: DrawingData['strokes'][number];
}

export interface BlankLineVoteSummary {
  readonly playerId: PlayerId;
  readonly count: number;
}

export interface BlankLineSessionState {
  readonly status: BlankLineStatus;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: BlankLinePrompt;
  readonly promptOrder: readonly string[];
  readonly usedPromptIds: readonly string[];
  readonly playerOrder: readonly PlayerId[];
  readonly blankOrder: readonly PlayerId[];
  readonly blankPlayerId: PlayerId;
  readonly turnIndex: number;
  readonly strokeTimeline: readonly BlankLineStrokeEntry[];
  readonly votes: Readonly<Record<PlayerId, PlayerId>>;
  readonly deadlineAt: number | null;
  readonly blankCaught: boolean | null;
  readonly roundScores: Readonly<Record<PlayerId, number>>;
}

export interface BlankLinePublicView {
  readonly id: typeof BLANK_LINE_GAME_ID;
  readonly status: BlankLineStatus;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: string | null;
  readonly promptId: string | null;
  readonly deadlineAt: number | null;
  readonly activePlayerId: PlayerId | null;
  readonly nextPlayerIds: readonly PlayerId[];
  readonly playerOrder: readonly PlayerId[];
  readonly circuit: number;
  readonly totalCircuits: typeof BLANK_LINE_TOTAL_CIRCUITS;
  readonly turnIndex: number;
  readonly totalTurns: number;
  readonly drawing: DrawingData;
  readonly strokeTimeline: readonly BlankLineStrokeEntry[];
  readonly submittedCount: number;
  readonly totalPlayers: number;
  readonly blankPlayerId: PlayerId | null;
  readonly blankCaught: boolean | null;
  readonly voteSummary: readonly BlankLineVoteSummary[];
  readonly roundScores: readonly { readonly playerId: PlayerId; readonly points: number }[];
}

export interface BlankLinePlayerView {
  readonly id: typeof BLANK_LINE_GAME_ID;
  readonly status: BlankLineStatus;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly deadlineAt: number | null;
  readonly task: 'draw' | 'vote' | 'wait';
  readonly instruction: string;
  readonly privatePrompt: string | null;
  readonly isBlank: boolean;
  readonly isActive: boolean;
  readonly hasSubmitted: boolean;
  readonly drawing: DrawingData;
  readonly candidatePlayerIds: readonly PlayerId[];
  readonly ownVotePlayerId: PlayerId | null;
}

const INK_COLORS = [
  '#9cf000',
  '#ff2ea6',
  '#26e6f2',
  '#ffe066',
  '#a66cff',
  '#ff7139',
  '#4d8dff',
  '#ff5f8f',
  '#6bf7bd',
  '#ffffff',
] as const;

export function loadBlankLinePrompts(contentMode: ContentMode): readonly BlankLinePrompt[] {
  const contentPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../content',
    `${contentMode}.json`,
  );
  return PromptFileSchema.parse(JSON.parse(readFileSync(contentPath, 'utf8'))).prompts;
}

export function createBlankLineSession(
  prompts: readonly BlankLinePrompt[],
  playerIds: readonly PlayerId[],
  totalRounds: number,
  now = Date.now(),
  drawDurationMs = BLANK_LINE_DRAW_DURATION_MS,
  randomize = false,
  avoidFirstPromptId?: string,
): BlankLineSessionState {
  assertPlayerCount(playerIds);
  if (!Number.isInteger(totalRounds) || totalRounds < 1) {
    throw new Error('Blank Line requires at least one round.');
  }
  assertPositiveDuration(drawDurationMs);
  const promptOrder = orderPrompts(prompts, randomize, avoidFirstPromptId);
  const prompt = promptOrder[0];
  if (!prompt) throw new Error('Blank Line requires at least one prompt.');
  const playerOrder = randomize ? shuffle([...playerIds]) : [...playerIds];
  const blankOrder = randomize ? shuffle([...playerIds]) : [...playerIds];
  return createRoundState({
    prompt,
    promptOrder,
    usedPromptIds: [prompt.id],
    playerOrder,
    blankOrder,
    roundNumber: 1,
    totalRounds,
    now,
    drawDurationMs,
  });
}

export function submitBlankLineStroke(
  session: BlankLineSessionState,
  playerId: PlayerId,
  drawingInput: DrawingData,
  now = Date.now(),
  drawDurationMs = BLANK_LINE_DRAW_DURATION_MS,
  votingDurationMs = BLANK_LINE_VOTING_DURATION_MS,
): BlankLineSessionState {
  if (session.status !== 'drawing') throw new Error('This round is not accepting strokes.');
  assertBeforeDeadline(session, now);
  assertPositiveDuration(drawDurationMs);
  assertPositiveDuration(votingDurationMs);
  const activePlayerId = getActivePlayerId(session);
  if (activePlayerId !== playerId) throw new Error('Only the active artist can draw now.');
  const parsed = DrawingDataSchema.safeParse(drawingInput);
  if (!parsed.success) throw new Error('Stroke data is invalid.');
  if (parsed.data.strokes.length !== 1) {
    throw new Error('Blank Line turns accept exactly one continuous stroke.');
  }
  const inputStroke = parsed.data.strokes[0]!;
  if (inputStroke.points.length < 2) throw new Error('A stroke needs at least two points.');
  if (inputStroke.points.length > BLANK_LINE_MAX_POINTS_PER_STROKE) {
    throw new Error(`A stroke can contain at most ${BLANK_LINE_MAX_POINTS_PER_STROKE} points.`);
  }
  const playerIndex = session.playerOrder.indexOf(playerId);
  const stroke = {
    ...inputStroke,
    color: INK_COLORS[playerIndex % INK_COLORS.length]!,
    width: Math.min(0.04, Math.max(0.008, inputStroke.width)),
  };
  const entry: BlankLineStrokeEntry = {
    playerId,
    turnIndex: session.turnIndex,
    circuit: Math.floor(session.turnIndex / session.playerOrder.length) + 1,
    stroke,
  };
  return advanceDrawingTurn(
    { ...session, strokeTimeline: [...session.strokeTimeline, entry] },
    now,
    drawDurationMs,
    votingDurationMs,
  );
}

export function submitBlankLineVote(
  session: BlankLineSessionState,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
  now = Date.now(),
): BlankLineSessionState {
  if (session.status !== 'voting') throw new Error('This round is not accepting votes.');
  assertBeforeDeadline(session, now);
  if (!session.playerOrder.includes(playerId)) throw new Error('This voter is not in the round.');
  if (!session.playerOrder.includes(targetPlayerId)) {
    throw new Error('That player is not in this round.');
  }
  if (playerId === targetPlayerId) throw new Error('You cannot vote for yourself.');
  if (session.votes[playerId] !== undefined) throw new Error('This player already voted.');
  const votes = { ...session.votes, [playerId]: targetPlayerId };
  const next = { ...session, votes };
  return session.playerOrder.every((id) => votes[id] !== undefined)
    ? revealBlankLineRound(next)
    : next;
}

export function revealBlankLineStep(
  session: BlankLineSessionState,
  now = Date.now(),
  drawDurationMs = BLANK_LINE_DRAW_DURATION_MS,
  votingDurationMs = BLANK_LINE_VOTING_DURATION_MS,
): BlankLineSessionState {
  if (session.status === 'drawing') {
    return advanceDrawingTurn(session, now, drawDurationMs, votingDurationMs);
  }
  if (session.status === 'voting') return revealBlankLineRound(session);
  throw new Error('This Blank Line round is not waiting for a reveal.');
}

export function expireBlankLineStep(
  session: BlankLineSessionState,
  now = Date.now(),
  drawDurationMs = BLANK_LINE_DRAW_DURATION_MS,
  votingDurationMs = BLANK_LINE_VOTING_DURATION_MS,
): BlankLineSessionState {
  if (session.deadlineAt === null || now < session.deadlineAt) return session;
  return revealBlankLineStep(session, now, drawDurationMs, votingDurationMs);
}

export function revealBlankLineRound(session: BlankLineSessionState): BlankLineSessionState {
  if (session.status !== 'voting') throw new Error('Voting must finish before the reveal.');
  const summary = summarizeVotes(session.playerOrder, session.votes);
  const highestCount = summary[0]?.count ?? 0;
  const highestPlayers = summary.filter(
    (entry) => entry.count === highestCount && highestCount > 0,
  );
  const blankCaught =
    highestPlayers.length === 1 && highestPlayers[0]?.playerId === session.blankPlayerId;
  const roundScores: Record<PlayerId, number> = {};
  for (const playerId of session.playerOrder) {
    if (playerId === session.blankPlayerId) {
      if (!blankCaught) roundScores[playerId] = BLANK_LINE_POINTS_ESCAPE;
      continue;
    }
    if (session.votes[playerId] === session.blankPlayerId) {
      roundScores[playerId] = BLANK_LINE_POINTS_CORRECT_READ;
    }
  }
  return {
    ...session,
    status: 'results',
    deadlineAt: null,
    blankCaught,
    roundScores,
  };
}

export function advanceBlankLineRound(
  session: BlankLineSessionState,
  prompts: readonly BlankLinePrompt[],
  activePlayerIds: readonly PlayerId[] = session.playerOrder,
  now = Date.now(),
  drawDurationMs = BLANK_LINE_DRAW_DURATION_MS,
): BlankLineSessionState {
  if (session.status !== 'results') throw new Error('Results must be revealed before advancing.');
  if (session.roundNumber >= session.totalRounds) {
    return { ...session, status: 'complete', deadlineAt: null };
  }
  assertPlayerCount(activePlayerIds);
  assertPositiveDuration(drawDurationMs);
  const orderedPrompts = session.promptOrder
    .map((id) => prompts.find((prompt) => prompt.id === id))
    .filter((prompt): prompt is BlankLinePrompt => Boolean(prompt));
  const nextPrompt =
    orderedPrompts.find((prompt) => !session.usedPromptIds.includes(prompt.id)) ??
    prompts[session.roundNumber % prompts.length];
  if (!nextPrompt) throw new Error('Blank Line could not select the next prompt.');

  const retainedPlayers = session.playerOrder.filter((id) => activePlayerIds.includes(id));
  const addedPlayers = activePlayerIds.filter((id) => !retainedPlayers.includes(id));
  const nextPlayers = [...retainedPlayers, ...addedPlayers];
  const rotatedPlayers = [...nextPlayers.slice(1), nextPlayers[0]!];
  const retainedBlankOrder = session.blankOrder.filter((id) => activePlayerIds.includes(id));
  const addedBlankPlayers = activePlayerIds.filter((id) => !retainedBlankOrder.includes(id));
  const blankOrder = [...retainedBlankOrder, ...addedBlankPlayers];
  return createRoundState({
    prompt: nextPrompt,
    promptOrder: orderedPrompts.length ? orderedPrompts : prompts,
    usedPromptIds: [...session.usedPromptIds, nextPrompt.id],
    playerOrder: rotatedPlayers,
    blankOrder,
    roundNumber: session.roundNumber + 1,
    totalRounds: session.totalRounds,
    now,
    drawDurationMs,
  });
}

export function getBlankLinePublicView(session: BlankLineSessionState): BlankLinePublicView {
  const reveal = session.status === 'results' || session.status === 'complete';
  const drawing = drawingFromTimeline(session.strokeTimeline);
  const totalTurns = session.playerOrder.length * BLANK_LINE_TOTAL_CIRCUITS;
  return {
    id: BLANK_LINE_GAME_ID,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    prompt: reveal ? session.prompt.text : null,
    promptId: reveal ? session.prompt.id : null,
    deadlineAt: session.deadlineAt,
    activePlayerId: getActivePlayerId(session),
    nextPlayerIds: getNextPlayerIds(session),
    playerOrder: session.playerOrder,
    circuit:
      session.status === 'drawing'
        ? Math.min(
            BLANK_LINE_TOTAL_CIRCUITS,
            Math.floor(session.turnIndex / session.playerOrder.length) + 1,
          )
        : BLANK_LINE_TOTAL_CIRCUITS,
    totalCircuits: BLANK_LINE_TOTAL_CIRCUITS,
    turnIndex: session.turnIndex,
    totalTurns,
    drawing,
    strokeTimeline: session.strokeTimeline,
    submittedCount:
      session.status === 'drawing'
        ? session.strokeTimeline.length
        : Object.keys(session.votes).length,
    totalPlayers: session.playerOrder.length,
    blankPlayerId: reveal ? session.blankPlayerId : null,
    blankCaught: reveal ? session.blankCaught : null,
    voteSummary: reveal ? summarizeVotes(session.playerOrder, session.votes) : [],
    roundScores: reveal
      ? Object.entries(session.roundScores).map(([playerId, points]) => ({ playerId, points }))
      : [],
  };
}

export function getBlankLinePlayerView(
  session: BlankLineSessionState,
  playerId: PlayerId,
): BlankLinePlayerView {
  const isBlank = playerId === session.blankPlayerId;
  const isActive = session.status === 'drawing' && getActivePlayerId(session) === playerId;
  const ownVotePlayerId = session.votes[playerId] ?? null;
  const reveal = session.status === 'results' || session.status === 'complete';
  const task = isActive
    ? 'draw'
    : session.status === 'voting' && !ownVotePlayerId
      ? 'vote'
      : 'wait';
  return {
    id: BLANK_LINE_GAME_ID,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    deadlineAt: session.deadlineAt,
    task,
    instruction: instructionForPlayer(session, playerId, task),
    privatePrompt: isBlank && !reveal ? null : session.prompt.text,
    isBlank,
    isActive,
    hasSubmitted: session.status === 'voting' ? Boolean(ownVotePlayerId) : !isActive,
    drawing: drawingFromTimeline(session.strokeTimeline),
    candidatePlayerIds:
      session.status === 'voting' ? session.playerOrder.filter((id) => id !== playerId) : [],
    ownVotePlayerId,
  };
}

function createRoundState(input: {
  readonly prompt: BlankLinePrompt;
  readonly promptOrder: readonly BlankLinePrompt[];
  readonly usedPromptIds: readonly string[];
  readonly playerOrder: readonly PlayerId[];
  readonly blankOrder: readonly PlayerId[];
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly now: number;
  readonly drawDurationMs: number;
}): BlankLineSessionState {
  const blankPlayerId = input.blankOrder[(input.roundNumber - 1) % input.blankOrder.length];
  if (!blankPlayerId) throw new Error('Blank Line could not assign the Blank.');
  return {
    status: 'drawing',
    roundNumber: input.roundNumber,
    totalRounds: input.totalRounds,
    prompt: input.prompt,
    promptOrder: input.promptOrder.map((prompt) => prompt.id),
    usedPromptIds: input.usedPromptIds,
    playerOrder: input.playerOrder,
    blankOrder: input.blankOrder,
    blankPlayerId,
    turnIndex: 0,
    strokeTimeline: [],
    votes: {},
    deadlineAt: input.now + input.drawDurationMs,
    blankCaught: null,
    roundScores: {},
  };
}

function advanceDrawingTurn(
  session: BlankLineSessionState,
  now: number,
  drawDurationMs: number,
  votingDurationMs: number,
): BlankLineSessionState {
  const nextTurnIndex = session.turnIndex + 1;
  const totalTurns = session.playerOrder.length * BLANK_LINE_TOTAL_CIRCUITS;
  return nextTurnIndex >= totalTurns
    ? {
        ...session,
        status: 'voting',
        turnIndex: totalTurns,
        deadlineAt: now + votingDurationMs,
      }
    : { ...session, turnIndex: nextTurnIndex, deadlineAt: now + drawDurationMs };
}

function drawingFromTimeline(entries: readonly BlankLineStrokeEntry[]): DrawingData {
  return { strokes: entries.map((entry) => entry.stroke) };
}

function getActivePlayerId(session: BlankLineSessionState): PlayerId | null {
  if (session.status !== 'drawing') return null;
  return session.playerOrder[session.turnIndex % session.playerOrder.length] ?? null;
}

function getNextPlayerIds(session: BlankLineSessionState): readonly PlayerId[] {
  if (session.status !== 'drawing') return [];
  const totalTurns = session.playerOrder.length * BLANK_LINE_TOTAL_CIRCUITS;
  return [session.turnIndex + 1, session.turnIndex + 2]
    .filter((turnIndex) => turnIndex < totalTurns)
    .map((turnIndex) => session.playerOrder[turnIndex % session.playerOrder.length]!)
    .filter(Boolean);
}

function instructionForPlayer(
  session: BlankLineSessionState,
  playerId: PlayerId,
  task: BlankLinePlayerView['task'],
): string {
  if (task === 'draw') {
    return playerId === session.blankPlayerId
      ? 'You are the Blank. Add one convincing stroke without exposing that you have no topic.'
      : 'Add exactly one useful stroke. Show that you know the topic without giving it away.';
  }
  if (task === 'vote') return 'Talk it out, then privately vote for the player drawing blind.';
  if (session.status === 'drawing') return 'Watch the shared canvas and plan your next stroke.';
  if (session.status === 'voting')
    return 'Your ballot is sealed. Keep discussing while the room votes.';
  return 'The Blank and the hidden topic have been revealed.';
}

function summarizeVotes(
  playerOrder: readonly PlayerId[],
  votes: Readonly<Record<PlayerId, PlayerId>>,
): readonly BlankLineVoteSummary[] {
  const counts = new Map(playerOrder.map((playerId) => [playerId, 0]));
  Object.values(votes).forEach((target) => counts.set(target, (counts.get(target) ?? 0) + 1));
  return [...counts]
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((left, right) => right.count - left.count || left.playerId.localeCompare(right.playerId));
}

function orderPrompts(
  prompts: readonly BlankLinePrompt[],
  randomize: boolean,
  avoidFirstPromptId?: string,
): readonly BlankLinePrompt[] {
  if (!prompts.length) return [];
  const ordered = randomize ? shuffle([...prompts]) : [...prompts];
  if (avoidFirstPromptId && ordered[0]?.id === avoidFirstPromptId && ordered.length > 1) {
    const replacementIndex = ordered.findIndex((prompt) => prompt.id !== avoidFirstPromptId);
    if (replacementIndex > 0)
      [ordered[0], ordered[replacementIndex]] = [ordered[replacementIndex]!, ordered[0]!];
  }
  return ordered;
}

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [items[index], items[swapIndex]] = [items[swapIndex]!, items[index]!];
  }
  return items;
}

function assertPlayerCount(playerIds: readonly PlayerId[]): void {
  if (playerIds.length < BLANK_LINE_MIN_PLAYERS) {
    throw new Error(`Blank Line requires at least ${BLANK_LINE_MIN_PLAYERS} players.`);
  }
  if (playerIds.length > BLANK_LINE_MAX_PLAYERS) {
    throw new Error(`Blank Line supports at most ${BLANK_LINE_MAX_PLAYERS} players.`);
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('Blank Line player IDs must be unique.');
  }
}

function assertPositiveDuration(durationMs: number): void {
  if (!Number.isInteger(durationMs) || durationMs < 1) {
    throw new Error('Blank Line timers must be positive integers.');
  }
}

function assertBeforeDeadline(session: BlankLineSessionState, now: number): void {
  if (session.deadlineAt !== null && now >= session.deadlineAt) {
    throw new Error('The current Blank Line deadline has passed.');
  }
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}
