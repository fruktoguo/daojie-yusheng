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
/**
 * id：PanelDefinition 内部字段。
 */

  id: PanelId;  
  /**
 * title：PanelDefinition 内部字段。
 */

  title: string;  
  /**
 * templateKind：PanelDefinition 内部字段。
 */

  templateKind: PanelTemplateKind;  
  /**
 * rootSelector：PanelDefinition 内部字段。
 */

  rootSelector?: string;  
  /**
 * defaultPlacement：PanelDefinition 内部字段。
 */

  defaultPlacement: Partial<Record<PanelViewport, PanelPlacement>>;  
  /**
 * supports：PanelDefinition 内部字段。
 */

  supports: PanelViewport[];  
  /**
 * preservesInteractionState：PanelDefinition 内部字段。
 */

  preservesInteractionState?: boolean;
}

/** 当前环境下的视口与交互能力。 */
export interface PanelCapabilities {
/**
 * viewportWidth：PanelCapabilities 内部字段。
 */

  viewportWidth: number;  
  /**
 * viewportHeight：PanelCapabilities 内部字段。
 */

  viewportHeight: number;  
  /**
 * pointerCoarse：PanelCapabilities 内部字段。
 */

  pointerCoarse: boolean;  
  /**
 * hoverAvailable：PanelCapabilities 内部字段。
 */

  hoverAvailable: boolean;  
  /**
 * reducedMotion：PanelCapabilities 内部字段。
 */

  reducedMotion: boolean;  
  /**
 * breakpoint：PanelCapabilities 内部字段。
 */

  breakpoint: 'mobile' | 'tablet' | 'desktop';  
  /**
 * viewport：PanelCapabilities 内部字段。
 */

  viewport: PanelViewport;  
  /**
 * safeAreaInsets：PanelCapabilities 内部字段。
 */

  safeAreaInsets: {  
  /**
 * top：PanelCapabilities 内部字段。
 */

    top: number;    
    /**
 * right：PanelCapabilities 内部字段。
 */

    right: number;    
    /**
 * bottom：PanelCapabilities 内部字段。
 */

    bottom: number;    
    /**
 * left：PanelCapabilities 内部字段。
 */

    left: number;
  };
}

/** 某个放置位对应的面板分组。 */
export interface PanelLayoutSlot {
/**
 * placement：PanelLayoutSlot 内部字段。
 */

  placement: PanelPlacement;  
  /**
 * panelIds：PanelLayoutSlot 内部字段。
 */

  panelIds: PanelId[];
}

/** 按视口类型分组的面板布局档案。 */
export interface PanelLayoutProfile {
/**
 * id：PanelLayoutProfile 内部字段。
 */

  id: PanelViewport;  
  /**
 * slots：PanelLayoutProfile 内部字段。
 */

  slots: PanelLayoutSlot[];  
  /**
 * overlayPanelIds：PanelLayoutProfile 内部字段。
 */

  overlayPanelIds: PanelId[];
}

/** 单个面板的界面状态。 */
export interface PanelUiState {
/**
 * activeTab：PanelUiState 内部字段。
 */

  activeTab?: string;  
  /**
 * selectedId：PanelUiState 内部字段。
 */

  selectedId?: string | null;  
  /**
 * openDetailId：PanelUiState 内部字段。
 */

  openDetailId?: string | null;  
  /**
 * filterId：PanelUiState 内部字段。
 */

  filterId?: string | null;  
  /**
 * modalOpen：PanelUiState 内部字段。
 */

  modalOpen?: boolean;
}

/** 面板系统的运行时连接状态。 */
export interface PanelRuntimeState {
/**
 * connected：PanelRuntimeState 内部字段。
 */

  connected: boolean;  
  /**
 * playerId：PanelRuntimeState 内部字段。
 */

  playerId: string | null;  
  /**
 * mapId：PanelRuntimeState 内部字段。
 */

  mapId: string | null;  
  /**
 * shellVisible：PanelRuntimeState 内部字段。
 */

  shellVisible: boolean;
}

/** 面板系统当前总状态。 */
export interface PanelSystemState {
/**
 * capabilities：PanelSystemState 内部字段。
 */

  capabilities: PanelCapabilities;  
  /**
 * layout：PanelSystemState 内部字段。
 */

  layout: PanelLayoutProfile;  
  /**
 * runtime：PanelSystemState 内部字段。
 */

  runtime: PanelRuntimeState;  
  /**
 * panels：PanelSystemState 内部字段。
 */

  panels: Partial<Record<PanelId, PanelUiState>>;
}
