export type ActionIdFactory = () => string;

export function getClientActionId(
  actionIds: Map<string, string>,
  key: string,
  createId: ActionIdFactory = () => globalThis.crypto.randomUUID(),
): string {
  const existing = actionIds.get(key);
  if (existing) return existing;
  const actionId = createId();
  actionIds.set(key, actionId);
  return actionId;
}
