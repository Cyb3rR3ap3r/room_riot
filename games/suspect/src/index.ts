import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { ContentMode, PlayerId } from '@room-riot/contracts';

export const SUSPECT_GAME_ID = 'suspect' as const;
export const SUSPECT_INPUT_DURATION_MS = 45_000;
export const SUSPECT_ALIBI_DURATION_MS = 20_000;
export const SUSPECT_VOTING_DURATION_MS = 35_000;
export const SUSPECT_POINTS_PER_CORRECT_VOTE = 100;
export const SUSPECT_POINTS_PER_DOUBLE_VOTE = 150;
export const SUSPECT_POINTS_FOR_SURVIVAL = 100;
export const SUSPECT_POINTS_FOR_ALIBI = 50;

export const SuspectRoundTypeSchema = z.enum([
  'standard',
  'alibi',
  'double-trouble',
  'false-accusation',
  'most-likely',
]);
export type SuspectRoundType = z.infer<typeof SuspectRoundTypeSchema>;

const PromptSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1),
  roundType: SuspectRoundTypeSchema,
});
const PromptFileSchema = z
  .object({ prompts: z.array(PromptSchema).min(1) })
  .superRefine((file, context) => {
    const ids = new Set(file.prompts.map((prompt) => prompt.id));
    if (ids.size !== file.prompts.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Prompt IDs must be unique within a content pack.',
      });
    }
  });

export interface SuspectPrompt {
  readonly id: string;
  readonly text: string;
  readonly roundType: SuspectRoundType;
}

export interface SuspectVoteSummary {
  readonly targetPlayerIds: readonly PlayerId[];
  readonly count: number;
}

export interface SuspectSessionState {
  readonly status: 'input' | 'alibi' | 'voting' | 'results' | 'complete';
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: SuspectPrompt;
  readonly promptOrder: readonly string[];
  readonly usedPromptIds: readonly string[];
  readonly inputDeadlineAt: number | null;
  readonly alibiDeadlineAt: number | null;
  readonly votingDeadlineAt: number | null;
  readonly answers: Readonly<Record<PlayerId, boolean>>;
  readonly matchedPlayerIds: readonly PlayerId[];
  readonly selectedPlayerIds: readonly PlayerId[];
  readonly alibiPlayerId: PlayerId | null;
  readonly alibiText: string | null;
  readonly votes: Readonly<Record<PlayerId, readonly PlayerId[]>>;
  readonly voteSummary: readonly SuspectVoteSummary[];
  readonly roundScores: Readonly<Record<PlayerId, number>>;
  /** Number of prior authored selections per player, retained across rounds for fair exposure. */
  readonly selectionCounts: Readonly<Record<PlayerId, number>>;
  /** Stable per-session entropy that makes selection reproducible in tests and incident replays. */
  readonly selectionSeed: string;
}

export interface SuspectPublicView {
  readonly id: typeof SUSPECT_GAME_ID;
  readonly status: SuspectSessionState['status'];
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: string;
  readonly promptId: string;
  readonly roundType: SuspectRoundType;
  readonly deadlineAt: number | null;
  readonly submittedCount: number;
  readonly totalPlayers: number;
  readonly matchedCount: number;
  readonly selectedPlayerIds: readonly PlayerId[];
  readonly alibiPlayerId: PlayerId | null;
  readonly alibiText: string | null;
  readonly voteSummary: readonly SuspectVoteSummary[];
  readonly roundScores: readonly { readonly playerId: PlayerId; readonly points: number }[];
}

export interface SuspectPlayerView {
  readonly id: typeof SUSPECT_GAME_ID;
  readonly status: SuspectSessionState['status'];
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: string;
  readonly promptId: string;
  readonly roundType: SuspectRoundType;
  readonly deadlineAt: number | null;
  readonly hasSubmitted: boolean;
  readonly ownAnswer: boolean | null;
  readonly canSubmitAlibi: boolean;
  readonly ownAlibi: string | null;
  readonly alibiPlayerId: PlayerId | null;
  readonly hasVoted: boolean;
  readonly ownVoteTargetIds: readonly PlayerId[];
  readonly candidatePlayerIds: readonly PlayerId[];
  readonly selectedPlayerIds: readonly PlayerId[];
}

const CURATED_PROMPT_TARGET = 100;
const EXPANSION_TEMPLATES: readonly string[] = [
  'I have made an excuse to avoid {topic}.',
  'I have pretended to understand {topic}.',
  'I have quietly judged someone for their approach to {topic}.',
  'I have forgotten something important about {topic}.',
  'I have checked my phone during {topic}.',
  'I have practiced what to say before {topic}.',
  'I have blamed traffic for being late to {topic}.',
  'I have agreed to {topic} and immediately regretted it.',
  'I have searched for an answer about {topic} after pretending I knew it.',
  'I have changed my outfit because of {topic}.',
  'I have claimed I was almost ready for {topic}.',
  'I have taken the easy way out of {topic}.',
  'I have avoided eye contact during {topic}.',
  'I have said “one more” during {topic}.',
  'I have invented a tiny emergency to leave {topic}.',
  'I have taken credit for surviving {topic}.',
  'I have saved a screenshot related to {topic}.',
  'I have had a completely different plan for {topic}.',
  'I have learned a lesson from {topic} and then ignored it.',
  'I have told a friend the full story about {topic}.',
];

const EXPANSION_TOPICS: Record<ContentMode, readonly string[]> = {
  family: [
    'a school event',
    'a birthday party',
    'a family road trip',
    'a board game',
    'a sleepover',
  ],
  standard: ['a work meeting', 'a first date', 'a weekend trip', 'a group chat', 'a busy airport'],
  'after-dark': [
    'a late-night text',
    'a crowded bar',
    'a first date',
    'a house party',
    'a secret crush',
  ],
};

export function loadSuspectPrompts(contentMode: ContentMode): readonly SuspectPrompt[] {
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
  prompts: readonly SuspectPrompt[],
): readonly SuspectPrompt[] {
  const existingText = new Set(prompts.map((prompt) => prompt.text));
  const generated = EXPANSION_TEMPLATES.flatMap((template) =>
    (EXPANSION_TOPICS[contentMode] ?? []).map((topic) => template.replace('{topic}', topic)),
  )
    .map((text, index) => ({
      id: `${contentMode}-curated-${String(index + 1).padStart(3, '0')}`,
      text,
      roundType: 'standard' as const,
    }))
    .filter((prompt) => {
      if (existingText.has(prompt.text)) return false;
      existingText.add(prompt.text);
      return true;
    });

  return [...prompts, ...generated].slice(0, Math.max(CURATED_PROMPT_TARGET, prompts.length));
}

export function createSuspectSession(
  prompts: readonly SuspectPrompt[],
  totalRounds: number,
  now = Date.now(),
  inputDurationMs = SUSPECT_INPUT_DURATION_MS,
  alibiDurationMs = SUSPECT_ALIBI_DURATION_MS,
  votingDurationMs = SUSPECT_VOTING_DURATION_MS,
  randomizePrompts = false,
  avoidFirstPromptId?: string,
  selectionSeed: string = randomUUID(),
): SuspectSessionState {
  const orderedPrompts = orderPrompts(prompts, randomizePrompts, avoidFirstPromptId);
  const firstPrompt = orderedPrompts[0];
  if (!firstPrompt) throw new Error('Suspect requires at least one prompt.');
  if (!Number.isInteger(totalRounds) || totalRounds < 1) {
    throw new Error('Suspect requires at least one round.');
  }
  if (
    !Number.isInteger(inputDurationMs) ||
    inputDurationMs < 1 ||
    !Number.isInteger(alibiDurationMs) ||
    alibiDurationMs < 1 ||
    !Number.isInteger(votingDurationMs) ||
    votingDurationMs < 1
  ) {
    throw new Error('Suspect timers must be positive integers.');
  }

  return createStateForPrompt(
    firstPrompt,
    orderedPrompts,
    totalRounds,
    1,
    now,
    inputDurationMs,
    alibiDurationMs,
    votingDurationMs,
    selectionSeed,
    {},
  );
}

export function submitSuspectAnswer(
  session: SuspectSessionState,
  playerId: PlayerId,
  answer: boolean,
  now?: number,
): SuspectSessionState {
  if (session.status !== 'input') throw new Error('This round is not accepting private answers.');
  if (now !== undefined && session.inputDeadlineAt !== null && now >= session.inputDeadlineAt) {
    throw new Error('The answer deadline has passed.');
  }
  if (session.answers[playerId] !== undefined) {
    throw new Error('This player already answered the prompt.');
  }

  return { ...session, answers: { ...session.answers, [playerId]: answer } };
}

export function allSuspectPlayersAnswered(
  session: SuspectSessionState,
  playerIds: readonly PlayerId[],
): boolean {
  return (
    playerIds.length > 0 && playerIds.every((playerId) => session.answers[playerId] !== undefined)
  );
}

export function revealSuspectAnswers(
  session: SuspectSessionState,
  playerIds: readonly PlayerId[],
  now = Date.now(),
  alibiDurationMs = SUSPECT_ALIBI_DURATION_MS,
  votingDurationMs = SUSPECT_VOTING_DURATION_MS,
): SuspectSessionState {
  if (session.status !== 'input') return session;
  const matchedPlayerIds = playerIds.filter((playerId) => session.answers[playerId] === true);
  const selectedPlayerIds = selectSuspects(
    session.prompt.roundType,
    matchedPlayerIds,
    session.selectionCounts,
    session.selectionSeed,
    session.roundNumber,
  );
  const selectionCounts = { ...session.selectionCounts };
  selectedPlayerIds.forEach((playerId) => {
    selectionCounts[playerId] = (selectionCounts[playerId] ?? 0) + 1;
  });
  const alibi = session.prompt.roundType === 'alibi' && selectedPlayerIds.length === 1;

  return {
    ...session,
    status: alibi ? 'alibi' : 'voting',
    inputDeadlineAt: null,
    alibiDeadlineAt: alibi ? now + alibiDurationMs : null,
    votingDeadlineAt: alibi ? null : now + votingDurationMs,
    matchedPlayerIds,
    selectedPlayerIds,
    alibiPlayerId: alibi ? selectedPlayerIds[0]! : null,
    selectionCounts,
  };
}

export function submitSuspectAlibi(
  session: SuspectSessionState,
  playerId: PlayerId,
  text: string,
  now?: number,
  votingDurationMs = SUSPECT_VOTING_DURATION_MS,
): SuspectSessionState {
  if (session.status !== 'alibi') throw new Error('This round is not waiting for an alibi.');
  if (session.alibiPlayerId !== playerId)
    throw new Error('Only the accused player can submit an alibi.');
  if (now !== undefined && session.alibiDeadlineAt !== null && now >= session.alibiDeadlineAt) {
    throw new Error('The alibi deadline has passed.');
  }
  const alibiText = text.trim();
  if (!alibiText) throw new Error('Alibi cannot be empty.');
  if (alibiText.length > 280) throw new Error('Alibi must be 280 characters or fewer.');

  return {
    ...session,
    status: 'voting',
    alibiDeadlineAt: null,
    votingDeadlineAt: (now ?? Date.now()) + votingDurationMs,
    alibiText,
  };
}

export function expireSuspectAlibi(
  session: SuspectSessionState,
  now = Date.now(),
  votingDurationMs = SUSPECT_VOTING_DURATION_MS,
): SuspectSessionState {
  if (session.status !== 'alibi') return session;
  return {
    ...session,
    status: 'voting',
    alibiDeadlineAt: null,
    votingDeadlineAt: now + votingDurationMs,
  };
}

export function submitSuspectVote(
  session: SuspectSessionState,
  playerId: PlayerId,
  targetPlayerIds: readonly PlayerId[],
  playerIds: readonly PlayerId[],
  now?: number,
): SuspectSessionState {
  if (session.status !== 'voting') throw new Error('This round is not accepting accusations.');
  if (now !== undefined && session.votingDeadlineAt !== null && now >= session.votingDeadlineAt) {
    throw new Error('The accusation deadline has passed.');
  }
  if (session.votes[playerId]) throw new Error('This player already voted.');

  const targets = [...targetPlayerIds];
  const validPlayers = new Set(playerIds);
  if (new Set(targets).size !== targets.length)
    throw new Error('Accusation targets must be unique.');
  if (targets.some((target) => !validPlayers.has(target)))
    throw new Error('Accusation target is not in the room.');
  if (targets.includes(playerId)) throw new Error('You cannot accuse yourself.');
  if (session.prompt.roundType === 'most-likely' && targets.length !== 1) {
    throw new Error('Most Likely rounds require one player.');
  }
  if (
    session.prompt.roundType === 'double-trouble' &&
    targets.length !== 0 &&
    targets.length !== 2
  ) {
    throw new Error('Double Trouble requires two players or No match.');
  }
  if (
    session.prompt.roundType !== 'most-likely' &&
    session.prompt.roundType !== 'double-trouble' &&
    targets.length > 1
  ) {
    throw new Error('Choose one suspect for this round.');
  }

  return { ...session, votes: { ...session.votes, [playerId]: targets } };
}

export function allSuspectPlayersVoted(
  session: SuspectSessionState,
  playerIds: readonly PlayerId[],
): boolean {
  return playerIds.length > 0 && playerIds.every((playerId) => Boolean(session.votes[playerId]));
}

export function revealSuspectVotes(session: SuspectSessionState): SuspectSessionState {
  if (session.status !== 'voting') return session;
  const voteSummary = summarizeVotes(session.votes);
  const roundScores: Record<PlayerId, number> = {};

  if (session.prompt.roundType === 'most-likely') {
    const highest = voteSummary[0]?.count ?? 0;
    const winners = voteSummary.filter((vote) => vote.count === highest && highest > 0);
    const winningIds = new Set(winners.flatMap((winner) => winner.targetPlayerIds));
    Object.entries(session.votes).forEach(([playerId, targets]) => {
      if (targets[0] && winningIds.has(targets[0])) {
        roundScores[playerId] = (roundScores[playerId] ?? 0) + SUSPECT_POINTS_PER_CORRECT_VOTE;
      }
    });
    winners.forEach((winner) => {
      const target = winner.targetPlayerIds[0];
      if (target)
        roundScores[target] = (roundScores[target] ?? 0) + SUSPECT_POINTS_PER_CORRECT_VOTE;
    });
    return {
      ...session,
      status: 'results',
      votingDeadlineAt: null,
      selectedPlayerIds: [...winningIds],
      voteSummary,
      roundScores,
    };
  }

  const correctVotes = Object.values(session.votes).filter((targets) =>
    isExactTargetSet(targets, session.selectedPlayerIds),
  ).length;
  const voterPoints =
    session.prompt.roundType === 'double-trouble'
      ? SUSPECT_POINTS_PER_DOUBLE_VOTE
      : SUSPECT_POINTS_PER_CORRECT_VOTE;
  Object.entries(session.votes).forEach(([playerId, targets]) => {
    if (isExactTargetSet(targets, session.selectedPlayerIds)) {
      roundScores[playerId] = voterPoints;
    }
  });
  if (session.selectedPlayerIds.length > 0 && correctVotes === 0) {
    session.selectedPlayerIds.forEach((playerId) => {
      roundScores[playerId] = SUSPECT_POINTS_FOR_SURVIVAL;
      if (session.alibiText && session.alibiPlayerId === playerId) {
        roundScores[playerId] += SUSPECT_POINTS_FOR_ALIBI;
      }
    });
  }

  return {
    ...session,
    status: 'results',
    votingDeadlineAt: null,
    voteSummary,
    roundScores,
  };
}

export function advanceSuspectRound(
  session: SuspectSessionState,
  prompts: readonly SuspectPrompt[],
  now = Date.now(),
  inputDurationMs = SUSPECT_INPUT_DURATION_MS,
  alibiDurationMs = SUSPECT_ALIBI_DURATION_MS,
  votingDurationMs = SUSPECT_VOTING_DURATION_MS,
): SuspectSessionState {
  if (session.status !== 'results') throw new Error('Results must be revealed before advancing.');
  if (session.roundNumber >= session.totalRounds) {
    return { ...session, status: 'complete', votingDeadlineAt: null };
  }

  const orderedPrompts = session.promptOrder
    .map((promptId) => prompts.find((prompt) => prompt.id === promptId))
    .filter((prompt): prompt is SuspectPrompt => Boolean(prompt));
  const nextPrompt =
    orderedPrompts.find((prompt) => !session.usedPromptIds.includes(prompt.id)) ??
    prompts[session.roundNumber % prompts.length];
  if (!nextPrompt) throw new Error('Suspect could not select the next prompt.');

  const next = createStateForPrompt(
    nextPrompt,
    orderedPrompts,
    session.totalRounds,
    session.roundNumber + 1,
    now,
    inputDurationMs,
    alibiDurationMs,
    votingDurationMs,
    session.selectionSeed,
    session.selectionCounts,
  );
  return { ...next, usedPromptIds: [...session.usedPromptIds, nextPrompt.id] };
}

export function getSuspectPublicView(
  session: SuspectSessionState,
  totalPlayers: number,
): SuspectPublicView {
  const reveal = session.status === 'results' || session.status === 'complete';
  return {
    id: SUSPECT_GAME_ID,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    prompt: session.prompt.text,
    promptId: session.prompt.id,
    roundType: session.prompt.roundType,
    deadlineAt:
      session.status === 'input'
        ? session.inputDeadlineAt
        : session.status === 'alibi'
          ? session.alibiDeadlineAt
          : session.status === 'voting'
            ? session.votingDeadlineAt
            : null,
    submittedCount: Object.keys(session.answers).length,
    totalPlayers,
    matchedCount:
      reveal && session.prompt.roundType !== 'false-accusation'
        ? session.matchedPlayerIds.length
        : 0,
    selectedPlayerIds: reveal ? session.selectedPlayerIds : [],
    alibiPlayerId: session.alibiPlayerId,
    alibiText: session.alibiText,
    voteSummary: reveal ? session.voteSummary : [],
    roundScores: reveal
      ? Object.entries(session.roundScores).map(([playerId, points]) => ({ playerId, points }))
      : [],
  };
}

export function getSuspectPlayerView(
  session: SuspectSessionState,
  playerId: PlayerId,
  playerIds: readonly PlayerId[],
): SuspectPlayerView {
  const reveal = session.status === 'results' || session.status === 'complete';
  const ownVoteTargetIds = session.votes[playerId] ?? [];
  return {
    id: SUSPECT_GAME_ID,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    prompt: session.prompt.text,
    promptId: session.prompt.id,
    roundType: session.prompt.roundType,
    deadlineAt:
      session.status === 'input'
        ? session.inputDeadlineAt
        : session.status === 'alibi'
          ? session.alibiDeadlineAt
          : session.status === 'voting'
            ? session.votingDeadlineAt
            : null,
    hasSubmitted: session.answers[playerId] !== undefined,
    ownAnswer: session.answers[playerId] ?? null,
    canSubmitAlibi: session.status === 'alibi' && session.alibiPlayerId === playerId,
    ownAlibi: session.alibiPlayerId === playerId ? session.alibiText : null,
    alibiPlayerId: session.alibiPlayerId,
    hasVoted: Boolean(session.votes[playerId]),
    ownVoteTargetIds,
    candidatePlayerIds:
      session.status === 'voting' ? playerIds.filter((id) => id !== playerId) : [],
    selectedPlayerIds: reveal ? session.selectedPlayerIds : [],
  };
}

function selectSuspects(
  roundType: SuspectRoundType,
  matchedPlayerIds: readonly PlayerId[],
  selectionCounts: Readonly<Record<PlayerId, number>>,
  selectionSeed: string,
  roundNumber: number,
): readonly PlayerId[] {
  if (roundType === 'false-accusation') return [];
  if (roundType === 'most-likely') return [];
  const required = roundType === 'double-trouble' ? 2 : 1;
  if (matchedPlayerIds.length < required) return [];
  return [...matchedPlayerIds]
    .sort((left, right) => {
      const exposureDifference = (selectionCounts[left] ?? 0) - (selectionCounts[right] ?? 0);
      if (exposureDifference !== 0) return exposureDifference;
      const leftRank = stableHash(`${selectionSeed}:${roundNumber}:${left}`);
      const rightRank = stableHash(`${selectionSeed}:${roundNumber}:${right}`);
      return leftRank - rightRank || left.localeCompare(right);
    })
    .slice(0, required);
}

function isExactTargetSet(left: readonly PlayerId[], right: readonly PlayerId[]): boolean {
  return left.length === right.length && left.every((playerId) => right.includes(playerId));
}

function summarizeVotes(
  votes: Readonly<Record<PlayerId, readonly PlayerId[]>>,
): readonly SuspectVoteSummary[] {
  const counts = new Map<string, { targetPlayerIds: readonly PlayerId[]; count: number }>();
  Object.values(votes).forEach((targets) => {
    const key = targets.join('|') || 'none';
    const current = counts.get(key);
    counts.set(key, {
      targetPlayerIds: current?.targetPlayerIds ?? targets,
      count: (current?.count ?? 0) + 1,
    });
  });
  return [...counts.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.targetPlayerIds.join().localeCompare(right.targetPlayerIds.join()),
  );
}

function createStateForPrompt(
  prompt: SuspectPrompt,
  orderedPrompts: readonly SuspectPrompt[],
  totalRounds: number,
  roundNumber: number,
  now: number,
  inputDurationMs: number,
  alibiDurationMs: number,
  votingDurationMs: number,
  selectionSeed: string,
  selectionCounts: Readonly<Record<PlayerId, number>>,
): SuspectSessionState {
  const mostLikely = prompt.roundType === 'most-likely';
  return {
    status: mostLikely ? 'voting' : 'input',
    roundNumber,
    totalRounds,
    prompt,
    promptOrder: orderedPrompts.map((item) => item.id),
    usedPromptIds: [prompt.id],
    inputDeadlineAt: mostLikely ? null : now + inputDurationMs,
    alibiDeadlineAt: null,
    votingDeadlineAt: mostLikely ? now + votingDurationMs : null,
    answers: {},
    matchedPlayerIds: [],
    selectedPlayerIds: [],
    alibiPlayerId: null,
    alibiText: null,
    votes: {},
    voteSummary: [],
    roundScores: {},
    selectionCounts,
    selectionSeed,
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shufflePrompts(prompts: readonly SuspectPrompt[]): readonly SuspectPrompt[] {
  const shuffled = [...prompts];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    const current = shuffled[index];
    const swap = shuffled[swapIndex];
    if (current && swap) {
      shuffled[index] = swap;
      shuffled[swapIndex] = current;
    }
  }
  return shuffled;
}

function orderPrompts(
  prompts: readonly SuspectPrompt[],
  randomizePrompts: boolean,
  avoidFirstPromptId?: string,
): readonly SuspectPrompt[] {
  const ordered = randomizePrompts ? [...shufflePrompts(prompts)] : [...prompts];
  if (randomizePrompts && ordered.length > 1 && ordered[0]?.id === avoidFirstPromptId) {
    const first = ordered[0];
    const replacement = ordered[1];
    if (first && replacement) {
      ordered[0] = replacement;
      ordered[1] = first;
    }
  }
  return ordered;
}
