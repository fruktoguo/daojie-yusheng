import type { PlayerRealmState } from './cultivation-types';
import type { QuestRuntimeStateView } from './quest-types';
import type { PlayerState } from './player-runtime-types';
import type { MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot } from './world-view-types';
import type { MapMeta, GameTimeState, RenderEntity, VisibleTile } from './world-core-types';

/** 首包物品实例态：静态说明、装备模板、效果等由客户端本地资源补齐。 */
export interface BootstrapItemStackView {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * count：数量或计量字段。
 */

  count: number;
  /**
 * enhanceLevel：强化等级属于实例态，仅非零时下发。
 */

  enhanceLevel?: number;
}

/** 首包背包只承载实例态，道具静态说明走本地模板资源。 */
export interface BootstrapInventoryView {
/**
 * capacity：capacity相关字段。
 */

  capacity: number;
  /**
 * items：集合字段。
 */

  items: BootstrapItemStackView[];
}

/** 首包装备只承载实例态，道具静态说明走本地模板资源。 */
export type BootstrapEquipmentView = {
  [K in keyof PlayerState['equipment']]: BootstrapItemStackView | null;
};

/** 首包功法实例态：功法模板、层配置、属性曲线等由客户端本地资源补齐。 */
export interface BootstrapTechniqueView {
/**
 * techId：功法ID标识。
 */

  techId: string;
  /**
 * level：等级数值。
 */

  level?: number;
  /**
 * exp：exp相关字段。
 */

  exp?: number;
  /**
 * expToNext：进度上限，用于首屏进度展示。
 */

  expToNext?: number;
  /**
 * skillsEnabled：启用开关或状态标识。
 */

  skillsEnabled?: boolean | null;
}

/** 首包技能行动实例态：技能模板说明、范围、目标模式等由客户端本地资源补齐。 */
export interface BootstrapActionView {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * cooldownLeft：冷却Left相关字段。
 */

  cooldownLeft?: number;
  /**
 * autoBattleEnabled：启用开关或状态标识。
 */

  autoBattleEnabled?: boolean | null;
  /**
 * autoBattleOrder：autoBattle订单相关字段。
 */

  autoBattleOrder?: number | null;
  /**
 * skillEnabled：启用开关或状态标识。
 */

  skillEnabled?: boolean | null;
}

/** 首包玩家视图：保留运行态字段，面板静态描述由客户端模板补齐。 */
export interface BootstrapSelfView extends Omit<PlayerState, 'inventory' | 'equipment' | 'techniques' | 'actions' | 'bonuses' | 'quests'> {
/**
 * inventory：背包相关字段。
 */

  inventory: BootstrapInventoryView;
  /**
 * equipment：装备相关字段。
 */

  equipment: BootstrapEquipmentView;
  /**
 * techniques：功法相关字段。
 */

  techniques: BootstrapTechniqueView[];
  /**
 * actions：action相关字段。
 */

  actions: BootstrapActionView[];
  /**
 * quests：任务运行态，静态任务内容由客户端模板补齐。
 */

  quests: QuestRuntimeStateView[];
}

/** 首次连接引导包视图。玩家面板静态字段由客户端模板补齐，避免首包重复下发。 */
export interface BootstrapView {
/**
 * self：self相关字段。
 */

  self: BootstrapSelfView;  
  /**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta?: MapMeta;  
  /**
 * minimap：缓存或索引容器。
 */

  minimap?: MapMinimapSnapshot;  
  /**
 * visibleMinimapMarkers：可见MinimapMarker相关字段。
 */

  visibleMinimapMarkers?: MapMinimapMarker[];  
  /**
 * minimapLibrary：minimapLibrary相关字段。
 */

  minimapLibrary?: MapMinimapArchiveEntry[];  
  /**
 * tiles：tile相关字段。
 */

  tiles?: VisibleTile[][];  
  /**
 * players：集合字段。
 */

  players?: RenderEntity[];  
  /**
 * time：时间相关字段。
 */

  time?: GameTimeState;  
  /**
 * auraLevelBaseValue：aura等级Base值数值。
 */

  auraLevelBaseValue?: number;
}

/** 会话初始化包视图。 */
export interface InitSessionView {
/**
 * sid：sid标识。
 */

  sid: string;  
  /**
 * pid：pid标识。
 */

  pid: string;  
  /**
 * t：t相关字段。
 */

  t: number;  
  /**
 * resumed：resumed相关字段。
 */

  resumed?: boolean;
}

/** 地图进入包视图。 */
export interface MapEnterView {
/**
 * iid：iid标识。
 */

  iid: string;  
  /**
 * mid：mid标识。
 */

  mid: string;  
  /**
 * n：n相关字段。
 */

  n: string;  
  /**
 * k：k相关字段。
 */

  k: string;  
  /**
 * w：w相关字段。
 */

  w: number;  
  /**
 * h：h相关字段。
 */

  h: number;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;
}

/** 地图静态快照视图。 */
export interface MapStaticView {
/**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta?: MapMeta;  
  /**
 * minimap：缓存或索引容器。
 */

  minimap?: MapMinimapSnapshot;  
  /**
 * minimapLibrary：minimapLibrary相关字段。
 */

  minimapLibrary?: MapMinimapArchiveEntry[];  
  /**
 * tiles：tile相关字段。
 */

  tiles?: VisibleTile[][];  
  /**
 * tilesOriginX：tileOriginX相关字段。
 */

  tilesOriginX?: number;  
  /**
 * tilesOriginY：tileOriginY相关字段。
 */

  tilesOriginY?: number;  
  /**
 * visibleMinimapMarkers：可见MinimapMarker相关字段。
 */

  visibleMinimapMarkers?: MapMinimapMarker[];  
}

/** 境界面板快照视图。 */
export interface RealmView {
/**
 * realm：realm相关字段。
 */

  realm: PlayerRealmState | null;
}

/** 延迟探测回包视图。 */
export interface PongView {
/**
 * clientAt：clientAt相关字段。
 */

  clientAt: number;  
  /**
 * serverAt：serverAt相关字段。
 */

  serverAt: number;
}

/** 任务自动导航回执视图。 */
export interface QuestNavigateResultView {
/**
 * questId：任务ID标识。
 */

  questId: string;  
  /**
 * ok：ok相关字段。
 */

  ok: boolean;  
  /**
 * error：error相关字段。
 */

  error?: string;
  /**
 * path：当前地图首段导航路径。
 */

  path?: [number, number][];
}

/** 高频地图静态同步视图。 */
export interface MapStaticSyncView extends MapStaticView {}

/** 单次连接初始化视图。 */
export interface InitView extends BootstrapView {}

/** 实体进入视野视图。 */
export interface EnterView {
/**
 * entity：entity相关字段。
 */

  entity: RenderEntity;
}

/** 实体离开视野视图。 */
export interface LeaveView {
/**
 * entityId：entityID标识。
 */

  entityId: string;
}

/** 通用错误回包视图。 */
export interface ErrorView {
/**
 * code：code相关字段。
 */

  code: string;  
  /**
 * message：message相关字段。
 */

  message: string;
}
