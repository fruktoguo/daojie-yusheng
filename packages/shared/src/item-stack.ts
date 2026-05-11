/**
 * 物品堆叠判定工具：通过签名比较判断两个 ItemStack 能否合并。
 *
 * 设计口径：
 * 装备/物品在持久化时只保存 itemId + count + enhanceLevel（见 buildPersistedInventoryItemRawPayload），
 * 其余字段由模板决定，不存在运行时随机属性。因此堆叠合并只需比较 (itemId, enhanceLevel)。
 * 不使用"全字段序列化签名"，避免因字段顺序、空对象/空数组、模板合并时机等
 * 引入的等价语义差异，导致相同装备被错误拆分成多个 slot。
 */
import { ItemStack } from './item-runtime-types';

/** 规范化强化等级：undefined/null/非法值视为 0 */
function normalizeStackSignatureEnhanceLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

/** 物品叠加签名：由 itemId 和强化等级构成，用于堆叠合并匹配。 */
export function createItemStackSignature(item: ItemStack | { itemId?: string; enhanceLevel?: unknown }): string {
  const itemId = typeof item?.itemId === 'string' ? item.itemId : '';
  const enhanceLevel = normalizeStackSignatureEnhanceLevel((item as { enhanceLevel?: unknown })?.enhanceLevel);
  return `${itemId}#${enhanceLevel}`;
}

/** 判断两个物品堆叠是否可合并（itemId 一致且强化等级一致即可叠加） */
export function canStackItemStacks(left: ItemStack, right: ItemStack): boolean {
  return createItemStackSignature(left) === createItemStackSignature(right);
}
