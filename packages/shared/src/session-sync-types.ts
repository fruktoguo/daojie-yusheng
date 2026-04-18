import type { PlayerRealmState } from './cultivation-types';
import type { PlayerState } from './player-runtime-types';
import type { MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot } from './world-view-types';
import type { MapMeta, GameTimeState, RenderEntity, VisibleTile } from './world-core-types';
import type { VisibleTilePatchView } from './world-patch-types';

/** 首次连接引导包视图。 */
export interface BootstrapView {
  self: PlayerState;
  mapMeta: MapMeta;
  minimap?: MapMinimapSnapshot;
  visibleMinimapMarkers?: MapMinimapMarker[];
  minimapLibrary: MapMinimapArchiveEntry[];
  tiles: VisibleTile[][];
  players: RenderEntity[];
  time?: GameTimeState;
  auraLevelBaseValue?: number;
}

/** 会话初始化包视图。 */
export interface InitSessionView {
  sid: string;
  pid: string;
  t: number;
  resumed?: boolean;
}

/** 地图进入包视图。 */
export interface MapEnterView {
  iid: string;
  mid: string;
  n: string;
  k: string;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** 地图静态快照视图。 */
export interface MapStaticView {
  mapId: string;
  mapMeta?: MapMeta;
  minimap?: MapMinimapSnapshot;
  minimapLibrary?: MapMinimapArchiveEntry[];
  tiles?: VisibleTile[][];
  tilesOriginX?: number;
  tilesOriginY?: number;
  tilePatches?: VisibleTilePatchView[];
  visibleMinimapMarkers?: MapMinimapMarker[];
  visibleMinimapMarkerAdds?: MapMinimapMarker[];
  visibleMinimapMarkerRemoves?: string[];
}

/** 境界面板快照视图。 */
export interface RealmView {
  realm: PlayerRealmState | null;
}

/** 延迟探测回包视图。 */
export interface PongView {
  clientAt: number;
  serverAt: number;
}

/** 任务自动导航回执视图。 */
export interface QuestNavigateResultView {
  questId: string;
  ok: boolean;
  error?: string;
}

/** 高频地图静态同步视图。 */
export interface MapStaticSyncView extends MapStaticView {}

/** 单次连接初始化视图。 */
export interface InitView extends BootstrapView {}

/** 实体进入视野视图。 */
export interface EnterView {
  entity: RenderEntity;
}

/** 实体离开视野视图。 */
export interface LeaveView {
  entityId: string;
}

/** 通用错误回包视图。 */
export interface ErrorView {
  code: string;
  message: string;
}
