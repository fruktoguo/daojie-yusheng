import { PanelCapabilities, PanelId, PanelLayoutProfile, PanelRuntimeState, PanelSystemState, PanelUiState } from './types';

type PanelSystemListener = (state: PanelSystemState, previousState: PanelSystemState) => void;


function clonePanelsState(
  panels: Partial<Record<PanelId, PanelUiState>>,
): Partial<Record<PanelId, PanelUiState>> {
  return Object.fromEntries(
    Object.entries(panels).map(([id, state]) => [
      id,
      state ? { ...state } : state,
    ]),
  ) as Partial<Record<PanelId, PanelUiState>>;
}

export class PanelSystemStore {
  private state: PanelSystemState;
  private readonly listeners = new Set<PanelSystemListener>();

/** constructor：初始化实例并完成构造。 */
  constructor(initialState: PanelSystemState) {
    this.state = {
      ...initialState,
      runtime: { ...initialState.runtime },
      capabilities: { ...initialState.capabilities, safeAreaInsets: { ...initialState.capabilities.safeAreaInsets } },
      layout: {
        ...initialState.layout,
        slots: initialState.layout.slots.map((slot) => ({ ...slot, panelIds: [...slot.panelIds] })),
        overlayPanelIds: [...initialState.layout.overlayPanelIds],
      },
      panels: clonePanelsState(initialState.panels),
    };
  }

  getState(): PanelSystemState {
    return {
      ...this.state,
      runtime: { ...this.state.runtime },
      capabilities: { ...this.state.capabilities, safeAreaInsets: { ...this.state.capabilities.safeAreaInsets } },
      layout: {
        ...this.state.layout,
        slots: this.state.layout.slots.map((slot) => ({ ...slot, panelIds: [...slot.panelIds] })),
        overlayPanelIds: [...this.state.layout.overlayPanelIds],
      },
      panels: clonePanelsState(this.state.panels),
    };
  }

  subscribe(listener: PanelSystemListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

/** setCapabilities：设置并同步相关状态。 */
  setCapabilities(capabilities: PanelCapabilities, layout: PanelLayoutProfile): void {
    this.patchState({
      capabilities: {
        ...capabilities,
        safeAreaInsets: { ...capabilities.safeAreaInsets },
      },
      layout: {
        ...layout,
        slots: layout.slots.map((slot) => ({ ...slot, panelIds: [...slot.panelIds] })),
        overlayPanelIds: [...layout.overlayPanelIds],
      },
    });
  }

/** setRuntime：设置并同步相关状态。 */
  setRuntime(runtimePatch: Partial<PanelRuntimeState>): void {
    this.patchState({
      runtime: {
        ...this.state.runtime,
        ...runtimePatch,
      },
    });
  }


  patchPanelUi(panelId: PanelId, panelPatch: Partial<PanelUiState>): void {
    const current = this.state.panels[panelId] ?? {};
    this.patchState({
      panels: {
        ...this.state.panels,
        [panelId]: {
          ...current,
          ...panelPatch,
        },
      },
    });
  }


  private patchState(patch: Partial<PanelSystemState>): void {
    const previousState = this.getState();
    this.state = {
      ...this.state,
      ...patch,
    };
    const nextState = this.getState();
    for (const listener of this.listeners) {
      listener(nextState, previousState);
    }
  }
}

