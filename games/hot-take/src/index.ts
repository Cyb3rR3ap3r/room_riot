import { randomUUID } from 'node:crypto';
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { ContentMode, PlayerId } from '@room-riot/contracts';

export const HOT_TAKE_GAME_ID = 'hot-take' as const;
export const HOT_TAKE_POINTS_PER_VOTE = 100;
export const HOT_TAKE_INPUT_DURATION_MS = 60_000;
export const HOT_TAKE_VOTING_DURATION_MS = 45_000;

const PromptKindSchema = z.enum(['open', 'player-targeted']);
const PromptSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1),
  kind: PromptKindSchema,
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

export type HotTakePromptKind = z.infer<typeof PromptKindSchema>;

export interface HotTakePrompt {
  readonly id: string;
  readonly text: string;
  readonly kind: HotTakePromptKind;
}

export interface HotTakeAnswer {
  readonly entryId: string;
  readonly display: string;
  readonly targetPlayerId: PlayerId | null;
}

export interface HotTakeEntryView {
  readonly entryId: string;
  readonly answer: string;
  readonly voteCount: number;
  readonly points: number;
}

export interface HotTakeSessionState {
  readonly status: 'input' | 'voting' | 'results' | 'complete';
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: HotTakePrompt;
  readonly promptOrder: readonly string[];
  readonly usedPromptIds: readonly string[];
  readonly inputDeadlineAt: number | null;
  readonly votingDeadlineAt: number | null;
  readonly answers: Readonly<Record<PlayerId, HotTakeAnswer>>;
  readonly votes: Readonly<Record<PlayerId, string>>;
  readonly entries: readonly HotTakeEntryView[];
  readonly roundScores: Readonly<Record<PlayerId, number>>;
}

export interface HotTakePublicView {
  readonly id: typeof HOT_TAKE_GAME_ID;
  readonly status: HotTakeSessionState['status'];
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: string;
  readonly promptId: string;
  readonly promptKind: HotTakePromptKind;
  readonly deadlineAt: number | null;
  readonly submittedCount: number;
  readonly totalPlayers: number;
  readonly entries: readonly HotTakeEntryView[];
  readonly roundScores: readonly {
    readonly playerId: PlayerId;
    readonly points: number;
  }[];
}

export interface HotTakePlayerView {
  readonly id: typeof HOT_TAKE_GAME_ID;
  readonly status: HotTakeSessionState['status'];
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly prompt: string;
  readonly promptId: string;
  readonly promptKind: HotTakePromptKind;
  readonly deadlineAt: number | null;
  readonly hasSubmitted: boolean;
  readonly ownAnswer: string | null;
  readonly ownEntryId: string | null;
  readonly hasVoted: boolean;
  readonly entries: readonly HotTakeEntryView[];
}

export function loadHotTakePrompts(contentMode: ContentMode): readonly HotTakePrompt[] {
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
  'What is the most overrated {topic}?',
  'What {topic} trend needs to disappear?',
  'What is the worst thing to bring to {topic}?',
  'What rule about {topic} should be retired?',
  'What is the most suspicious {topic} choice?',
  'What {topic} is secretly more fun than people admit?',
  'What is the most annoying part of {topic}?',
  'What would improve {topic} overnight?',
  'What {topic} belongs in a museum?',
  'What is the worst excuse involving {topic}?',
  'What {topic} tradition should end?',
  'What {topic} deserves a warning label?',
  'What is the most overrated way to celebrate {topic}?',
  'What {topic} has the worst fan club?',
  'What is the strangest acceptable opinion about {topic}?',
  'What {topic} should be replaced by a four-day weekend?',
  'What is the worst possible theme for {topic}?',
  'What {topic} is only good because of the marketing?',
  'What {topic} causes the most unnecessary arguments?',
  'What is the most dramatic way to avoid {topic}?',
];

const EXPANSION_TOPICS: Record<ContentMode, readonly string[]> = {
  family: ['school lunch', 'a board game', 'a cartoon', 'a birthday party', 'a family road trip'],
  standard: [
    'fast food',
    'a streaming show',
    'an office meeting',
    'a tourist attraction',
    'social media',
  ],
  'after-dark': [
    'a first date',
    'a late-night text',
    'a bar order',
    'a party trend',
    'a relationship rule',
  ],
};

function expandCuratedPrompts(
  contentMode: ContentMode,
  prompts: readonly HotTakePrompt[],
): readonly HotTakePrompt[] {
  const existingText = new Set(prompts.map((prompt) => prompt.text));
  const generated = EXPANSION_TEMPLATES.flatMap((template) =>
    (EXPANSION_TOPICS[contentMode] ?? []).map((topic) => template.replace('{topic}', topic)),
  )
    .map((text, index) => ({
      id: `${contentMode}-curated-${String(index + 1).padStart(3, '0')}`,
      text,
      kind: 'open' as const,
    }))
    .filter((prompt) => {
      if (existingText.has(prompt.text)) return false;
      existingText.add(prompt.text);
      return true;
    });

  return [...prompts, ...generated].slice(0, Math.max(CURATED_PROMPT_TARGET, prompts.length));
}

export function createHotTakeSession(
  prompts: readonly HotTakePrompt[],
  totalRounds: number,
  now = Date.now(),
  inputDurationMs = HOT_TAKE_INPUT_DURATION_MS,
  randomizePrompts = false,
  avoidFirstPromptId?: string,
): HotTakeSessionState {
  const orderedPrompts = orderPrompts(prompts, randomizePrompts, avoidFirstPromptId);
  const firstPrompt = orderedPrompts[0];
  if (!firstPrompt) throw new Error('Hot Take requires at least one prompt.');
  if (!Number.isInteger(totalRounds) || totalRounds < 1) {
    throw new Error('Hot Take requires at least one round.');
  }
  if (!Number.isInteger(inputDurationMs) || inputDurationMs < 1) {
    throw new Error('Hot Take requires a positive input duration.');
  }

  return {
    status: 'input',
    roundNumber: 1,
    totalRounds,
    prompt: firstPrompt,
    promptOrder: orderedPrompts.map((prompt) => prompt.id),
    usedPromptIds: [firstPrompt.id],
    inputDeadlineAt: now + inputDurationMs,
    votingDeadlineAt: null,
    answers: {},
    votes: {},
    entries: [],
    roundScores: {},
  };
}

export function submitHotTakeAnswer(
  session: HotTakeSessionState,
  playerId: PlayerId,
  answer: string,
  targetPlayerId: PlayerId | undefined,
  playerIds: readonly PlayerId[],
  now?: number,
): HotTakeSessionState {
  if (session.status !== 'input') throw new Error('This round is no longer accepting answers.');
  if (now !== undefined && session.inputDeadlineAt !== null && now >= session.inputDeadlineAt) {
    throw new Error('The answer deadline has passed.');
  }
  if (session.answers[playerId]) throw new Error('This player already submitted an answer.');
  if (!playerIds.includes(playerId)) throw new Error('This player is not in the room.');

  const display = answer.trim();
  if (!display) throw new Error('Answer cannot be empty.');

  if (session.prompt.kind === 'player-targeted') {
    if (!targetPlayerId || !playerIds.includes(targetPlayerId)) {
      throw new Error('Choose a player from this room.');
    }
    if (targetPlayerId === playerId) {
      throw new Error('Choose another player for this prompt.');
    }
  } else if (targetPlayerId) {
    throw new Error('This prompt requires a text answer.');
  }

  const entryId = `entry-${randomUUID()}`;
  return {
    ...session,
    answers: {
      ...session.answers,
      [playerId]: {
        entryId,
        display,
        targetPlayerId: targetPlayerId ?? null,
      },
    },
  };
}

export function allHotTakePlayersSubmitted(
  session: HotTakeSessionState,
  playerIds: readonly PlayerId[],
): boolean {
  return playerIds.length > 0 && playerIds.every((playerId) => Boolean(session.answers[playerId]));
}

export function revealHotTakeAnswers(
  session: HotTakeSessionState,
  now = Date.now(),
  votingDurationMs = HOT_TAKE_VOTING_DURATION_MS,
): HotTakeSessionState {
  if (session.status !== 'input') return session;
  if (!Number.isInteger(votingDurationMs) || votingDurationMs < 1) {
    throw new Error('Hot Take requires a positive voting duration.');
  }

  return {
    ...session,
    status: 'voting',
    inputDeadlineAt: null,
    votingDeadlineAt: now + votingDurationMs,
    entries: createVotingEntries(session),
  };
}

export function submitHotTakeVote(
  session: HotTakeSessionState,
  voterId: PlayerId,
  entryId: string,
  now?: number,
): HotTakeSessionState {
  if (session.status !== 'voting') throw new Error('This round is not accepting votes.');
  if (now !== undefined && session.votingDeadlineAt !== null && now >= session.votingDeadlineAt) {
    throw new Error('The voting deadline has passed.');
  }
  if (session.votes[voterId]) throw new Error('This player already voted.');
  if (!session.answers[voterId]) throw new Error('This player did not submit an answer.');

  const entryOwner = Object.entries(session.answers).find(
    ([, answer]) => answer.entryId === entryId,
  )?.[0];
  if (!entryOwner) throw new Error('That answer is no longer available.');
  if (entryOwner === voterId) throw new Error('You cannot vote for your own answer.');

  return {
    ...session,
    votes: {
      ...session.votes,
      [voterId]: entryId,
    },
  };
}

export function allHotTakePlayersVoted(
  session: HotTakeSessionState,
  playerIds: readonly PlayerId[],
): boolean {
  const eligiblePlayers = playerIds.filter(
    (playerId) =>
      session.answers[playerId] &&
      Object.entries(session.answers).some(([ownerId]) => ownerId !== playerId),
  );
  return (
    eligiblePlayers.length > 0 &&
    eligiblePlayers.every((playerId) => Boolean(session.votes[playerId]))
  );
}

export function revealHotTakeVotes(session: HotTakeSessionState): HotTakeSessionState {
  if (session.status !== 'voting') return session;

  const voteCounts = new Map<string, number>();
  Object.values(session.votes).forEach((entryId) => {
    voteCounts.set(entryId, (voteCounts.get(entryId) ?? 0) + 1);
  });

  const entries = session.entries.map(({ entryId }) => {
    const voteCount = voteCounts.get(entryId) ?? 0;
    return {
      entryId,
      answer: entryId,
      voteCount,
      points: voteCount * HOT_TAKE_POINTS_PER_VOTE,
    };
  });

  const roundScores: Record<PlayerId, number> = {};
  Object.entries(session.answers).forEach(([playerId, answer]) => {
    roundScores[playerId] = voteCounts.get(answer.entryId) ?? 0;
    roundScores[playerId] *= HOT_TAKE_POINTS_PER_VOTE;
  });

  return {
    ...session,
    status: 'results',
    votingDeadlineAt: null,
    entries,
    roundScores,
  };
}

export function advanceHotTakeRound(
  session: HotTakeSessionState,
  prompts: readonly HotTakePrompt[],
  now = Date.now(),
  inputDurationMs = HOT_TAKE_INPUT_DURATION_MS,
): HotTakeSessionState {
  if (session.status !== 'results') throw new Error('Results must be revealed before advancing.');
  if (!Number.isInteger(inputDurationMs) || inputDurationMs < 1) {
    throw new Error('Hot Take requires a positive input duration.');
  }
  if (session.roundNumber >= session.totalRounds) {
    return {
      ...session,
      status: 'complete',
      inputDeadlineAt: null,
      votingDeadlineAt: null,
    };
  }

  const orderedPrompts = session.promptOrder
    .map((promptId) => prompts.find((prompt) => prompt.id === promptId))
    .filter((prompt): prompt is HotTakePrompt => Boolean(prompt));
  const nextPrompt =
    orderedPrompts.find((prompt) => !session.usedPromptIds.includes(prompt.id)) ??
    prompts[session.roundNumber % prompts.length];
  if (!nextPrompt) throw new Error('Hot Take could not select the next prompt.');

  return {
    ...session,
    status: 'input',
    roundNumber: session.roundNumber + 1,
    prompt: nextPrompt,
    usedPromptIds: [...session.usedPromptIds, nextPrompt.id],
    inputDeadlineAt: now + inputDurationMs,
    votingDeadlineAt: null,
    answers: {},
    votes: {},
    entries: [],
    roundScores: {},
  };
}

function shufflePrompts(prompts: readonly HotTakePrompt[]): readonly HotTakePrompt[] {
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
  prompts: readonly HotTakePrompt[],
  randomizePrompts: boolean,
  avoidFirstPromptId?: string,
): readonly HotTakePrompt[] {
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

export function getHotTakePublicView(
  session: HotTakeSessionState,
  totalPlayers: number,
  playerNames: Readonly<Record<PlayerId, string>> = {},
): HotTakePublicView {
  return {
    id: HOT_TAKE_GAME_ID,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    prompt: session.prompt.text,
    promptId: session.prompt.id,
    promptKind: session.prompt.kind,
    deadlineAt:
      session.status === 'input'
        ? session.inputDeadlineAt
        : session.status === 'voting'
          ? session.votingDeadlineAt
          : null,
    submittedCount: Object.keys(session.answers).length,
    totalPlayers,
    entries: getEntriesForView(session, playerNames),
    roundScores:
      session.status === 'input' || session.status === 'voting'
        ? []
        : Object.entries(session.roundScores).map(([playerId, points]) => ({ playerId, points })),
  };
}

export function getHotTakePlayerView(
  session: HotTakeSessionState,
  playerId: PlayerId,
  playerNames: Readonly<Record<PlayerId, string>> = {},
): HotTakePlayerView {
  const ownAnswer = session.answers[playerId];
  const publicEntries = getEntriesForView(session, playerNames);

  return {
    id: HOT_TAKE_GAME_ID,
    status: session.status,
    roundNumber: session.roundNumber,
    totalRounds: session.totalRounds,
    prompt: session.prompt.text,
    promptId: session.prompt.id,
    promptKind: session.prompt.kind,
    deadlineAt:
      session.status === 'input'
        ? session.inputDeadlineAt
        : session.status === 'voting'
          ? session.votingDeadlineAt
          : null,
    hasSubmitted: Boolean(ownAnswer),
    ownAnswer: ownAnswer ? answerDisplay(ownAnswer, playerNames) : null,
    ownEntryId: ownAnswer?.entryId ?? null,
    hasVoted: Boolean(session.votes[playerId]),
    entries: publicEntries.filter((entry) => entry.entryId !== ownAnswer?.entryId),
  };
}

function getEntriesForView(
  session: HotTakeSessionState,
  playerNames: Readonly<Record<PlayerId, string>>,
): readonly HotTakeEntryView[] {
  if (session.status === 'input') return [];

  if (session.status === 'results' || session.status === 'complete') {
    return session.entries.map((entry) => {
      const owner = Object.values(session.answers).find(
        (answer) => answer.entryId === entry.entryId,
      );
      return {
        ...entry,
        answer: owner ? answerDisplay(owner, playerNames) : entry.answer,
      };
    });
  }

  return session.entries.map((entry) => {
    const answer = Object.values(session.answers).find(
      (candidate) => candidate.entryId === entry.entryId,
    );
    return {
      ...entry,
      answer: answer ? answerDisplay(answer, playerNames) : entry.answer,
    };
  });
}

/**
 * Produces the anonymous ballot once. Starting from entry ID order prevents answer object insertion
 * order (and therefore submission timing) from influencing the result. UUID-backed entry IDs give
 * each round fresh entropy while the persisted array keeps every subsequent snapshot stable.
 */
function createVotingEntries(session: HotTakeSessionState): readonly HotTakeEntryView[] {
  const entryIds = Object.values(session.answers)
    .map((answer) => answer.entryId)
    .sort((left, right) => left.localeCompare(right));
  const seed = stableHash(`${session.prompt.id}:${session.roundNumber}:${entryIds.join('|')}`);
  return entryIds
    .map((entryId) => ({
      entryId,
      answer: entryId,
      voteCount: 0,
      points: 0,
    }))
    .sort((left, right) => {
      const leftRank = stableHash(`${seed}:${left.entryId}`);
      const rightRank = stableHash(`${seed}:${right.entryId}`);
      return leftRank - rightRank || left.entryId.localeCompare(right.entryId);
    });
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function answerDisplay(
  answer: HotTakeAnswer,
  playerNames: Readonly<Record<PlayerId, string>>,
): string {
  return answer.targetPlayerId
    ? (playerNames[answer.targetPlayerId] ?? 'Unknown player')
    : answer.display;
}
