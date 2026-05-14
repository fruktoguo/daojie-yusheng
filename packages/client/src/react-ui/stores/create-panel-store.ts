/**
 * 面板级 store 工厂
 * 
 * 每个面板创建独立的 store，避免跨面板更新穿透。
 * 基于 createExternalStore 封装，增加 selector 支持。
 */
import { useSyncExternalStore, useCallback, useRef } from 'react';
import { createExternalStore, type ExternalStore } from '../stores/create-external-store';

export type { ExternalStore };

/** 创建面板级 store，返回 store 实例和配套 hook */
export function createPanelStore<TState extends object>(initialState: TState) {
  const store = createExternalStore<TState>(initialState);

  /** 订阅整个 store 状态 */
  function useStore(): TState {
    return useSyncExternalStore(
      store.subscribe,
      store.getState,
      store.getState,
    );
  }

  /** 订阅 store 的某个切片，selector 返回值浅比较决定是否重渲染 */
  function useStoreSelector<TSelected>(selector: (state: TState) => TSelected): TSelected {
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    const getSnapshot = useCallback(() => selectorRef.current(store.getState()), []);

    return useSyncExternalStore(
      store.subscribe,
      getSnapshot,
      getSnapshot,
    );
  }

  return {
    store,
    useStore,
    useStoreSelector,
  };
}
