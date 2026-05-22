/**
 * 本文件属于渐进式 React UI 层，负责壳层、桥接、覆盖层或前端 store 组合。
 *
 * 维护时要复用现有网络、运行态和样式 token，避免形成与 DOM UI 冲突的第二套业务真源。
 */
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
