export interface InventoryItemPersistenceSource {
  itemId?: unknown;
  count?: unknown;
  rawPayload?: unknown;
  enhanceLevel?: unknown;
}

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

export function hydratePersistedInventoryItem(
  source: InventoryItemPersistenceSource,
  contentTemplateRepository?: InventoryItemTemplateRepository | null,
): Record<string, unknown> {
  const rawPayload = asRecord(source?.rawPayload);
  const itemId =
    normalizeOptionalString(rawPayload?.itemId, source?.itemId)
    ?? 'unknown_item';
  const count = normalizeMinimumInteger(rawPayload?.count ?? source?.count, 1, 1);
  const enhanceLevel = normalizeEnhanceLevel(rawPayload?.enhanceLevel, rawPayload?.enhancementLevel);
  const legacyOverrides = buildLegacyInventoryOverrides(rawPayload);

  if (contentTemplateRepository?.createItem(itemId, count)) {
    const hydrated = asRecord(
      contentTemplateRepository.normalizeItem({
        itemId,
        count,
        ...(enhanceLevel == null ? {} : { enhanceLevel }),
      }),
    );
    if (hydrated) {
      return {
        ...hydrated,
        ...legacyOverrides,
        itemId,
        count,
        ...(enhanceLevel == null ? {} : { enhanceLevel }),
      };
    }
  }

  if (rawPayload) {
    return {
      ...rawPayload,
      itemId,
      count,
      ...(enhanceLevel == null ? {} : { enhanceLevel }),
    };
  }

  return {
    itemId,
    count,
    ...(enhanceLevel == null ? {} : { enhanceLevel }),
  };
}
