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

/**
 * 是否需要为该物品分配稳定 itemInstanceId。
 *
 * 当前仅装备类（type === 'equipment'）强制需要：装备是单件资产，必须有
 * 跨链路稳定的实例身份才能支持强化乐观一致性校验、装/卸不被错配、
 * 资产追溯等能力。
 *
 * 非装备类（consumable / material / quest_item / skill_book）保留同质堆叠
 * 语义，不分配 instanceId。
 */
export function isItemInstanceTracked(item: Pick<ItemStack, 'type'> | { type?: unknown } | null | undefined): boolean {
  return Boolean(item) && (item as { type?: unknown }).type === 'equipment';
}

/**
 * 是否是迁移期 fallback 形式的 itemInstanceId（含 ":" 的伪 ID，例如
 * `inv:p_xxx:0` 或 `equip:p_xxx:weapon`）。
 *
 * 历史持久化层为了让 PG 行有稳定主键，会用这种格式兜底；新版改造后这类值
 * 视为"未稳定"，水合时会被 lazy 升级为新 UUID。
 */
export function isLegacyItemInstanceId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.length > 0 && id.includes(':');
}

/**
 * 是否允许该物品参与"按签名找现有堆叠合并 count"的逻辑。
 *
 * 装备 / 任何带 itemInstanceId 的物品都必须独立成 slot：
 *   - 装备每件 count 恒为 1
 *   - 同 (itemId, enhanceLevel) 但 itemInstanceId 不同的两件装备应在不同 slot
 *
 * 非装备且未带 itemInstanceId 的物品继续走原有签名合并逻辑。
 */
export function canMergeItemStack(item: Pick<ItemStack, 'type' | 'itemInstanceId'> | null | undefined): boolean {
  if (!item) {
    return false;
  }
  if ((item as { itemInstanceId?: unknown }).itemInstanceId) {
    return false;
  }
  if (isItemInstanceTracked(item)) {
    return false;
  }
  return true;
}
