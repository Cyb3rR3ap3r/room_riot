import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { DrawingDataSchema } from '@room-riot/contracts';
import type { ContentMode, DrawingData, PlayerId } from '@room-riot/contracts';

export const DRAWN_OUT_GAME_ID = 'drawn-out' as const;
export const DRAWN_OUT_TURN_DURATION_MS = 75_000;
export const DRAWN_OUT_GUESS_DURATION_MS = 45_000;
export const DRAWN_OUT_POINTS_CORRECT_GUESS = 100;
export const DRAWN_OUT_POINTS_ARTIST_BONUS = 50;
export const DRAWN_OUT_POINTS_CHAIN_LINK = 50;
export const DRAWN_OUT_POINTS_CHAIN_RESEMBLANCE = 100;
export const DRAWN_OUT_POINTS_FAKE_VOTE = 100;
export const DRAWN_OUT_POINTS_FAKE_SURVIVAL = 150;

export const DrawnOutModeSchema = z.enum(['classic', 'telephone', 'fake-artist']);
export type DrawnOutMode = z.infer<typeof DrawnOutModeSchema>;

const PromptSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1).max(180),
});
const PromptFileSchema = z
  .object({ prompts: z.array(PromptSchema).min(1) })
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

export interface DrawnOutPrompt {
  readonly id: string;
  readonly text: string;
}

export type DrawnOutStatus =
  'drawing' | 'guessing' | 'telephone' | 'fake-drawing' | 'fake-voting' | 'results' | 'complete';

export type DrawnOutChainEntry =
  | { readonly kind: 'phrase'; readonly playerId: PlayerId; readonly text: string }
  | { readonly kind: 'description'; readonly playerId: PlayerId; readonly text: string }
  | { readonly kind: 'drawing'; readonly playerId: PlayerId; readonly drawing: DrawingData };

export interface DrawnOutSessionState {
  readonly status: DrawnOutStatus;
  readonly mode: DrawnOutMode;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: DrawnOutPrompt;
  readonly promptOrder: readonly string[];
  readonly usedPromptIds: readonly string[];
  readonly playerOrder: readonly PlayerId[];
  readonly artistPlayerId: PlayerId | null;
  readonly activePlayerId: PlayerId | null;
  readonly fakeArtistPlayerId: PlayerId | null;
  readonly drawing: DrawingData | null;
  readonly chain: readonly DrawnOutChainEntry[];
  readonly guessOptions: readonly DrawnOutPrompt[];
  readonly guesses: Readonly<Record<PlayerId, string>>;
  readonly votes: Readonly<Record<PlayerId, PlayerId>>;
  readonly deadlineAt: number | null;
  readonly roundScores: Readonly<Record<PlayerId, number>>;
}

export interface DrawnOutGuessView {
  readonly playerId: PlayerId;
  readonly text: string;
  readonly correct: boolean;
}

export interface DrawnOutVoteView {
  readonly playerId: PlayerId;
  readonly count: number;
}

export interface DrawnOutPublicView {
  readonly id: typeof DRAWN_OUT_GAME_ID;
  readonly status: DrawnOutStatus;
  readonly mode: DrawnOutMode;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: string | null;
  readonly promptId: string | null;
  readonly deadlineAt: number | null;
  readonly artistPlayerId: PlayerId | null;
  readonly activePlayerId: PlayerId | null;
  readonly fakeArtistPlayerId: PlayerId | null;
  readonly drawing: DrawingData | null;
  readonly chain: readonly DrawnOutChainEntry[];
  readonly guesses: readonly DrawnOutGuessView[];
  readonly votes: readonly DrawnOutVoteView[];
  readonly submittedCount: number;
  readonly totalPlayers: number;
  readonly roundScores: readonly { readonly playerId: PlayerId; readonly points: number }[];
}

export interface DrawnOutPlayerView {
  readonly id: typeof DRAWN_OUT_GAME_ID;
  readonly status: DrawnOutStatus;
  readonly mode: DrawnOutMode;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly deadlineAt: number | null;
  readonly task: 'draw' | 'describe' | 'guess' | 'vote' | 'wait';
  readonly instruction: string;
  readonly privatePrompt: string | null;
  readonly sourceDescription: string | null;
  readonly isFakeArtist: boolean;
  readonly hasSubmitted: boolean;
  readonly drawing: DrawingData | null;
  readonly candidatePlayerIds: readonly PlayerId[];
  readonly guessOptions: readonly DrawnOutPrompt[];
  readonly ownGuess: string | null;
  readonly ownVotePlayerId: PlayerId | null;
}

const CURATED_PROMPT_TARGET = 100;
const PROMPT_FRAMES: readonly string[] = [
  '{prompt}',
  'A dramatic movie poster showing {prompt}',
  'A confusing instruction manual showing {prompt}',
  'A parade float featuring {prompt}',
];

const EMPTY_DRAWING: DrawingData = { strokes: [] };
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'the',
  'to',
  'trying',
  'with',
]);

export function loadDrawnOutPrompts(contentMode: ContentMode): readonly DrawnOutPrompt[] {
  const contentPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../content',
    `${contentMode}.json`,
  );
  const parsed = PromptFileSchema.parse(JSON.parse(readFileSync(contentPath, 'utf8')));
  return expandCuratedPrompts(contentMode, parsed.prompts);
}

function expandCuratedPrompts(
  contentMode: ContentMode,
  prompts: readonly DrawnOutPrompt[],
): readonly DrawnOutPrompt[] {
  const expanded = prompts.flatMap((prompt) =>
    PROMPT_FRAMES.map((frame, frameIndex) => ({
      id: frameIndex === 0 ? prompt.id : `${prompt.id}-frame-${frameIndex + 1}`,
      text: frame.replace('{prompt}', lowerFirst(prompt.text)),
    })),
  );
  return expanded.slice(0, Math.max(CURATED_PROMPT_TARGET, prompts.length));
}

export function createDrawnOutSession(
  prompts: readonly DrawnOutPrompt[],
  playerIds: readonly PlayerId[],
  mode: DrawnOutMode,
  totalRounds: number,
  now = Date.now(),
  turnDurationMs = DRAWN_OUT_TURN_DURATION_MS,
  randomize = false,
  avoidFirstPromptId?: string,
): DrawnOutSessionState {
  if (playerIds.length < 3) throw new Error('Drawn Out requires at least three players.');
  if (!Number.isInteger(totalRounds) || totalRounds < 1) {
    throw new Error('Drawn Out requires at least one round.');
  }
  if (!Number.isInteger(turnDurationMs) || turnDurationMs < 1) {
    throw new Error('Drawn Out timers must be positive integers.');
  }
  const orderedPrompts = orderPrompts(prompts, randomize, avoidFirstPromptId);
  const prompt = orderedPrompts[0];
  if (!prompt) throw new Error('Drawn Out requires at least one prompt.');
  const playerOrder = randomize ? shuffle([...playerIds]) : [...playerIds];
  return createRoundState(
    mode,
    prompt,
    orderedPrompts,
    playerOrder,
    totalRounds,
    1,
    now,
    turnDurationMs,
  );
}

export function submitDrawnOutDrawing(
  session: DrawnOutSessionState,
  playerId: PlayerId,
  drawingInput: DrawingData,
  now = Date.now(),
  turnDurationMs = DRAWN_OUT_TURN_DURATION_MS,
  guessDurationMs = DRAWN_OUT_GUESS_DURATION_MS,
): DrawnOutSessionState {
  assertBeforeDeadline(session, now);
  const drawing = DrawingDataSchema.parse(drawingInput);
  if (drawing.strokes.length === 0) throw new Error('Add at least one stroke before submitting.');

  if (session.status === 'drawing') {
    if (session.artistPlayerId !== playerId) throw new Error('Only the featured artist can draw.');
    return { ...session, status: 'guessing', drawing, deadlineAt: now + guessDurationMs };
  }

  if (session.status === 'telephone') {
    assertActivePlayer(session, playerId);
    if (nextTelephoneKind(session) !== 'drawing') throw new Error('This link needs a description.');
    return advanceTelephone(
      { ...session, chain: [...session.chain, { kind: 'drawing', playerId, drawing }] },
      now,
      turnDurationMs,
    );
  }

  if (session.status === 'fake-drawing') {
    assertActivePlayer(session, playerId);
    const combined = DrawingDataSchema.parse({
      strokes: [...(session.drawing?.strokes ?? []), ...drawing.strokes],
    });
    const currentIndex = session.playerOrder.indexOf(playerId);
    const nextPlayer = session.playerOrder[currentIndex + 1] ?? null;
    return nextPlayer
      ? {
          ...session,
          drawing: combined,
          activePlayerId: nextPlayer,
          deadlineAt: now + turnDurationMs,
        }
      : {
          ...session,
          status: 'fake-voting',
          drawing: combined,
          activePlayerId: null,
          deadlineAt: now + guessDurationMs,
        };
  }

  throw new Error('This round is not accepting a drawing.');
}

export function submitDrawnOutText(
  session: DrawnOutSessionState,
  playerId: PlayerId,
  textInput: string,
  now = Date.now(),
  turnDurationMs = DRAWN_OUT_TURN_DURATION_MS,
): DrawnOutSessionState {
  assertBeforeDeadline(session, now);
  const text = textInput.trim();
  if (!text) throw new Error('Text cannot be empty.');
  if (text.length > 180) throw new Error('Text must be 180 characters or fewer.');

  if (session.status === 'guessing') {
    if (session.artistPlayerId === playerId)
      throw new Error('The artist cannot guess their own prompt.');
    if (session.guesses[playerId] !== undefined) throw new Error('This player already guessed.');
    if (!session.guessOptions.some((option) => option.id === text)) {
      throw new Error('Choose one of the four provided prompts.');
    }
    const guesses = { ...session.guesses, [playerId]: text };
    const eligible = session.playerOrder.filter((id) => id !== session.artistPlayerId);
    const next = { ...session, guesses };
    return eligible.every((id) => guesses[id] !== undefined) ? revealClassic(next) : next;
  }

  if (session.status === 'telephone') {
    assertActivePlayer(session, playerId);
    if (nextTelephoneKind(session) !== 'description') throw new Error('This link needs a drawing.');
    return advanceTelephone(
      { ...session, chain: [...session.chain, { kind: 'description', playerId, text }] },
      now,
      turnDurationMs,
    );
  }

  throw new Error('This round is not accepting text.');
}

export function submitDrawnOutVote(
  session: DrawnOutSessionState,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
  now = Date.now(),
): DrawnOutSessionState {
  if (session.status !== 'fake-voting') throw new Error('This round is not accepting votes.');
  assertBeforeDeadline(session, now);
  if (!session.playerOrder.includes(targetPlayerId))
    throw new Error('That player is not in this round.');
  if (playerId === targetPlayerId) throw new Error('You cannot vote for yourself.');
  if (session.votes[playerId] !== undefined) throw new Error('This player already voted.');
  const votes = { ...session.votes, [playerId]: targetPlayerId };
  const next = { ...session, votes };
  return session.playerOrder.every((id) => votes[id] !== undefined) ? revealFakeArtist(next) : next;
}

export function revealDrawnOutStep(
  session: DrawnOutSessionState,
  now = Date.now(),
  turnDurationMs = DRAWN_OUT_TURN_DURATION_MS,
  guessDurationMs = DRAWN_OUT_GUESS_DURATION_MS,
): DrawnOutSessionState {
  if (session.status === 'drawing') {
    return {
      ...session,
      status: 'guessing',
      drawing: EMPTY_DRAWING,
      deadlineAt: now + guessDurationMs,
    };
  }
  if (session.status === 'guessing') return revealClassic(session);
  if (session.status === 'telephone') {
    const playerId = session.activePlayerId;
    if (!playerId) return revealTelephone(session);
    const entry: DrawnOutChainEntry =
      nextTelephoneKind(session) === 'drawing'
        ? { kind: 'drawing', playerId, drawing: EMPTY_DRAWING }
        : { kind: 'description', playerId, text: 'The chain went mysteriously quiet.' };
    return advanceTelephone({ ...session, chain: [...session.chain, entry] }, now, turnDurationMs);
  }
  if (session.status === 'fake-drawing') {
    const active = session.activePlayerId;
    if (!active) return { ...session, status: 'fake-voting', deadlineAt: now + guessDurationMs };
    const currentIndex = session.playerOrder.indexOf(active);
    const nextPlayer = session.playerOrder[currentIndex + 1] ?? null;
    return nextPlayer
      ? { ...session, activePlayerId: nextPlayer, deadlineAt: now + turnDurationMs }
      : {
          ...session,
          status: 'fake-voting',
          activePlayerId: null,
          deadlineAt: now + guessDurationMs,
        };
  }
  if (session.status === 'fake-voting') return revealFakeArtist(session);
  throw new Error('This Drawn Out round is not waiting for a reveal.');
}

export function expireDrawnOutStep(
  session: DrawnOutSessionState,
  now = Date.now(),
  turnDurationMs = DRAWN_OUT_TURN_DURATION_MS,
  guessDurationMs = DRAWN_OUT_GUESS_DURATION_MS,
): DrawnOutSessionState {
  if (session.deadlineAt === null || now < session.deadlineAt) return session;
  return revealDrawnOutStep(session, now, turnDurationMs, guessDurationMs);
}

export function advanceDrawnOutRound(
  session: DrawnOutSessionState,
  prompts: readonly DrawnOutPrompt[],
  now = Date.now(),
  turnDurationMs = DRAWN_OUT_TURN_DURATION_MS,
): DrawnOutSessionState {
  if (session.status !== 'results') throw new Error('Results must be revealed before advancing.');
  if (session.roundNumber >= session.totalRounds) {
    return { ...session, status: 'complete', deadlineAt: null };
  }
  const ordered = session.promptOrder
    .map((id) => prompts.find((prompt) => prompt.id === id))
    .filter((prompt): prompt is DrawnOutPrompt => Boolean(prompt));
  const nextPrompt =
    ordered.find((prompt) => !session.usedPromptIds.includes(prompt.id)) ??
    prompts[session.roundNumber % prompts.length];
  if (!nextPrompt) throw new Error('Drawn Out could not select the next prompt.');
  const rotatedPlayers = [...session.playerOrder.slice(1), session.playerOrder[0]!];
  const next = createRoundState(
    session.mode,
    nextPrompt,
    ordered,
    rotatedPlayers,
    session.totalRounds,
    session.roundNumber + 1,
    now,
    turnDurationMs,
  );
  return { ...next, usedPromptIds: [...session.usedPromptIds, nextPrompt.id] };
}

export function getDrawnOutPublicView(
  session: DrawnOutSessionState,
  totalPlayers: number,
): DrawnOutPublicView {
  const reveal = session.status === 'results' || session.status === 'complete';
  const guesses = reveal
    ? Object.entries(session.guesses).map(([playerId, promptId]) => {
        const selectedPrompt = session.guessOptions.find((option) => option.id === promptId);
        return {
          playerId,
          text: selectedPrompt?.text ?? 'Unknown prompt',
          correct: promptId === session.prompt.id,
        };
      })
    : [];
  const voteCounts = new Map<PlayerId, number>();
  Object.values(session.votes).forEach((playerId) =>
    voteCounts.set(playerId, (voteCounts.get(playerId) ?? 0) + 1),
  );
  return {
    id: DRAWN_OUT_GAME_ID,
    status: session.status,
    mode: session.mode,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    prompt: reveal ? session.prompt.text : null,
    promptId: reveal ? session.prompt.id : null,
    deadlineAt: session.deadlineAt,
    artistPlayerId: session.artistPlayerId,
    activePlayerId: session.activePlayerId,
    fakeArtistPlayerId: reveal ? session.fakeArtistPlayerId : null,
    drawing: session.drawing ?? latestChainDrawing(session.chain),
    chain: reveal ? session.chain : [],
    guesses,
    votes: reveal
      ? [...voteCounts]
          .map(([playerId, count]) => ({ playerId, count }))
          .sort((a, b) => b.count - a.count)
      : [],
    submittedCount:
      session.status === 'guessing'
        ? Object.keys(session.guesses).length
        : session.status === 'fake-voting'
          ? Object.keys(session.votes).length
          : session.chain.length,
    totalPlayers,
    roundScores: reveal
      ? Object.entries(session.roundScores).map(([playerId, points]) => ({ playerId, points }))
      : [],
  };
}

export function getDrawnOutPlayerView(
  session: DrawnOutSessionState,
  playerId: PlayerId,
): DrawnOutPlayerView {
  const active = session.activePlayerId === playerId;
  const isArtist = session.artistPlayerId === playerId;
  const reveal = session.status === 'results' || session.status === 'complete';
  let task: DrawnOutPlayerView['task'] = 'wait';
  let instruction = 'Watch the big screen.';
  let privatePrompt: string | null = null;
  let sourceDescription: string | null = null;
  let hasSubmitted = false;

  if (session.status === 'drawing' && isArtist) {
    task = 'draw';
    instruction = 'Draw the secret prompt. No letters or numbers.';
    privatePrompt = session.prompt.text;
  } else if (session.status === 'guessing' && !isArtist) {
    task = 'guess';
    instruction = 'Choose which of the four prompts inspired this drawing.';
    hasSubmitted = session.guesses[playerId] !== undefined;
  } else if (session.status === 'telephone' && active) {
    const previous = session.chain.at(-1);
    if (nextTelephoneKind(session) === 'drawing') {
      task = 'draw';
      instruction = 'Draw the phrase you received. The next player will only see your art.';
      privatePrompt = previous && previous.kind !== 'drawing' ? previous.text : null;
    } else {
      task = 'describe';
      instruction = 'Describe this drawing without seeing the original phrase.';
      sourceDescription = 'Describe exactly what you think the drawing shows.';
    }
  } else if (session.status === 'telephone' && session.playerOrder[0] === playerId) {
    instruction = 'You started this chain. Guard the original phrase and watch it fall apart.';
    privatePrompt = session.prompt.text;
    hasSubmitted = true;
  } else if (session.status === 'fake-drawing' && active) {
    task = 'draw';
    instruction = 'Add a few useful strokes, then pass the canvas.';
    privatePrompt = session.fakeArtistPlayerId === playerId ? null : session.prompt.text;
  } else if (session.status === 'fake-voting') {
    task = 'vote';
    instruction = 'Who was drawing without the prompt?';
    hasSubmitted = session.votes[playerId] !== undefined;
  }

  return {
    id: DRAWN_OUT_GAME_ID,
    status: session.status,
    mode: session.mode,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    deadlineAt: session.deadlineAt,
    task,
    instruction,
    privatePrompt: reveal ? session.prompt.text : privatePrompt,
    sourceDescription,
    isFakeArtist: !reveal && session.fakeArtistPlayerId === playerId,
    hasSubmitted,
    drawing: session.drawing ?? latestChainDrawing(session.chain),
    candidatePlayerIds:
      task === 'vote' ? session.playerOrder.filter((candidate) => candidate !== playerId) : [],
    guessOptions: task === 'guess' ? session.guessOptions : [],
    ownGuess:
      session.guessOptions.find((option) => option.id === session.guesses[playerId])?.text ?? null,
    ownVotePlayerId: session.votes[playerId] ?? null,
  };
}

function createRoundState(
  mode: DrawnOutMode,
  prompt: DrawnOutPrompt,
  prompts: readonly DrawnOutPrompt[],
  playerOrder: readonly PlayerId[],
  totalRounds: number,
  roundNumber: number,
  now: number,
  turnDurationMs: number,
): DrawnOutSessionState {
  const artistPlayerId = mode === 'classic' ? (playerOrder[0] ?? null) : null;
  const fakeArtistPlayerId =
    mode === 'fake-artist' ? (playerOrder[(roundNumber - 1) % playerOrder.length] ?? null) : null;
  const chain: readonly DrawnOutChainEntry[] =
    mode === 'telephone' && playerOrder[0]
      ? [{ kind: 'phrase', playerId: playerOrder[0], text: prompt.text }]
      : [];
  return {
    status: mode === 'classic' ? 'drawing' : mode === 'telephone' ? 'telephone' : 'fake-drawing',
    mode,
    roundNumber,
    totalRounds,
    prompt,
    promptOrder: prompts.map((item) => item.id),
    usedPromptIds: [prompt.id],
    playerOrder,
    artistPlayerId,
    activePlayerId:
      mode === 'classic'
        ? artistPlayerId
        : mode === 'telephone'
          ? (playerOrder[1] ?? null)
          : (playerOrder[0] ?? null),
    fakeArtistPlayerId,
    drawing: mode === 'fake-artist' ? EMPTY_DRAWING : null,
    chain,
    guessOptions: mode === 'classic' ? buildGuessOptions(prompt, prompts, roundNumber) : [],
    guesses: {},
    votes: {},
    deadlineAt: now + turnDurationMs,
    roundScores: {},
  };
}

function advanceTelephone(
  session: DrawnOutSessionState,
  now: number,
  turnDurationMs: number,
): DrawnOutSessionState {
  const nextPlayer = session.playerOrder[session.chain.length] ?? null;
  return nextPlayer
    ? { ...session, activePlayerId: nextPlayer, deadlineAt: now + turnDurationMs }
    : revealTelephone(session);
}

function revealClassic(session: DrawnOutSessionState): DrawnOutSessionState {
  const roundScores: Record<PlayerId, number> = {};
  let correctCount = 0;
  Object.entries(session.guesses).forEach(([playerId, promptId]) => {
    if (promptId !== session.prompt.id) return;
    roundScores[playerId] = DRAWN_OUT_POINTS_CORRECT_GUESS;
    correctCount += 1;
  });
  if (session.artistPlayerId && correctCount > 0) {
    roundScores[session.artistPlayerId] = correctCount * DRAWN_OUT_POINTS_ARTIST_BONUS;
  }
  return { ...session, status: 'results', activePlayerId: null, deadlineAt: null, roundScores };
}

function buildGuessOptions(
  prompt: DrawnOutPrompt,
  prompts: readonly DrawnOutPrompt[],
  roundNumber: number,
): readonly DrawnOutPrompt[] {
  const promptFamily = promptFamilyId(prompt.id);
  const variant = promptVariant(prompt.id);
  const candidates = [
    ...prompts.filter((candidate) => promptVariant(candidate.id) === variant),
    ...prompts.filter((candidate) => promptVariant(candidate.id) !== variant),
  ];
  const seenFamilies = new Set([promptFamily]);
  const decoys: DrawnOutPrompt[] = [];
  for (const candidate of candidates) {
    const family = promptFamilyId(candidate.id);
    if (candidate.id === prompt.id || seenFamilies.has(family)) continue;
    seenFamilies.add(family);
    decoys.push(candidate);
    if (decoys.length === 3) break;
  }
  if (decoys.length < 3) {
    throw new Error('Classic Drawn Out requires at least four distinct prompt families.');
  }
  const correctIndex = stableHash(`${prompt.id}:${roundNumber}`) % 4;
  const options = [...decoys];
  options.splice(correctIndex, 0, prompt);
  return options;
}

function promptFamilyId(promptId: string): string {
  return promptId.replace(/-frame-\d+$/, '');
}

function promptVariant(promptId: string): string {
  return promptId.match(/-frame-(\d+)$/)?.[1] ?? 'base';
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function revealTelephone(session: DrawnOutSessionState): DrawnOutSessionState {
  const roundScores: Record<PlayerId, number> = {};
  new Set(session.chain.map((entry) => entry.playerId)).forEach((playerId) => {
    roundScores[playerId] = DRAWN_OUT_POINTS_CHAIN_LINK;
  });
  const final = session.chain.at(-1);
  if (final && final.kind !== 'drawing' && isRecognizableGuess(final.text, session.prompt.text)) {
    roundScores[final.playerId] =
      (roundScores[final.playerId] ?? 0) + DRAWN_OUT_POINTS_CHAIN_RESEMBLANCE;
  }
  return { ...session, status: 'results', activePlayerId: null, deadlineAt: null, roundScores };
}

function revealFakeArtist(session: DrawnOutSessionState): DrawnOutSessionState {
  const fake = session.fakeArtistPlayerId;
  const roundScores: Record<PlayerId, number> = {};
  if (fake) {
    const correctVoters = Object.entries(session.votes).filter(([, target]) => target === fake);
    correctVoters.forEach(([playerId]) => {
      roundScores[playerId] = DRAWN_OUT_POINTS_FAKE_VOTE;
    });
    if (correctVoters.length < Math.ceil(session.playerOrder.length / 2)) {
      roundScores[fake] = DRAWN_OUT_POINTS_FAKE_SURVIVAL;
    }
  }
  return { ...session, status: 'results', activePlayerId: null, deadlineAt: null, roundScores };
}

function nextTelephoneKind(session: DrawnOutSessionState): 'drawing' | 'description' {
  return session.chain.length % 2 === 1 ? 'drawing' : 'description';
}

function latestChainDrawing(chain: readonly DrawnOutChainEntry[]): DrawingData | null {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const entry = chain[index];
    if (entry?.kind === 'drawing') return entry.drawing;
  }
  return null;
}

function assertActivePlayer(session: DrawnOutSessionState, playerId: PlayerId): void {
  if (session.activePlayerId !== playerId) throw new Error('It is not your turn.');
}

function assertBeforeDeadline(session: DrawnOutSessionState, now: number): void {
  if (session.deadlineAt !== null && now >= session.deadlineAt) {
    throw new Error('The turn deadline has passed.');
  }
}

function isRecognizableGuess(guess: string, prompt: string): boolean {
  const guessWords = significantWords(guess);
  const promptWords = significantWords(prompt);
  if (guessWords.size === 0 || promptWords.size === 0) return false;
  let overlap = 0;
  promptWords.forEach((word) => {
    if (guessWords.has(word)) overlap += 1;
  });
  return overlap >= Math.max(1, Math.min(2, Math.ceil(promptWords.size * 0.35)));
}

function significantWords(value: string): Set<string> {
  const words = normalizeText(value)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .map((word) => (word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word));
  return new Set(words);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function lowerFirst(value: string): string {
  return value.length ? `${value[0]?.toLowerCase() ?? ''}${value.slice(1)}` : value;
}

function orderPrompts(
  prompts: readonly DrawnOutPrompt[],
  randomize: boolean,
  avoidFirstPromptId?: string,
): DrawnOutPrompt[] {
  const ordered = randomize ? shuffle([...prompts]) : [...prompts];
  if (avoidFirstPromptId && ordered.length > 1 && ordered[0]?.id === avoidFirstPromptId) {
    const swapIndex = ordered.findIndex((prompt) => prompt.id !== avoidFirstPromptId);
    if (swapIndex > 0) [ordered[0], ordered[swapIndex]] = [ordered[swapIndex]!, ordered[0]!];
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
