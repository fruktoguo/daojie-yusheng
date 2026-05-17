/**
 * 背包物品持久化工具。
 * 提供物品快照序列化（buildPersistedInventoryItemRawPayload）和反序列化水合（hydratePersistedInventoryItem），
 * 处理强化等级、旧字段兼容和内容模板规范化。
 */

/** 物品持久化来源数据结构 */
export interface InventoryItemPersistenceSource {
  itemId?: unknown;
  itemInstanceId?: unknown;
  count?: unknown;
  rawPayload?: unknown;
  enhanceLevel?: unknown;
}

/** 装备槽持久化来源数据结构 */
export interface EquipmentItemPersistenceSource {
  itemId?: unknown;
  itemInstanceId?: unknown;
  slot?: unknown;
  rawPayload?: unknown;
  enhanceLevel?: unknown;
}

/** 物品模板仓储接口，用于水合时规范化物品 */
export interface InventoryItemTemplateRepository {
  createItem(itemId: string, count?: number): unknown;
  normalizeItem(item: unknown): unknown;
}

const INVENTORY_LEGACY_MIRROR_KEYS = new Set([
  'itemId',
  'count',
  'enhanceLevel',
  'enhancementLevel',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeOptionalString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function normalizeMinimumInteger(value: unknown, fallback: number, minimum = 1): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(minimum, Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(minimum, Math.trunc(parsed));
    }
  }
  return Math.max(minimum, Math.trunc(fallback));
}

function normalizeOptionalInteger(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }
  }
  return null;
}

function normalizeEnhanceLevel(...values: unknown[]): number | null {
  const normalized = normalizeOptionalInteger(...values);
  if (normalized == null) {
    return null;
  }
  return Math.max(0, normalized);
}

function buildLegacyInventoryOverrides(rawPayload: Record<string, unknown> | null): Record<string, unknown> {
  if (!rawPayload) {
    return {};
  }

  const overrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawPayload)) {
    if (INVENTORY_LEGACY_MIRROR_KEYS.has(key)) {
      continue;
    }
    overrides[key] = value;
  }
  return overrides;
}

/** 构建物品持久化 rawPayload：仅保留强化等级等非冗余字段 */
export function buildPersistedInventoryItemRawPayload(
  source: InventoryItemPersistenceSource,
): Record<string, unknown> {
  const rawPayload = asRecord(source?.rawPayload);
  const enhanceLevel = normalizeEnhanceLevel(
    source?.enhanceLevel,
    rawPayload?.enhanceLevel,
    rawPayload?.enhancementLevel,
  );

  return enhanceLevel == null ? {} : { enhanceLevel };
}

/** 构建装备槽持久化 rawPayload：itemId 存列字段，rawPayload 只保留实例态强化等级。 */
export function buildPersistedEquipmentItemRawPayload(
  source: EquipmentItemPersistenceSource,
): Record<string, unknown> {
  const rawPayload = asRecord(source?.rawPayload);
  const enhanceLevel = normalizeEnhanceLevel(
    source?.enhanceLevel,
    rawPayload?.enhanceLevel,
    rawPayload?.enhancementLevel,
  );

  return enhanceLevel == null ? {} : { enhanceLevel };
}

/** 从持久化来源水合完整物品对象，兼容旧格式并通过模板仓储规范化 */
export function hydratePersistedInventoryItem(
  source: InventoryItemPersistenceSource,
  contentTemplateRepository?: InventoryItemTemplateRepository | null,
): Record<string, unknown> {
  const rawPayload = asRecord(source?.rawPayload);
  const itemId =
    normalizeOptionalString(rawPayload?.itemId, source?.itemId)
    ?? 'unknown_item';
  const count = normalizeMinimumInteger(rawPayload?.count ?? source?.count, 1, 1);
  const enhanceLevel = normalizeEnhanceLevel(source?.enhanceLevel, rawPayload?.enhanceLevel, rawPayload?.enhancementLevel);
  // 优先来自列存储 source.itemInstanceId；兼容历史 rawPayload 写过该字段的情况
  const itemInstanceId = normalizeOptionalString(source?.itemInstanceId, rawPayload?.itemInstanceId);
  const legacyOverrides = buildLegacyInventoryOverrides(rawPayload);

  const templateItem = contentTemplateRepository?.createItem(itemId, count);
  if (templateItem) {
    const hydrated = asRecord(
      contentTemplateRepository.normalizeItem({
        itemId,
        count,
        ...(enhanceLevel == null ? {} : { enhanceLevel }),
        ...(itemInstanceId == null ? {} : { itemInstanceId }),
      }),
    );
    if (hydrated) {
      // normalizeItem 通过 Object.create(template) 返回基于 prototype 的实例：
      // 模板字段（name/type/desc/equipAttrs/equipStats/...）挂在 prototype 上，
      // own keys 只保留运行态字段（itemId/count/enhanceLevel/itemInstanceId）。
      // 这里必须直接把这个实例还给上层；如果再做一次 `{...hydrated, ...}` 浅展开，
      // 会丢光所有模板 prototype 字段，后续 applyEnhancementToItemStack 读
      // `item.name`、`item.equipAttrs` 全部 undefined，并在 enhanceLevel>0 时
      // 直接把世界 tick 炸掉（formatEnhancedItemName 调用 name.replace）。
      // createItemInstanceFromTemplate 已经在 hydrated 自身上 defineProperty 了
      // itemId / count / enhanceLevel / itemInstanceId 这些 own 覆盖字段，
      // 所以无需再用 spread "确保覆盖生效"。
      return hydrated;
    }
  }

  if (rawPayload) {
    return {
      ...rawPayload,
      itemId,
      count,
      ...(enhanceLevel == null ? {} : { enhanceLevel }),
      ...(itemInstanceId == null ? {} : { itemInstanceId }),
    };
  }

  return {
    itemId,
    count,
    ...(enhanceLevel == null ? {} : { enhanceLevel }),
    ...(itemInstanceId == null ? {} : { itemInstanceId }),
  };
}

/** 从装备槽持久化行水合完整装备，模板命中时旧属性快照不再覆盖配置模板。 */
export function hydratePersistedEquipmentItem(
  source: EquipmentItemPersistenceSource,
  contentTemplateRepository?: InventoryItemTemplateRepository | null,
): Record<string, unknown> | null {
  const rawPayload = asRecord(source?.rawPayload);
  const itemId = normalizeOptionalString(rawPayload?.itemId, source?.itemId);
  if (!itemId) {
    return null;
  }

  const slot = normalizeOptionalString(source?.slot);
  const enhanceLevel = normalizeEnhanceLevel(
    source?.enhanceLevel,
    rawPayload?.enhanceLevel,
    rawPayload?.enhancementLevel,
  );
  const itemInstanceId = normalizeOptionalString(source?.itemInstanceId, rawPayload?.itemInstanceId);
  const hydrated = hydratePersistedInventoryItem(
    {
      itemId,
      count: 1,
      rawPayload,
      ...(enhanceLevel == null ? {} : { enhanceLevel }),
      ...(itemInstanceId == null ? {} : { itemInstanceId }),
    },
    contentTemplateRepository,
  );

  // hydrated 在模板命中时是基于 Object.create(template) 的 prototype-shared 实例，
  // 这里必须就地写 own properties，而不是 `{...hydrated, ...}`：浅展开会把
  // name/type/equipAttrs/equipStats 等模板字段全部丢失，下游 applyEnhancement*
  // 链路会读到 undefined 名字并直接拉爆世界 tick。
  const equipSlot = normalizeOptionalString(hydrated.equipSlot) ?? slot ?? undefined;
  hydrated.itemId = itemId;
  hydrated.count = 1;
  if (equipSlot === undefined) {
    delete (hydrated as Record<string, unknown>).equipSlot;
  } else {
    hydrated.equipSlot = equipSlot;
  }
  if (enhanceLevel == null) {
    delete (hydrated as Record<string, unknown>).enhanceLevel;
  } else {
    hydrated.enhanceLevel = enhanceLevel;
  }
  if (itemInstanceId == null) {
    delete (hydrated as Record<string, unknown>).itemInstanceId;
  } else {
    hydrated.itemInstanceId = itemInstanceId;
  }
  return hydrated;
}
