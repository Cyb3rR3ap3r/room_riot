import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EventErrorSchema,
  INTERNAL_ERROR_MESSAGE,
  INVALID_REQUEST_MESSAGE,
  PlayerGameViewSchema,
  PlayerStateEnvelopeSchema,
  PublicGameViewSchema,
  ROOM_RIOT_PROTOCOL_VERSION,
  RoomSnapshotSchema,
} from './index.js';

const round = { roundNumber: 1, totalRounds: 5 } as const;
const prompt = { prompt: 'A safe prompt', promptId: 'prompt-1' } as const;
const playerId = 'player-1';

const publicViews = [
  {
    id: 'groupthink',
    status: 'input',
    ...round,
    ...prompt,
    inputDeadlineAt: 10,
    submittedCount: 0,
    totalPlayers: 4,
    groups: [],
    roundScores: [],
  },
  {
    id: 'hot-take',
    status: 'voting',
    ...round,
    ...prompt,
    promptKind: 'open',
    deadlineAt: 10,
    submittedCount: 4,
    totalPlayers: 4,
    entries: [{ entryId: 'entry-1', answer: 'A take', voteCount: 0, points: 0 }],
    roundScores: [],
  },
  {
    id: 'suspect',
    status: 'input',
    ...round,
    ...prompt,
    roundType: 'standard',
    deadlineAt: 10,
    submittedCount: 0,
    totalPlayers: 4,
    matchedCount: 0,
    selectedPlayerIds: [],
    alibiPlayerId: null,
    alibiText: null,
    voteSummary: [],
    roundScores: [],
  },
  {
    id: 'drawn-out',
    status: 'fake-drawing',
    mode: 'fake-artist',
    ...round,
    prompt: null,
    promptId: null,
    deadlineAt: 10,
    artistPlayerId: null,
    activePlayerId: playerId,
    fakeArtistPlayerId: null,
    drawing: { strokes: [] },
    chain: [],
    guesses: [],
    votes: [],
    completedTurnCount: 0,
    guessCount: 0,
    voteCount: 0,
    submittedCount: 0,
    totalPlayers: 4,
    roundScores: [],
  },
] as const;

const privateViews = [
  {
    id: 'groupthink',
    status: 'input',
    ...round,
    ...prompt,
    inputDeadlineAt: 10,
    hasSubmitted: false,
    ownAnswer: null,
  },
  {
    id: 'hot-take',
    status: 'input',
    ...round,
    ...prompt,
    promptKind: 'open',
    deadlineAt: 10,
    hasSubmitted: false,
    ownAnswer: null,
    ownEntryId: null,
    hasVoted: false,
    entries: [],
  },
  {
    id: 'suspect',
    status: 'input',
    ...round,
    ...prompt,
    roundType: 'standard',
    deadlineAt: 10,
    hasSubmitted: false,
    ownAnswer: null,
    canSubmitAlibi: false,
    ownAlibi: null,
    alibiPlayerId: null,
    hasVoted: false,
    ownVoteTargetIds: [],
    candidatePlayerIds: [],
    selectedPlayerIds: [],
  },
  {
    id: 'drawn-out',
    status: 'fake-drawing',
    mode: 'fake-artist',
    ...round,
    deadlineAt: 10,
    task: 'draw',
    instruction: 'Draw a useful clue.',
    privatePrompt: null,
    sourceDescription: null,
    isFakeArtist: true,
    hasSubmitted: false,
    drawing: { strokes: [] },
    candidatePlayerIds: [],
    guessOptions: [],
    ownGuess: null,
    ownVotePlayerId: null,
  },
] as const;

test('parses every discriminated public and private game view', () => {
  publicViews.forEach((view) => assert.equal(PublicGameViewSchema.parse(view).id, view.id));
  privateViews.forEach((view) => assert.equal(PlayerGameViewSchema.parse(view).id, view.id));
});

test('requires room identity, protocol version, and revision on private state envelopes', () => {
  const envelope = {
    protocolVersion: ROOM_RIOT_PROTOCOL_VERSION,
    roomCode: 'ABCD',
    revision: 3,
    state: privateViews[0],
  };
  assert.deepEqual(PlayerStateEnvelopeSchema.parse(envelope), envelope);
  assert.equal(
    PlayerStateEnvelopeSchema.safeParse({ ...envelope, roomCode: undefined }).success,
    false,
  );
  assert.equal(
    PlayerStateEnvelopeSchema.safeParse({ ...envelope, protocolVersion: 2 }).success,
    false,
  );
});

test('rejects incompatible and malformed room snapshots', () => {
  const snapshot = {
    protocolVersion: ROOM_RIOT_PROTOCOL_VERSION,
    revision: 1,
    state: {
      roomCode: 'ABCD',
      phase: 'input',
      gameId: 'groupthink',
      settings: {
        maxPlayers: 12,
        roundCount: 5,
        contentMode: 'standard',
        promptMode: 'default',
        drawnOutMode: 'classic',
      },
      players: [],
    },
    game: publicViews[0],
    roster: { roundPlayerIds: [], queuedPlayerIds: [] },
  };
  assert.equal(RoomSnapshotSchema.parse(snapshot).protocolVersion, ROOM_RIOT_PROTOCOL_VERSION);
  assert.equal(RoomSnapshotSchema.safeParse({ ...snapshot, protocolVersion: 2 }).success, false);
  assert.equal(RoomSnapshotSchema.safeParse({ ...snapshot, revision: 0 }).success, false);
  assert.equal(
    RoomSnapshotSchema.safeParse({
      ...snapshot,
      state: { ...snapshot.state, phase: 'not-a-phase' },
    }).success,
    false,
  );
  assert.equal(
    RoomSnapshotSchema.safeParse({ ...snapshot, game: { ...publicViews[0], id: 'hot-take' } })
      .success,
    false,
  );
});

test('rejects private answers and unrevealed roles in public views', () => {
  assert.equal(
    PublicGameViewSchema.safeParse({ ...publicViews[0], ownAnswer: 'private answer' }).success,
    false,
  );
  assert.equal(
    PublicGameViewSchema.safeParse({ ...publicViews[2], answers: { [playerId]: true } }).success,
    false,
  );
  assert.equal(
    PublicGameViewSchema.safeParse({
      ...publicViews[2],
      selectedPlayerIds: [playerId],
    }).success,
    false,
  );
  assert.equal(
    PublicGameViewSchema.safeParse({
      ...publicViews[3],
      prompt: 'Secret prompt',
      promptId: 'secret-1',
      fakeArtistPlayerId: playerId,
    }).success,
    false,
  );
});

test('accepts only documented public error envelopes', () => {
  assert.equal(
    EventErrorSchema.safeParse({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: INVALID_REQUEST_MESSAGE },
    }).success,
    true,
  );
  assert.equal(
    EventErrorSchema.safeParse({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: INTERNAL_ERROR_MESSAGE,
        correlationId: '018f47a8-62d7-7e3b-8e53-93f818f52237',
      },
    }).success,
    true,
  );
  assert.equal(
    EventErrorSchema.safeParse({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'C:\\server\\secret.ts:42' },
    }).success,
    false,
  );
  assert.equal(
    EventErrorSchema.safeParse({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: INVALID_REQUEST_MESSAGE,
        parserIssues: [],
      },
    }).success,
    false,
  );
});
