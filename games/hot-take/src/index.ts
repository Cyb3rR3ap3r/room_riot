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
  return parsed.prompts;
}

export function createHotTakeSession(
  prompts: readonly HotTakePrompt[],
  totalRounds: number,
  now = Date.now(),
  inputDurationMs = HOT_TAKE_INPUT_DURATION_MS,
  randomizePrompts = false,
): HotTakeSessionState {
  const orderedPrompts = randomizePrompts ? shufflePrompts(prompts) : prompts;
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

  const entries = Object.values(session.answers)
    .map(({ entryId }) => {
      const voteCount = voteCounts.get(entryId) ?? 0;
      return {
        entryId,
        answer: entryId,
        voteCount,
        points: voteCount * HOT_TAKE_POINTS_PER_VOTE,
      };
    })
    .sort(
      (left, right) =>
        right.voteCount - left.voteCount || left.entryId.localeCompare(right.entryId),
    );

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

  return Object.values(session.answers).map((answer) => ({
    entryId: answer.entryId,
    answer: answerDisplay(answer, playerNames),
    voteCount: 0,
    points: 0,
  }));
}

function answerDisplay(
  answer: HotTakeAnswer,
  playerNames: Readonly<Record<PlayerId, string>>,
): string {
  return answer.targetPlayerId
    ? (playerNames[answer.targetPlayerId] ?? 'Unknown player')
    : answer.display;
}
