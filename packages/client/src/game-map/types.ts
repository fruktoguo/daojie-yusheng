import type {
  Direction,
  GameTimeState,
  CombatEffect,
  FormationRangeShape,
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
  S2C_MapStatic,
  TickRenderEntity,
} from '@mud/shared';

/** 地图安全区边距。 */
export interface MapSafeAreaInsets {
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
}

/** 前端可观察实体快照。 */
export interface ObservedMapEntity {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * wx：wx相关字段。
 */

  wx: number;  
  /**
 * wy：wy相关字段。
 */

  wy: number;  
  /**
 * char：char相关字段。
 */

  char: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * badge：badge相关字段。
 */

  badge?: RenderEntity['badge'];  
  /**
 * hostile：hostile相关字段。
 */

  hostile?: boolean;  
  /**
 * name：名称名称或显示文本。
 */

  name?: string;  
  /**
 * kind：kind相关字段。
 */

  kind?: string;  
  /**
 * monsterTier：怪物Tier相关字段。
 */

  monsterTier?: MonsterTier;  
  /**
 * monsterScale：怪物Scale相关字段。
 */

  monsterScale?: number;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * respawnRemainingTicks：回生/重生剩余 tick。
 */

  respawnRemainingTicks?: number;
  /**
 * respawnTotalTicks：回生/重生总 tick。
 */

  respawnTotalTicks?: number;
  /**
 * qi：qi相关字段。
 */

  qi?: number;  
  /**
 * maxQi：maxQi相关字段。
 */

  maxQi?: number;  
  /**
 * npcQuestMarker：NPC任务Marker相关字段。
 */

  npcQuestMarker?: TickRenderEntity['npcQuestMarker'];  
  /**
 * observation：observation相关字段。
 */

  observation?: TickRenderEntity['observation'];  
  /**
 * buffs：buff相关字段。
 */

  buffs?: VisibleBuffState[];
  /** 阵法影响半径。 */
  formationRadius?: number;
  /** 阵法范围形状。 */
  formationRangeShape?: FormationRangeShape;
  /** 感气时使用的阵法范围高亮颜色。 */
  formationRangeHighlightColor?: string;
  /** 阵法边界专用字符。 */
  formationBoundaryChar?: string;
  /** 阵法边界专用颜色。 */
  formationBoundaryColor?: string;
  /** 阵法边界专用范围高亮色。 */
  formationBoundaryRangeHighlightColor?: string;
  /** 阵眼是否无需感气即可直接看见。 */
  formationEyeVisibleWithoutSenseQi?: boolean;
  /** 阵法范围是否无需感气即可直接看见。 */
  formationRangeVisibleWithoutSenseQi?: boolean;
  /** 阵法边界是否无需感气即可直接看见。 */
  formationBoundaryVisibleWithoutSenseQi?: boolean;
  /** 阵法实体是否显示名称文本。 */
  formationShowText?: boolean;
  /** 阵法边界是否阻挡通行。 */
  formationBlocksBoundary?: boolean;
  /** 阵法所属宗门 ID。 */
  formationOwnerSectId?: string | null;
  /** 阵法所属玩家 ID。 */
  formationOwnerPlayerId?: string | null;
  /** 阵法是否处于开启状态。 */
  formationActive?: boolean;
}

/** 技能瞄准叠加层状态。 */
export interface MapTargetingOverlayState {
/**
 * originX：originX相关字段。
 */

  originX: number;  
  /**
 * originY：originY相关字段。
 */

  originY: number;  
  /**
 * range：范围相关字段。
 */

  range: number;  
  /**
 * visibleOnly：可见Only相关字段。
 */

  visibleOnly?: boolean;  
  /**
 * shape：shape相关字段。
 */

  shape?: TargetingShape;  
  /**
 * radius：radiu相关字段。
 */

  radius?: number;  
  /**
 * affectedCells：affectedCell相关字段。
 */

  affectedCells?: GridPoint[];  
  /**
 * hoverX：hoverX相关字段。
 */

  hoverX?: number;  
  /**
 * hoverY：hoverY相关字段。
 */

  hoverY?: number;
}

/** 阵法布置范围叠加层状态。 */
export interface MapFormationRangeOverlayState {
/**
 * affectedCells：affectedCell相关字段。
 */

  affectedCells: GridPoint[];
  /** rangeHighlightColor：范围高亮颜色。 */
  rangeHighlightColor?: string;
}

/** 感气视野叠加层状态。 */
export interface MapSenseQiOverlayState {
/**
 * hoverX：hoverX相关字段。
 */

  hoverX?: number;  
  /**
 * hoverY：hoverY相关字段。
 */

  hoverY?: number;  
  /**
 * levelBaseValue：等级Base值数值。
 */

  levelBaseValue?: number;
}

/** 地图统一叠加层状态。 */
export interface MapOverlayState {
/**
 * pathCells：路径Cell相关字段。
 */

  pathCells: GridPoint[];  
  /**
 * targeting：targeting相关字段。
 */

  targeting: MapTargetingOverlayState | null;  
  /**
 * formationRange：阵法范围相关字段。
 */

  formationRange: MapFormationRangeOverlayState | null;
  /**
 * senseQi：senseQi相关字段。
 */

  senseQi: MapSenseQiOverlayState | null;  
  /**
 * threatArrows：集合字段。
 */

  threatArrows: Array<{  
  /**
 * ownerId：ownerID标识。
 */
 ownerId: string;  
 /**
 * targetId：目标ID标识。
 */
 targetId: string }>;
}

/** 小地图来源快照。 */
export interface MinimapSourceSnapshot {
/**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta: MapMeta | null;  
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot: MapMinimapSnapshot | null;  
  /**
 * rememberedMarkers：rememberedMarker相关字段。
 */

  rememberedMarkers: MapMinimapMarker[];  
  /**
 * visibleMarkers：可见Marker相关字段。
 */

  visibleMarkers: MapMinimapMarker[];  
  /**
 * tileCache：缓存或索引容器。
 */

  tileCache: ReadonlyMap<string, Tile>;  
  /**
 * visibleTiles：可见Tile相关字段。
 */

  visibleTiles: ReadonlySet<string>;  
  /**
 * visibleEntities：可见Entity相关字段。
 */

  visibleEntities: readonly ObservedMapEntity[];  
  /**
 * groundPiles：groundPile相关字段。
 */

  groundPiles: ReadonlyMap<string, GroundItemPileView>;  
  /**
 * player：玩家引用。
 */

  player: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null;  
 /**
 * viewRadius：视图Radiu相关字段。
 */

  viewRadius: number;  
  /**
 * memoryVersion：memoryVersion相关字段。
 */

  memoryVersion: number;
}

/** 实体运动过渡信息。 */
export interface MapEntityTransition {
/**
 * movedId：movedID标识。
 */

  movedId?: string;  
  /**
 * shiftX：shiftX相关字段。
 */

  shiftX?: number;  
  /**
 * shiftY：shiftY相关字段。
 */

  shiftY?: number;  
  /**
 * snapCamera：snapCamera相关字段。
 */

  snapCamera?: boolean;  
  /**
 * settleMotion：settleMotion相关字段。
 */

  settleMotion?: boolean;
}

/** tick 流逝与插值时长。 */
export interface MapTickTiming {
/**
 * startedAt：startedAt相关字段。
 */

  startedAt: number;  
  /**
 * durationMs：durationM相关字段。
 */

  durationMs: number;
}

/** MapStore 对外输出的只读快照。 */
export interface MapStoreSnapshot {
/**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta: MapMeta | null;  
  /**
 * player：玩家引用。
 */

  player: {  
  /**
 * id：ID标识。
 */

    id: string;    
    /**
 * x：x相关字段。
 */

    x: number;    
    /**
 * y：y相关字段。
 */

    y: number;    
    /**
 * char：地图上用于表示玩家的单字符。
 */

    char: string;
    /**
 * mapId：地图ID标识。
 */

    mapId: string;    
    /**
 * viewRange：视图范围相关字段。
 */

    viewRange?: number;    
    /**
 * senseQiActive：senseQi激活状态相关字段。
 */

    senseQiActive?: boolean;
  } | null;  
  /**
 * time：时间相关字段。
 */

  time: GameTimeState | null;  
  /**
 * tileCache：缓存或索引容器。
 */

  tileCache: ReadonlyMap<string, Tile>;  
  /**
 * visibleTiles：可见Tile相关字段。
 */

  visibleTiles: ReadonlySet<string>;  
  /**
 * entities：entity相关字段。
 */

  entities: readonly ObservedMapEntity[];  
  /**
 * groundPiles：groundPile相关字段。
 */

  groundPiles: ReadonlyMap<string, GroundItemPileView>;  
  /**
 * overlays：overlay相关字段。
 */

  overlays: MapOverlayState;  
  /**
 * minimap：缓存或索引容器。
 */

  minimap: MinimapSourceSnapshot;  
  /**
 * tickTiming：tickTiming相关字段。
 */

  tickTiming: MapTickTiming;  
  /**
 * visibleTileRevision：可见TileRevision相关字段。
 */

  visibleTileRevision: number;  
  /**
 * entityTransition：entityTransition相关字段。
 */

  entityTransition: MapEntityTransition | null;
}

/** 鼠标命中的交互对象。 */
export interface MapInteractionTarget {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * entityId：entityID标识。
 */

  entityId?: string;  
  /**
 * entityKind：entityKind相关字段。
 */

  entityKind?: string;  
  /**
 * walkable：walkable相关字段。
 */

  walkable: boolean;  
  /**
 * visible：可见相关字段。
 */

  visible: boolean;  
  /**
 * known：known相关字段。
 */

  known: boolean;  
  /**
 * clientX：clientX相关字段。
 */

  clientX?: number;  
  /**
 * clientY：clientY相关字段。
 */

  clientY?: number;
}

/** 地图交互回调。 */
export interface MapRuntimeInteractionCallbacks {
/**
 * onTarget：on目标相关字段。
 */

  onTarget?: (target: MapInteractionTarget) => void;  
  /**
 * onHover：onHover相关字段。
 */

  onHover?: (target: MapInteractionTarget | null) => void;
}

/** 传给渲染层的场景快照。 */
export interface MapSceneSnapshot {
/**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta: MapMeta | null;  
  /**
 * player：玩家引用。
 */

  player: MapStoreSnapshot['player'];  
  /**
 * terrain：terrain相关字段。
 */

  terrain: {  
  /**
 * tileCache：缓存或索引容器。
 */

    tileCache: ReadonlyMap<string, Tile>;    
    /**
 * visibleTiles：可见Tile相关字段。
 */

    visibleTiles: ReadonlySet<string>;    
    /**
 * visibleTileRevision：可见TileRevision相关字段。
 */

    visibleTileRevision: number;    
    /**
 * time：时间相关字段。
 */

    time: GameTimeState | null;
  };  
  /**
 * entities：entity相关字段。
 */

  entities: readonly ObservedMapEntity[];  
  /**
 * groundPiles：groundPile相关字段。
 */

  groundPiles: ReadonlyMap<string, GroundItemPileView>;  
  /**
 * overlays：overlay相关字段。
 */

  overlays: MapOverlayState;
}

/** 世界级增量入参。 */
export interface MapWorldDeltaInput {
/**
 * playerPatches：玩家Patche相关字段。
 */

  playerPatches: TickRenderEntity[];  
  /**
 * entityPatches：entityPatche相关字段。
 */

  entityPatches: TickRenderEntity[];  
  /**
 * removedEntityIds：removedEntityID相关字段。
 */

  removedEntityIds?: string[];  
  /**
 * groundPatches：groundPatche相关字段。
 */

  groundPatches?: GroundItemPilePatch[];  
  /**
 * effects：effect相关字段。
 */

  effects?: CombatEffect[];  
  /**
 * threatArrows：集合字段。
 */

  threatArrows?: Array<{  
  /**
 * ownerId：ownerID标识。
 */
 ownerId: string;  
 /**
 * targetId：目标ID标识。
 */
 targetId: string }>;  
 /**
 * threatArrowAdds：threatArrowAdd相关字段。
 */

  threatArrowAdds?: Array<[string, string]>;  
  /**
 * threatArrowRemoves：threatArrowRemove相关字段。
 */

  threatArrowRemoves?: Array<[string, string]>;  
  /**
 * pathCells：路径Cell相关字段。
 */

  pathCells?: GridPoint[];  
  /**
 * tickDurationMs：tickDurationM相关字段。
 */

  tickDurationMs?: number;  
  /**
 * time：时间相关字段。
 */

  time?: GameTimeState | null;  
  /**
 * visibleTiles：可见Tile相关字段。
 */

  visibleTiles?: VisibleTile[][];  
  /**
 * visibleTilePatches：可见TilePatche相关字段。
 */

  visibleTilePatches?: VisibleTilePatch[];  
  /**
 * visibleMinimapMarkerAdds：可见MinimapMarkerAdd相关字段。
 */

  visibleMinimapMarkerAdds?: MapMinimapMarker[];
  /**
 * visibleMinimapMarkerRemoves：可见MinimapMarkerRemove相关字段。
 */

  visibleMinimapMarkerRemoves?: string[];
  /**
 * mapId：地图ID标识。
 */

  mapId?: string;
}

/** 本体增量入参。 */
export interface MapSelfDeltaInput {
/**
 * mapId：地图ID标识。
 */

  mapId?: string;  
  /**
 * x：x相关字段。
 */

  x?: number;  
  /**
 * y：y相关字段。
 */

  y?: number;  
  /**
 * facing：facing相关字段。
 */

  facing?: Direction;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * qi：qi相关字段。
 */

  qi?: number;  
  /**
 * playerPatch：玩家Patch相关字段。
 */

  playerPatch?: TickRenderEntity | null;
}

/** 入场初始化入参。 */
export interface MapBootstrapInput {
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

  minimap?: MapMinimapSnapshot | null;  
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

  time?: GameTimeState | null;
}

/** MapRuntime 对外接口。 */
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
  setTickDurationMs(durationMs: number): void;
  applyBootstrap(data: MapBootstrapInput): void;
  applyMapStatic(data: S2C_MapStatic): void;
  applyWorldDelta(data: MapWorldDeltaInput): void;
  applySelfDelta(data: MapSelfDeltaInput): void;
  reset(): void;
  setInteractionCallbacks(callbacks: MapRuntimeInteractionCallbacks): void;
  setMoveHandler(handler: ((x: number, y: number) => void) | null): void;
  setPathCells(cells: GridPoint[]): void;
  setTargetingOverlay(state: MapTargetingOverlayState | null): void;
  setFormationRangeOverlay(state: MapFormationRangeOverlayState | null): void;
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
