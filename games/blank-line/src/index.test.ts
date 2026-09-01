import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContentMode, DrawingData } from '@room-riot/contracts';

import {
  BLANK_LINE_POINTS_CORRECT_READ,
  BLANK_LINE_POINTS_ESCAPE,
  advanceBlankLineRound,
  createBlankLineSession,
  expireBlankLineStep,
  getBlankLinePlayerView,
  getBlankLinePublicView,
  loadBlankLinePrompts,
  revealBlankLineRound,
  submitBlankLineStroke,
  submitBlankLineVote,
  type BlankLinePrompt,
} from './index.js';

const players = ['p1', 'p2', 'p3'];
const prompts: readonly BlankLinePrompt[] = [
  { id: 'one', text: 'A lighthouse', category: 'places' },
  { id: 'two', text: 'A runaway shopping cart', category: 'actions' },
];
const stroke = (offset = 0): DrawingData => ({
  strokes: [
    {
      color: '#000000',
      width: 0.02,
      points: [
        { x: 0.1 + offset, y: 0.2 },
        { x: 0.3 + offset, y: 0.4 },
        { x: 0.5 + offset, y: 0.45 },
      ],
    },
  ],
});

function finishDrawing() {
  let session = createBlankLineSession(prompts, players, 2, 0, 1_000);
  for (let turn = 0; turn < players.length * 2; turn += 1) {
    const active = players[turn % players.length]!;
    session = submitBlankLineStroke(session, active, stroke(turn * 0.01), turn + 1, 1_000, 1_000);
  }
  return session;
}

test('every content mode loads 100 unique drawing topics across five categories', () => {
  const modes: readonly ContentMode[] = ['family', 'standard', 'after-dark'];
  for (const contentMode of modes) {
    const loaded = loadBlankLinePrompts(contentMode);
    assert.equal(loaded.length, 100);
    assert.equal(new Set(loaded.map((prompt) => prompt.id)).size, 100);
    assert.equal(new Set(loaded.map((prompt) => prompt.text.toLowerCase())).size, 100);
    assert.deepEqual(
      new Set(loaded.map((prompt) => prompt.category)),
      new Set(['creatures', 'objects', 'places', 'actions', 'wildcards']),
    );
  }
});

test('runs two live stroke circuits without leaking the topic or Blank', () => {
  let session = createBlankLineSession(prompts, players, 2, 0, 1_000);
  assert.equal(session.blankPlayerId, 'p1');
  assert.equal(getBlankLinePublicView(session).prompt, null);
  assert.equal(getBlankLinePublicView(session).blankPlayerId, null);
  assert.equal(getBlankLinePlayerView(session, 'p1').privatePrompt, null);
  assert.equal(getBlankLinePlayerView(session, 'p2').privatePrompt, 'A lighthouse');
  assert.equal(getBlankLinePlayerView(session, 'p1').task, 'draw');

  for (let turn = 0; turn < players.length * 2; turn += 1) {
    const active = players[turn % players.length]!;
    session = submitBlankLineStroke(session, active, stroke(turn * 0.01), turn + 1, 1_000, 1_000);
    const view = getBlankLinePublicView(session);
    assert.equal(view.strokeTimeline.length, turn + 1);
    assert.equal(view.drawing.strokes.length, turn + 1);
  }

  const view = getBlankLinePublicView(session);
  assert.equal(session.status, 'voting');
  assert.equal(view.activePlayerId, null);
  assert.equal(view.circuit, 2);
  assert.equal(view.turnIndex, 6);
  assert.equal(view.prompt, null);
});

test('rejects out-of-turn, empty, multi-stroke, duplicate-vote, and expired actions', () => {
  const session = createBlankLineSession(prompts, players, 1, 0, 10);
  assert.throws(() => submitBlankLineStroke(session, 'p2', stroke(), 1), /active artist/);
  assert.throws(
    () => submitBlankLineStroke(session, 'p1', { strokes: [] }, 1),
    /exactly one continuous stroke/,
  );
  assert.throws(
    () =>
      submitBlankLineStroke(
        session,
        'p1',
        { strokes: [...stroke().strokes, ...stroke(0.1).strokes] },
        1,
      ),
    /exactly one continuous stroke/,
  );
  assert.throws(() => submitBlankLineStroke(session, 'p1', stroke(), 10), /deadline/);

  let voting = finishDrawing();
  assert.throws(() => submitBlankLineVote(voting, 'p1', 'p1', 20), /yourself/);
  voting = submitBlankLineVote(voting, 'p1', 'p2', 20);
  assert.throws(() => submitBlankLineVote(voting, 'p1', 'p3', 21), /already voted/);
});

test('scores correct reads when the Blank is the sole top accusation', () => {
  let session = finishDrawing();
  session = submitBlankLineVote(session, 'p1', 'p2', 20);
  session = submitBlankLineVote(session, 'p2', 'p1', 21);
  session = submitBlankLineVote(session, 'p3', 'p1', 22);
  assert.equal(session.status, 'results');
  assert.equal(session.blankCaught, true);
  assert.equal(session.roundScores.p2, BLANK_LINE_POINTS_CORRECT_READ);
  assert.equal(session.roundScores.p3, BLANK_LINE_POINTS_CORRECT_READ);
  assert.equal(session.roundScores.p1, undefined);
  const view = getBlankLinePublicView(session);
  assert.equal(view.prompt, 'A lighthouse');
  assert.equal(view.blankPlayerId, 'p1');
});

test('a tied accusation lets the Blank escape and incomplete ballots resolve on deadline', () => {
  let session = finishDrawing();
  session = submitBlankLineVote(session, 'p1', 'p2', 20);
  session = submitBlankLineVote(session, 'p2', 'p1', 21);
  session = expireBlankLineStep(session, session.deadlineAt!);
  assert.equal(session.blankCaught, false);
  assert.equal(session.roundScores.p1, BLANK_LINE_POINTS_ESCAPE);

  const unresolved = finishDrawing();
  const revealed = revealBlankLineRound(unresolved);
  assert.equal(revealed.blankCaught, false);
  assert.equal(revealed.roundScores.p1, BLANK_LINE_POINTS_ESCAPE);
});

test('advances with a rotated order and completes after the final results', () => {
  let session = finishDrawing();
  session = revealBlankLineRound(session);
  session = advanceBlankLineRound(session, prompts, players, 100, 1_000);
  assert.equal(session.status, 'drawing');
  assert.equal(session.roundNumber, 2);
  assert.deepEqual(session.playerOrder, ['p2', 'p3', 'p1']);
  assert.equal(session.prompt.id, 'two');
  assert.equal(session.blankPlayerId, 'p2');

  for (let turn = 0; turn < players.length * 2; turn += 1) {
    const active = session.playerOrder[turn % session.playerOrder.length]!;
    session = submitBlankLineStroke(session, active, stroke(), 101 + turn, 1_000, 1_000);
  }
  session = revealBlankLineRound(session);
  session = advanceBlankLineRound(session, prompts, players, 200, 1_000);
  assert.equal(session.status, 'complete');
});
