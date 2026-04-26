import type { PartialNumericStats } from './numeric';
import type { ObservationInsight } from './observation-types';
import type { QiProjectionModifier } from './qi';
import type { TileRuntimeResourceView } from './service-sync-types';
import type { Attributes } from './attribute-types';
import type { FormationRangeShape } from './formation-types';
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
 * ColdBog：寒沼地形。
 */

  ColdBog = 'cold_bog',
  /**
 * MoltenPool：熔池地形。
 */

  MoltenPool = 'molten_pool',
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
 * title：title名称或显示文本。
 */

  title: string;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
}

/** 格子完整数据。 */
export interface Tile {
/**
 * type：type相关字段。
 */

  type: TileType;
  /**
 * walkable：walkable相关字段。
 */

  walkable: boolean;
  /**
 * blocksSight：blockSight相关字段。
 */

  blocksSight: boolean;
  /**
 * aura：aura相关字段。
 */

  aura: number;
  /**
 * resources：resource相关字段。
 */

  resources?: TileRuntimeResourceView[];
  /**
 * occupiedBy：occupiedBy相关字段。
 */

  occupiedBy: string | null;
  /**
 * modifiedAt：modifiedAt相关字段。
 */

  modifiedAt: number | null;
  /**
 * hp：hp相关字段。
 */

  hp?: number;
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;
  /**
 * hpVisible：hp可见相关字段。
 */

  hpVisible?: boolean;
  /**
 * hiddenEntrance：hiddenEntrance相关字段。
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
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /**
 * playerOverlapPoints：玩家OverlapPoint相关字段。
 */

  playerOverlapPoints?: GridPoint[];
  /**
 * routeDomain：路线Domain相关字段。
 */

  routeDomain?: MapRouteDomain;
  /**
 * parentMapId：parent地图ID标识。
 */

  parentMapId?: string;
  /**
 * parentOriginX：parentOriginX相关字段。
 */

  parentOriginX?: number;
  /**
 * parentOriginY：parentOriginY相关字段。
 */

  parentOriginY?: number;
  /**
 * floorLevel：floor等级数值。
 */

  floorLevel?: number;
  /**
 * floorName：floor名称名称或显示文本。
 */

  floorName?: string;
  /**
 * spaceVisionMode：spaceVisionMode相关字段。
 */

  spaceVisionMode?: MapSpaceVisionMode;
  /**
 * dangerLevel：danger等级数值。
 */

  dangerLevel?: number;
  /**
 * recommendedRealm：recommendedRealm相关字段。
 */

  recommendedRealm?: string;
  /**
 * description：description相关字段。
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
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * targetMapId：目标地图ID标识。
 */

  targetMapId: string;
  /**
 * targetX：目标X相关字段。
 */

  targetX: number;
  /**
 * targetY：目标Y相关字段。
 */

  targetY: number;
  /**
 * kind：kind相关字段。
 */

  kind: PortalKind;
  /**
 * trigger：trigger相关字段。
 */

  trigger: PortalTrigger;
  /**
 * routeDomain：路线Domain相关字段。
 */

  routeDomain: MapRouteDomain;
  /**
 * allowPlayerOverlap：allow玩家Overlap相关字段。
 */

  allowPlayerOverlap?: boolean;
  /**
 * hidden：hidden相关字段。
 */

  hidden?: boolean;
  /**
 * observeTitle：observeTitle名称或显示文本。
 */

  observeTitle?: string;
  /**
 * observeDesc：observeDesc相关字段。
 */

  observeDesc?: string;
}

/** 场景实体类型。 */
export type EntityKind = 'npc' | 'monster' | 'container' | 'crowd' | 'formation';

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
 * buffId：buffID标识。
 */

  buffId: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
  /**
 * shortMark：shortMark相关字段。
 */

  shortMark: string;
  /**
 * category：category相关字段。
 */

  category: BuffCategory;
  /**
 * visibility：可见性相关字段。
 */

  visibility: BuffVisibility;
  /**
 * remainingTicks：remainingtick相关字段。
 */

  remainingTicks: number;
  /**
 * duration：duration相关字段。
 */

  duration: number;
  /**
 * stacks：stack相关字段。
 */

  stacks: number;
  /**
 * maxStacks：maxStack相关字段。
 */

  maxStacks: number;
  /**
 * sourceSkillId：来源技能ID标识。
 */

  sourceSkillId: string;
  /**
 * sourceSkillName：来源技能名称名称或显示文本。
 */

  sourceSkillName?: string;
  /**
 * color：color相关字段。
 */

  color?: string;
  /**
 * attrs：attr相关字段。
 */

  attrs?: Partial<Attributes>;
  /**
 * stats：stat相关字段。
 */

  stats?: PartialNumericStats;
  /**
 * qiProjection：qiProjection相关字段。
 */

  qiProjection?: QiProjectionModifier[];
  /**
 * infiniteDuration：infiniteDuration相关字段。
 */

  infiniteDuration?: boolean;
}

/** 渲染用实体。 */
export interface RenderEntity {
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

  badge?: {
    text: string;
    tone?: 'variant' | 'boss' | 'demonic';
  };
  /**
 * name：名称名称或显示文本。
 */

  name?: string;
  /**
 * kind：kind相关字段。
 */

  kind?: EntityKind | 'player';
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

  npcQuestMarker?: NpcQuestMarker;
  /**
 * observation：observation相关字段。
 */

  observation?: ObservationInsight;
  /**
 * buffs：buff相关字段。
 */

  buffs?: VisibleBuffState[];
  /** 阵法影响半径，仅阵法实体使用。 */
  formationRadius?: number;
  /** 阵法范围形状，仅阵法实体使用。 */
  formationRangeShape?: FormationRangeShape;
  /** 感气时使用的阵法范围高亮颜色。 */
  formationRangeHighlightColor?: string;
  /** 阵法边界专用字符。 */
  formationBoundaryChar?: string;
  /** 阵法边界专用颜色。 */
  formationBoundaryColor?: string;
  /** 阵法边界专用范围高亮颜色。 */
  formationBoundaryRangeHighlightColor?: string;
  /** 阵眼是否无需感气即可直接看见。 */
  formationEyeVisibleWithoutSenseQi?: boolean;
  /** 阵法范围是否无需感气即可直接看见。 */
  formationRangeVisibleWithoutSenseQi?: boolean;
  /** 阵法边界是否无需感气即可直接看见。 */
  formationBoundaryVisibleWithoutSenseQi?: boolean;
  /** 阵法实体是否显示名称文本。 */
  formationShowText?: boolean;
  /** 阵法边界是否会形成阻挡。 */
  formationBlocksBoundary?: boolean;
  /** 阵法所属宗门 ID。 */
  formationOwnerSectId?: string | null;
  /** 阵法所属玩家 ID。 */
  formationOwnerPlayerId?: string | null;
  /** 阵法是否处于开启状态。 */
  formationActive?: boolean;
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
 * tint：tint相关字段。
 */

  tint?: string;
  /**
 * alpha：alpha相关字段。
 */

  alpha?: number;
}

/** 地图光照配置。 */
export interface MapLightConfig {
/**
 * base：base相关字段。
 */

  base?: number;
  /**
 * timeInfluence：时间Influence相关字段。
 */

  timeInfluence?: number;
}

/** 地图时间配置。 */
export interface MapTimeConfig {
/**
 * offsetTicks：offsettick相关字段。
 */

  offsetTicks?: number;
  /**
 * scale：scale相关字段。
 */

  scale?: number;
  /**
 * light：light相关字段。
 */

  light?: MapLightConfig;
  /**
 * palette：palette相关字段。
 */

  palette?: Partial<Record<TimePhaseId, TimePaletteEntry>>;
}

/** 游戏时间状态。 */
export interface GameTimeState {
/**
 * totalTicks：totaltick相关字段。
 */

  totalTicks: number;
  /**
 * localTicks：localtick相关字段。
 */

  localTicks: number;
  /**
 * dayLength：数量或计量字段。
 */

  dayLength: number;
  /**
 * timeScale：时间Scale相关字段。
 */

  timeScale: number;
  /**
 * phase：phase相关字段。
 */

  phase: TimePhaseId;
  /**
 * phaseLabel：phaseLabel名称或显示文本。
 */

  phaseLabel: string;
  /**
 * darknessStacks：darknessStack相关字段。
 */

  darknessStacks: number;
  /**
 * visionMultiplier：visionMultiplier相关字段。
 */

  visionMultiplier: number;
  /**
 * lightPercent：lightPercent相关字段。
 */

  lightPercent: number;
  /**
 * effectiveViewRange：effective视图范围相关字段。
 */

  effectiveViewRange: number;
  /**
 * tint：tint相关字段。
 */

  tint: string;
  /**
 * overlayAlpha：overlayAlpha相关字段。
 */

  overlayAlpha: number;
}

/** 视口。 */
export interface Viewport {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
}
