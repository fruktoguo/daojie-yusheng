/**
 * 本文件提供客户端物品展示名兜底，负责把低频/高频同步中的精简 itemId 映射为本地展示名。
 *
 * 维护时不要在这里裁定资产合法性；这里仅处理客户端显示派生。
 */
import { getItemDisplayName, type GroundItemEntryView } from '@mud/shared';
import { getLocalItemTemplate } from './local-templates';
import {
  UNKNOWN_CLIENT_ITEM_NAME,
  isUsableClientItemNameCandidate,
  normalizeClientItemNameText,
} from './item-name-utils';

type ClientItemNameSource = {
  itemId?: string;
  name?: string;
  enhanceLevel?: number;
};

export function resolveClientItemBaseName(itemId: string, ...candidates: Array<string | undefined>): string {
  const normalizedItemId = itemId.trim();
  for (const candidate of candidates) {
    if (isUsableClientItemNameCandidate(normalizedItemId, candidate)) {
      return normalizeClientItemNameText(candidate);
    }
  }
  const templateName = normalizeClientItemNameText(normalizedItemId ? getLocalItemTemplate(normalizedItemId)?.name : undefined);
  if (templateName && templateName !== normalizedItemId) {
    return templateName;
  }
  return normalizedItemId || UNKNOWN_CLIENT_ITEM_NAME;
}

export function resolveClientItemDisplayName(item: ClientItemNameSource | null | undefined): string {
  const itemId = normalizeClientItemNameText(item?.itemId);
  const name = resolveClientItemBaseName(itemId, item?.name);
  return getItemDisplayName({ itemId, name, enhanceLevel: item?.enhanceLevel });
}

export function hydrateClientGroundItemEntryName(entry: GroundItemEntryView): GroundItemEntryView {
  const name = resolveClientItemBaseName(entry.itemId, entry.name);
  if (name === entry.name) {
    return entry;
  }
  return { ...entry, name };
}
