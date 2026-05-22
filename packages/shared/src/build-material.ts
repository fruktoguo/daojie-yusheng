/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import type { MaterialCategory } from './item-runtime-types';

export type BuildMaterialCategoryKey = 'stone' | 'wood' | 'cloth' | 'metal' | 'transparent' | 'other';

export type BuildMaterialLike = {
  itemId?: string | null;
  name?: string | null;
  materialCategory?: MaterialCategory | null;
  tags?: string[] | null;
  type?: string | null;
};

const GENERIC_BUILD_MATERIAL_CATEGORY_BY_ITEM_ID: Record<string, BuildMaterialCategoryKey> = {
  stone: 'stone',
  wood: 'wood',
  cloth: 'cloth',
  metal: 'metal',
  glass: 'transparent',
  transparent: 'transparent',
};

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function isGenericBuildMaterialSlotItemId(itemId: string | undefined | null): boolean {
  return typeof itemId === 'string' && itemId in GENERIC_BUILD_MATERIAL_CATEGORY_BY_ITEM_ID;
}

export function resolveGenericBuildMaterialSlotCategory(itemId: string | undefined | null): BuildMaterialCategoryKey {
  if (!itemId) {
    return 'other';
  }
  return GENERIC_BUILD_MATERIAL_CATEGORY_BY_ITEM_ID[itemId] ?? 'other';
}

export function resolveBuildMaterialCategoryKey(source: BuildMaterialLike | string | undefined | null): BuildMaterialCategoryKey {
  const itemId = typeof source === 'string'
    ? source
    : typeof source?.itemId === 'string'
      ? source.itemId
      : '';
  if (isGenericBuildMaterialSlotItemId(itemId)) {
    return resolveGenericBuildMaterialSlotCategory(itemId);
  }
  const name = typeof source === 'object' && typeof source?.name === 'string' ? source.name : '';
  const materialCategory = typeof source === 'object' ? source?.materialCategory ?? undefined : undefined;
  const tags = Array.isArray((source as BuildMaterialLike | undefined)?.tags)
    ? ((source as BuildMaterialLike).tags ?? []).filter((entry): entry is string => typeof entry === 'string')
    : [];
  const normalized = [itemId, name, materialCategory ?? '', ...tags]
    .join('|')
    .toLowerCase();
  if (includesAny(normalized, ['glass', 'mirror', 'lens', 'windowpane', '玻璃', '琉璃', '透镜', '镜'])) {
    return 'transparent';
  }
  if (includesAny(normalized, ['cloth', 'fabric', 'linen', 'silk', 'thread', 'cotton', '布', '纱', '丝', '绢', '帛', '缎', '蛛丝'])) {
    return 'cloth';
  }
  if (includesAny(normalized, ['wood', 'timber', 'log', 'bamboo', 'reed', 'vine', 'rattan', '木', '竹', '藤', '苇', '枝', '柴'])) {
    return 'wood';
  }
  if (includesAny(normalized, ['stone', 'rock', 'gravel', 'clay', 'sand', 'shard', '石', '岩', '砂', '砾', '土'])) {
    return 'stone';
  }
  if (includesAny(normalized, ['metal', 'iron', 'copper', 'steel', 'silver', 'gold', 'alloy', '矿', '金', '铁', '铜', '钢', '银', '锡', '锋', '刃'])) {
    return 'metal';
  }
  if (materialCategory === 'ore') {
    return 'stone';
  }
  return 'other';
}
