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
  S2C_MapStaticSync,
  TickRenderEntity,
} from '@mud/shared-next';

/** MapSafeAreaInsets：定义该接口的能力与字段约束。 */
export interface MapSafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** ObservedMapEntity：定义该接口的能力与字段约束。 */
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

/** MapTargetingOverlayState：定义该接口的能力与字段约束。 */
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

/** MapSenseQiOverlayState：定义该接口的能力与字段约束。 */
export interface MapSenseQiOverlayState {
  hoverX?: number;
  hoverY?: number;
  levelBaseValue?: number;
}

/** MapOverlayState：定义该接口的能力与字段约束。 */
export interface MapOverlayState {
  pathCells: GridPoint[];
  targeting: MapTargetingOverlayState | null;
  senseQi: MapSenseQiOverlayState | null;
  threatArrows: Array<{ ownerId: string; targetId: string }>;
}

/** MinimapSourceSnapshot：定义该接口的能力与字段约束。 */
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
  startedAt: number;
  durationMs: number;
}

/** MapStoreSnapshot：定义该接口的能力与字段约束。 */
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

/** MapInteractionTarget：定义该接口的能力与字段约束。 */
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

/** MapRuntimeInteractionCallbacks：定义该接口的能力与字段约束。 */
export interface MapRuntimeInteractionCallbacks {
  onTarget?: (target: MapInteractionTarget) => void;
  onHover?: (target: MapInteractionTarget | null) => void;
}

/** MapSceneSnapshot：定义该接口的能力与字段约束。 */
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

/** MapNextWorldDeltaInput：定义该接口的能力与字段约束。 */
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

/** MapNextSelfDeltaInput：定义该接口的能力与字段约束。 */
export interface MapNextSelfDeltaInput {
  mapId?: string;
  x?: number;
  y?: number;
  facing?: Direction;
  hp?: number;
  qi?: number;
  playerPatch?: TickRenderEntity | null;
}

/** MapBootstrapInput：定义该接口的能力与字段约束。 */
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

/** MapRuntimeApi：定义该接口的能力与字段约束。 */
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
  applyMapStaticSync(data: S2C_MapStaticSync): void;
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

