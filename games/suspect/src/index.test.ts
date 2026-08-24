import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUSPECT_POINTS_PER_CORRECT_VOTE,
  SUSPECT_POINTS_FOR_ALIBI,
  SUSPECT_POINTS_FOR_SURVIVAL,
  allSuspectPlayersAnswered,
  allSuspectPlayersVoted,
  createSuspectSession,
  expireSuspectAlibi,
  getSuspectPlayerView,
  getSuspectPublicView,
  loadSuspectPrompts,
  revealSuspectAnswers,
  revealSuspectVotes,
  submitSuspectAlibi,
  submitSuspectAnswer,
  submitSuspectVote,
} from './index.js';

const players = ['p1', 'p2', 'p3', 'p4'] as const;
const prompts = [
  {
    id: 'standard',
    text: 'I have borrowed a charger and never returned it.',
    roundType: 'standard' as const,
  },
  {
    id: 'alibi',
    text: 'I have pretended to be busy to avoid a plan.',
    roundType: 'alibi' as const,
  },
  {
    id: 'double',
    text: 'I have eaten dessert before dinner.',
    roundType: 'double-trouble' as const,
  },
  {
    id: 'false',
    text: 'I have won a hot-dog eating contest.',
    roundType: 'false-accusation' as const,
  },
  { id: 'most', text: 'Who would solve a mystery first?', roundType: 'most-likely' as const },
];

test('loads at least 100 unique prompts for every content mode', () => {
  (['family', 'standard', 'after-dark'] as const).forEach((contentMode) => {
    const loaded = loadSuspectPrompts(contentMode);
    assert.ok(loaded.length >= 100);
    assert.equal(new Set(loaded.map((prompt) => prompt.id)).size, loaded.length);
    assert.equal(new Set(loaded.map((prompt) => prompt.text)).size, loaded.length);
  });
});

test('keeps private answers hidden, then awards a correct accusation', () => {
  let session = createSuspectSession(prompts, 1, 1_000, 30_000, 10_000, 20_000);
  session = submitSuspectAnswer(session, 'p1', false);
  session = submitSuspectAnswer(session, 'p2', true);
  session = submitSuspectAnswer(session, 'p3', false);
  session = submitSuspectAnswer(session, 'p4', false);
  assert.equal(allSuspectPlayersAnswered(session, players), true);

  const privateBeforeReveal = getSuspectPlayerView(session, 'p2', players);
  assert.equal(privateBeforeReveal.ownAnswer, true);
  assert.equal(getSuspectPublicView(session, players.length).matchedCount, 0);

  session = revealSuspectAnswers(session, players, 2_000, 10_000, 20_000);
  assert.equal(session.status, 'voting');
  session = submitSuspectVote(session, 'p1', ['p2'], players, 3_000);
  session = submitSuspectVote(session, 'p2', ['p1'], players, 3_000);
  session = submitSuspectVote(session, 'p3', ['p2'], players, 3_000);
  session = submitSuspectVote(session, 'p4', ['p3'], players, 3_000);
  assert.equal(allSuspectPlayersVoted(session, players), true);
  const results = revealSuspectVotes(session);
  assert.equal(results.status, 'results');
  assert.equal(results.roundScores.p1, SUSPECT_POINTS_PER_CORRECT_VOTE);
  assert.equal(results.roundScores.p3, SUSPECT_POINTS_PER_CORRECT_VOTE);
  assert.equal(results.roundScores.p2, undefined);
});

test('supports an accused alibi and survival bonus', () => {
  let session = createSuspectSession([prompts[1]!], 1, 1_000, 30_000, 10_000, 20_000);
  session = submitSuspectAnswer(session, 'p1', true);
  session = submitSuspectAnswer(session, 'p2', false);
  session = submitSuspectAnswer(session, 'p3', false);
  session = submitSuspectAnswer(session, 'p4', false);
  session = revealSuspectAnswers(session, players, 2_000, 10_000, 20_000);
  assert.equal(session.status, 'alibi');
  assert.equal(session.alibiPlayerId, 'p1');
  assert.throws(() => submitSuspectAlibi(session, 'p2', 'Nope'), /accused player/i);
  session = submitSuspectAlibi(session, 'p1', 'I was helping someone else.', 3_000, 20_000);
  session = submitSuspectVote(session, 'p2', ['p3'], players, 4_000);
  session = submitSuspectVote(session, 'p3', ['p4'], players, 4_000);
  session = submitSuspectVote(session, 'p4', ['p2'], players, 4_000);
  session = submitSuspectVote(session, 'p1', ['p3'], players, 4_000);
  const results = revealSuspectVotes(session);
  assert.equal(results.roundScores.p1, SUSPECT_POINTS_FOR_SURVIVAL + SUSPECT_POINTS_FOR_ALIBI);
});

test('requires the exact pair in Double Trouble and recognizes No match', () => {
  let session = createSuspectSession([prompts[2]!], 1, 1_000);
  players.forEach((playerId, index) => {
    session = submitSuspectAnswer(session, playerId, index < 2);
  });
  session = revealSuspectAnswers(session, players, 2_000);
  assert.deepEqual(session.selectedPlayerIds, ['p1', 'p2']);
  session = submitSuspectVote(session, 'p1', ['p2', 'p3'], players, 3_000);
  assert.throws(() => submitSuspectVote(session, 'p2', ['p1'], players), /two players/i);
  session = submitSuspectVote(session, 'p2', ['p1', 'p3'], players, 3_000);
  session = submitSuspectVote(session, 'p3', ['p1', 'p2'], players, 3_000);
  session = submitSuspectVote(session, 'p4', ['p1', 'p2'], players, 3_000);
  const results = revealSuspectVotes(session);
  assert.equal(results.roundScores.p3, 150);
  assert.equal(results.roundScores.p4, 150);
});

test('false accusation awards players who choose No match', () => {
  let session = createSuspectSession([prompts[3]!], 1, 1_000);
  players.forEach((playerId) => {
    session = submitSuspectAnswer(session, playerId, true);
  });
  session = revealSuspectAnswers(session, players, 2_000);
  assert.deepEqual(session.selectedPlayerIds, []);
  players.forEach((playerId) => {
    session = submitSuspectVote(session, playerId, [], players, 3_000);
  });
  const results = revealSuspectVotes(session);
  assert.deepEqual(results.roundScores, {
    p1: SUSPECT_POINTS_PER_CORRECT_VOTE,
    p2: SUSPECT_POINTS_PER_CORRECT_VOTE,
    p3: SUSPECT_POINTS_PER_CORRECT_VOTE,
    p4: SUSPECT_POINTS_PER_CORRECT_VOTE,
  });
});

test('Most Likely skips private input and resolves a plurality', () => {
  let session = createSuspectSession([prompts[4]!], 1, 1_000);
  assert.equal(session.status, 'voting');
  session = submitSuspectVote(session, 'p1', ['p2'], players, 2_000);
  session = submitSuspectVote(session, 'p2', ['p3'], players, 2_000);
  session = submitSuspectVote(session, 'p3', ['p2'], players, 2_000);
  session = submitSuspectVote(session, 'p4', ['p2'], players, 2_000);
  const results = revealSuspectVotes(session);
  assert.deepEqual(results.selectedPlayerIds, ['p2']);
  assert.equal(results.roundScores.p1, SUSPECT_POINTS_PER_CORRECT_VOTE);
  assert.equal(results.roundScores.p3, SUSPECT_POINTS_PER_CORRECT_VOTE);
  assert.equal(results.roundScores.p4, SUSPECT_POINTS_PER_CORRECT_VOTE);
  assert.equal(results.roundScores.p2, SUSPECT_POINTS_PER_CORRECT_VOTE);
});

test('alibi deadline transitions to voting without accepting late text', () => {
  let session = createSuspectSession([prompts[1]!], 1, 1_000, 30_000, 10, 20_000);
  session = submitSuspectAnswer(session, 'p1', true);
  session = submitSuspectAnswer(session, 'p2', false);
  session = submitSuspectAnswer(session, 'p3', false);
  session = submitSuspectAnswer(session, 'p4', false);
  session = revealSuspectAnswers(session, players, 2_000, 10, 20_000);
  assert.throws(() => submitSuspectAlibi(session, 'p1', 'Too late', 3_000), /deadline/i);
  session = expireSuspectAlibi(session, 3_000, 20_000);
  assert.equal(session.status, 'voting');
});
