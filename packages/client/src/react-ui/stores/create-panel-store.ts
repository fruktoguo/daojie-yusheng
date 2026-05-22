/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
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
