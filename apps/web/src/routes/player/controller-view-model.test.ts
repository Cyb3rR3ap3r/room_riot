import assert from 'node:assert/strict';
import test from 'node:test';

import type { RoomPhase } from '@room-riot/contracts';
import type { DrawnOutPlayerView } from '@room-riot/drawn-out';
import type { GroupthinkPlayerView } from '@room-riot/groupthink';
import type { HotTakePlayerView } from '@room-riot/hot-take';
import type { SuspectPlayerView } from '@room-riot/suspect';

import type { SupportedGameId } from '../../app/catalog.js';
import type { PlayerGameView } from '../../protocol.js';
import { createActionFirstControllerViewModel } from './controller-view-model.js';

const NOW = 10_000;
const DEADLINE = NOW + 12_400;
const labels = { p1: '😎 Alex', p2: '🤖 Blake', p3: '👻 Casey' } as const;

const groupthink = (changes: Partial<GroupthinkPlayerView> = {}): GroupthinkPlayerView => ({
  id: 'groupthink',
  status: 'input',
  roundNumber: 1,
  totalRounds: 3,
  prompt: 'Name a snack everyone likes.',
  promptId: 'g1',
  inputDeadlineAt: DEADLINE,
  hasSubmitted: false,
  ownAnswer: null,
  ...changes,
});

const hotTake = (changes: Partial<HotTakePlayerView> = {}): HotTakePlayerView => ({
  id: 'hot-take',
  status: 'input',
  roundNumber: 1,
  totalRounds: 3,
  prompt: 'What is wildly overrated?',
  promptId: 'h1',
  promptKind: 'open',
  deadlineAt: DEADLINE,
  hasSubmitted: false,
  ownAnswer: null,
  ownEntryId: null,
  hasVoted: false,
  entries: [
    { entryId: 'e1', answer: 'Brunch lines', voteCount: 0, points: 0 },
    { entryId: 'e2', answer: 'Tiny plates', voteCount: 0, points: 0 },
  ],
  ...changes,
});

const suspect = (changes: Partial<SuspectPlayerView> = {}): SuspectPlayerView => ({
  id: 'suspect',
  status: 'input',
  roundNumber: 1,
  totalRounds: 3,
  prompt: 'I have blamed traffic for being late.',
  promptId: 's1',
  roundType: 'standard',
  deadlineAt: DEADLINE,
  hasSubmitted: false,
  ownAnswer: null,
  canSubmitAlibi: false,
  ownAlibi: null,
  alibiPlayerId: null,
  hasVoted: false,
  ownVoteTargetIds: [],
  candidatePlayerIds: ['p2', 'p3'],
  selectedPlayerIds: [],
  ...changes,
});

const drawnOut = (changes: Partial<DrawnOutPlayerView> = {}): DrawnOutPlayerView => ({
  id: 'drawn-out',
  status: 'drawing',
  mode: 'classic',
  roundNumber: 1,
  totalRounds: 3,
  deadlineAt: DEADLINE,
  task: 'draw',
  instruction: 'Draw the secret prompt.',
  privatePrompt: 'A goose driving a bus',
  sourceDescription: null,
  isFakeArtist: false,
  hasSubmitted: false,
  drawing: null,
  candidatePlayerIds: [],
  guessOptions: [],
  ownGuess: null,
  ownVotePlayerId: null,
  ...changes,
});

function view(
  gameId: SupportedGameId,
  phase: RoomPhase,
  playerState: PlayerGameView | null,
  additions: Partial<Parameters<typeof createActionFirstControllerViewModel>[0]> = {},
) {
  return createActionFirstControllerViewModel({
    gameId,
    roomCode: 'ABCD',
    playerId: 'p1',
    phase,
    playerState,
    draft: null,
    playerLabels: labels,
    now: NOW,
    ...additions,
  });
}

test('produces a complete waiting model for every route phase and game', () => {
  const phases: readonly RoomPhase[] = [
    'lobby',
    'intro',
    'prompt',
    'input',
    'alibi',
    'voting',
    'results',
    'scoring',
    'winner',
  ];
  const games: readonly SupportedGameId[] = ['groupthink', 'hot-take', 'suspect', 'drawn-out'];

  for (const gameId of games) {
    for (const phase of phases) {
      const model = view(gameId, phase, null);
      assert.equal(model.gameId, gameId);
      assert.equal(model.phase, phase);
      assert.equal(model.layoutMode, 'waiting');
      assert.equal(model.artMode, 'expanded');
      assert.ok(model.title.length > 5);
      assert.ok(model.instruction.length > 5);
      assert.match(model.actionKey, new RegExp(`ABCD:${gameId}:${phase}`));
    }
  }
});

test('puts the current action, deadline, primary control, and accessible labels first for all games', () => {
  const fixtures = [
    view('groupthink', 'input', groupthink()),
    view('hot-take', 'input', hotTake()),
    view('suspect', 'input', suspect()),
    view('drawn-out', 'input', drawnOut()),
  ];

  for (const model of fixtures) {
    assert.equal(model.layoutMode, 'action');
    assert.equal(model.artMode, 'collapsed');
    assert.ok(model.primaryControl);
    assert.ok(model.primaryControl.accessibleLabel.length > 5);
    assert.equal(model.deadline?.remainingSeconds, 13);
    assert.equal(model.deadline?.accessibleLabel, '13 seconds remaining');
    assert.equal(model.deadline?.urgency, 'normal');
  }
});

test('covers answer, targeted answer, voting, alibi, drawing, description, guess, and accusation controls', () => {
  const controls = [
    view('groupthink', 'input', groupthink()).primaryControl,
    view('hot-take', 'input', hotTake({ promptKind: 'player-targeted' })).primaryControl,
    view('hot-take', 'voting', hotTake({ status: 'voting' })).primaryControl,
    view(
      'suspect',
      'alibi',
      suspect({ status: 'alibi', canSubmitAlibi: true, alibiPlayerId: 'p1' }),
    ).primaryControl,
    view('suspect', 'voting', suspect({ status: 'voting', roundType: 'double-trouble' }))
      .primaryControl,
    view('drawn-out', 'input', drawnOut()).primaryControl,
    view(
      'drawn-out',
      'input',
      drawnOut({ task: 'describe', status: 'telephone', privatePrompt: null }),
    ).primaryControl,
    view(
      'drawn-out',
      'voting',
      drawnOut({
        task: 'guess',
        status: 'guessing',
        privatePrompt: null,
        guessOptions: [
          { id: 'd1', text: 'A goose driving a bus' },
          { id: 'd2', text: 'A duck stealing a train' },
        ],
      }),
    ).primaryControl,
    view(
      'drawn-out',
      'voting',
      drawnOut({ task: 'vote', status: 'fake-voting', candidatePlayerIds: ['p2', 'p3'] }),
    ).primaryControl,
  ];

  assert.deepEqual(
    controls.map((control) => control?.kind),
    ['text', 'choice', 'choice', 'text', 'choice', 'drawing', 'text', 'choice', 'choice'],
  );
  const doubleTrouble = controls[4];
  assert.equal(doubleTrouble?.kind, 'choice');
  if (doubleTrouble?.kind === 'choice') {
    assert.equal(doubleTrouble.minimumSelections, 2);
    assert.equal(doubleTrouble.maximumSelections, 2);
    assert.equal(doubleTrouble.allowNoMatch, true);
  }
});

test('recovers matching drafts, counts characters, confirms clear, and rejects over-limit text', () => {
  const baseline = view('groupthink', 'input', groupthink());
  const longText = 'x'.repeat(501);
  const model = view('groupthink', 'input', groupthink(), {
    draft: { actionKey: baseline.actionKey, answer: longText },
  });

  assert.equal(model.primaryControl?.kind, 'text');
  if (model.primaryControl?.kind === 'text') {
    assert.equal(model.primaryControl.characterCount, 501);
    assert.equal(model.primaryControl.characterLimit, 500);
    assert.equal(model.primaryControl.invalid, true);
    assert.equal(model.primaryControl.disabled, true);
    assert.equal(model.primaryControl.value, longText);
  }
  assert.equal(model.clearDraft?.confirmationTitle, 'Clear this draft?');
  assert.match(model.clearDraft?.confirmationMessage ?? '', /removed from this device/i);

  const stale = view('groupthink', 'input', groupthink(), {
    draft: { actionKey: 'another-action', answer: 'Do not leak this draft' },
  });
  assert.equal(stale.primaryControl?.kind === 'text' ? stale.primaryControl.value : null, '');
  assert.equal(stale.clearDraft, null);
});

test('uses the existing public/private action identity so persisted drafts survive integration', () => {
  const publicGame = {
    id: 'groupthink',
    status: 'input',
    roundNumber: 2,
    promptId: 'public-prompt-2',
  };
  const baseline = view('groupthink', 'input', groupthink({ roundNumber: 2 }), { publicGame });
  const restored = view('groupthink', 'input', groupthink({ roundNumber: 2 }), {
    publicGame,
    draft: { actionKey: baseline.actionKey, answer: 'Recovered from local storage' },
  });

  assert.equal(
    restored.primaryControl?.kind === 'text' ? restored.primaryControl.value : null,
    'Recovered from local storage',
  );
  assert.match(restored.actionKey, /public-prompt-2/);
});

test('shows exactly what was accepted and what happens next across all games', () => {
  const accepted = [
    view('groupthink', 'input', groupthink({ hasSubmitted: true, ownAnswer: 'Popcorn' })),
    view('hot-take', 'input', hotTake({ hasSubmitted: true, ownAnswer: 'Brunch lines' })),
    view('suspect', 'input', suspect({ hasSubmitted: true, ownAnswer: false })),
    view(
      'suspect',
      'alibi',
      suspect({
        status: 'alibi',
        hasSubmitted: true,
        canSubmitAlibi: true,
        alibiPlayerId: 'p1',
        ownAlibi: 'I was feeding the goose.',
      }),
    ),
    view(
      'suspect',
      'voting',
      suspect({ status: 'voting', hasSubmitted: true, hasVoted: true, ownVoteTargetIds: ['p2'] }),
    ),
    view(
      'drawn-out',
      'voting',
      drawnOut({
        task: 'guess',
        status: 'guessing',
        hasSubmitted: true,
        ownGuess: 'A goose driving a bus',
      }),
    ),
  ];
  const expectedValues = [
    'Popcorn',
    'Brunch lines',
    'No',
    'I was feeding the goose.',
    '🤖 Blake',
    'A goose driving a bus',
  ];

  assert.deepEqual(
    accepted.map((model) => model.receipt?.acceptedValue),
    expectedValues,
  );
  for (const model of accepted) {
    assert.equal(model.primaryControl, null);
    assert.ok(model.receipt?.nextStep.length);
    assert.equal(model.waitingMessage, model.receipt?.nextStep);
  }
});

test('retains exact acknowledgement values that private game views intentionally omit', () => {
  const hotVote = view('hot-take', 'voting', hotTake({ status: 'voting', hasVoted: true }), {
    acceptedAction: {
      phase: 'voting',
      action: 'vote',
      title: 'Vote counted',
      acceptedLabel: 'Your spotlight vote',
      acceptedValue: 'Take 2: Tiny plates',
      nextStep: 'Waiting for the remaining votes.',
    },
  });
  const drawnDescription = view(
    'drawn-out',
    'input',
    drawnOut({ task: 'wait', status: 'telephone', privatePrompt: null }),
    {
      acceptedAction: {
        phase: 'input',
        action: 'answer',
        title: 'Description passed',
        acceptedLabel: 'Your description',
        acceptedValue: 'A goose borrowing a city bus',
        nextStep: 'The next artist is drawing it now.',
      },
    },
  );

  assert.equal(hotVote.receipt?.acceptedValue, 'Take 2: Tiny plates');
  assert.equal(drawnDescription.receipt?.acceptedValue, 'A goose borrowing a city bus');
  assert.equal(drawnDescription.waitingMessage, 'The next artist is drawing it now.');

  const stalePhase = view('hot-take', 'results', hotTake({ status: 'results', hasVoted: true }), {
    acceptedAction: {
      phase: 'voting',
      action: 'vote',
      title: 'Vote counted',
      acceptedLabel: 'Your vote',
      acceptedValue: 'Stale vote value',
      nextStep: 'Waiting.',
    },
  });
  assert.notEqual(stalePhase.receipt?.acceptedValue, 'Stale vote value');
});

test('keeps recovered input available when an action fails and exposes an explicit retry', () => {
  const baseline = view('suspect', 'alibi', suspect({ status: 'alibi', canSubmitAlibi: true }));
  const model = view('suspect', 'alibi', suspect({ status: 'alibi', canSubmitAlibi: true }), {
    draft: { actionKey: baseline.actionKey, answer: 'My recovered alibi' },
    operation: { status: 'failed', attempt: 2, message: 'No acknowledgement arrived.' },
  });

  assert.equal(
    model.primaryControl?.kind === 'text' ? model.primaryControl.value : null,
    'My recovered alibi',
  );
  assert.equal(model.retry?.attempt, 2);
  assert.equal(model.retry?.preservesDraft, true);
  assert.match(model.retry?.accessibleLabel ?? '', /draft is still saved/i);
});

test('marks imminent and elapsed deadlines without producing negative time', () => {
  const soon = view('groupthink', 'input', groupthink({ inputDeadlineAt: NOW + 1 }), { now: NOW });
  assert.equal(soon.deadline?.urgency, 'soon');
  assert.equal(soon.deadline?.remainingSeconds, 1);

  const expired = view('groupthink', 'input', groupthink({ inputDeadlineAt: NOW - 1 }), {
    now: NOW,
  });
  assert.equal(expired.deadline?.urgency, 'expired');
  assert.equal(expired.deadline?.remainingMs, 0);
  assert.equal(expired.deadline?.label, 'Time is up');
});
