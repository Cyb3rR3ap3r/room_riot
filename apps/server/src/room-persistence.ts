import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

export interface PersistedRoomRecord {
  readonly roomCode: string;
  readonly payload: string;
  readonly updatedAt: number;
}

export class RoomPersistence {
  private static readonly schemaVersion = 1;
  private readonly database: DatabaseSync;

  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA journal_mode = WAL;');
    const version = Number(
      (this.database.prepare('PRAGMA user_version').get() as { user_version?: number })
        .user_version ?? 0,
    );
    if (version > RoomPersistence.schemaVersion) {
      throw new Error(`Unsupported room persistence schema version ${version}.`);
    }
    if (version === 0) {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS room_snapshots (
          room_code TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        ) STRICT;
      `);
      this.database.exec(`PRAGMA user_version = ${RoomPersistence.schemaVersion};`);
    }
  }

  save(record: PersistedRoomRecord): void {
    this.database
      .prepare(
        `INSERT INTO room_snapshots (room_code, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(room_code) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run(record.roomCode, record.payload, record.updatedAt);
  }

  load(): readonly PersistedRoomRecord[] {
    return this.database
      .prepare('SELECT room_code AS roomCode, payload, updated_at AS updatedAt FROM room_snapshots')
      .all() as unknown as PersistedRoomRecord[];
  }

  remove(roomCode: string): void {
    this.database.prepare('DELETE FROM room_snapshots WHERE room_code = ?').run(roomCode);
  }

  async backupTo(destinationPath: string): Promise<void> {
    await backup(this.database, destinationPath);
  }

  close(): void {
    this.database.close();
  }
}
