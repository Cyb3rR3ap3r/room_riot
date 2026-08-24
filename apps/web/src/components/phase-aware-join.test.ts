import assert from 'node:assert/strict';
import test from 'node:test';

import { createPhaseAwareJoinViewModel } from '../routes/display/join-presentation.js';
import { asFake, fakeDocument } from './test-dom.js';
import { createPhaseAwareJoinComponent } from './phase-aware-join.js';

test('renders a complete lobby join panel with a wrapped manual URL and descriptive QR', () => {
  const component = createPhaseAwareJoinComponent(fakeDocument);
  component.update(
    createPhaseAwareJoinViewModel({
      gameId: 'drawn-out',
      roomCode: 'DRAW',
      phase: 'lobby',
      availability: 'open',
      origin: 'https://an-intentionally-long-room-riot-hostname.example.test',
    }),
  );
  const root = asFake(component.element);
  assert.ok(root.classList.contains('join-mode-full'));
  assert.match(root.children[2]?.textContent ?? '', /^https:\/\//);
  assert.equal(root.children[2]?.attributes.get('href'), root.children[2]?.textContent);
  assert.match(root.children[4]?.attributes.get('alt') ?? '', /room DRAW/i);
});

test('removes every join credential and QR attribute when the room becomes locked', () => {
  const component = createPhaseAwareJoinComponent(fakeDocument);
  component.update(
    createPhaseAwareJoinViewModel({
      gameId: 'drawn-out',
      roomCode: 'DRAW',
      phase: 'lobby',
      availability: 'open',
      origin: 'https://party.local',
    }),
  );
  component.update(
    createPhaseAwareJoinViewModel({
      gameId: 'drawn-out',
      roomCode: 'DRAW',
      phase: 'input',
      availability: 'locked',
      origin: 'https://party.local',
    }),
  );
  const root = asFake(component.element);
  assert.ok(root.classList.contains('join-mode-locked'));
  assert.equal(root.children[2]?.textContent, '');
  assert.equal(root.children[2]?.attributes.get('href'), '');
  assert.equal(root.children[3]?.textContent, '');
  assert.equal(root.children[4]?.attributes.get('src'), '');
  assert.equal(root.children[4]?.attributes.get('alt'), '');
});
