/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */

const EXACT_ITEM_TEMPLATE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'equip.copper_array_plate': 'formation_disk.mortal',
});

const LEGACY_MAP_SCOPED_FATE_STONE_PATTERN = /^fate_stone\.[a-z0-9_]+$/;

export function isLegacyMapScopedFateStoneItemId(itemId: unknown): boolean {
  const normalized = normalizeItemTemplateAliasInput(itemId);
  return LEGACY_MAP_SCOPED_FATE_STONE_PATTERN.test(normalized);
}

export function resolveCanonicalItemTemplateId(itemId: unknown): string {
  const normalized = normalizeItemTemplateAliasInput(itemId);
  return EXACT_ITEM_TEMPLATE_ALIASES[normalized]
    ?? (isLegacyMapScopedFateStoneItemId(normalized) ? 'fate_stone' : normalized);
}

function normalizeItemTemplateAliasInput(itemId: unknown): string {
  return String(itemId ?? '').trim();
}
