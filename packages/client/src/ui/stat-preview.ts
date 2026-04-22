import {
  compileValueStatsToActualStats,
  type Attributes,
  NUMERIC_SCALAR_STAT_KEYS,
  type PartialNumericStats,
} from '@mud/shared';
import { getAttrKeyLabel, getElementKeyLabel, getNumericScalarStatKeyLabel } from '../domain-labels';
import { PERCENT_STAT_KEYS } from '../constants/ui/stat-preview';
import { formatDisplayNumber, formatDisplaySignedNumber, formatDisplayPercent } from '../utils/number';

/** formatSignedNumber：格式化Signed数值。 */
function formatSignedNumber(value: number): string {
  return formatDisplaySignedNumber(value);
}

/** formatSignedStatValue：格式化Signed Stat值。 */
function formatSignedStatValue(key: string, value: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const sign = value >= 0 ? '+' : '-';
  const absValue = Math.abs(value);
  if (key === 'critDamage') {
    return `${sign}${formatDisplayPercent(absValue / 10)}`;
  }
  if (PERCENT_STAT_KEYS.has(key)) {
    return `${sign}${formatDisplayPercent(absValue / 100)}`;
  }
  return `${sign}${formatDisplayNumber(absValue)}`;
}

/** resolvePreviewStats：解析Preview属性。 */
export function resolvePreviewStats(
  stats?: PartialNumericStats,
  valueStats?: PartialNumericStats,
): PartialNumericStats | undefined {
  return valueStats ? compileValueStatsToActualStats(valueStats) : stats;
}

/** describePreviewBonuses：处理describe Preview Bonuses。 */
export function describePreviewBonuses(
  attrs?: Partial<Attributes>,
  stats?: PartialNumericStats,
  valueStats?: PartialNumericStats,
): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const lines: string[] = [];
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value !== 'number' || value === 0) {
        continue;
      }
      lines.push(`${getAttrKeyLabel(key)} ${formatSignedNumber(value)}`);
    }
  }

  const resolvedStats = resolvePreviewStats(stats, valueStats);
  if (!resolvedStats) {
    return lines;
  }

  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const value = resolvedStats[key];
    if (typeof value !== 'number' || value === 0) {
      continue;
    }
    lines.push(`${getNumericScalarStatKeyLabel(key)} ${formatSignedStatValue(key, value)}`);
  }

  if (resolvedStats.elementDamageBonus) {
    for (const [key, value] of Object.entries(resolvedStats.elementDamageBonus)) {
      if (typeof value !== 'number' || value === 0) {
        continue;
      }
      lines.push(`${getElementKeyLabel(key)}行增伤 ${formatSignedNumber(value)}`);
    }
  }

  if (resolvedStats.elementDamageReduce) {
    for (const [key, value] of Object.entries(resolvedStats.elementDamageReduce)) {
      if (typeof value !== 'number' || value === 0) {
        continue;
      }
      lines.push(`${getElementKeyLabel(key)}行减伤 ${formatSignedNumber(value)}`);
    }
  }

  return lines;
}




