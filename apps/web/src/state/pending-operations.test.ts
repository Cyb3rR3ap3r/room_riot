import assert from 'node:assert/strict';
import test from 'node:test';

import { clearPendingOperation, getOrCreatePendingOperation } from './pending-operations.js';
import type { StorageLike } from './session-store.js';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test('reload restores an exact canonical pending operation', () => {
  const storage = new MemoryStorage();
  let sequence = 0;
  const createId = (): string => `action-${++sequence}`;
  const first = getOrCreatePendingOperation(
    storage,
    'pending',
    'player:join',
    { roomCode: 'AAAA', name: 'Ari', avatar: '🤖' },
    createId,
  );
  const restored = getOrCreatePendingOperation(
    storage,
    'pending',
    'player:join',
    { avatar: '🤖', name: 'Ari', roomCode: 'AAAA' },
    createId,
  );
  assert.equal(restored.actionId, first.actionId);
  assert.equal(sequence, 1);
});

test('payload changes create a new action ID instead of restoring stale intent', () => {
  const storage = new MemoryStorage();
  let sequence = 0;
  const createId = (): string => `action-${++sequence}`;
  const first = getOrCreatePendingOperation(
    storage,
    'pending',
    'host:create-room',
    { gameId: 'groupthink', settings: { roundCount: 5 } },
    createId,
  );
  const changed = getOrCreatePendingOperation(
    storage,
    'pending',
    'host:create-room',
    { gameId: 'hot-take', settings: { roundCount: 5 } },
    createId,
  );
  assert.notEqual(changed.actionId, first.actionId);
  assert.equal(sequence, 2);
});

test('definitive acknowledgement clears only the completed pending operation', () => {
  const storage = new MemoryStorage();
  getOrCreatePendingOperation(
    storage,
    'pending',
    'host:create-room',
    { gameId: 'suspect' },
    () => 'host-action',
  );
  getOrCreatePendingOperation(
    storage,
    'pending',
    'player:join',
    { roomCode: 'AAAA' },
    () => 'player-action',
  );
  clearPendingOperation(storage, 'pending', 'host:create-room');
  const player = getOrCreatePendingOperation(
    storage,
    'pending',
    'player:join',
    { roomCode: 'AAAA' },
    () => 'replacement',
  );
  assert.equal(player.actionId, 'player-action');
  clearPendingOperation(storage, 'pending', 'player:join');
  assert.equal(storage.getItem('pending'), null);
});
