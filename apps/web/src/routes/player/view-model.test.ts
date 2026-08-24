import assert from 'node:assert/strict';
import test from 'node:test';

import { getPlayerRouteViewModel } from './view-model.js';

test('player route models preserve themed join and controller fixtures', () => {
  assert.deepEqual(getPlayerRouteViewModel('groupthink'), {
    joinKicker: 'Connect your mind',
    joinHelper: 'Enter the room code and tune into the consensus reactor.',
    controllerClass: 'consensus-controller',
    controllerTitle: 'Your mind is in the loop.',
  });
  assert.equal(getPlayerRouteViewModel('hot-take', 'input').controllerTitle, 'The stage is yours.');
  assert.equal(
    getPlayerRouteViewModel('suspect', 'lobby').controllerTitle,
    'Your case file is open.',
  );
  assert.equal(
    getPlayerRouteViewModel('drawn-out', 'input').controllerTitle,
    'Art was a mistake. Make it worse.',
  );
});
