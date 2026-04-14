/**
 * 内容数据服务：加载并管理功法、物品、境界、突破等静态配置
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  applyEnhancementToItemStack,
  compileValueStatsToActualStats,
  createItemStackSignature,
  ATTR_KEYS,
  AttrKey,
  Attributes,
  BuffModifierMode,
  DEFAULT_INVENTORY_CAPACITY,
  ELEMENT_KEYS,
  ElementKey,
  EquipmentConditionDef,
  EquipmentConditionGroup,
  EquipmentEffectDef,
  EquipmentTrigger,
  EquipmentSlots,
  EquipSlot,
  EQUIP_SLOTS,
  Inventory,
  ItemType,
  ItemStack,
  MonsterAggroMode,
  MonsterCombatModel,
  MonsterInitialBuffDef,
  MonsterTier,
  NUMERIC_SCALAR_STAT_KEYS,
  NumericStatPercentages,
  NumericStats,
  PlayerRealmStage,
  PartialNumericStats,
  QiElementKey,
  QiFamilyKey,
  QiFormKey,
  QiProjectionModifier,
  QI_ELEMENT_KEYS,
  QI_FAMILY_KEYS,
  QI_FORM_KEYS,
  scaleTechniqueExp,
  calculateTechniqueSkillQiCost,
  SkillDef,
  SkillEffectDef,
  SkillFormula,
  TileType,
  TechniqueCategory,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueRealm,
  TimePhaseId,
  TECHNIQUE_GRADE_ORDER,
  createMonsterAutoStatPercents,
  ConsumableBuffDef,
  DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS,
  inferMonsterAttrsFromNumericStats,
  inferMonsterValueStatsFromLegacy,
  normalizeMonsterAttrs,
  normalizeMonsterStatPercents,
  normalizeMonsterTier,
  inferMonsterTierFromName,
  resolveMonsterExpMultiplier,
  resolveMonsterNumericStatsFromAttributes,
  resolveSkillUnlockLevel,
  resolveMonsterNumericStatsFromValueStats,
  normalizeEnhanceLevel,
} from '@mud/shared';
import {
  EQUIPMENT_TRIGGERS,
  PLAYER_REALM_STAGE_LEVEL_RANGES,
  TIME_PHASE_IDS,
} from '../constants/gameplay/content';
import { normalizeBuffSustainCost } from './buff-sustain';
import { resolveServerDataPath } from '../common/data-path';

/** TechniqueTemplate：定义该接口的能力与字段约束。 */
interface TechniqueTemplate {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** skills：定义该变量以承载业务值。 */
  skills: SkillDef[];
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
/** category：定义该变量以承载业务值。 */
  category: TechniqueCategory;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** layers：定义该变量以承载业务值。 */
  layers: TechniqueLayerDef[];
}

/** ItemTemplate：定义该接口的能力与字段约束。 */
interface ItemTemplate extends Omit<ItemStack, 'count'> {
  learnTechniqueId?: string;
  healAmount?: number;
  healPercent?: number;
  qiPercent?: number;
  consumeBuffs?: ConsumableBuffDef[];
  respawnBindMapId?: string;
  spiritualRootSeedTier?: 'heaven' | 'divine';
}

/** EditorTechniqueCatalogEntry：定义该接口的能力与字段约束。 */
export interface EditorTechniqueCatalogEntry {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
/** category：定义该变量以承载业务值。 */
  category: TechniqueCategory;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** skills：定义该变量以承载业务值。 */
  skills: SkillDef[];
/** layers：定义该变量以承载业务值。 */
  layers: TechniqueLayerDef[];
}

/** EditorItemCatalogEntry：定义该接口的能力与字段约束。 */
export interface EditorItemCatalogEntry {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: ItemStack['type'];
  groundLabel?: string;
  grade?: TechniqueGrade;
  level?: number;
  equipSlot?: ItemStack['equipSlot'];
  desc?: string;
  equipAttrs?: ItemStack['equipAttrs'];
  equipStats?: ItemStack['equipStats'];
  equipValueStats?: ItemStack['equipValueStats'];
  tags?: string[];
  effects?: EquipmentEffectDef[];
  healAmount?: number;
  healPercent?: number;
  qiPercent?: number;
  cooldown?: number;
  consumeBuffs?: ConsumableBuffDef[];
  enhanceLevel?: number;
  alchemySuccessRate?: number;
  alchemySpeedRate?: number;
  enhancementSuccessRate?: number;
  enhancementSpeedRate?: number;
  respawnBindMapId?: string;
  mapUnlockId?: string;
  mapUnlockIds?: string[];
  tileAuraGainAmount?: number;
  allowBatchUse?: boolean;
}

/** StarterInventoryEntry：定义该接口的能力与字段约束。 */
interface StarterInventoryEntry {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
  count?: number;
}

/** MonsterTemplateDrop：定义该接口的能力与字段约束。 */
export interface MonsterTemplateDrop {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: ItemType;
/** count：定义该变量以承载业务值。 */
  count: number;
  chance?: number;
}

/** MonsterDropContext：定义该接口的能力与字段约束。 */
interface MonsterDropContext {
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
/** tier：定义该变量以承载业务值。 */
  tier: MonsterTier;
  level?: number;
  monsterId?: string;
}

/** MonsterTemplate：定义该接口的能力与字段约束。 */
export interface MonsterTemplate {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
/** attrs：定义该变量以承载业务值。 */
  attrs: Attributes;
/** equipment：定义该变量以承载业务值。 */
  equipment: EquipmentSlots;
  statPercents?: NumericStatPercentages;
  initialBuffs?: MonsterInitialBuffDef[];
/** skills：定义该变量以承载业务值。 */
  skills: string[];
/** tier：定义该变量以承载业务值。 */
  tier: MonsterTier;
  valueStats?: PartialNumericStats;
/** numericStats：定义该变量以承载业务值。 */
  numericStats: NumericStats;
/** combatModel：定义该变量以承载业务值。 */
  combatModel: MonsterCombatModel;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** attack：定义该变量以承载业务值。 */
  attack: number;
/** count：定义该变量以承载业务值。 */
  count: number;
/** radius：定义该变量以承载业务值。 */
  radius: number;
/** maxAlive：定义该变量以承载业务值。 */
  maxAlive: number;
/** aggroRange：定义该变量以承载业务值。 */
  aggroRange: number;
/** viewRange：定义该变量以承载业务值。 */
  viewRange: number;
/** aggroMode：定义该变量以承载业务值。 */
  aggroMode: MonsterAggroMode;
/** respawnTicks：定义该变量以承载业务值。 */
  respawnTicks: number;
  level?: number;
/** expMultiplier：定义该变量以承载业务值。 */
  expMultiplier: number;
/** drops：定义该变量以承载业务值。 */
  drops: MonsterTemplateDrop[];
}

/** ContainerLootPoolQuery：定义该接口的能力与字段约束。 */
export interface ContainerLootPoolQuery {
  minLevel?: number;
  maxLevel?: number;
  minGrade?: TechniqueGrade;
  maxGrade?: TechniqueGrade;
  tagGroups?: string[][];
}

/** RawSkillDef：定义该接口的能力与字段约束。 */
interface RawSkillDef extends Omit<SkillDef, 'unlockRealm' | 'unlockPlayerRealm' | 'effects' | 'cost'> {
/** effects：定义该变量以承载业务值。 */
  effects: unknown;
  cost?: number;
  costMultiplier?: number;
  unlockRealm?: keyof typeof TechniqueRealm | TechniqueRealm;
  unlockPlayerRealm?: keyof typeof PlayerRealmStage | PlayerRealmStage;
}

/** RawSharedTechniqueBuffDef：定义该接口的能力与字段约束。 */
interface RawSharedTechniqueBuffDef {
/** id：定义该变量以承载业务值。 */
  id: string;
  target?: 'self' | 'target';
  buffId?: string;
  name?: string;
  desc?: string;
  shortMark?: string;
  category?: 'buff' | 'debuff';
  visibility?: 'public' | 'observe_only' | 'hidden';
  color?: string;
  duration?: number;
  maxStacks?: number;
  attrs?: unknown;
  attrMode?: BuffModifierMode;
  stats?: unknown;
  statMode?: BuffModifierMode;
  qiProjection?: unknown;
  valueStats?: unknown;
  presentationScale?: number;
  infiniteDuration?: boolean;
  sustainCost?: unknown;
  expireWithBuffId?: string;
}

/** RawItemTemplate：定义该接口的能力与字段约束。 */
interface RawItemTemplate extends Omit<ItemTemplate, 'equipStats' | 'equipValueStats' | 'effects' | 'consumeBuffs'> {
  equipStats?: unknown;
  equipValueStats?: unknown;
  effects?: unknown;
  consumeBuffs?: unknown;
}

/** RawMonsterTemplate：定义该接口的能力与字段约束。 */
interface RawMonsterTemplate extends Omit<MonsterTemplate, 'grade' | 'attrs' | 'equipment' | 'statPercents' | 'initialBuffs' | 'skills' | 'tier' | 'valueStats' | 'numericStats' | 'combatModel' | 'hp' | 'maxHp' | 'attack' | 'count' | 'radius' | 'maxAlive' | 'aggroRange' | 'viewRange' | 'aggroMode' | 'respawnTicks' | 'expMultiplier' | 'drops'> {
  grade?: TechniqueGrade;
  attrs?: Partial<Attributes>;
  equipment?: unknown;
  statPercents?: NumericStatPercentages;
  initialBuffs?: unknown;
  skills?: unknown;
  tier?: MonsterTier;
  valueStats?: unknown;
  hp?: number;
  maxHp?: number;
  attack?: number;
  count?: number;
  radius?: number;
  maxAlive?: number;
  aggroRange?: number;
  viewRange?: number;
  aggroMode?: MonsterAggroMode;
  respawnSec?: number;
  respawnTicks?: number;
  expMultiplier?: number;
  drops?: MonsterTemplateDrop[];
}

/** RawTechniqueLayerDef：定义该接口的能力与字段约束。 */
interface RawTechniqueLayerDef extends Omit<TechniqueLayerDef, 'expToNext'> {
  expToNext?: number;
  expFactor?: number;
}

/** RawTechniqueTemplate：定义该接口的能力与字段约束。 */
interface RawTechniqueTemplate {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
  category?: TechniqueCategory;
  realmLv?: number;
/** layers：定义该变量以承载业务值。 */
  layers: RawTechniqueLayerDef[];
/** skills：定义该变量以承载业务值。 */
  skills: RawSkillDef[];
}

/** RealmSegmentId：定义该类型的结构与数据语义。 */
type RealmSegmentId = 'martial' | 'immortal' | 'ascended';

/** RealmLevelEntry：定义该接口的能力与字段约束。 */
export interface RealmLevelEntry {
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** displayName：定义该变量以承载业务值。 */
  displayName: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** phaseName：定义该变量以承载业务值。 */
  phaseName: string | null;
/** segment：定义该变量以承载业务值。 */
  segment: RealmSegmentId;
/** path：定义该变量以承载业务值。 */
  path: RealmSegmentId;
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
/** gradeLabel：定义该变量以承载业务值。 */
  gradeLabel: string;
/** review：定义该变量以承载业务值。 */
  review: string;
/** lifespanYears：定义该变量以承载业务值。 */
  lifespanYears: number;
  expToNext?: number;
}

/** RealmLevelBand：定义该接口的能力与字段约束。 */
interface RealmLevelBand {
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
/** gradeLabel：定义该变量以承载业务值。 */
  gradeLabel: string;
/** levelFrom：定义该变量以承载业务值。 */
  levelFrom: number;
/** levelTo：定义该变量以承载业务值。 */
  levelTo: number;
}

/** RealmLevelSegment：定义该接口的能力与字段约束。 */
interface RealmLevelSegment {
/** id：定义该变量以承载业务值。 */
  id: RealmSegmentId;
/** label：定义该变量以承载业务值。 */
  label: string;
/** levelFrom：定义该变量以承载业务值。 */
  levelFrom: number;
/** levelTo：定义该变量以承载业务值。 */
  levelTo: number;
/** rule：定义该变量以承载业务值。 */
  rule: string;
}

/** RealmLevelsConfig：定义该接口的能力与字段约束。 */
interface RealmLevelsConfig {
/** version：定义该变量以承载业务值。 */
  version: number;
/** baseLevelKey：定义该变量以承载业务值。 */
  baseLevelKey: string;
  expMultiplier?: number;
/** gradeSpan：定义该变量以承载业务值。 */
  gradeSpan: number;
/** immortalStageSpan：定义该变量以承载业务值。 */
  immortalStageSpan: number;
/** segments：定义该变量以承载业务值。 */
  segments: RealmLevelSegment[];
/** gradeBands：定义该变量以承载业务值。 */
  gradeBands: RealmLevelBand[];
/** levels：定义该变量以承载业务值。 */
  levels: RealmLevelEntry[];
}

/** RawBreakthroughItemRequirement：定义该类型的结构与数据语义。 */
type RawBreakthroughItemRequirement = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** type：定义该变量以承载业务值。 */
  type: 'item';
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** count：定义该变量以承载业务值。 */
  count: number;
  label?: string;
  hidden?: boolean;
  increaseAttrRequirementPct?: number;
};

/** RawBreakthroughTechniqueRequirement：定义该类型的结构与数据语义。 */
type RawBreakthroughTechniqueRequirement = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** type：定义该变量以承载业务值。 */
  type: 'technique';
  techniqueId?: string;
  minGrade?: TechniqueGrade;
  minLevel?: number;
  minRealm?: keyof typeof TechniqueRealm | TechniqueRealm;
  count?: number;
  label?: string;
  hidden?: boolean;
  increaseAttrRequirementPct?: number;
};

/** RawBreakthroughAttributeRequirement：定义该类型的结构与数据语义。 */
type RawBreakthroughAttributeRequirement = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** type：定义该变量以承载业务值。 */
  type: 'attribute';
/** attr：定义该变量以承载业务值。 */
  attr: AttrKey;
/** minValue：定义该变量以承载业务值。 */
  minValue: number;
  label?: string;
  hidden?: boolean;
};

/** RawBreakthroughRootRequirement：定义该类型的结构与数据语义。 */
type RawBreakthroughRootRequirement = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** type：定义该变量以承载业务值。 */
  type: 'root';
  element?: ElementKey;
/** minValue：定义该变量以承载业务值。 */
  minValue: number;
  label?: string;
  hidden?: boolean;
};

/** RawBreakthroughRequirement：定义该类型的结构与数据语义。 */
type RawBreakthroughRequirement =
  | RawBreakthroughItemRequirement
  | RawBreakthroughTechniqueRequirement
  | RawBreakthroughAttributeRequirement
  | RawBreakthroughRootRequirement;

/** BreakthroughRequirementDef：定义该类型的结构与数据语义。 */
export type BreakthroughRequirementDef =
  | RawBreakthroughItemRequirement
  | (Omit<RawBreakthroughTechniqueRequirement, 'minRealm'> & { minRealm?: TechniqueRealm })
  | RawBreakthroughAttributeRequirement
  | RawBreakthroughRootRequirement;

/** BreakthroughConfigEntry：定义该接口的能力与字段约束。 */
export interface BreakthroughConfigEntry {
/** fromRealmLv：定义该变量以承载业务值。 */
  fromRealmLv: number;
/** toRealmLv：定义该变量以承载业务值。 */
  toRealmLv: number;
  title?: string;
/** requirements：定义该变量以承载业务值。 */
  requirements: BreakthroughRequirementDef[];
}

/** BreakthroughConfigFile：定义该接口的能力与字段约束。 */
interface BreakthroughConfigFile {
/** version：定义该变量以承载业务值。 */
  version: number;
  transitions: Array<{
/** fromRealmLv：定义该变量以承载业务值。 */
    fromRealmLv: number;
    toRealmLv?: number;
    title?: string;
    requirements?: RawBreakthroughRequirement[];
  }>;
}

/** isPlainObject：执行对应的业务逻辑。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** normalizeStringArray：执行对应的业务逻辑。 */
function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
/** normalized：定义该变量以承载业务值。 */
  const normalized = [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim()))];
  return normalized.length > 0 ? normalized : undefined;
}

/** normalizeQiKeyArray：执行对应的业务逻辑。 */
function normalizeQiKeyArray<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
/** normalized：定义该变量以承载业务值。 */
  const normalized = [...new Set(value.filter((entry): entry is T => typeof entry === 'string' && allowed.includes(entry as T)))];
  return normalized.length > 0 ? normalized : undefined;
}

/** ITEM_TYPE_TAGS：定义该变量以承载业务值。 */
const ITEM_TYPE_TAGS: Record<ItemType, string[]> = {
  consumable: ['消耗品'],
  equipment: ['装备'],
  material: ['材料'],
  quest_item: ['任务物品'],
  skill_book: ['功法', '书籍'],
};

/** EQUIP_SLOT_TAGS：定义该变量以承载业务值。 */
const EQUIP_SLOT_TAGS: Record<EquipSlot, string[]> = {
  weapon: ['武器'],
  head: ['护甲', '头部护甲'],
  body: ['护甲', '身甲'],
  legs: ['护甲', '腿部护甲'],
  accessory: ['饰品'],
};

/** ITEM_TAG_OVERRIDES：定义该变量以承载业务值。 */
const ITEM_TAG_OVERRIDES: Partial<Record<string, string[]>> = {
  'pill.minor_heal': ['基础药品', '外伤药'],
  minor_qi_pill: ['疗伤丹'],
  major_qi_pill: ['疗伤丹'],
  pure_yang_pill: ['疗伤丹'],
  frost_heart_paste: ['外伤药'],
  spirit_stone: ['资源'],
  serpent_gall: ['蛇胆'],
  spider_silk: ['蛛丝'],
  black_iron_chunk: ['玄铁'],
  spirit_iron_fragment: ['灵铁'],
  bandit_insignia: ['匪物'],
  'equip.rust_saber': ['旧兵器'],
  'book_wind_step': ['轻身'],
  'book.iron_bone_art': ['炼体'],
};

/** LEGACY_ITEM_ID_ALIASES：定义该变量以承载业务值。 */
const LEGACY_ITEM_ID_ALIASES: Record<string, string> = {
  'equip.road_cleaver': 'equip.broken_rune_blade',
  'equip.rust_saber': 'equip.broken_rune_blade',
  'equip.bone_dagger': 'equip.broken_rune_blade',
  'equip.scavenger_fang': 'equip.broken_rune_blade',
  'equip.black_iron_sword': 'equip.orebreak_hammer',
  'equip.crystal_maw_spike': 'equip.orebreak_hammer',
  'equip.grassbound_shoes': 'equip.trench_runner_boots',
  'equip.step_boots': 'equip.trench_runner_boots',
  'equip.gutter_paws': 'equip.trench_runner_boots',
  'equip.ash_tread': 'equip.trench_runner_boots',
  'equip.cave_skitter_spurs': 'equip.trench_runner_boots',
  'equip.trace_pattern_boots': 'equip.trench_runner_boots',
  'equip.porter_jacket': 'equip.herb_mist_robe',
  'equip.bound_chest': 'equip.herb_mist_robe',
  'equip.scrap_hide': 'equip.herb_mist_robe',
  'equip.hunter_cap': 'equip.gate_headcloth',
  'equip.scavenger_crest': 'equip.gate_headcloth',
  'equip.wasteland_cap': 'equip.gate_headcloth',
  'equip.miner_helmet': 'equip.soot_lamp_hood',
  'equip.remnant_array_crown': 'equip.soot_lamp_hood',
  'equip.oreplate_carapace': 'equip.rift_guard_armor',
  'equip.blackiron_brigandine': 'equip.rift_guard_armor',
  'equip.rune_robe': 'equip.rift_guard_armor',
  'equip.stele_shell_armor': 'equip.rift_guard_armor',
  'equip.herb_basket_charm': 'equip.gather_qi_pendant',
  'equip.marsh_poison_gland': 'equip.gather_qi_pendant',
  'equip.orevein_ring': 'equip.gather_qi_pendant',
  'equip.pattern_picker_ring': 'equip.gather_qi_pendant',
  'equip.mineral_pulse_core': 'equip.soul_devour_token',
  'equip.echo_crystal_crest': 'equip.soul_devour_token',
  'equip.soul_ink_pendant': 'equip.soul_devour_token',
  'equip.bamboo_fang_blade': 'equip.vineguide_staff',
  'equip.bamboo_split_blade': 'equip.vineguide_staff',
  'equip.leafshadow_crest': 'equip.verdant_crown',
  'equip.bamboo_hat': 'equip.verdant_crown',
  'equip.windjoint_boots': 'equip.scar_tread_boots',
  'equip.dewstep_boots': 'equip.scar_tread_boots',
  'equip.vale_stride_boots': 'equip.scar_tread_boots',
  'equip.snakeshed_vest': 'equip.cleantide_robe',
  'equip.returnvine_robe': 'equip.cleantide_robe',
  'equip.bamboo_heart_charm': 'equip.returnbreath_copper_pendant',
  'equip.lifepulse_pendant': 'equip.returnbreath_copper_pendant',
  'equip.liyan_crown': 'equip.verdant_crown',
  'equip.firestride_boots': 'equip.scar_tread_boots',
  'equip.scorchcourt_battlecoat': 'equip.cleft_blade_cloak',
  'equip.moonwell_gauze_crown': 'equip.yuetown_mask',
  'equip.dew_tide_pendant': 'equip.returnbreath_copper_pendant',
  'equip.mistwalker_boots': 'equip.returnarray_boots',
  'equip.fiveqi_watch_crown': 'equip.yuetown_mask',
  'equip.guizang_aperture_robe': 'equip.mountainseal_plate',
  'equip.halfbase_ring': 'equip.deepvein_core',
  'equip.yellow_stone_browguard': 'equip.mount_guard_helm',
  'equip.stone_ridge_helm': 'equip.mount_guard_helm',
  'equip.heavystele_helm': 'equip.mount_guard_helm',
  'equip.earthlord_helm': 'equip.mount_guard_helm',
  'equip.ridgehide_vest': 'equip.mountainseal_plate',
  'equip.deepvein_plate': 'equip.mountainseal_plate',
  'equip.terrace_guard_armor': 'equip.mountainseal_plate',
  'equip.loadstone_plate': 'equip.mountainseal_plate',
  'equip.rampart_plate': 'equip.mountainseal_plate',
  'equip.heavy_claw_boots': 'equip.returnarray_boots',
  'equip.burden_greaves': 'equip.returnarray_boots',
  'equip.sinking_vein_hammer': 'equip.ridgecleft_halberd',
  'equip.yuepattern_pole': 'equip.ridgecleft_halberd',
  'equip.burden_stele_staff': 'equip.ridgecleft_halberd',
  'equip.darkpeak_fist_seal': 'equip.ridgecleft_halberd',
  'equip.mountainheart_token': 'equip.deepvein_core',
  'equip.quakeheart_stone': 'equip.deepvein_core',
  'equip.sealridge_iron_ring': 'equip.deepvein_core',
  'equip.cleft_short_blade': 'equip.full_edge_blade',
  'equip.stele_edge_blade': 'equip.full_edge_blade',
  'equip.sand_edge_headband': 'equip.sand_ghost_mask',
  'equip.stele_pattern_helm': 'equip.sand_ghost_mask',
  'equip.cleft_long_halberd': 'equip.ridgecleft_halberd',
  'equip.banner_war_halberd': 'equip.ridgecleft_halberd',
  'equip.remnant_banner_spear': 'equip.ridgecleft_halberd',
  'equip.gold_sand_cuirass': 'equip.cleft_blade_cloak',
  'equip.cleft_scale_armor': 'equip.cleft_blade_cloak',
  'equip.edge_core_shell': 'equip.cleft_blade_cloak',
  'equip.old_guard_iron_armor': 'equip.mountainseal_plate',
  'equip.gold_coffin_plate': 'equip.mountainseal_plate',
  'equip.iron_track_boots': 'equip.chasing_edge_boots',
  'equip.gold_sand_talisman': 'equip.furnace_red_ring',
  'equip.edge_command_token': 'equip.furnace_red_ring',
  'equip.counter_shock_iron_ring': 'equip.furnace_red_ring',
  'equip.sealed_edge_stoneheart': 'equip.furnace_red_ring',
  'equip.remnant_banner_helm': 'equip.mount_guard_helm',
  'equip.bent_flag_heavy_helm': 'equip.mount_guard_helm',
  'equip.tomb_gate_general_helm': 'equip.mount_guard_helm',
  'equip.valley_fang_blade': 'equip.ridgecleft_halberd',
  'equip.starfall_spear': 'equip.ember_scorch_spear',
  'equip.windhear_crown': 'equip.mount_guard_helm',
  'equip.celestial_crown': 'equip.mount_guard_helm',
  'equip.beastbone_mail': 'equip.mountainseal_plate',
  'equip.ridge_calm_robe': 'equip.mountainseal_plate',
  'equip.predator_tendon_boots': 'equip.returnarray_boots',
  'equip.threshold_boots': 'equip.returnarray_boots',
  'equip.spirit_ring': 'equip.deepvein_core',
  'equip.guiding_marrow_pendant': 'equip.deepvein_core',
  'equip.void_talisman': 'equip.deepvein_core',
  'equip.bloodcore_talisman': 'equip.deepvein_core',
};

/** CULTIVATION_PILL_ITEM_IDS：定义该变量以承载业务值。 */
const CULTIVATION_PILL_ITEM_IDS = new Set([
  'pill.bitter_cultivation_elixir',
  'pill.guiding_powder',
  'pill.fivephase_harmony_pellet',
  'pill.shatter_spirit',
  'pill.wangsheng',
]);

/** isMedicineItem：执行对应的业务逻辑。 */
function isMedicineItem(item: ItemTemplate): boolean {
  return item.type === 'consumable'
    && (
      typeof item.healAmount === 'number'
      || typeof item.healPercent === 'number'
      || typeof item.qiPercent === 'number'
      || (item.consumeBuffs?.length ?? 0) > 0
      || /丹|散|膏|药|丸|液/.test(item.name)
    );
}

/** isCultivationPill：执行对应的业务逻辑。 */
function isCultivationPill(item: ItemTemplate): boolean {
  if (!isMedicineItem(item)) {
    return false;
  }
  if (CULTIVATION_PILL_ITEM_IDS.has(item.itemId)) {
    return true;
  }
  return (item.consumeBuffs ?? []).some((buff) => {
/** valueStats：定义该变量以承载业务值。 */
    const valueStats = buff.valueStats;
    return typeof valueStats?.realmExpPerTick === 'number'
      || typeof valueStats?.techniqueExpPerTick === 'number';
  });
}

/** isHealthRestoreMedicine：执行对应的业务逻辑。 */
function isHealthRestoreMedicine(item: ItemTemplate): boolean {
  return isMedicineItem(item)
    && (item.healAmount ?? 0) + (item.healPercent ?? 0) > 0
    && (item.qiPercent ?? 0) <= 0
    && (item.consumeBuffs?.length ?? 0) === 0;
}

/** isQiRestoreMedicine：执行对应的业务逻辑。 */
function isQiRestoreMedicine(item: ItemTemplate): boolean {
  return isMedicineItem(item)
    && (item.qiPercent ?? 0) > 0
    && (item.healAmount ?? 0) + (item.healPercent ?? 0) <= 0
    && (item.consumeBuffs?.length ?? 0) === 0;
}

/** isBuffMedicine：执行对应的业务逻辑。 */
function isBuffMedicine(item: ItemTemplate): boolean {
  return isMedicineItem(item)
    && (item.consumeBuffs?.length ?? 0) > 0
    && (item.healAmount ?? 0) + (item.healPercent ?? 0) <= 0
    && (item.qiPercent ?? 0) <= 0
    && !isCultivationPill(item);
}

/** isSpecialMedicine：执行对应的业务逻辑。 */
function isSpecialMedicine(item: ItemTemplate): boolean {
  return isMedicineItem(item)
    && !isHealthRestoreMedicine(item)
    && !isQiRestoreMedicine(item)
    && !isBuffMedicine(item);
}

/** ITEM_NAME_TAG_RULES：定义该变量以承载业务值。 */
const ITEM_NAME_TAG_RULES: Array<{ tag: string; test: (item: ItemTemplate) => boolean }> = [
  {
    tag: '药品',
    test: (item) => isMedicineItem(item),
  },
  {
    tag: '生命回复',
    test: (item) => isHealthRestoreMedicine(item),
  },
  {
    tag: '灵力回复',
    test: (item) => isQiRestoreMedicine(item),
  },
  { tag: '增益', test: (item) => isBuffMedicine(item) },
  { tag: '特殊', test: (item) => isSpecialMedicine(item) },
  { tag: '丹药', test: (item) => /丹/.test(item.name) },
  { tag: '药散', test: (item) => /散/.test(item.name) },
  { tag: '药膏', test: (item) => /膏/.test(item.name) },
  { tag: '修为丹药', test: (item) => isCultivationPill(item) },
  { tag: '战斗丹药', test: (item) => isHealthRestoreMedicine(item) || isQiRestoreMedicine(item) },
  { tag: '地图', test: (item) => typeof item.mapUnlockId === 'string' || (item.mapUnlockIds?.length ?? 0) > 0 || item.itemId.startsWith('map.') },
  { tag: '功能物品', test: (item) => typeof item.mapUnlockId === 'string' || (item.mapUnlockIds?.length ?? 0) > 0 },
  { tag: '灵石', test: (item) => item.itemId === 'spirit_stone' || item.name.includes('灵石') },
  { tag: '凭证', test: (item) => /牌|令|钥石/.test(item.name) },
  { tag: '矿材', test: (item) => item.type === 'material' && /(矿|铁|晶|金)/.test(item.name) },
  { tag: '兽材', test: (item) => item.type === 'material' && /(骨|牙|爪|鳞|羽|尾)/.test(item.name) },
  { tag: '刀', test: (item) => item.type === 'equipment' && /刀/.test(item.name) },
  { tag: '剑', test: (item) => item.type === 'equipment' && /剑/.test(item.name) },
  { tag: '枪', test: (item) => item.type === 'equipment' && /枪/.test(item.name) },
  { tag: '匕首', test: (item) => item.type === 'equipment' && /匕/.test(item.name) },
  { tag: '靴子', test: (item) => item.type === 'equipment' && /靴|鞋/.test(item.name) },
  { tag: '帽子', test: (item) => item.type === 'equipment' && /帽|巾/.test(item.name) },
  { tag: '衣甲', test: (item) => item.type === 'equipment' && /衣|甲|袍|褂|胸/.test(item.name) },
  { tag: '步法', test: (item) => item.type === 'skill_book' && /步/.test(item.name) },
  { tag: '身法', test: (item) => item.type === 'skill_book' && /步/.test(item.name) },
  { tag: '掌法', test: (item) => item.type === 'skill_book' && /掌/.test(item.name) },
  { tag: '刀法', test: (item) => item.type === 'skill_book' && /刀/.test(item.name) },
  { tag: '剑法', test: (item) => item.type === 'skill_book' && /剑/.test(item.name) },
  { tag: '枪法', test: (item) => item.type === 'skill_book' && /枪/.test(item.name) },
  { tag: '锻体', test: (item) => item.type === 'skill_book' && /功/.test(item.name) },
  { tag: '心法', test: (item) => item.type === 'skill_book' && /诀|经|篇/.test(item.name) },
];

@Injectable()
/** ContentService：封装相关状态与行为。 */
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger(ContentService.name);
  private readonly techniques = new Map<string, TechniqueTemplate>();
  private readonly items = new Map<string, ItemTemplate>();
  private readonly monsters = new Map<string, MonsterTemplate>();
  private readonly sharedTechniqueBuffs = new Map<string, Extract<SkillEffectDef, { type: 'buff' }>>();
  private loaded = false;
/** realmLevelsConfig：定义该变量以承载业务值。 */
  private realmLevelsConfig: RealmLevelsConfig | null = null;
  private readonly realmLevels = new Map<number, RealmLevelEntry>();
  private readonly breakthroughConfigs = new Map<number, BreakthroughConfigEntry>();
/** starterInventoryEntries：定义该变量以承载业务值。 */
  private starterInventoryEntries: StarterInventoryEntry[] = [];
  private readonly contentDir = resolveServerDataPath('content');
  private readonly sharedTechniqueBuffsDir = path.join(this.contentDir, 'technique-buffs');
  private readonly techniquesDir = path.join(this.contentDir, 'techniques');
  private readonly itemsDir = path.join(this.contentDir, 'items');
  private readonly monstersDir = path.join(this.contentDir, 'monsters');
  private readonly starterInventoryPath = path.join(this.contentDir, 'starter-inventory.json');
  private readonly realmLevelsPath = path.join(this.contentDir, 'realm-levels.json');
  private readonly breakthroughConfigPath = path.join(this.contentDir, 'breakthroughs.json');

/** onModuleInit：执行对应的业务逻辑。 */
  onModuleInit(): void {
    this.ensureLoaded();
  }

/** ensureLoaded：执行对应的业务逻辑。 */
  ensureLoaded(): void {
    if (this.loaded) {
      return;
    }
    this.loadContent();
    this.loaded = true;
  }

/** loadContent：执行对应的业务逻辑。 */
  private loadContent(): void {
    this.techniques.clear();
    this.items.clear();
    this.monsters.clear();
    this.sharedTechniqueBuffs.clear();
    this.realmLevels.clear();
    this.breakthroughConfigs.clear();
    this.loadRealmLevels();
    this.loadSharedTechniqueBuffs();
    this.loadTechniques();
    this.loadItems();
    this.loadMonsters();
    this.applyDerivedAlchemyMaterialTags();
    this.loadStarterInventory();
    this.loadBreakthroughConfigs();
/** monsterTechniqueCount：定义该变量以承载业务值。 */
    let monsterTechniqueCount = 0;
    for (const techniqueId of this.techniques.keys()) {
      if (techniqueId.startsWith('monster_')) {
        monsterTechniqueCount += 1;
      }
    }
/** playerTechniqueCount：定义该变量以承载业务值。 */
    const playerTechniqueCount = this.techniques.size - monsterTechniqueCount;
    this.logger.log(
      `内容已加载：玩家功法 ${playerTechniqueCount} 条，怪物功法 ${monsterTechniqueCount} 条，总功法 ${this.techniques.size} 条，物品 ${this.items.size} 条，怪物 ${this.monsters.size} 条，境界 ${this.realmLevels.size} 条，突破配置 ${this.breakthroughConfigs.size} 条`,
    );
  }

/** loadTechniques：执行对应的业务逻辑。 */
  private loadTechniques(): void {
    for (const raw of this.readJsonEntries<RawTechniqueTemplate>(this.techniquesDir)) {
      const realmLv = this.normalizeTechniqueRealmLevel(raw.realmLv, raw.grade);
      const category = this.normalizeTechniqueCategory(raw.category, raw.skills);
/** layers：定义该变量以承载业务值。 */
      const layers = [...(raw.layers ?? [])]
        .map((layer) => ({
          ...layer,
          attrs: this.normalizeTechniqueLayerAttrs(layer.attrs),
/** expToNext：定义该变量以承载业务值。 */
          expToNext: layer.expFactor === undefined
            ? Math.max(0, layer.expToNext ?? 0)
            : scaleTechniqueExp(layer.expFactor, realmLv),
        }))
        .sort((left, right) => left.level - right.level);
/** technique：定义该变量以承载业务值。 */
      const technique: TechniqueTemplate = {
        id: raw.id,
        name: raw.name,
        grade: raw.grade,
        category,
        realmLv,
        layers,
        skills: raw.skills.map((skill) => {
/** unlockRealm：定义该变量以承载业务值。 */
          const unlockRealm = skill.unlockRealm === undefined ? undefined : this.parseTechniqueRealm(skill.unlockRealm);
/** unlockLevel：定义该变量以承载业务值。 */
          const unlockLevel = resolveSkillUnlockLevel({
            unlockLevel: skill.unlockLevel,
            unlockRealm,
          });
/** costMultiplier：定义该变量以承载业务值。 */
          const costMultiplier = this.normalizeSkillCostMultiplier(skill);
          return {
            ...skill,
            cost: calculateTechniqueSkillQiCost(
              costMultiplier,
              raw.grade,
              realmLv,
            ),
            costMultiplier,
            effects: this.normalizeSkillEffects(skill.effects),
            unlockLevel,
            unlockRealm,
/** unlockPlayerRealm：定义该变量以承载业务值。 */
            unlockPlayerRealm: skill.unlockPlayerRealm === undefined
              ? undefined
              : this.parsePlayerRealmStage(skill.unlockPlayerRealm),
          };
        }),
      };
      this.techniques.set(technique.id, technique);
    }
  }

/** loadSharedTechniqueBuffs：执行对应的业务逻辑。 */
  private loadSharedTechniqueBuffs(): void {
    if (!fs.existsSync(this.sharedTechniqueBuffsDir)) {
      return;
    }
    for (const raw of this.readJsonEntries<RawSharedTechniqueBuffDef>(this.sharedTechniqueBuffsDir)) {
      if (typeof raw.id !== 'string' || raw.id.trim().length === 0) {
        continue;
      }
/** effect：定义该变量以承载业务值。 */
      const effect = this.normalizeRawSkillBuffEffect({
        ...raw,
        type: 'buff',
      });
      if (!effect) {
        throw new Error(`共享功法 Buff 模板 ${raw.id} 配置无效`);
      }
      this.sharedTechniqueBuffs.set(raw.id.trim(), effect);
    }
  }

/** normalizeSkillCostMultiplier：执行对应的业务逻辑。 */
  private normalizeSkillCostMultiplier(skill: RawSkillDef): number {
/** raw：定义该变量以承载业务值。 */
    const raw = skill.costMultiplier ?? skill.cost ?? 0;
    return Number.isFinite(raw) ? Math.max(0, Number(raw)) : 0;
  }

/** normalizeTechniqueRealmLevel：执行对应的业务逻辑。 */
  private normalizeTechniqueRealmLevel(realmLv: number | undefined, grade: TechniqueGrade): number {
    if (Number.isFinite(realmLv)) {
      return Math.max(1, Math.floor(Number(realmLv)));
    }
/** configured：定义该变量以承载业务值。 */
    const configured = this.realmLevelsConfig?.gradeBands.find((entry) => entry.grade === grade);
    if (configured) {
      return Math.max(1, configured.levelFrom);
    }
/** fallbackGradeIndex：定义该变量以承载业务值。 */
    const fallbackGradeIndex = Math.max(0, TECHNIQUE_GRADE_ORDER.indexOf(grade));
    return fallbackGradeIndex * 12 + 1;
  }

/** normalizeTechniqueCategory：执行对应的业务逻辑。 */
  private normalizeTechniqueCategory(category: TechniqueCategory | undefined, skills: RawSkillDef[]): TechniqueCategory {
    if (category === 'arts' || category === 'internal' || category === 'divine' || category === 'secret') {
      return category;
    }
    return skills.length > 0 ? 'arts' : 'internal';
  }

/** normalizeTechniqueLayerAttrs：执行对应的业务逻辑。 */
  private normalizeTechniqueLayerAttrs(attrs: TechniqueLayerDef['attrs']): TechniqueLayerDef['attrs'] {
    if (!attrs) return attrs;
    return { ...attrs };
  }

/** normalizeItemAttrs：执行对应的业务逻辑。 */
  private normalizeItemAttrs(attrs: unknown): Partial<Attributes> | undefined {
    if (!isPlainObject(attrs)) {
      return undefined;
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized: Partial<Attributes> = {};
    for (const key of ATTR_KEYS) {
      const value = attrs[key];
      if (!Number.isFinite(value)) continue;
      normalized[key] = Number(value);
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

/** normalizeItemStats：执行对应的业务逻辑。 */
  private normalizeItemStats(stats: unknown): ItemStack['equipStats'] {
    if (!isPlainObject(stats)) {
      return undefined;
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized: NonNullable<ItemStack['equipStats']> = {};
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
      const value = stats[key];
      if (!Number.isFinite(value)) continue;
      normalized[key] = Number(value);
    }
    if (isPlainObject(stats.elementDamageBonus)) {
/** group：定义该变量以承载业务值。 */
      const group: NonNullable<ItemStack['equipStats']>['elementDamageBonus'] = {};
      for (const key of ELEMENT_KEYS) {
        const value = stats.elementDamageBonus[key];
        if (!Number.isFinite(value)) continue;
        group[key] = Number(value);
      }
      if (Object.keys(group).length > 0) {
        normalized.elementDamageBonus = group;
      }
    }
    if (isPlainObject(stats.elementDamageReduce)) {
/** group：定义该变量以承载业务值。 */
      const group: NonNullable<ItemStack['equipStats']>['elementDamageReduce'] = {};
      for (const key of ELEMENT_KEYS) {
        const value = stats.elementDamageReduce[key];
        if (!Number.isFinite(value)) continue;
        group[key] = Number(value);
      }
      if (Object.keys(group).length > 0) {
        normalized.elementDamageReduce = group;
      }
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

/** createItemStackFromTemplate：执行对应的业务逻辑。 */
  private createItemStackFromTemplate(item: ItemTemplate, count = 1): ItemStack {
    return applyEnhancementToItemStack({
      itemId: item.itemId,
      name: item.name,
      type: item.type,
      count,
      desc: item.desc,
      groundLabel: item.groundLabel,
      grade: item.grade,
      level: item.level,
      equipSlot: item.equipSlot,
      equipAttrs: item.equipAttrs,
      equipStats: item.equipStats,
      equipValueStats: item.equipValueStats,
      effects: item.effects,
      healAmount: item.healAmount,
      healPercent: item.healPercent,
      qiPercent: item.qiPercent,
      cooldown: item.cooldown,
      consumeBuffs: item.consumeBuffs,
      tags: item.tags,
      enhanceLevel: normalizeEnhanceLevel(item.enhanceLevel),
      alchemySuccessRate: item.alchemySuccessRate,
      alchemySpeedRate: item.alchemySpeedRate,
      enhancementSuccessRate: item.enhancementSuccessRate,
      enhancementSpeedRate: item.enhancementSpeedRate,
      mapUnlockId: item.mapUnlockId,
      mapUnlockIds: item.mapUnlockIds ? [...item.mapUnlockIds] : undefined,
      tileAuraGainAmount: item.tileAuraGainAmount,
      allowBatchUse: item.allowBatchUse,
    });
  }

/** normalizeMonsterEquipment：执行对应的业务逻辑。 */
  private normalizeMonsterEquipment(rawEquipment: unknown, monsterId: string): EquipmentSlots {
/** normalized：定义该变量以承载业务值。 */
    const normalized = { weapon: null, head: null, body: null, legs: null, accessory: null } as EquipmentSlots;
    if (!isPlainObject(rawEquipment)) {
      return normalized;
    }

    for (const slot of EQUIP_SLOTS) {
      const entry = rawEquipment[slot];
      const itemId = typeof entry === 'string'
        ? entry.trim()
        : (isPlainObject(entry) && typeof entry.itemId === 'string' ? entry.itemId.trim() : '');
      if (!itemId) {
        continue;
      }
/** item：定义该变量以承载业务值。 */
      const item = this.items.get(itemId);
      if (!item) {
        this.logger.warn(`怪物 ${monsterId} 配置了不存在的装备 ${itemId}，已忽略`);
        continue;
      }
      if (item.type !== 'equipment' || item.equipSlot !== slot) {
        this.logger.warn(`怪物 ${monsterId} 的装备 ${itemId} 不属于 ${slot} 槽位，已忽略`);
        continue;
      }
      normalized[slot] = this.createItemStackFromTemplate(item, 1);
    }

    return normalized;
  }

  private buildMonsterDrops(
    configuredDrops: MonsterTemplateDrop[] | undefined,
    equipment: EquipmentSlots,
    context: MonsterDropContext,
  ): MonsterTemplateDrop[] {
/** drops：定义该变量以承载业务值。 */
    const drops: MonsterTemplateDrop[] = [];
    if (Array.isArray(configuredDrops)) {
      for (const drop of configuredDrops) {
        if (!isPlainObject(drop) || typeof drop.itemId !== 'string') {
          continue;
        }
/** itemId：定义该变量以承载业务值。 */
        const itemId = drop.itemId.trim();
/** item：定义该变量以承载业务值。 */
        const item = this.items.get(itemId);
        if (!item) {
          this.logger.warn(
            `怪物 ${context.monsterId ?? 'unknown'} 配置了不存在的掉落物品 ${itemId}，已忽略`,
          );
          continue;
        }
        if (typeof drop.name !== 'string' || typeof drop.type !== 'string') {
          continue;
        }
        drops.push({
          itemId,
          name: drop.name,
          type: drop.type,
          count: Number.isFinite(drop.count) ? Math.max(1, Math.floor(Number(drop.count))) : 1,
          chance: Number.isFinite(drop.chance) ? Number(drop.chance) : undefined,
        });
      }
    }

/** spiritStoneOverride：定义该变量以承载业务值。 */
    let spiritStoneOverride: MonsterTemplateDrop | undefined;
/** nonSpiritDrops：定义该变量以承载业务值。 */
    const nonSpiritDrops: MonsterTemplateDrop[] = [];
    for (const drop of drops) {
      if (drop.itemId === 'spirit_stone') {
        spiritStoneOverride = drop;
        continue;
      }
      nonSpiritDrops.push(this.resolveMonsterDropChance(drop, context));
    }

/** existingItemIds：定义该变量以承载业务值。 */
    const existingItemIds = new Set(nonSpiritDrops.map((drop) => drop.itemId));
    for (const item of Object.values(equipment)) {
      if (!item || existingItemIds.has(item.itemId)) {
        continue;
      }
      nonSpiritDrops.push(this.resolveMonsterDropChance({
        itemId: item.itemId,
        name: item.name,
        type: item.type,
        count: 1,
      }, context));
      existingItemIds.add(item.itemId);
    }

/** spiritStoneDrop：定义该变量以承载业务值。 */
    const spiritStoneDrop = this.buildSpiritStoneMonsterDrop(context, spiritStoneOverride);
    if (spiritStoneDrop) {
      nonSpiritDrops.push(spiritStoneDrop);
    }

    return nonSpiritDrops;
  }

/** resolveMonsterDropChance：执行对应的业务逻辑。 */
  private resolveMonsterDropChance(drop: MonsterTemplateDrop, context: MonsterDropContext): MonsterTemplateDrop {
    if (Number.isFinite(drop.chance)) {
      return {
        ...drop,
        chance: Math.max(0, Math.min(1, Number(drop.chance))),
      };
    }
    return {
      ...drop,
      chance: this.computeDefaultMonsterDropChance(drop, context),
    };
  }

/** computeDefaultMonsterDropChance：执行对应的业务逻辑。 */
  private computeDefaultMonsterDropChance(drop: MonsterTemplateDrop, context: MonsterDropContext): number {
    if (drop.type === 'quest_item') {
      return 1;
    }
    if (drop.type === 'material') {
      return this.getMaterialBaseDropChance(context.tier);
    }

/** categoryBase：定义该变量以承载业务值。 */
    const categoryBase = this.getMonsterDropCategoryBase(drop);
/** itemGrade：定义该变量以承载业务值。 */
    const itemGrade = this.getMonsterDropItemGrade(drop);
/** monsterGradeIndex：定义该变量以承载业务值。 */
    const monsterGradeIndex = TECHNIQUE_GRADE_ORDER.indexOf(context.grade);
/** itemGradeIndex：定义该变量以承载业务值。 */
    const itemGradeIndex = TECHNIQUE_GRADE_ORDER.indexOf(itemGrade);
/** gradeDelta：定义该变量以承载业务值。 */
    const gradeDelta = Math.max(-7, monsterGradeIndex - itemGradeIndex);
/** tierFactor：定义该变量以承载业务值。 */
    const tierFactor = this.getMonsterTierDropFactor(context.tier);
/** chance：定义该变量以承载业务值。 */
    const chance = 0.01 * categoryBase * (3 ** gradeDelta) * tierFactor;
    return Math.max(Number.MIN_VALUE, Math.min(1, chance));
  }

/** getMaterialBaseDropChance：执行对应的业务逻辑。 */
  private getMaterialBaseDropChance(tier: MonsterTier): number {
    switch (tier) {
      case 'variant':
        return 0.2;
      case 'demon_king':
        return 0.5;
      default:
        return 0.05;
    }
  }

/** getMonsterDropCategoryBase：执行对应的业务逻辑。 */
  private getMonsterDropCategoryBase(drop: Pick<MonsterTemplateDrop, 'itemId' | 'type'>): number {
    if (drop.itemId === 'spirit_stone') {
      return 1;
    }
    switch (drop.type) {
      case 'skill_book':
        return 1;
      case 'equipment':
        return 2;
      case 'material':
        return 20;
      case 'consumable':
        return 10;
      case 'quest_item':
        return 100;
      default:
        return 1;
    }
  }

/** getMonsterTierDropFactor：执行对应的业务逻辑。 */
  private getMonsterTierDropFactor(tier: MonsterTier): number {
    switch (tier) {
      case 'variant':
        return 1 / 3;
      case 'demon_king':
        return 1;
      default:
        return 0.1;
    }
  }

/** getMonsterDropItemGrade：执行对应的业务逻辑。 */
  private getMonsterDropItemGrade(drop: Pick<MonsterTemplateDrop, 'itemId' | 'type'>): TechniqueGrade {
/** item：定义该变量以承载业务值。 */
    const item = this.items.get(drop.itemId);
    if (item?.grade) {
      return item.grade;
    }
    if (item?.learnTechniqueId) {
      return this.techniques.get(item.learnTechniqueId)?.grade ?? 'mortal';
    }
    if (Number.isFinite(item?.level)) {
      return this.inferTechniqueGradeFromItemLevel(Number(item?.level));
    }
    return 'mortal';
  }

/** inferTechniqueGradeFromItemLevel：执行对应的业务逻辑。 */
  private inferTechniqueGradeFromItemLevel(level: number): TechniqueGrade {
/** normalizedLevel：定义该变量以承载业务值。 */
    const normalizedLevel = Math.max(1, Math.trunc(level));
    if (normalizedLevel >= 85) return 'emperor';
    if (normalizedLevel >= 73) return 'saint';
    if (normalizedLevel >= 61) return 'spirit';
    if (normalizedLevel >= 49) return 'heaven';
    if (normalizedLevel >= 37) return 'earth';
    if (normalizedLevel >= 25) return 'mystic';
    if (normalizedLevel >= 13) return 'yellow';
    return 'mortal';
  }

  private buildSpiritStoneMonsterDrop(
    context: MonsterDropContext,
    override?: MonsterTemplateDrop,
  ): MonsterTemplateDrop | null {
/** item：定义该变量以承载业务值。 */
    const item = this.items.get('spirit_stone');
    if (!item) {
      return null;
    }
/** count：定义该变量以承载业务值。 */
    const count = Number.isFinite(override?.count)
      ? Math.max(1, Math.trunc(Number(override?.count)))
      : this.computeSpiritStoneDropCount(context);
/** chance：定义该变量以承载业务值。 */
    const chance = Number.isFinite(override?.chance)
      ? Math.max(0, Math.min(1, Number(override?.chance)))
      : this.computeSpiritStoneDropChance(context.tier);
    return {
      itemId: item.itemId,
      name: item.name,
      type: item.type,
      count,
      chance,
    };
  }

/** computeSpiritStoneDropChance：执行对应的业务逻辑。 */
  private computeSpiritStoneDropChance(tier: MonsterTier): number {
    switch (tier) {
      case 'variant':
        return 0.03;
      case 'demon_king':
        return 0.1;
      default:
        return 0.01;
    }
  }

/** computeSpiritStoneDropCount：执行对应的业务逻辑。 */
  private computeSpiritStoneDropCount(context: MonsterDropContext): number {
/** gradeIndex：定义该变量以承载业务值。 */
    const gradeIndex = Math.max(0, TECHNIQUE_GRADE_ORDER.indexOf(context.grade));
/** level：定义该变量以承载业务值。 */
    const level = Number.isFinite(context.level) ? Math.max(1, Math.trunc(Number(context.level))) : 1;
    return Math.max(1, Math.floor(1 + (gradeIndex * 0.5) + (Math.floor(level / 12) * 0.5)));
  }

/** resolveConfiguredStats：执行对应的业务逻辑。 */
  private resolveConfiguredStats(actualStats: unknown, valueStats: unknown): ItemStack['equipStats'] {
/** configuredValueStats：定义该变量以承载业务值。 */
    const configuredValueStats = this.normalizeItemStats(valueStats);
    if (configuredValueStats) {
      return compileValueStatsToActualStats(configuredValueStats);
    }
    return this.normalizeItemStats(actualStats);
  }

  private resolveConfiguredBuffStats(
    actualStats: unknown,
    valueStats: unknown,
    mode: 'flat' | 'percent' | undefined,
  ): ItemStack['equipStats'] {
    if (mode === 'flat') {
      return this.resolveConfiguredStats(actualStats, valueStats);
    }
/** normalizedActualStats：定义该变量以承载业务值。 */
    const normalizedActualStats = this.normalizeItemStats(actualStats);
    if (normalizedActualStats) {
      return normalizedActualStats;
    }
    return this.normalizeItemStats(valueStats);
  }

/** normalizeBuffModifierMode：执行对应的业务逻辑。 */
  private normalizeBuffModifierMode(mode: unknown): BuffModifierMode {
    return mode === 'flat' ? 'flat' : 'percent';
  }

/** normalizeQiProjectionModifiers：执行对应的业务逻辑。 */
  private normalizeQiProjectionModifiers(input: unknown): QiProjectionModifier[] | undefined {
    if (!Array.isArray(input)) {
      return undefined;
    }
/** modifiers：定义该变量以承载业务值。 */
    const modifiers = input.flatMap((entry) => {
      if (!isPlainObject(entry)) {
        return [];
      }
/** selector：定义该变量以承载业务值。 */
      const selector = isPlainObject(entry.selector) ? entry.selector : undefined;
/** normalizedSelector：定义该变量以承载业务值。 */
      const normalizedSelector = selector ? {
        resourceKeys: normalizeStringArray(selector.resourceKeys),
        families: normalizeQiKeyArray(selector.families, QI_FAMILY_KEYS) as QiFamilyKey[] | undefined,
        forms: normalizeQiKeyArray(selector.forms, QI_FORM_KEYS) as QiFormKey[] | undefined,
        elements: normalizeQiKeyArray(selector.elements, QI_ELEMENT_KEYS) as QiElementKey[] | undefined,
      } : undefined;
/** hasSelector：定义该变量以承载业务值。 */
      const hasSelector = normalizedSelector && (
        normalizedSelector.resourceKeys
        || normalizedSelector.families
        || normalizedSelector.forms
        || normalizedSelector.elements
      );
/** visibility：定义该变量以承载业务值。 */
      const visibility = entry.visibility === 'observable' || entry.visibility === 'absorbable'
        ? entry.visibility
        : undefined;
/** efficiencyBpMultiplier：定义该变量以承载业务值。 */
      const efficiencyBpMultiplier = Number.isFinite(entry.efficiencyBpMultiplier)
        ? Math.max(0, Math.round(Number(entry.efficiencyBpMultiplier)))
        : undefined;
      if (!visibility && efficiencyBpMultiplier === undefined) {
        return [];
      }
      return [{
        selector: hasSelector ? normalizedSelector : undefined,
        visibility,
        efficiencyBpMultiplier,
      } satisfies QiProjectionModifier];
    });
    return modifiers.length > 0 ? modifiers : undefined;
  }

/** normalizeEquipmentConditionGroup：执行对应的业务逻辑。 */
  private normalizeEquipmentConditionGroup(input: unknown): EquipmentConditionGroup | undefined {
    if (!isPlainObject(input) || !Array.isArray(input.items)) {
      return undefined;
    }
/** items：定义该变量以承载业务值。 */
    const items = input.items
      .flatMap((entry) => this.normalizeEquipmentCondition(entry));
    if (items.length === 0) {
      return undefined;
    }
    return {
/** mode：定义该变量以承载业务值。 */
      mode: input.mode === 'any' ? 'any' : 'all',
      items,
    };
  }

/** normalizeEquipmentCondition：执行对应的业务逻辑。 */
  private normalizeEquipmentCondition(input: unknown): EquipmentConditionDef[] {
    if (!isPlainObject(input) || typeof input.type !== 'string') {
      return [];
    }
    switch (input.type) {
      case 'time_segment': {
/** phases：定义该变量以承载业务值。 */
        const phases = Array.isArray(input.in)
          ? input.in.filter((entry): entry is TimePhaseId => typeof entry === 'string' && TIME_PHASE_IDS.includes(entry as TimePhaseId))
          : [];
        return phases.length > 0 ? [{ type: 'time_segment', in: phases }] : [];
      }
      case 'map': {
/** mapIds：定义该变量以承载业务值。 */
        const mapIds = normalizeStringArray(input.mapIds);
        return mapIds ? [{ type: 'map', mapIds }] : [];
      }
      case 'hp_ratio':
      case 'qi_ratio': {
/** op：定义该变量以承载业务值。 */
        const op = input.op === '>=' ? '>=' : input.op === '<=' ? '<=' : null;
/** rawValue：定义该变量以承载业务值。 */
        const rawValue = Number(input.value);
        if (!op || !Number.isFinite(rawValue)) {
          return [];
        }
/** value：定义该变量以承载业务值。 */
        const value = rawValue > 1 ? rawValue / 100 : rawValue;
        return value >= 0 ? [{ type: input.type, op, value: Math.min(1, value) }] : [];
      }
      case 'is_cultivating': {
        return typeof input.value === 'boolean' ? [{ type: 'is_cultivating', value: input.value }] : [];
      }
      case 'has_buff': {
        if (typeof input.buffId !== 'string' || input.buffId.trim().length === 0) {
          return [];
        }
        return [{
          type: 'has_buff',
          buffId: input.buffId.trim(),
          minStacks: Number.isFinite(input.minStacks) ? Math.max(1, Math.floor(Number(input.minStacks))) : undefined,
        }];
      }
      case 'target_kind': {
/** targetKinds：定义该变量以承载业务值。 */
        const targetKinds = Array.isArray(input.in)
          ? input.in.filter((entry): entry is 'monster' | 'player' | 'tile' => entry === 'monster' || entry === 'player' || entry === 'tile')
          : [];
        return targetKinds.length > 0 ? [{ type: 'target_kind', in: targetKinds }] : [];
      }
      default:
        return [];
    }
  }

/** normalizeEquipmentEffects：执行对应的业务逻辑。 */
  private normalizeEquipmentEffects(input: unknown, itemId: string): EquipmentEffectDef[] | undefined {
    if (!Array.isArray(input)) {
      return undefined;
    }
/** effects：定义该变量以承载业务值。 */
    const effects = input.flatMap((entry, index) => this.normalizeEquipmentEffect(entry, itemId, index));
    return effects.length > 0 ? effects : undefined;
  }

/** normalizeEquipmentEffect：执行对应的业务逻辑。 */
  private normalizeEquipmentEffect(input: unknown, itemId: string, index: number): EquipmentEffectDef[] {
    if (!isPlainObject(input) || typeof input.type !== 'string') {
      return [];
    }
/** effectId：定义该变量以承载业务值。 */
    const effectId = typeof input.effectId === 'string' && input.effectId.trim().length > 0
      ? input.effectId.trim()
      : `${itemId}#${index + 1}`;
/** conditions：定义该变量以承载业务值。 */
    const conditions = this.normalizeEquipmentConditionGroup(input.conditions);

    switch (input.type) {
      case 'stat_aura':
        return [{
          effectId,
          type: 'stat_aura',
          conditions,
          attrs: this.normalizeItemAttrs(input.attrs),
          attrMode: 'percent',
          stats: this.resolveConfiguredBuffStats(input.stats, input.valueStats, 'percent'),
          statMode: 'percent',
          qiProjection: this.normalizeQiProjectionModifiers(input.qiProjection),
        }];
      case 'progress_boost':
        return [{
          effectId,
          type: 'progress_boost',
          conditions,
          attrs: this.normalizeItemAttrs(input.attrs),
          attrMode: this.normalizeBuffModifierMode(input.attrMode),
          stats: this.resolveConfiguredBuffStats(
            input.stats,
            input.valueStats,
            this.normalizeBuffModifierMode(input.statMode),
          ),
          statMode: this.normalizeBuffModifierMode(input.statMode),
          qiProjection: this.normalizeQiProjectionModifiers(input.qiProjection),
        }];
      case 'periodic_cost': {
/** trigger：定义该变量以承载业务值。 */
        const trigger = input.trigger === 'on_cultivation_tick' ? 'on_cultivation_tick' : input.trigger === 'on_tick' ? 'on_tick' : null;
        if (!trigger) {
          return [];
        }
/** resource：定义该变量以承载业务值。 */
        const resource = input.resource === 'qi' ? 'qi' : input.resource === 'hp' ? 'hp' : null;
/** mode：定义该变量以承载业务值。 */
        const mode = input.mode === 'max_ratio_bp' || input.mode === 'current_ratio_bp' || input.mode === 'flat'
          ? input.mode
          : null;
/** value：定义该变量以承载业务值。 */
        const value = Number(input.value);
        if (!resource || !mode || !Number.isFinite(value) || value <= 0) {
          return [];
        }
        return [{
          effectId,
          type: 'periodic_cost',
          trigger,
          conditions,
          resource,
          mode,
          value: Math.max(0, Math.round(value)),
          minRemain: Number.isFinite(input.minRemain) ? Math.max(0, Math.floor(Number(input.minRemain))) : undefined,
        }];
      }
      case 'timed_buff': {
/** trigger：定义该变量以承载业务值。 */
        const trigger = EQUIPMENT_TRIGGERS.includes(input.trigger as EquipmentTrigger)
          ? input.trigger as EquipmentTrigger
          : null;
/** buff：定义该变量以承载业务值。 */
        const buff = isPlainObject(input.buff) ? input.buff : null;
        if (!trigger || !buff || typeof buff.buffId !== 'string' || buff.buffId.trim().length === 0 || typeof buff.name !== 'string' || !Number.isFinite(buff.duration)) {
          return [];
        }
        return [{
          effectId,
          type: 'timed_buff',
          trigger,
/** target：定义该变量以承载业务值。 */
          target: input.target === 'target' ? 'target' : 'self',
          cooldown: Number.isFinite(input.cooldown) ? Math.max(0, Math.floor(Number(input.cooldown))) : undefined,
          chance: Number.isFinite(input.chance) ? Math.max(0, Math.min(1, Number(input.chance))) : undefined,
          conditions,
          buff: {
            // Buff 默认走百分比乘区；只有显式声明 flat 时才按固定值解析 valueStats。
            buffId: buff.buffId.trim(),
            name: buff.name,
/** desc：定义该变量以承载业务值。 */
            desc: typeof buff.desc === 'string' ? buff.desc : undefined,
/** shortMark：定义该变量以承载业务值。 */
            shortMark: typeof buff.shortMark === 'string' ? buff.shortMark : undefined,
/** category：定义该变量以承载业务值。 */
            category: buff.category === 'debuff' ? 'debuff' : buff.category === 'buff' ? 'buff' : undefined,
/** visibility：定义该变量以承载业务值。 */
            visibility: buff.visibility === 'hidden' || buff.visibility === 'observe_only' || buff.visibility === 'public'
              ? buff.visibility
              : undefined,
/** color：定义该变量以承载业务值。 */
            color: typeof buff.color === 'string' ? buff.color : undefined,
            duration: Math.max(1, Math.floor(Number(buff.duration))),
            maxStacks: Number.isFinite(buff.maxStacks) ? Math.max(1, Math.floor(Number(buff.maxStacks))) : undefined,
            attrs: this.normalizeItemAttrs(buff.attrs),
            attrMode: this.normalizeBuffModifierMode(buff.attrMode),
            stats: this.resolveConfiguredBuffStats(
              buff.stats,
              buff.valueStats,
              this.normalizeBuffModifierMode(buff.statMode),
            ),
            statMode: this.normalizeBuffModifierMode(buff.statMode),
            qiProjection: this.normalizeQiProjectionModifiers(buff.qiProjection),
          },
        }];
      }
      default:
        return [];
    }
  }

/** normalizeConsumableBuffs：执行对应的业务逻辑。 */
  private normalizeConsumableBuffs(input: unknown): ConsumableBuffDef[] | undefined {
    if (!Array.isArray(input)) {
      return undefined;
    }
/** buffs：定义该变量以承载业务值。 */
    const buffs = input.flatMap((entry) => {
      if (!isPlainObject(entry) || typeof entry.buffId !== 'string' || typeof entry.name !== 'string' || !Number.isFinite(entry.duration)) {
        return [];
      }
/** buffId：定义该变量以承载业务值。 */
      const buffId = entry.buffId.trim();
/** name：定义该变量以承载业务值。 */
      const name = entry.name.trim();
      if (buffId.length === 0 || name.length === 0) {
        return [];
      }
/** buff：定义该变量以承载业务值。 */
      const buff: ConsumableBuffDef = {
        buffId,
        name,
/** desc：定义该变量以承载业务值。 */
        desc: typeof entry.desc === 'string' ? entry.desc : undefined,
/** shortMark：定义该变量以承载业务值。 */
        shortMark: typeof entry.shortMark === 'string' ? entry.shortMark : undefined,
/** category：定义该变量以承载业务值。 */
        category: entry.category === 'debuff' ? 'debuff' : entry.category === 'buff' ? 'buff' : undefined,
/** visibility：定义该变量以承载业务值。 */
        visibility: entry.visibility === 'hidden' || entry.visibility === 'observe_only' || entry.visibility === 'public'
          ? entry.visibility
          : undefined,
/** color：定义该变量以承载业务值。 */
        color: typeof entry.color === 'string' ? entry.color : undefined,
        duration: Math.max(1, Math.floor(Number(entry.duration))),
        maxStacks: Number.isFinite(entry.maxStacks) ? Math.max(1, Math.floor(Number(entry.maxStacks))) : undefined,
        attrs: this.normalizeItemAttrs(entry.attrs),
        attrMode: this.normalizeBuffModifierMode(entry.attrMode),
        stats: this.resolveConfiguredBuffStats(
          entry.stats,
          entry.valueStats,
          this.normalizeBuffModifierMode(entry.statMode),
        ),
        statMode: this.normalizeBuffModifierMode(entry.statMode),
        qiProjection: this.normalizeQiProjectionModifiers(entry.qiProjection),
        presentationScale: Number.isFinite(entry.presentationScale) ? Math.max(0, Number(entry.presentationScale)) : undefined,
/** infiniteDuration：定义该变量以承载业务值。 */
        infiniteDuration: entry.infiniteDuration === true,
        sustainCost: normalizeBuffSustainCost(entry.sustainCost),
/** expireWithBuffId：定义该变量以承载业务值。 */
        expireWithBuffId: typeof entry.expireWithBuffId === 'string' && entry.expireWithBuffId.trim().length > 0
          ? entry.expireWithBuffId.trim()
          : undefined,
/** sourceSkillId：定义该变量以承载业务值。 */
        sourceSkillId: typeof entry.sourceSkillId === 'string' && entry.sourceSkillId.trim().length > 0
          ? entry.sourceSkillId.trim()
          : undefined,
      };
      return [buff];
    });
    return buffs.length > 0 ? buffs : undefined;
  }

/** loadItems：执行对应的业务逻辑。 */
  private loadItems(): void {
    for (const raw of this.readJsonEntries<RawItemTemplate>(this.itemsDir)) {
      const item: ItemTemplate = {
        ...raw,
/** groundLabel：定义该变量以承载业务值。 */
        groundLabel: typeof raw.groundLabel === 'string' && raw.groundLabel.trim().length > 0
          ? raw.groundLabel.trim()
          : undefined,
        grade: raw.grade,
        level: Number.isFinite(raw.level) ? Math.max(1, Math.floor(Number(raw.level))) : undefined,
        equipAttrs: this.normalizeItemAttrs(raw.equipAttrs),
        equipStats: this.resolveConfiguredStats(raw.equipStats, raw.equipValueStats),
        equipValueStats: this.normalizeItemStats(raw.equipValueStats),
        effects: this.normalizeEquipmentEffects(raw.effects, raw.itemId),
        healPercent: Number.isFinite(raw.healPercent)
          ? Math.max(0.01, Math.min(1, Number(raw.healPercent)))
          : undefined,
        qiPercent: Number.isFinite(raw.qiPercent)
          ? Math.max(0.01, Math.min(1, Number(raw.qiPercent)))
          : undefined,
        cooldown: Number.isFinite(raw.cooldown)
          ? Math.max(0, Math.floor(Number(raw.cooldown)))
          : undefined,
        consumeBuffs: this.normalizeConsumableBuffs(raw.consumeBuffs),
        enhanceLevel: 0,
        alchemySuccessRate: Number.isFinite(raw.alchemySuccessRate)
          ? Math.max(-0.95, Number(raw.alchemySuccessRate))
          : undefined,
        alchemySpeedRate: Number.isFinite(raw.alchemySpeedRate)
          ? Number(raw.alchemySpeedRate)
          : undefined,
        enhancementSuccessRate: Number.isFinite(raw.enhancementSuccessRate)
          ? Number(raw.enhancementSuccessRate)
          : undefined,
        enhancementSpeedRate: Number.isFinite(raw.enhancementSpeedRate)
          ? Number(raw.enhancementSpeedRate)
          : undefined,
        mapUnlockId: typeof raw.mapUnlockId === 'string' && raw.mapUnlockId.trim().length > 0
          ? raw.mapUnlockId.trim()
          : undefined,
        mapUnlockIds: normalizeStringArray(raw.mapUnlockIds),
/** respawnBindMapId：定义该变量以承载业务值。 */
        respawnBindMapId: typeof raw.respawnBindMapId === 'string' && raw.respawnBindMapId.trim().length > 0
          ? raw.respawnBindMapId.trim()
          : undefined,
/** spiritualRootSeedTier：定义该变量以承载业务值。 */
        spiritualRootSeedTier: raw.spiritualRootSeedTier === 'heaven' || raw.spiritualRootSeedTier === 'divine'
          ? raw.spiritualRootSeedTier
          : undefined,
        tags: undefined,
        tileAuraGainAmount: Number.isFinite(raw.tileAuraGainAmount)
          ? Math.max(1, Math.floor(Number(raw.tileAuraGainAmount)))
          : undefined,
/** allowBatchUse：定义该变量以承载业务值。 */
        allowBatchUse: raw.allowBatchUse === true,
      };
      if ((item.cooldown ?? 0) <= 0 && ((item.healAmount ?? 0) > 0 || (item.healPercent ?? 0) > 0 || (item.qiPercent ?? 0) > 0)) {
        item.cooldown = DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS;
      }
      item.tags = this.buildItemTags(item, normalizeStringArray(raw.tags));
      this.items.set(item.itemId, item);
    }
  }

/** buildItemTags：执行对应的业务逻辑。 */
  private buildItemTags(item: ItemTemplate, explicitTags?: string[]): string[] {
/** derivedTags：定义该变量以承载业务值。 */
    const derivedTags = new Set(['药品', '恢复', '生命回复', '灵力回复', '增益', '特殊', '修为丹药', '战斗丹药']);
/** tags：定义该变量以承载业务值。 */
    const tags = new Set<string>((explicitTags ?? []).filter((tag) => !derivedTags.has(tag)));
    for (const tag of ITEM_TAG_OVERRIDES[item.itemId] ?? []) {
      tags.add(tag);
    }
    for (const tag of ITEM_TYPE_TAGS[item.type] ?? []) {
      tags.add(tag);
    }
    if (item.type === 'equipment' && item.equipSlot) {
      for (const tag of EQUIP_SLOT_TAGS[item.equipSlot] ?? []) {
        tags.add(tag);
      }
    }
    if (item.effects && item.effects.length > 0) {
      tags.add('特效装备');
    }
    for (const rule of ITEM_NAME_TAG_RULES) {
      if (rule.test(item)) {
        tags.add(rule.tag);
      }
    }
    return [...tags];
  }

/** applyDerivedAlchemyMaterialTags：执行对应的业务逻辑。 */
  private applyDerivedAlchemyMaterialTags(): void {
/** herbMaterialItemIds：定义该变量以承载业务值。 */
    const herbMaterialItemIds = this.collectAlchemyRoleMaterialItemIds('main');
/** exoticMaterialItemIds：定义该变量以承载业务值。 */
    const exoticMaterialItemIds = this.collectAlchemyRoleMaterialItemIds('aux');

    for (const item of this.items.values()) {
      if (item.type !== 'material') {
        continue;
      }
/** tags：定义该变量以承载业务值。 */
      const tags = new Set((item.tags ?? []).filter((tag) => tag !== '药材' && tag !== '异材'));
      if (herbMaterialItemIds.has(item.itemId)) {
        tags.add('药材');
      }
      if (exoticMaterialItemIds.has(item.itemId)) {
        tags.add('异材');
      }
      item.tags = [...tags];
    }
  }

/** collectAlchemyRoleMaterialItemIds：执行对应的业务逻辑。 */
  private collectAlchemyRoleMaterialItemIds(role: 'main' | 'aux'): Set<string> {
/** recipesPath：定义该变量以承载业务值。 */
    const recipesPath = path.join(this.contentDir, 'alchemy', 'recipes.json');
/** entries：定义该变量以承载业务值。 */
    const entries = JSON.parse(fs.readFileSync(recipesPath, 'utf8')) as Array<{ ingredients?: Array<{ itemId?: string; role?: 'main' | 'aux' }> }>;
/** itemIds：定义该变量以承载业务值。 */
    const itemIds = new Set<string>();
    for (const entry of entries) {
      for (const ingredient of entry.ingredients ?? []) {
        if (ingredient?.role !== role || typeof ingredient.itemId !== 'string') {
          continue;
        }
        if (this.items.get(ingredient.itemId)?.type === 'material') {
          itemIds.add(ingredient.itemId);
        }
      }
    }
    return itemIds;
  }

/** getEffectiveItemLevel：执行对应的业务逻辑。 */
  private getEffectiveItemLevel(item: Pick<ItemTemplate, 'level' | 'healAmount' | 'grade'>): number {
    if (item.level !== undefined) {
      return item.level;
    }
    if (typeof item.healAmount === 'number') {
      if (item.healAmount <= 24) {
        return 1;
      }
      if (item.healAmount <= 40) {
        return 2;
      }
      if (item.healAmount <= 65) {
        return 3;
      }
      if (item.healAmount <= 80) {
        return 4;
      }
      return 5;
    }
/** grade：定义该变量以承载业务值。 */
    const grade = this.getEffectiveItemGrade(item);
/** gradeIndex：定义该变量以承载业务值。 */
    const gradeIndex = TECHNIQUE_GRADE_ORDER.indexOf(grade);
    return gradeIndex >= 0 ? gradeIndex + 1 : 1;
  }

/** getEffectiveItemGrade：执行对应的业务逻辑。 */
  private getEffectiveItemGrade(item: Pick<ItemTemplate, 'grade'>): TechniqueGrade {
    return item.grade ?? 'mortal';
  }

/** isGradeWithinRange：执行对应的业务逻辑。 */
  private isGradeWithinRange(itemGrade: TechniqueGrade, minGrade?: TechniqueGrade, maxGrade?: TechniqueGrade): boolean {
/** currentIndex：定义该变量以承载业务值。 */
    const currentIndex = TECHNIQUE_GRADE_ORDER.indexOf(itemGrade);
/** minIndex：定义该变量以承载业务值。 */
    const minIndex = minGrade ? TECHNIQUE_GRADE_ORDER.indexOf(minGrade) : -1;
/** maxIndex：定义该变量以承载业务值。 */
    const maxIndex = maxGrade ? TECHNIQUE_GRADE_ORDER.indexOf(maxGrade) : Number.POSITIVE_INFINITY;
    return currentIndex >= minIndex && currentIndex <= maxIndex;
  }

/** normalizeTagGroups：执行对应的业务逻辑。 */
  private normalizeTagGroups(tagGroups: string[][] | undefined): string[][] {
    if (!Array.isArray(tagGroups)) {
      return [];
    }
    return tagGroups
      .map((group) => [...new Set(group.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim()))])
      .filter((group) => group.length > 0);
  }

/** matchesTagGroups：执行对应的业务逻辑。 */
  private matchesTagGroups(itemTags: readonly string[] | undefined, tagGroups: string[][]): boolean {
    if (tagGroups.length === 0) {
      return true;
    }
/** tagSet：定义该变量以承载业务值。 */
    const tagSet = new Set(itemTags ?? []);
    return tagGroups.every((group) => group.some((tag) => tagSet.has(tag)));
  }

/** randomIntInclusive：执行对应的业务逻辑。 */
  private randomIntInclusive(min: number, max: number): number {
    if (max <= min) {
      return min;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  }

/** getLootPoolCandidates：执行对应的业务逻辑。 */
  getLootPoolCandidates(query: ContainerLootPoolQuery): EditorItemCatalogEntry[] {
    this.ensureLoaded();
/** tagGroups：定义该变量以承载业务值。 */
    const tagGroups = this.normalizeTagGroups(query.tagGroups);
    return [...this.items.values()]
      .filter((item) => {
/** level：定义该变量以承载业务值。 */
        const level = this.getEffectiveItemLevel(item);
        if (query.minLevel !== undefined && level < query.minLevel) {
          return false;
        }
        if (query.maxLevel !== undefined && level > query.maxLevel) {
          return false;
        }
        if (!this.isGradeWithinRange(this.getEffectiveItemGrade(item), query.minGrade, query.maxGrade)) {
          return false;
        }
        return this.matchesTagGroups(item.tags, tagGroups);
      })
      .map((item) => ({
        itemId: item.itemId,
        name: item.name,
        type: item.type,
        groundLabel: item.groundLabel,
        grade: item.grade,
        level: item.level,
        equipSlot: item.equipSlot,
        desc: item.desc,
        equipAttrs: item.equipAttrs ? JSON.parse(JSON.stringify(item.equipAttrs)) as NonNullable<ItemStack['equipAttrs']> : undefined,
        equipStats: item.equipStats ? JSON.parse(JSON.stringify(item.equipStats)) as NonNullable<ItemStack['equipStats']> : undefined,
        equipValueStats: item.equipValueStats
          ? JSON.parse(JSON.stringify(item.equipValueStats)) as NonNullable<ItemStack['equipValueStats']>
          : undefined,
        tags: item.tags ? [...item.tags] : undefined,
        effects: item.effects ? JSON.parse(JSON.stringify(item.effects)) as EquipmentEffectDef[] : undefined,
        healAmount: item.healAmount,
        healPercent: item.healPercent,
        qiPercent: item.qiPercent,
        cooldown: item.cooldown,
        consumeBuffs: item.consumeBuffs ? JSON.parse(JSON.stringify(item.consumeBuffs)) as ConsumableBuffDef[] : undefined,
        enhanceLevel: item.enhanceLevel,
        alchemySuccessRate: item.alchemySuccessRate,
        alchemySpeedRate: item.alchemySpeedRate,
        enhancementSuccessRate: item.enhancementSuccessRate,
        enhancementSpeedRate: item.enhancementSpeedRate,
        mapUnlockId: item.mapUnlockId,
        mapUnlockIds: item.mapUnlockIds ? [...item.mapUnlockIds] : undefined,
        tileAuraGainAmount: item.tileAuraGainAmount,
        allowBatchUse: item.allowBatchUse,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  rollLootPoolItems(query: ContainerLootPoolQuery & {
    rolls?: number;
    chance?: number;
    countMin?: number;
    countMax?: number;
    allowDuplicates?: boolean;
  }): ItemStack[] {
    this.ensureLoaded();
/** chance：定义该变量以承载业务值。 */
    const chance = typeof query.chance === 'number' ? Math.max(0, Math.min(1, query.chance)) : 1;
    if (Math.random() > chance) {
      return [];
    }
/** candidates：定义该变量以承载业务值。 */
    const candidates = this.getLootPoolCandidates(query);
    if (candidates.length === 0) {
      return [];
    }

/** rolls：定义该变量以承载业务值。 */
    const rolls = Number.isInteger(query.rolls) && Number(query.rolls) > 0 ? Number(query.rolls) : 1;
/** countMin：定义该变量以承载业务值。 */
    const countMin = Number.isInteger(query.countMin) && Number(query.countMin) > 0 ? Number(query.countMin) : 1;
/** countMax：定义该变量以承载业务值。 */
    const countMax = Number.isInteger(query.countMax) && Number(query.countMax) >= countMin ? Number(query.countMax) : countMin;
/** allowDuplicates：定义该变量以承载业务值。 */
    const allowDuplicates = query.allowDuplicates === true;
/** pool：定义该变量以承载业务值。 */
    const pool = [...candidates];
/** result：定义该变量以承载业务值。 */
    const result: ItemStack[] = [];

    for (let index = 0; index < rolls; index += 1) {
      if (pool.length === 0) {
        break;
      }
/** source：定义该变量以承载业务值。 */
      const source = allowDuplicates ? candidates : pool;
/** pickedIndex：定义该变量以承载业务值。 */
      const pickedIndex = Math.floor(Math.random() * source.length);
/** picked：定义该变量以承载业务值。 */
      const picked = source[pickedIndex];
      if (!picked) {
        continue;
      }
/** item：定义该变量以承载业务值。 */
      const item = this.createItem(picked.itemId, this.randomIntInclusive(countMin, countMax));
      if (item) {
        result.push(item);
      }
      if (!allowDuplicates) {
        pool.splice(pickedIndex, 1);
      }
    }

    return result;
  }

/** loadMonsters：执行对应的业务逻辑。 */
  private loadMonsters(): void {
    if (!fs.existsSync(this.monstersDir)) {
      return;
    }
    for (const raw of this.readJsonEntries<RawMonsterTemplate>(this.monstersDir)) {
      const configuredValueStats = this.normalizeItemStats(raw.valueStats);
      const hasConfiguredAttrs = raw.attrs && typeof raw.attrs === 'object';
      if (
        typeof raw.id !== 'string'
        || typeof raw.name !== 'string'
        || typeof raw.char !== 'string'
        || typeof raw.color !== 'string'
        || (!configuredValueStats && !hasConfiguredAttrs && (!Number.isInteger(raw.hp) || !Number.isInteger(raw.attack)))
      ) {
        continue;
      }
/** level：定义该变量以承载业务值。 */
      const level = Number.isInteger(raw.level) ? Math.max(1, Number(raw.level)) : undefined;
/** equipment：定义该变量以承载业务值。 */
      const equipment = this.normalizeMonsterEquipment(raw.equipment, raw.id);
/** skills：定义该变量以承载业务值。 */
      const skills = this.normalizeMonsterSkills(raw.skills, raw.id);
/** grade：定义该变量以承载业务值。 */
      const grade = raw.grade ?? 'mortal';
/** tier：定义该变量以承载业务值。 */
      const tier = normalizeMonsterTier(raw.tier ?? inferMonsterTierFromName(raw.name));
/** drops：定义该变量以承载业务值。 */
      const drops = this.buildMonsterDrops(raw.drops, equipment, {
        grade,
        tier,
        level,
        monsterId: raw.id,
      });
/** valueStats：定义该变量以承载业务值。 */
      const valueStats = configuredValueStats
        ?? (hasConfiguredAttrs
          ? undefined
          : inferMonsterValueStatsFromLegacy({
              maxHp: Number.isInteger(raw.maxHp) ? Math.max(1, Number(raw.maxHp)) : Math.max(1, Number(raw.hp ?? 1)),
              attack: Math.max(1, Number(raw.attack ?? 1)),
              level,
              viewRange: Number.isInteger(raw.viewRange)
                ? Math.max(0, Number(raw.viewRange))
                : (Number.isInteger(raw.aggroRange) ? Math.max(0, Number(raw.aggroRange)) : 6),
            }));
/** legacyNumericStats：定义该变量以承载业务值。 */
      const legacyNumericStats = valueStats
        ? resolveMonsterNumericStatsFromValueStats(valueStats, level)
        : resolveMonsterNumericStatsFromAttributes({
            attrs: raw.attrs,
            equipment,
            level,
          });
/** attrs：定义该变量以承载业务值。 */
      const attrs = normalizeMonsterAttrs(
        raw.attrs,
        raw.attrs ? undefined : inferMonsterAttrsFromNumericStats(legacyNumericStats),
      );
/** statPercents：定义该变量以承载业务值。 */
      const statPercents = normalizeMonsterStatPercents(raw.statPercents)
        ?? (raw.attrs
          ? undefined
          : createMonsterAutoStatPercents(legacyNumericStats, attrs, level, equipment));
/** initialBuffs：定义该变量以承载业务值。 */
      const initialBuffs = this.normalizeMonsterInitialBuffs(raw.initialBuffs);
/** numericStats：定义该变量以承载业务值。 */
      const numericStats = resolveMonsterNumericStatsFromAttributes({
        attrs,
        equipment,
        level,
        statPercents,
        grade,
        tier,
      });
/** combatModel：定义该变量以承载业务值。 */
      const combatModel: MonsterCombatModel = 'value_stats';
/** monster：定义该变量以承载业务值。 */
      const monster: MonsterTemplate = {
        id: raw.id,
        name: raw.name,
        char: raw.char,
        color: raw.color,
        grade,
        attrs,
        equipment,
        statPercents,
        initialBuffs,
        skills,
        tier,
        valueStats,
        numericStats,
        combatModel,
        hp: Math.max(1, Math.round(numericStats.maxHp || Number(raw.hp))),
        maxHp: Math.max(1, Math.round(numericStats.maxHp || (Number.isInteger(raw.maxHp) ? Number(raw.maxHp) : Number(raw.hp)))),
        attack: Math.max(1, Math.round(numericStats.physAtk || numericStats.spellAtk || Number(raw.attack) || 1)),
        count: Number.isInteger(raw.count)
          ? Math.max(1, Number(raw.count))
          : (Number.isInteger(raw.maxAlive) ? Math.max(1, Number(raw.maxAlive)) : 1),
        radius: Number.isInteger(raw.radius) ? Math.max(0, Number(raw.radius)) : 3,
        maxAlive: Number.isInteger(raw.maxAlive)
          ? Math.max(1, Number(raw.maxAlive))
          : (Number.isInteger(raw.count) ? Math.max(1, Number(raw.count)) : 1),
        aggroRange: Number.isInteger(raw.aggroRange) ? Math.max(0, Number(raw.aggroRange)) : 6,
        viewRange: Number.isInteger(raw.viewRange)
          ? Math.max(0, Number(raw.viewRange))
          : (Number.isInteger(raw.aggroRange) ? Math.max(0, Number(raw.aggroRange)) : 6),
        aggroMode: raw.aggroMode ?? 'always',
        respawnTicks: Number.isInteger(raw.respawnTicks)
          ? Math.max(1, Number(raw.respawnTicks))
          : Math.max(1, Number(raw.respawnSec ?? 15)),
        level,
        expMultiplier: resolveMonsterExpMultiplier(raw.expMultiplier, tier),
        drops,
      };
      this.monsters.set(monster.id, monster);
    }
  }

/** normalizeSkillEffects：执行对应的业务逻辑。 */
  private normalizeSkillEffects(input: unknown): SkillEffectDef[] {
    if (!Array.isArray(input)) {
      return [];
    }
    return input.flatMap((entry) => this.normalizeSkillEffect(entry));
  }

/** normalizeMonsterInitialBuffs：执行对应的业务逻辑。 */
  private normalizeMonsterInitialBuffs(input: unknown): MonsterInitialBuffDef[] | undefined {
    if (!Array.isArray(input)) {
      return undefined;
    }
/** result：定义该变量以承载业务值。 */
    const result = input.flatMap((entry) => this.normalizeMonsterInitialBuff(entry));
    return result.length > 0 ? result : undefined;
  }

/** normalizeMonsterInitialBuff：执行对应的业务逻辑。 */
  private normalizeMonsterInitialBuff(input: unknown): MonsterInitialBuffDef[] {
    if (!isPlainObject(input)) {
      return [];
    }
/** resolvedInput：定义该变量以承载业务值。 */
    const resolvedInput = this.resolveSharedTechniqueBuffInput(input);
/** effect：定义该变量以承载业务值。 */
    const effect = this.normalizeRawSkillBuffEffect({
      ...resolvedInput,
      type: 'buff',
      target: 'self',
    });
    if (!effect || effect.target !== 'self') {
      return [];
    }
    return [{
      type: 'buff',
      target: 'self',
      buffId: effect.buffId,
      name: effect.name,
      desc: effect.desc,
      shortMark: effect.shortMark,
      category: effect.category,
      visibility: effect.visibility,
      color: effect.color,
      duration: effect.duration,
      maxStacks: effect.maxStacks,
      stacks: Number.isFinite(input.stacks) ? Math.max(1, Math.floor(Number(input.stacks))) : undefined,
      attrs: effect.attrs,
      attrMode: effect.attrMode,
      stats: effect.stats,
      statMode: effect.statMode,
      qiProjection: effect.qiProjection,
      presentationScale: effect.presentationScale,
      infiniteDuration: effect.infiniteDuration,
      sustainCost: effect.sustainCost,
      expireWithBuffId: effect.expireWithBuffId,
    }];
  }

/** normalizeSkillEffect：执行对应的业务逻辑。 */
  private normalizeSkillEffect(input: unknown): SkillEffectDef[] {
    if (!isPlainObject(input) || typeof input.type !== 'string') {
      return [];
    }

    switch (input.type) {
      case 'damage':
        if (input.formula === undefined) {
          return [];
        }
        return [{
          type: 'damage',
/** damageKind：定义该变量以承载业务值。 */
          damageKind: input.damageKind === 'physical' || input.damageKind === 'spell' ? input.damageKind : undefined,
          element: ELEMENT_KEYS.includes(input.element as typeof ELEMENT_KEYS[number]) ? input.element as typeof ELEMENT_KEYS[number] : undefined,
          formula: input.formula as SkillFormula,
        }];
      case 'heal':
        if (input.formula === undefined) {
          return [];
        }
        return [{
          type: 'heal',
/** target：定义该变量以承载业务值。 */
          target: input.target === 'target' || input.target === 'allies' ? input.target : 'self',
          formula: input.formula as SkillFormula,
        }];
      case 'buff': {
/** resolvedInput：定义该变量以承载业务值。 */
        const resolvedInput = this.resolveSharedTechniqueBuffInput(input);
/** effect：定义该变量以承载业务值。 */
        const effect = this.normalizeRawSkillBuffEffect(resolvedInput);
        return effect ? [effect] : [];
      }
      case 'terrain': {
        if (!Number.isFinite(input.duration)) {
          return [];
        }
/** validTileTypes：定义该变量以承载业务值。 */
        const validTileTypes = Object.values(TileType);
/** terrainType：定义该变量以承载业务值。 */
        const terrainType = validTileTypes.includes(input.terrainType as TileType)
          ? input.terrainType as TileType
          : null;
        if (!terrainType) {
          return [];
        }
/** allowedOriginalTypes：定义该变量以承载业务值。 */
        const allowedOriginalTypes = Array.isArray(input.allowedOriginalTypes)
          ? input.allowedOriginalTypes.filter((entry): entry is TileType => validTileTypes.includes(entry as TileType))
          : [];
        return [{
          type: 'terrain',
          terrainType,
          duration: Math.max(1, Math.floor(Number(input.duration))),
          ...(allowedOriginalTypes.length > 0 ? { allowedOriginalTypes } : {}),
        }];
      }
      case 'cleanse':
        return [{
          type: 'cleanse',
/** target：定义该变量以承载业务值。 */
          target: input.target === 'target' ? 'target' : 'self',
/** category：定义该变量以承载业务值。 */
          category: input.category === 'buff' ? 'buff' : 'debuff',
          removeCount: Number.isFinite(input.removeCount) ? Math.max(1, Math.floor(Number(input.removeCount))) : 1,
        }];
      default:
        return [];
    }
  }

/** resolveSharedTechniqueBuffInput：执行对应的业务逻辑。 */
  private resolveSharedTechniqueBuffInput(input: Record<string, unknown>): Record<string, unknown> {
/** buffRef：定义该变量以承载业务值。 */
    const buffRef = typeof input.buffRef === 'string' && input.buffRef.trim().length > 0
      ? input.buffRef.trim()
      : null;
    if (!buffRef) {
      return input;
    }
/** template：定义该变量以承载业务值。 */
    const template = this.sharedTechniqueBuffs.get(buffRef);
    if (!template) {
      throw new Error(`共享功法 Buff 模板 ${buffRef} 不存在`);
    }
    return {
      ...template,
      ...input,
      type: 'buff',
    };
  }

  private normalizeRawSkillBuffEffect(input: Record<string, unknown>): Extract<SkillEffectDef, { type: 'buff' }> | null {
    if (
      (input.target !== 'self' && input.target !== 'target' && input.target !== 'allies')
      || typeof input.buffId !== 'string'
      || input.buffId.trim().length === 0
      || typeof input.name !== 'string'
      || !Number.isFinite(input.duration)
    ) {
      return null;
    }
    return {
      type: 'buff',
      target: input.target,
      buffId: input.buffId.trim(),
      name: input.name,
/** desc：定义该变量以承载业务值。 */
      desc: typeof input.desc === 'string' ? input.desc : undefined,
/** shortMark：定义该变量以承载业务值。 */
      shortMark: typeof input.shortMark === 'string' ? input.shortMark : undefined,
/** category：定义该变量以承载业务值。 */
      category: input.category === 'debuff' ? 'debuff' : input.category === 'buff' ? 'buff' : undefined,
/** visibility：定义该变量以承载业务值。 */
      visibility: input.visibility === 'hidden' || input.visibility === 'observe_only' || input.visibility === 'public'
        ? input.visibility
        : undefined,
/** color：定义该变量以承载业务值。 */
      color: typeof input.color === 'string' ? input.color : undefined,
      duration: Math.max(1, Math.floor(Number(input.duration))),
      stacks: Number.isFinite(input.stacks) ? Math.max(1, Math.floor(Number(input.stacks))) : undefined,
      maxStacks: Number.isFinite(input.maxStacks) ? Math.max(1, Math.floor(Number(input.maxStacks))) : undefined,
      attrs: this.normalizeItemAttrs(input.attrs),
      attrMode: this.normalizeBuffModifierMode(input.attrMode),
      stats: this.resolveConfiguredBuffStats(
        input.stats,
        input.valueStats,
        this.normalizeBuffModifierMode(input.statMode),
      ),
      statMode: this.normalizeBuffModifierMode(input.statMode),
      qiProjection: this.normalizeQiProjectionModifiers(input.qiProjection),
      presentationScale: Number.isFinite(input.presentationScale) ? Math.max(0, Number(input.presentationScale)) : undefined,
/** infiniteDuration：定义该变量以承载业务值。 */
      infiniteDuration: input.infiniteDuration === true,
      sustainCost: normalizeBuffSustainCost(input.sustainCost),
/** expireWithBuffId：定义该变量以承载业务值。 */
      expireWithBuffId: typeof input.expireWithBuffId === 'string' && input.expireWithBuffId.trim().length > 0
        ? input.expireWithBuffId.trim()
        : undefined,
    };
  }

/** loadStarterInventory：执行对应的业务逻辑。 */
  private loadStarterInventory(): void {
/** raw：定义该变量以承载业务值。 */
    const raw = JSON.parse(fs.readFileSync(this.starterInventoryPath, 'utf-8')) as { items?: StarterInventoryEntry[] };
    this.starterInventoryEntries = Array.isArray(raw.items) ? raw.items : [];
  }

/** loadRealmLevels：执行对应的业务逻辑。 */
  private loadRealmLevels(): void {
/** raw：定义该变量以承载业务值。 */
    const raw = JSON.parse(fs.readFileSync(this.realmLevelsPath, 'utf-8')) as RealmLevelsConfig;
/** expMultiplier：定义该变量以承载业务值。 */
    const expMultiplier = Number.isFinite(raw.expMultiplier) ? Math.max(0, Math.floor(raw.expMultiplier ?? 1)) : 1;
/** levels：定义该变量以承载业务值。 */
    const levels = (raw.levels ?? []).map((entry) => ({
      ...entry,
      lifespanYears: Number.isFinite(entry.lifespanYears) ? Math.max(1, Math.floor(entry.lifespanYears)) : 0,
/** expToNext：定义该变量以承载业务值。 */
      expToNext: entry.expToNext === undefined
        ? undefined
        : Math.max(0, Math.floor(entry.expToNext)) * expMultiplier,
    }));
    this.realmLevelsConfig = { ...raw, expMultiplier, levels };
    for (const entry of levels) {
      this.realmLevels.set(entry.realmLv, entry);
    }
  }

/** loadBreakthroughConfigs：执行对应的业务逻辑。 */
  private loadBreakthroughConfigs(): void {
/** raw：定义该变量以承载业务值。 */
    const raw = JSON.parse(fs.readFileSync(this.breakthroughConfigPath, 'utf-8')) as BreakthroughConfigFile;
    for (const transition of raw.transitions ?? []) {
      if (!Number.isInteger(transition.fromRealmLv)) continue;
      const fromRealmLv = Number(transition.fromRealmLv);
/** toRealmLv：定义该变量以承载业务值。 */
      const toRealmLv = Number.isInteger(transition.toRealmLv) ? Number(transition.toRealmLv) : fromRealmLv + 1;
/** requirements：定义该变量以承载业务值。 */
      const requirements = Array.isArray(transition.requirements)
        ? transition.requirements.flatMap((requirement) => this.normalizeBreakthroughRequirement(requirement))
        : [];
      this.breakthroughConfigs.set(fromRealmLv, {
        fromRealmLv,
        toRealmLv,
/** title：定义该变量以承载业务值。 */
        title: typeof transition.title === 'string' ? transition.title : undefined,
        requirements,
      });
    }
  }

/** normalizeBreakthroughRequirement：执行对应的业务逻辑。 */
  private normalizeBreakthroughRequirement(input: RawBreakthroughRequirement): BreakthroughRequirementDef[] {
    if (!input || typeof input !== 'object' || typeof input.id !== 'string') {
      return [];
    }
    if (input.type === 'item') {
      if (typeof input.itemId !== 'string' || !Number.isInteger(input.count)) return [];
      return [{
        id: input.id,
        type: 'item',
        itemId: input.itemId,
        count: Math.max(1, Number(input.count)),
/** label：定义该变量以承载业务值。 */
        label: typeof input.label === 'string' ? input.label : undefined,
/** hidden：定义该变量以承载业务值。 */
        hidden: input.hidden === true,
/** increaseAttrRequirementPct：定义该变量以承载业务值。 */
        increaseAttrRequirementPct: typeof input.increaseAttrRequirementPct === 'number' && Number.isFinite(input.increaseAttrRequirementPct)
          ? Math.max(0, Math.floor(input.increaseAttrRequirementPct))
          : undefined,
      }];
    }
    if (input.type === 'technique') {
      return [{
        id: input.id,
        type: 'technique',
/** techniqueId：定义该变量以承载业务值。 */
        techniqueId: typeof input.techniqueId === 'string' ? input.techniqueId : undefined,
        minGrade: input.minGrade,
        minLevel: Number.isInteger(input.minLevel) ? Math.max(1, Number(input.minLevel)) : undefined,
/** minRealm：定义该变量以承载业务值。 */
        minRealm: input.minRealm === undefined ? undefined : this.parseTechniqueRealm(input.minRealm),
        count: Number.isInteger(input.count) ? Math.max(1, Number(input.count)) : undefined,
/** label：定义该变量以承载业务值。 */
        label: typeof input.label === 'string' ? input.label : undefined,
/** hidden：定义该变量以承载业务值。 */
        hidden: input.hidden === true,
/** increaseAttrRequirementPct：定义该变量以承载业务值。 */
        increaseAttrRequirementPct: typeof input.increaseAttrRequirementPct === 'number' && Number.isFinite(input.increaseAttrRequirementPct)
          ? Math.max(0, Math.floor(input.increaseAttrRequirementPct))
          : undefined,
      }];
    }
    if (input.type === 'attribute') {
      if (!ATTR_KEYS.includes(input.attr) || !Number.isFinite(input.minValue)) {
        return [];
      }
      return [{
        id: input.id,
        type: 'attribute',
        attr: input.attr,
        minValue: Math.max(1, Math.floor(input.minValue)),
/** label：定义该变量以承载业务值。 */
        label: typeof input.label === 'string' ? input.label : undefined,
/** hidden：定义该变量以承载业务值。 */
        hidden: input.hidden === true,
      }];
    }
    if (input.type === 'root') {
      if (!Number.isFinite(input.minValue)) {
        return [];
      }
      return [{
        id: input.id,
        type: 'root',
        element: input.element && ELEMENT_KEYS.includes(input.element) ? input.element : undefined,
        minValue: Math.max(1, Math.floor(input.minValue)),
/** label：定义该变量以承载业务值。 */
        label: typeof input.label === 'string' ? input.label : undefined,
/** hidden：定义该变量以承载业务值。 */
        hidden: input.hidden === true,
      }];
    }
    return [];
  }

/** readJsonEntries：执行对应的业务逻辑。 */
  private readJsonEntries<T>(dirPath: string): T[] {
/** result：定义该变量以承载业务值。 */
    const result: T[] = [];
    for (const filePath of this.collectJsonFiles(dirPath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T[];
      result.push(...raw);
    }
    return result;
  }

/** collectJsonFiles：执行对应的业务逻辑。 */
  private collectJsonFiles(dirPath: string): string[] {
/** entries：定义该变量以承载业务值。 */
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
/** files：定义该变量以承载业务值。 */
    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.collectJsonFiles(entryPath));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(entryPath);
      }
    }
    return files;
  }

/** parseTechniqueRealm：执行对应的业务逻辑。 */
  private parseTechniqueRealm(value: keyof typeof TechniqueRealm | TechniqueRealm): TechniqueRealm {
    if (typeof value === 'number') {
      return value;
    }
    return TechniqueRealm[value];
  }

/** parsePlayerRealmStage：执行对应的业务逻辑。 */
  private parsePlayerRealmStage(value: keyof typeof PlayerRealmStage | PlayerRealmStage): PlayerRealmStage {
    if (typeof value === 'number') {
      return value;
    }
    return PlayerRealmStage[value];
  }

  /** 获取新角色初始背包 */
  getStarterInventory(): Inventory {
    this.ensureLoaded();
    return this.normalizeInventory({
      capacity: DEFAULT_INVENTORY_CAPACITY,
      items: this.starterInventoryEntries
        .map((entry) => this.createItem(entry.itemId, entry.count ?? 1))
        .filter((item): item is ItemStack => item !== null),
    });
  }

  /** 根据物品 ID 创建物品栈 */
  createItem(itemId: string, count = 1): ItemStack | null {
    this.ensureLoaded();
/** item：定义该变量以承载业务值。 */
    const item = this.items.get(this.resolveItemIdAlias(itemId));
    if (!item) return null;
    return this.createItemStackFromTemplate(item, count);
  }

  /** 规范化物品栈：用模板数据补全字段 */
  normalizeItemStack(item: ItemStack): ItemStack {
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.createItem(item.itemId, item.count);
    if (!normalized) {
      return applyEnhancementToItemStack({
        ...item,
        enhanceLevel: normalizeEnhanceLevel(item.enhanceLevel),
      });
    }
    return applyEnhancementToItemStack({
      ...item,
      ...normalized,
      count: normalized.count,
      enhanceLevel: normalizeEnhanceLevel(item.enhanceLevel),
    });
  }

  /** 规范化背包：合并同类物品、补全模板数据 */
  normalizeInventory(inventory: Inventory): Inventory {
/** mergedItems：定义该变量以承载业务值。 */
    const mergedItems: ItemStack[] = [];
/** mergedIndex：定义该变量以承载业务值。 */
    const mergedIndex = new Map<string, ItemStack>();
    for (const item of inventory.items.map((entry) => this.normalizeItemStack(entry))) {
      if (item.count <= 0) {
        continue;
      }
/** signature：定义该变量以承载业务值。 */
      const signature = createItemStackSignature(item);
/** existing：定义该变量以承载业务值。 */
      const existing = mergedIndex.get(signature);
      if (existing) {
        existing.count += item.count;
        continue;
      }
/** created：定义该变量以承载业务值。 */
      const created = { ...item };
      mergedIndex.set(signature, created);
      mergedItems.push(created);
    }

    return {
      capacity: Math.max(DEFAULT_INVENTORY_CAPACITY, Number.isFinite(inventory.capacity) ? inventory.capacity : 0),
      items: mergedItems,
    };
  }

  /** 规范化装备槽数据 */
  normalizeEquipment(equipment: EquipmentSlots): EquipmentSlots {
/** normalized：定义该变量以承载业务值。 */
    const normalized = { weapon: null, head: null, body: null, legs: null, accessory: null } as EquipmentSlots;
    for (const slot of EQUIP_SLOTS) {
      const item = equipment[slot];
      normalized[slot] = item ? { ...this.normalizeItemStack(item), count: 1 } : null;
    }
    return normalized;
  }

/** normalizeMonsterSkills：执行对应的业务逻辑。 */
  normalizeMonsterSkills(skills: unknown, monsterId?: string): string[] {
    if (!Array.isArray(skills)) {
      return [];
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized: string[] = [];
/** seen：定义该变量以承载业务值。 */
    const seen = new Set<string>();
    for (const entry of skills) {
      if (typeof entry !== 'string') {
        continue;
      }
/** skillId：定义该变量以承载业务值。 */
      const skillId = entry.trim();
      if (!skillId || seen.has(skillId)) {
        continue;
      }
      if (!this.getSkill(skillId)) {
        this.logger.warn(`怪物 ${monsterId ?? 'unknown'} 配置了不存在的技能 ${skillId}，已忽略`);
        continue;
      }
      seen.add(skillId);
      normalized.push(skillId);
    }
    return normalized;
  }

  /** getItem：执行对应的业务逻辑。 */
  getItem(itemId: string): ItemTemplate | undefined {
    this.ensureLoaded();
    return this.items.get(this.resolveItemIdAlias(itemId));
  }

/** resolveItemIdAlias：执行对应的业务逻辑。 */
  private resolveItemIdAlias(itemId: string): string {
    return LEGACY_ITEM_ID_ALIASES[itemId] ?? itemId;
  }

/** getMonsterTemplate：执行对应的业务逻辑。 */
  getMonsterTemplate(monsterId: string): MonsterTemplate | undefined {
    this.ensureLoaded();
    return this.monsters.get(monsterId);
  }

/** getTechnique：执行对应的业务逻辑。 */
  getTechnique(techniqueId: string): TechniqueTemplate | undefined {
    return this.techniques.get(techniqueId);
  }

/** getItemSortLevel：执行对应的业务逻辑。 */
  getItemSortLevel(item: Pick<ItemStack, 'itemId' | 'level'>): number {
/** template：定义该变量以承载业务值。 */
    const template = this.getItem(item.itemId);
    if (template?.learnTechniqueId) {
/** technique：定义该变量以承载业务值。 */
      const technique = this.getTechnique(template.learnTechniqueId);
/** techniqueRealmLv：定义该变量以承载业务值。 */
      const techniqueRealmLv = technique?.realmLv;
      if (Number.isFinite(techniqueRealmLv)) {
        return Math.max(1, Math.floor(Number(techniqueRealmLv)));
      }
    }
    if (Number.isFinite(item.level)) {
      return Math.max(1, Math.floor(Number(item.level)));
    }
    if (!template) {
      return 1;
    }
    return this.getEffectiveItemLevel(template);
  }

/** getRealmLevelsConfig：执行对应的业务逻辑。 */
  getRealmLevelsConfig(): RealmLevelsConfig | null {
    return this.realmLevelsConfig;
  }

/** getRealmLevelEntry：执行对应的业务逻辑。 */
  getRealmLevelEntry(realmLv: number): RealmLevelEntry | undefined {
    return this.realmLevels.get(realmLv);
  }

/** getEditorTechniqueCatalog：执行对应的业务逻辑。 */
  getEditorTechniqueCatalog(): EditorTechniqueCatalogEntry[] {
    return [...this.techniques.values()]
      .map((technique) => ({
        id: technique.id,
        name: technique.name,
        grade: technique.grade,
        category: technique.category,
        realmLv: technique.realmLv,
        skills: JSON.parse(JSON.stringify(technique.skills)) as SkillDef[],
        layers: JSON.parse(JSON.stringify(technique.layers)) as TechniqueLayerDef[],
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

/** getEditorItemCatalog：执行对应的业务逻辑。 */
  getEditorItemCatalog(): EditorItemCatalogEntry[] {
    return [...this.items.values()]
      .map((item) => ({
        itemId: item.itemId,
        name: item.name,
        type: item.type,
        groundLabel: item.groundLabel,
        grade: item.grade,
        level: item.level,
        equipSlot: item.equipSlot,
        desc: item.desc,
        equipAttrs: item.equipAttrs ? JSON.parse(JSON.stringify(item.equipAttrs)) as NonNullable<ItemStack['equipAttrs']> : undefined,
        equipStats: item.equipStats ? JSON.parse(JSON.stringify(item.equipStats)) as NonNullable<ItemStack['equipStats']> : undefined,
        equipValueStats: item.equipValueStats
          ? JSON.parse(JSON.stringify(item.equipValueStats)) as NonNullable<ItemStack['equipValueStats']>
          : undefined,
        tags: item.tags ? [...item.tags] : undefined,
        effects: item.effects ? JSON.parse(JSON.stringify(item.effects)) as EquipmentEffectDef[] : undefined,
        enhanceLevel: item.enhanceLevel,
        alchemySuccessRate: item.alchemySuccessRate,
        alchemySpeedRate: item.alchemySpeedRate,
        enhancementSuccessRate: item.enhancementSuccessRate,
        enhancementSpeedRate: item.enhancementSpeedRate,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

/** getEditorRealmCatalog：执行对应的业务逻辑。 */
  getEditorRealmCatalog(): RealmLevelEntry[] {
    return [...this.realmLevels.values()].sort((left, right) => left.realmLv - right.realmLv);
  }

  getRealmLevelRange(stage: PlayerRealmStage): { levelFrom: number; levelTo: number } {
    return PLAYER_REALM_STAGE_LEVEL_RANGES[stage] ?? PLAYER_REALM_STAGE_LEVEL_RANGES[PlayerRealmStage.Mortal];
  }

/** getBreakthroughConfig：执行对应的业务逻辑。 */
  getBreakthroughConfig(fromRealmLv: number): BreakthroughConfigEntry | undefined {
    return this.breakthroughConfigs.get(fromRealmLv);
  }

/** getMaxConfiguredBreakthroughRealmLv：执行对应的业务逻辑。 */
  getMaxConfiguredBreakthroughRealmLv(): number {
/** maxRealmLv：定义该变量以承载业务值。 */
    let maxRealmLv = 1;
    for (const config of this.breakthroughConfigs.values()) {
      if (Number.isInteger(config.toRealmLv) && config.toRealmLv > maxRealmLv) {
        maxRealmLv = config.toRealmLv;
      }
    }
    return maxRealmLv;
  }

/** getRealmStageStartEntry：执行对应的业务逻辑。 */
  getRealmStageStartEntry(stage: PlayerRealmStage): RealmLevelEntry | undefined {
    return this.getRealmLevelEntry(this.getRealmLevelRange(stage).levelFrom);
  }

  /** 根据境界阶段和修炼进度解析对应的境界等级条目 */
  resolveRealmLevelEntry(
    stage: PlayerRealmStage,
    progress = 0,
    progressToNext = 0,
    breakthroughReady = false,
  ): RealmLevelEntry {
/** range：定义该变量以承载业务值。 */
    const range = this.getRealmLevelRange(stage);
/** span：定义该变量以承载业务值。 */
    const span = Math.max(1, range.levelTo - range.levelFrom + 1);
/** realmLv：定义该变量以承载业务值。 */
    let realmLv = range.levelFrom;

    if (span > 1) {
      if (breakthroughReady || progressToNext <= 0) {
        realmLv = range.levelTo;
      } else {
/** normalized：定义该变量以承载业务值。 */
        const normalized = Math.max(0, Math.min(progress / progressToNext, 0.999999));
        realmLv = range.levelFrom + Math.min(span - 1, Math.floor(normalized * span));
      }
    }

    return this.realmLevels.get(realmLv)
      ?? this.realmLevels.get(range.levelFrom)
      ?? {
        realmLv: range.levelFrom,
        displayName: '未知境界',
        name: '未知境界',
        phaseName: null,
        segment: 'martial',
        path: 'martial',
        grade: 'mortal',
        gradeLabel: '凡阶',
        review: '',
        lifespanYears: 0,
      };
  }

  /** 跨功法全局查找技能定义 */
  getSkill(skillId: string): SkillDef | undefined {
    for (const technique of this.techniques.values()) {
      const skill = technique.skills.find((entry) => entry.id === skillId);
      if (skill) return skill;
    }
    return undefined;
  }
}
