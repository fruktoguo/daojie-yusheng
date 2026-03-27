/**
 * 全局类型定义：地形、方向、地图、实体、修仙系统（属性/物品/功法/境界/技能/任务）等核心数据结构。
 */
import type { ElementKey, NumericRatioDivisors, NumericScalarStatKey, NumericStats, PartialNumericStats } from './numeric';
import type { QiProjectionModifier } from './qi';
import type { GridPoint, TargetingShape } from './targeting';

/** 地形类型 */
export enum TileType {
  Floor = 'floor',
  Road = 'road',
  Trail = 'trail',
  Wall = 'wall',
  Door = 'door',
  Window = 'window',
  BrokenWindow = 'broken_window',
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
}

/** 方向 */
export enum Direction {
  North = 0,
  South = 1,
  East = 2,
  West = 3,
}

/** 格子数据 */
/** 隐藏入口观察信息 */
export interface HiddenEntranceObservation {
  title: string;
  desc?: string;
}

/** 格子完整数据 */
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

/** 玩家当前视野窗口中的格子。null 表示当前不可见。 */
export type VisibleTile = Tile | null;

/** 地图元数据 */
/** 地图空间视觉模式 */
export type MapSpaceVisionMode = 'isolated' | 'parent_overlay';
/** 地图所属路网域 */
export type MapRouteDomain = 'system' | 'sect' | 'personal' | 'dynamic';
/** 传送点所属路网域配置 */
export type PortalRouteDomain = MapRouteDomain | 'inherit';

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

/** 传送点类型 */
export type PortalKind = 'portal' | 'stairs';
/** 传送触发方式 */
export type PortalTrigger = 'manual' | 'auto';

/** 传送点 */
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

/** 小地图标记类型 */
export type MapMinimapMarkerKind =
  | 'landmark'
  | 'container'
  | 'npc'
  | 'monster_spawn'
  | 'portal'
  | 'stairs';

/** 小地图标记 */
export interface MapMinimapMarker {
  id: string;
  kind: MapMinimapMarkerKind;
  x: number;
  y: number;
  label: string;
  detail?: string;
}

/** 小地图快照 */
export interface MapMinimapSnapshot {
  width: number;
  height: number;
  terrainRows: string[];
  markers: MapMinimapMarker[];
}

/** 已解锁地图图鉴条目 */
export interface MapMinimapArchiveEntry {
  mapId: string;
  mapMeta: MapMeta;
  snapshot: MapMinimapSnapshot;
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
  monsterTier?: MonsterTier;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: NpcQuestMarker;
  observation?: ObservationInsight;
  buffs?: VisibleBuffState[];
}

/** NPC 任务标记状态 */
export type NpcQuestMarkerState = 'available' | 'ready' | 'active';

/** NPC 任务标记 */
export interface NpcQuestMarker {
  line: QuestLine;
  state: NpcQuestMarkerState;
}

/** 观察信息行 */
export interface ObservationLine {
  label: string;
  value: string;
}

/** 观察清晰度等级 */
export type ObservationClarity = 'veiled' | 'blurred' | 'partial' | 'clear' | 'complete';

/** 观察洞察结果 */
export interface ObservationInsight {
  clarity: ObservationClarity;
  verdict: string;
  lines: ObservationLine[];
}

/** Buff 分类 */
export type BuffCategory = 'buff' | 'debuff';

/** Buff 可见性 */
export type BuffVisibility = 'public' | 'observe_only' | 'hidden';

/** 可见 Buff 状态 */
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
}

/** 时间段 ID */
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

/** 时间调色板条目 */
export interface TimePaletteEntry {
  tint?: string;
  alpha?: number;
}

/** 地图光照配置 */
export interface MapLightConfig {
  base?: number;
  timeInfluence?: number;
}

/** 地图时间配置 */
export interface MapTimeConfig {
  offsetTicks?: number;
  scale?: number;
  light?: MapLightConfig;
  palette?: Partial<Record<TimePhaseId, TimePaletteEntry>>;
}

/** 怪物仇恨模式 */
export type MonsterAggroMode = 'always' | 'retaliate' | 'day_only' | 'night_only';

/** 妖兽血脉层次 */
export type MonsterTier = 'mortal_blood' | 'variant' | 'demon_king';

/** 游戏时间状态 */
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

/** 数值百分比配置 */
export type NumericStatPercentages = Partial<Record<NumericScalarStatKey, number>>;

/** 属性加成来源 */
export interface AttrBonus {
  source: string;
  attrs: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  label?: string;
  meta?: Record<string, unknown>;
}

/** 物品类型 */
export type ItemType = 'consumable' | 'equipment' | 'material' | 'quest_item' | 'skill_book';

/** 装备槽位 */
export type EquipSlot = 'weapon' | 'head' | 'body' | 'legs' | 'accessory';

/** 装备效果触发器 */
export type EquipmentTrigger =
  | 'on_equip'
  | 'on_unequip'
  | 'on_tick'
  | 'on_move'
  | 'on_attack'
  | 'on_hit'
  | 'on_kill'
  | 'on_skill_cast'
  | 'on_cultivation_tick'
  | 'on_time_segment_changed'
  | 'on_enter_map';

/** 装备条件组合 */
export interface EquipmentConditionGroup {
  mode?: 'all' | 'any';
  items: EquipmentConditionDef[];
}

/** 装备条件定义 */
export type EquipmentConditionDef =
  | { type: 'time_segment'; in: TimePhaseId[] }
  | { type: 'map'; mapIds: string[] }
  | { type: 'hp_ratio'; op: '<=' | '>='; value: number }
  | { type: 'qi_ratio'; op: '<=' | '>='; value: number }
  | { type: 'is_cultivating'; value: boolean }
  | { type: 'has_buff'; buffId: string; minStacks?: number }
  | { type: 'target_kind'; in: Array<'monster' | 'player' | 'tile'> };

/** 装备 Buff 定义 */
export interface EquipmentBuffDef {
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
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
}

/** 装备常驻数值效果 */
export interface EquipmentStatAuraEffectDef {
  effectId?: string;
  type: 'stat_aura';
  conditions?: EquipmentConditionGroup;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
}

/** 装备成长推进效果 */
export interface EquipmentProgressEffectDef {
  effectId?: string;
  type: 'progress_boost';
  conditions?: EquipmentConditionGroup;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
}

/** 装备持续代价效果 */
export interface EquipmentPeriodicCostEffectDef {
  effectId?: string;
  type: 'periodic_cost';
  trigger: 'on_tick' | 'on_cultivation_tick';
  conditions?: EquipmentConditionGroup;
  resource: 'hp' | 'qi';
  mode: 'flat' | 'max_ratio_bp' | 'current_ratio_bp';
  value: number;
  minRemain?: number;
}

/** 装备触发 Buff 效果 */
export interface EquipmentTimedBuffEffectDef {
  effectId?: string;
  type: 'timed_buff';
  trigger: EquipmentTrigger;
  target?: 'self' | 'target';
  cooldown?: number;
  chance?: number;
  conditions?: EquipmentConditionGroup;
  buff: EquipmentBuffDef;
}

/** 装备效果联合类型 */
export type EquipmentEffectDef =
  | EquipmentStatAuraEffectDef
  | EquipmentProgressEffectDef
  | EquipmentPeriodicCostEffectDef
  | EquipmentTimedBuffEffectDef;

/** 物品堆叠 */
export interface ItemStack {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  desc: string;
  groundLabel?: string;
  grade?: TechniqueGrade;
  level?: number;
  equipSlot?: EquipSlot;
  equipAttrs?: Partial<Attributes>;
  equipStats?: PartialNumericStats;
  equipValueStats?: PartialNumericStats;
  effects?: EquipmentEffectDef[];
  tags?: string[];
  mapUnlockId?: string;
  tileAuraGainAmount?: number;
  allowBatchUse?: boolean;
}

/** 背包 */
export interface Inventory {
  items: ItemStack[];
  capacity: number;
}

/** 坊市订单方向 */
export type MarketOrderSide = 'buy' | 'sell';

/** 坊市订单状态 */
export type MarketOrderStatus = 'open' | 'filled' | 'cancelled';

/** 坊市托管仓 */
export interface MarketStorage {
  items: ItemStack[];
}

/** 坊市列表里的物品摘要 */
export interface MarketListedItemView {
  itemKey: string;
  item: ItemStack;
  sellOrderCount: number;
  sellQuantity: number;
  lowestSellPrice?: number;
  buyOrderCount: number;
  buyQuantity: number;
  highestBuyPrice?: number;
}

/** 坊市盘口价位 */
export interface MarketPriceLevelView {
  unitPrice: number;
  quantity: number;
  orderCount: number;
}

/** 坊市单个物品盘口 */
export interface MarketOrderBookView {
  itemKey: string;
  item: ItemStack;
  sells: MarketPriceLevelView[];
  buys: MarketPriceLevelView[];
}

/** 玩家视角下的坊市成交记录方向 */
export type MarketTradeHistorySide = 'buy' | 'sell';

/** 玩家可见的坊市成交记录 */
export interface MarketTradeHistoryEntryView {
  id: string;
  side: MarketTradeHistorySide;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  createdAt: number;
}

/** NPC 商店中的单件商品视图 */
export interface NpcShopItemView {
  itemId: string;
  item: ItemStack;
  unitPrice: number;
}

/** NPC 商店视图 */
export interface NpcShopView {
  npcId: string;
  npcName: string;
  dialogue: string;
  currencyItemId: string;
  currencyItemName: string;
  items: NpcShopItemView[];
}

/** 玩家可见的坊市自有订单 */
export interface MarketOwnOrderView {
  id: string;
  side: MarketOrderSide;
  status: MarketOrderStatus;
  itemKey: string;
  item: ItemStack;
  remainingQuantity: number;
  unitPrice: number;
  createdAt: number;
}

/** 拾取来源类型 */
export type LootSourceKind = 'ground' | 'container';

/** 地面物品条目视图 */
export interface GroundItemEntryView {
  itemKey: string;
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  grade?: TechniqueGrade;
  groundLabel?: string;
}

/** 地面物品堆视图 */
export interface GroundItemPileView {
  sourceId: string;
  x: number;
  y: number;
  items: GroundItemEntryView[];
}

/** 搜索进度视图 */
export interface LootSearchProgressView {
  totalTicks: number;
  remainingTicks: number;
  elapsedTicks: number;
}

/** 拾取窗口物品视图 */
export interface LootWindowItemView {
  itemKey: string;
  item: ItemStack;
}

/** 拾取窗口来源视图 */
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

/** 拾取窗口状态 */
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

/** 突破需求类型 */
export type BreakthroughRequirementType = 'item' | 'technique' | 'attribute' | 'root';

/** 突破需求视图条目 */
export interface BreakthroughRequirementView {
  id: string;
  type: BreakthroughRequirementType;
  label: string;
  completed: boolean;
  hidden: boolean;
  optional?: boolean;
  blocksBreakthrough?: boolean;
  increasePct?: number;
  detail?: string;
}

/** 突破预览状态 */
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
  blockedReason?: string;
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

/** 功法分类 */
export type TechniqueCategory = 'arts' | 'internal' | 'divine' | 'secret';

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

/** 开天门五行数值 */
export type HeavenGateRootValues = Record<ElementKey, number>;

/** 开天门暂存状态 */
export interface HeavenGateState {
  unlocked: boolean;
  severed: ElementKey[];
  roots: HeavenGateRootValues | null;
  entered: boolean;
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
  lifespanYears: number | null;
  progress: number;
  progressToNext: number;
  breakthroughReady: boolean;
  nextStage?: PlayerRealmStage;
  breakthroughItems: BreakthroughItemRequirement[];
  minTechniqueLevel: number;
  minTechniqueRealm?: TechniqueRealm;
  breakthrough?: BreakthroughPreviewState;
  heavenGate?: HeavenGateState | null;
}

/** 玩家特殊养成数值 */
export interface PlayerSpecialStats {
  foundation: number;
  combatExp: number;
}

/** 技能定义 */
export type SkillDamageKind = 'physical' | 'spell';

/** 技能公式变量类型 */
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
  | `caster.buff.${string}.stacks`
  | `target.buff.${string}.stacks`
  | `caster.stat.${NumericScalarStatKey}`
  | `target.stat.${NumericScalarStatKey}`;

/** 技能公式（递归结构：常数/变量引用/运算表达式） */
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

/** 技能目标选取定义 */
export interface SkillTargetingDef {
  shape?: TargetingShape;
  range?: number;
  radius?: number;
  maxTargets?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
}

/** 技能伤害效果定义 */
export interface SkillDamageEffectDef {
  type: 'damage';
  damageKind?: SkillDamageKind;
  element?: ElementKey;
  formula: SkillFormula;
}

/** 技能 Buff 效果定义 */
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
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
}

/** 技能效果联合类型 */
export type SkillEffectDef = SkillDamageEffectDef | SkillBuffEffectDef;

/** 技能完整定义 */
export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  cooldown: number;
  cost: number;
  costMultiplier?: number;
  range: number;
  targeting?: SkillTargetingDef;
  effects: SkillEffectDef[];
  unlockLevel?: number;
  unlockRealm?: TechniqueRealm;
  unlockPlayerRealm?: PlayerRealmStage;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
}

/** 临时 Buff 状态（含属性和数值加成） */
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
  realmLv: number;
  realm: TechniqueRealm;
  skills: SkillDef[];
  grade?: TechniqueGrade;
  category?: TechniqueCategory;
  layers?: TechniqueLayerDef[];
  attrCurves?: TechniqueAttrCurves;
}

/** 行动类型 */
export type ActionType = 'skill' | 'gather' | 'interact' | 'quest' | 'toggle' | 'battle' | 'travel' | 'breakthrough';

/** 自动战斗技能配置 */
export interface AutoBattleSkillConfig {
  skillId: string;
  enabled: boolean;
  skillEnabled?: boolean;
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
  skillEnabled?: boolean;
}

/** 战斗攻击特效 */
export interface CombatEffectAttack {
  type: 'attack';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color?: string;
}

/** 战斗飘字特效 */
export interface CombatEffectFloat {
  type: 'float';
  x: number;
  y: number;
  text: string;
  color?: string;
  variant?: 'damage' | 'action';
}

/** 战斗特效联合类型 */
export type CombatEffect = CombatEffectAttack | CombatEffectFloat;

/** 场景实体类型 */
export type EntityKind = 'npc' | 'monster' | 'container' | 'crowd';

/** 任务状态 */
export type QuestStatus = 'available' | 'active' | 'ready' | 'completed';

/** 任务线类型 */
export type QuestLine = 'main' | 'side' | 'daily' | 'encounter';

/** 任务目标类型 */
export type QuestObjectiveType = 'kill' | 'talk' | 'submit_item' | 'learn_technique' | 'realm_progress' | 'realm_stage';

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
  requiredItemId?: string;
  requiredItemCount?: number;
  giverId: string;
  giverName: string;
  giverMapId?: string;
  giverMapName?: string;
  giverX?: number;
  giverY?: number;
  targetMapId?: string;
  targetMapName?: string;
  targetX?: number;
  targetY?: number;
  targetNpcId?: string;
  targetNpcName?: string;
  submitNpcId?: string;
  submitNpcName?: string;
  submitMapId?: string;
  submitMapName?: string;
  submitX?: number;
  submitY?: number;
  relayMessage?: string;
}

export interface QuestNavigationState {
  questId: string;
  pendingConfirmation?: boolean;
  pausedForCrossMapCooldown?: boolean;
  lastBlockedRemainingTicks?: number;
}

/** 玩家状态 */
export interface PlayerState {
  id: string;
  name: string;
  displayName?: string;
  isBot?: boolean;
  online?: boolean;
  inWorld?: boolean;
  lastHeartbeatAt?: number;
  offlineSinceAt?: number;
  senseQiActive?: boolean;
  autoRetaliate?: boolean;
  autoBattleStationary?: boolean;
  allowAoePlayerHit?: boolean;
  autoIdleCultivation?: boolean;
  autoSwitchCultivation?: boolean;
  cultivationActive?: boolean;
  realmLv?: number;
  realmName?: string;
  realmStage?: string;
  realmReview?: string;
  breakthroughReady?: boolean;
  heavenGate?: HeavenGateState | null;
  spiritualRoots?: HeavenGateRootValues | null;
  boneAgeBaseYears?: number;
  lifeElapsedTicks?: number;
  lifespanYears?: number | null;
  mapId: string;
  x: number;
  y: number;
  facing: Direction;
  viewRange: number;
  hp: number;
  maxHp: number;
  qi: number;
  dead: boolean;
  foundation?: number;
  combatExp?: number;
  baseAttrs: Attributes;
  bonuses: AttrBonus[];
  temporaryBuffs?: TemporaryBuffState[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
  inventory: Inventory;
  marketStorage?: MarketStorage;
  equipment: EquipmentSlots;
  techniques: TechniqueState[];
  actions: ActionDef[];
  quests: QuestState[];
  autoBattle: boolean;
  autoBattleSkills: AutoBattleSkillConfig[];
  combatTargetId?: string;
  combatTargetLocked?: boolean;
  cultivatingTechId?: string;
  idleTicks?: number;
  revealedBreakthroughRequirementIds?: string[];
  unlockedMinimapIds?: string[];
  realm?: PlayerRealmState;
  questNavigation?: QuestNavigationState;
  questCrossMapNavCooldownUntilLifeTicks?: number;
}

/** 意见状态 */
export type SuggestionStatus = 'pending' | 'completed';

/** 意见回复作者类型 */
export type SuggestionReplyAuthorType = 'author' | 'gm';

/** 意见回复数据结构 */
export interface SuggestionReply {
  id: string;
  authorType: SuggestionReplyAuthorType;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: number;
}

/** 意见数据结构 */
export interface Suggestion {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  upvotes: string[]; // 存储玩家 ID
  downvotes: string[]; // 存储玩家 ID
  replies: SuggestionReply[];
  authorLastReadGmReplyAt: number;
  createdAt: number;
}

/** 意见分页结果 */
export interface SuggestionPage {
  items: Suggestion[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  keyword: string;
}
