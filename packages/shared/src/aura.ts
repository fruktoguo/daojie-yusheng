import { DEFAULT_AURA_LEVEL_BASE_VALUE } from './constants/gameplay/aura';

/** 计算下一档灵气等级门槛，按 1.5 倍递增。 */
function getNextAuraLevelThreshold(currentThreshold: number): number {
  return Math.max(1, Math.ceil(currentThreshold * 1.5));
}

/** 将灵气等级基准值归一化为正整数，兼容空值和非法输入。 */
export function normalizeAuraLevelBaseValue(value: unknown, fallback = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(Number(value)));
}

/** 计算指定灵气等级所需的最低灵气值。 */
export function getAuraLevelThreshold(level: number, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 规范化地图/编辑器里的灵气配置值，next 侧统一按 auraValue 存储。 */
export function normalizeConfiguredAuraValue(value: unknown, _baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  return normalizeAuraValue(value);
}
