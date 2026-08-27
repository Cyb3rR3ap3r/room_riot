export type RecoveryRole = 'host' | 'player' | 'display';

export interface RecoveryDiagnosticContext {
  readonly role: RecoveryRole;
  readonly roomCode?: string | undefined;
  readonly errorCode?: string | undefined;
  readonly clientVersion?: string | undefined;
  readonly serverVersion?: string | undefined;
}

export type RecoveryState =
  | ({ readonly kind: 'initial-connect' } & RecoveryDiagnosticContext)
  | ({ readonly kind: 'reconnecting'; readonly attempt: number } & RecoveryDiagnosticContext)
  | ({ readonly kind: 'room-missing' } & RecoveryDiagnosticContext)
  | ({ readonly kind: 'room-full' } & RecoveryDiagnosticContext)
  | ({ readonly kind: 'server-unavailable'; readonly attempt?: number } & RecoveryDiagnosticContext)
  | ({ readonly kind: 'stale-session' } & RecoveryDiagnosticContext)
  | ({ readonly kind: 'incompatible-client' } & RecoveryDiagnosticContext)
  | ({
      readonly kind: 'action-timeout';
      readonly actionLabel?: string | undefined;
    } & RecoveryDiagnosticContext);

export type RecoveryActionId =
  | 'retry'
  | 'edit-room-code'
  | 'rejoin'
  | 'reload-client'
  | 'return-to-launcher'
  | 'copy-diagnostics';

export interface RecoveryActionViewModel {
  readonly id: RecoveryActionId;
  readonly label: string;
  readonly emphasis: 'primary' | 'secondary' | 'quiet';
}

export interface RecoveryRetryViewModel {
  readonly attempt: number;
  readonly automatic: boolean;
  readonly delayMs: number;
  readonly timeoutMs: number;
}

export interface RecoveryStateViewModel {
  readonly kind: RecoveryState['kind'];
  readonly tone: 'loading' | 'warning' | 'error';
  readonly title: string;
  readonly message: string;
  readonly actions: readonly RecoveryActionViewModel[];
  readonly retry: RecoveryRetryViewModel | null;
  readonly diagnosticCopy: string;
}

export interface RecoveryTimingOptions {
  readonly initialDelayMs?: number;
  readonly maximumDelayMs?: number;
  readonly actionTimeoutMs?: number;
}

export interface PublicEventError {
  readonly code: string;
}

/** Converts the public, allowlisted error code into recovery UX without rendering server text. */
export function getRecoveryStateForEventError(
  error: PublicEventError,
  context: RecoveryDiagnosticContext,
  actionLabel?: string,
): RecoveryState {
  const common = { ...context, errorCode: error.code };
  switch (error.code) {
    case 'ROOM_NOT_FOUND':
      return { ...common, kind: 'room-missing' };
    case 'ROOM_FULL':
    case 'PLAYER_LIMIT':
      return { ...common, kind: 'room-full' };
    case 'UNAUTHORIZED':
      return { ...common, kind: 'stale-session' };
    case 'INVALID_STATE':
    case 'INVALID_REQUEST':
    case 'IDEMPOTENCY_CONFLICT':
      return { ...common, kind: 'action-timeout', actionLabel };
    case 'ROOM_LIMIT':
    case 'IDEMPOTENCY_CAPACITY':
    case 'INTERNAL_ERROR':
    default:
      return { ...common, kind: 'server-unavailable' };
  }
}

export const DEFAULT_RECOVERY_TIMING = Object.freeze({
  initialDelayMs: 500,
  maximumDelayMs: 8_000,
  actionTimeoutMs: 8_000,
});

const MINIMUM_DELAY_MS = 250;
const MAXIMUM_DELAY_MS = 30_000;
const MINIMUM_TIMEOUT_MS = 1_000;
const MAXIMUM_TIMEOUT_MS = 30_000;

export function createRecoveryStateViewModel(
  state: RecoveryState,
  timingOptions: RecoveryTimingOptions = {},
): RecoveryStateViewModel {
  const retry = createRetryViewModel(state, timingOptions);
  const common = {
    kind: state.kind,
    diagnosticCopy: createRecoveryDiagnosticCopy(state),
    retry,
  } as const;

  switch (state.kind) {
    case 'initial-connect':
      return {
        ...common,
        tone: 'loading',
        title: 'Connecting to Room Riot',
        message: 'Warming up the room and checking the live connection.',
        actions: [action('return-to-launcher', 'Back to game select', 'quiet')],
      };
    case 'reconnecting':
      return {
        ...common,
        tone: 'warning',
        title: 'Rejoining the room',
        message: 'The connection dropped. Your seat and in-progress input are being recovered.',
        actions: [
          action('retry', 'Retry now', 'primary'),
          action('return-to-launcher', 'Leave this room', 'quiet'),
        ],
      };
    case 'room-missing':
      return {
        ...common,
        tone: 'error',
        title: 'Room not found',
        message: 'That room code is no longer active or may have been entered incorrectly.',
        actions: [
          action('edit-room-code', 'Check room code', 'primary'),
          action('return-to-launcher', 'Back to game select', 'secondary'),
        ],
      };
    case 'room-full':
      return {
        ...common,
        tone: 'warning',
        title: 'This room is full',
        message: 'Every available seat is claimed. Ask the host to free a seat, then try again.',
        actions: [
          action('retry', 'Try again', 'primary'),
          action('edit-room-code', 'Join another room', 'secondary'),
        ],
      };
    case 'server-unavailable':
      return {
        ...common,
        tone: 'error',
        title: 'Room Riot is unavailable',
        message: 'The game server could not be reached. Check the local network and retry.',
        actions: [
          action('retry', 'Retry connection', 'primary'),
          action('copy-diagnostics', 'Copy diagnostics', 'secondary'),
        ],
      };
    case 'stale-session':
      return {
        ...common,
        tone: 'warning',
        title: 'Your saved seat expired',
        message: 'This device has an old room session. Rejoin to claim a fresh seat safely.',
        actions: [
          action('rejoin', 'Rejoin room', 'primary'),
          action('return-to-launcher', 'Back to game select', 'secondary'),
        ],
      };
    case 'incompatible-client':
      return {
        ...common,
        tone: 'error',
        title: 'Update required',
        message: 'This page is older than the game server. Reload before continuing.',
        actions: [
          action('reload-client', 'Reload Room Riot', 'primary'),
          action('copy-diagnostics', 'Copy diagnostics', 'secondary'),
        ],
      };
    case 'action-timeout': {
      const actionLabel = safeActionLabel(state.actionLabel);
      return {
        ...common,
        tone: 'warning',
        title: `${actionLabel} needs another try`,
        message:
          'No acknowledgement arrived. The action can be retried safely without losing input.',
        actions: [
          action('retry', `Retry ${actionLabel.toLowerCase()}`, 'primary'),
          action('copy-diagnostics', 'Copy diagnostics', 'quiet'),
        ],
      };
    }
  }
}

export function getRecoveryRetryDelayMs(
  attempt: number,
  options: RecoveryTimingOptions = {},
): number {
  const initialDelayMs = clampInteger(
    options.initialDelayMs ?? DEFAULT_RECOVERY_TIMING.initialDelayMs,
    MINIMUM_DELAY_MS,
    MAXIMUM_DELAY_MS,
  );
  const maximumDelayMs = Math.max(
    initialDelayMs,
    clampInteger(
      options.maximumDelayMs ?? DEFAULT_RECOVERY_TIMING.maximumDelayMs,
      MINIMUM_DELAY_MS,
      MAXIMUM_DELAY_MS,
    ),
  );
  const boundedAttempt = clampInteger(attempt, 0, 30);
  return Math.min(maximumDelayMs, initialDelayMs * 2 ** boundedAttempt);
}

export function getRecoveryActionTimeoutMs(options: RecoveryTimingOptions = {}): number {
  return clampInteger(
    options.actionTimeoutMs ?? DEFAULT_RECOVERY_TIMING.actionTimeoutMs,
    MINIMUM_TIMEOUT_MS,
    MAXIMUM_TIMEOUT_MS,
  );
}

export function createRecoveryDiagnosticCopy(state: RecoveryState): string {
  const entries = [
    ['state', state.kind],
    ['role', state.role],
    ['room', safeRoomCode(state.roomCode)],
    ['error', safeDiagnosticValue(state.errorCode)],
    ['client', safeDiagnosticValue(state.clientVersion)],
    ['server', safeDiagnosticValue(state.serverVersion)],
    ['attempt', 'attempt' in state ? String(clampInteger(state.attempt ?? 0, 0, 30)) : undefined],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return ['Room Riot diagnostics', ...entries.map(([key, value]) => `${key}=${value}`)].join('\n');
}

function createRetryViewModel(
  state: RecoveryState,
  options: RecoveryTimingOptions,
): RecoveryRetryViewModel | null {
  if (
    !['initial-connect', 'reconnecting', 'server-unavailable', 'action-timeout'].includes(
      state.kind,
    )
  ) {
    return null;
  }
  const attempt = 'attempt' in state ? clampInteger(state.attempt ?? 0, 0, 30) : 0;
  return {
    attempt,
    automatic: state.kind === 'initial-connect' || state.kind === 'reconnecting',
    delayMs: state.kind === 'initial-connect' ? 0 : getRecoveryRetryDelayMs(attempt, options),
    timeoutMs: getRecoveryActionTimeoutMs(options),
  };
}

function action(
  id: RecoveryActionId,
  label: string,
  emphasis: RecoveryActionViewModel['emphasis'],
): RecoveryActionViewModel {
  return { id, label, emphasis };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function safeRoomCode(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9]{4,6}$/.test(normalized) ? normalized : undefined;
}

function safeDiagnosticValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || !/^[A-Za-z0-9._-]{1,64}$/.test(normalized)) return undefined;
  // Session tokens and correlation IDs are UUID-shaped. Diagnostics never need either.
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function safeActionLabel(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9 ]{1,32}$/.test(normalized) ? normalized : 'Action';
}
