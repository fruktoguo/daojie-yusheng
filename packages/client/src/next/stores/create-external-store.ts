/**
 * ExternalStoreListener：统一结构类型，保证协议与运行时一致性。
 */
export type ExternalStoreListener = () => void;
/**
 * ExternalStore：定义接口结构约束，明确可交付字段含义。
 */


export interface ExternalStore<TState> {
/**
 * getState：ExternalStore 内部字段。
 */

  getState: () => TState;  
  /**
 * setState：ExternalStore 内部字段。
 */

  setState: (nextState: TState) => void;  
  /**
 * patchState：ExternalStore 内部字段。
 */

  patchState: (patch: Partial<TState>) => void;  
  /**
 * subscribe：ExternalStore 内部字段。
 */

  subscribe: (listener: ExternalStoreListener) => () => void;
}
/**
 * createExternalStore：构建并返回目标对象。
 * @param initialState TState 参数说明。
 * @returns ExternalStore<TState>。
 */


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
