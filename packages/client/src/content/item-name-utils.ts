/**
 * 客户端物品名称候选判断工具。
 *
 * 这里只处理展示派生，不裁定物品是否合法。
 */

export const UNKNOWN_CLIENT_ITEM_NAME = '未知物品';

export function normalizeClientItemNameText(value: string | undefined): string {
  return value?.trim() ?? '';
}

export function isClientUnknownItemName(value: string | undefined): boolean {
  return normalizeClientItemNameText(value) === UNKNOWN_CLIENT_ITEM_NAME;
}

export function isUsableClientItemNameCandidate(itemId: string, value: string | undefined): boolean {
  const trimmed = normalizeClientItemNameText(value);
  return trimmed.length > 0 && trimmed !== itemId.trim() && !isClientUnknownItemName(trimmed);
}
