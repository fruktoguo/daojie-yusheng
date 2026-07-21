/** 将宝库存取数量收敛到当前堆叠可用范围。 */
export function normalizeTreasureVaultTransferCount(value: unknown, availableCount: unknown): number {
  const parsedAvailable = Math.trunc(Number(availableCount));
  const available = Number.isFinite(parsedAvailable) ? Math.max(1, parsedAvailable) : 1;
  const requested = Math.trunc(Number(value));
  if (!Number.isFinite(requested)) return 1;
  return Math.min(available, Math.max(1, requested));
}
