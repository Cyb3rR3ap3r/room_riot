import assert from 'node:assert/strict';
import test from 'node:test';

import { getConnectionPresentation, getPageKind } from './presentation.js';

test('shared presentation helpers stay route-oriented and rule-free', () => {
  assert.equal(getPageKind('/host/groupthink'), 'host-page');
  assert.equal(getPageKind('/play/suspect'), 'player-page');
  assert.equal(getPageKind('/display'), 'display-page');
  assert.equal(getConnectionPresentation('connected'), null);
  assert.deepEqual(getConnectionPresentation('reconnecting'), {
    message: 'Connection lost. Reconnecting automatically…',
    isError: true,
  });
});
