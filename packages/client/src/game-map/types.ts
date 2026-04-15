import type {
  Direction,
  GameTimeState,
  CombatEffect,
  GroundItemPilePatch,
  GroundItemPileView,
  GridPoint,
  MapMeta,
  MapMinimapArchiveEntry,
  MapMinimapMarker,
  MapMinimapSnapshot,
  MonsterTier,
  PlayerState,
  RenderEntity,
  Tile,
  TargetingShape,
  VisibleBuffState,
  VisibleTile,
  VisibleTilePatch,
  NEXT_S2C_MapStatic,
  TickRenderEntity,
} from '@mud/shared-next';

/** 地图安全区边距。 */
export interface MapSafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** 前端可观察实体快照。 */
export interface ObservedMapEntity {
  id: string;
  wx: number;
  wy: number;
  char: string;
  color: string;
  name?: string;
  kind?: string;
  monsterTier?: MonsterTier;
  monsterScale?: number;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: TickRenderEntity['npcQuestMarker'];
  observation?: TickRenderEntity['observation'];
  buffs?: VisibleBuffState[];
}

/** 技能瞄准叠加层状态。 */
export interface MapTargetingOverlayState {
  originX: number;
  originY: number;
  range: number;
  visibleOnly?: boolean;
  shape?: TargetingShape;
  radius?: number;
  affectedCells?: GridPoint[];
  hoverX?: number;
  hoverY?: number;
}

/** 感气视野叠加层状态。 */
export interface MapSenseQiOverlayState {
  hoverX?: number;
  hoverY?: number;
  levelBaseValue?: number;
}

/** 地图统一叠加层状态。 */
export interface MapOverlayState {
  pathCells: GridPoint[];
  targeting: MapTargetingOverlayState | null;
  senseQi: MapSenseQiOverlayState | null;
  threatArrows: Array<{ ownerId: string; targetId: string }>;
}

/** 小地图来源快照。 */
export interface MinimapSourceSnapshot {
  mapMeta: MapMeta | null;
  snapshot: MapMinimapSnapshot | null;
  rememberedMarkers: MapMinimapMarker[];
  visibleMarkers: MapMinimapMarker[];
  tileCache: ReadonlyMap<string, Tile>;
  visibleTiles: ReadonlySet<string>;
  visibleEntities: readonly ObservedMapEntity[];
  groundPiles: ReadonlyMap<string, GroundItemPileView>;
  player: { x: number; y: number } | null;
  viewRadius: number;
  memoryVersion: number;
}

/** 实体运动过渡信息。 */
export interface MapEntityTransition {
  movedId?: string;
  shiftX?: number;
  shiftY?: number;
  snapCamera?: boolean;
  settleMotion?: boolean;
}

/** tick 流逝与插值时长。 */
export interface MapTickTiming {
  startedAt: number;
  durationMs: number;
}

/** MapStore 对外输出的只读快照。 */
export interface MapStoreSnapshot {
  mapMeta: MapMeta | null;
  player: {
    id: string;
    x: number;
    y: number;
    mapId: string;
    viewRange?: number;
    senseQiActive?: boolean;
  } | null;
  time: GameTimeState | null;
  tileCache: ReadonlyMap<string, Tile>;
  visibleTiles: ReadonlySet<string>;
  entities: readonly ObservedMapEntity[];
  groundPiles: ReadonlyMap<string, GroundItemPileView>;
  overlays: MapOverlayState;
  minimap: MinimapSourceSnapshot;
  tickTiming: MapTickTiming;
  visibleTileRevision: number;
  entityTransition: MapEntityTransition | null;
}

/** 鼠标命中的交互对象。 */
export interface MapInteractionTarget {
  x: number;
  y: number;
  entityId?: string;
  entityKind?: string;
  walkable: boolean;
  visible: boolean;
  known: boolean;
  clientX?: number;
  clientY?: number;
}

/** 地图交互回调。 */
export interface MapRuntimeInteractionCallbacks {
  onTarget?: (target: MapInteractionTarget) => void;
  onHover?: (target: MapInteractionTarget | null) => void;
}

/** 传给渲染层的场景快照。 */
export interface MapSceneSnapshot {
  mapMeta: MapMeta | null;
  player: MapStoreSnapshot['player'];
  terrain: {
    tileCache: ReadonlyMap<string, Tile>;
    visibleTiles: ReadonlySet<string>;
    visibleTileRevision: number;
    time: GameTimeState | null;
  };
  entities: readonly ObservedMapEntity[];
  groundPiles: ReadonlyMap<string, GroundItemPileView>;
  overlays: MapOverlayState;
}

/** 世界级增量入参。 */
export interface MapNextWorldDeltaInput {
  playerPatches: TickRenderEntity[];
  entityPatches: TickRenderEntity[];
  removedEntityIds?: string[];
  groundPatches?: GroundItemPilePatch[];
  effects?: CombatEffect[];
  threatArrows?: Array<{ ownerId: string; targetId: string }>;
  threatArrowAdds?: Array<[string, string]>;
  threatArrowRemoves?: Array<[string, string]>;
  pathCells?: GridPoint[];
  tickDurationMs?: number;
  time?: GameTimeState | null;
  visibleTiles?: VisibleTile[][];
  visibleTilePatches?: VisibleTilePatch[];
  mapId?: string;
}

/** 本体增量入参。 */
export interface MapNextSelfDeltaInput {
  mapId?: string;
  x?: number;
  y?: number;
  facing?: Direction;
  hp?: number;
  qi?: number;
  playerPatch?: TickRenderEntity | null;
}

/** 入场初始化入参。 */
export interface MapBootstrapInput {
  self: PlayerState;
  mapMeta: MapMeta;
  minimap?: MapMinimapSnapshot | null;
  visibleMinimapMarkers?: MapMinimapMarker[];
  minimapLibrary: MapMinimapArchiveEntry[];
  tiles: VisibleTile[][];
  players: RenderEntity[];
  time?: GameTimeState | null;
}

/** MapRuntime 对外接口。 */
export interface MapRuntimeApi {
  attach(host: HTMLElement): void;
  detach(): void;
  destroy(): void;
  setViewportSize(width: number, height: number, dpr: number, viewportScale?: number): void;
  setSafeArea(insets: MapSafeAreaInsets): void;
  setZoom(level: number): void;
  setProjection(mode: 'topdown'): void;
  setTickDurationMs(durationMs: number): void;
  applyBootstrap(data: MapBootstrapInput): void;
  applyMapStatic(data: NEXT_S2C_MapStatic): void;
  applyNextWorldDelta(data: MapNextWorldDeltaInput): void;
  applyNextSelfDelta(data: MapNextSelfDeltaInput): void;
  reset(): void;
  setInteractionCallbacks(callbacks: MapRuntimeInteractionCallbacks): void;
  setMoveHandler(handler: ((x: number, y: number) => void) | null): void;
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


