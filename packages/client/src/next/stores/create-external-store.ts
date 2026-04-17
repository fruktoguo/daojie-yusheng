export type ExternalStoreListener = () => void;

export interface ExternalStore<TState> {
  getState: () => TState;
  setState: (nextState: TState) => void;
  patchState: (patch: Partial<TState>) => void;
  subscribe: (listener: ExternalStoreListener) => () => void;
}

export function createExternalStore<TState extends object>(initialState: TState): ExternalStore<TState> {
  let state = initialState;
  const listeners = new Set<ExternalStoreListener>();

  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getState: () => state,
    setState: (nextState) => {
      if (Object.is(state, nextState)) {
        return;
      }
      state = nextState;
      emit();
    },
    patchState: (patch) => {
      const nextState = {
        ...state,
        ...patch,
      };
      if (Object.is(state, nextState)) {
        return;
      }
      state = nextState;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
