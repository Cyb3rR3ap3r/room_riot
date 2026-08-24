import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecoveryPanel } from './recovery-panel.js';
import { asFake, fakeDocument } from './test-dom.js';

test('renders an accessible recovery surface with explicit actions', () => {
  const panel = asFake(
    createRecoveryPanel(
      { kind: 'room-missing', role: 'player', roomCode: 'RAGE' },
      {
        'edit-room-code': () => undefined,
        'return-to-launcher': () => undefined,
      },
      fakeDocument,
    ),
  );
  assert.equal(panel.attributes.get('role'), 'alert');
  assert.equal(panel.attributes.get('data-recovery-state'), 'room-missing');
  const copy = panel.children[1];
  assert.equal(copy?.children[1]?.textContent, 'Room not found');
  const actions = copy?.children[3];
  assert.deepEqual(
    actions?.children.map((button) => button.attributes.get('data-recovery-action')),
    ['edit-room-code', 'return-to-launcher'],
  );
});

test('renders allowlisted diagnostics instead of unsafe response text', () => {
  const panel = asFake(
    createRecoveryPanel(
      {
        kind: 'server-unavailable',
        role: 'host',
        roomCode: 'RAGE',
        errorCode: 'INTERNAL_ERROR',
        serverVersion: 'secret bearer-token',
      },
      { retry: () => undefined, 'copy-diagnostics': () => undefined },
      fakeDocument,
    ),
  );
  const diagnostics = panel.children[1]?.children.at(-1)?.children[1]?.textContent ?? '';
  assert.match(diagnostics, /error=INTERNAL_ERROR/);
  assert.doesNotMatch(diagnostics, /secret|bearer|token/i);
});
