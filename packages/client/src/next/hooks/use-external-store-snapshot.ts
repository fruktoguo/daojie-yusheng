import { useSyncExternalStore } from 'react';
import type { ExternalStore } from '../stores/create-external-store';

export function useExternalStoreSnapshot<TState>(store: ExternalStore<TState>): TState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
