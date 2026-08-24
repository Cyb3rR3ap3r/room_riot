import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GROUPTHINK_POINTS_PER_MATCH,
  advanceGroupthinkRound,
  allPlayersSubmitted,
  createGroupthinkSession,
  getGroupthinkPublicView,
  loadGroupthinkPrompts,
  normalizeAnswer,
  revealGroupthink,
  submitGroupthinkAnswer,
} from './index.js';

const prompts = [
  { id: 'one', text: 'Name something people lose.' },
  { id: 'two', text: 'Name a bad first date location.' },
];

test('loads at least 100 unique curated prompts for every content mode', () => {
  (['family', 'standard', 'after-dark'] as const).forEach((contentMode) => {
    const loaded = loadGroupthinkPrompts(contentMode);
    assert.ok(loaded.length >= 100);
    assert.equal(new Set(loaded.map((prompt) => prompt.id)).size, loaded.length);
    assert.equal(new Set(loaded.map((prompt) => prompt.text)).size, loaded.length);
  });
});

test('normalizes harmless formatting differences', () => {
  assert.equal(normalizeAnswer('  Phone! '), 'phone');
  assert.equal(normalizeAnswer('ice   cream'), 'ice cream');
});

test('groups matching answers and awards matching points', () => {
  let session = createGroupthinkSession(prompts, 2);
  session = submitGroupthinkAnswer(session, 'p1', ' Phone! ');
  session = submitGroupthinkAnswer(session, 'p2', 'phone');
  session = submitGroupthinkAnswer(session, 'p3', 'Wallet');
  assert.equal(allPlayersSubmitted(session, ['p1', 'p2', 'p3']), true);

  const results = revealGroupthink(session);
  const phoneGroup = results.groups.find((group) => group.answer === 'Phone!');
  const walletGroup = results.groups.find((group) => group.answer === 'Wallet');
  assert.equal(phoneGroup?.count, 2);
  assert.equal(phoneGroup?.points, 2 * GROUPTHINK_POINTS_PER_MATCH);
  assert.equal(walletGroup?.points, 0);
  assert.deepEqual(results.roundScores, { p1: 200, p2: 200, p3: 0 });
});

test('advances through rounds and completes after the final round', () => {
  let session = createGroupthinkSession(prompts, 2);
  session = submitGroupthinkAnswer(session, 'p1', 'yes');
  session = revealGroupthink(session);
  session = advanceGroupthinkRound(session, prompts);
  assert.equal(session.roundNumber, 2);
  assert.equal(session.prompt.id, 'two');
  assert.equal(session.status, 'input');

  session = submitGroupthinkAnswer(session, 'p1', 'yes');
  session = revealGroupthink(session);
  session = advanceGroupthinkRound(session, prompts);
  assert.equal(session.status, 'complete');
});

test('does not expose answers before results are revealed', () => {
  let session = createGroupthinkSession(prompts, 1, 1_000, 30_000);
  session = submitGroupthinkAnswer(session, 'p1', 'secret');
  const view = getGroupthinkPublicView(session, 2);

  assert.equal(view.submittedCount, 1);
  assert.equal(view.inputDeadlineAt, 31_000);
  assert.deepEqual(view.groups, []);
  assert.deepEqual(view.roundScores, []);

  const results = revealGroupthink(session);
  assert.equal(results.inputDeadlineAt, null);
});

test('cycles to the correct prompt after the prompt deck is exhausted', () => {
  let session = createGroupthinkSession(prompts, 4);
  const sequence = [session.prompt.id];
  for (let round = 1; round < 4; round += 1) {
    session = submitGroupthinkAnswer(session, 'p1', `answer-${round}`);
    session = revealGroupthink(session);
    session = advanceGroupthinkRound(session, prompts);
    sequence.push(session.prompt.id);
  }
  assert.deepEqual(sequence, ['one', 'two', 'one', 'two']);
});
