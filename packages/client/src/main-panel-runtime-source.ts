type PanelRuntimeStore = {
  getState: () => {
    runtime: unknown;
    capabilities: unknown;
  };
  subscribe: (listener: (state: { runtime: unknown; capabilities: unknown }) => void) => void;
  setRuntime: (patch: Record<string, unknown>) => void;
};

type MainPanelRuntimeSourceOptions = {
  store: PanelRuntimeStore;
  nextUiBridge: {
    syncRuntime: (runtime: any) => void;
    syncCapabilities: (capabilities: any) => void;
  };
};

export type MainPanelRuntimeSource = ReturnType<typeof createMainPanelRuntimeSource>;

export function createMainPanelRuntimeSource(options: MainPanelRuntimeSourceOptions) {
  return {
    syncInitialBridgeState(): void {
      const state = options.store.getState();
      options.nextUiBridge.syncRuntime(state.runtime);
      options.nextUiBridge.syncCapabilities(state.capabilities);
    },

    subscribeBridgeState(): void {
      options.store.subscribe((state) => {
        options.nextUiBridge.syncRuntime(state.runtime);
        options.nextUiBridge.syncCapabilities(state.capabilities);
      });
    },

    setRuntime(patch: Record<string, unknown>): void {
      options.store.setRuntime(patch);
    },

    setRuntimeMapId(mapId: string | null): void {
      options.store.setRuntime({ mapId });
    },

    setRuntimeShellVisible(visible: boolean): void {
      options.store.setRuntime({ shellVisible: visible });
    },

    setRuntimeDisconnected(): void {
      options.store.setRuntime({ connected: false });
    },

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
