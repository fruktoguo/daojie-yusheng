import type { PartialNumericStats } from './numeric';
import type { ObservationInsight } from './observation-types';
import type { QiProjectionModifier } from './qi';
import type { Attributes } from './attribute-types';
import type { GridPoint } from './targeting';
import type { NpcQuestMarker } from './world-view-types';

/** 地形类型。 */
export enum TileType {
  Floor = 'floor',
  Road = 'road',
  Trail = 'trail',
  Wall = 'wall',
  Door = 'door',
  Window = 'window',
  BrokenWindow = 'broken_window',
  HouseEave = 'house_eave',
  HouseCorner = 'house_corner',
  ScreenWall = 'screen_wall',
  Veranda = 'veranda',
  Portal = 'portal',
  Stairs = 'stairs',
  Grass = 'grass',
  Hill = 'hill',
  Cliff = 'cliff',
  Mud = 'mud',
  Swamp = 'swamp',
  Water = 'water',
  Cloud = 'cloud',
  CloudFloor = 'cloud_floor',
  Void = 'void',
  Tree = 'tree',
  Bamboo = 'bamboo',
  Stone = 'stone',
  SpiritOre = 'spirit_ore',
  BlackIronOre = 'black_iron_ore',
  BrokenSwordHeap = 'broken_sword_heap',
}

/** 方向。 */
export enum Direction {
  North = 0,
  South = 1,
  East = 2,
  West = 3,
}

/** 格子上的隐藏入口提示，用于观察后展示。 */
export interface HiddenEntranceObservation {
  title: string;
  desc?: string;
}

/** 格子完整数据。 */
export interface Tile {
  type: TileType;
  walkable: boolean;
  blocksSight: boolean;
  aura: number;
  occupiedBy: string | null;
  modifiedAt: number | null;
  hp?: number;
  maxHp?: number;
  hpVisible?: boolean;
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
  id: string;
  name: string;
  width: number;
  height: number;
  playerOverlapPoints?: GridPoint[];
  routeDomain?: MapRouteDomain;
  parentMapId?: string;
  parentOriginX?: number;
  parentOriginY?: number;
  floorLevel?: number;
  floorName?: string;
  spaceVisionMode?: MapSpaceVisionMode;
  dangerLevel?: number;
  recommendedRealm?: string;
  description?: string;
}

/** 传送点类型。 */
export type PortalKind = 'portal' | 'stairs';

/** 传送触发方式。 */
export type PortalTrigger = 'manual' | 'auto';

/** 传送点。 */
export interface Portal {
  x: number;
  y: number;
  targetMapId: string;
  targetX: number;
  targetY: number;
  kind: PortalKind;
  trigger: PortalTrigger;
  routeDomain: MapRouteDomain;
  allowPlayerOverlap?: boolean;
  hidden?: boolean;
  observeTitle?: string;
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
  buffId: string;
  name: string;
  desc?: string;
  shortMark: string;
  category: BuffCategory;
  visibility: BuffVisibility;
  remainingTicks: number;
  duration: number;
  stacks: number;
  maxStacks: number;
  sourceSkillId: string;
  sourceSkillName?: string;
  color?: string;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  infiniteDuration?: boolean;
}

/** 渲染用实体。 */
export interface RenderEntity {
  id: string;
  x: number;
  y: number;
  char: string;
  color: string;
  name?: string;
  kind?: EntityKind | 'player';
  monsterTier?: MonsterTier;
  monsterScale?: number;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: NpcQuestMarker;
  observation?: ObservationInsight;
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
  tint?: string;
  alpha?: number;
}

/** 地图光照配置。 */
export interface MapLightConfig {
  base?: number;
  timeInfluence?: number;
}

/** 地图时间配置。 */
export interface MapTimeConfig {
  offsetTicks?: number;
  scale?: number;
  light?: MapLightConfig;
  palette?: Partial<Record<TimePhaseId, TimePaletteEntry>>;
}

/** 游戏时间状态。 */
export interface GameTimeState {
  totalTicks: number;
  localTicks: number;
  dayLength: number;
  timeScale: number;
  phase: TimePhaseId;
  phaseLabel: string;
  darknessStacks: number;
  visionMultiplier: number;
  lightPercent: number;
  effectiveViewRange: number;
  tint: string;
  overlayAlpha: number;
}

/** 视口。 */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}
