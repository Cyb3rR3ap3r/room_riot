export type StoreListener<T> = (state: T, previousState: T) => void;
export type Equality<T> = (left: T, right: T) => boolean;

export interface Store<T> {
  getState(): T;
  setState(state: T): void;
  update(updater: (state: T) => T): void;
  select<S>(selector: (state: T) => S): S;
  subscribe(listener: StoreListener<T>): () => void;
  subscribeSelector<S>(
    selector: (state: T) => S,
    listener: (selection: S, previousSelection: S) => void,
    equality?: Equality<S>,
  ): () => void;
}

export function createStore<T>(initialState: T): Store<T> {
  let state = initialState;
  const listeners = new Set<StoreListener<T>>();

  const setState = (nextState: T): void => {
    if (Object.is(state, nextState)) return;
    const previousState = state;
    state = nextState;
    listeners.forEach((listener) => listener(state, previousState));
  };

  return {
    getState: () => state,
    setState,
    update: (updater) => setState(updater(state)),
    select: (selector) => selector(state),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeSelector: (selector, listener, equality = Object.is) => {
      let selection = selector(state);
      const unsubscribe = (nextState: T): void => {
        const nextSelection = selector(nextState);
        if (equality(selection, nextSelection)) return;
        const previousSelection = selection;
        selection = nextSelection;
        listener(nextSelection, previousSelection);
      };
      listeners.add(unsubscribe);
      return () => listeners.delete(unsubscribe);
    },
  };
}

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

export interface ClientPreferences {
  readonly soundEnabled: boolean;
  readonly volume?: number;
  readonly hapticsEnabled?: boolean;
}

export interface RevisionedRoomSnapshot {
  readonly revision: number;
  readonly state: { readonly roomCode: string };
}

export interface PublicSnapshotStore<T extends RevisionedRoomSnapshot> extends Store<T | null> {
  acceptSnapshot(snapshot: T): boolean;
  clear(): void;
}

export interface PrivatePlayerStateStore<T> extends Store<T | null> {
  getRevision(): number;
  acceptState(revision: number, state: T | null): boolean;
  clear(): void;
}

export const createConnectionStore = (
  initialState: ConnectionState = 'connecting',
): Store<ConnectionState> => createStore(initialState);

export const createSessionStore = <T>(initialSession: T | null = null): Store<T | null> =>
  createStore(initialSession);

export function createPublicSnapshotStore<T extends RevisionedRoomSnapshot>(
  initialSnapshot: T | null = null,
): PublicSnapshotStore<T> {
  const store = createStore<T | null>(initialSnapshot);
  const acceptSnapshot = (snapshot: T): boolean => {
    const current = store.getState();
    if (
      current &&
      current.state.roomCode === snapshot.state.roomCode &&
      snapshot.revision < current.revision
    ) {
      return false;
    }
    store.setState(snapshot);
    return true;
  };
  return {
    ...store,
    setState: (snapshot) => {
      if (snapshot) acceptSnapshot(snapshot);
      else store.setState(null);
    },
    acceptSnapshot,
    clear: () => store.setState(null),
  };
}

export function createPrivatePlayerStateStore<T>(): PrivatePlayerStateStore<T> {
  const store = createStore<T | null>(null);
  let revision = -1;
  const acceptState = (nextRevision: number, state: T | null): boolean => {
    if (nextRevision < revision) return false;
    revision = nextRevision;
    store.setState(state);
    return true;
  };
  const clear = (): void => {
    revision = -1;
    store.setState(null);
  };
  return {
    ...store,
    setState: (state) => {
      if (state === null) clear();
      else throw new Error('Private player state requires an authoritative revision.');
    },
    getRevision: () => revision,
    acceptState,
    clear,
  };
}

export const createDraftStore = <T>(initialDraft: T | null = null): Store<T | null> =>
  createStore(initialDraft);

export const createPreferenceStore = (
  initialPreferences: ClientPreferences = {
    soundEnabled: false,
    volume: 0.7,
    hapticsEnabled: true,
  },
): Store<ClientPreferences> => createStore(initialPreferences);
