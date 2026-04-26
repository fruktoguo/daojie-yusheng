import type { PartialNumericStats } from './numeric';
import type { QiProjectionModifier } from './qi';
import type { Attributes } from './attribute-types';
import type { TechniqueGrade } from './cultivation-types';
import type { BuffCategory, BuffModifierMode, BuffVisibility, TimePhaseId } from './world-core-types';

/** 物品类型。 */
export type ItemType = 'consumable' | 'equipment' | 'material' | 'quest_item' | 'skill_book';

/** 通用阵盘品阶。 */
export type ItemFormationDiskTier = 'mortal' | 'yellow' | 'mystic' | 'earth';

/** 装备槽位。 */
export type EquipSlot = 'weapon' | 'head' | 'body' | 'legs' | 'accessory';

/** 地块资源增益定义。 */
export interface TileResourceGainDef {
/**
 * resourceKey：地块资源键。
 */

  resourceKey: string;
  /**
 * amount：数量或计量字段。
 */

  amount: number;
}

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
 * mode：mode相关字段。
 */

  mode?: 'all' | 'any';  
  /**
 * items：集合字段。
 */

  items: EquipmentConditionDef[];
}

/** 装备条件定义。 */
export type EquipmentConditionDef =
  | {  
  /**
 * type：type相关字段。
 */
 type: 'time_segment';  
 /**
 * in：in相关字段。
 */
 in: TimePhaseId[] }
  | {  
  /**
 * type：type相关字段。
 */
 type: 'map';  
 /**
 * mapIds：地图ID相关字段。
 */
 mapIds: string[] }
  | {  
  /**
 * type：type相关字段。
 */
 type: 'hp_ratio';  
 /**
 * op：op相关字段。
 */
 op: '<=' | '>=';  
 /**
 * value：值数值。
 */
 value: number }
  | {  
  /**
 * type：type相关字段。
 */
 type: 'qi_ratio';  
 /**
 * op：op相关字段。
 */
 op: '<=' | '>=';  
 /**
 * value：值数值。
 */
 value: number }
  | {  
  /**
 * type：type相关字段。
 */
 type: 'is_cultivating';  
 /**
 * value：值数值。
 */
 value: boolean }
  | {  
  /**
 * type：type相关字段。
 */
 type: 'has_buff';  
 /**
 * buffId：buffID标识。
 */
 buffId: string;  
 /**
 * minStacks：minStack相关字段。
 */
 minStacks?: number }
  | {  
  /**
 * type：type相关字段。
 */
 type: 'target_kind';  
 /**
 * in：in相关字段。
 */
 in: Array<'monster' | 'player' | 'tile'> };

/** 装备 Buff 定义。 */
export interface EquipmentBuffDef {
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

  shortMark?: string;  
  /**
 * category：category相关字段。
 */

  category?: BuffCategory;  
  /**
 * visibility：可见性相关字段。
 */

  visibility?: BuffVisibility;  
  /**
 * color：color相关字段。
 */

  color?: string;  
  /**
 * duration：duration相关字段。
 */

  duration: number;  
  /**
 * stacks：stack相关字段。
 */

  stacks?: number;  
  /**
 * maxStacks：maxStack相关字段。
 */

  maxStacks?: number;  
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
 * valueStats：值Stat相关字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * presentationScale：presentationScale相关字段。
 */

  presentationScale?: number;
}

/** Buff 维持代价定义。 */
export interface BuffSustainCostDef {
/**
 * resource：resource相关字段。
 */

  resource: 'hp' | 'qi';  
  /**
 * baseCost：base消耗数值。
 */

  baseCost: number;  
  /**
 * growthRate：growthRate数值。
 */

  growthRate?: number;
}

/** 消耗品施加的 Buff 定义。 */
export interface ConsumableBuffDef {
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

  shortMark?: string;  
  /**
 * category：category相关字段。
 */

  category?: BuffCategory;  
  /**
 * visibility：可见性相关字段。
 */

  visibility?: BuffVisibility;  
  /**
 * color：color相关字段。
 */

  color?: string;  
  /**
 * duration：duration相关字段。
 */

  duration: number;  
  /**
 * maxStacks：maxStack相关字段。
 */

  maxStacks?: number;  
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
 * valueStats：值Stat相关字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * presentationScale：presentationScale相关字段。
 */

  presentationScale?: number;  
  /**
 * infiniteDuration：infiniteDuration相关字段。
 */

  infiniteDuration?: boolean;  
  /**
 * sustainCost：sustain消耗数值。
 */

  sustainCost?: BuffSustainCostDef;  
  /**
 * expireWithBuffId：expireWithBuffID标识。
 */

  expireWithBuffId?: string;  
  /**
 * sourceSkillId：来源技能ID标识。
 */

  sourceSkillId?: string;
}

/** 装备常驻数值效果。 */
export interface EquipmentStatAuraEffectDef {
/**
 * effectId：effectID标识。
 */

  effectId?: string;  
  /**
 * type：type相关字段。
 */

  type: 'stat_aura';  
  /**
 * conditions：condition相关字段。
 */

  conditions?: EquipmentConditionGroup;  
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
 * valueStats：值Stat相关字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * presentationScale：presentationScale相关字段。
 */

  presentationScale?: number;
}

/** 装备成长推进效果。 */
export interface EquipmentProgressEffectDef {
/**
 * effectId：effectID标识。
 */

  effectId?: string;  
  /**
 * type：type相关字段。
 */

  type: 'progress_boost';  
  /**
 * conditions：condition相关字段。
 */

  conditions?: EquipmentConditionGroup;  
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
 * valueStats：值Stat相关字段。
 */

  valueStats?: PartialNumericStats;
}

/** 装备持续代价效果。 */
export interface EquipmentPeriodicCostEffectDef {
/**
 * effectId：effectID标识。
 */

  effectId?: string;  
  /**
 * type：type相关字段。
 */

  type: 'periodic_cost';  
  /**
 * trigger：trigger相关字段。
 */

  trigger: 'on_tick' | 'on_cultivation_tick';  
  /**
 * conditions：condition相关字段。
 */

  conditions?: EquipmentConditionGroup;  
  /**
 * resource：resource相关字段。
 */

  resource: 'hp' | 'qi';  
  /**
 * mode：mode相关字段。
 */

  mode: 'flat' | 'max_ratio_bp' | 'current_ratio_bp';  
  /**
 * value：值数值。
 */

  value: number;  
  /**
 * minRemain：minRemain相关字段。
 */

  minRemain?: number;
}

/** 装备触发 Buff 效果。 */
export interface EquipmentTimedBuffEffectDef {
/**
 * effectId：effectID标识。
 */

  effectId?: string;  
  /**
 * type：type相关字段。
 */

  type: 'timed_buff';  
  /**
 * trigger：trigger相关字段。
 */

  trigger: EquipmentTrigger;  
  /**
 * target：目标相关字段。
 */

  target?: 'self' | 'target';  
  /**
 * cooldown：冷却相关字段。
 */

  cooldown?: number;  
  /**
 * chance：chance相关字段。
 */

  chance?: number;  
  /**
 * conditions：condition相关字段。
 */

  conditions?: EquipmentConditionGroup;  
  /**
 * buff：buff相关字段。
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
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * type：type相关字段。
 */

  type: ItemType;  
  /**
 * count：数量或计量字段。
 */

  count: number;  
  /**
 * desc：desc相关字段。
 */

  desc: string;  
  /**
 * groundLabel：groundLabel名称或显示文本。
 */

  groundLabel?: string;  
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;  
  /**
 * level：等级数值。
 */

  level?: number;  
  /**
 * equipSlot：equipSlot相关字段。
 */

  equipSlot?: EquipSlot;  
  /**
 * equipAttrs：equipAttr相关字段。
 */

  equipAttrs?: Partial<Attributes>;  
  /**
 * equipStats：equipStat相关字段。
 */

  equipStats?: PartialNumericStats;  
  /**
 * equipValueStats：equip值Stat相关字段。
 */

  equipValueStats?: PartialNumericStats;  
  /**
 * effects：effect相关字段。
 */

  effects?: EquipmentEffectDef[];  
  /**
 * healAmount：数量或计量字段。
 */

  healAmount?: number;  
  /**
 * healPercent：healPercent相关字段。
 */

  healPercent?: number;  
  /**
 * qiPercent：qiPercent相关字段。
 */

  qiPercent?: number;  
  /**
 * cooldown：冷却相关字段。
 */

  cooldown?: number;  
  /**
 * consumeBuffs：consumeBuff相关字段。
 */

  consumeBuffs?: ConsumableBuffDef[];  
  /**
 * tags：tag相关字段。
 */

  tags?: string[];  
  /**
 * enhanceLevel：enhance等级数值。
 */

  enhanceLevel?: number;  
  /**
 * alchemySuccessRate：炼丹SuccessRate数值。
 */

  alchemySuccessRate?: number;  
  /**
 * alchemySpeedRate：炼丹SpeedRate数值。
 */

  alchemySpeedRate?: number;  
  /**
 * enhancementSuccessRate：强化SuccessRate数值。
 */

  enhancementSuccessRate?: number;  
  /**
 * enhancementSpeedRate：强化SpeedRate数值。
 */

  enhancementSpeedRate?: number;  
  /**
 * mapUnlockId：地图UnlockID标识。
 */

  mapUnlockId?: string;  
  /**
 * mapUnlockIds：地图UnlockID相关字段。
 */

  mapUnlockIds?: string[];  
  /**
 * respawnBindMapId：使用后绑定的复活地图 ID。
 */

  respawnBindMapId?: string;  
  /**
 * tileAuraGainAmount：数量或计量字段。
 */

  tileAuraGainAmount?: number;  
  /**
 * tileResourceGains：集合字段。
 */

  tileResourceGains?: TileResourceGainDef[];
  /**
 * useBehavior：消耗品服务端专用使用行为。
 */

  useBehavior?: 'create_sect' | string;
  /**
 * formationDiskTier：通用阵盘品阶。
 */

  formationDiskTier?: ItemFormationDiskTier;
  /**
 * formationDiskMultiplier：阵盘灵力增幅倍率。
 */

  formationDiskMultiplier?: number;
  /**
 * allowBatchUse：allowBatchUse相关字段。
 */

  allowBatchUse?: boolean;
}

/** 背包。 */
export interface Inventory {
/**
 * items：集合字段。
 */

  items: ItemStack[];  
  /**
 * capacity：capacity相关字段。
 */

  capacity: number;  
  /**
 * cooldowns：冷却相关字段。
 */

  cooldowns?: InventoryItemCooldownState[];  
  /**
 * serverTick：servertick相关字段。
 */

  serverTick?: number;
}

/** 背包内物品的运行时冷却态。 */
export interface InventoryItemCooldownState {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * cooldown：冷却相关字段。
 */

  cooldown: number;  
  /**
 * startedAtTick：startedAttick相关字段。
 */

  startedAtTick: number;
}

/** 装备槽位映射。 */
export type EquipmentSlots = Record<EquipSlot, ItemStack | null>;
