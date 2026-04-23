import type { Inventory, PlayerState } from '@mud/shared';

/** 统计指定道具在背包与钱包里的总持有量。 */
export function getPlayerOwnedItemCount(
  player: Pick<PlayerState, 'wallet'> | null | undefined,
  inventory: Inventory | null | undefined,
  itemId: string,
): number {
  const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedItemId) {
    return 0;
  }
  const inventoryCount = Array.isArray(inventory?.items)
    ? inventory.items
      .filter((entry) => entry.itemId === normalizedItemId)
      .reduce((sum, entry) => sum + Math.max(0, Math.trunc(Number(entry.count ?? 0))), 0)
    : 0;
  const walletCount = Array.isArray(player?.wallet?.balances)
    ? player.wallet!.balances
      .filter((entry) => entry.walletType === normalizedItemId)
      .reduce((sum, entry) => sum + Math.max(0, Math.trunc(Number(entry.balance ?? 0))), 0)
    : 0;
  return inventoryCount + walletCount;
}
