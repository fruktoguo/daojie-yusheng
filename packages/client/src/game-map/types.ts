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

export interface MapSafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ObservedMapEntity {
  id: string;
  wx: number;
  wy: number;
  char: string;
  color: string;
  name?: string;
  kind?: string;
  monsterTier?: MonsterTier;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: TickRenderEntity['npcQuestMarker'];
  observation?: TickRenderEntity['observation'];
  buffs?: VisibleBuffState[];
}

export interface MapTargetingOverlayState {
  originX: number;
  originY: number;
  range: number;
  shape?: TargetingShape;
  radius?: number;
  affectedCells?: GridPoint[];
  hoverX?: number;
  hoverY?: number;
}

export interface MapSenseQiOverlayState {
  hoverX?: number;
  hoverY?: number;
  levelBaseValue?: number;
}

export interface MapOverlayState {
  pathCells: GridPoint[];
  targeting: MapTargetingOverlayState | null;
  senseQi: MapSenseQiOverlayState | null;
  threatArrows: Array<{ ownerId: string; targetId: string }>;
}

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

export interface MapEntityTransition {
  movedId?: string;
  shiftX?: number;
  shiftY?: number;
  snapCamera?: boolean;
  settleMotion?: boolean;
}

export interface MapTickTiming {
  startedAt: number;
  durationMs: number;
}

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
  entityTransition: MapEntityTransition | null;
}

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

export interface MapRuntimeInteractionCallbacks {
  onTarget?: (target: MapInteractionTarget) => void;
  onHover?: (target: MapInteractionTarget | null) => void;
}

export interface MapSceneSnapshot {
  mapMeta: MapMeta | null;
  player: MapStoreSnapshot['player'];
  terrain: {
    tileCache: ReadonlyMap<string, Tile>;
    visibleTiles: ReadonlySet<string>;
    time: GameTimeState | null;
  };
  entities: readonly ObservedMapEntity[];
  groundPiles: ReadonlyMap<string, GroundItemPileView>;
  overlays: MapOverlayState;
}

export interface MapRuntimeApi {
  attach(host: HTMLElement): void;
  detach(): void;
  destroy(): void;
  setViewportSize(width: number, height: number, dpr: number, viewportScale?: number): void;
  setSafeArea(insets: MapSafeAreaInsets): void;
  setZoom(level: number): void;
  setProjection(mode: 'topdown'): void;
  applyInit(data: S2C_Init): void;
  applyMapStaticSync(data: S2C_MapStaticSync): void;
  applyTick(data: S2C_Tick): void;
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
