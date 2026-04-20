/**
 * PanelRuntimeStore：统一结构类型，保证协议与运行时一致性。
 */
type PanelRuntimeStore = {
/**
 * getState：状态状态或数据块。
 */

  getState: () => {  
  /**
 * runtime：运行态引用。
 */

    runtime: unknown;    
    /**
 * capabilities：capability相关字段。
 */

    capabilities: unknown;
  };  
  /**
 * subscribe：subscribe相关字段。
 */

  subscribe: (listener: (state: {  
  /**
 * runtime：运行态引用。
 */
 runtime: unknown;  
 /**
 * capabilities：capability相关字段。
 */
 capabilities: unknown }) => void) => void;  
 /**
 * setRuntime：运行态引用。
 */

  setRuntime: (patch: Record<string, unknown>) => void;
};
/**
 * MainPanelRuntimeSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainPanelRuntimeSourceOptions = {
/**
 * store：存储引用。
 */

  store: PanelRuntimeStore;  
  /**
 * nextUiBridge：nextUi桥接引用。
 */

  nextUiBridge: {  
  /**
 * syncRuntime：运行态引用。
 */

    syncRuntime: (runtime: any) => void;    
    /**
 * syncCapabilities：Capability相关字段。
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
 * @returns 无返回值，直接更新Main面板运行态来源相关状态。
 */


export function createMainPanelRuntimeSource(options: MainPanelRuntimeSourceOptions) {
  return {  
  /**
 * syncInitialBridgeState：处理Initial桥接状态并更新相关状态。
 * @returns 无返回值，直接更新Initial桥接状态相关状态。
 */

    syncInitialBridgeState(): void {
      const state = options.store.getState();
      options.nextUiBridge.syncRuntime(state.runtime);
      options.nextUiBridge.syncCapabilities(state.capabilities);
    },    
    /**
 * subscribeBridgeState：执行subscribe桥接状态相关逻辑。
 * @returns 无返回值，直接更新subscribe桥接状态相关状态。
 */


    subscribeBridgeState(): void {
      options.store.subscribe((state) => {
        options.nextUiBridge.syncRuntime(state.runtime);
        options.nextUiBridge.syncCapabilities(state.capabilities);
      });
    },    
    /**
 * setRuntime：写入运行态。
 * @param patch Record<string, unknown> 参数说明。
 * @returns 无返回值，直接更新运行态相关状态。
 */


    setRuntime(patch: Record<string, unknown>): void {
      options.store.setRuntime(patch);
    },    
    /**
 * setRuntimeMapId：写入运行态地图ID。
 * @param mapId string | null 地图 ID。
 * @returns 无返回值，直接更新运行态地图ID相关状态。
 */


    setRuntimeMapId(mapId: string | null): void {
      options.store.setRuntime({ mapId });
    },    
    /**
 * setRuntimeShellVisible：写入运行态Shell可见。
 * @param visible boolean 参数说明。
 * @returns 无返回值，直接更新运行态Shell可见相关状态。
 */


    setRuntimeShellVisible(visible: boolean): void {
      options.store.setRuntime({ shellVisible: visible });
    },    
    /**
 * setRuntimeDisconnected：写入运行态Disconnected。
 * @returns 无返回值，直接更新运行态Disconnected相关状态。
 */


    setRuntimeDisconnected(): void {
      options.store.setRuntime({ connected: false });
    },    
    /**
 * resetRuntime：执行reset运行态相关逻辑。
 * @returns 无返回值，直接更新reset运行态相关状态。
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
