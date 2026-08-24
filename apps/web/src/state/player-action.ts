export interface PlayerActionIdentity {
  readonly roomCode: string;
  readonly gameId?: string | null;
  readonly phase: string;
  readonly game?: unknown;
  readonly playerState?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function listFingerprint(value: unknown): string | number {
  if (!Array.isArray(value)) return '';
  return value.every((entry) => typeof entry === 'string') ? value.join(',') : value.length;
}

export function createPlayerActionKey(identity: PlayerActionIdentity): string {
  const game = asRecord(identity.game);
  const privateView = asRecord(identity.playerState);
  return [
    identity.roomCode,
    identity.gameId ?? '',
    identity.phase,
    game?.roundNumber ?? '',
    game?.promptId ?? game?.prompt ?? '',
    game?.status ?? '',
    privateView?.task ?? '',
    privateView?.instruction ?? '',
    privateView?.hasSubmitted ?? '',
    privateView?.hasVoted ?? '',
    listFingerprint(privateView?.entries),
    listFingerprint(privateView?.candidatePlayerIds),
    listFingerprint(privateView?.guessOptions),
    privateView?.canSubmitAlibi ?? '',
    privateView?.roundType ?? '',
  ].join(':');
}

export function createHostMutationKey(
  event: string,
  roomCode: string,
  phase: string,
  game: unknown,
): string {
  const gameView = asRecord(game);
  return [
    event,
    roomCode,
    phase,
    gameView?.roundNumber ?? '',
    gameView?.promptId ?? gameView?.prompt ?? '',
    gameView?.status ?? '',
  ].join(':');
}

export function shouldDiscardDraft(
  draft: { readonly actionKey: string } | null,
  nextActionKey: string,
): boolean {
  return Boolean(draft && draft.actionKey !== nextActionKey);
}
