import { useSyncExternalStore } from 'react';
import type { ExternalStore } from '../stores/create-external-store';
/**
 * useExternalStoreSnapshot：执行核心业务逻辑。
 * @param store ExternalStore<TState> 参数说明。
 * @returns TState。
 */


export function useExternalStoreSnapshot<TState>(store: ExternalStore<TState>): TState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
