import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { ContentMode, PlayerId, WavelengthMode } from '@room-riot/contracts';

export const WAVELENGTH_GAME_ID = 'wavelength' as const;
export const WAVELENGTH_MIN_PLAYERS = 2;
export const WAVELENGTH_MAX_PLAYERS = 32;
export const WAVELENGTH_CLUE_DURATION_MS = 35_000;
export const WAVELENGTH_TUNING_DURATION_MS = 50_000;
export const WAVELENGTH_INTERCEPT_DURATION_MS = 25_000;
export const WAVELENGTH_MAX_CLUE_LENGTH = 80;

const CategorySchema = z.enum(['routines', 'things', 'culture', 'social', 'imagination']);
const PromptSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    left: z.string().trim().min(1).max(80),
    right: z.string().trim().min(1).max(80),
    category: CategorySchema,
  })
  .strict()
  .refine((prompt) => normalizeText(prompt.left) !== normalizeText(prompt.right), {
    message: 'Signal poles must be different.',
  });
const PromptFileSchema = z
  .object({ prompts: z.array(PromptSchema).length(100) })
  .strict()
  .superRefine((file, context) => {
    const ids = new Set(file.prompts.map((prompt) => prompt.id));
    const pairs = new Set(
      file.prompts.map((prompt) => `${normalizeText(prompt.left)}|${normalizeText(prompt.right)}`),
    );
    if (ids.size !== file.prompts.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Signal IDs must be unique.' });
    }
    if (pairs.size !== file.prompts.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Signal pairs must be unique.' });
    }
  });

export type WavelengthCategory = z.infer<typeof CategorySchema>;
export type WavelengthTeamId = 'cyan' | 'magenta';
export type WavelengthStatus = 'clue' | 'tuning' | 'intercept' | 'results' | 'complete';
export type WavelengthIntercept = 'low' | 'locked' | 'high';

export interface WavelengthPrompt {
  readonly id: string;
  readonly left: string;
  readonly right: string;
  readonly category: WavelengthCategory;
}

export interface WavelengthMarker {
  readonly playerId: PlayerId;
  readonly position: number;
  readonly confidence: 1 | 2 | 3;
}

export interface WavelengthRoundResult {
  readonly target: number;
  readonly consensus: number;
  readonly distance: number;
  readonly spread: number | null;
  readonly accuracyPoints: number;
  readonly syncBonus: number;
  readonly activeTeamPoints: number;
  readonly interceptPrediction: WavelengthIntercept | null;
  readonly interceptOutcome: WavelengthIntercept;
  readonly interceptCorrect: boolean;
  readonly interceptPoints: number;
}

export interface WavelengthSessionState {
  readonly mode: WavelengthMode;
  readonly status: WavelengthStatus;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: WavelengthPrompt;
  readonly promptOrder: readonly string[];
  readonly usedPromptIds: readonly string[];
  readonly playerOrder: readonly PlayerId[];
  readonly teams: Readonly<Record<WavelengthTeamId, readonly PlayerId[]>>;
  readonly activeTeamId: WavelengthTeamId | null;
  readonly broadcasterId: PlayerId;
  readonly receiverIds: readonly PlayerId[];
  readonly interceptorIds: readonly PlayerId[];
  readonly guestReceiverIds: readonly PlayerId[];
  readonly target: number;
  readonly clue: string | null;
  readonly markers: Readonly<Record<PlayerId, WavelengthMarker>>;
  readonly intercepts: Readonly<Record<PlayerId, WavelengthIntercept>>;
  readonly result: WavelengthRoundResult | null;
  readonly deadlineAt: number | null;
  readonly roomScore: number;
  readonly teamScores: Readonly<Record<WavelengthTeamId, number>>;
  readonly roundScores: Readonly<Record<PlayerId, number>>;
}

export interface WavelengthPublicView {
  readonly id: typeof WAVELENGTH_GAME_ID;
  readonly mode: WavelengthMode;
  readonly status: WavelengthStatus;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly totalPlayers: number;
  readonly promptId: string;
  readonly leftPole: string;
  readonly rightPole: string;
  readonly clue: string | null;
  readonly deadlineAt: number | null;
  readonly teams: Readonly<Record<WavelengthTeamId, readonly PlayerId[]>>;
  readonly activeTeamId: WavelengthTeamId | null;
  readonly broadcasterId: PlayerId;
  readonly receiverIds: readonly PlayerId[];
  readonly interceptorIds: readonly PlayerId[];
  readonly submittedCount: number;
  readonly expectedCount: number;
  readonly target: number | null;
  readonly consensus: number | null;
  readonly markers: readonly WavelengthMarker[];
  readonly result: WavelengthRoundResult | null;
  readonly roomScore: number;
  readonly teamScores: Readonly<Record<WavelengthTeamId, number>>;
  readonly roundScores: readonly { readonly playerId: PlayerId; readonly points: number }[];
}

export interface WavelengthPlayerView {
  readonly id: typeof WAVELENGTH_GAME_ID;
  readonly mode: WavelengthMode;
  readonly status: WavelengthStatus;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly leftPole: string;
  readonly rightPole: string;
  readonly clue: string | null;
  readonly deadlineAt: number | null;
  readonly teamId: WavelengthTeamId | null;
  readonly activeTeamId: WavelengthTeamId | null;
  readonly broadcasterId: PlayerId;
  readonly task: 'clue' | 'tune' | 'intercept' | 'wait';
  readonly instruction: string;
  readonly privateTarget: number | null;
  readonly ownMarker: WavelengthMarker | null;
  readonly ownIntercept: WavelengthIntercept | null;
  readonly isGuestReceiver: boolean;
  readonly hasSubmitted: boolean;
}

export function loadWavelengthPrompts(contentMode: ContentMode): readonly WavelengthPrompt[] {
  const contentPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../content',
    `${contentMode}.json`,
  );
  return PromptFileSchema.parse(JSON.parse(readFileSync(contentPath, 'utf8'))).prompts;
}

export function createWavelengthSession(
  prompts: readonly WavelengthPrompt[],
  playerIds: readonly PlayerId[],
  totalRounds: number,
  mode: WavelengthMode,
  now = Date.now(),
  clueDurationMs = WAVELENGTH_CLUE_DURATION_MS,
  randomize = false,
  avoidFirstPromptId?: string,
): WavelengthSessionState {
  assertPlayerCount(playerIds);
  assertDuration(clueDurationMs);
  if (!Number.isInteger(totalRounds) || totalRounds < 1) {
    throw new Error('WaveLength requires at least one round.');
  }
  const ordered = orderPrompts(prompts, randomize, avoidFirstPromptId);
  const prompt = ordered[0];
  if (!prompt) throw new Error('WaveLength requires at least one signal pair.');
  return createRound({
    mode,
    prompt,
    promptOrder: ordered,
    usedPromptIds: [prompt.id],
    playerOrder: [...playerIds],
    roundNumber: 1,
    totalRounds,
    now,
    clueDurationMs,
    roomScore: 0,
    teamScores: { cyan: 0, magenta: 0 },
    randomizeTarget: randomize,
  });
}

export function submitWavelengthClue(
  session: WavelengthSessionState,
  playerId: PlayerId,
  clueInput: string,
  now = Date.now(),
  tuningDurationMs = WAVELENGTH_TUNING_DURATION_MS,
): WavelengthSessionState {
  if (session.status !== 'clue') throw new Error('WaveLength is not accepting a clue now.');
  assertBeforeDeadline(session, now);
  assertDuration(tuningDurationMs);
  if (playerId !== session.broadcasterId)
    throw new Error('Only the Broadcaster can send the clue.');
  const clue = clueInput.trim().replace(/\s+/g, ' ');
  if (!clue || clue.length > WAVELENGTH_MAX_CLUE_LENGTH) {
    throw new Error(`Clues must be 1–${WAVELENGTH_MAX_CLUE_LENGTH} characters.`);
  }
  if (/\d/.test(clue)) throw new Error('Clues cannot contain numbers.');
  const words = new Set(normalizeText(clue).split(' ').filter(Boolean));
  const forbidden = [
    ...normalizeText(session.prompt.left).split(' '),
    ...normalizeText(session.prompt.right).split(' '),
  ];
  if (forbidden.some((word) => word.length > 2 && words.has(word))) {
    throw new Error('Clues cannot repeat words from either signal pole.');
  }
  return { ...session, status: 'tuning', clue, deadlineAt: now + tuningDurationMs };
}

export function submitWavelengthChoice(
  session: WavelengthSessionState,
  playerId: PlayerId,
  entryId: string,
  now = Date.now(),
  interceptDurationMs = WAVELENGTH_INTERCEPT_DURATION_MS,
): WavelengthSessionState {
  assertBeforeDeadline(session, now);
  assertDuration(interceptDurationMs);
  if (session.status === 'tuning') {
    if (!session.receiverIds.includes(playerId)) throw new Error('You are not tuning this signal.');
    if (session.markers[playerId]) throw new Error('Your receiver is already locked.');
    const marker = parseMarker(playerId, entryId);
    const next = { ...session, markers: { ...session.markers, [playerId]: marker } };
    return session.receiverIds.every((id) => next.markers[id])
      ? finishTuning(next, now, interceptDurationMs)
      : next;
  }
  if (session.status === 'intercept') {
    if (!session.interceptorIds.includes(playerId))
      throw new Error('You are not intercepting this signal.');
    if (session.intercepts[playerId]) throw new Error('Your interception is already locked.');
    const intercept = parseIntercept(entryId);
    const next = { ...session, intercepts: { ...session.intercepts, [playerId]: intercept } };
    return session.interceptorIds.every((id) => next.intercepts[id]) ? resolveRound(next) : next;
  }
  throw new Error('WaveLength is not accepting a receiver choice now.');
}

export function revealWavelengthStep(
  session: WavelengthSessionState,
  now = Date.now(),
  tuningDurationMs = WAVELENGTH_TUNING_DURATION_MS,
  interceptDurationMs = WAVELENGTH_INTERCEPT_DURATION_MS,
): WavelengthSessionState {
  if (session.status === 'clue') {
    return {
      ...session,
      status: 'tuning',
      clue: 'Static on the line',
      deadlineAt: now + tuningDurationMs,
    };
  }
  if (session.status === 'tuning') return finishTuning(session, now, interceptDurationMs);
  if (session.status === 'intercept') return resolveRound(session);
  throw new Error('This WaveLength round is not waiting for a reveal.');
}

export function expireWavelengthStep(
  session: WavelengthSessionState,
  now = Date.now(),
  tuningDurationMs = WAVELENGTH_TUNING_DURATION_MS,
  interceptDurationMs = WAVELENGTH_INTERCEPT_DURATION_MS,
): WavelengthSessionState {
  if (session.deadlineAt === null || now < session.deadlineAt) return session;
  return revealWavelengthStep(session, now, tuningDurationMs, interceptDurationMs);
}

export function advanceWavelengthRound(
  session: WavelengthSessionState,
  prompts: readonly WavelengthPrompt[],
  activePlayerIds: readonly PlayerId[] = session.playerOrder,
  now = Date.now(),
  clueDurationMs = WAVELENGTH_CLUE_DURATION_MS,
  randomizeTarget = true,
): WavelengthSessionState {
  if (session.status !== 'results') throw new Error('Results must be scanned before advancing.');
  if (session.roundNumber >= session.totalRounds) {
    return { ...session, status: 'complete', deadlineAt: null };
  }
  assertPlayerCount(activePlayerIds);
  assertDuration(clueDurationMs);
  const orderedPrompts = session.promptOrder
    .map((id) => prompts.find((prompt) => prompt.id === id))
    .filter((prompt): prompt is WavelengthPrompt => Boolean(prompt));
  const nextPrompt =
    orderedPrompts.find((prompt) => !session.usedPromptIds.includes(prompt.id)) ??
    prompts[session.roundNumber % prompts.length];
  if (!nextPrompt) throw new Error('WaveLength could not select another signal pair.');
  const retained = session.playerOrder.filter((id) => activePlayerIds.includes(id));
  const added = activePlayerIds.filter((id) => !retained.includes(id));
  return createRound({
    mode: session.mode,
    prompt: nextPrompt,
    promptOrder: orderedPrompts.length ? orderedPrompts : prompts,
    usedPromptIds: [...session.usedPromptIds, nextPrompt.id],
    playerOrder: [...retained, ...added],
    roundNumber: session.roundNumber + 1,
    totalRounds: session.totalRounds,
    now,
    clueDurationMs,
    roomScore: session.roomScore,
    teamScores: session.teamScores,
    randomizeTarget,
  });
}

export function getWavelengthPublicView(session: WavelengthSessionState): WavelengthPublicView {
  const revealed = session.status === 'results' || session.status === 'complete';
  const expectedCount =
    session.status === 'tuning'
      ? session.receiverIds.length
      : session.status === 'intercept'
        ? session.interceptorIds.length
        : 0;
  const submittedCount =
    session.status === 'tuning'
      ? Object.keys(session.markers).length
      : session.status === 'intercept'
        ? Object.keys(session.intercepts).length
        : 0;
  return {
    id: WAVELENGTH_GAME_ID,
    mode: session.mode,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    totalPlayers: session.playerOrder.length,
    promptId: session.prompt.id,
    leftPole: session.prompt.left,
    rightPole: session.prompt.right,
    clue: session.clue,
    deadlineAt: session.deadlineAt,
    teams: session.teams,
    activeTeamId: session.activeTeamId,
    broadcasterId: session.broadcasterId,
    receiverIds: session.receiverIds,
    interceptorIds: session.interceptorIds,
    submittedCount,
    expectedCount,
    target: revealed ? session.target : null,
    consensus: revealed ? (session.result?.consensus ?? null) : null,
    markers: revealed ? Object.values(session.markers) : [],
    result: revealed ? session.result : null,
    roomScore: session.roomScore,
    teamScores: session.teamScores,
    roundScores: revealed
      ? Object.entries(session.roundScores).map(([playerId, points]) => ({ playerId, points }))
      : [],
  };
}

export function getWavelengthPlayerView(
  session: WavelengthSessionState,
  playerId: PlayerId,
): WavelengthPlayerView {
  const teamId = session.mode === 'signal-clash' ? teamForPlayer(session.teams, playerId) : null;
  const ownMarker = session.markers[playerId] ?? null;
  const ownIntercept = session.intercepts[playerId] ?? null;
  const task: WavelengthPlayerView['task'] =
    session.status === 'clue' && playerId === session.broadcasterId
      ? 'clue'
      : session.status === 'tuning' && session.receiverIds.includes(playerId) && !ownMarker
        ? 'tune'
        : session.status === 'intercept' &&
            session.interceptorIds.includes(playerId) &&
            !ownIntercept
          ? 'intercept'
          : 'wait';
  return {
    id: WAVELENGTH_GAME_ID,
    mode: session.mode,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    leftPole: session.prompt.left,
    rightPole: session.prompt.right,
    clue: session.clue,
    deadlineAt: session.deadlineAt,
    teamId,
    activeTeamId: session.activeTeamId,
    broadcasterId: session.broadcasterId,
    task,
    instruction: instructionFor(session, playerId, task),
    privateTarget: playerId === session.broadcasterId ? session.target : null,
    ownMarker,
    ownIntercept,
    isGuestReceiver: session.guestReceiverIds.includes(playerId),
    hasSubmitted:
      task === 'wait' &&
      ((session.status === 'tuning' && Boolean(ownMarker)) ||
        (session.status === 'intercept' && Boolean(ownIntercept))),
  };
}

function createRound(input: {
  readonly mode: WavelengthMode;
  readonly prompt: WavelengthPrompt;
  readonly promptOrder: readonly WavelengthPrompt[];
  readonly usedPromptIds: readonly string[];
  readonly playerOrder: readonly PlayerId[];
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly now: number;
  readonly clueDurationMs: number;
  readonly roomScore: number;
  readonly teamScores: Readonly<Record<WavelengthTeamId, number>>;
  readonly randomizeTarget: boolean;
}): WavelengthSessionState {
  const teams = assignTeams(input.playerOrder);
  const activeTeamId: WavelengthTeamId | null =
    input.mode === 'signal-clash' ? (input.roundNumber % 2 === 1 ? 'cyan' : 'magenta') : null;
  const broadcasterPool = activeTeamId ? teams[activeTeamId] : input.playerOrder;
  const broadcasterIndex = activeTeamId
    ? Math.floor((input.roundNumber - 1) / 2) % broadcasterPool.length
    : (input.roundNumber - 1) % broadcasterPool.length;
  const broadcasterId = broadcasterPool[broadcasterIndex];
  if (!broadcasterId) throw new Error('WaveLength could not assign a Broadcaster.');
  let receiverIds = activeTeamId
    ? teams[activeTeamId].filter((id) => id !== broadcasterId)
    : input.playerOrder.filter((id) => id !== broadcasterId);
  let guestReceiverIds: readonly PlayerId[] = [];
  if (activeTeamId && receiverIds.length === 0) {
    guestReceiverIds = teams[oppositeTeam(activeTeamId)];
    receiverIds = [...guestReceiverIds];
  }
  const interceptorIds =
    activeTeamId && guestReceiverIds.length === 0 ? teams[oppositeTeam(activeTeamId)] : [];
  return {
    mode: input.mode,
    status: 'clue',
    roundNumber: input.roundNumber,
    totalRounds: input.totalRounds,
    prompt: input.prompt,
    promptOrder: input.promptOrder.map((prompt) => prompt.id),
    usedPromptIds: input.usedPromptIds,
    playerOrder: input.playerOrder,
    teams,
    activeTeamId,
    broadcasterId,
    receiverIds,
    interceptorIds,
    guestReceiverIds,
    target: input.randomizeTarget ? randomInt(8, 93) : deterministicTarget(input.roundNumber),
    clue: null,
    markers: {},
    intercepts: {},
    result: null,
    deadlineAt: input.now + input.clueDurationMs,
    roomScore: input.roomScore,
    teamScores: input.teamScores,
    roundScores: {},
  };
}

function finishTuning(
  session: WavelengthSessionState,
  now: number,
  interceptDurationMs: number,
): WavelengthSessionState {
  return session.mode === 'signal-clash' && session.interceptorIds.length > 0
    ? { ...session, status: 'intercept', deadlineAt: now + interceptDurationMs }
    : resolveRound(session);
}

function resolveRound(session: WavelengthSessionState): WavelengthSessionState {
  const markers = Object.values(session.markers);
  const consensus = weightedMedian(markers);
  const positions = markers.map((marker) => marker.position);
  const spread = positions.length ? Math.max(...positions) - Math.min(...positions) : null;
  const distance = Math.abs(consensus - session.target);
  const accuracyPoints = distance <= 4 ? 5 : distance <= 10 ? 3 : distance <= 18 ? 1 : 0;
  const syncBonus = markers.length >= 2 && spread !== null && spread <= 10 ? 1 : 0;
  const interceptOutcome: WavelengthIntercept =
    distance <= 4 ? 'locked' : consensus < session.target ? 'low' : 'high';
  const interceptPrediction = majorityIntercept(Object.values(session.intercepts));
  const interceptCorrect = interceptPrediction === interceptOutcome;
  const interceptPoints = interceptCorrect ? 2 : 0;
  const activeTeamPoints = accuracyPoints + syncBonus;
  const teamScores = { ...session.teamScores };
  let roomScore = session.roomScore;
  if (session.mode === 'open-channel') {
    roomScore += activeTeamPoints;
  } else if (session.activeTeamId) {
    teamScores[session.activeTeamId] += activeTeamPoints;
    if (interceptPoints > 0) teamScores[oppositeTeam(session.activeTeamId)] += interceptPoints;
  }
  const roundScores: Record<PlayerId, number> = {};
  if (activeTeamPoints > 0) roundScores[session.broadcasterId] = activeTeamPoints;
  for (const marker of markers) {
    if (Math.abs(marker.position - session.target) <= 10) {
      roundScores[marker.playerId] = (roundScores[marker.playerId] ?? 0) + 1;
    }
  }
  for (const [playerId, prediction] of Object.entries(session.intercepts)) {
    if (prediction === interceptOutcome) roundScores[playerId] = 1;
  }
  return {
    ...session,
    status: 'results',
    result: {
      target: session.target,
      consensus,
      distance,
      spread,
      accuracyPoints,
      syncBonus,
      activeTeamPoints,
      interceptPrediction,
      interceptOutcome,
      interceptCorrect,
      interceptPoints,
    },
    deadlineAt: null,
    roomScore,
    teamScores,
    roundScores,
  };
}

function parseMarker(playerId: PlayerId, entryId: string): WavelengthMarker {
  const match = /^marker:(\d{1,3}):([123])$/.exec(entryId);
  if (!match) throw new Error('Receiver data is invalid.');
  const position = Number(match[1]);
  const confidence = Number(match[2]) as 1 | 2 | 3;
  if (!Number.isInteger(position) || position < 0 || position > 100) {
    throw new Error('Receiver position must be from 0 to 100.');
  }
  return { playerId, position, confidence };
}

function parseIntercept(entryId: string): WavelengthIntercept {
  const value = entryId.replace(/^intercept:/, '');
  if (value !== 'low' && value !== 'locked' && value !== 'high') {
    throw new Error('Interception must be low, locked, or high.');
  }
  return value;
}

function weightedMedian(markers: readonly WavelengthMarker[]): number {
  if (!markers.length) return 50;
  const ordered = [...markers].sort(
    (left, right) => left.position - right.position || left.playerId.localeCompare(right.playerId),
  );
  const totalWeight = ordered.reduce((sum, marker) => sum + marker.confidence, 0);
  let weight = 0;
  for (const marker of ordered) {
    weight += marker.confidence;
    if (weight * 2 >= totalWeight) return marker.position;
  }
  return ordered.at(-1)?.position ?? 50;
}

function majorityIntercept(values: readonly WavelengthIntercept[]): WavelengthIntercept | null {
  if (!values.length) return null;
  const counts: Record<WavelengthIntercept, number> = { low: 0, locked: 0, high: 0 };
  values.forEach((value) => (counts[value] += 1));
  const ordered = (Object.entries(counts) as [WavelengthIntercept, number][]).sort(
    (left, right) => right[1] - left[1],
  );
  return ordered[0]![1] > ordered[1]![1] ? ordered[0]![0] : null;
}

function assignTeams(
  playerIds: readonly PlayerId[],
): Record<WavelengthTeamId, readonly PlayerId[]> {
  return {
    cyan: playerIds.filter((_, index) => index % 2 === 0),
    magenta: playerIds.filter((_, index) => index % 2 === 1),
  };
}

function teamForPlayer(
  teams: Readonly<Record<WavelengthTeamId, readonly PlayerId[]>>,
  playerId: PlayerId,
): WavelengthTeamId | null {
  if (teams.cyan.includes(playerId)) return 'cyan';
  if (teams.magenta.includes(playerId)) return 'magenta';
  return null;
}

function oppositeTeam(teamId: WavelengthTeamId): WavelengthTeamId {
  return teamId === 'cyan' ? 'magenta' : 'cyan';
}

function instructionFor(
  session: WavelengthSessionState,
  playerId: PlayerId,
  task: WavelengthPlayerView['task'],
): string {
  if (task === 'clue') return 'Read the hidden signal and send one clue. No numbers or pole words.';
  if (task === 'tune') {
    return session.guestReceiverIds.includes(playerId)
      ? 'Guest receiver: discuss the clue, place your signal, and choose your confidence.'
      : 'Discuss the clue, then privately place your signal and choose your confidence.';
  }
  if (task === 'intercept')
    return 'Predict whether their lock drifted low, landed, or drifted high.';
  if (session.status === 'clue') return 'The Broadcaster is searching for the right clue.';
  if (session.status === 'tuning')
    return 'Keep talking while the receivers lock their private signals.';
  if (session.status === 'intercept') return 'The rival channel is reading the drift.';
  return session.status === 'complete'
    ? 'The final transmission is complete.'
    : 'Watch the scan reveal.';
}

function orderPrompts(
  prompts: readonly WavelengthPrompt[],
  randomize: boolean,
  avoidFirstPromptId?: string,
): readonly WavelengthPrompt[] {
  const ordered = randomize ? shuffle([...prompts]) : [...prompts];
  if (avoidFirstPromptId && ordered[0]?.id === avoidFirstPromptId && ordered.length > 1) {
    const replacementIndex = ordered.findIndex((prompt) => prompt.id !== avoidFirstPromptId);
    if (replacementIndex > 0) {
      [ordered[0], ordered[replacementIndex]] = [ordered[replacementIndex]!, ordered[0]!];
    }
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

function deterministicTarget(roundNumber: number): number {
  return [22, 67, 41, 83, 14, 56, 74][(roundNumber - 1) % 7]!;
}

function assertPlayerCount(playerIds: readonly PlayerId[]): void {
  if (playerIds.length < WAVELENGTH_MIN_PLAYERS) {
    throw new Error(`WaveLength requires at least ${WAVELENGTH_MIN_PLAYERS} players.`);
  }
  if (playerIds.length > WAVELENGTH_MAX_PLAYERS) {
    throw new Error(`WaveLength supports at most ${WAVELENGTH_MAX_PLAYERS} players.`);
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('WaveLength player IDs must be unique.');
  }
}

function assertDuration(durationMs: number): void {
  if (!Number.isInteger(durationMs) || durationMs < 1) {
    throw new Error('WaveLength timers must be positive integers.');
  }
}

function assertBeforeDeadline(session: WavelengthSessionState, now: number): void {
  if (session.deadlineAt !== null && now >= session.deadlineAt) {
    throw new Error('The current WaveLength deadline has passed.');
  }
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
