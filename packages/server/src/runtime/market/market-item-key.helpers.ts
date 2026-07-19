/** 客户端堆叠签名中普通坊市实际用于聚合的权威字段。 */
export interface MarketStackSignatureItemKey {
  itemId: string;
  enhanceLevel: number;
}

/**
 * 解析普通坊市强化等级行使用的堆叠签名。
 *
 * 兼容历史 `itemId#enhanceLevel` 与共享层当前生成的完整签名。完整签名后续字段
 * 只用于背包堆叠身份，普通坊市仍只按物品模板和强化等级聚合，不能信任其余实例态字段。
 */
export function parseMarketStackSignatureItemKey(itemKey: unknown): MarketStackSignatureItemKey | null {
  const normalizedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';
  const firstSeparatorIndex = normalizedItemKey.indexOf('#');
  if (firstSeparatorIndex <= 0) {
    return null;
  }

  const itemId = normalizedItemKey.slice(0, firstSeparatorIndex).trim();
  const remainingSignature = normalizedItemKey.slice(firstSeparatorIndex + 1);
  const nextSeparatorIndex = remainingSignature.indexOf('#');
  const rawEnhanceLevel = (
    nextSeparatorIndex >= 0
      ? remainingSignature.slice(0, nextSeparatorIndex)
      : remainingSignature
  ).trim();
  if (!itemId || !/^\d+$/.test(rawEnhanceLevel)) {
    return null;
  }

  const enhanceLevel = Number(rawEnhanceLevel);
  if (!Number.isSafeInteger(enhanceLevel)) {
    return null;
  }
  return { itemId, enhanceLevel };
}
