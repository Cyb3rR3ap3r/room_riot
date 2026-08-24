import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { ContentMode, PlayerId } from '@room-riot/contracts';

export const GROUPTHINK_GAME_ID = 'groupthink' as const;
export const GROUPTHINK_POINTS_PER_MATCH = 100;
export const GROUPTHINK_INPUT_DURATION_MS = 60_000;

const PromptSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1),
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

export interface GroupthinkPrompt {
  readonly id: string;
  readonly text: string;
}

export interface GroupthinkAnswer {
  readonly display: string;
  readonly normalized: string;
}

export interface GroupthinkAnswerGroup {
  readonly normalized: string;
  readonly answer: string;
  readonly playerIds: readonly PlayerId[];
  readonly count: number;
  readonly points: number;
}

export interface GroupthinkSessionState {
  readonly status: 'input' | 'results' | 'complete';
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: GroupthinkPrompt;
  readonly promptOrder: readonly string[];
  readonly inputDeadlineAt: number | null;
  readonly usedPromptIds: readonly string[];
  readonly answers: Readonly<Record<PlayerId, GroupthinkAnswer>>;
  readonly groups: readonly GroupthinkAnswerGroup[];
  readonly roundScores: Readonly<Record<PlayerId, number>>;
}

export interface GroupthinkPublicView {
  readonly id: typeof GROUPTHINK_GAME_ID;
  readonly status: GroupthinkSessionState['status'];
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: string;
  readonly promptId: string;
  readonly inputDeadlineAt: number | null;
  readonly submittedCount: number;
  readonly totalPlayers: number;
  readonly groups: readonly {
    readonly answer: string;
    readonly count: number;
    readonly points: number;
  }[];
  readonly roundScores: readonly {
    readonly playerId: PlayerId;
    readonly points: number;
  }[];
}

export interface GroupthinkPlayerView {
  readonly id: typeof GROUPTHINK_GAME_ID;
  readonly status: GroupthinkSessionState['status'];
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: string;
  readonly promptId: string;
  readonly inputDeadlineAt: number | null;
  readonly hasSubmitted: boolean;
  readonly ownAnswer: string | null;
}

export function loadGroupthinkPrompts(contentMode: ContentMode): readonly GroupthinkPrompt[] {
  const contentPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../content',
    `${contentMode}.json`,
  );
  const parsed = PromptFileSchema.parse(JSON.parse(readFileSync(contentPath, 'utf8')));
  return expandCuratedPrompts(contentMode, parsed.prompts);
}

const CURATED_PROMPT_TARGET = 100;
const EXPANSION_TEMPLATES: readonly string[] = [
  'Name something people bring to {topic}.',
  'Name a reason to leave {topic} early.',
  'Name something that makes {topic} more fun.',
  'Name something you would never say at {topic}.',
  'Name something people forget before {topic}.',
  'Name a sound you expect at {topic}.',
  'Name a rule people bend during {topic}.',
  'Name a snack that belongs at {topic}.',
  'Name something that always goes missing during {topic}.',
  'Name something that makes {topic} awkward.',
  'Name a job you would hate to do during {topic}.',
  'Name something people pretend to enjoy at {topic}.',
  'Name a surprise that would ruin {topic}.',
  'Name something that makes people late for {topic}.',
  'Name a thing that should have a fast lane at {topic}.',
  'Name a phrase that starts an argument at {topic}.',
  'Name something people overpack for {topic}.',
  'Name something that needs a warning at {topic}.',
  'Name an object you would save first at {topic}.',
  'Name a reason to check your phone during {topic}.',
];

const EXPANSION_TOPICS: Record<ContentMode, readonly string[]> = {
  family: [
    'a school talent show',
    'a birthday party',
    'a family road trip',
    'a sleepover',
    'a board-game night',
  ],
  standard: [
    'a work meeting',
    'a weekend trip',
    'a neighborhood barbecue',
    'a first date',
    'an airport',
  ],
  'after-dark': [
    'a late-night diner run',
    'a crowded bar',
    'a house party',
    'a midnight road trip',
    'an awkward first date',
  ],
};

function expandCuratedPrompts(
  contentMode: ContentMode,
  prompts: readonly GroupthinkPrompt[],
): readonly GroupthinkPrompt[] {
  const existingText = new Set(prompts.map((prompt) => prompt.text));
  const generated = EXPANSION_TEMPLATES.flatMap((template) =>
    (EXPANSION_TOPICS[contentMode] ?? []).map((topic) => template.replace('{topic}', topic)),
  )
    .map((text, index) => ({
      id: `${contentMode}-curated-${String(index + 1).padStart(3, '0')}`,
      text,
    }))
    .filter((prompt) => {
      if (existingText.has(prompt.text)) return false;
      existingText.add(prompt.text);
      return true;
    });

  return [...prompts, ...generated].slice(0, Math.max(CURATED_PROMPT_TARGET, prompts.length));
}

export function normalizeAnswer(answer: string): string {
  return answer
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[“”‘’'.,!?;:()[\]{}\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createGroupthinkSession(
  prompts: readonly GroupthinkPrompt[],
  totalRounds: number,
  now = Date.now(),
  inputDurationMs = GROUPTHINK_INPUT_DURATION_MS,
  randomizePrompts = false,
  avoidFirstPromptId?: string,
): GroupthinkSessionState {
  const orderedPrompts = orderPrompts(prompts, randomizePrompts, avoidFirstPromptId);
  const firstPrompt = orderedPrompts[0];
  if (!firstPrompt) throw new Error('Groupthink requires at least one prompt.');
  if (!Number.isInteger(totalRounds) || totalRounds < 1) {
    throw new Error('Groupthink requires at least one round.');
  }
  if (!Number.isInteger(inputDurationMs) || inputDurationMs < 1) {
    throw new Error('Groupthink requires a positive input duration.');
  }

  return {
    status: 'input',
    roundNumber: 1,
    totalRounds,
    prompt: firstPrompt,
    promptOrder: orderedPrompts.map((prompt) => prompt.id),
    inputDeadlineAt: now + inputDurationMs,
    usedPromptIds: [firstPrompt.id],
    answers: {},
    groups: [],
    roundScores: {},
  };
}

export function submitGroupthinkAnswer(
  session: GroupthinkSessionState,
  playerId: PlayerId,
  answer: string,
  now?: number,
): GroupthinkSessionState {
  if (session.status !== 'input') throw new Error('This round is no longer accepting answers.');
  if (now !== undefined && session.inputDeadlineAt !== null && now >= session.inputDeadlineAt) {
    throw new Error('The answer deadline has passed.');
  }
  if (session.answers[playerId]) throw new Error('This player already submitted an answer.');

  const display = answer.trim();
  const normalized = normalizeAnswer(display);
  if (!normalized) throw new Error('Answer cannot be empty.');

  return {
    ...session,
    answers: {
      ...session.answers,
      [playerId]: { display, normalized },
    },
  };
}

export function allPlayersSubmitted(
  session: GroupthinkSessionState,
  playerIds: readonly PlayerId[],
): boolean {
  return playerIds.length > 0 && playerIds.every((playerId) => Boolean(session.answers[playerId]));
}

export function revealGroupthink(session: GroupthinkSessionState): GroupthinkSessionState {
  if (session.status !== 'input') return session;

  const groups = new Map<string, { answer: string; playerIds: PlayerId[] }>();
  Object.entries(session.answers).forEach(([playerId, answer]) => {
    const existing = groups.get(answer.normalized);
    if (existing) {
      existing.playerIds.push(playerId);
    } else {
      groups.set(answer.normalized, { answer: answer.display, playerIds: [playerId] });
    }
  });

  const rankedGroups = [...groups.entries()]
    .map(([normalized, group]) => ({
      normalized,
      answer: group.answer,
      playerIds: group.playerIds,
      count: group.playerIds.length,
      points: group.playerIds.length > 1 ? group.playerIds.length * GROUPTHINK_POINTS_PER_MATCH : 0,
    }))
    .sort((left, right) => right.count - left.count || left.answer.localeCompare(right.answer));

  const roundScores: Record<PlayerId, number> = {};
  rankedGroups.forEach((group) => {
    group.playerIds.forEach((playerId) => {
      roundScores[playerId] = group.points;
    });
  });

  return {
    ...session,
    status: 'results',
    inputDeadlineAt: null,
    groups: rankedGroups,
    roundScores,
  };
}

export function advanceGroupthinkRound(
  session: GroupthinkSessionState,
  prompts: readonly GroupthinkPrompt[],
  now = Date.now(),
  inputDurationMs = GROUPTHINK_INPUT_DURATION_MS,
): GroupthinkSessionState {
  if (session.status !== 'results') throw new Error('Results must be revealed before advancing.');
  if (session.roundNumber >= session.totalRounds) {
    return { ...session, status: 'complete', inputDeadlineAt: null };
  }

  const orderedPrompts = session.promptOrder
    .map((promptId) => prompts.find((prompt) => prompt.id === promptId))
    .filter((prompt): prompt is GroupthinkPrompt => Boolean(prompt));
  const nextPrompt =
    orderedPrompts.find((prompt) => !session.usedPromptIds.includes(prompt.id)) ??
    prompts[session.roundNumber % prompts.length];
  if (!nextPrompt) throw new Error('Groupthink could not select the next prompt.');

  return {
    ...session,
    status: 'input',
    roundNumber: session.roundNumber + 1,
    prompt: nextPrompt,
    inputDeadlineAt: now + inputDurationMs,
    usedPromptIds: [...session.usedPromptIds, nextPrompt.id],
    answers: {},
    groups: [],
    roundScores: {},
  };
}

function shufflePrompts(prompts: readonly GroupthinkPrompt[]): readonly GroupthinkPrompt[] {
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
  prompts: readonly GroupthinkPrompt[],
  randomizePrompts: boolean,
  avoidFirstPromptId?: string,
): readonly GroupthinkPrompt[] {
  const ordered = randomizePrompts ? [...shufflePrompts(prompts)] : [...prompts];
  if (randomizePrompts && ordered.length > 1 && ordered[0]?.id === avoidFirstPromptId) {
    const replacementIndex = 1;
    const first = ordered[0];
    const replacement = ordered[replacementIndex];
    if (first && replacement) {
      ordered[0] = replacement;
      ordered[replacementIndex] = first;
    }
  }
  return ordered;
}

export function getGroupthinkPublicView(
  session: GroupthinkSessionState,
  totalPlayers: number,
): GroupthinkPublicView {
  return {
    id: GROUPTHINK_GAME_ID,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    prompt: session.prompt.text,
    promptId: session.prompt.id,
    inputDeadlineAt: session.status === 'input' ? session.inputDeadlineAt : null,
    submittedCount: Object.keys(session.answers).length,
    totalPlayers,
    groups:
      session.status === 'input'
        ? []
        : session.groups.map(({ answer, count, points }) => ({ answer, count, points })),
    roundScores:
      session.status === 'input'
        ? []
        : Object.entries(session.roundScores).map(([playerId, points]) => ({
            playerId,
            points,
          })),
  };
}

export function getGroupthinkPlayerView(
  session: GroupthinkSessionState,
  playerId: PlayerId,
): GroupthinkPlayerView {
  return {
    id: GROUPTHINK_GAME_ID,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    prompt: session.prompt.text,
    promptId: session.prompt.id,
    inputDeadlineAt: session.status === 'input' ? session.inputDeadlineAt : null,
    hasSubmitted: Boolean(session.answers[playerId]),
    ownAnswer: session.answers[playerId]?.display ?? null,
  };
}
