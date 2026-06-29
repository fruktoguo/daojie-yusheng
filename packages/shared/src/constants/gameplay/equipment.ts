/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
import type { CraftEffectStats, CraftEffectStatsPatch } from '../../craft-effect-stats';
import { addCraftEffectStatsPatch } from '../../craft-effect-stats';
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

/** 法宝槽位列表。历史最高境界达到半步金丹后开放第一个槽位。 */
export const ARTIFACT_SLOTS = ['artifact_1'] as const;

/** 法宝槽开启门槛：半步金丹。 */
export const ARTIFACT_UNLOCK_REALM_LV = 42;

/** 法宝灵气基准境界：半步金丹。 */
export const ARTIFACT_BASELINE_REALM_LV = 42;

/** 技艺工具标签到装备槽的权威映射。 */
export const TECHNIQUE_EQUIP_SLOT_BY_TOOL_TAG = {
  alchemy_furnace: 'technique_alchemy',
  forging_tool: 'technique_forging',
  enhancement_hammer: 'technique_enhancement',
  mining_pickaxe: 'technique_mining',
  building_hammer: 'technique_building',
} as const;

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

/** 法宝槽位整理顺序。 */
export const ARTIFACT_SLOT_SORT_ORDER = {
  artifact_1: 0,
} as const;

type CraftEffectStatItemLike = {
  craftEffectStats?: CraftEffectStatsPatch | null;
  tags?: readonly unknown[];
};

/** addCraftEffectStatsFromItem：把装备实例上的技艺效果属性累加进玩家技艺效果投影。 */
export function addCraftEffectStatsFromItem(target: CraftEffectStats, item: CraftEffectStatItemLike | null | undefined): void {
  if (!item || typeof item !== 'object') {
    return;
  }
  addCraftEffectStatsPatch(target, item.craftEffectStats);
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
