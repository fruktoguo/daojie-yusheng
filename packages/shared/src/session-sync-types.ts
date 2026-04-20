import type { PlayerRealmState } from './cultivation-types';
import type { PlayerState } from './player-runtime-types';
import type { MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot } from './world-view-types';
import type { MapMeta, GameTimeState, RenderEntity, VisibleTile } from './world-core-types';
import type { VisibleTilePatchView } from './world-patch-types';

/** 首次连接引导包视图。玩家完整面板状态以 self 为真源，避免再由首连 PanelDelta 重复整包下发。 */
export interface BootstrapView {
/**
 * self：self相关字段。
 */

  self: PlayerState;  
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
 * tilePatches：tilePatche相关字段。
 */

  tilePatches?: VisibleTilePatchView[];  
  /**
 * visibleMinimapMarkers：可见MinimapMarker相关字段。
 */

  visibleMinimapMarkers?: MapMinimapMarker[];  
  /**
 * visibleMinimapMarkerAdds：可见MinimapMarkerAdd相关字段。
 */

  visibleMinimapMarkerAdds?: MapMinimapMarker[];  
  /**
 * visibleMinimapMarkerRemoves：可见MinimapMarkerRemove相关字段。
 */

  visibleMinimapMarkerRemoves?: string[];
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
