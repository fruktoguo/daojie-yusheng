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
 * id：ID标识。
 */

  id: PanelId;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * templateKind：templateKind相关字段。
 */

  templateKind: PanelTemplateKind;  
  /**
 * rootSelector：根容器Selector相关字段。
 */

  rootSelector?: string;  
  /**
 * defaultPlacement：defaultPlacement相关字段。
 */

  defaultPlacement: Partial<Record<PanelViewport, PanelPlacement>>;  
  /**
 * supports：support相关字段。
 */

  supports: PanelViewport[];  
  /**
 * preservesInteractionState：preserveInteraction状态状态或数据块。
 */

  preservesInteractionState?: boolean;
}

/** 当前环境下的视口与交互能力。 */
export interface PanelCapabilities {
/**
 * viewportWidth：viewportWidth相关字段。
 */

  viewportWidth: number;  
  /**
 * viewportHeight：viewportHeight相关字段。
 */

  viewportHeight: number;  
  /**
 * pointerCoarse：pointerCoarse相关字段。
 */

  pointerCoarse: boolean;  
  /**
 * hoverAvailable：hoverAvailable相关字段。
 */

  hoverAvailable: boolean;  
  /**
 * reducedMotion：reducedMotion相关字段。
 */

  reducedMotion: boolean;  
  /**
 * breakpoint：breakpoint相关字段。
 */

  breakpoint: 'mobile' | 'tablet' | 'desktop';  
  /**
 * viewport：viewport相关字段。
 */

  viewport: PanelViewport;  
  /**
 * safeAreaInsets：safeAreaInset相关字段。
 */

  safeAreaInsets: {  
  /**
 * top：top相关字段。
 */

    top: number;    
    /**
 * right：right相关字段。
 */

    right: number;    
    /**
 * bottom：bottom相关字段。
 */

    bottom: number;    
    /**
 * left：left相关字段。
 */

    left: number;
  };
}

/** 某个放置位对应的面板分组。 */
export interface PanelLayoutSlot {
/**
 * placement：placement相关字段。
 */

  placement: PanelPlacement;  
  /**
 * panelIds：面板ID相关字段。
 */

  panelIds: PanelId[];
}

/** 按视口类型分组的面板布局档案。 */
export interface PanelLayoutProfile {
/**
 * id：ID标识。
 */

  id: PanelViewport;  
  /**
 * slots：slot相关字段。
 */

  slots: PanelLayoutSlot[];  
  /**
 * overlayPanelIds：overlay面板ID相关字段。
 */

  overlayPanelIds: PanelId[];
}

/** 单个面板的界面状态。 */
export interface PanelUiState {
/**
 * activeTab：激活状态Tab相关字段。
 */

  activeTab?: string;  
  /**
 * selectedId：selectedID标识。
 */

  selectedId?: string | null;  
  /**
 * openDetailId：open详情ID标识。
 */

  openDetailId?: string | null;  
  /**
 * filterId：filterID标识。
 */

  filterId?: string | null;  
  /**
 * modalOpen：弹层Open相关字段。
 */

  modalOpen?: boolean;
}

/** 面板系统的运行时连接状态。 */
export interface PanelRuntimeState {
/**
 * connected：connected相关字段。
 */

  connected: boolean;  
  /**
 * playerId：玩家ID标识。
 */

  playerId: string | null;  
  /**
 * mapId：地图ID标识。
 */

  mapId: string | null;  
  /**
 * shellVisible：shell可见相关字段。
 */

  shellVisible: boolean;
}

/** 面板系统当前总状态。 */
export interface PanelSystemState {
/**
 * capabilities：capability相关字段。
 */

  capabilities: PanelCapabilities;  
  /**
 * layout：layout相关字段。
 */

  layout: PanelLayoutProfile;  
  /**
 * runtime：运行态引用。
 */

  runtime: PanelRuntimeState;  
  /**
 * panels：面板相关字段。
 */

  panels: Partial<Record<PanelId, PanelUiState>>;
}
