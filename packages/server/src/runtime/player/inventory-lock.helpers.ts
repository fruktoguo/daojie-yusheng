/**
 * 背包锁定空间（escrow）运行时操作。
 *
 * 物品在强化/市场等操作期间移入 player.inventory.lockedItems，
 * 不参与正常背包操作（不合并、不展示、不可使用/装备/丢弃/交易）。
 * 锁定物品保留完整的实例态字段和 itemInstanceId，保证进出一致。
 */
import type { LockedItem } from '@mud/shared';

/**
 * 将物品移入锁定空间。
 *
 * @param lockedItems 锁定空间数组（player.inventory.lockedItems）
 * @param item 要锁定的物品（必须已有 itemInstanceId）
 * @param lockedBy 锁定来源标识（如 "enhancement:{jobRunId}"）
 * @returns 锁定后的 LockedItem 引用
 */
export function lockItem(
  lockedItems: LockedItem[],
  item: Record<string, unknown>,
  lockedBy: string,
): LockedItem {
  const locked: LockedItem = {
    ...item,
    itemInstanceId: item.itemInstanceId as string,
    itemId: item.itemId as string,
    count: Math.max(1, Math.trunc(Number(item.count) || 1)),
    lockedBy,
    lockedAt: Date.now(),
  };
  lockedItems.push(locked);
  return locked;
}

/**
 * 从锁定空间按 itemInstanceId 取出物品（移除并返回）。
 *
 * @returns 取出的 LockedItem，不存在则返回 null
 */
export function unlockItem(
  lockedItems: LockedItem[],
  itemInstanceId: string,
): LockedItem | null {
  const index = lockedItems.findIndex((entry) => entry.itemInstanceId === itemInstanceId);
  if (index < 0) return null;
  return lockedItems.splice(index, 1)[0];
}

/**
 * 从锁定空间按 itemInstanceId 查找物品（不移除）。
 */
export function getLockedItem(
  lockedItems: LockedItem[],
  itemInstanceId: string,
): LockedItem | null {
  return lockedItems.find((entry) => entry.itemInstanceId === itemInstanceId) ?? null;
}

/**
 * 从 LockedItem 还原为普通 ItemStack 形态（去掉 lockedBy / lockedAt）。
 * 用于取出后放回正常背包。
 */
export function lockedItemToItemStack(locked: LockedItem): Record<string, unknown> {
  const { lockedBy, lockedAt, ...itemFields } = locked;
  return itemFields;
}
