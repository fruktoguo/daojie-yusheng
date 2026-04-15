import { parseQiResourceKey } from '@mud/shared';
import {
  AURA_RESOURCE_KEY,
  DISPERSED_AURA_RESOURCE_KEY,
  LEGACY_AURA_RESOURCE_KEY,
  PersistedTileRuntimeResourceRecord,
  QI_ELEMENT_LABELS,
  QI_FAMILY_LABELS,
  QI_FORM_LABELS,
  TILE_RESOURCE_FLOW_CONFIGS,
  TileResourceBucketMap,
  TileResourceFlowConfig,
  TileResourceRuntimeState,
  TileResourceStateMap,
} from './map.service.shared';

export function tileStateKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function normalizeTileResourceKey(rawKey: unknown): string | null {
  if (typeof rawKey !== 'string') {
    return null;
  }

  const normalizedKey = rawKey.trim();
  if (!normalizedKey) {
    return null;
  }
  if (normalizedKey === LEGACY_AURA_RESOURCE_KEY) {
    return AURA_RESOURCE_KEY;
  }
  return normalizedKey;
}

export function normalizeTileResourceRuntimeState(
  x: unknown,
  y: unknown,
  raw: unknown,
): TileResourceRuntimeState | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Partial<PersistedTileRuntimeResourceRecord>;
  if (!Number.isFinite(candidate.value)) {
    return null;
  }

  return {
    x: Number(x),
    y: Number(y),
    value: Math.max(0, Math.round(Number(candidate.value))),
    sourceValue: Number.isFinite(candidate.sourceValue) ? Math.max(0, Math.round(Number(candidate.sourceValue))) : 0,
    decayRemainder: Number.isFinite(candidate.decayRemainder) ? Math.max(0, Math.round(Number(candidate.decayRemainder))) : 0,
    sourceRemainder: Number.isFinite(candidate.sourceRemainder) ? Math.max(0, Math.round(Number(candidate.sourceRemainder))) : 0,
  };
}

export function getTileResourceStateMap(
  source: Map<string, TileResourceBucketMap>,
  mapId: string,
  resourceKey: string,
): TileResourceStateMap | undefined {
  return source.get(mapId)?.get(resourceKey);
}

export function setTileResourceStateMap(
  source: Map<string, TileResourceBucketMap>,
  mapId: string,
  resourceKey: string,
  stateMap: TileResourceStateMap,
): void {
  if (stateMap.size === 0) {
    deleteTileResourceStateMap(source, mapId, resourceKey);
    return;
  }

  const bucket = source.get(mapId) ?? new Map<string, TileResourceStateMap>();
  bucket.set(resourceKey, stateMap);
  source.set(mapId, bucket);
}

export function deleteTileResourceStateMap(
  source: Map<string, TileResourceBucketMap>,
  mapId: string,
  resourceKey: string,
): void {
  const bucket = source.get(mapId);
  if (!bucket) {
    return;
  }
  bucket.delete(resourceKey);
  if (bucket.size === 0) {
    source.delete(mapId);
  }
}

export function buildPersistedTileRuntimeResources(
  resourceBucket: TileResourceBucketMap | undefined,
  tileKey: string,
): Record<string, PersistedTileRuntimeResourceRecord> | undefined {
  if (!resourceBucket) {
    return undefined;
  }

  const resources: Record<string, PersistedTileRuntimeResourceRecord> = {};
  for (const [resourceKey, stateMap] of resourceBucket.entries()) {
    const state = stateMap.get(tileKey);
    if (!state) {
      continue;
    }
    resources[resourceKey] = {
      value: state.value,
      sourceValue: state.sourceValue,
      decayRemainder: state.decayRemainder,
      sourceRemainder: state.sourceRemainder,
    };
  }

  return Object.keys(resources).length > 0 ? resources : undefined;
}

export function getTileResourceFlowConfig(resourceKey: string): TileResourceFlowConfig | null {
  const directConfig = TILE_RESOURCE_FLOW_CONFIGS[resourceKey];
  if (directConfig) {
    return directConfig;
  }

  const descriptor = parseQiResourceKey(resourceKey);
  if (!descriptor || descriptor.family !== 'aura') {
    return null;
  }
  if (descriptor.form === 'refined') {
    return TILE_RESOURCE_FLOW_CONFIGS[AURA_RESOURCE_KEY] ?? null;
  }
  if (descriptor.form === 'dispersed') {
    return TILE_RESOURCE_FLOW_CONFIGS[DISPERSED_AURA_RESOURCE_KEY] ?? null;
  }
  return null;
}

export function shouldKeepTileResourceRuntimeState(state: TileResourceRuntimeState): boolean {
  return (state.sourceValue ?? 0) > 0
    || state.value > 0
    || (state.decayRemainder ?? 0) > 0
    || (state.sourceRemainder ?? 0) > 0;
}

export function shouldExposeTileResourceDetail(state: TileResourceRuntimeState): boolean {
  return (state.sourceValue ?? 0) > 0 || state.value > 0;
}

export function tickTileResourceState(resourceKey: string, state: TileResourceRuntimeState): boolean {
  const flowConfig = getTileResourceFlowConfig(resourceKey);
  if (!flowConfig) {
    return false;
  }

  const previousValue = state.value;
  const previousDecayRemainder = state.decayRemainder ?? 0;
  const previousSourceRemainder = state.sourceRemainder ?? 0;

  state.decayRemainder = Math.max(0, Math.round(state.decayRemainder ?? 0))
    + previousValue * flowConfig.halfLifeRateScaled;
  const halfLifeDecayAmount = Math.floor(state.decayRemainder / flowConfig.halfLifeRateScale);
  state.decayRemainder %= flowConfig.halfLifeRateScale;

  state.sourceRemainder = Math.max(0, Math.round(state.sourceRemainder ?? 0))
    + Math.max(0, Math.round(state.sourceValue ?? 0)) * flowConfig.halfLifeRateScaled;
  const sourceAmount = Math.floor(state.sourceRemainder / flowConfig.halfLifeRateScale);
  state.sourceRemainder %= flowConfig.halfLifeRateScale;

  const decayAmount = previousValue > 0
    ? Math.max(flowConfig.minimumDecayPerTick, halfLifeDecayAmount)
    : 0;
  const nextValue = Math.max(0, previousValue - decayAmount + sourceAmount);
  if (nextValue !== previousValue) {
    state.value = nextValue;
  }

  return nextValue !== previousValue
    || state.decayRemainder !== previousDecayRemainder
    || state.sourceRemainder !== previousSourceRemainder;
}

export function toPublicTileResourceKey(resourceKey: string): string {
  return resourceKey;
}

export function getTileResourceLabel(resourceKey: string): string {
  if (resourceKey === AURA_RESOURCE_KEY) {
    return '无属性灵气';
  }

  const descriptor = parseQiResourceKey(resourceKey);
  if (!descriptor) {
    return resourceKey;
  }

  const familyLabel = QI_FAMILY_LABELS[descriptor.family];
  const formLabel = QI_FORM_LABELS[descriptor.form];
  const elementLabel = QI_ELEMENT_LABELS[descriptor.element];
  if (descriptor.family === 'aura' && descriptor.form === 'refined' && descriptor.element === 'neutral') {
    return '无属性灵气';
  }
  if (descriptor.form === 'refined' && descriptor.element === 'neutral') {
    return familyLabel;
  }
  if (descriptor.element === 'neutral') {
    return `${formLabel}${familyLabel}`;
  }
  if (descriptor.form === 'refined') {
    return `${elementLabel}${familyLabel}`;
  }
  return `${formLabel}${elementLabel}${familyLabel}`;
}

