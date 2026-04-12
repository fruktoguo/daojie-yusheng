/**
 * 背包物品排序工具：统一整理背包时的排序口径。
 */
import { EQUIP_SLOT_SORT_ORDER } from './constants/gameplay/equipment';
import { ITEM_TYPE_SORT_ORDER } from './constants/gameplay/inventory';
import { TECHNIQUE_GRADE_ORDER } from './constants/gameplay/technique';
import type { ItemStack, TechniqueGrade } from './types';

/** TECHNIQUE_GRADE_SORT_ORDER：定义该变量以承载业务值。 */
const TECHNIQUE_GRADE_SORT_ORDER = TECHNIQUE_GRADE_ORDER.reduce<Record<TechniqueGrade, number>>((accumulator, grade, index) => {
  accumulator[grade] = index;
  return accumulator;
}, {} as Record<TechniqueGrade, number>);

/** getGradeSortWeight：执行对应的业务逻辑。 */
function getGradeSortWeight(grade: TechniqueGrade | undefined): number {
  if (!grade) {
    return -1;
  }
  return TECHNIQUE_GRADE_SORT_ORDER[grade] ?? -1;
}

/** getItemLevelSortWeight：执行对应的业务逻辑。 */
function getItemLevelSortWeight(level: number | undefined): number {
  if (!Number.isFinite(level)) {
    return -1;
  }
  return Math.max(0, Math.floor(level ?? 0));
}

/**
 * 背包物品整理排序：
 * - 先按类型分组，维持现有大类阅读顺序；
 * - 同类内优先按品阶、等级从高到低；
 * - 装备在同品阶同等级下再按部位聚拢。
 */
export function compareInventoryItems(left: ItemStack, right: ItemStack): number {
/** typeDiff：定义该变量以承载业务值。 */
  const typeDiff = ITEM_TYPE_SORT_ORDER[left.type] - ITEM_TYPE_SORT_ORDER[right.type];
  if (typeDiff !== 0) {
    return typeDiff;
  }

/** gradeDiff：定义该变量以承载业务值。 */
  const gradeDiff = getGradeSortWeight(right.grade) - getGradeSortWeight(left.grade);
  if (gradeDiff !== 0) {
    return gradeDiff;
  }

/** levelDiff：定义该变量以承载业务值。 */
  const levelDiff = getItemLevelSortWeight(right.level) - getItemLevelSortWeight(left.level);
  if (levelDiff !== 0) {
    return levelDiff;
  }

  if (left.type === 'equipment' && right.type === 'equipment') {
/** leftSlot：定义该变量以承载业务值。 */
    const leftSlot = left.equipSlot ? EQUIP_SLOT_SORT_ORDER[left.equipSlot] : Number.MAX_SAFE_INTEGER;
/** rightSlot：定义该变量以承载业务值。 */
    const rightSlot = right.equipSlot ? EQUIP_SLOT_SORT_ORDER[right.equipSlot] : Number.MAX_SAFE_INTEGER;
    if (leftSlot !== rightSlot) {
      return leftSlot - rightSlot;
    }
  }

/** nameDiff：定义该变量以承载业务值。 */
  const nameDiff = left.name.localeCompare(right.name, 'zh-Hans-CN');
  if (nameDiff !== 0) {
    return nameDiff;
  }

/** itemIdDiff：定义该变量以承载业务值。 */
  const itemIdDiff = left.itemId.localeCompare(right.itemId);
  if (itemIdDiff !== 0) {
    return itemIdDiff;
  }

  return right.count - left.count;
}

