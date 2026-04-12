/** PanelId：定义该类型的结构与数据语义。 */
export type PanelId =
  | 'hud'
  | 'chat'
  | 'attr'
  | 'inventory'
  | 'equipment'
  | 'technique'
  | 'body-training'
  | 'quest'
  | 'market'
  | 'action'
  | 'world-map-intel'
  | 'world-nearby'
  | 'world-suggestions'
  | 'world-tianji'
  | 'loot'
  | 'settings'
  | 'mail'
  | 'suggestion'
  | 'changelog'
  | 'minimap'
  | 'debug';

/** PanelViewport：定义该类型的结构与数据语义。 */
export type PanelViewport = 'desktop' | 'mobile';

/** PanelPlacement：定义该类型的结构与数据语义。 */
export type PanelPlacement =
  | 'left-lower'
  | 'center-intel'
  | 'right-top'
  | 'right-bottom'
  | 'hud'
  | 'floating'
  | 'overlay'
  | 'external';

/** PanelTemplateKind：定义该类型的结构与数据语义。 */
export type PanelTemplateKind = 'embedded' | 'modal' | 'hud' | 'floating';

/** PanelDefinition：定义该接口的能力与字段约束。 */
export interface PanelDefinition {
  id: PanelId;
  title: string;
  templateKind: PanelTemplateKind;
  rootSelector?: string;
  defaultPlacement: Partial<Record<PanelViewport, PanelPlacement>>;
  supports: PanelViewport[];
  preservesInteractionState?: boolean;
}

/** PanelCapabilities：定义该接口的能力与字段约束。 */
export interface PanelCapabilities {
  viewportWidth: number;
  viewportHeight: number;
  pointerCoarse: boolean;
  hoverAvailable: boolean;
  reducedMotion: boolean;
  breakpoint: 'mobile' | 'tablet' | 'desktop';
  viewport: PanelViewport;
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/** PanelLayoutSlot：定义该接口的能力与字段约束。 */
export interface PanelLayoutSlot {
  placement: PanelPlacement;
  panelIds: PanelId[];
}

/** PanelLayoutProfile：定义该接口的能力与字段约束。 */
export interface PanelLayoutProfile {
  id: PanelViewport;
  slots: PanelLayoutSlot[];
  overlayPanelIds: PanelId[];
}

/** PanelUiState：定义该接口的能力与字段约束。 */
export interface PanelUiState {
  activeTab?: string;
  selectedId?: string | null;
  openDetailId?: string | null;
  filterId?: string | null;
  modalOpen?: boolean;
}

/** PanelRuntimeState：定义该接口的能力与字段约束。 */
export interface PanelRuntimeState {
  connected: boolean;
  playerId: string | null;
  mapId: string | null;
  shellVisible: boolean;
}

/** PanelSystemState：定义该接口的能力与字段约束。 */
export interface PanelSystemState {
  capabilities: PanelCapabilities;
  layout: PanelLayoutProfile;
  runtime: PanelRuntimeState;
  panels: Partial<Record<PanelId, PanelUiState>>;
}

