import { PanelCapabilities, PanelId, PanelLayoutProfile, PanelRuntimeState, PanelSystemState, PanelUiState } from './types';

/** 面板状态变更监听器。 */
type PanelSystemListener = (state: PanelSystemState, previousState: PanelSystemState) => void;

/** clonePanelsState：克隆Panels状态。 */
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

/** PanelSystemStore：面板系统存储实现。 */
export class PanelSystemStore {
  /** state：状态。 */
  private state: PanelSystemState;
  /** listeners：listeners。 */
  private readonly listeners = new Set<PanelSystemListener>();  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param initialState PanelSystemState 参数说明。
 * @returns 无返回值（构造函数）。
 */


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

  /** getState：读取状态。 */
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

  /** subscribe：处理subscribe。 */
  subscribe(listener: PanelSystemListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** setCapabilities：处理set Capabilities。 */
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

  /** setRuntime：处理set运行时。 */
  setRuntime(runtimePatch: Partial<PanelRuntimeState>): void {
    this.patchState({
      runtime: {
        ...this.state.runtime,
        ...runtimePatch,
      },
    });
  }

  /** patchPanelUi：处理patch面板界面。 */
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

  /** patchState：处理patch状态。 */
  private patchState(patch: Partial<PanelSystemState>): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
