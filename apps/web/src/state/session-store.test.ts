import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readPlayerDraft,
  readRoomSession,
  removePlayerDraft,
  removeRoomSession,
  writePlayerDraft,
  writeRoomSession,
  type PlayerDraft,
  type StorageLike,
} from './session-store.js';

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

interface TestSession {
  readonly roomCode: string;
  readonly token: string;
}

test('legacy sessions remain readable but explicit conflicting room intent wins', () => {
  const storage = new MemoryStorage();
  storage.setItem('sessions', JSON.stringify({ roomCode: 'AAAA', token: 'old' }));
  assert.deepEqual(readRoomSession<TestSession>(storage, 'sessions'), {
    roomCode: 'AAAA',
    token: 'old',
  });
  assert.equal(readRoomSession<TestSession>(storage, 'sessions', 'BBBB'), null);
});

test('writing migrates legacy data and keeps independent room sessions', () => {
  const storage = new MemoryStorage();
  storage.setItem('sessions', JSON.stringify({ roomCode: 'AAAA', token: 'one' }));
  writeRoomSession<TestSession>(storage, 'sessions', { roomCode: 'BBBB', token: 'two' });
  assert.equal(readRoomSession<TestSession>(storage, 'sessions', 'AAAA')?.token, 'one');
  assert.equal(readRoomSession<TestSession>(storage, 'sessions', 'BBBB')?.token, 'two');
  assert.equal(readRoomSession<TestSession>(storage, 'sessions')?.roomCode, 'BBBB');

  removeRoomSession<TestSession>(storage, 'sessions', 'BBBB');
  assert.equal(readRoomSession<TestSession>(storage, 'sessions')?.roomCode, 'AAAA');
});

test('malformed storage fails closed', () => {
  const storage = new MemoryStorage();
  storage.setItem('sessions', '{broken');
  assert.equal(readRoomSession<TestSession>(storage, 'sessions'), null);
});

test('player drafts are isolated by room and removable without affecting neighbors', () => {
  const storage = new MemoryStorage();
  writePlayerDraft(storage, 'drafts', 'AAAA', { actionKey: 'a', answer: 'first' });
  writePlayerDraft(storage, 'drafts', 'BBBB', { actionKey: 'b', selections: ['vote-1'] });
  assert.equal(readPlayerDraft(storage, 'drafts', 'AAAA')?.answer, 'first');
  assert.deepEqual(readPlayerDraft(storage, 'drafts', 'BBBB')?.selections, ['vote-1']);
  removePlayerDraft(storage, 'drafts', 'AAAA');
  assert.equal(readPlayerDraft(storage, 'drafts', 'AAAA'), null);
  assert.equal(readPlayerDraft(storage, 'drafts', 'BBBB')?.actionKey, 'b');
});

test('all interactive draft shapes round-trip and remain isolated by room', () => {
  const storage = new MemoryStorage();
  const drafts: ReadonlyArray<readonly [string, PlayerDraft]> = [
    ['TEXT', { actionKey: 'groupthink:input:1', answer: 'shared brain cell' }],
    ['TARGET', { actionKey: 'hot-take:input:1', selections: ['player-2'] }],
    ['VOTE', { actionKey: 'hot-take:voting:1', selections: ['entry-3'] }],
    ['ALIBI', { actionKey: 'suspect:alibi:1', answer: 'I was at the snack table.' }],
    [
      'DRAW',
      {
        actionKey: 'drawn-out:input:1',
        drawing: {
          strokes: [
            {
              color: '#ff3366',
              width: 0.012,
              points: [
                { x: 0.1, y: 0.2 },
                { x: 0.4, y: 0.6 },
              ],
            },
          ],
        },
      },
    ],
  ];
  for (const [roomCode, draft] of drafts) writePlayerDraft(storage, 'drafts', roomCode, draft);
  for (const [roomCode, draft] of drafts) {
    assert.deepEqual(readPlayerDraft(storage, 'drafts', roomCode), draft);
  }
});

test('drawing undo state overwrites only that room draft', () => {
  const storage = new MemoryStorage();
  const firstStroke = {
    color: '#112233',
    width: 0.01,
    points: [{ x: 0.2, y: 0.3 }],
  };
  const secondStroke = {
    color: '#445566',
    width: 0.02,
    points: [{ x: 0.7, y: 0.8 }],
  };
  writePlayerDraft(storage, 'drafts', 'DRAW', {
    actionKey: 'drawn-out:input:1',
    drawing: { strokes: [firstStroke, secondStroke] },
  });
  writePlayerDraft(storage, 'drafts', 'TEXT', {
    actionKey: 'groupthink:input:1',
    answer: 'untouched',
  });
  writePlayerDraft(storage, 'drafts', 'DRAW', {
    actionKey: 'drawn-out:input:1',
    drawing: { strokes: [firstStroke] },
  });
  assert.deepEqual(readPlayerDraft(storage, 'drafts', 'DRAW')?.drawing?.strokes, [firstStroke]);
  assert.equal(readPlayerDraft(storage, 'drafts', 'TEXT')?.answer, 'untouched');
});
