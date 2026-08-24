import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContentMode, DrawingData, PlayerId } from '@room-riot/contracts';

import {
  DRAWN_OUT_POINTS_ARTIST_BONUS,
  DRAWN_OUT_POINTS_CORRECT_GUESS,
  DRAWN_OUT_POINTS_FAKE_SURVIVAL,
  advanceDrawnOutRound,
  createDrawnOutSession,
  expireDrawnOutStep,
  getDrawnOutPlayerView,
  getDrawnOutPublicView,
  loadDrawnOutPrompts,
  revealDrawnOutStep,
  submitDrawnOutDrawing,
  submitDrawnOutText,
  submitDrawnOutVote,
} from './index.js';

const players = ['player-a', 'player-b', 'player-c', 'player-d'] as PlayerId[];
const classicPrompts = [
  { id: 'p1', text: 'A raccoon running a pancake restaurant.' },
  { id: 'p2', text: 'A sleepy dog piloting an airplane.' },
  { id: 'p3', text: 'A robot learning to jump rope.' },
  { id: 'p4', text: 'A dragon afraid of birthday candles.' },
];
const drawing: DrawingData = {
  strokes: [
    {
      color: '#ff2ea6',
      width: 0.02,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.6 },
      ],
    },
  ],
};

test('every content mode expands to 100 unique prompts', () => {
  const modes: readonly ContentMode[] = ['family', 'standard', 'after-dark'];
  modes.forEach((contentMode) => {
    const prompts = loadDrawnOutPrompts(contentMode);
    assert.equal(prompts.length, 100);
    assert.equal(new Set(prompts.map((prompt) => prompt.id)).size, 100);
    assert.equal(new Set(prompts.map((prompt) => prompt.text.toLowerCase())).size, 100);
  });
});

test('classic offers four private choices and scores the selected prompt', () => {
  let session = createDrawnOutSession(classicPrompts, players, 'classic', 1, 0, 1_000);
  assert.equal(session.artistPlayerId, players[0]);
  assert.equal(getDrawnOutPublicView(session, players.length).prompt, null);
  assert.equal(getDrawnOutPublicView(session, players.length).promptId, null);
  assert.equal(getDrawnOutPlayerView(session, players[0]!).privatePrompt, classicPrompts[0]!.text);
  assert.throws(() => submitDrawnOutDrawing(session, players[1]!, drawing, 10), /featured artist/);

  session = submitDrawnOutDrawing(session, players[0]!, drawing, 10, 1_000, 1_000);
  const guesserView = getDrawnOutPlayerView(session, players[1]!);
  assert.equal(guesserView.guessOptions.length, 4);
  assert.equal(new Set(guesserView.guessOptions.map((option) => option.id)).size, 4);
  assert.ok(guesserView.guessOptions.some((option) => option.id === classicPrompts[0]!.id));
  assert.deepEqual(
    getDrawnOutPlayerView(session, players[1]!).guessOptions,
    guesserView.guessOptions,
  );
  assert.equal('guessOptions' in getDrawnOutPublicView(session, players.length), false);
  assert.throws(
    () => submitDrawnOutText(session, players[1]!, 'invented-option', 20),
    /four provided prompts/,
  );
  session = submitDrawnOutText(session, players[1]!, classicPrompts[0]!.id, 20);
  session = submitDrawnOutText(session, players[2]!, classicPrompts[1]!.id, 30);
  session = submitDrawnOutText(session, players[3]!, classicPrompts[0]!.id, 40);
  assert.equal(session.status, 'results');
  assert.equal(session.roundScores[players[1]!], DRAWN_OUT_POINTS_CORRECT_GUESS);
  assert.equal(session.roundScores[players[0]!], DRAWN_OUT_POINTS_ARTIST_BONUS * 2);
  assert.deepEqual(
    getDrawnOutPublicView(session, players.length).guesses.map((guess) => guess.correct),
    [true, false, true],
  );
});

test('telephone alternates private drawing and description links', () => {
  const prompts = [{ id: 'p1', text: 'A wizard whose wand makes bubbles.' }];
  let session = createDrawnOutSession(prompts, players, 'telephone', 1, 0, 1_000);
  assert.equal(session.activePlayerId, players[1]);
  assert.equal(getDrawnOutPlayerView(session, players[1]!).task, 'draw');

  session = submitDrawnOutDrawing(session, players[1]!, drawing, 10, 1_000);
  assert.equal(getDrawnOutPlayerView(session, players[2]!).task, 'describe');
  session = submitDrawnOutText(session, players[2]!, 'A wizard making bubbles', 20, 1_000);
  session = submitDrawnOutDrawing(session, players[3]!, drawing, 30, 1_000);
  assert.equal(session.status, 'results');
  assert.equal(session.chain.length, players.length);
  assert.equal(getDrawnOutPublicView(session, players.length).chain.length, players.length);
});

test('fake artist keeps the role private, combines turns, and scores survival', () => {
  const prompts = [{ id: 'p1', text: 'A shark interviewing for a desk job.' }];
  let session = createDrawnOutSession(prompts, players, 'fake-artist', 1, 0, 1_000);
  const fake = session.fakeArtistPlayerId!;
  assert.equal(getDrawnOutPlayerView(session, fake).privatePrompt, null);
  assert.equal(getDrawnOutPublicView(session, players.length).fakeArtistPlayerId, null);

  for (const player of players) {
    session = submitDrawnOutDrawing(
      session,
      player,
      drawing,
      10 + players.indexOf(player),
      1_000,
      1_000,
    );
  }
  assert.equal(session.status, 'fake-voting');
  session = submitDrawnOutVote(session, players[0]!, players[1]!, 30);
  session = submitDrawnOutVote(session, players[1]!, players[2]!, 31);
  session = submitDrawnOutVote(session, players[2]!, players[1]!, 32);
  session = submitDrawnOutVote(session, players[3]!, players[2]!, 33);
  assert.equal(session.status, 'results');
  assert.equal(session.roundScores[fake], DRAWN_OUT_POINTS_FAKE_SURVIVAL);
  assert.equal(getDrawnOutPublicView(session, players.length).fakeArtistPlayerId, fake);
});

test('deadlines advance stalled turns and results advance to winner', () => {
  let session = createDrawnOutSession(classicPrompts, players, 'classic', 1, 0, 10);
  session = expireDrawnOutStep(session, 10, 10, 10);
  assert.equal(session.status, 'guessing');
  session = revealDrawnOutStep(session, 20, 10, 10);
  assert.equal(session.status, 'results');
  session = advanceDrawnOutRound(session, classicPrompts, 30, 10);
  assert.equal(session.status, 'complete');
});

test('drawing validation rejects oversized coordinates and duplicate submissions', () => {
  const session = createDrawnOutSession(classicPrompts, players, 'classic', 1, 0, 1_000);
  assert.throws(
    () =>
      submitDrawnOutDrawing(
        session,
        players[0]!,
        { strokes: [{ color: '#000000', width: 0.02, points: [{ x: 2, y: 0 }] }] },
        10,
      ),
    /less than or equal to 1|invalid/i,
  );
});
