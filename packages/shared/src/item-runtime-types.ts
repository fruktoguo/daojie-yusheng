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
/**
 * mode：EquipmentConditionGroup 内部字段。
 */

  mode?: 'all' | 'any';  
  /**
 * items：EquipmentConditionGroup 内部字段。
 */

  items: EquipmentConditionDef[];
}

/** 装备条件定义。 */
export type EquipmentConditionDef =
  | {  
  /**
 * type：对象字段。
 */
 type: 'time_segment';  
 /**
 * in：对象字段。
 */
 in: TimePhaseId[] }
  | {  
  /**
 * type：对象字段。
 */
 type: 'map';  
 /**
 * mapIds：对象字段。
 */
 mapIds: string[] }
  | {  
  /**
 * type：对象字段。
 */
 type: 'hp_ratio';  
 /**
 * op：对象字段。
 */
 op: '<=' | '>=';  
 /**
 * value：对象字段。
 */
 value: number }
  | {  
  /**
 * type：对象字段。
 */
 type: 'qi_ratio';  
 /**
 * op：对象字段。
 */
 op: '<=' | '>=';  
 /**
 * value：对象字段。
 */
 value: number }
  | {  
  /**
 * type：对象字段。
 */
 type: 'is_cultivating';  
 /**
 * value：对象字段。
 */
 value: boolean }
  | {  
  /**
 * type：对象字段。
 */
 type: 'has_buff';  
 /**
 * buffId：对象字段。
 */
 buffId: string;  
 /**
 * minStacks：对象字段。
 */
 minStacks?: number }
  | {  
  /**
 * type：对象字段。
 */
 type: 'target_kind';  
 /**
 * in：对象字段。
 */
 in: Array<'monster' | 'player' | 'tile'> };

/** 装备 Buff 定义。 */
export interface EquipmentBuffDef {
/**
 * buffId：EquipmentBuffDef 内部字段。
 */

  buffId: string;  
  /**
 * name：EquipmentBuffDef 内部字段。
 */

  name: string;  
  /**
 * desc：EquipmentBuffDef 内部字段。
 */

  desc?: string;  
  /**
 * shortMark：EquipmentBuffDef 内部字段。
 */

  shortMark?: string;  
  /**
 * category：EquipmentBuffDef 内部字段。
 */

  category?: BuffCategory;  
  /**
 * visibility：EquipmentBuffDef 内部字段。
 */

  visibility?: BuffVisibility;  
  /**
 * color：EquipmentBuffDef 内部字段。
 */

  color?: string;  
  /**
 * duration：EquipmentBuffDef 内部字段。
 */

  duration: number;  
  /**
 * stacks：EquipmentBuffDef 内部字段。
 */

  stacks?: number;  
  /**
 * maxStacks：EquipmentBuffDef 内部字段。
 */

  maxStacks?: number;  
  /**
 * attrs：EquipmentBuffDef 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * stats：EquipmentBuffDef 内部字段。
 */

  stats?: PartialNumericStats;  
  /**
 * qiProjection：EquipmentBuffDef 内部字段。
 */

  qiProjection?: QiProjectionModifier[];  
  /**
 * valueStats：EquipmentBuffDef 内部字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * presentationScale：EquipmentBuffDef 内部字段。
 */

  presentationScale?: number;
}

/** Buff 维持代价定义。 */
export interface BuffSustainCostDef {
/**
 * resource：BuffSustainCostDef 内部字段。
 */

  resource: 'hp' | 'qi';  
  /**
 * baseCost：BuffSustainCostDef 内部字段。
 */

  baseCost: number;  
  /**
 * growthRate：BuffSustainCostDef 内部字段。
 */

  growthRate?: number;
}

/** 消耗品施加的 Buff 定义。 */
export interface ConsumableBuffDef {
/**
 * buffId：ConsumableBuffDef 内部字段。
 */

  buffId: string;  
  /**
 * name：ConsumableBuffDef 内部字段。
 */

  name: string;  
  /**
 * desc：ConsumableBuffDef 内部字段。
 */

  desc?: string;  
  /**
 * shortMark：ConsumableBuffDef 内部字段。
 */

  shortMark?: string;  
  /**
 * category：ConsumableBuffDef 内部字段。
 */

  category?: BuffCategory;  
  /**
 * visibility：ConsumableBuffDef 内部字段。
 */

  visibility?: BuffVisibility;  
  /**
 * color：ConsumableBuffDef 内部字段。
 */

  color?: string;  
  /**
 * duration：ConsumableBuffDef 内部字段。
 */

  duration: number;  
  /**
 * maxStacks：ConsumableBuffDef 内部字段。
 */

  maxStacks?: number;  
  /**
 * attrs：ConsumableBuffDef 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * stats：ConsumableBuffDef 内部字段。
 */

  stats?: PartialNumericStats;  
  /**
 * qiProjection：ConsumableBuffDef 内部字段。
 */

  qiProjection?: QiProjectionModifier[];  
  /**
 * valueStats：ConsumableBuffDef 内部字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * presentationScale：ConsumableBuffDef 内部字段。
 */

  presentationScale?: number;  
  /**
 * infiniteDuration：ConsumableBuffDef 内部字段。
 */

  infiniteDuration?: boolean;  
  /**
 * sustainCost：ConsumableBuffDef 内部字段。
 */

  sustainCost?: BuffSustainCostDef;  
  /**
 * expireWithBuffId：ConsumableBuffDef 内部字段。
 */

  expireWithBuffId?: string;  
  /**
 * sourceSkillId：ConsumableBuffDef 内部字段。
 */

  sourceSkillId?: string;
}

/** 装备常驻数值效果。 */
export interface EquipmentStatAuraEffectDef {
/**
 * effectId：EquipmentStatAuraEffectDef 内部字段。
 */

  effectId?: string;  
  /**
 * type：EquipmentStatAuraEffectDef 内部字段。
 */

  type: 'stat_aura';  
  /**
 * conditions：EquipmentStatAuraEffectDef 内部字段。
 */

  conditions?: EquipmentConditionGroup;  
  /**
 * attrs：EquipmentStatAuraEffectDef 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * stats：EquipmentStatAuraEffectDef 内部字段。
 */

  stats?: PartialNumericStats;  
  /**
 * qiProjection：EquipmentStatAuraEffectDef 内部字段。
 */

  qiProjection?: QiProjectionModifier[];  
  /**
 * valueStats：EquipmentStatAuraEffectDef 内部字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * presentationScale：EquipmentStatAuraEffectDef 内部字段。
 */

  presentationScale?: number;
}

/** 装备成长推进效果。 */
export interface EquipmentProgressEffectDef {
/**
 * effectId：EquipmentProgressEffectDef 内部字段。
 */

  effectId?: string;  
  /**
 * type：EquipmentProgressEffectDef 内部字段。
 */

  type: 'progress_boost';  
  /**
 * conditions：EquipmentProgressEffectDef 内部字段。
 */

  conditions?: EquipmentConditionGroup;  
  /**
 * attrs：EquipmentProgressEffectDef 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * stats：EquipmentProgressEffectDef 内部字段。
 */

  stats?: PartialNumericStats;  
  /**
 * qiProjection：EquipmentProgressEffectDef 内部字段。
 */

  qiProjection?: QiProjectionModifier[];  
  /**
 * valueStats：EquipmentProgressEffectDef 内部字段。
 */

  valueStats?: PartialNumericStats;
}

/** 装备持续代价效果。 */
export interface EquipmentPeriodicCostEffectDef {
/**
 * effectId：EquipmentPeriodicCostEffectDef 内部字段。
 */

  effectId?: string;  
  /**
 * type：EquipmentPeriodicCostEffectDef 内部字段。
 */

  type: 'periodic_cost';  
  /**
 * trigger：EquipmentPeriodicCostEffectDef 内部字段。
 */

  trigger: 'on_tick' | 'on_cultivation_tick';  
  /**
 * conditions：EquipmentPeriodicCostEffectDef 内部字段。
 */

  conditions?: EquipmentConditionGroup;  
  /**
 * resource：EquipmentPeriodicCostEffectDef 内部字段。
 */

  resource: 'hp' | 'qi';  
  /**
 * mode：EquipmentPeriodicCostEffectDef 内部字段。
 */

  mode: 'flat' | 'max_ratio_bp' | 'current_ratio_bp';  
  /**
 * value：EquipmentPeriodicCostEffectDef 内部字段。
 */

  value: number;  
  /**
 * minRemain：EquipmentPeriodicCostEffectDef 内部字段。
 */

  minRemain?: number;
}

/** 装备触发 Buff 效果。 */
export interface EquipmentTimedBuffEffectDef {
/**
 * effectId：EquipmentTimedBuffEffectDef 内部字段。
 */

  effectId?: string;  
  /**
 * type：EquipmentTimedBuffEffectDef 内部字段。
 */

  type: 'timed_buff';  
  /**
 * trigger：EquipmentTimedBuffEffectDef 内部字段。
 */

  trigger: EquipmentTrigger;  
  /**
 * target：EquipmentTimedBuffEffectDef 内部字段。
 */

  target?: 'self' | 'target';  
  /**
 * cooldown：EquipmentTimedBuffEffectDef 内部字段。
 */

  cooldown?: number;  
  /**
 * chance：EquipmentTimedBuffEffectDef 内部字段。
 */

  chance?: number;  
  /**
 * conditions：EquipmentTimedBuffEffectDef 内部字段。
 */

  conditions?: EquipmentConditionGroup;  
  /**
 * buff：EquipmentTimedBuffEffectDef 内部字段。
 */

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
/**
 * itemId：ItemStack 内部字段。
 */

  itemId: string;  
  /**
 * name：ItemStack 内部字段。
 */

  name: string;  
  /**
 * type：ItemStack 内部字段。
 */

  type: ItemType;  
  /**
 * count：ItemStack 内部字段。
 */

  count: number;  
  /**
 * desc：ItemStack 内部字段。
 */

  desc: string;  
  /**
 * groundLabel：ItemStack 内部字段。
 */

  groundLabel?: string;  
  /**
 * grade：ItemStack 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * level：ItemStack 内部字段。
 */

  level?: number;  
  /**
 * equipSlot：ItemStack 内部字段。
 */

  equipSlot?: EquipSlot;  
  /**
 * equipAttrs：ItemStack 内部字段。
 */

  equipAttrs?: Partial<Attributes>;  
  /**
 * equipStats：ItemStack 内部字段。
 */

  equipStats?: PartialNumericStats;  
  /**
 * equipValueStats：ItemStack 内部字段。
 */

  equipValueStats?: PartialNumericStats;  
  /**
 * effects：ItemStack 内部字段。
 */

  effects?: EquipmentEffectDef[];  
  /**
 * healAmount：ItemStack 内部字段。
 */

  healAmount?: number;  
  /**
 * healPercent：ItemStack 内部字段。
 */

  healPercent?: number;  
  /**
 * qiPercent：ItemStack 内部字段。
 */

  qiPercent?: number;  
  /**
 * cooldown：ItemStack 内部字段。
 */

  cooldown?: number;  
  /**
 * consumeBuffs：ItemStack 内部字段。
 */

  consumeBuffs?: ConsumableBuffDef[];  
  /**
 * tags：ItemStack 内部字段。
 */

  tags?: string[];  
  /**
 * enhanceLevel：ItemStack 内部字段。
 */

  enhanceLevel?: number;  
  /**
 * alchemySuccessRate：ItemStack 内部字段。
 */

  alchemySuccessRate?: number;  
  /**
 * alchemySpeedRate：ItemStack 内部字段。
 */

  alchemySpeedRate?: number;  
  /**
 * mapUnlockId：ItemStack 内部字段。
 */

  mapUnlockId?: string;  
  /**
 * mapUnlockIds：ItemStack 内部字段。
 */

  mapUnlockIds?: string[];  
  /**
 * tileAuraGainAmount：ItemStack 内部字段。
 */

  tileAuraGainAmount?: number;  
  /**
 * allowBatchUse：ItemStack 内部字段。
 */

  allowBatchUse?: boolean;
}

/** 背包。 */
export interface Inventory {
/**
 * items：Inventory 内部字段。
 */

  items: ItemStack[];  
  /**
 * capacity：Inventory 内部字段。
 */

  capacity: number;  
  /**
 * cooldowns：Inventory 内部字段。
 */

  cooldowns?: InventoryItemCooldownState[];  
  /**
 * serverTick：Inventory 内部字段。
 */

  serverTick?: number;
}

/** 背包内物品的运行时冷却态。 */
export interface InventoryItemCooldownState {
/**
 * itemId：InventoryItemCooldownState 内部字段。
 */

  itemId: string;  
  /**
 * cooldown：InventoryItemCooldownState 内部字段。
 */

  cooldown: number;  
  /**
 * startedAtTick：InventoryItemCooldownState 内部字段。
 */

  startedAtTick: number;
}

/** 装备槽位映射。 */
export type EquipmentSlots = Record<EquipSlot, ItemStack | null>;
