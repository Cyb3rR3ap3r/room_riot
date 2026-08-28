import assert from 'node:assert/strict';
import test from 'node:test';

import { createClientId } from './client-id.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('uses randomUUID when the browser provides it', () => {
  assert.equal(createClientId({ randomUUID: () => 'native-id' }), 'native-id');
});

test('uses an HTTP-safe random-value fallback when randomUUID is unavailable', () => {
  const id = createClientId({
    getRandomValues: (values) => {
      values.fill(0);
      return values;
    },
  });
  assert.match(id, UUID_PATTERN);
  assert.equal(id, '00000000-0000-4000-8000-000000000000');
});

test('falls back to a UUID-shaped ID when Web Crypto is unavailable', () => {
  assert.match(createClientId({}), UUID_PATTERN);
});
