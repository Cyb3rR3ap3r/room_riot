import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRecoveryDiagnosticCopy,
  createRecoveryStateViewModel,
  getRecoveryActionTimeoutMs,
  getRecoveryRetryDelayMs,
  getRecoveryStateForEventError,
} from './recovery-state.js';
import type { RecoveryState } from './recovery-state.js';

test('provides deterministic presentation and recovery actions for every state', () => {
  const fixtures: readonly {
    state: RecoveryState;
    title: RegExp;
    actions: readonly string[];
  }[] = [
    {
      state: { kind: 'initial-connect', role: 'host' },
      title: /connecting/i,
      actions: ['return-to-launcher'],
    },
    {
      state: { kind: 'reconnecting', role: 'player', attempt: 2 },
      title: /rejoining/i,
      actions: ['retry', 'return-to-launcher'],
    },
    {
      state: { kind: 'room-missing', role: 'player', roomCode: 'ABCD' },
      title: /not found/i,
      actions: ['edit-room-code', 'return-to-launcher'],
    },
    {
      state: { kind: 'room-full', role: 'player', roomCode: 'ABCD' },
      title: /full/i,
      actions: ['retry', 'edit-room-code'],
    },
    {
      state: { kind: 'server-unavailable', role: 'display', attempt: 3 },
      title: /unavailable/i,
      actions: ['retry', 'copy-diagnostics'],
    },
    {
      state: { kind: 'stale-session', role: 'player', roomCode: 'ABCD' },
      title: /expired/i,
      actions: ['rejoin', 'return-to-launcher'],
    },
    {
      state: {
        kind: 'incompatible-client',
        role: 'host',
        clientVersion: '1.0.0',
        serverVersion: '2.0.0',
      },
      title: /update/i,
      actions: ['reload-client', 'copy-diagnostics'],
    },
    {
      state: { kind: 'action-timeout', role: 'player', actionLabel: 'Submit answer' },
      title: /submit answer needs another try/i,
      actions: ['retry', 'copy-diagnostics'],
    },
  ];

  for (const fixture of fixtures) {
    const view = createRecoveryStateViewModel(fixture.state);
    assert.match(view.title, fixture.title);
    assert.ok(view.message.length > 20);
    assert.deepEqual(
      view.actions.map((action) => action.id),
      fixture.actions,
    );
    assert.equal(new Set(view.actions.map((action) => action.id)).size, view.actions.length);
    assert.match(view.diagnosticCopy, new RegExp(`state=${fixture.state.kind}`));
  }
});

test('bounds exponential retry delays and acknowledgement timeouts', () => {
  assert.equal(getRecoveryRetryDelayMs(-10), 500);
  assert.equal(getRecoveryRetryDelayMs(0), 500);
  assert.equal(getRecoveryRetryDelayMs(1), 1_000);
  assert.equal(getRecoveryRetryDelayMs(30), 8_000);
  assert.equal(getRecoveryRetryDelayMs(20, { initialDelayMs: 1, maximumDelayMs: 999_999 }), 30_000);
  assert.equal(getRecoveryActionTimeoutMs({ actionTimeoutMs: 1 }), 1_000);
  assert.equal(getRecoveryActionTimeoutMs({ actionTimeoutMs: 999_999 }), 30_000);

  const initial = createRecoveryStateViewModel({ kind: 'initial-connect', role: 'host' });
  assert.deepEqual(initial.retry, { attempt: 0, automatic: true, delayMs: 0, timeoutMs: 8_000 });
  const unavailable = createRecoveryStateViewModel({
    kind: 'server-unavailable',
    role: 'display',
    attempt: 4,
  });
  assert.equal(unavailable.retry?.automatic, false);
  assert.equal(unavailable.retry?.delayMs, 8_000);
});

test('diagnostic copy is allowlisted and never includes credentials or unsafe server text', () => {
  const credential = '123e4567-e89b-42d3-a456-426614174000';
  const state = {
    kind: 'server-unavailable',
    role: 'player',
    roomCode: 'abcd',
    errorCode: 'SERVER_OFFLINE',
    clientVersion: '1.2.3',
    serverVersion: `secret ${credential}`,
    hostToken: credential,
    playerToken: credential,
    serverMessage: `Authorization failed for ${credential}`,
  } as const;
  const diagnostic = createRecoveryDiagnosticCopy(state);

  assert.match(diagnostic, /room=ABCD/);
  assert.match(diagnostic, /error=SERVER_OFFLINE/);
  assert.match(diagnostic, /client=1.2.3/);
  assert.doesNotMatch(diagnostic, /hostToken|playerToken|serverMessage|secret|123e4567/i);
});

test('unsafe action labels and diagnostic values fall back to product-safe copy', () => {
  const view = createRecoveryStateViewModel({
    kind: 'action-timeout',
    role: 'host',
    actionLabel: '<script>token</script>',
    errorCode: 'bad error with secret detail',
  });
  assert.equal(view.title, 'Action needs another try');
  assert.equal(view.actions[0]?.label, 'Retry action');
  assert.doesNotMatch(view.diagnosticCopy, /secret|script|token/i);
});

test('maps every public event error to an explicit recovery path', () => {
  const context = { role: 'player' as const, roomCode: 'RAGE' };
  assert.equal(
    getRecoveryStateForEventError({ code: 'ROOM_NOT_FOUND' }, context).kind,
    'room-missing',
  );
  assert.equal(getRecoveryStateForEventError({ code: 'ROOM_FULL' }, context).kind, 'room-full');
  assert.equal(getRecoveryStateForEventError({ code: 'PLAYER_LIMIT' }, context).kind, 'room-full');
  assert.equal(
    getRecoveryStateForEventError({ code: 'UNAUTHORIZED' }, context).kind,
    'stale-session',
  );
  for (const code of ['INVALID_STATE', 'INVALID_REQUEST', 'IDEMPOTENCY_CONFLICT']) {
    const state = getRecoveryStateForEventError({ code }, context, 'Submit answer');
    assert.equal(state.kind, 'action-timeout');
    assert.equal(state.errorCode, code);
  }
  for (const code of ['ROOM_LIMIT', 'IDEMPOTENCY_CAPACITY', 'INTERNAL_ERROR', 'UNKNOWN']) {
    assert.equal(getRecoveryStateForEventError({ code }, context).kind, 'server-unavailable');
  }
});

test('event recovery diagnostics preserve safe codes and reject credential-shaped context', () => {
  const credential = '123e4567-e89b-12d3-a456-426614174000';
  const state = getRecoveryStateForEventError(
    { code: 'INTERNAL_ERROR' },
    { role: 'host', roomCode: 'RAGE42', clientVersion: credential },
  );
  const copy = createRecoveryStateViewModel(state).diagnosticCopy;
  assert.match(copy, /state=server-unavailable/);
  assert.match(copy, /error=INTERNAL_ERROR/);
  assert.match(copy, /room=RAGE42/);
  assert.doesNotMatch(copy, new RegExp(credential));
});
