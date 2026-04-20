import type {
  GameTimeState,
  GroundItemPileView,
  GridPoint,
  MapMeta,
  MapMinimapMarker,
  MapMinimapSnapshot,
  MonsterTier,
  Tile,
  TargetingShape,
  VisibleBuffState,
  S2C_Init,
  S2C_MapStaticSync,
  S2C_Tick,
  TickRenderEntity,
} from '@mud/shared';

/** MapSafeAreaInsets：定义该接口的能力与字段约束。 */
export interface MapSafeAreaInsets {
/** top：定义该变量以承载业务值。 */
  top: number;
/** right：定义该变量以承载业务值。 */
  right: number;
/** bottom：定义该变量以承载业务值。 */
  bottom: number;
/** left：定义该变量以承载业务值。 */
  left: number;
}

/** ObservedMapEntity：定义该接口的能力与字段约束。 */
export interface ObservedMapEntity {
/** id：定义该变量以承载业务值。 */
  id: string;
/** wx：定义该变量以承载业务值。 */
  wx: number;
/** wy：定义该变量以承载业务值。 */
  wy: number;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
  badge?: TickRenderEntity['badge'];
  name?: string;
  kind?: string;
  hostile?: boolean;
  monsterTier?: MonsterTier;
  monsterScale?: number;
  hp?: number;
  maxHp?: number;
  respawnRemainingTicks?: number;
  respawnTotalTicks?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: TickRenderEntity['npcQuestMarker'];
  observation?: TickRenderEntity['observation'];
  buffs?: VisibleBuffState[];
}

/** MapTargetingOverlayState：定义该接口的能力与字段约束。 */
export interface MapTargetingOverlayState {
/** originX：定义该变量以承载业务值。 */
  originX: number;
/** originY：定义该变量以承载业务值。 */
  originY: number;
/** range：定义该变量以承载业务值。 */
  range: number;
  visibleOnly?: boolean;
  shape?: TargetingShape;
  radius?: number;
  affectedCells?: GridPoint[];
  hoverX?: number;
  hoverY?: number;
}

/** MapSenseQiOverlayState：定义该接口的能力与字段约束。 */
export interface MapSenseQiOverlayState {
  hoverX?: number;
  hoverY?: number;
  levelBaseValue?: number;
}

/** MapOverlayState：定义该接口的能力与字段约束。 */
export interface MapOverlayState {
/** pathCells：定义该变量以承载业务值。 */
  pathCells: GridPoint[];
/** targeting：定义该变量以承载业务值。 */
  targeting: MapTargetingOverlayState | null;
/** senseQi：定义该变量以承载业务值。 */
  senseQi: MapSenseQiOverlayState | null;
/** threatArrows：定义该变量以承载业务值。 */
  threatArrows: Array<{ ownerId: string; targetId: string }>;
}

/** MinimapSourceSnapshot：定义该接口的能力与字段约束。 */
export interface MinimapSourceSnapshot {
/** mapMeta：定义该变量以承载业务值。 */
  mapMeta: MapMeta | null;
/** snapshot：定义该变量以承载业务值。 */
  snapshot: MapMinimapSnapshot | null;
/** rememberedMarkers：定义该变量以承载业务值。 */
  rememberedMarkers: MapMinimapMarker[];
/** visibleMarkers：定义该变量以承载业务值。 */
  visibleMarkers: MapMinimapMarker[];
/** tileCache：定义该变量以承载业务值。 */
  tileCache: ReadonlyMap<string, Tile>;
/** visibleTiles：定义该变量以承载业务值。 */
  visibleTiles: ReadonlySet<string>;
/** visibleEntities：定义该变量以承载业务值。 */
  visibleEntities: readonly ObservedMapEntity[];
/** groundPiles：定义该变量以承载业务值。 */
  groundPiles: ReadonlyMap<string, GroundItemPileView>;
/** player：定义该变量以承载业务值。 */
  player: { x: number; y: number } | null;
/** viewRadius：定义该变量以承载业务值。 */
  viewRadius: number;
/** memoryVersion：定义该变量以承载业务值。 */
  memoryVersion: number;
}

/** MapEntityTransition：定义该接口的能力与字段约束。 */
export interface MapEntityTransition {
  movedId?: string;
  shiftX?: number;
  shiftY?: number;
  snapCamera?: boolean;
  settleMotion?: boolean;
}

/** MapTickTiming：定义该接口的能力与字段约束。 */
export interface MapTickTiming {
/** startedAt：定义该变量以承载业务值。 */
  startedAt: number;
/** durationMs：定义该变量以承载业务值。 */
  durationMs: number;
}

/** MapStoreSnapshot：定义该接口的能力与字段约束。 */
export interface MapStoreSnapshot {
/** mapMeta：定义该变量以承载业务值。 */
  mapMeta: MapMeta | null;
  player: {
/** id：定义该变量以承载业务值。 */
    id: string;
/** x：定义该变量以承载业务值。 */
    x: number;
/** y：定义该变量以承载业务值。 */
    y: number;
/** mapId：定义该变量以承载业务值。 */
    mapId: string;
    viewRange?: number;
    senseQiActive?: boolean;
  } | null;
/** time：定义该变量以承载业务值。 */
  time: GameTimeState | null;
/** tileCache：定义该变量以承载业务值。 */
  tileCache: ReadonlyMap<string, Tile>;
/** visibleTiles：定义该变量以承载业务值。 */
  visibleTiles: ReadonlySet<string>;
/** entities：定义该变量以承载业务值。 */
  entities: readonly ObservedMapEntity[];
/** groundPiles：定义该变量以承载业务值。 */
  groundPiles: ReadonlyMap<string, GroundItemPileView>;
/** overlays：定义该变量以承载业务值。 */
  overlays: MapOverlayState;
/** minimap：定义该变量以承载业务值。 */
  minimap: MinimapSourceSnapshot;
/** tickTiming：定义该变量以承载业务值。 */
  tickTiming: MapTickTiming;
/** visibleTileRevision：定义该变量以承载业务值。 */
  visibleTileRevision: number;
/** entityTransition：定义该变量以承载业务值。 */
  entityTransition: MapEntityTransition | null;
}

/** MapInteractionTarget：定义该接口的能力与字段约束。 */
export interface MapInteractionTarget {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  entityId?: string;
  entityKind?: string;
/** walkable：定义该变量以承载业务值。 */
  walkable: boolean;
/** visible：定义该变量以承载业务值。 */
  visible: boolean;
/** known：定义该变量以承载业务值。 */
  known: boolean;
  clientX?: number;
  clientY?: number;
}

/** MapRuntimeInteractionCallbacks：定义该接口的能力与字段约束。 */
export interface MapRuntimeInteractionCallbacks {
  onTarget?: (target: MapInteractionTarget) => void;
  onHover?: (target: MapInteractionTarget | null) => void;
}

/** MapSceneSnapshot：定义该接口的能力与字段约束。 */
export interface MapSceneSnapshot {
/** mapMeta：定义该变量以承载业务值。 */
  mapMeta: MapMeta | null;
/** player：定义该变量以承载业务值。 */
  player: MapStoreSnapshot['player'];
  terrain: {
/** tileCache：定义该变量以承载业务值。 */
    tileCache: ReadonlyMap<string, Tile>;
/** visibleTiles：定义该变量以承载业务值。 */
    visibleTiles: ReadonlySet<string>;
/** visibleTileRevision：定义该变量以承载业务值。 */
    visibleTileRevision: number;
/** time：定义该变量以承载业务值。 */
    time: GameTimeState | null;
  };
/** entities：定义该变量以承载业务值。 */
  entities: readonly ObservedMapEntity[];
/** groundPiles：定义该变量以承载业务值。 */
  groundPiles: ReadonlyMap<string, GroundItemPileView>;
/** overlays：定义该变量以承载业务值。 */
  overlays: MapOverlayState;
}

/** MapRuntimeApi：定义该接口的能力与字段约束。 */
export interface MapRuntimeApi {
  attach(host: HTMLElement): void;
  detach(): void;
  destroy(): void;
  setRenderFrameObserver(observer: ((frameAtMs: number) => void) | null): void;
  setTargetFps(targetFps: number): void;
  setViewportSize(width: number, height: number, dpr: number, viewportScale?: number): void;
  setSafeArea(insets: MapSafeAreaInsets): void;
  setZoom(level: number): void;
  setProjection(mode: 'topdown'): void;
  applyInit(data: S2C_Init): void;
  applyMapStaticSync(data: S2C_MapStaticSync): void;
  applyTick(data: S2C_Tick): void;
  reset(): void;
  setInteractionCallbacks(callbacks: MapRuntimeInteractionCallbacks): void;
  setMoveHandler(handler: ((target: { mapId: string; x: number; y: number; isCurrentMap: boolean }) => void) | null): void;
  setPathCells(cells: GridPoint[]): void;
  setTargetingOverlay(state: MapTargetingOverlayState | null): void;
  setSenseQiOverlay(state: MapSenseQiOverlayState | null): void;
  replaceVisibleEntities(
    entities: ObservedMapEntity[],
    transition?: MapEntityTransition | null,
  ): void;
  getMapMeta(): MapMeta | null;
  getKnownTileAt(x: number, y: number): Tile | null;
  getVisibleTileAt(x: number, y: number): Tile | null;
  getGroundPileAt(x: number, y: number): GroundItemPileView | null;
}
