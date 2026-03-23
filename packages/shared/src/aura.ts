import { DEFAULT_AURA_LEVEL_BASE_VALUE } from './constants';

export function normalizeAuraLevelBaseValue(value: unknown, fallback = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  const normalizedFallback = Number.isFinite(fallback) && Number(fallback) > 0
    ? Math.max(1, Math.round(Number(fallback)))
    : DEFAULT_AURA_LEVEL_BASE_VALUE;
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return normalizedFallback;
  }
  return Math.max(1, Math.round(Number(value)));
}

export function normalizeAuraValue(value: unknown): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(Number(value)));
}

export function getAuraLevelThreshold(level: number, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  const normalizedLevel = Math.max(0, Math.floor(level));
  if (normalizedLevel <= 0) {
    return 0;
  }
  const base = normalizeAuraLevelBaseValue(baseValue);
  return base * Math.pow(2, normalizedLevel - 1);
}

export function getAuraLevel(auraValue: number, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  const normalizedValue = normalizeAuraValue(auraValue);
  const base = normalizeAuraLevelBaseValue(baseValue);
  if (normalizedValue < base) {
    return 0;
  }

  let level = 0;
  let threshold = base;
  while (normalizedValue >= threshold) {
    level += 1;
    if (threshold > Number.MAX_SAFE_INTEGER / 2) {
      break;
    }
    threshold *= 2;
  }
  return level;
}

export function convertLegacyAuraLevelToValue(level: number, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  return getAuraLevelThreshold(level, baseValue);
}

export function isLegacyAuraLevelValue(value: number, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): boolean {
  const normalizedValue = normalizeAuraValue(value);
  const base = normalizeAuraLevelBaseValue(baseValue);
  return Number.isInteger(normalizedValue) && normalizedValue > 0 && normalizedValue < base;
}

export function normalizeConfiguredAuraValue(value: unknown, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  const normalizedValue = normalizeAuraValue(value);
  if (normalizedValue <= 0) {
    return 0;
  }
  if (isLegacyAuraLevelValue(normalizedValue, baseValue)) {
    return convertLegacyAuraLevelToValue(normalizedValue, baseValue);
  }
  return normalizedValue;
}
