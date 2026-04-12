import {
  type BuffModifierMode,
  compileValueStatsToActualStats,
  type Attributes,
  NUMERIC_SCALAR_STAT_KEYS,
  type PartialNumericStats,
} from '@mud/shared';
import { getAttrKeyLabel, getElementKeyLabel, getNumericScalarStatKeyLabel } from '../domain-labels';
import { PERCENT_STAT_KEYS } from '../constants/ui/stat-preview';
import { formatDisplayNumber, formatDisplaySignedNumber, formatDisplayPercent } from '../utils/number';

/** formatSignedNumber：执行对应的业务逻辑。 */
function formatSignedNumber(value: number): string {
  return formatDisplaySignedNumber(value);
}

/** formatSignedPercentValue：执行对应的业务逻辑。 */
function formatSignedPercentValue(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatDisplayPercent(Math.abs(value))}`;
}

/** formatSignedStatValue：执行对应的业务逻辑。 */
function formatSignedStatValue(key: string, value: number): string {
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

/** resolvePreviewStats：执行对应的业务逻辑。 */
export function resolvePreviewStats(
  stats?: PartialNumericStats,
  valueStats?: PartialNumericStats,
  statMode?: BuffModifierMode,
): PartialNumericStats | undefined {
  if (stats) {
    return stats;
  }
  if (statMode === 'percent') {
    return valueStats;
  }
  return valueStats ? compileValueStatsToActualStats(valueStats) : undefined;
}

/** describePreviewBonuses：执行对应的业务逻辑。 */
export function describePreviewBonuses(
  attrs?: Partial<Attributes>,
  stats?: PartialNumericStats,
  valueStats?: PartialNumericStats,
  attrMode?: BuffModifierMode,
  statMode?: BuffModifierMode,
): string[] {
  const lines: string[] = [];
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value !== 'number' || value === 0) {
        continue;
      }
      lines.push(`${getAttrKeyLabel(key)} ${attrMode === 'percent' ? formatSignedPercentValue(value) : formatSignedNumber(value)}`);
    }
  }

  const resolvedStats = resolvePreviewStats(stats, valueStats, statMode);
  if (!resolvedStats) {
    return lines;
  }

  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const value = resolvedStats[key];
    if (typeof value !== 'number' || value === 0) {
      continue;
    }
    lines.push(`${getNumericScalarStatKeyLabel(key)} ${statMode === 'percent' ? formatSignedPercentValue(value) : formatSignedStatValue(key, value)}`);
  }

  if (resolvedStats.elementDamageBonus) {
    for (const [key, value] of Object.entries(resolvedStats.elementDamageBonus)) {
      if (typeof value !== 'number' || value === 0) {
        continue;
      }
      lines.push(`${getElementKeyLabel(key)}行增伤 ${statMode === 'percent' ? formatSignedPercentValue(value) : formatSignedNumber(value)}`);
    }
  }

  if (resolvedStats.elementDamageReduce) {
    for (const [key, value] of Object.entries(resolvedStats.elementDamageReduce)) {
      if (typeof value !== 'number' || value === 0) {
        continue;
      }
      lines.push(`${getElementKeyLabel(key)}行减伤 ${statMode === 'percent' ? formatSignedPercentValue(value) : formatSignedNumber(value)}`);
    }
  }

  return lines;
}

