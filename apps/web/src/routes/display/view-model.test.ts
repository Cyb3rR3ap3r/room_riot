import assert from 'node:assert/strict';
import test from 'node:test';

import { getDisplayRouteViewModel } from './view-model.js';

test('display route models prioritize room identity and retain route fallback copy', () => {
  assert.deepEqual(getDisplayRouteViewModel('RAGE', 'suspect'), {
    title: 'Room RAGE',
    subtitle: 'Players, grab your phones.',
    emptyMessage: 'Use /display?room=CODE after the host creates a room.',
  });
  assert.equal(getDisplayRouteViewModel('', 'hot-take').title, 'Hot Take Display');
  assert.equal(getDisplayRouteViewModel('', null).title, 'Display');
});
