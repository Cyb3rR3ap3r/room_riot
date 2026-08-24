import assert from 'node:assert/strict';
import test from 'node:test';

import { getClientActionId } from './action-ids.js';
import {
  createHostMutationKey,
  createPlayerActionKey,
  shouldDiscardDraft,
} from './player-action.js';
import type { PlayerDraft } from './session-store.js';

test('action identity ignores unrelated room updates but tracks action-changing state', () => {
  const base = {
    roomCode: 'AAAA',
    gameId: 'hot-take',
    phase: 'voting',
    game: { roundNumber: 2, promptId: 'prompt-2', status: 'voting' },
    playerState: { hasSubmitted: true, hasVoted: false, entries: [{ id: 'one' }] },
  };
  const key = createPlayerActionKey(base);
  assert.equal(createPlayerActionKey({ ...base }), key);
  assert.notEqual(createPlayerActionKey({ ...base, phase: 'results' }), key);
  assert.notEqual(createPlayerActionKey({ ...base, game: { ...base.game, roundNumber: 3 } }), key);
  assert.notEqual(
    createPlayerActionKey({
      ...base,
      playerState: { ...base.playerState, entries: [{ id: 'one' }, { id: 'two' }] },
    }),
    key,
  );
});

test('draft invalidation occurs only when authoritative action identity changes', () => {
  assert.equal(shouldDiscardDraft(null, 'next'), false);
  assert.equal(shouldDiscardDraft({ actionKey: 'same' }, 'same'), false);
  assert.equal(shouldDiscardDraft({ actionKey: 'old' }, 'next'), true);
});

test('text, target, vote, alibi, and drawing drafts share strict action-key invalidation', () => {
  const drafts: readonly PlayerDraft[] = [
    { actionKey: 'text', answer: 'answer' },
    { actionKey: 'target', selections: ['player-2'] },
    { actionKey: 'vote', selections: ['entry-2'] },
    { actionKey: 'alibi', answer: 'alibi' },
    {
      actionKey: 'drawing',
      drawing: {
        strokes: [{ color: '#abcdef', width: 0.01, points: [{ x: 0.2, y: 0.4 }] }],
      },
    },
  ];
  for (const draft of drafts) {
    assert.equal(shouldDiscardDraft(draft, draft.actionKey), false);
    assert.equal(shouldDiscardDraft(draft, `${draft.actionKey}:next`), true);
  }
});

test('host mutation IDs are scoped to the authoritative round and prompt', () => {
  const first = createHostMutationKey('host:next-round', 'AAAA', 'results', {
    roundNumber: 1,
    promptId: 'prompt-1',
    status: 'results',
  });
  assert.equal(
    createHostMutationKey('host:next-round', 'AAAA', 'results', {
      roundNumber: 1,
      promptId: 'prompt-1',
      status: 'results',
    }),
    first,
  );
  assert.notEqual(
    createHostMutationKey('host:next-round', 'AAAA', 'results', {
      roundNumber: 2,
      promptId: 'prompt-2',
      status: 'results',
    }),
    first,
  );
});

test('client action IDs remain stable for retries and distinct across mutation keys', () => {
  const ids = new Map<string, string>();
  let sequence = 0;
  const createId = (): string => `action-${++sequence}`;
  assert.equal(getClientActionId(ids, 'submit:round-1', createId), 'action-1');
  assert.equal(getClientActionId(ids, 'submit:round-1', createId), 'action-1');
  assert.equal(getClientActionId(ids, 'vote:round-1', createId), 'action-2');
});
