import { DEFAULT_AURA_LEVEL_BASE_VALUE } from './constants/gameplay/aura';
// TODO(next:MIGRATE01): 在灵气配置与存档完全迁到当前“数值即 auraValue”口径后，删除 legacy 等级值兼容换算与判定分支。

/** 计算下一档灵气等级门槛，按 1.5 倍递增。 */
function getNextAuraLevelThreshold(currentThreshold: number): number {
  return Math.max(1, Math.ceil(currentThreshold * 1.5));
}

/** 将灵气等级基准值归一化为正整数，兼容空值和非法输入。 */
export function normalizeAuraLevelBaseValue(value: unknown, fallback = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  const normalizedFallback = Number.isFinite(fallback) && Number(fallback) > 0
    ? Math.max(1, Math.round(Number(fallback)))
    : DEFAULT_AURA_LEVEL_BASE_VALUE;
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return normalizedFallback;
  }
  return Math.max(1, Math.round(Number(value)));
}

/** 将灵气值归一化为非负整数，供等级换算和持久化使用。 */
export function normalizeAuraValue(value: unknown): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(Number(value)));
}

/** 计算指定灵气等级所需的最低灵气值。 */
export function getAuraLevelThreshold(level: number, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  const normalizedLevel = Math.max(0, Math.floor(level));
  if (normalizedLevel <= 0) {
    return 0;
  }
  const base = normalizeAuraLevelBaseValue(baseValue);
  let threshold = base;
  for (let currentLevel = 1; currentLevel < normalizedLevel; currentLevel += 1) {
    threshold = getNextAuraLevelThreshold(threshold);
  }
  return threshold;
}

/** 根据灵气值反推当前可达到的灵气等级。 */
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
    if (threshold > Number.MAX_SAFE_INTEGER / 1.5) {
      break;
    }
    threshold = getNextAuraLevelThreshold(threshold);
  }
  return level;
}

/** 将旧版“等级即数值”的灵气存档转换成当前口径的灵气值。 */
export function convertLegacyAuraLevelToValue(level: number, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  return getAuraLevelThreshold(level, baseValue);
}

/** 判断输入是否仍按旧版灵气等级口径存储。 */
export function isLegacyAuraLevelValue(value: number, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): boolean {
  const normalizedValue = normalizeAuraValue(value);
  const base = normalizeAuraLevelBaseValue(baseValue);
  return Number.isInteger(normalizedValue) && normalizedValue > 0 && normalizedValue < base;
}

/** 兼容旧版等级值并统一输出当前可计算的灵气数值。 */
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
