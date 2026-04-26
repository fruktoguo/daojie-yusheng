import {
  type Attributes,
  calcTechniqueAttrValues,
  calcTechniqueSpecialStatValues,
  type PlayerSpecialStats,
  TECHNIQUE_ATTR_KEYS,
  type TechniqueLayerDef,
} from '@mud/shared';
import { ATTR_KEY_LABELS } from '../domain-labels';
import { formatDisplayNumber } from '../utils/number';

const TECHNIQUE_SPECIAL_STAT_LABELS = {
  comprehension: '悟性',
  luck: '幸运',
} as const;

type TechniqueSpecialStatKey = keyof typeof TECHNIQUE_SPECIAL_STAT_LABELS;
type TechniqueSpecialStats = Partial<Pick<PlayerSpecialStats, TechniqueSpecialStatKey>>;

export function formatTechniqueBonusSummary(
  attrs?: Partial<Attributes> | null,
  specialStats?: TechniqueSpecialStats | null,
  fallback = '无属性提升',
): string {
  const parts = [
    ...formatTechniqueAttrEntries(attrs),
    ...formatTechniqueSpecialStatEntries(specialStats),
  ];
  return parts.length > 0 ? parts.join(' / ') : fallback;
}

export function formatTechniqueLayerBonusSummary(layer: TechniqueLayerDef, fallback = '无属性提升'): string {
  return formatTechniqueBonusSummary(layer.attrs, layer.specialStats, fallback);
}

export function formatTechniqueCumulativeBonusSummary(
  level: number,
  layers?: TechniqueLayerDef[],
  fallback = '无属性提升',
): string {
  return formatTechniqueBonusSummary(
    calcTechniqueAttrValues(level, layers),
    calcTechniqueSpecialStatValues(level, layers),
    fallback,
  );
}

export function calcTechniqueSpecialStatContribution(level: number, layers?: TechniqueLayerDef[]): TechniqueSpecialStats {
  return calcTechniqueSpecialStatValues(level, layers);
}

function formatTechniqueAttrEntries(attrs?: Partial<Attributes> | null): string[] {
  if (!attrs) {
    return [];
  }
  return TECHNIQUE_ATTR_KEYS
    .map((key) => {
      const value = attrs[key] ?? 0;
      if (value <= 0) {
        return null;
      }
      return `${ATTR_KEY_LABELS[key]}+${formatDisplayNumber(value)}`;
    })
    .filter((entry): entry is string => entry !== null);
}

function formatTechniqueSpecialStatEntries(specialStats?: TechniqueSpecialStats | null): string[] {
  if (!specialStats) {
    return [];
  }
  return (Object.keys(TECHNIQUE_SPECIAL_STAT_LABELS) as TechniqueSpecialStatKey[])
    .map((key) => {
      const value = specialStats[key] ?? 0;
      if (value <= 0) {
        return null;
      }
      return `${TECHNIQUE_SPECIAL_STAT_LABELS[key]}+${formatDisplayNumber(value)}`;
    })
    .filter((entry): entry is string => entry !== null);
}
