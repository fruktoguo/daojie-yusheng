import type { ElementKey, NumericRatioDivisors, NumericScalarStatKey, NumericStats, PartialNumericStats } from './numeric';
import type { TargetingShape } from './targeting';

/** 地形类型 */
export enum TileType {
  Floor = 'floor',
  Road = 'road',
  Trail = 'trail',
  Wall = 'wall',
  Door = 'door',
  Portal = 'portal',
  Grass = 'grass',
  Hill = 'hill',
  Mud = 'mud',
  Swamp = 'swamp',
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
  aura: number;
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
  kind?: EntityKind | 'player';
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: NpcQuestMarker;
  observation?: ObservationInsight;
  buffs?: VisibleBuffState[];
}

export type NpcQuestMarkerState = 'available' | 'ready' | 'active';

export interface NpcQuestMarker {
  line: QuestLine;
  state: NpcQuestMarkerState;
}

export interface ObservationLine {
  label: string;
  value: string;
}

export type ObservationClarity = 'veiled' | 'blurred' | 'partial' | 'clear' | 'complete';

export interface ObservationInsight {
  clarity: ObservationClarity;
  verdict: string;
  lines: ObservationLine[];
}

export type BuffCategory = 'buff' | 'debuff';

export type BuffVisibility = 'public' | 'observe_only' | 'hidden';

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
}

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

export interface TimePaletteEntry {
  tint?: string;
  alpha?: number;
}

export interface MapLightConfig {
  base?: number;
  timeInfluence?: number;
}

export interface MapTimeConfig {
  offsetTicks?: number;
  scale?: number;
  light?: MapLightConfig;
  palette?: Partial<Record<TimePhaseId, TimePaletteEntry>>;
}

export type MonsterAggroMode = 'always' | 'retaliate' | 'day_only' | 'night_only';

export interface GameTimeState {
  totalTicks: number;
  localTicks: number;
  dayLength: number;
  phase: TimePhaseId;
  phaseLabel: string;
  darknessStacks: number;
  visionMultiplier: number;
  lightPercent: number;
  effectiveViewRange: number;
  tint: string;
  overlayAlpha: number;
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

export type LootSourceKind = 'ground' | 'container';

export interface GroundItemEntryView {
  itemKey: string;
  name: string;
  count: number;
}

export interface GroundItemPileView {
  sourceId: string;
  x: number;
  y: number;
  items: GroundItemEntryView[];
}

export interface LootSearchProgressView {
  totalTicks: number;
  remainingTicks: number;
  elapsedTicks: number;
}

export interface LootWindowItemView {
  itemKey: string;
  item: ItemStack;
}

export interface LootWindowSourceView {
  sourceId: string;
  kind: LootSourceKind;
  title: string;
  desc?: string;
  grade?: TechniqueGrade;
  searchable: boolean;
  search?: LootSearchProgressView;
  items: LootWindowItemView[];
  emptyText?: string;
}

export interface LootWindowState {
  tileX: number;
  tileY: number;
  title: string;
  sources: LootWindowSourceView[];
}

/** 装备槽位映射 */
export type EquipmentSlots = Record<EquipSlot, ItemStack | null>;

/** 突破材料需求 */
export interface BreakthroughItemRequirement {
  itemId: string;
  count: number;
}

export type BreakthroughRequirementType = 'item' | 'technique' | 'attribute';

export interface BreakthroughRequirementView {
  id: string;
  type: BreakthroughRequirementType;
  label: string;
  completed: boolean;
  hidden: boolean;
  optional?: boolean;
  blocksBreakthrough?: boolean;
  detail?: string;
}

export interface BreakthroughPreviewState {
  targetRealmLv: number;
  targetDisplayName: string;
  totalRequirements: number;
  completedRequirements: number;
  allCompleted: boolean;
  canBreakthrough: boolean;
  blockingRequirements: number;
  completedBlockingRequirements: number;
  requirements: BreakthroughRequirementView[];
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

/** 功法单层配置 */
export interface TechniqueLayerDef {
  level: number;
  expToNext: number;
  attrs?: Partial<Attributes>;
}

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
  realmLv: number;
  displayName: string;
  name: string;
  shortName: string;
  path: 'martial' | 'immortal' | 'ascended';
  narrative: string;
  review?: string;
  progress: number;
  progressToNext: number;
  breakthroughReady: boolean;
  nextStage?: PlayerRealmStage;
  breakthroughItems: BreakthroughItemRequirement[];
  minTechniqueLevel: number;
  minTechniqueRealm?: TechniqueRealm;
  breakthrough?: BreakthroughPreviewState;
}

/** 技能定义 */
export type SkillDamageKind = 'physical' | 'spell';

export type SkillFormulaVar =
  | 'techLevel'
  | 'targetCount'
  | 'caster.hp'
  | 'caster.maxHp'
  | 'caster.qi'
  | 'caster.maxQi'
  | 'target.hp'
  | 'target.maxHp'
  | 'target.qi'
  | 'target.maxQi'
  | `caster.stat.${NumericScalarStatKey}`
  | `target.stat.${NumericScalarStatKey}`;

export type SkillFormula =
  | number
  | {
      var: SkillFormulaVar;
      scale?: number;
    }
  | {
      op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max';
      args: SkillFormula[];
    }
  | {
      op: 'clamp';
      value: SkillFormula;
      min?: SkillFormula;
      max?: SkillFormula;
    };

export interface SkillTargetingDef {
  shape?: TargetingShape;
  range?: number;
  radius?: number;
  maxTargets?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
}

export interface SkillDamageEffectDef {
  type: 'damage';
  damageKind?: SkillDamageKind;
  element?: ElementKey;
  formula: SkillFormula;
}

export interface SkillBuffEffectDef {
  type: 'buff';
  target: 'self' | 'target';
  buffId: string;
  name: string;
  desc?: string;
  shortMark?: string;
  category?: BuffCategory;
  visibility?: BuffVisibility;
  color?: string;
  duration: number;
  maxStacks?: number;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
}

export type SkillEffectDef = SkillDamageEffectDef | SkillBuffEffectDef;

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  cooldown: number;
  cost: number;
  range: number;
  targeting?: SkillTargetingDef;
  effects: SkillEffectDef[];
  unlockLevel?: number;
  unlockRealm?: TechniqueRealm;
  unlockPlayerRealm?: PlayerRealmStage;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
}

export interface TemporaryBuffState extends VisibleBuffState {
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
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
  layers?: TechniqueLayerDef[];
  attrCurves?: TechniqueAttrCurves;
}

/** 行动类型 */
export type ActionType = 'skill' | 'gather' | 'interact' | 'quest' | 'toggle' | 'battle' | 'travel' | 'breakthrough';

export interface AutoBattleSkillConfig {
  skillId: string;
  enabled: boolean;
}

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
  autoBattleEnabled?: boolean;
  autoBattleOrder?: number;
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
  variant?: 'damage' | 'action';
}

export type CombatEffect = CombatEffectAttack | CombatEffectFloat;

/** 场景实体类型 */
export type EntityKind = 'npc' | 'monster' | 'container';

/** 任务状态 */
export type QuestStatus = 'available' | 'active' | 'ready' | 'completed';

/** 任务线类型 */
export type QuestLine = 'main' | 'side' | 'daily' | 'encounter';

/** 任务目标类型 */
export type QuestObjectiveType = 'kill' | 'learn_technique' | 'realm_progress' | 'realm_stage';

/** 任务进度 */
export interface QuestState {
  id: string;
  title: string;
  desc: string;
  line: QuestLine;
  chapter?: string;
  story?: string;
  status: QuestStatus;
  objectiveType: QuestObjectiveType;
  objectiveText?: string;
  progress: number;
  required: number;
  targetName: string;
  targetTechniqueId?: string;
  targetRealmStage?: PlayerRealmStage;
  rewardText: string;
  targetMonsterId: string;
  rewardItemId: string;
  rewardItemIds: string[];
  rewards: ItemStack[];
  nextQuestId?: string;
  giverId: string;
  giverName: string;
  giverMapId?: string;
  giverMapName?: string;
  giverX?: number;
  giverY?: number;
}

/** 玩家状态 */
export interface PlayerState {
  id: string;
  name: string;
  displayName?: string;
  isBot?: boolean;
  senseQiActive?: boolean;
  autoRetaliate?: boolean;
  realmLv?: number;
  realmName?: string;
  realmStage?: string;
  realmReview?: string;
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
  temporaryBuffs?: TemporaryBuffState[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
  inventory: Inventory;
  equipment: EquipmentSlots;
  techniques: TechniqueState[];
  actions: ActionDef[];
  quests: QuestState[];
  autoBattle: boolean;
  autoBattleSkills: AutoBattleSkillConfig[];
  combatTargetId?: string;
  combatTargetLocked?: boolean;
  cultivatingTechId?: string;
  revealedBreakthroughRequirementIds?: string[];
  realm?: PlayerRealmState;
}
