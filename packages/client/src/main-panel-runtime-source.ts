/**
 * PanelRuntimeStore：统一结构类型，保证协议与运行时一致性。
 */
type PanelRuntimeStore = {
/**
 * getState：对象字段。
 */

  getState: () => {  
  /**
 * runtime：对象字段。
 */

    runtime: unknown;    
    /**
 * capabilities：对象字段。
 */

    capabilities: unknown;
  };  
  /**
 * subscribe：对象字段。
 */

  subscribe: (listener: (state: {  
  /**
 * runtime：对象字段。
 */
 runtime: unknown;  
 /**
 * capabilities：对象字段。
 */
 capabilities: unknown }) => void) => void;  
 /**
 * setRuntime：对象字段。
 */

  setRuntime: (patch: Record<string, unknown>) => void;
};
/**
 * MainPanelRuntimeSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainPanelRuntimeSourceOptions = {
/**
 * store：对象字段。
 */

  store: PanelRuntimeStore;  
  /**
 * nextUiBridge：对象字段。
 */

  nextUiBridge: {  
  /**
 * syncRuntime：对象字段。
 */

    syncRuntime: (runtime: any) => void;    
    /**
 * syncCapabilities：对象字段。
 */

    syncCapabilities: (capabilities: any) => void;
  };
};
/**
 * MainPanelRuntimeSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainPanelRuntimeSource = ReturnType<typeof createMainPanelRuntimeSource>;
/**
 * createMainPanelRuntimeSource：构建并返回目标对象。
 * @param options MainPanelRuntimeSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainPanelRuntimeSource(options: MainPanelRuntimeSourceOptions) {
  return {  
  /**
 * syncInitialBridgeState：执行核心业务逻辑。
 * @returns void。
 */

    syncInitialBridgeState(): void {
      const state = options.store.getState();
      options.nextUiBridge.syncRuntime(state.runtime);
      options.nextUiBridge.syncCapabilities(state.capabilities);
    },    
    /**
 * subscribeBridgeState：执行核心业务逻辑。
 * @returns void。
 */


    subscribeBridgeState(): void {
      options.store.subscribe((state) => {
        options.nextUiBridge.syncRuntime(state.runtime);
        options.nextUiBridge.syncCapabilities(state.capabilities);
      });
    },    
    /**
 * setRuntime：更新/写入相关状态。
 * @param patch Record<string, unknown> 参数说明。
 * @returns void。
 */


    setRuntime(patch: Record<string, unknown>): void {
      options.store.setRuntime(patch);
    },    
    /**
 * setRuntimeMapId：更新/写入相关状态。
 * @param mapId string | null 地图 ID。
 * @returns void。
 */


    setRuntimeMapId(mapId: string | null): void {
      options.store.setRuntime({ mapId });
    },    
    /**
 * setRuntimeShellVisible：更新/写入相关状态。
 * @param visible boolean 参数说明。
 * @returns void。
 */


    setRuntimeShellVisible(visible: boolean): void {
      options.store.setRuntime({ shellVisible: visible });
    },    
    /**
 * setRuntimeDisconnected：更新/写入相关状态。
 * @returns void。
 */


    setRuntimeDisconnected(): void {
      options.store.setRuntime({ connected: false });
    },    
    /**
 * resetRuntime：执行核心业务逻辑。
 * @returns void。
 */


    resetRuntime(): void {
      options.store.setRuntime({
        connected: false,
        playerId: null,
        mapId: null,
        shellVisible: false,
      });
    },
  };
}
