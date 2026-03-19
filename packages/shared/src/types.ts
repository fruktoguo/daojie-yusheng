import type { NumericRatioDivisors, NumericStats, PartialNumericStats } from './numeric';

/** 地形类型 */
export enum TileType {
  Floor = 'floor',
  Wall = 'wall',
  Door = 'door',
  Portal = 'portal',
  Grass = 'grass',
  Water = 'water',
  Tree = 'tree',
  Stone = 'stone',
}

/** 方向 */
export enum Direction {
  North = 0,
  South = 1,
  East = 2,
  West = 3,
}

/** 格子数据 */
export interface Tile {
  type: TileType;
  walkable: boolean;
  blocksSight: boolean;
  occupiedBy: string | null;
  modifiedAt: number | null;
  hp?: number;
  maxHp?: number;
  hpVisible?: boolean;
}

/** 玩家当前视野窗口中的格子。null 表示当前不可见。 */
export type VisibleTile = Tile | null;

/** 地图元数据 */
export interface MapMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  dangerLevel?: number;
  recommendedRealm?: string;
  description?: string;
}

/** 传送点 */
export interface Portal {
  x: number;
  y: number;
  targetMapId: string;
  targetX: number;
  targetY: number;
}

/** 渲染用实体 */
export interface RenderEntity {
  id: string;
  x: number;
  y: number;
  char: string;
  color: string;
  name?: string;
  kind?: EntityKind;
  hp?: number;
  maxHp?: number;
}

/** 视口 */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ===== 修仙系统类型 =====

/** 六维属性键 */
export type AttrKey = 'constitution' | 'spirit' | 'perception' | 'talent' | 'comprehension' | 'luck';

/** 属性值对象 */
export type Attributes = Record<AttrKey, number>;

/** 属性加成来源 */
export interface AttrBonus {
  source: string;
  attrs: Partial<Attributes>;
  stats?: PartialNumericStats;
  label?: string;
  meta?: Record<string, unknown>;
}

/** 物品类型 */
export type ItemType = 'consumable' | 'equipment' | 'material' | 'quest_item' | 'skill_book';

/** 装备槽位 */
export type EquipSlot = 'weapon' | 'head' | 'body' | 'legs' | 'accessory';

/** 物品堆叠 */
export interface ItemStack {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  desc: string;
  equipSlot?: EquipSlot;
  equipAttrs?: Partial<Attributes>;
  equipStats?: PartialNumericStats;
}

/** 背包 */
export interface Inventory {
  items: ItemStack[];
  capacity: number;
}

/** 装备槽位映射 */
export type EquipmentSlots = Record<EquipSlot, ItemStack | null>;

/** 突破材料需求 */
export interface BreakthroughItemRequirement {
  itemId: string;
  count: number;
}

/** 功法境界 */
export enum TechniqueRealm {
  Entry = 0,
  Minor = 1,
  Major = 2,
  Perfection = 3,
}

/** 功法品阶 */
export type TechniqueGrade = 'mortal' | 'yellow' | 'mystic' | 'earth' | 'heaven' | 'spirit' | 'saint' | 'emperor';

/** 功法单属性成长分段 */
export interface TechniqueAttrCurveSegment {
  startLevel: number;
  endLevel?: number;
  gainPerLevel: number;
}

/** 功法六维成长曲线 */
export type TechniqueAttrCurves = Partial<Record<AttrKey, TechniqueAttrCurveSegment[]>>;

/** 玩家大境界 */
export enum PlayerRealmStage {
  Mortal = 0,
  BodyTempering = 1,
  BoneForging = 2,
  Meridian = 3,
  Innate = 4,
  QiRefining = 5,
  Foundation = 6,
}

/** 玩家大境界状态 */
export interface PlayerRealmState {
  stage: PlayerRealmStage;
  name: string;
  shortName: string;
  path: 'martial' | 'immortal';
  narrative: string;
  progress: number;
  progressToNext: number;
  breakthroughReady: boolean;
  nextStage?: PlayerRealmStage;
  breakthroughItems: BreakthroughItemRequirement[];
  minTechniqueLevel: number;
  minTechniqueRealm?: TechniqueRealm;
}

/** 技能定义 */
export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  cooldown: number;
  cost: number;
  range: number;
  power: number;
  unlockRealm: TechniqueRealm;
  unlockPlayerRealm?: PlayerRealmStage;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
}

/** 功法状态 */
export interface TechniqueState {
  techId: string;
  name: string;
  level: number;
  exp: number;
  expToNext: number;
  realm: TechniqueRealm;
  skills: SkillDef[];
  grade?: TechniqueGrade;
  attrCurves?: TechniqueAttrCurves;
}

/** 行动类型 */
export type ActionType = 'skill' | 'gather' | 'interact' | 'quest' | 'toggle' | 'battle' | 'travel' | 'breakthrough';

/** 行动定义 */
export interface ActionDef {
  id: string;
  name: string;
  type: ActionType;
  desc: string;
  cooldownLeft: number;
  range?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
}

export interface CombatEffectAttack {
  type: 'attack';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color?: string;
}

export interface CombatEffectFloat {
  type: 'float';
  x: number;
  y: number;
  text: string;
  color?: string;
}

export type CombatEffect = CombatEffectAttack | CombatEffectFloat;

/** 场景实体类型 */
export type EntityKind = 'npc' | 'monster';

/** 任务状态 */
export type QuestStatus = 'available' | 'active' | 'ready' | 'completed';

/** 任务进度 */
export interface QuestState {
  id: string;
  title: string;
  desc: string;
  status: QuestStatus;
  progress: number;
  required: number;
  targetName: string;
  rewardText: string;
  targetMonsterId: string;
  rewardItemId: string;
  rewardItemIds: string[];
  rewards: ItemStack[];
  nextQuestId?: string;
  giverId: string;
  giverName: string;
}

/** 玩家状态 */
export interface PlayerState {
  id: string;
  name: string;
  isBot?: boolean;
  autoRetaliate?: boolean;
  realmName?: string;
  realmStage?: string;
  breakthroughReady?: boolean;
  mapId: string;
  x: number;
  y: number;
  facing: Direction;
  viewRange: number;
  hp: number;
  maxHp: number;
  qi: number;
  dead: boolean;
  baseAttrs: Attributes;
  bonuses: AttrBonus[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
  inventory: Inventory;
  equipment: EquipmentSlots;
  techniques: TechniqueState[];
  actions: ActionDef[];
  quests: QuestState[];
  autoBattle: boolean;
  combatTargetId?: string;
  cultivatingTechId?: string;
  realm?: PlayerRealmState;
}
