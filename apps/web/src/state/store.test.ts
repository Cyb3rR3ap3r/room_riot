import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createConnectionStore,
  createDraftStore,
  createPreferenceStore,
  createPrivatePlayerStateStore,
  createPublicSnapshotStore,
  createSessionStore,
  createStore,
} from './store.js';

test('stores publish synchronous state transitions and support unsubscribe', () => {
  const store = createStore(0);
  const transitions: Array<[number, number]> = [];
  const unsubscribe = store.subscribe((state, previous) => transitions.push([state, previous]));
  store.setState(1);
  store.update((state) => state + 1);
  unsubscribe();
  store.setState(3);
  assert.equal(store.getState(), 3);
  assert.deepEqual(transitions, [
    [1, 0],
    [2, 1],
  ]);
});

test('selector subscriptions notify only when the selected value changes', () => {
  const store = createStore({ roomCode: 'AAAA', count: 1 });
  const selections: string[] = [];
  store.subscribeSelector(
    (state) => state.roomCode,
    (roomCode) => selections.push(roomCode),
  );
  store.setState({ roomCode: 'AAAA', count: 2 });
  store.setState({ roomCode: 'BBBB', count: 2 });
  assert.deepEqual(selections, ['BBBB']);
  assert.equal(
    store.select((state) => state.count),
    2,
  );
});

test('client store factories keep state domains independent', () => {
  const connection = createConnectionStore();
  const session = createSessionStore<{ roomCode: string }>();
  const snapshot = createPublicSnapshotStore<{
    revision: number;
    state: { roomCode: string };
    phase: string;
  }>();
  const privatePlayer = createPrivatePlayerStateStore<{ task: string }>();
  const draft = createDraftStore<{ answer: string }>();
  const preferences = createPreferenceStore();

  connection.setState('connected');
  session.setState({ roomCode: 'AAAA' });
  snapshot.setState({ revision: 1, state: { roomCode: 'AAAA' }, phase: 'input' });
  privatePlayer.acceptState(1, { task: 'answer' });
  draft.setState({ answer: 'hello' });
  preferences.setState({ soundEnabled: true });

  assert.equal(connection.getState(), 'connected');
  assert.equal(session.getState()?.roomCode, 'AAAA');
  assert.equal(snapshot.getState()?.phase, 'input');
  assert.equal(privatePlayer.getState()?.task, 'answer');
  assert.equal(draft.getState()?.answer, 'hello');
  assert.equal(preferences.getState().soundEnabled, true);
});

test('public snapshots accept equal and newer revisions while rejecting older room state', () => {
  const snapshot = createPublicSnapshotStore<{
    revision: number;
    state: { roomCode: string };
    value: string;
  }>();
  const acceptedValues: string[] = [];
  snapshot.subscribe((state) => {
    if (state) acceptedValues.push(state.value);
  });

  assert.equal(
    snapshot.acceptSnapshot({ revision: 3, state: { roomCode: 'AAAA' }, value: 'current' }),
    true,
  );
  assert.equal(
    snapshot.acceptSnapshot({ revision: 2, state: { roomCode: 'AAAA' }, value: 'old' }),
    false,
  );
  assert.equal(snapshot.getState()?.value, 'current');
  assert.equal(
    snapshot.acceptSnapshot({ revision: 3, state: { roomCode: 'AAAA' }, value: 'equal' }),
    true,
  );
  assert.equal(
    snapshot.acceptSnapshot({ revision: 4, state: { roomCode: 'AAAA' }, value: 'new' }),
    true,
  );
  assert.deepEqual(acceptedValues, ['current', 'equal', 'new']);
});

test('a different room starts a new monotonic revision sequence', () => {
  const snapshot = createPublicSnapshotStore<{
    revision: number;
    state: { roomCode: string };
  }>({ revision: 10, state: { roomCode: 'AAAA' } });
  assert.equal(snapshot.acceptSnapshot({ revision: 1, state: { roomCode: 'BBBB' } }), true);
  assert.equal(snapshot.getState()?.state.roomCode, 'BBBB');
  assert.equal(snapshot.getState()?.revision, 1);
});

test('private player state rejects revisions older than its accepted room update', () => {
  const privatePlayer = createPrivatePlayerStateStore<{ value: string }>();
  const acceptedValues: string[] = [];
  privatePlayer.subscribe((state) => {
    if (state) acceptedValues.push(state.value);
  });
  assert.equal(privatePlayer.acceptState(5, { value: 'current' }), true);
  assert.equal(privatePlayer.acceptState(4, { value: 'old' }), false);
  assert.equal(privatePlayer.acceptState(5, { value: 'equal' }), true);
  assert.equal(privatePlayer.acceptState(6, { value: 'new' }), true);
  assert.equal(privatePlayer.getRevision(), 6);
  assert.equal(privatePlayer.getState()?.value, 'new');
  assert.deepEqual(acceptedValues, ['current', 'equal', 'new']);
  privatePlayer.clear();
  assert.equal(privatePlayer.getRevision(), -1);
  assert.equal(privatePlayer.getState(), null);
});
