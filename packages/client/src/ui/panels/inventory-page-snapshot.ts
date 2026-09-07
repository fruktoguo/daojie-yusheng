/**
 * 背包当前页快照补丁。
 *
 * 技艺完成会连续推进 inventory.revision。丢掉当前分页再退回本地全量列表，
 * 会让格子按槽位号整页重挂。本模块只回绑当前页已有条目，不插入新品，
 * 也不改写最后一次已接受分页的 revision。
 */
export interface InventoryPageSnapshot<TItem> {
  filter: string;
  search: string;
  revision: number;
  totalItems: number;
  totalVisibleItems: number;
  capacity: number;
  offset: number;
  limit: number;
  items: Array<{ item: TItem; slotIndex: number }>;
}

export function buildInventoryCellIdentity(options: {
  itemInstanceId?: string | null;
  slotIndex: number;
  itemId: string;
}): string {
  const instanceId = typeof options.itemInstanceId === 'string' ? options.itemInstanceId.trim() : '';
  if (instanceId) {
    return `instance:${instanceId}`;
  }
  return `slot:${Math.max(0, Math.trunc(Number(options.slotIndex) || 0))}:${options.itemId}`;
}

export function patchInventoryPageSnapshotFromItems<TItem>(input: {
  snapshot: InventoryPageSnapshot<TItem>;
  items: Array<TItem | null | undefined>;
  capacity: number;
  matches: (item: TItem) => boolean;
  getInstanceId: (item: TItem) => string;
  getItemId: (item: TItem) => string;
}): {
  snapshot: InventoryPageSnapshot<TItem>;
  needsImmediateRefresh: boolean;
} {
  const byInstanceId = new Map<string, { item: TItem; slotIndex: number }>();
  const bySlotIndex = new Map<number, TItem>();
  let totalItems = 0;
  let totalVisibleItems = 0;

  for (let slotIndex = 0; slotIndex < input.items.length; slotIndex += 1) {
    const item = input.items[slotIndex];
    if (!item) {
      continue;
    }
    totalItems += 1;
    bySlotIndex.set(slotIndex, item);
    if (!input.matches(item)) {
      continue;
    }
    totalVisibleItems += 1;
    const instanceId = input.getInstanceId(item).trim();
    if (instanceId) {
      byInstanceId.set(instanceId, { item, slotIndex });
    }
  }

  const nextItems: Array<{ item: TItem; slotIndex: number }> = [];
  for (const entry of input.snapshot.items) {
    const instanceId = input.getInstanceId(entry.item).trim();
    if (instanceId) {
      const rebound = byInstanceId.get(instanceId);
      if (rebound) {
        nextItems.push(rebound);
      }
      continue;
    }
    const sameSlot = bySlotIndex.get(entry.slotIndex);
    if (
      sameSlot
      && input.matches(sameSlot)
      && !input.getInstanceId(sameSlot).trim()
      && input.getItemId(sameSlot) === input.getItemId(entry.item)
    ) {
      nextItems.push({ item: sameSlot, slotIndex: entry.slotIndex });
    }
  }

  const limit = Math.max(1, Math.trunc(Number(input.snapshot.limit) || 1));
  const offset = Math.max(0, Math.trunc(Number(input.snapshot.offset) || 0));
  const pageEmptiedWhileItemsRemain = nextItems.length === 0 && totalVisibleItems > 0;
  const offsetPastEnd = totalVisibleItems > 0 && offset >= totalVisibleItems;
  return {
    snapshot: {
      ...input.snapshot,
      totalItems,
      totalVisibleItems,
      capacity: Math.max(0, Math.trunc(Number(input.capacity) || 0)),
      limit,
      offset,
      items: nextItems,
    },
    needsImmediateRefresh: pageEmptiedWhileItemsRemain || offsetPastEnd,
  };
}
