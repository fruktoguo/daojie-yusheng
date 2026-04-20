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
/**
 * top：MapSafeAreaInsets 内部字段。
 */

  top: number;  
  /**
 * right：MapSafeAreaInsets 内部字段。
 */

  right: number;  
  /**
 * bottom：MapSafeAreaInsets 内部字段。
 */

  bottom: number;  
  /**
 * left：MapSafeAreaInsets 内部字段。
 */

  left: number;
}

/** 前端可观察实体快照。 */
export interface ObservedMapEntity {
/**
 * id：ObservedMapEntity 内部字段。
 */

  id: string;  
  /**
 * wx：ObservedMapEntity 内部字段。
 */

  wx: number;  
  /**
 * wy：ObservedMapEntity 内部字段。
 */

  wy: number;  
  /**
 * char：ObservedMapEntity 内部字段。
 */

  char: string;  
  /**
 * color：ObservedMapEntity 内部字段。
 */

  color: string;  
  /**
 * name：ObservedMapEntity 内部字段。
 */

  name?: string;  
  /**
 * kind：ObservedMapEntity 内部字段。
 */

  kind?: string;  
  /**
 * monsterTier：ObservedMapEntity 内部字段。
 */

  monsterTier?: MonsterTier;  
  /**
 * monsterScale：ObservedMapEntity 内部字段。
 */

  monsterScale?: number;  
  /**
 * hp：ObservedMapEntity 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：ObservedMapEntity 内部字段。
 */

  maxHp?: number;  
  /**
 * qi：ObservedMapEntity 内部字段。
 */

  qi?: number;  
  /**
 * maxQi：ObservedMapEntity 内部字段。
 */

  maxQi?: number;  
  /**
 * npcQuestMarker：ObservedMapEntity 内部字段。
 */

  npcQuestMarker?: TickRenderEntity['npcQuestMarker'];  
  /**
 * observation：ObservedMapEntity 内部字段。
 */

  observation?: TickRenderEntity['observation'];  
  /**
 * buffs：ObservedMapEntity 内部字段。
 */

  buffs?: VisibleBuffState[];
}

/** 技能瞄准叠加层状态。 */
export interface MapTargetingOverlayState {
/**
 * originX：MapTargetingOverlayState 内部字段。
 */

  originX: number;  
  /**
 * originY：MapTargetingOverlayState 内部字段。
 */

  originY: number;  
  /**
 * range：MapTargetingOverlayState 内部字段。
 */

  range: number;  
  /**
 * visibleOnly：MapTargetingOverlayState 内部字段。
 */

  visibleOnly?: boolean;  
  /**
 * shape：MapTargetingOverlayState 内部字段。
 */

  shape?: TargetingShape;  
  /**
 * radius：MapTargetingOverlayState 内部字段。
 */

  radius?: number;  
  /**
 * affectedCells：MapTargetingOverlayState 内部字段。
 */

  affectedCells?: GridPoint[];  
  /**
 * hoverX：MapTargetingOverlayState 内部字段。
 */

  hoverX?: number;  
  /**
 * hoverY：MapTargetingOverlayState 内部字段。
 */

  hoverY?: number;
}

/** 感气视野叠加层状态。 */
export interface MapSenseQiOverlayState {
/**
 * hoverX：MapSenseQiOverlayState 内部字段。
 */

  hoverX?: number;  
  /**
 * hoverY：MapSenseQiOverlayState 内部字段。
 */

  hoverY?: number;  
  /**
 * levelBaseValue：MapSenseQiOverlayState 内部字段。
 */

  levelBaseValue?: number;
}

/** 地图统一叠加层状态。 */
export interface MapOverlayState {
/**
 * pathCells：MapOverlayState 内部字段。
 */

  pathCells: GridPoint[];  
  /**
 * targeting：MapOverlayState 内部字段。
 */

  targeting: MapTargetingOverlayState | null;  
  /**
 * senseQi：MapOverlayState 内部字段。
 */

  senseQi: MapSenseQiOverlayState | null;  
  /**
 * threatArrows：MapOverlayState 内部字段。
 */

  threatArrows: Array<{  
  /**
 * ownerId：MapOverlayState 内部字段。
 */
 ownerId: string;  
 /**
 * targetId：MapOverlayState 内部字段。
 */
 targetId: string }>;
}

/** 小地图来源快照。 */
export interface MinimapSourceSnapshot {
/**
 * mapMeta：MinimapSourceSnapshot 内部字段。
 */

  mapMeta: MapMeta | null;  
  /**
 * snapshot：MinimapSourceSnapshot 内部字段。
 */

  snapshot: MapMinimapSnapshot | null;  
  /**
 * rememberedMarkers：MinimapSourceSnapshot 内部字段。
 */

  rememberedMarkers: MapMinimapMarker[];  
  /**
 * visibleMarkers：MinimapSourceSnapshot 内部字段。
 */

  visibleMarkers: MapMinimapMarker[];  
  /**
 * tileCache：MinimapSourceSnapshot 内部字段。
 */

  tileCache: ReadonlyMap<string, Tile>;  
  /**
 * visibleTiles：MinimapSourceSnapshot 内部字段。
 */

  visibleTiles: ReadonlySet<string>;  
  /**
 * visibleEntities：MinimapSourceSnapshot 内部字段。
 */

  visibleEntities: readonly ObservedMapEntity[];  
  /**
 * groundPiles：MinimapSourceSnapshot 内部字段。
 */

  groundPiles: ReadonlyMap<string, GroundItemPileView>;  
  /**
 * player：MinimapSourceSnapshot 内部字段。
 */

  player: {  
  /**
 * x：MinimapSourceSnapshot 内部字段。
 */
 x: number;  
 /**
 * y：MinimapSourceSnapshot 内部字段。
 */
 y: number } | null;  
 /**
 * viewRadius：MinimapSourceSnapshot 内部字段。
 */

  viewRadius: number;  
  /**
 * memoryVersion：MinimapSourceSnapshot 内部字段。
 */

  memoryVersion: number;
}

/** 实体运动过渡信息。 */
export interface MapEntityTransition {
/**
 * movedId：MapEntityTransition 内部字段。
 */

  movedId?: string;  
  /**
 * shiftX：MapEntityTransition 内部字段。
 */

  shiftX?: number;  
  /**
 * shiftY：MapEntityTransition 内部字段。
 */

  shiftY?: number;  
  /**
 * snapCamera：MapEntityTransition 内部字段。
 */

  snapCamera?: boolean;  
  /**
 * settleMotion：MapEntityTransition 内部字段。
 */

  settleMotion?: boolean;
}

/** tick 流逝与插值时长。 */
export interface MapTickTiming {
/**
 * startedAt：MapTickTiming 内部字段。
 */

  startedAt: number;  
  /**
 * durationMs：MapTickTiming 内部字段。
 */

  durationMs: number;
}

/** MapStore 对外输出的只读快照。 */
export interface MapStoreSnapshot {
/**
 * mapMeta：MapStoreSnapshot 内部字段。
 */

  mapMeta: MapMeta | null;  
  /**
 * player：MapStoreSnapshot 内部字段。
 */

  player: {  
  /**
 * id：MapStoreSnapshot 内部字段。
 */

    id: string;    
    /**
 * x：MapStoreSnapshot 内部字段。
 */

    x: number;    
    /**
 * y：MapStoreSnapshot 内部字段。
 */

    y: number;    
    /**
 * mapId：MapStoreSnapshot 内部字段。
 */

    mapId: string;    
    /**
 * viewRange：MapStoreSnapshot 内部字段。
 */

    viewRange?: number;    
    /**
 * senseQiActive：MapStoreSnapshot 内部字段。
 */

    senseQiActive?: boolean;
  } | null;  
  /**
 * time：MapStoreSnapshot 内部字段。
 */

  time: GameTimeState | null;  
  /**
 * tileCache：MapStoreSnapshot 内部字段。
 */

  tileCache: ReadonlyMap<string, Tile>;  
  /**
 * visibleTiles：MapStoreSnapshot 内部字段。
 */

  visibleTiles: ReadonlySet<string>;  
  /**
 * entities：MapStoreSnapshot 内部字段。
 */

  entities: readonly ObservedMapEntity[];  
  /**
 * groundPiles：MapStoreSnapshot 内部字段。
 */

  groundPiles: ReadonlyMap<string, GroundItemPileView>;  
  /**
 * overlays：MapStoreSnapshot 内部字段。
 */

  overlays: MapOverlayState;  
  /**
 * minimap：MapStoreSnapshot 内部字段。
 */

  minimap: MinimapSourceSnapshot;  
  /**
 * tickTiming：MapStoreSnapshot 内部字段。
 */

  tickTiming: MapTickTiming;  
  /**
 * visibleTileRevision：MapStoreSnapshot 内部字段。
 */

  visibleTileRevision: number;  
  /**
 * entityTransition：MapStoreSnapshot 内部字段。
 */

  entityTransition: MapEntityTransition | null;
}

/** 鼠标命中的交互对象。 */
export interface MapInteractionTarget {
/**
 * x：MapInteractionTarget 内部字段。
 */

  x: number;  
  /**
 * y：MapInteractionTarget 内部字段。
 */

  y: number;  
  /**
 * entityId：MapInteractionTarget 内部字段。
 */

  entityId?: string;  
  /**
 * entityKind：MapInteractionTarget 内部字段。
 */

  entityKind?: string;  
  /**
 * walkable：MapInteractionTarget 内部字段。
 */

  walkable: boolean;  
  /**
 * visible：MapInteractionTarget 内部字段。
 */

  visible: boolean;  
  /**
 * known：MapInteractionTarget 内部字段。
 */

  known: boolean;  
  /**
 * clientX：MapInteractionTarget 内部字段。
 */

  clientX?: number;  
  /**
 * clientY：MapInteractionTarget 内部字段。
 */

  clientY?: number;
}

/** 地图交互回调。 */
export interface MapRuntimeInteractionCallbacks {
/**
 * onTarget：MapRuntimeInteractionCallbacks 内部字段。
 */

  onTarget?: (target: MapInteractionTarget) => void;  
  /**
 * onHover：MapRuntimeInteractionCallbacks 内部字段。
 */

  onHover?: (target: MapInteractionTarget | null) => void;
}

/** 传给渲染层的场景快照。 */
export interface MapSceneSnapshot {
/**
 * mapMeta：MapSceneSnapshot 内部字段。
 */

  mapMeta: MapMeta | null;  
  /**
 * player：MapSceneSnapshot 内部字段。
 */

  player: MapStoreSnapshot['player'];  
  /**
 * terrain：MapSceneSnapshot 内部字段。
 */

  terrain: {  
  /**
 * tileCache：MapSceneSnapshot 内部字段。
 */

    tileCache: ReadonlyMap<string, Tile>;    
    /**
 * visibleTiles：MapSceneSnapshot 内部字段。
 */

    visibleTiles: ReadonlySet<string>;    
    /**
 * visibleTileRevision：MapSceneSnapshot 内部字段。
 */

    visibleTileRevision: number;    
    /**
 * time：MapSceneSnapshot 内部字段。
 */

    time: GameTimeState | null;
  };  
  /**
 * entities：MapSceneSnapshot 内部字段。
 */

  entities: readonly ObservedMapEntity[];  
  /**
 * groundPiles：MapSceneSnapshot 内部字段。
 */

  groundPiles: ReadonlyMap<string, GroundItemPileView>;  
  /**
 * overlays：MapSceneSnapshot 内部字段。
 */

  overlays: MapOverlayState;
}

/** 世界级增量入参。 */
export interface MapNextWorldDeltaInput {
/**
 * playerPatches：MapNextWorldDeltaInput 内部字段。
 */

  playerPatches: TickRenderEntity[];  
  /**
 * entityPatches：MapNextWorldDeltaInput 内部字段。
 */

  entityPatches: TickRenderEntity[];  
  /**
 * removedEntityIds：MapNextWorldDeltaInput 内部字段。
 */

  removedEntityIds?: string[];  
  /**
 * groundPatches：MapNextWorldDeltaInput 内部字段。
 */

  groundPatches?: GroundItemPilePatch[];  
  /**
 * effects：MapNextWorldDeltaInput 内部字段。
 */

  effects?: CombatEffect[];  
  /**
 * threatArrows：MapNextWorldDeltaInput 内部字段。
 */

  threatArrows?: Array<{  
  /**
 * ownerId：MapNextWorldDeltaInput 内部字段。
 */
 ownerId: string;  
 /**
 * targetId：MapNextWorldDeltaInput 内部字段。
 */
 targetId: string }>;  
 /**
 * threatArrowAdds：MapNextWorldDeltaInput 内部字段。
 */

  threatArrowAdds?: Array<[string, string]>;  
  /**
 * threatArrowRemoves：MapNextWorldDeltaInput 内部字段。
 */

  threatArrowRemoves?: Array<[string, string]>;  
  /**
 * pathCells：MapNextWorldDeltaInput 内部字段。
 */

  pathCells?: GridPoint[];  
  /**
 * tickDurationMs：MapNextWorldDeltaInput 内部字段。
 */

  tickDurationMs?: number;  
  /**
 * time：MapNextWorldDeltaInput 内部字段。
 */

  time?: GameTimeState | null;  
  /**
 * visibleTiles：MapNextWorldDeltaInput 内部字段。
 */

  visibleTiles?: VisibleTile[][];  
  /**
 * visibleTilePatches：MapNextWorldDeltaInput 内部字段。
 */

  visibleTilePatches?: VisibleTilePatch[];  
  /**
 * mapId：MapNextWorldDeltaInput 内部字段。
 */

  mapId?: string;
}

/** 本体增量入参。 */
export interface MapNextSelfDeltaInput {
/**
 * mapId：MapNextSelfDeltaInput 内部字段。
 */

  mapId?: string;  
  /**
 * x：MapNextSelfDeltaInput 内部字段。
 */

  x?: number;  
  /**
 * y：MapNextSelfDeltaInput 内部字段。
 */

  y?: number;  
  /**
 * facing：MapNextSelfDeltaInput 内部字段。
 */

  facing?: Direction;  
  /**
 * hp：MapNextSelfDeltaInput 内部字段。
 */

  hp?: number;  
  /**
 * qi：MapNextSelfDeltaInput 内部字段。
 */

  qi?: number;  
  /**
 * playerPatch：MapNextSelfDeltaInput 内部字段。
 */

  playerPatch?: TickRenderEntity | null;
}

/** 入场初始化入参。 */
export interface MapBootstrapInput {
/**
 * self：MapBootstrapInput 内部字段。
 */

  self: PlayerState;  
  /**
 * mapMeta：MapBootstrapInput 内部字段。
 */

  mapMeta: MapMeta;  
  /**
 * minimap：MapBootstrapInput 内部字段。
 */

  minimap?: MapMinimapSnapshot | null;  
  /**
 * visibleMinimapMarkers：MapBootstrapInput 内部字段。
 */

  visibleMinimapMarkers?: MapMinimapMarker[];  
  /**
 * minimapLibrary：MapBootstrapInput 内部字段。
 */

  minimapLibrary: MapMinimapArchiveEntry[];  
  /**
 * tiles：MapBootstrapInput 内部字段。
 */

  tiles: VisibleTile[][];  
  /**
 * players：MapBootstrapInput 内部字段。
 */

  players: RenderEntity[];  
  /**
 * time：MapBootstrapInput 内部字段。
 */

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


