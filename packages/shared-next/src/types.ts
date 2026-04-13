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
/** title：定义该变量以承载业务值。 */
  title: string;
  desc?: string;
}

/** 格子完整数据 */
export interface Tile {
/** type：定义该变量以承载业务值。 */
  type: TileType;
/** walkable：定义该变量以承载业务值。 */
  walkable: boolean;
/** blocksSight：定义该变量以承载业务值。 */
  blocksSight: boolean;
/** aura：定义该变量以承载业务值。 */
  aura: number;
/** occupiedBy：定义该变量以承载业务值。 */
  occupiedBy: string | null;
/** modifiedAt：定义该变量以承载业务值。 */
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

/** MapMeta：定义该接口的能力与字段约束。 */
export interface MapMeta {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** width：定义该变量以承载业务值。 */
  width: number;
/** height：定义该变量以承载业务值。 */
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
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** targetMapId：定义该变量以承载业务值。 */
  targetMapId: string;
/** targetX：定义该变量以承载业务值。 */
  targetX: number;
/** targetY：定义该变量以承载业务值。 */
  targetY: number;
/** kind：定义该变量以承载业务值。 */
  kind: PortalKind;
/** trigger：定义该变量以承载业务值。 */
  trigger: PortalTrigger;
/** routeDomain：定义该变量以承载业务值。 */
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
/** id：定义该变量以承载业务值。 */
  id: string;
/** kind：定义该变量以承载业务值。 */
  kind: MapMinimapMarkerKind;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** label：定义该变量以承载业务值。 */
  label: string;
  detail?: string;
}

/** 小地图快照 */
export interface MapMinimapSnapshot {
/** width：定义该变量以承载业务值。 */
  width: number;
/** height：定义该变量以承载业务值。 */
  height: number;
/** terrainRows：定义该变量以承载业务值。 */
  terrainRows: string[];
/** markers：定义该变量以承载业务值。 */
  markers: MapMinimapMarker[];
}

/** 已解锁地图图鉴条目 */
export interface MapMinimapArchiveEntry {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapMeta：定义该变量以承载业务值。 */
  mapMeta: MapMeta;
/** snapshot：定义该变量以承载业务值。 */
  snapshot: MapMinimapSnapshot;
}

/** 渲染用实体 */
export interface RenderEntity {
/** id：定义该变量以承载业务值。 */
  id: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
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

/** NPC 任务标记状态 */
export type NpcQuestMarkerState = 'available' | 'ready' | 'active';

/** NPC 任务标记 */
export interface NpcQuestMarker {
/** line：定义该变量以承载业务值。 */
  line: QuestLine;
/** state：定义该变量以承载业务值。 */
  state: NpcQuestMarkerState;
}

/** 观察信息行 */
export interface ObservationLine {
/** label：定义该变量以承载业务值。 */
  label: string;
/** value：定义该变量以承载业务值。 */
  value: string;
}

/** 观察清晰度等级 */
export type ObservationClarity = 'veiled' | 'blurred' | 'partial' | 'clear' | 'complete';

/** 观察洞察结果 */
export interface ObservationInsight {
/** clarity：定义该变量以承载业务值。 */
  clarity: ObservationClarity;
/** verdict：定义该变量以承载业务值。 */
  verdict: string;
/** lines：定义该变量以承载业务值。 */
  lines: ObservationLine[];
}

/** Buff 分类 */
export type BuffCategory = 'buff' | 'debuff';

/** Buff 可见性 */
export type BuffVisibility = 'public' | 'observe_only' | 'hidden';

/** 可见 Buff 状态 */
export interface VisibleBuffState {
/** buffId：定义该变量以承载业务值。 */
  buffId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
  desc?: string;
/** shortMark：定义该变量以承载业务值。 */
  shortMark: string;
/** category：定义该变量以承载业务值。 */
  category: BuffCategory;
/** visibility：定义该变量以承载业务值。 */
  visibility: BuffVisibility;
/** remainingTicks：定义该变量以承载业务值。 */
  remainingTicks: number;
/** duration：定义该变量以承载业务值。 */
  duration: number;
/** stacks：定义该变量以承载业务值。 */
  stacks: number;
/** maxStacks：定义该变量以承载业务值。 */
  maxStacks: number;
/** sourceSkillId：定义该变量以承载业务值。 */
  sourceSkillId: string;
  sourceSkillName?: string;
  color?: string;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  infiniteDuration?: boolean;
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
/** totalTicks：定义该变量以承载业务值。 */
  totalTicks: number;
/** localTicks：定义该变量以承载业务值。 */
  localTicks: number;
/** dayLength：定义该变量以承载业务值。 */
  dayLength: number;
/** timeScale：定义该变量以承载业务值。 */
  timeScale: number;
/** phase：定义该变量以承载业务值。 */
  phase: TimePhaseId;
/** phaseLabel：定义该变量以承载业务值。 */
  phaseLabel: string;
/** darknessStacks：定义该变量以承载业务值。 */
  darknessStacks: number;
/** visionMultiplier：定义该变量以承载业务值。 */
  visionMultiplier: number;
/** lightPercent：定义该变量以承载业务值。 */
  lightPercent: number;
/** effectiveViewRange：定义该变量以承载业务值。 */
  effectiveViewRange: number;
/** tint：定义该变量以承载业务值。 */
  tint: string;
/** overlayAlpha：定义该变量以承载业务值。 */
  overlayAlpha: number;
}

/** 视口 */
export interface Viewport {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** width：定义该变量以承载业务值。 */
  width: number;
/** height：定义该变量以承载业务值。 */
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
/** source：定义该变量以承载业务值。 */
  source: string;
/** attrs：定义该变量以承载业务值。 */
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
/** items：定义该变量以承载业务值。 */
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
/** buffId：定义该变量以承载业务值。 */
  buffId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
  desc?: string;
  shortMark?: string;
  category?: BuffCategory;
  visibility?: BuffVisibility;
  color?: string;
/** duration：定义该变量以承载业务值。 */
  duration: number;
  stacks?: number;
  maxStacks?: number;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
  presentationScale?: number;
}

/** Buff 维持代价定义 */
export interface BuffSustainCostDef {
/** resource：定义该变量以承载业务值。 */
  resource: 'hp' | 'qi';
/** baseCost：定义该变量以承载业务值。 */
  baseCost: number;
  growthRate?: number;
}

/** 消耗品施加的 Buff 定义 */
export interface ConsumableBuffDef {
/** buffId：定义该变量以承载业务值。 */
  buffId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
  desc?: string;
  shortMark?: string;
  category?: BuffCategory;
  visibility?: BuffVisibility;
  color?: string;
/** duration：定义该变量以承载业务值。 */
  duration: number;
  maxStacks?: number;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
  presentationScale?: number;
  infiniteDuration?: boolean;
  sustainCost?: BuffSustainCostDef;
  expireWithBuffId?: string;
  sourceSkillId?: string;
}

/** 装备常驻数值效果 */
export interface EquipmentStatAuraEffectDef {
  effectId?: string;
/** type：定义该变量以承载业务值。 */
  type: 'stat_aura';
  conditions?: EquipmentConditionGroup;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
  presentationScale?: number;
}

/** 装备成长推进效果 */
export interface EquipmentProgressEffectDef {
  effectId?: string;
/** type：定义该变量以承载业务值。 */
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
/** type：定义该变量以承载业务值。 */
  type: 'periodic_cost';
/** trigger：定义该变量以承载业务值。 */
  trigger: 'on_tick' | 'on_cultivation_tick';
  conditions?: EquipmentConditionGroup;
/** resource：定义该变量以承载业务值。 */
  resource: 'hp' | 'qi';
/** mode：定义该变量以承载业务值。 */
  mode: 'flat' | 'max_ratio_bp' | 'current_ratio_bp';
/** value：定义该变量以承载业务值。 */
  value: number;
  minRemain?: number;
}

/** 装备触发 Buff 效果 */
export interface EquipmentTimedBuffEffectDef {
  effectId?: string;
/** type：定义该变量以承载业务值。 */
  type: 'timed_buff';
/** trigger：定义该变量以承载业务值。 */
  trigger: EquipmentTrigger;
  target?: 'self' | 'target';
  cooldown?: number;
  chance?: number;
  conditions?: EquipmentConditionGroup;
/** buff：定义该变量以承载业务值。 */
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
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: ItemType;
/** count：定义该变量以承载业务值。 */
  count: number;
/** desc：定义该变量以承载业务值。 */
  desc: string;
  groundLabel?: string;
  grade?: TechniqueGrade;
  level?: number;
  equipSlot?: EquipSlot;
  equipAttrs?: Partial<Attributes>;
  equipStats?: PartialNumericStats;
  equipValueStats?: PartialNumericStats;
  effects?: EquipmentEffectDef[];
  healAmount?: number;
  healPercent?: number;
  qiPercent?: number;
  cooldown?: number;
  consumeBuffs?: ConsumableBuffDef[];
  tags?: string[];
  enhanceLevel?: number;
  alchemySuccessRate?: number;
  alchemySpeedRate?: number;
  mapUnlockId?: string;
  tileAuraGainAmount?: number;
  allowBatchUse?: boolean;
}

/** AlchemySkillState：定义该接口的能力与字段约束。 */
export interface AlchemySkillState {
/** level：定义该变量以承载业务值。 */
  level: number;
/** exp：定义该变量以承载业务值。 */
  exp: number;
/** expToNext：定义该变量以承载业务值。 */
  expToNext: number;
}

/** 背包 */
export interface Inventory {
/** items：定义该变量以承载业务值。 */
  items: ItemStack[];
/** capacity：定义该变量以承载业务值。 */
  capacity: number;
  cooldowns?: InventoryItemCooldownState[];
  serverTick?: number;
}

/** 背包内物品的运行时冷却态 */
export interface InventoryItemCooldownState {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** cooldown：定义该变量以承载业务值。 */
  cooldown: number;
/** startedAtTick：定义该变量以承载业务值。 */
  startedAtTick: number;
}

/** 坊市订单方向 */
export type MarketOrderSide = 'buy' | 'sell';

/** 坊市订单状态 */
export type MarketOrderStatus = 'open' | 'filled' | 'cancelled';

/** 坊市托管仓 */
export interface MarketStorage {
/** items：定义该变量以承载业务值。 */
  items: ItemStack[];
}

/** 坊市列表里的物品摘要 */
export interface MarketListedItemView {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** sellOrderCount：定义该变量以承载业务值。 */
  sellOrderCount: number;
/** sellQuantity：定义该变量以承载业务值。 */
  sellQuantity: number;
  lowestSellPrice?: number;
/** buyOrderCount：定义该变量以承载业务值。 */
  buyOrderCount: number;
/** buyQuantity：定义该变量以承载业务值。 */
  buyQuantity: number;
  highestBuyPrice?: number;
}

/** 坊市盘口价位 */
export interface MarketPriceLevelView {
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
/** quantity：定义该变量以承载业务值。 */
  quantity: number;
/** orderCount：定义该变量以承载业务值。 */
  orderCount: number;
}

/** 坊市单个物品盘口 */
export interface MarketOrderBookView {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** sells：定义该变量以承载业务值。 */
  sells: MarketPriceLevelView[];
/** buys：定义该变量以承载业务值。 */
  buys: MarketPriceLevelView[];
}

/** 玩家视角下的坊市成交记录方向 */
export type MarketTradeHistorySide = 'buy' | 'sell';

/** 玩家可见的坊市成交记录 */
export interface MarketTradeHistoryEntryView {
/** id：定义该变量以承载业务值。 */
  id: string;
/** side：定义该变量以承载业务值。 */
  side: MarketTradeHistorySide;
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** itemName：定义该变量以承载业务值。 */
  itemName: string;
/** quantity：定义该变量以承载业务值。 */
  quantity: number;
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
}

/** NPC 商店中的单件商品视图 */
export interface NpcShopItemView {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
  remainingQuantity?: number;
  stockLimit?: number;
  refreshAt?: number;
}

/** NPC 商店视图 */
export interface NpcShopView {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** npcName：定义该变量以承载业务值。 */
  npcName: string;
/** dialogue：定义该变量以承载业务值。 */
  dialogue: string;
/** currencyItemId：定义该变量以承载业务值。 */
  currencyItemId: string;
/** currencyItemName：定义该变量以承载业务值。 */
  currencyItemName: string;
/** items：定义该变量以承载业务值。 */
  items: NpcShopItemView[];
}

/** 玩家可见的坊市自有订单 */
export interface MarketOwnOrderView {
/** id：定义该变量以承载业务值。 */
  id: string;
/** side：定义该变量以承载业务值。 */
  side: MarketOrderSide;
/** status：定义该变量以承载业务值。 */
  status: MarketOrderStatus;
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** remainingQuantity：定义该变量以承载业务值。 */
  remainingQuantity: number;
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
}

/** 拾取来源类型 */
export type LootSourceKind = 'ground' | 'container';

/** 地面物品条目视图 */
export interface GroundItemEntryView {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: ItemType;
/** count：定义该变量以承载业务值。 */
  count: number;
  grade?: TechniqueGrade;
  groundLabel?: string;
}

/** 地面物品堆视图 */
export interface GroundItemPileView {
/** sourceId：定义该变量以承载业务值。 */
  sourceId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** items：定义该变量以承载业务值。 */
  items: GroundItemEntryView[];
}

/** 搜索进度视图 */
export interface LootSearchProgressView {
/** totalTicks：定义该变量以承载业务值。 */
  totalTicks: number;
/** remainingTicks：定义该变量以承载业务值。 */
  remainingTicks: number;
/** elapsedTicks：定义该变量以承载业务值。 */
  elapsedTicks: number;
}

/** 拾取窗口物品视图 */
export interface LootWindowItemView {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
}

/** 拾取窗口来源视图 */
export interface LootWindowSourceView {
/** sourceId：定义该变量以承载业务值。 */
  sourceId: string;
/** kind：定义该变量以承载业务值。 */
  kind: LootSourceKind;
/** title：定义该变量以承载业务值。 */
  title: string;
  desc?: string;
  grade?: TechniqueGrade;
/** searchable：定义该变量以承载业务值。 */
  searchable: boolean;
  search?: LootSearchProgressView;
/** items：定义该变量以承载业务值。 */
  items: LootWindowItemView[];
  emptyText?: string;
}

/** 拾取窗口状态 */
export interface LootWindowState {
/** tileX：定义该变量以承载业务值。 */
  tileX: number;
/** tileY：定义该变量以承载业务值。 */
  tileY: number;
/** title：定义该变量以承载业务值。 */
  title: string;
/** sources：定义该变量以承载业务值。 */
  sources: LootWindowSourceView[];
}

/** 装备槽位映射 */
export type EquipmentSlots = Record<EquipSlot, ItemStack | null>;

/** 突破材料需求 */
export interface BreakthroughItemRequirement {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** 突破需求类型 */
export type BreakthroughRequirementType = 'item' | 'technique' | 'attribute' | 'root';

/** 突破需求视图条目 */
export interface BreakthroughRequirementView {
/** id：定义该变量以承载业务值。 */
  id: string;
/** type：定义该变量以承载业务值。 */
  type: BreakthroughRequirementType;
/** label：定义该变量以承载业务值。 */
  label: string;
/** completed：定义该变量以承载业务值。 */
  completed: boolean;
/** hidden：定义该变量以承载业务值。 */
  hidden: boolean;
  optional?: boolean;
  blocksBreakthrough?: boolean;
  increasePct?: number;
  detail?: string;
}

/** 突破预览状态 */
export interface BreakthroughPreviewState {
/** targetRealmLv：定义该变量以承载业务值。 */
  targetRealmLv: number;
/** targetDisplayName：定义该变量以承载业务值。 */
  targetDisplayName: string;
/** totalRequirements：定义该变量以承载业务值。 */
  totalRequirements: number;
/** completedRequirements：定义该变量以承载业务值。 */
  completedRequirements: number;
/** allCompleted：定义该变量以承载业务值。 */
  allCompleted: boolean;
/** canBreakthrough：定义该变量以承载业务值。 */
  canBreakthrough: boolean;
/** blockingRequirements：定义该变量以承载业务值。 */
  blockingRequirements: number;
/** completedBlockingRequirements：定义该变量以承载业务值。 */
  completedBlockingRequirements: number;
/** requirements：定义该变量以承载业务值。 */
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
/** startLevel：定义该变量以承载业务值。 */
  startLevel: number;
  endLevel?: number;
/** gainPerLevel：定义该变量以承载业务值。 */
  gainPerLevel: number;
}

/** 功法六维成长曲线 */
export type TechniqueAttrCurves = Partial<Record<AttrKey, TechniqueAttrCurveSegment[]>>;

/** 功法单层配置 */
export interface TechniqueLayerDef {
/** level：定义该变量以承载业务值。 */
  level: number;
/** expToNext：定义该变量以承载业务值。 */
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
/** unlocked：定义该变量以承载业务值。 */
  unlocked: boolean;
/** severed：定义该变量以承载业务值。 */
  severed: ElementKey[];
/** roots：定义该变量以承载业务值。 */
  roots: HeavenGateRootValues | null;
/** entered：定义该变量以承载业务值。 */
  entered: boolean;
/** averageBonus：定义该变量以承载业务值。 */
  averageBonus: number;
}

/** 玩家大境界状态 */
export interface PlayerRealmState {
/** stage：定义该变量以承载业务值。 */
  stage: PlayerRealmStage;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** displayName：定义该变量以承载业务值。 */
  displayName: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** shortName：定义该变量以承载业务值。 */
  shortName: string;
/** path：定义该变量以承载业务值。 */
  path: 'martial' | 'immortal' | 'ascended';
/** narrative：定义该变量以承载业务值。 */
  narrative: string;
  review?: string;
/** lifespanYears：定义该变量以承载业务值。 */
  lifespanYears: number | null;
/** progress：定义该变量以承载业务值。 */
  progress: number;
/** progressToNext：定义该变量以承载业务值。 */
  progressToNext: number;
/** breakthroughReady：定义该变量以承载业务值。 */
  breakthroughReady: boolean;
  nextStage?: PlayerRealmStage;
/** breakthroughItems：定义该变量以承载业务值。 */
  breakthroughItems: BreakthroughItemRequirement[];
/** minTechniqueLevel：定义该变量以承载业务值。 */
  minTechniqueLevel: number;
  minTechniqueRealm?: TechniqueRealm;
  breakthrough?: BreakthroughPreviewState;
  heavenGate?: HeavenGateState | null;
}

/** 玩家特殊养成数值 */
export interface PlayerSpecialStats {
/** foundation：定义该变量以承载业务值。 */
  foundation: number;
/** combatExp：定义该变量以承载业务值。 */
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
  | 'target.debuffCount'
  | 'target.distance'
  | 'target.hp'
  | 'target.maxHp'
  | 'target.qi'
  | 'target.maxQi'
  | `caster.buff.${string}.stacks`
  | `target.buff.${string}.stacks`
  | `caster.attr.${AttrKey}`
  | `target.attr.${AttrKey}`
  | `caster.stat.${NumericScalarStatKey}`
  | `target.stat.${NumericScalarStatKey}`;

/** 技能公式（递归结构：常数/变量引用/运算表达式） */
export type SkillFormula =
  | number
  | {
/** var：定义该变量以承载业务值。 */
      var: SkillFormulaVar;
      scale?: number;
    }
  | {
/** op：定义该变量以承载业务值。 */
      op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max';
/** args：定义该变量以承载业务值。 */
      args: SkillFormula[];
    }
  | {
/** op：定义该变量以承载业务值。 */
      op: 'clamp';
/** value：定义该变量以承载业务值。 */
      value: SkillFormula;
      min?: SkillFormula;
      max?: SkillFormula;
    };

/** 技能目标选取定义 */
export interface SkillTargetingDef {
  shape?: TargetingShape;
  range?: number;
  radius?: number;
  innerRadius?: number;
  width?: number;
  height?: number;
  checkerParity?: 'even' | 'odd';
  maxTargets?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
}

/** 技能伤害效果定义 */
export interface SkillDamageEffectDef {
/** type：定义该变量以承载业务值。 */
  type: 'damage';
  damageKind?: SkillDamageKind;
  element?: ElementKey;
/** formula：定义该变量以承载业务值。 */
  formula: SkillFormula;
}

/** 技能治疗效果定义 */
export interface SkillHealEffectDef {
/** type：定义该变量以承载业务值。 */
  type: 'heal';
/** target：定义该变量以承载业务值。 */
  target: 'self' | 'target' | 'allies';
/** formula：定义该变量以承载业务值。 */
  formula: SkillFormula;
}

/** 技能 Buff 效果定义 */
export interface SkillBuffEffectDef {
/** type：定义该变量以承载业务值。 */
  type: 'buff';
/** target：定义该变量以承载业务值。 */
  target: 'self' | 'target' | 'allies';
/** buffId：定义该变量以承载业务值。 */
  buffId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
  desc?: string;
  shortMark?: string;
  category?: BuffCategory;
  visibility?: BuffVisibility;
  color?: string;
/** duration：定义该变量以承载业务值。 */
  duration: number;
  stacks?: number;
  maxStacks?: number;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
  presentationScale?: number;
  infiniteDuration?: boolean;
  sustainCost?: BuffSustainCostDef;
  expireWithBuffId?: string;
}

/** 技能净化效果定义 */
export interface SkillCleanseEffectDef {
/** type：定义该变量以承载业务值。 */
  type: 'cleanse';
/** target：定义该变量以承载业务值。 */
  target: 'self' | 'target';
  category?: BuffCategory;
  removeCount?: number;
}

/** 技能效果联合类型 */
export type SkillEffectDef = SkillDamageEffectDef | SkillHealEffectDef | SkillBuffEffectDef | SkillCleanseEffectDef;

/** 怪物技能前摇定义 */
export interface SkillMonsterCastDef {
  windupTicks?: number;
  warningColor?: string;
  conditions?: EquipmentConditionGroup;
}

/** 技能完整定义 */
export interface SkillDef {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** desc：定义该变量以承载业务值。 */
  desc: string;
/** cooldown：定义该变量以承载业务值。 */
  cooldown: number;
/** cost：定义该变量以承载业务值。 */
  cost: number;
  costMultiplier?: number;
/** range：定义该变量以承载业务值。 */
  range: number;
  targeting?: SkillTargetingDef;
/** effects：定义该变量以承载业务值。 */
  effects: SkillEffectDef[];
  unlockLevel?: number;
  unlockRealm?: TechniqueRealm;
  unlockPlayerRealm?: PlayerRealmStage;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
  monsterCast?: SkillMonsterCastDef;
}

/** 临时 Buff 状态（含属性和数值加成） */
export interface TemporaryBuffState extends VisibleBuffState {
  baseDesc?: string;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  presentationScale?: number;
  sustainCost?: BuffSustainCostDef;
  sustainTicksElapsed?: number;
  expireWithBuffId?: string;
}

/** 功法状态 */
export interface TechniqueState {
/** techId：定义该变量以承载业务值。 */
  techId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** level：定义该变量以承载业务值。 */
  level: number;
/** exp：定义该变量以承载业务值。 */
  exp: number;
/** expToNext：定义该变量以承载业务值。 */
  expToNext: number;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** realm：定义该变量以承载业务值。 */
  realm: TechniqueRealm;
  skillsEnabled?: boolean;
/** skills：定义该变量以承载业务值。 */
  skills: SkillDef[];
  grade?: TechniqueGrade;
  category?: TechniqueCategory;
  layers?: TechniqueLayerDef[];
  attrCurves?: TechniqueAttrCurves;
}

/** 炼体状态 */
export interface BodyTrainingState {
/** level：定义该变量以承载业务值。 */
  level: number;
/** exp：定义该变量以承载业务值。 */
  exp: number;
/** expToNext：定义该变量以承载业务值。 */
  expToNext: number;
}

/** 行动类型 */
export type ActionType = 'skill' | 'gather' | 'interact' | 'quest' | 'toggle' | 'battle' | 'travel' | 'breakthrough';

/** 自动战斗技能配置 */
export interface AutoBattleSkillConfig {
/** skillId：定义该变量以承载业务值。 */
  skillId: string;
/** enabled：定义该变量以承载业务值。 */
  enabled: boolean;
  skillEnabled?: boolean;
}

/** 行动定义 */
export interface ActionDef {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: ActionType;
/** desc：定义该变量以承载业务值。 */
  desc: string;
/** cooldownLeft：定义该变量以承载业务值。 */
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
/** type：定义该变量以承载业务值。 */
  type: 'attack';
/** fromX：定义该变量以承载业务值。 */
  fromX: number;
/** fromY：定义该变量以承载业务值。 */
  fromY: number;
/** toX：定义该变量以承载业务值。 */
  toX: number;
/** toY：定义该变量以承载业务值。 */
  toY: number;
  color?: string;
}

/** 战斗飘字特效 */
export interface CombatEffectFloat {
/** type：定义该变量以承载业务值。 */
  type: 'float';
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** text：定义该变量以承载业务值。 */
  text: string;
  color?: string;
  variant?: 'damage' | 'action';
  actionStyle?: 'default' | 'divine' | 'chant';
  durationMs?: number;
}

/** 战斗地块警戒特效 */
export interface CombatEffectWarningZone {
/** type：定义该变量以承载业务值。 */
  type: 'warning_zone';
/** cells：定义该变量以承载业务值。 */
  cells: GridPoint[];
  color?: string;
  baseColor?: string;
  originX?: number;
  originY?: number;
  durationMs?: number;
}

/** 战斗特效联合类型 */
export type CombatEffect = CombatEffectAttack | CombatEffectFloat | CombatEffectWarningZone;

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
/** id：定义该变量以承载业务值。 */
  id: string;
/** title：定义该变量以承载业务值。 */
  title: string;
/** desc：定义该变量以承载业务值。 */
  desc: string;
/** line：定义该变量以承载业务值。 */
  line: QuestLine;
  chapter?: string;
  story?: string;
/** status：定义该变量以承载业务值。 */
  status: QuestStatus;
/** objectiveType：定义该变量以承载业务值。 */
  objectiveType: QuestObjectiveType;
  objectiveText?: string;
/** progress：定义该变量以承载业务值。 */
  progress: number;
/** required：定义该变量以承载业务值。 */
  required: number;
/** targetName：定义该变量以承载业务值。 */
  targetName: string;
  targetTechniqueId?: string;
  targetRealmStage?: PlayerRealmStage;
/** rewardText：定义该变量以承载业务值。 */
  rewardText: string;
/** targetMonsterId：定义该变量以承载业务值。 */
  targetMonsterId: string;
/** rewardItemId：定义该变量以承载业务值。 */
  rewardItemId: string;
/** rewardItemIds：定义该变量以承载业务值。 */
  rewardItemIds: string[];
/** rewards：定义该变量以承载业务值。 */
  rewards: ItemStack[];
  nextQuestId?: string;
  requiredItemId?: string;
  requiredItemCount?: number;
/** giverId：定义该变量以承载业务值。 */
  giverId: string;
/** giverName：定义该变量以承载业务值。 */
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

/** QuestNavigationState：定义该接口的能力与字段约束。 */
export interface QuestNavigationState {
/** questId：定义该变量以承载业务值。 */
  questId: string;
  pendingConfirmation?: boolean;
  pausedForCrossMapCooldown?: boolean;
  lastBlockedRemainingTicks?: number;
}

/** PendingLogbookMessage：定义该接口的能力与字段约束。 */
export interface PendingLogbookMessage {
/** id：定义该变量以承载业务值。 */
  id: string;
/** kind：定义该变量以承载业务值。 */
  kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge';
/** text：定义该变量以承载业务值。 */
  text: string;
  from?: string;
/** at：定义该变量以承载业务值。 */
  at: number;
}

/** 玩家状态 */
export interface PlayerState {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
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
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** facing：定义该变量以承载业务值。 */
  facing: Direction;
/** viewRange：定义该变量以承载业务值。 */
  viewRange: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** qi：定义该变量以承载业务值。 */
  qi: number;
/** dead：定义该变量以承载业务值。 */
  dead: boolean;
  foundation?: number;
  combatExp?: number;
/** baseAttrs：定义该变量以承载业务值。 */
  baseAttrs: Attributes;
/** bonuses：定义该变量以承载业务值。 */
  bonuses: AttrBonus[];
  temporaryBuffs?: TemporaryBuffState[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
/** inventory：定义该变量以承载业务值。 */
  inventory: Inventory;
  marketStorage?: MarketStorage;
/** equipment：定义该变量以承载业务值。 */
  equipment: EquipmentSlots;
/** techniques：定义该变量以承载业务值。 */
  techniques: TechniqueState[];
  bodyTraining?: BodyTrainingState;
/** actions：定义该变量以承载业务值。 */
  actions: ActionDef[];
/** quests：定义该变量以承载业务值。 */
  quests: QuestState[];
/** autoBattle：定义该变量以承载业务值。 */
  autoBattle: boolean;
/** autoBattleSkills：定义该变量以承载业务值。 */
  autoBattleSkills: AutoBattleSkillConfig[];
  combatTargetId?: string;
  combatTargetLocked?: boolean;
  cultivatingTechId?: string;
  pendingLogbookMessages?: PendingLogbookMessage[];
  idleTicks?: number;
  revealedBreakthroughRequirementIds?: string[];
  unlockedMinimapIds?: string[];
  realm?: PlayerRealmState;
  questNavigation?: QuestNavigationState;
  questCrossMapNavCooldownUntilLifeTicks?: number;
  alchemySkill?: AlchemySkillState;
}

/** 意见状态 */
export type SuggestionStatus = 'pending' | 'completed';

/** 意见回复作者类型 */
export type SuggestionReplyAuthorType = 'author' | 'gm';

/** 意见回复数据结构 */
export interface SuggestionReply {
/** id：定义该变量以承载业务值。 */
  id: string;
/** authorType：定义该变量以承载业务值。 */
  authorType: SuggestionReplyAuthorType;
/** authorId：定义该变量以承载业务值。 */
  authorId: string;
/** authorName：定义该变量以承载业务值。 */
  authorName: string;
/** content：定义该变量以承载业务值。 */
  content: string;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
}

/** 意见数据结构 */
export interface Suggestion {
/** id：定义该变量以承载业务值。 */
  id: string;
/** authorId：定义该变量以承载业务值。 */
  authorId: string;
/** authorName：定义该变量以承载业务值。 */
  authorName: string;
/** title：定义该变量以承载业务值。 */
  title: string;
/** description：定义该变量以承载业务值。 */
  description: string;
/** status：定义该变量以承载业务值。 */
  status: SuggestionStatus;
  upvotes: string[]; // 存储玩家 ID
  downvotes: string[]; // 存储玩家 ID
/** replies：定义该变量以承载业务值。 */
  replies: SuggestionReply[];
/** authorLastReadGmReplyAt：定义该变量以承载业务值。 */
  authorLastReadGmReplyAt: number;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
}

/** 意见分页结果 */
export interface SuggestionPage {
/** items：定义该变量以承载业务值。 */
  items: Suggestion[];
/** total：定义该变量以承载业务值。 */
  total: number;
/** page：定义该变量以承载业务值。 */
  page: number;
/** pageSize：定义该变量以承载业务值。 */
  pageSize: number;
/** totalPages：定义该变量以承载业务值。 */
  totalPages: number;
/** keyword：定义该变量以承载业务值。 */
  keyword: string;
}

/** 邮件列表过滤 */
export type MailFilter = 'all' | 'unread' | 'claimable';

/** 邮件附件 */
export interface MailAttachment {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** 邮件正文模板参数 */
export type MailTemplateArg =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'item'; itemId: string; label?: string; count?: number };

/** 邮件概览摘要 */
export interface MailSummaryView {
/** unreadCount：定义该变量以承载业务值。 */
  unreadCount: number;
/** claimableCount：定义该变量以承载业务值。 */
  claimableCount: number;
/** revision：定义该变量以承载业务值。 */
  revision: number;
}

/** 邮件列表条目 */
export interface MailListEntryView {
/** mailId：定义该变量以承载业务值。 */
  mailId: string;
/** title：定义该变量以承载业务值。 */
  title: string;
/** summary：定义该变量以承载业务值。 */
  summary: string;
/** senderLabel：定义该变量以承载业务值。 */
  senderLabel: string;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
  expireAt?: number | null;
/** hasAttachments：定义该变量以承载业务值。 */
  hasAttachments: boolean;
/** read：定义该变量以承载业务值。 */
  read: boolean;
/** claimed：定义该变量以承载业务值。 */
  claimed: boolean;
}

/** 邮件分页结果 */
export interface MailPageView {
/** items：定义该变量以承载业务值。 */
  items: MailListEntryView[];
/** total：定义该变量以承载业务值。 */
  total: number;
/** page：定义该变量以承载业务值。 */
  page: number;
/** pageSize：定义该变量以承载业务值。 */
  pageSize: number;
/** totalPages：定义该变量以承载业务值。 */
  totalPages: number;
/** filter：定义该变量以承载业务值。 */
  filter: MailFilter;
}

/** 邮件详情 */
export interface MailDetailView {
/** mailId：定义该变量以承载业务值。 */
  mailId: string;
/** senderLabel：定义该变量以承载业务值。 */
  senderLabel: string;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
  expireAt?: number | null;
  templateId?: string | null;
/** args：定义该变量以承载业务值。 */
  args: MailTemplateArg[];
  fallbackTitle?: string | null;
  fallbackBody?: string | null;
/** attachments：定义该变量以承载业务值。 */
  attachments: MailAttachment[];
/** read：定义该变量以承载业务值。 */
  read: boolean;
/** claimed：定义该变量以承载业务值。 */
  claimed: boolean;
/** deletable：定义该变量以承载业务值。 */
  deletable: boolean;
}
