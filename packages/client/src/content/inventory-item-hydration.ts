/**
 * 背包轻量物品水合规则。
 *
 * 每个回包都被视为完整实例投影；缺失字段只从本地静态模板补齐，不从旧槽位继承。
 */
import type { ItemStack, SyncedItemStack } from '@mud/shared';

export interface InventoryItemHydrationOptions {
  cloneValue<T>(value: T): T;
  resolvePreviewItem(item: ItemStack): ItemStack;
}

function normalizeItemInstanceId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 合并完整实例回包与本地静态模板，返回可独立修改的客户端物品。 */
export function hydrateSyncedInventoryItem(
  item: SyncedItemStack,
  options: InventoryItemHydrationOptions,
): ItemStack {
  const incomingId = normalizeItemInstanceId(item.itemInstanceId);
  const source = {
    ...options.cloneValue(item),
    itemId: item.itemId,
    itemInstanceId: incomingId || undefined,
    count: Math.max(0, Math.trunc(Number(item.count) || 0)),
  } as ItemStack;
  const resolved = options.resolvePreviewItem(source);
  return options.cloneValue({
    ...resolved,
    name: resolved.name?.trim() || item.itemId,
    type: resolved.type ?? 'material',
    desc: resolved.desc ?? '',
  });
}
