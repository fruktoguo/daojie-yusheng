import type { PartialNumericStats } from './numeric';
import type { ObservationInsight } from './observation-types';
import type { QiProjectionModifier } from './qi';
import type { Attributes } from './attribute-types';
import type { GridPoint } from './targeting';
import type { NpcQuestMarker } from './world-view-types';

/** 地形类型。 */
export enum TileType {
/**
 * Floor：枚举成员常量定义。
 */

  Floor = 'floor',  
  /**
 * Road：枚举成员常量定义。
 */

  Road = 'road',  
  /**
 * Trail：枚举成员常量定义。
 */

  Trail = 'trail',  
  /**
 * Wall：枚举成员常量定义。
 */

  Wall = 'wall',  
  /**
 * Door：枚举成员常量定义。
 */

  Door = 'door',  
  /**
 * Window：枚举成员常量定义。
 */

  Window = 'window',  
  /**
 * BrokenWindow：枚举成员常量定义。
 */

  BrokenWindow = 'broken_window',  
  /**
 * HouseEave：枚举成员常量定义。
 */

  HouseEave = 'house_eave',  
  /**
 * HouseCorner：枚举成员常量定义。
 */

  HouseCorner = 'house_corner',  
  /**
 * ScreenWall：枚举成员常量定义。
 */

  ScreenWall = 'screen_wall',  
  /**
 * Veranda：枚举成员常量定义。
 */

  Veranda = 'veranda',  
  /**
 * Portal：枚举成员常量定义。
 */

  Portal = 'portal',  
  /**
 * Stairs：枚举成员常量定义。
 */

  Stairs = 'stairs',  
  /**
 * Grass：枚举成员常量定义。
 */

  Grass = 'grass',  
  /**
 * Hill：枚举成员常量定义。
 */

  Hill = 'hill',  
  /**
 * Cliff：枚举成员常量定义。
 */

  Cliff = 'cliff',  
  /**
 * Mud：枚举成员常量定义。
 */

  Mud = 'mud',  
  /**
 * Swamp：枚举成员常量定义。
 */

  Swamp = 'swamp',  
  /**
 * Water：枚举成员常量定义。
 */

  Water = 'water',  
  /**
 * Cloud：枚举成员常量定义。
 */

  Cloud = 'cloud',  
  /**
 * CloudFloor：枚举成员常量定义。
 */

  CloudFloor = 'cloud_floor',  
  /**
 * Void：枚举成员常量定义。
 */

  Void = 'void',  
  /**
 * Tree：枚举成员常量定义。
 */

  Tree = 'tree',  
  /**
 * Bamboo：枚举成员常量定义。
 */

  Bamboo = 'bamboo',  
  /**
 * Stone：枚举成员常量定义。
 */

  Stone = 'stone',  
  /**
 * SpiritOre：枚举成员常量定义。
 */

  SpiritOre = 'spirit_ore',  
  /**
 * BlackIronOre：枚举成员常量定义。
 */

  BlackIronOre = 'black_iron_ore',  
  /**
 * BrokenSwordHeap：枚举成员常量定义。
 */

  BrokenSwordHeap = 'broken_sword_heap',
}

/** 方向。 */
export enum Direction {
/**
 * North：枚举成员常量定义。
 */

  North = 0,  
  /**
 * South：枚举成员常量定义。
 */

  South = 1,  
  /**
 * East：枚举成员常量定义。
 */

  East = 2,  
  /**
 * West：枚举成员常量定义。
 */

  West = 3,
}

/** 格子上的隐藏入口提示，用于观察后展示。 */
export interface HiddenEntranceObservation {
/**
 * title：HiddenEntranceObservation 内部字段。
 */

  title: string;  
  /**
 * desc：HiddenEntranceObservation 内部字段。
 */

  desc?: string;
}

/** 格子完整数据。 */
export interface Tile {
/**
 * type：Tile 内部字段。
 */

  type: TileType;  
  /**
 * walkable：Tile 内部字段。
 */

  walkable: boolean;  
  /**
 * blocksSight：Tile 内部字段。
 */

  blocksSight: boolean;  
  /**
 * aura：Tile 内部字段。
 */

  aura: number;  
  /**
 * occupiedBy：Tile 内部字段。
 */

  occupiedBy: string | null;  
  /**
 * modifiedAt：Tile 内部字段。
 */

  modifiedAt: number | null;  
  /**
 * hp：Tile 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：Tile 内部字段。
 */

  maxHp?: number;  
  /**
 * hpVisible：Tile 内部字段。
 */

  hpVisible?: boolean;  
  /**
 * hiddenEntrance：Tile 内部字段。
 */

  hiddenEntrance?: HiddenEntranceObservation;
}

/** 玩家当前视野窗口中的格子。 */
export type VisibleTile = Tile | null;

/** 地图空间的视觉组织方式。 */
export type MapSpaceVisionMode = 'isolated' | 'parent_overlay';

/** 地图所属路网域。 */
export type MapRouteDomain = 'system' | 'sect' | 'personal' | 'dynamic';

/** 传送点路网域配置。 */
export type PortalRouteDomain = MapRouteDomain | 'inherit';

/** 地图元数据。 */
export interface MapMeta {
/**
 * id：MapMeta 内部字段。
 */

  id: string;  
  /**
 * name：MapMeta 内部字段。
 */

  name: string;  
  /**
 * width：MapMeta 内部字段。
 */

  width: number;  
  /**
 * height：MapMeta 内部字段。
 */

  height: number;  
  /**
 * playerOverlapPoints：MapMeta 内部字段。
 */

  playerOverlapPoints?: GridPoint[];  
  /**
 * routeDomain：MapMeta 内部字段。
 */

  routeDomain?: MapRouteDomain;  
  /**
 * parentMapId：MapMeta 内部字段。
 */

  parentMapId?: string;  
  /**
 * parentOriginX：MapMeta 内部字段。
 */

  parentOriginX?: number;  
  /**
 * parentOriginY：MapMeta 内部字段。
 */

  parentOriginY?: number;  
  /**
 * floorLevel：MapMeta 内部字段。
 */

  floorLevel?: number;  
  /**
 * floorName：MapMeta 内部字段。
 */

  floorName?: string;  
  /**
 * spaceVisionMode：MapMeta 内部字段。
 */

  spaceVisionMode?: MapSpaceVisionMode;  
  /**
 * dangerLevel：MapMeta 内部字段。
 */

  dangerLevel?: number;  
  /**
 * recommendedRealm：MapMeta 内部字段。
 */

  recommendedRealm?: string;  
  /**
 * description：MapMeta 内部字段。
 */

  description?: string;
}

/** 传送点类型。 */
export type PortalKind = 'portal' | 'stairs';

/** 传送触发方式。 */
export type PortalTrigger = 'manual' | 'auto';

/** 传送点。 */
export interface Portal {
/**
 * x：Portal 内部字段。
 */

  x: number;  
  /**
 * y：Portal 内部字段。
 */

  y: number;  
  /**
 * targetMapId：Portal 内部字段。
 */

  targetMapId: string;  
  /**
 * targetX：Portal 内部字段。
 */

  targetX: number;  
  /**
 * targetY：Portal 内部字段。
 */

  targetY: number;  
  /**
 * kind：Portal 内部字段。
 */

  kind: PortalKind;  
  /**
 * trigger：Portal 内部字段。
 */

  trigger: PortalTrigger;  
  /**
 * routeDomain：Portal 内部字段。
 */

  routeDomain: MapRouteDomain;  
  /**
 * allowPlayerOverlap：Portal 内部字段。
 */

  allowPlayerOverlap?: boolean;  
  /**
 * hidden：Portal 内部字段。
 */

  hidden?: boolean;  
  /**
 * observeTitle：Portal 内部字段。
 */

  observeTitle?: string;  
  /**
 * observeDesc：Portal 内部字段。
 */

  observeDesc?: string;
}

/** 场景实体类型。 */
export type EntityKind = 'npc' | 'monster' | 'container' | 'crowd';

/** 怪物仇恨模式。 */
export type MonsterAggroMode = 'always' | 'retaliate' | 'day_only' | 'night_only';

/** 妖兽血脉层次。 */
export type MonsterTier = 'mortal_blood' | 'variant' | 'demon_king';

/** Buff 分类。 */
export type BuffCategory = 'buff' | 'debuff';

/** Buff 可见性。 */
export type BuffVisibility = 'public' | 'observe_only' | 'hidden';

/** Buff 数值修饰模式。 */
export type BuffModifierMode = 'flat' | 'percent';

/** 可见 Buff 状态。 */
export interface VisibleBuffState {
/**
 * buffId：VisibleBuffState 内部字段。
 */

  buffId: string;  
  /**
 * name：VisibleBuffState 内部字段。
 */

  name: string;  
  /**
 * desc：VisibleBuffState 内部字段。
 */

  desc?: string;  
  /**
 * shortMark：VisibleBuffState 内部字段。
 */

  shortMark: string;  
  /**
 * category：VisibleBuffState 内部字段。
 */

  category: BuffCategory;  
  /**
 * visibility：VisibleBuffState 内部字段。
 */

  visibility: BuffVisibility;  
  /**
 * remainingTicks：VisibleBuffState 内部字段。
 */

  remainingTicks: number;  
  /**
 * duration：VisibleBuffState 内部字段。
 */

  duration: number;  
  /**
 * stacks：VisibleBuffState 内部字段。
 */

  stacks: number;  
  /**
 * maxStacks：VisibleBuffState 内部字段。
 */

  maxStacks: number;  
  /**
 * sourceSkillId：VisibleBuffState 内部字段。
 */

  sourceSkillId: string;  
  /**
 * sourceSkillName：VisibleBuffState 内部字段。
 */

  sourceSkillName?: string;  
  /**
 * color：VisibleBuffState 内部字段。
 */

  color?: string;  
  /**
 * attrs：VisibleBuffState 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * stats：VisibleBuffState 内部字段。
 */

  stats?: PartialNumericStats;  
  /**
 * qiProjection：VisibleBuffState 内部字段。
 */

  qiProjection?: QiProjectionModifier[];  
  /**
 * infiniteDuration：VisibleBuffState 内部字段。
 */

  infiniteDuration?: boolean;
}

/** 渲染用实体。 */
export interface RenderEntity {
/**
 * id：RenderEntity 内部字段。
 */

  id: string;  
  /**
 * x：RenderEntity 内部字段。
 */

  x: number;  
  /**
 * y：RenderEntity 内部字段。
 */

  y: number;  
  /**
 * char：RenderEntity 内部字段。
 */

  char: string;  
  /**
 * color：RenderEntity 内部字段。
 */

  color: string;  
  /**
 * name：RenderEntity 内部字段。
 */

  name?: string;  
  /**
 * kind：RenderEntity 内部字段。
 */

  kind?: EntityKind | 'player';  
  /**
 * monsterTier：RenderEntity 内部字段。
 */

  monsterTier?: MonsterTier;  
  /**
 * monsterScale：RenderEntity 内部字段。
 */

  monsterScale?: number;  
  /**
 * hp：RenderEntity 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：RenderEntity 内部字段。
 */

  maxHp?: number;  
  /**
 * qi：RenderEntity 内部字段。
 */

  qi?: number;  
  /**
 * maxQi：RenderEntity 内部字段。
 */

  maxQi?: number;  
  /**
 * npcQuestMarker：RenderEntity 内部字段。
 */

  npcQuestMarker?: NpcQuestMarker;  
  /**
 * observation：RenderEntity 内部字段。
 */

  observation?: ObservationInsight;  
  /**
 * buffs：RenderEntity 内部字段。
 */

  buffs?: VisibleBuffState[];
}

/** 时间段 ID。 */
export type TimePhaseId =
  | 'deep_night'
  | 'late_night'
  | 'before_dawn'
  | 'dawn'
  | 'day'
  | 'dusk'
  | 'first_night'
  | 'night'
  | 'midnight';

/** 时间调色板条目。 */
export interface TimePaletteEntry {
/**
 * tint：TimePaletteEntry 内部字段。
 */

  tint?: string;  
  /**
 * alpha：TimePaletteEntry 内部字段。
 */

  alpha?: number;
}

/** 地图光照配置。 */
export interface MapLightConfig {
/**
 * base：MapLightConfig 内部字段。
 */

  base?: number;  
  /**
 * timeInfluence：MapLightConfig 内部字段。
 */

  timeInfluence?: number;
}

/** 地图时间配置。 */
export interface MapTimeConfig {
/**
 * offsetTicks：MapTimeConfig 内部字段。
 */

  offsetTicks?: number;  
  /**
 * scale：MapTimeConfig 内部字段。
 */

  scale?: number;  
  /**
 * light：MapTimeConfig 内部字段。
 */

  light?: MapLightConfig;  
  /**
 * palette：MapTimeConfig 内部字段。
 */

  palette?: Partial<Record<TimePhaseId, TimePaletteEntry>>;
}

/** 游戏时间状态。 */
export interface GameTimeState {
/**
 * totalTicks：GameTimeState 内部字段。
 */

  totalTicks: number;  
  /**
 * localTicks：GameTimeState 内部字段。
 */

  localTicks: number;  
  /**
 * dayLength：GameTimeState 内部字段。
 */

  dayLength: number;  
  /**
 * timeScale：GameTimeState 内部字段。
 */

  timeScale: number;  
  /**
 * phase：GameTimeState 内部字段。
 */

  phase: TimePhaseId;  
  /**
 * phaseLabel：GameTimeState 内部字段。
 */

  phaseLabel: string;  
  /**
 * darknessStacks：GameTimeState 内部字段。
 */

  darknessStacks: number;  
  /**
 * visionMultiplier：GameTimeState 内部字段。
 */

  visionMultiplier: number;  
  /**
 * lightPercent：GameTimeState 内部字段。
 */

  lightPercent: number;  
  /**
 * effectiveViewRange：GameTimeState 内部字段。
 */

  effectiveViewRange: number;  
  /**
 * tint：GameTimeState 内部字段。
 */

  tint: string;  
  /**
 * overlayAlpha：GameTimeState 内部字段。
 */

  overlayAlpha: number;
}

/** 视口。 */
export interface Viewport {
/**
 * x：Viewport 内部字段。
 */

  x: number;  
  /**
 * y：Viewport 内部字段。
 */

  y: number;  
  /**
 * width：Viewport 内部字段。
 */

  width: number;  
  /**
 * height：Viewport 内部字段。
 */

  height: number;
}
