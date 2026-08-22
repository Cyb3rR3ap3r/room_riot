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
