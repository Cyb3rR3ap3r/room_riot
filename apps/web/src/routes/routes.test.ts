import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDisplayRoute,
  buildHostRoute,
  buildPlayRoute,
  getGameFromPathname,
  getRoomCodeFromSearch,
} from './routes.js';

test('route parsing accepts only known game routes', () => {
  assert.equal(getGameFromPathname('/host/groupthink'), 'groupthink');
  assert.equal(getGameFromPathname('/play/hot-take'), 'hot-take');
  assert.equal(getGameFromPathname('/display/drawn-out'), 'drawn-out');
  assert.equal(getGameFromPathname('/play/unknown'), null);
  assert.equal(getGameFromPathname('/play/groupthink/extra'), null);
});

test('route builders encode room codes and omit empty queries', () => {
  assert.equal(buildHostRoute('suspect'), '/host/suspect');
  assert.equal(buildHostRoute('suspect', 'A B'), '/host/suspect?room=A%20B');
  assert.equal(buildPlayRoute('groupthink', 'ABCD'), '/play/groupthink?room=ABCD');
  assert.equal(buildDisplayRoute('hot-take', 'HEAT'), '/display/hot-take?room=HEAT');
});

test('room query parsing normalizes explicit URL intent', () => {
  assert.equal(getRoomCodeFromSearch('?room= abcd '), 'ABCD');
  assert.equal(getRoomCodeFromSearch('?other=value'), '');
});
