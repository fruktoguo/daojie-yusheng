/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 装备系统通用常量。
 */

/** 战斗装备槽位列表。 */
export const COMBAT_EQUIP_SLOTS = ['weapon', 'head', 'body', 'legs', 'accessory'] as const;

/** 通用技艺装备槽位列表。每种技艺独立一个工具槽，不再占用战斗装备槽。 */
export const TECHNIQUE_EQUIP_SLOTS = [
  'technique_alchemy',
  'technique_forging',
  'technique_enhancement',
  'technique_mining',
  'technique_building',
] as const;

/** 装备槽位列表。 */
export const EQUIP_SLOTS = [...COMBAT_EQUIP_SLOTS, ...TECHNIQUE_EQUIP_SLOTS] as const;

/** 技艺工具标签到装备槽的权威映射。 */
export const TECHNIQUE_EQUIP_SLOT_BY_TOOL_TAG = {
  alchemy_furnace: 'technique_alchemy',
  forging_tool: 'technique_forging',
  enhancement_hammer: 'technique_enhancement',
  mining_pickaxe: 'technique_mining',
  building_hammer: 'technique_building',
} as const;

/** 技艺装备隐藏属性键。只用于服务端结算和技艺面板预估，不进入公开属性面板。 */
export const CRAFT_EQUIPMENT_STAT_KEYS = [
  'alchemySuccessRate',
  'alchemySpeedRate',
  'forgingSuccessRate',
  'forgingSpeedRate',
  'enhancementSuccessRate',
  'enhancementSpeedRate',
  'miningDamageRate',
  'miningDropRate',
  'buildingSpeedRate',
] as const;

export type CraftEquipmentStatKey = typeof CRAFT_EQUIPMENT_STAT_KEYS[number];
export type CraftEquipmentStats = Record<CraftEquipmentStatKey, number>;

/** 装备槽位整理顺序。 */
export const EQUIP_SLOT_SORT_ORDER = {
  weapon: 0,
  head: 1,
  body: 2,
  legs: 3,
  accessory: 4,
  technique_alchemy: 5,
  technique_forging: 6,
  technique_enhancement: 7,
  technique_mining: 8,
  technique_building: 9,
} as const;

/** createEmptyCraftEquipmentStats：创建空技艺装备属性投影。 */
export function createEmptyCraftEquipmentStats(): CraftEquipmentStats {
  return {
    alchemySuccessRate: 0,
    alchemySpeedRate: 0,
    forgingSuccessRate: 0,
    forgingSpeedRate: 0,
    enhancementSuccessRate: 0,
    enhancementSpeedRate: 0,
    miningDamageRate: 0,
    miningDropRate: 0,
    buildingSpeedRate: 0,
  };
}

/** cloneCraftEquipmentStats：克隆并规范化技艺装备属性投影。 */
export function cloneCraftEquipmentStats(source: Partial<CraftEquipmentStats> | null | undefined): CraftEquipmentStats {
  const result = createEmptyCraftEquipmentStats();
  if (!source || typeof source !== 'object') {
    return result;
  }
  for (const key of CRAFT_EQUIPMENT_STAT_KEYS) {
    const value = Number(source[key]);
    result[key] = Number.isFinite(value) ? value : 0;
  }
  return result;
}

type CraftEquipmentStatItemLike = Partial<CraftEquipmentStats> & {
  alchemySuccessRate?: unknown;
  alchemySpeedRate?: unknown;
  enhancementSuccessRate?: unknown;
  enhancementSpeedRate?: unknown;
  miningDamageRate?: unknown;
  miningDropRate?: unknown;
  buildingSpeedRate?: unknown;
  tags?: readonly unknown[];
};

function addFiniteCraftStat(target: CraftEquipmentStats, key: CraftEquipmentStatKey, value: unknown): void {
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized !== 0) {
    target[key] += normalized;
  }
}

/** addCraftEquipmentStatsFromItem：把装备实例上的技艺工具属性累加进隐藏属性投影。 */
export function addCraftEquipmentStatsFromItem(target: CraftEquipmentStats, item: CraftEquipmentStatItemLike | null | undefined): void {
  if (!item || typeof item !== 'object') {
    return;
  }
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (tags.includes('alchemy_furnace')) {
    addFiniteCraftStat(target, 'alchemySuccessRate', item.alchemySuccessRate);
    addFiniteCraftStat(target, 'alchemySpeedRate', item.alchemySpeedRate);
  }
  if (tags.includes('forging_tool')) {
    addFiniteCraftStat(target, 'forgingSuccessRate', item.forgingSuccessRate ?? item.alchemySuccessRate);
    addFiniteCraftStat(target, 'forgingSpeedRate', item.forgingSpeedRate ?? item.alchemySpeedRate);
  }
  if (tags.includes('enhancement_hammer')) {
    addFiniteCraftStat(target, 'enhancementSuccessRate', item.enhancementSuccessRate);
    addFiniteCraftStat(target, 'enhancementSpeedRate', item.enhancementSpeedRate);
  }
  if (tags.includes('mining_pickaxe')) {
    addFiniteCraftStat(target, 'miningDamageRate', item.miningDamageRate);
    addFiniteCraftStat(target, 'miningDropRate', item.miningDropRate);
  }
  if (tags.includes('building_hammer')) {
    addFiniteCraftStat(target, 'buildingSpeedRate', item.buildingSpeedRate);
  }
}

/** resolveTechniqueEquipSlotFromTags：按工具标签解析技艺装备槽。 */
export function resolveTechniqueEquipSlotFromTags(tags: readonly unknown[] | null | undefined): typeof TECHNIQUE_EQUIP_SLOTS[number] | null {
  if (!Array.isArray(tags) || tags.length === 0) {
    return null;
  }
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }
    const slot = TECHNIQUE_EQUIP_SLOT_BY_TOOL_TAG[tag as keyof typeof TECHNIQUE_EQUIP_SLOT_BY_TOOL_TAG];
    if (slot) {
      return slot;
    }
  }
  return null;
}
