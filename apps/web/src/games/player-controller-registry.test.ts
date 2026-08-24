import assert from 'node:assert/strict';
import test from 'node:test';

import type { DrawingData } from '@room-riot/contracts';
import type { HotTakePlayerView } from '@room-riot/hot-take';
import type { SuspectPlayerView } from '@room-riot/suspect';

import {
  createAllGamePhaseFixtures,
  createGamePhaseFixture,
} from '../components/component-fixtures.js';
import {
  asInteractive,
  collectText,
  InteractiveTestDocument,
  type InteractiveTestElement,
} from '../components/interactive-test-dom.js';
import type { PlayerGameView, RoomSnapshot } from '../protocol.js';
import { createActionFirstControllerViewModel } from '../routes/player/controller-view-model.js';
import type { PlayerDraft } from '../state/session-store.js';
import {
  PLAYER_CONTROLLER_RENDERERS,
  renderPlayerController,
} from './player-controller-registry.js';
import type {
  CastVoteIntent,
  PlayerControllerDependencies,
  SubmitAlibiIntent,
  SubmitAnswerIntent,
  SubmitDrawingIntent,
} from './player-controller.js';

const DRAWING: DrawingData = {
  strokes: [{ color: '#ff006e', width: 0.02, points: [{ x: 0.2, y: 0.4 }] }],
};

interface Spies {
  readonly answers: SubmitAnswerIntent[];
  readonly votes: CastVoteIntent[];
  readonly alibis: SubmitAlibiIntent[];
  readonly drawings: SubmitDrawingIntent[];
  readonly drafts: unknown[];
  readonly notices: string[];
}

function dependencies(document: InteractiveTestDocument): {
  readonly value: PlayerControllerDependencies;
  readonly spies: Spies;
} {
  const spies: Spies = {
    answers: [],
    votes: [],
    alibis: [],
    drawings: [],
    drafts: [],
    notices: [],
  };
  return {
    spies,
    value: {
      document,
      saveDraft: (draft) => spies.drafts.push(draft),
      showNotice: (message) => spies.notices.push(message),
      mutations: {
        submitAnswer: (intent) => spies.answers.push(intent),
        castVote: (intent) => spies.votes.push(intent),
        submitAlibi: (intent) => spies.alibis.push(intent),
        submitDrawing: (intent) => spies.drawings.push(intent),
      },
      createDrawingPad: (_initial, onChange) => {
        const element = document.createElement('div');
        element.className = 'drawing-pad';
        onChange(DRAWING);
        return { element, getDrawing: () => DRAWING };
      },
      createDrawingPreview: (drawing, className = '') => {
        const preview = document.createElement('figure');
        preview.className = className;
        preview.textContent = `${drawing.strokes.length} stroke preview`;
        return preview;
      },
    },
  };
}

function render(
  snapshot: RoomSnapshot,
  playerState: PlayerGameView,
  draft: PlayerDraft | null = null,
) {
  const document = new InteractiveTestDocument();
  const harness = dependencies(document);
  const rendered = renderPlayerController(
    snapshot,
    playerState,
    { playerId: snapshot.state.players[0]?.id ?? 'player-1', draft },
    harness.value,
  );
  assert.ok(rendered);
  return { document, rendered, ...harness };
}

test('typed player-controller registry is exhaustive and identity-safe', () => {
  assert.deepEqual(Object.keys(PLAYER_CONTROLLER_RENDERERS).sort(), [
    'drawn-out',
    'groupthink',
    'hot-take',
    'suspect',
  ]);
  for (const [gameId, renderer] of Object.entries(PLAYER_CONTROLLER_RENDERERS)) {
    assert.equal(renderer.gameId, gameId);
  }
});

test('real per-game renderers match action-first control availability for every private fixture', () => {
  for (const fixture of createAllGamePhaseFixtures()) {
    if (!fixture.playerState) continue;
    const harness = render(fixture.snapshot, fixture.playerState);
    const expected = createActionFirstControllerViewModel({
      gameId: fixture.gameId,
      roomCode: fixture.snapshot.state.roomCode,
      playerId: fixture.snapshot.state.players[0]!.id,
      phase: fixture.snapshot.state.phase,
      publicGame: fixture.snapshot.game,
      playerState: fixture.playerState,
      draft: null,
      playerLabels: Object.fromEntries(
        fixture.snapshot.state.players.map((player) => [player.id, player.name]),
      ),
      now: 1_000,
    });
    assert.equal(
      Boolean(harness.rendered.primaryControl),
      Boolean(expected.primaryControl),
      fixture.id,
    );
    assert.ok(collectText(harness.rendered.element).length > 0, fixture.id);
  }
});

test('answer, targeted answer, voting, alibi, accusation, drawing, description, guess, and artist vote intents preserve exact values', () => {
  const groupFixture = createGamePhaseFixture('groupthink', 'input', 'one');
  assert.ok(groupFixture.playerState?.id === 'groupthink');
  const group = render(groupFixture.snapshot, groupFixture.playerState);
  const groupInput = findTag(group.rendered.primaryControl!, 'input')[0]!;
  groupInput.value = 'Popcorn';
  groupInput.dispatch('input');
  submit(group.rendered.primaryControl!);
  assert.equal(group.spies.answers[0]?.answer, 'Popcorn');
  assert.equal(group.spies.answers[0]?.acceptedAction.title, 'Thought accepted');

  const hotFixture = createGamePhaseFixture('hot-take', 'input', 'minimum');
  assert.ok(hotFixture.snapshot.game?.id === 'hot-take');
  assert.ok(hotFixture.playerState?.id === 'hot-take');
  const targetedState: HotTakePlayerView = {
    ...hotFixture.playerState,
    promptKind: 'player-targeted',
  };
  const targetedSnapshot: RoomSnapshot = {
    ...hotFixture.snapshot,
    game: { ...hotFixture.snapshot.game, promptKind: 'player-targeted' },
  };
  const targetId = targetedSnapshot.state.players[1]!.id;
  const targeted = render(targetedSnapshot, targetedState, {
    actionKey: 'fixture',
    selections: [targetId],
  });
  submit(targeted.rendered.primaryControl!);
  assert.equal(targeted.spies.answers[0]?.targetPlayerId, targetId);
  assert.match(targeted.spies.answers[0]?.acceptedAction.acceptedValue ?? '', /Player 2/);

  const hotVoteFixture = createGamePhaseFixture('hot-take', 'voting', 'minimum');
  assert.ok(hotVoteFixture.playerState?.id === 'hot-take');
  const entry = hotVoteFixture.playerState.entries[0]!;
  const hotVote = render(hotVoteFixture.snapshot, hotVoteFixture.playerState, {
    actionKey: 'fixture',
    selections: [entry.entryId],
  });
  submit(hotVote.rendered.primaryControl!);
  assert.equal(hotVote.spies.votes[0]?.entryId, entry.entryId);
  assert.equal(hotVote.spies.votes[0]?.acceptedAction.acceptedValue, entry.answer);

  const suspectInputFixture = createGamePhaseFixture('suspect', 'input', 'minimum');
  assert.ok(suspectInputFixture.playerState?.id === 'suspect');
  const suspectAnswer = render(suspectInputFixture.snapshot, suspectInputFixture.playerState, {
    actionKey: 'fixture',
    answer: 'no',
  });
  submit(suspectAnswer.rendered.primaryControl!);
  assert.equal(suspectAnswer.spies.answers[0]?.answer, 'no');
  assert.equal(suspectAnswer.spies.answers[0]?.acceptedAction.acceptedValue, 'No');

  const alibiFixture = createGamePhaseFixture('suspect', 'alibi', 'minimum');
  assert.ok(alibiFixture.playerState?.id === 'suspect');
  const alibiState: SuspectPlayerView = { ...alibiFixture.playerState, ownAlibi: null };
  const alibi = render(alibiFixture.snapshot, alibiState, {
    actionKey: 'fixture',
    answer: 'I was feeding the goose.',
  });
  submit(alibi.rendered.primaryControl!);
  assert.equal(alibi.spies.alibis[0]?.alibi, 'I was feeding the goose.');

  const suspectVoteFixture = createGamePhaseFixture('suspect', 'voting', 'minimum');
  assert.ok(suspectVoteFixture.playerState?.id === 'suspect');
  const suspectVote = render(suspectVoteFixture.snapshot, suspectVoteFixture.playerState, {
    actionKey: 'fixture',
    noMatch: true,
  });
  submit(suspectVote.rendered.primaryControl!);
  assert.equal(suspectVote.spies.votes[0]?.entryId, 'none');
  assert.equal(suspectVote.spies.votes[0]?.acceptedAction.acceptedValue, 'No match');

  const drawFixture = createGamePhaseFixture('drawn-out', 'drawing', 'minimum');
  assert.ok(drawFixture.playerState?.id === 'drawn-out');
  const drawing = render(drawFixture.snapshot, drawFixture.playerState);
  findButton(drawing.rendered.primaryControl!, 'Submit My Strokes').click();
  assert.deepEqual(drawing.spies.drawings[0]?.drawing, DRAWING);
  assert.equal(drawing.spies.drawings[0]?.acceptedAction.acceptedValue, '1 stroke');

  const describeFixture = createGamePhaseFixture('drawn-out', 'telephone', 'minimum');
  assert.ok(describeFixture.playerState?.id === 'drawn-out');
  const describe = render(describeFixture.snapshot, describeFixture.playerState, {
    actionKey: 'fixture',
    answer: 'A goose borrowing a city bus',
  });
  submit(describe.rendered.primaryControl!);
  assert.equal(describe.spies.answers[0]?.answer, 'A goose borrowing a city bus');

  const guessFixture = createGamePhaseFixture('drawn-out', 'guessing', 'minimum');
  assert.ok(guessFixture.playerState?.id === 'drawn-out');
  const guessId = guessFixture.playerState.guessOptions[0]!.id;
  const guess = render(guessFixture.snapshot, guessFixture.playerState, {
    actionKey: 'fixture',
    selections: [guessId],
  });
  submit(guess.rendered.primaryControl!);
  assert.equal(guess.spies.answers[0]?.answer, guessId);
  assert.match(guess.spies.answers[0]?.acceptedAction.acceptedValue ?? '', /runaway parade float/i);

  const artistVoteFixture = createGamePhaseFixture('drawn-out', 'fake-voting', 'minimum');
  assert.ok(artistVoteFixture.playerState?.id === 'drawn-out');
  const artistId = artistVoteFixture.playerState.candidatePlayerIds[0]!;
  const artistVote = render(artistVoteFixture.snapshot, artistVoteFixture.playerState, {
    actionKey: 'fixture',
    selections: [artistId],
  });
  submit(artistVote.rendered.primaryControl!);
  assert.equal(artistVote.spies.votes[0]?.entryId, artistId);
});

test('mismatched public/private game identities fail closed', () => {
  const group = createGamePhaseFixture('groupthink', 'input', 'one');
  const drawn = createGamePhaseFixture('drawn-out', 'drawing', 'minimum');
  assert.ok(drawn.playerState);
  const document = new InteractiveTestDocument();
  assert.equal(
    renderPlayerController(
      group.snapshot,
      drawn.playerState,
      { playerId: 'player-1', draft: null },
      dependencies(document).value,
    ),
    null,
  );
});

function submit(element: HTMLElement): void {
  asInteractive(element).dispatch('submit');
}

function findTag(element: HTMLElement, tagName: string): InteractiveTestElement[] {
  const current = asInteractive(element);
  return [
    ...(current.tagName === tagName ? [current] : []),
    ...current.children.flatMap((child) => findTag(child as unknown as HTMLElement, tagName)),
  ];
}

function findButton(element: HTMLElement, label: string): InteractiveTestElement {
  const button = findTag(element, 'button').find((candidate) => candidate.textContent === label);
  assert.ok(button, `Expected button ${label}`);
  return button;
}
