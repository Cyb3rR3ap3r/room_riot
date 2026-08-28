import type { StorageLike } from './session-store.js';
import { createClientId } from './client-id.js';

export interface PendingOperation<T = unknown> {
  readonly actionId: string;
  readonly payload: T;
}

type PendingOperationCollection = Readonly<Record<string, PendingOperation>>;

function readPendingOperations(
  storage: StorageLike,
  storageKey: string,
): PendingOperationCollection {
  try {
    const value = storage.getItem(storageKey);
    return value ? (JSON.parse(value) as PendingOperationCollection) : {};
  } catch {
    return {};
  }
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function getOrCreatePendingOperation<T>(
  storage: StorageLike,
  storageKey: string,
  operationKey: string,
  payload: T,
  createId: () => string = createClientId,
): PendingOperation<T> {
  const operations = readPendingOperations(storage, storageKey);
  const existing = operations[operationKey];
  if (existing && canonicalize(existing.payload) === canonicalize(payload)) {
    return existing as PendingOperation<T>;
  }
  const operation = { actionId: createId(), payload };
  try {
    storage.setItem(storageKey, JSON.stringify({ ...operations, [operationKey]: operation }));
  } catch {
    // Storage failure must not prevent the action from being sent in this tab.
  }
  return operation;
}

export function clearPendingOperation(
  storage: StorageLike,
  storageKey: string,
  operationKey: string,
): void {
  const operations = { ...readPendingOperations(storage, storageKey) };
  if (!operations[operationKey]) return;
  delete operations[operationKey];
  try {
    if (Object.keys(operations).length === 0) {
      storage.removeItem(storageKey);
      return;
    }
    storage.setItem(storageKey, JSON.stringify(operations));
  } catch {
    // The server acknowledgement remains authoritative if storage is unavailable.
  }
}
