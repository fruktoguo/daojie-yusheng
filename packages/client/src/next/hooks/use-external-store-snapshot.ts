import { useSyncExternalStore } from 'react';
import type { ExternalStore } from '../stores/create-external-store';
/**
 * useExternalStoreSnapshot：执行useExternal存储快照相关逻辑。
 * @param store ExternalStore<TState> 参数说明。
 * @returns 返回useExternal存储快照。
 */


export function useExternalStoreSnapshot<TState>(store: ExternalStore<TState>): TState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
