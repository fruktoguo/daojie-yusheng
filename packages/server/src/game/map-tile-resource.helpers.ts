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

/** tileStateKey：执行对应的业务逻辑。 */
export function tileStateKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** normalizeTileResourceKey：执行对应的业务逻辑。 */
export function normalizeTileResourceKey(rawKey: unknown): string | null {
  if (typeof rawKey !== 'string') {
    return null;
  }

/** normalizedKey：定义该变量以承载业务值。 */
  const normalizedKey = rawKey.trim();
  if (!normalizedKey) {
    return null;
  }
  if (normalizedKey === LEGACY_AURA_RESOURCE_KEY) {
    return AURA_RESOURCE_KEY;
  }
  return normalizedKey;
}

/** normalizeTileResourceRuntimeState：执行对应的业务逻辑。 */
export function normalizeTileResourceRuntimeState(
  x: unknown,
  y: unknown,
  raw: unknown,
): TileResourceRuntimeState | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !raw || typeof raw !== 'object') {
    return null;
  }

/** candidate：定义该变量以承载业务值。 */
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

/** getTileResourceStateMap：执行对应的业务逻辑。 */
export function getTileResourceStateMap(
  source: Map<string, TileResourceBucketMap>,
  mapId: string,
  resourceKey: string,
): TileResourceStateMap | undefined {
  return source.get(mapId)?.get(resourceKey);
}

/** setTileResourceStateMap：执行对应的业务逻辑。 */
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

/** bucket：定义该变量以承载业务值。 */
  const bucket = source.get(mapId) ?? new Map<string, TileResourceStateMap>();
  bucket.set(resourceKey, stateMap);
  source.set(mapId, bucket);
}

/** deleteTileResourceStateMap：执行对应的业务逻辑。 */
export function deleteTileResourceStateMap(
  source: Map<string, TileResourceBucketMap>,
  mapId: string,
  resourceKey: string,
): void {
/** bucket：定义该变量以承载业务值。 */
  const bucket = source.get(mapId);
  if (!bucket) {
    return;
  }
  bucket.delete(resourceKey);
  if (bucket.size === 0) {
    source.delete(mapId);
  }
}

/** buildPersistedTileRuntimeResources：执行对应的业务逻辑。 */
export function buildPersistedTileRuntimeResources(
  resourceBucket: TileResourceBucketMap | undefined,
  tileKey: string,
): Record<string, PersistedTileRuntimeResourceRecord> | undefined {
  if (!resourceBucket) {
    return undefined;
  }

/** resources：定义该变量以承载业务值。 */
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

/** getTileResourceFlowConfig：执行对应的业务逻辑。 */
export function getTileResourceFlowConfig(resourceKey: string): TileResourceFlowConfig | null {
/** directConfig：定义该变量以承载业务值。 */
  const directConfig = TILE_RESOURCE_FLOW_CONFIGS[resourceKey];
  if (directConfig) {
    return directConfig;
  }

/** descriptor：定义该变量以承载业务值。 */
  const descriptor = parseQiResourceKey(resourceKey);
  if (!descriptor) {
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

/** shouldKeepTileResourceRuntimeState：执行对应的业务逻辑。 */
export function shouldKeepTileResourceRuntimeState(state: TileResourceRuntimeState): boolean {
  return (state.sourceValue ?? 0) > 0
    || state.value > 0
    || (state.decayRemainder ?? 0) > 0
    || (state.sourceRemainder ?? 0) > 0;
}

/** shouldExposeTileResourceDetail：执行对应的业务逻辑。 */
export function shouldExposeTileResourceDetail(state: TileResourceRuntimeState): boolean {
  return (state.sourceValue ?? 0) > 0 || state.value > 0;
}

/** tickTileResourceState：执行对应的业务逻辑。 */
export function tickTileResourceState(resourceKey: string, state: TileResourceRuntimeState): boolean {
/** flowConfig：定义该变量以承载业务值。 */
  const flowConfig = getTileResourceFlowConfig(resourceKey);
  if (!flowConfig) {
    return false;
  }

/** previousValue：定义该变量以承载业务值。 */
  const previousValue = state.value;
/** previousDecayRemainder：定义该变量以承载业务值。 */
  const previousDecayRemainder = state.decayRemainder ?? 0;
/** previousSourceRemainder：定义该变量以承载业务值。 */
  const previousSourceRemainder = state.sourceRemainder ?? 0;

  state.decayRemainder = Math.max(0, Math.round(state.decayRemainder ?? 0))
    + previousValue * flowConfig.halfLifeRateScaled;
/** halfLifeDecayAmount：定义该变量以承载业务值。 */
  const halfLifeDecayAmount = Math.floor(state.decayRemainder / flowConfig.halfLifeRateScale);
  state.decayRemainder %= flowConfig.halfLifeRateScale;

  state.sourceRemainder = Math.max(0, Math.round(state.sourceRemainder ?? 0))
    + Math.max(0, Math.round(state.sourceValue ?? 0)) * flowConfig.halfLifeRateScaled;
/** sourceAmount：定义该变量以承载业务值。 */
  const sourceAmount = Math.floor(state.sourceRemainder / flowConfig.halfLifeRateScale);
  state.sourceRemainder %= flowConfig.halfLifeRateScale;

/** decayAmount：定义该变量以承载业务值。 */
  const decayAmount = previousValue > 0
    ? Math.max(flowConfig.minimumDecayPerTick, halfLifeDecayAmount)
    : 0;
/** nextValue：定义该变量以承载业务值。 */
  const nextValue = Math.max(0, previousValue - decayAmount + sourceAmount);
  if (nextValue !== previousValue) {
    state.value = nextValue;
  }

  return nextValue !== previousValue
    || state.decayRemainder !== previousDecayRemainder
    || state.sourceRemainder !== previousSourceRemainder;
}

/** toPublicTileResourceKey：执行对应的业务逻辑。 */
export function toPublicTileResourceKey(resourceKey: string): string {
  return resourceKey;
}

/** getTileResourceLabel：执行对应的业务逻辑。 */
export function getTileResourceLabel(resourceKey: string): string {
  if (resourceKey === AURA_RESOURCE_KEY) {
    return '无属性灵气';
  }

/** descriptor：定义该变量以承载业务值。 */
  const descriptor = parseQiResourceKey(resourceKey);
  if (!descriptor) {
    return resourceKey;
  }

/** familyLabel：定义该变量以承载业务值。 */
  const familyLabel = QI_FAMILY_LABELS[descriptor.family];
/** formLabel：定义该变量以承载业务值。 */
  const formLabel = QI_FORM_LABELS[descriptor.form];
/** elementLabel：定义该变量以承载业务值。 */
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
