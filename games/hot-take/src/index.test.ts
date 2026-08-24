import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOT_TAKE_POINTS_PER_VOTE,
  advanceHotTakeRound,
  allHotTakePlayersSubmitted,
  allHotTakePlayersVoted,
  createHotTakeSession,
  getHotTakePlayerView,
  getHotTakePublicView,
  loadHotTakePrompts,
  revealHotTakeAnswers,
  revealHotTakeVotes,
  submitHotTakeAnswer,
  submitHotTakeVote,
} from './index.js';

const prompts = [
  { id: 'open', text: 'What is the best terrible movie?', kind: 'open' as const },
  { id: 'target', text: 'Who would survive longest?', kind: 'player-targeted' as const },
];
const playerIds = ['p1', 'p2', 'p3'];
const playerNames = { p1: 'Alex', p2: 'Blair', p3: 'Casey' };

test('loads at least 100 unique curated prompts for every content mode', () => {
  (['family', 'standard', 'after-dark'] as const).forEach((contentMode) => {
    const loaded = loadHotTakePrompts(contentMode);
    assert.ok(loaded.length >= 100);
    assert.equal(new Set(loaded.map((prompt) => prompt.id)).size, loaded.length);
    assert.equal(new Set(loaded.map((prompt) => prompt.text)).size, loaded.length);
  });
});

test('runs anonymous answers through voting and server-side scoring', () => {
  let session = createHotTakeSession(prompts, 1, 1_000, 30_000);
  session = submitHotTakeAnswer(session, 'p1', 'Movie A', undefined, playerIds);
  session = submitHotTakeAnswer(session, 'p2', 'Movie B', undefined, playerIds);
  session = submitHotTakeAnswer(session, 'p3', 'Movie C', undefined, playerIds);
  assert.equal(allHotTakePlayersSubmitted(session, playerIds), true);

  session = revealHotTakeAnswers(session, 2_000, 10_000);
  const p1Entry = session.answers.p1?.entryId;
  const p2Entry = session.answers.p2?.entryId;
  assert.ok(p1Entry);
  assert.ok(p2Entry);

  const playerView = getHotTakePlayerView(session, 'p1', playerNames);
  assert.equal(
    playerView.entries.some((entry) => entry.entryId === p1Entry),
    false,
  );
  assert.equal(playerView.entries.length, 2);

  session = submitHotTakeVote(session, 'p1', p2Entry);
  session = submitHotTakeVote(session, 'p2', p1Entry);
  session = submitHotTakeVote(session, 'p3', p1Entry);
  assert.equal(allHotTakePlayersVoted(session, playerIds), true);

  session = revealHotTakeVotes(session);
  const publicView = getHotTakePublicView(session, 3, playerNames);
  assert.equal(publicView.status, 'results');
  assert.equal(publicView.entries[0]?.voteCount, 2);
  assert.equal(publicView.entries[0]?.points, 2 * HOT_TAKE_POINTS_PER_VOTE);
  assert.equal(publicView.roundScores.find((score) => score.playerId === 'p1')?.points, 200);
  assert.equal(publicView.roundScores.find((score) => score.playerId === 'p2')?.points, 100);
});

test('resolves player-targeted prompts without exposing answer ownership', () => {
  let session = createHotTakeSession([prompts[1]!], 1, 1_000, 30_000);
  session = submitHotTakeAnswer(session, 'p1', 'p2', 'p2', playerIds);
  session = submitHotTakeAnswer(session, 'p2', 'p3', 'p3', playerIds);
  session = submitHotTakeAnswer(session, 'p3', 'p1', 'p1', playerIds);
  session = revealHotTakeAnswers(session, 2_000, 10_000);

  const publicView = getHotTakePublicView(session, 3, playerNames);
  assert.deepEqual(publicView.entries.map((entry) => entry.answer).sort(), [
    'Alex',
    'Blair',
    'Casey',
  ]);
  assert.equal(
    publicView.entries.some((entry) => entry.answer === 'p2'),
    false,
  );
});

test('advances to the next prompt and completes after the final round', () => {
  let session = createHotTakeSession(prompts, 2, 1_000, 30_000);
  session = submitHotTakeAnswer(session, 'p1', 'a', undefined, playerIds);
  session = revealHotTakeAnswers(session, 2_000, 10_000);
  session = revealHotTakeVotes(session);
  session = advanceHotTakeRound(session, prompts, 3_000, 30_000);
  assert.equal(session.status, 'input');
  assert.equal(session.roundNumber, 2);
  assert.equal(session.prompt.id, 'target');

  session = submitHotTakeAnswer(session, 'p1', 'p2', 'p2', playerIds);
  session = revealHotTakeAnswers(session, 4_000, 10_000);
  session = revealHotTakeVotes(session);
  session = advanceHotTakeRound(session, prompts, 5_000, 30_000);
  assert.equal(session.status, 'complete');
});

test('cycles to the correct prompt after the prompt deck is exhausted', () => {
  let session = createHotTakeSession(prompts, 4);
  const sequence = [session.prompt.id];
  for (let round = 1; round < 4; round += 1) {
    const targeted = session.prompt.kind === 'player-targeted';
    session = submitHotTakeAnswer(
      session,
      'p1',
      targeted ? 'p2' : 'take',
      targeted ? 'p2' : undefined,
      playerIds,
    );
    session = revealHotTakeAnswers(session);
    session = revealHotTakeVotes(session);
    session = advanceHotTakeRound(session, prompts);
    sequence.push(session.prompt.id);
  }
  assert.deepEqual(sequence, ['open', 'target', 'open', 'target']);
});

test('rejects votes submitted after the voting deadline', () => {
  let session = createHotTakeSession([prompts[0]!], 1, 0, 10);
  session = submitHotTakeAnswer(session, 'p1', 'a', undefined, playerIds, 1);
  session = submitHotTakeAnswer(session, 'p2', 'b', undefined, playerIds, 1);
  session = revealHotTakeAnswers(session, 2, 10);

  assert.throws(
    () => submitHotTakeVote(session, 'p1', session.answers.p2!.entryId, 13),
    /voting deadline/i,
  );
});
