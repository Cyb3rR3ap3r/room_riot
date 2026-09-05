import assert from 'node:assert/strict';
import test from 'node:test';

import { createPhaseAwareJoinViewModel } from '../routes/display/join-presentation.js';
import { asFake, fakeDocument } from './test-dom.js';
import { createPhaseAwareJoinComponent } from './phase-aware-join.js';

test('shows a short typable join address while linking the full URL, plus a descriptive QR', () => {
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
  const credentials = root.children[2]!;
  const scan = root.children[3]!;
  const qr = scan.children[0]?.children[0];
  const address = credentials.children[3];
  assert.ok(root.classList.contains('join-mode-full'));
  // The room reads this off a screen and types it, so it drops the scheme and
  // the room query. The anchor still points at the complete join URL.
  assert.equal(
    address?.textContent,
    'an-intentionally-long-room-riot-hostname.example.test/play/drawn-out',
  );
  assert.equal(
    address?.attributes.get('href'),
    'https://an-intentionally-long-room-riot-hostname.example.test/play/drawn-out?room=DRAW',
  );
  assert.match(qr?.attributes.get('alt') ?? '', /room DRAW/i);
  assert.equal(scan.children[1]?.textContent, 'Scan to join instantly');
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
  const credentials = root.children[2]!;
  const scan = root.children[3]!;
  const qr = scan.children[0]?.children[0];
  assert.ok(root.classList.contains('join-mode-locked'));
  assert.equal(credentials.children[3]?.textContent, '');
  assert.equal(credentials.children[3]?.attributes.get('href'), '');
  assert.equal(credentials.children[1]?.textContent, '');
  assert.equal(qr?.attributes.get('src'), '');
  assert.equal(qr?.attributes.get('alt'), '');
  assert.equal(root.attributes.get('data-availability'), 'locked');
});
