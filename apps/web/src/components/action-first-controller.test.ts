import assert from 'node:assert/strict';
import test from 'node:test';

import { createActionFirstControllerViewModel } from '../routes/player/controller-view-model.js';
import { createActionFirstControllerComponent } from './action-first-controller.js';
import { asFake, fakeDocument } from './test-dom.js';

test('renders action-first semantics and exposes integration-owned control and recovery seams', () => {
  const initial = createActionFirstControllerViewModel({
    gameId: 'groupthink',
    roomCode: 'ABCD',
    playerId: 'p1',
    phase: 'input',
    now: 1_000,
    playerState: {
      id: 'groupthink',
      status: 'input',
      roundNumber: 1,
      totalRounds: 3,
      prompt: 'Name a snack everyone likes.',
      promptId: 'g1',
      inputDeadlineAt: 11_000,
      hasSubmitted: false,
      ownAnswer: null,
    },
    draft: null,
    operation: { status: 'failed', attempt: 1, message: 'No acknowledgement arrived.' },
  });
  const component = createActionFirstControllerComponent(fakeDocument);
  const form = fakeDocument.createElement('form');
  form.setAttribute('aria-label', 'Groupthink answer form');
  component.update(initial, { primaryControl: form });

  const root = asFake(component.element);
  assert.ok(root.classList.contains('layout-action'));
  assert.ok(root.classList.contains('art-collapsed'));
  assert.equal(root.attributes.get('data-action-key'), initial.actionKey);
  assert.equal(asFake(component.primarySlot).children[0], asFake(form));
  assert.equal(
    asFake(component.primarySlot).attributes.get('aria-label'),
    'Your thought, 500 character maximum',
  );
  assert.match(
    asFake(component.retryButton).attributes.get('aria-label') ?? '',
    /draft is still saved/i,
  );
});

test('updates the retained shell to a polite accepted receipt', () => {
  const component = createActionFirstControllerComponent(fakeDocument);
  const accepted = createActionFirstControllerViewModel({
    gameId: 'groupthink',
    roomCode: 'ABCD',
    playerId: 'p1',
    phase: 'input',
    now: 1_000,
    playerState: {
      id: 'groupthink',
      status: 'input',
      roundNumber: 1,
      totalRounds: 3,
      prompt: 'Name a snack everyone likes.',
      promptId: 'g1',
      inputDeadlineAt: 11_000,
      hasSubmitted: true,
      ownAnswer: 'Popcorn',
    },
    draft: null,
  });
  component.update(accepted);

  const root = asFake(component.element);
  assert.ok(root.classList.contains('layout-waiting'));
  assert.ok(root.classList.contains('art-expanded'));
  const receipt = root.children[3]!;
  assert.equal(receipt.attributes.get('role'), 'status');
  assert.equal(receipt.attributes.get('aria-live'), 'polite');
  assert.equal(receipt.children[1]?.textContent, 'Submitted answer: Popcorn');
  assert.equal(receipt.children[2]?.textContent, 'Waiting for every mind to lock in.');
});

test('retains the controller and active form identities across same-action updates', () => {
  const component = createActionFirstControllerComponent(fakeDocument);
  const form = fakeDocument.createElement('form');
  const input = fakeDocument.createElement('input');
  form.append(input);
  const base = {
    gameId: 'groupthink' as const,
    roomCode: 'ABCD',
    playerId: 'p1',
    phase: 'input' as const,
    now: 1_000,
    playerState: {
      id: 'groupthink' as const,
      status: 'input' as const,
      roundNumber: 1,
      totalRounds: 3,
      prompt: 'Name a snack everyone likes.',
      promptId: 'g1',
      inputDeadlineAt: 11_000,
      hasSubmitted: false,
      ownAnswer: null,
    },
    draft: { actionKey: 'groupthink:ABCD:g1', answer: 'Popcorn' },
  };
  const initial = createActionFirstControllerViewModel(base);
  component.update(initial, { primaryControl: form });
  const element = component.element;
  const slot = component.primarySlot;

  const failed = createActionFirstControllerViewModel({
    ...base,
    operation: { status: 'failed', attempt: 1, message: 'No acknowledgement arrived.' },
  });
  component.update(failed, { primaryControl: form });

  assert.equal(component.element, element);
  assert.equal(component.primarySlot, slot);
  assert.equal(asFake(component.primarySlot).children[0], asFake(form));
  assert.equal(asFake(form).children[0], asFake(input));
  assert.equal(failed.actionKey, initial.actionKey);
});
