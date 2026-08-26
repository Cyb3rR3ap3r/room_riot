import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { RoomPersistence } from './room-persistence.js';

test('room persistence migrates a new database and restores a backup copy', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'room-riot-persistence-'));
  const sourcePath = join(directory, 'rooms.sqlite');
  const backupPath = join(directory, 'rooms-backup.sqlite');
  const record = { roomCode: 'ABC123', payload: '{"phase":"lobby"}', updatedAt: 42 };

  try {
    const source = new RoomPersistence(sourcePath);
    source.save(record);
    await source.backupTo(backupPath);
    source.close();

    const restored = new RoomPersistence(backupPath);
    try {
      const [restoredRecord] = restored.load();
      assert.equal(restoredRecord?.roomCode, record.roomCode);
      assert.equal(restoredRecord?.payload, record.payload);
      assert.equal(restoredRecord?.updatedAt, record.updatedAt);
    } finally {
      restored.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
