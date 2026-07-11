/**
 * 背包与共享库存的统一物品排序规则。
 *
 * 服务端持久化整理必须复用同一比较器，避免背包和宝库对同一物品给出不同顺序。
 */
import { ITEM_TYPE_SORT_ORDER, TECHNIQUE_GRADE_ORDER } from '@mud/shared';

export type InventorySortableItem = {
  itemId?: unknown;
  name?: unknown;
  type?: unknown;
  grade?: unknown;
  level?: unknown;
  enhanceLevel?: unknown;
};

export type InventorySortContentResolver = {
  getTechniqueGradeForBookItem?(itemId: string): unknown;
  getItemSortLevel?(item: InventorySortableItem): unknown;
};

/** 品阶降序、等级降序、类型顺序、ID、名称、强化等级升序。 */
export function compareInventoryItems(
  left: InventorySortableItem,
  right: InventorySortableItem,
  contentResolver: InventorySortContentResolver | null = null,
): number {
  return resolveInventoryGradeOrder(right, contentResolver) - resolveInventoryGradeOrder(left, contentResolver)
    || resolveInventoryLevelOrder(right, contentResolver) - resolveInventoryLevelOrder(left, contentResolver)
    || resolveInventoryTypeOrder(left) - resolveInventoryTypeOrder(right)
    || String(left.itemId ?? '').localeCompare(String(right.itemId ?? ''), 'zh-Hans-CN')
    || String(left.name ?? '').localeCompare(String(right.name ?? ''), 'zh-Hans-CN')
    || resolveInventoryEnhanceLevelOrder(left) - resolveInventoryEnhanceLevelOrder(right);
}

function resolveInventoryGradeOrder(
  item: InventorySortableItem,
  contentResolver: InventorySortContentResolver | null,
): number {
  const grade = item.type === 'skill_book'
    ? (contentResolver?.getTechniqueGradeForBookItem?.(String(item.itemId ?? '')) ?? item.grade)
    : item.grade;
  const index = TECHNIQUE_GRADE_ORDER.indexOf(grade as (typeof TECHNIQUE_GRADE_ORDER)[number]);
  return index >= 0 ? index : -1;
}

function resolveInventoryLevelOrder(
  item: InventorySortableItem,
  contentResolver: InventorySortContentResolver | null,
): number {
  if (item.type === 'skill_book') {
    const sortLevel = contentResolver?.getItemSortLevel?.(item);
    if (typeof sortLevel === 'number' && Number.isFinite(sortLevel)) {
      return Math.max(1, Math.trunc(sortLevel));
    }
  }
  const value = Number(item.level);
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function resolveInventoryTypeOrder(item: InventorySortableItem): number {
  const order = ITEM_TYPE_SORT_ORDER[item.type as keyof typeof ITEM_TYPE_SORT_ORDER];
  return Number.isFinite(order) ? order : Object.keys(ITEM_TYPE_SORT_ORDER).length;
}

function resolveInventoryEnhanceLevelOrder(item: InventorySortableItem): number {
  const value = Number(item.enhanceLevel);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
