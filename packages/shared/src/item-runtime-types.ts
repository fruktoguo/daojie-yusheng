import type { PartialNumericStats } from './numeric';
import type { QiProjectionModifier } from './qi';
import type { Attributes } from './attribute-types';
import type { TechniqueGrade } from './cultivation-types';
import type { BuffCategory, BuffModifierMode, BuffVisibility, TimePhaseId } from './world-core-types';

/** 物品类型。 */
export type ItemType = 'consumable' | 'equipment' | 'material' | 'quest_item' | 'skill_book';

/** 装备槽位。 */
export type EquipSlot = 'weapon' | 'head' | 'body' | 'legs' | 'accessory';

/** 装备效果触发器。 */
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

/** 装备条件组合。 */
export interface EquipmentConditionGroup {
  mode?: 'all' | 'any';
  items: EquipmentConditionDef[];
}

/** 装备条件定义。 */
export type EquipmentConditionDef =
  | { type: 'time_segment'; in: TimePhaseId[] }
  | { type: 'map'; mapIds: string[] }
  | { type: 'hp_ratio'; op: '<=' | '>='; value: number }
  | { type: 'qi_ratio'; op: '<=' | '>='; value: number }
  | { type: 'is_cultivating'; value: boolean }
  | { type: 'has_buff'; buffId: string; minStacks?: number }
  | { type: 'target_kind'; in: Array<'monster' | 'player' | 'tile'> };

/** 装备 Buff 定义。 */
export interface EquipmentBuffDef {
  buffId: string;
  name: string;
  desc?: string;
  shortMark?: string;
  category?: BuffCategory;
  visibility?: BuffVisibility;
  color?: string;
  duration: number;
  stacks?: number;
  maxStacks?: number;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
  presentationScale?: number;
}

/** Buff 维持代价定义。 */
export interface BuffSustainCostDef {
  resource: 'hp' | 'qi';
  baseCost: number;
  growthRate?: number;
}

/** 消耗品施加的 Buff 定义。 */
export interface ConsumableBuffDef {
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
  presentationScale?: number;
  infiniteDuration?: boolean;
  sustainCost?: BuffSustainCostDef;
  expireWithBuffId?: string;
  sourceSkillId?: string;
}

/** 装备常驻数值效果。 */
export interface EquipmentStatAuraEffectDef {
  effectId?: string;
  type: 'stat_aura';
  conditions?: EquipmentConditionGroup;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
  presentationScale?: number;
}

/** 装备成长推进效果。 */
export interface EquipmentProgressEffectDef {
  effectId?: string;
  type: 'progress_boost';
  conditions?: EquipmentConditionGroup;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
}

/** 装备持续代价效果。 */
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

/** 装备触发 Buff 效果。 */
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

/** 装备效果联合类型。 */
export type EquipmentEffectDef =
  | EquipmentStatAuraEffectDef
  | EquipmentProgressEffectDef
  | EquipmentPeriodicCostEffectDef
  | EquipmentTimedBuffEffectDef;

/** 物品堆叠。 */
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
  mapUnlockIds?: string[];
  tileAuraGainAmount?: number;
  allowBatchUse?: boolean;
}

/** 背包。 */
export interface Inventory {
  items: ItemStack[];
  capacity: number;
  cooldowns?: InventoryItemCooldownState[];
  serverTick?: number;
}

/** 背包内物品的运行时冷却态。 */
export interface InventoryItemCooldownState {
  itemId: string;
  cooldown: number;
  startedAtTick: number;
}

/** 装备槽位映射。 */
export type EquipmentSlots = Record<EquipSlot, ItemStack | null>;
