export interface WalletBalanceProjection {
  walletType: string;
  balance: number;
  frozenBalance: number;
  version: number;
}

interface InventoryCountEntry {
  itemId?: unknown;
  count?: unknown;
}

interface WalletBalanceEntry {
  walletType?: unknown;
  balance?: unknown;
  frozenBalance?: unknown;
  version?: unknown;
}

/** 按背包物品真源统计指定物品总数。 */
export function countInventoryItemById(
  items: readonly unknown[] | null | undefined,
  itemId: unknown,
): number {
  const normalizedItemId = normalizeWalletType(itemId);
  if (!normalizedItemId) {
    return 0;
  }
  let total = 0;
  for (const value of Array.isArray(items) ? items : []) {
    const entry = value as InventoryCountEntry | null;
    if (entry?.itemId !== normalizedItemId) {
      continue;
    }
    total += normalizeNonNegativeInteger(entry.count);
  }
  return total;
}

/**
 * 从背包真源重建指定钱包条目，同时保留其他钱包类型。
 * 钱包只能由背包单向投影，调用方不得把旧钱包余额作为增量基线。
 */
export function buildWalletBalancesFromInventory(
  existingBalances: readonly unknown[] | null | undefined,
  inventoryItems: readonly unknown[] | null | undefined,
  walletItemIds: readonly string[] = ['spirit_stone'],
): WalletBalanceProjection[] {
  const byType = collapseWalletBalances(existingBalances);
  const normalizedWalletItemIds = Array.from(new Set(
    walletItemIds.map((itemId) => normalizeWalletType(itemId)).filter(Boolean),
  ));
  for (const walletType of normalizedWalletItemIds) {
    const nextBalance = countInventoryItemById(inventoryItems, walletType);
    const existing = byType.get(walletType);
    if (nextBalance <= 0) {
      byType.delete(walletType);
      continue;
    }
    if (!existing) {
      byType.set(walletType, {
        walletType,
        balance: nextBalance,
        frozenBalance: 0,
        version: 1,
      });
      continue;
    }
    if (existing.balance !== nextBalance || existing.frozenBalance !== 0) {
      existing.balance = nextBalance;
      existing.frozenBalance = 0;
      existing.version += 1;
    }
  }
  return Array.from(byType.values());
}

function collapseWalletBalances(
  existingBalances: readonly unknown[] | null | undefined,
): Map<string, WalletBalanceProjection> {
  const byType = new Map<string, WalletBalanceProjection>();
  for (const value of Array.isArray(existingBalances) ? existingBalances : []) {
    const entry = value as WalletBalanceEntry | null;
    const walletType = normalizeWalletType(entry?.walletType);
    if (!walletType) {
      continue;
    }
    const balance = normalizeNonNegativeInteger(entry?.balance);
    const frozenBalance = normalizeNonNegativeInteger(entry?.frozenBalance);
    const version = normalizeNonNegativeInteger(entry?.version);
    const existing = byType.get(walletType);
    if (existing) {
      existing.balance += balance;
      existing.frozenBalance += frozenBalance;
      existing.version = Math.max(existing.version, version);
      continue;
    }
    byType.set(walletType, {
      walletType,
      balance,
      frozenBalance,
      version,
    });
  }
  return byType;
}

function normalizeWalletType(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNonNegativeInteger(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}
