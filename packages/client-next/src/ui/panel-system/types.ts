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
/** id：定义该变量以承载业务值。 */
  id: PanelId;
/** title：定义该变量以承载业务值。 */
  title: string;
/** templateKind：定义该变量以承载业务值。 */
  templateKind: PanelTemplateKind;
  rootSelector?: string;
/** defaultPlacement：定义该变量以承载业务值。 */
  defaultPlacement: Partial<Record<PanelViewport, PanelPlacement>>;
/** supports：定义该变量以承载业务值。 */
  supports: PanelViewport[];
  preservesInteractionState?: boolean;
}

/** PanelCapabilities：定义该接口的能力与字段约束。 */
export interface PanelCapabilities {
/** viewportWidth：定义该变量以承载业务值。 */
  viewportWidth: number;
/** viewportHeight：定义该变量以承载业务值。 */
  viewportHeight: number;
/** pointerCoarse：定义该变量以承载业务值。 */
  pointerCoarse: boolean;
/** hoverAvailable：定义该变量以承载业务值。 */
  hoverAvailable: boolean;
/** reducedMotion：定义该变量以承载业务值。 */
  reducedMotion: boolean;
/** breakpoint：定义该变量以承载业务值。 */
  breakpoint: 'mobile' | 'tablet' | 'desktop';
/** viewport：定义该变量以承载业务值。 */
  viewport: PanelViewport;
  safeAreaInsets: {
/** top：定义该变量以承载业务值。 */
    top: number;
/** right：定义该变量以承载业务值。 */
    right: number;
/** bottom：定义该变量以承载业务值。 */
    bottom: number;
/** left：定义该变量以承载业务值。 */
    left: number;
  };
}

/** PanelLayoutSlot：定义该接口的能力与字段约束。 */
export interface PanelLayoutSlot {
/** placement：定义该变量以承载业务值。 */
  placement: PanelPlacement;
/** panelIds：定义该变量以承载业务值。 */
  panelIds: PanelId[];
}

/** PanelLayoutProfile：定义该接口的能力与字段约束。 */
export interface PanelLayoutProfile {
/** id：定义该变量以承载业务值。 */
  id: PanelViewport;
/** slots：定义该变量以承载业务值。 */
  slots: PanelLayoutSlot[];
/** overlayPanelIds：定义该变量以承载业务值。 */
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
/** connected：定义该变量以承载业务值。 */
  connected: boolean;
/** playerId：定义该变量以承载业务值。 */
  playerId: string | null;
/** mapId：定义该变量以承载业务值。 */
  mapId: string | null;
/** shellVisible：定义该变量以承载业务值。 */
  shellVisible: boolean;
}

/** PanelSystemState：定义该接口的能力与字段约束。 */
export interface PanelSystemState {
/** capabilities：定义该变量以承载业务值。 */
  capabilities: PanelCapabilities;
/** layout：定义该变量以承载业务值。 */
  layout: PanelLayoutProfile;
/** runtime：定义该变量以承载业务值。 */
  runtime: PanelRuntimeState;
/** panels：定义该变量以承载业务值。 */
  panels: Partial<Record<PanelId, PanelUiState>>;
}

