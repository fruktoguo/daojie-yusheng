/** 面板注册标识。 */
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

/** 面板适配的视口类型。 */
export type PanelViewport = 'desktop' | 'mobile';

/** 面板在布局中的放置位置。 */
export type PanelPlacement =
  | 'left-lower'
  | 'center-intel'
  | 'right-top'
  | 'right-bottom'
  | 'hud'
  | 'floating'
  | 'overlay'
  | 'external';

/** PanelTemplateKind：分类枚举。 */
export type PanelTemplateKind = 'embedded' | 'modal' | 'hud' | 'floating';

/** 单个面板的注册定义。 */
export interface PanelDefinition {
  id: PanelId;
  title: string;
  templateKind: PanelTemplateKind;
  rootSelector?: string;
  defaultPlacement: Partial<Record<PanelViewport, PanelPlacement>>;
  supports: PanelViewport[];
  preservesInteractionState?: boolean;
}

/** 当前环境下的视口与交互能力。 */
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

/** 某个放置位对应的面板分组。 */
export interface PanelLayoutSlot {
  placement: PanelPlacement;
  panelIds: PanelId[];
}

/** 按视口类型分组的面板布局档案。 */
export interface PanelLayoutProfile {
  id: PanelViewport;
  slots: PanelLayoutSlot[];
  overlayPanelIds: PanelId[];
}

/** 单个面板的界面状态。 */
export interface PanelUiState {
  activeTab?: string;
  selectedId?: string | null;
  openDetailId?: string | null;
  filterId?: string | null;
  modalOpen?: boolean;
}

/** 面板系统的运行时连接状态。 */
export interface PanelRuntimeState {
  connected: boolean;
  playerId: string | null;
  mapId: string | null;
  shellVisible: boolean;
}

/** 面板系统当前总状态。 */
export interface PanelSystemState {
  capabilities: PanelCapabilities;
  layout: PanelLayoutProfile;
  runtime: PanelRuntimeState;
  panels: Partial<Record<PanelId, PanelUiState>>;
}
