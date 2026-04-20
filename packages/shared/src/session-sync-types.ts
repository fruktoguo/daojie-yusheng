import type { PlayerRealmState } from './cultivation-types';
import type { PlayerState } from './player-runtime-types';
import type { MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot } from './world-view-types';
import type { MapMeta, GameTimeState, RenderEntity, VisibleTile } from './world-core-types';
import type { VisibleTilePatchView } from './world-patch-types';

/** 首次连接引导包视图。 */
export interface BootstrapView {
/**
 * self：BootstrapView 内部字段。
 */

  self: PlayerState;  
  /**
 * mapMeta：BootstrapView 内部字段。
 */

  mapMeta: MapMeta;  
  /**
 * minimap：BootstrapView 内部字段。
 */

  minimap?: MapMinimapSnapshot;  
  /**
 * visibleMinimapMarkers：BootstrapView 内部字段。
 */

  visibleMinimapMarkers?: MapMinimapMarker[];  
  /**
 * minimapLibrary：BootstrapView 内部字段。
 */

  minimapLibrary: MapMinimapArchiveEntry[];  
  /**
 * tiles：BootstrapView 内部字段。
 */

  tiles: VisibleTile[][];  
  /**
 * players：BootstrapView 内部字段。
 */

  players: RenderEntity[];  
  /**
 * time：BootstrapView 内部字段。
 */

  time?: GameTimeState;  
  /**
 * auraLevelBaseValue：BootstrapView 内部字段。
 */

  auraLevelBaseValue?: number;
}

/** 会话初始化包视图。 */
export interface InitSessionView {
/**
 * sid：InitSessionView 内部字段。
 */

  sid: string;  
  /**
 * pid：InitSessionView 内部字段。
 */

  pid: string;  
  /**
 * t：InitSessionView 内部字段。
 */

  t: number;  
  /**
 * resumed：InitSessionView 内部字段。
 */

  resumed?: boolean;
}

/** 地图进入包视图。 */
export interface MapEnterView {
/**
 * iid：MapEnterView 内部字段。
 */

  iid: string;  
  /**
 * mid：MapEnterView 内部字段。
 */

  mid: string;  
  /**
 * n：MapEnterView 内部字段。
 */

  n: string;  
  /**
 * k：MapEnterView 内部字段。
 */

  k: string;  
  /**
 * w：MapEnterView 内部字段。
 */

  w: number;  
  /**
 * h：MapEnterView 内部字段。
 */

  h: number;  
  /**
 * x：MapEnterView 内部字段。
 */

  x: number;  
  /**
 * y：MapEnterView 内部字段。
 */

  y: number;
}

/** 地图静态快照视图。 */
export interface MapStaticView {
/**
 * mapId：MapStaticView 内部字段。
 */

  mapId: string;  
  /**
 * mapMeta：MapStaticView 内部字段。
 */

  mapMeta?: MapMeta;  
  /**
 * minimap：MapStaticView 内部字段。
 */

  minimap?: MapMinimapSnapshot;  
  /**
 * minimapLibrary：MapStaticView 内部字段。
 */

  minimapLibrary?: MapMinimapArchiveEntry[];  
  /**
 * tiles：MapStaticView 内部字段。
 */

  tiles?: VisibleTile[][];  
  /**
 * tilesOriginX：MapStaticView 内部字段。
 */

  tilesOriginX?: number;  
  /**
 * tilesOriginY：MapStaticView 内部字段。
 */

  tilesOriginY?: number;  
  /**
 * tilePatches：MapStaticView 内部字段。
 */

  tilePatches?: VisibleTilePatchView[];  
  /**
 * visibleMinimapMarkers：MapStaticView 内部字段。
 */

  visibleMinimapMarkers?: MapMinimapMarker[];  
  /**
 * visibleMinimapMarkerAdds：MapStaticView 内部字段。
 */

  visibleMinimapMarkerAdds?: MapMinimapMarker[];  
  /**
 * visibleMinimapMarkerRemoves：MapStaticView 内部字段。
 */

  visibleMinimapMarkerRemoves?: string[];
}

/** 境界面板快照视图。 */
export interface RealmView {
/**
 * realm：RealmView 内部字段。
 */

  realm: PlayerRealmState | null;
}

/** 延迟探测回包视图。 */
export interface PongView {
/**
 * clientAt：PongView 内部字段。
 */

  clientAt: number;  
  /**
 * serverAt：PongView 内部字段。
 */

  serverAt: number;
}

/** 任务自动导航回执视图。 */
export interface QuestNavigateResultView {
/**
 * questId：QuestNavigateResultView 内部字段。
 */

  questId: string;  
  /**
 * ok：QuestNavigateResultView 内部字段。
 */

  ok: boolean;  
  /**
 * error：QuestNavigateResultView 内部字段。
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
 * entity：EnterView 内部字段。
 */

  entity: RenderEntity;
}

/** 实体离开视野视图。 */
export interface LeaveView {
/**
 * entityId：LeaveView 内部字段。
 */

  entityId: string;
}

/** 通用错误回包视图。 */
export interface ErrorView {
/**
 * code：ErrorView 内部字段。
 */

  code: string;  
  /**
 * message：ErrorView 内部字段。
 */

  message: string;
}
