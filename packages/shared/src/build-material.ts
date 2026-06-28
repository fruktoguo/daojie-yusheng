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

const BUILD_MATERIAL_TAGS_BY_CATEGORY: Record<Exclude<BuildMaterialCategoryKey, 'other'>, readonly string[]> = {
  stone: ['石材', 'stone'],
  wood: ['木材', 'wood'],
  cloth: ['布料', 'cloth'],
  metal: ['金属', '金属材', 'metal'],
  transparent: ['透明材', '透明', 'glass', 'transparent'],
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

export function getBuildMaterialCategoryLabel(category: BuildMaterialCategoryKey): string {
  switch (category) {
    case 'stone':
      return '石材';
    case 'wood':
      return '木材';
    case 'cloth':
      return '布料';
    case 'metal':
      return '金属材';
    case 'transparent':
      return '透明材';
    default:
      return '杂项';
  }
}

function resolveExplicitBuildMaterialCategoryKeys(tags: readonly string[]): BuildMaterialCategoryKey[] {
  const normalizedTags = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const result: BuildMaterialCategoryKey[] = [];
  for (const [category, aliases] of Object.entries(BUILD_MATERIAL_TAGS_BY_CATEGORY) as Array<[Exclude<BuildMaterialCategoryKey, 'other'>, readonly string[]]>) {
    if (aliases.some((alias) => normalizedTags.includes(alias.toLowerCase()))) {
      result.push(category);
    }
  }
  return result;
}

export function resolveBuildMaterialCategoryKeys(source: BuildMaterialLike | string | undefined | null): BuildMaterialCategoryKey[] {
  const itemId = typeof source === 'string'
    ? source
    : typeof source?.itemId === 'string'
      ? source.itemId
      : '';
  if (isGenericBuildMaterialSlotItemId(itemId)) {
    return [resolveGenericBuildMaterialSlotCategory(itemId)];
  }
  const tags = Array.isArray((source as BuildMaterialLike | undefined)?.tags)
    ? ((source as BuildMaterialLike).tags ?? []).filter((entry): entry is string => typeof entry === 'string')
    : [];
  const explicit = resolveExplicitBuildMaterialCategoryKeys(tags);
  if (explicit.length > 0) {
    return explicit;
  }
  const fallback = resolveInferredBuildMaterialCategoryKey(source);
  return fallback === 'other' ? [] : [fallback];
}

export function hasBuildMaterialCategory(source: BuildMaterialLike | string | undefined | null, category: BuildMaterialCategoryKey): boolean {
  if (category === 'other') {
    return false;
  }
  return resolveBuildMaterialCategoryKeys(source).includes(category);
}

export function resolveBuildMaterialCategoryKey(source: BuildMaterialLike | string | undefined | null): BuildMaterialCategoryKey {
  return resolveBuildMaterialCategoryKeys(source)[0] ?? resolveInferredBuildMaterialCategoryKey(source);
}

function resolveInferredBuildMaterialCategoryKey(source: BuildMaterialLike | string | undefined | null): BuildMaterialCategoryKey {
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
