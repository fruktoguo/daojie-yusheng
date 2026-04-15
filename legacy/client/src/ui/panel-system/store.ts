import { PanelCapabilities, PanelId, PanelLayoutProfile, PanelRuntimeState, PanelSystemState, PanelUiState } from './types';

/** PanelSystemListener：定义该类型的结构与数据语义。 */
type PanelSystemListener = (state: PanelSystemState, previousState: PanelSystemState) => void;

/** clonePanelsState：执行对应的业务逻辑。 */
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

/** PanelSystemStore：封装相关状态与行为。 */
export class PanelSystemStore {
/** state：定义该变量以承载业务值。 */
  private state: PanelSystemState;
  private readonly listeners = new Set<PanelSystemListener>();

/** constructor：处理当前场景中的对应操作。 */
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

/** getState：执行对应的业务逻辑。 */
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

/** setCapabilities：执行对应的业务逻辑。 */
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

/** setRuntime：执行对应的业务逻辑。 */
  setRuntime(runtimePatch: Partial<PanelRuntimeState>): void {
    this.patchState({
      runtime: {
        ...this.state.runtime,
        ...runtimePatch,
      },
    });
  }

/** patchPanelUi：执行对应的业务逻辑。 */
  patchPanelUi(panelId: PanelId, panelPatch: Partial<PanelUiState>): void {
/** current：定义该变量以承载业务值。 */
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

/** patchState：执行对应的业务逻辑。 */
  private patchState(patch: Partial<PanelSystemState>): void {
/** previousState：定义该变量以承载业务值。 */
    const previousState = this.getState();
    this.state = {
      ...this.state,
      ...patch,
    };
/** nextState：定义该变量以承载业务值。 */
    const nextState = this.getState();
    for (const listener of this.listeners) {
      listener(nextState, previousState);
    }
  }
}

