import type { Inventory, PlayerState } from '@mud/shared';

/**
 * 统计指定道具在玩家身上的实际持有量。
 *
 * 服务端把灵石（`spirit_stone`）等"钱包资源"同时保留在 `inventory.items` 与
 * `player.wallet.balances` 两个视图里，由 `syncWalletCacheFromInventory` 保持二者
 * 一致（参见 packages/server/src/runtime/player/player-runtime.service.ts）。客户端
 * 必须把它们当作"同一份数据的两个投影"，不能再相加，否则拍卖行/商店的"我的灵石"等
 * 显示会出现两倍数值。这里采用两个视图中的较大值作为合并结果：
 * - 双视图同源时（spirit_stone）：两边相等，取任意一份；
 * - 仅在 inventory 中存在的物品（绝大多数普通物品）：walletCount=0，取 inventory；
 * - 仅在 wallet 中存在的资源（未来新增纯钱包资源）：inventoryCount=0，取 wallet；
 * - 同步窗口短暂不一致时：取较大值，避免显示资产凭空消失。
 */
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
  return Math.max(inventoryCount, walletCount);
}
