import type { DrawingData } from '@room-riot/contracts';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SessionCollection<T> {
  readonly version: 2;
  readonly lastRoomCode: string;
  readonly sessions: Readonly<Record<string, T>>;
}

export interface PlayerDraft {
  readonly actionKey: string;
  answer?: string;
  selections?: string[];
  noMatch?: boolean;
  drawing?: DrawingData;
}

function parseStorage<T>(storage: StorageLike, key: string): T | null {
  try {
    const value = storage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function isSessionCollection<T>(stored: T | SessionCollection<T>): stored is SessionCollection<T> {
  return (
    typeof stored === 'object' &&
    stored !== null &&
    'version' in stored &&
    stored.version === 2 &&
    'sessions' in stored
  );
}

export function readRoomSession<T extends { readonly roomCode: string }>(
  storage: StorageLike,
  key: string,
  requestedRoomCode = '',
): T | null {
  const stored = parseStorage<T | SessionCollection<T>>(storage, key);
  if (!stored) return null;
  if (isSessionCollection(stored)) {
    const roomCode = requestedRoomCode || stored.lastRoomCode;
    return stored.sessions[roomCode] ?? null;
  }
  return !requestedRoomCode || stored.roomCode === requestedRoomCode ? stored : null;
}

export function writeRoomSession<T extends { readonly roomCode: string }>(
  storage: StorageLike,
  key: string,
  session: T,
): void {
  const stored = parseStorage<T | SessionCollection<T>>(storage, key);
  const sessions =
    stored && isSessionCollection(stored)
      ? { ...stored.sessions }
      : stored
        ? { [stored.roomCode]: stored }
        : {};
  sessions[session.roomCode] = session;
  storage.setItem(key, JSON.stringify({ version: 2, lastRoomCode: session.roomCode, sessions }));
}

export function removeRoomSession<T extends { readonly roomCode: string }>(
  storage: StorageLike,
  key: string,
  roomCode: string,
): void {
  const stored = parseStorage<T | SessionCollection<T>>(storage, key);
  if (!stored) return;
  if (!isSessionCollection(stored)) {
    if (stored.roomCode === roomCode) storage.removeItem(key);
    return;
  }
  const sessions = { ...stored.sessions };
  delete sessions[roomCode];
  const roomCodes = Object.keys(sessions);
  if (!roomCodes.length) {
    storage.removeItem(key);
    return;
  }
  const lastRoomCode =
    stored.lastRoomCode === roomCode
      ? (roomCodes[roomCodes.length - 1] ?? '')
      : stored.lastRoomCode;
  storage.setItem(key, JSON.stringify({ version: 2, lastRoomCode, sessions }));
}

export function readPlayerDraft(
  storage: StorageLike,
  key: string,
  roomCode: string,
): PlayerDraft | null {
  if (!roomCode) return null;
  return parseStorage<Record<string, PlayerDraft>>(storage, key)?.[roomCode] ?? null;
}

export function writePlayerDraft(
  storage: StorageLike,
  key: string,
  roomCode: string,
  draft: PlayerDraft,
): void {
  if (!roomCode) return;
  try {
    const drafts = parseStorage<Record<string, PlayerDraft>>(storage, key) ?? {};
    storage.setItem(key, JSON.stringify({ ...drafts, [roomCode]: draft }));
  } catch {
    // Storage can be unavailable or full; callers keep the in-memory draft.
  }
}

export function removePlayerDraft(storage: StorageLike, key: string, roomCode: string): void {
  try {
    const drafts = parseStorage<Record<string, PlayerDraft>>(storage, key);
    if (!drafts?.[roomCode]) return;
    const next = { ...drafts };
    delete next[roomCode];
    storage.setItem(key, JSON.stringify(next));
  } catch {
    storage.removeItem(key);
  }
}
