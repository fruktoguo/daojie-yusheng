/**
 * 本文件是客户端 DOM UI 的 technique bonus summary 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有焦点/滚动状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import {
  DEFAULT_QI_EFFICIENCY_BP,
  type Attributes,
  calcTechniqueAttrValues,
  calcTechniqueQiProjectionModifiers,
  calcTechniqueSpecialStatValues,
  parseQiResourceKey,
  type PlayerSpecialStats,
  type QiElementKey,
  type QiFamilyKey,
  type QiFormKey,
  type QiProjectionModifier,
  TECHNIQUE_ATTR_KEYS,
  type TechniqueLayerDef,
} from '@mud/shared';
import { ATTR_KEY_LABELS } from '../domain-labels';
import { formatDisplayNumber, formatDisplaySignedNumber } from '../utils/number';

const TECHNIQUE_SPECIAL_STAT_LABELS = {
  comprehension: '悟性',
  luck: '幸运',
} as const;

const QI_FAMILY_LABELS: Record<QiFamilyKey, string> = {
  aura: '灵气',
  demonic: '魔气',
  sha: '煞气',
};

const QI_FORM_LABELS: Record<QiFormKey, string> = {
  refined: '凝练',
  dispersed: '逸散',
};

const QI_ELEMENT_LABELS: Record<QiElementKey, string> = {
  neutral: '无属性',
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
  yin: '阴',
  yang: '阳',
};

type TechniqueSpecialStatKey = keyof typeof TECHNIQUE_SPECIAL_STAT_LABELS;
type TechniqueSpecialStats = Partial<Pick<PlayerSpecialStats, TechniqueSpecialStatKey>>;

export function formatTechniqueBonusSummary(
  attrs?: Partial<Attributes> | null,
  specialStats?: TechniqueSpecialStats | null,
  fallback = '无增益',
): string {
  return joinTechniqueBonusEntries([
    ...formatTechniqueAttrEntries(attrs),
    ...formatTechniqueSpecialStatEntries(specialStats),
  ], fallback);
}

export function formatTechniqueLayerBonusSummary(layer: TechniqueLayerDef, fallback = '无增益'): string {
  return joinTechniqueBonusEntries([
    ...formatTechniqueAttrEntries(layer.attrs),
    ...formatTechniqueSpecialStatEntries(layer.specialStats),
    ...formatTechniqueQiProjectionEntries(layer.qiProjection),
  ], fallback);
}

export function formatTechniqueCumulativeBonusSummary(
  level: number,
  layers?: TechniqueLayerDef[],
  fallback = '无增益',
): string {
  return joinTechniqueBonusEntries([
    ...formatTechniqueAttrEntries(calcTechniqueAttrValues(level, layers)),
    ...formatTechniqueSpecialStatEntries(calcTechniqueSpecialStatValues(level, layers)),
    ...formatTechniqueQiProjectionEntries(calcTechniqueQiProjectionModifiers(level, layers)),
  ], fallback);
}

export function calcTechniqueSpecialStatContribution(level: number, layers?: TechniqueLayerDef[]): TechniqueSpecialStats {
  return calcTechniqueSpecialStatValues(level, layers);
}

/** 格式化功法气机投影，供详情中的当前贡献与逐层/累计预览共用。 */
export function formatTechniqueQiProjectionSummary(
  modifiers?: readonly QiProjectionModifier[] | null,
  fallback = '',
): string {
  return joinTechniqueBonusEntries(formatTechniqueQiProjectionEntries(modifiers), fallback);
}

function joinTechniqueBonusEntries(entries: string[], fallback: string): string {
  return entries.length > 0 ? entries.join(' / ') : fallback;
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

function formatTechniqueQiProjectionEntries(
  modifiers?: readonly QiProjectionModifier[] | null,
): string[] {
  const entries: string[] = [];
  for (const modifier of modifiers ?? []) {
    const targetLabel = formatQiProjectionTargetLabel(modifier);
    const multiplier = modifier.efficiencyBpMultiplier;
    const hasFiniteMultiplier = typeof multiplier === 'number' && Number.isFinite(multiplier);
    const efficiencyPercent = hasFiniteMultiplier
      ? (multiplier - DEFAULT_QI_EFFICIENCY_BP) / 100
      : 0;

    if (hasFiniteMultiplier && efficiencyPercent !== 0) {
      entries.push(`${targetLabel}吸收效率${formatDisplaySignedNumber(efficiencyPercent)}%`);
    }
    if (modifier.visibility === 'observable') {
      entries.push(`${targetLabel}可感知`);
    } else if (modifier.visibility === 'absorbable' && (!hasFiniteMultiplier || efficiencyPercent === 0)) {
      entries.push(`${targetLabel}可吸收`);
    }
  }
  return [...new Set(entries)];
}

function formatQiProjectionTargetLabel(modifier: QiProjectionModifier): string {
  const selector = modifier.selector;
  const resourceLabels = (selector?.resourceKeys ?? [])
    .map((resourceKey) => {
      const descriptor = parseQiResourceKey(resourceKey);
      return descriptor
        ? formatQiDescriptorLabel(descriptor.family, descriptor.form, descriptor.element)
        : resourceKey;
    });
  if (resourceLabels.length > 0) {
    return [...new Set(resourceLabels)].join('、');
  }

  const families = normalizeSelectorValues(selector?.families, Object.keys(QI_FAMILY_LABELS) as QiFamilyKey[]);
  const forms = normalizeSelectorValues(selector?.forms, Object.keys(QI_FORM_LABELS) as QiFormKey[]);
  const elements = normalizeSelectorValues(selector?.elements, Object.keys(QI_ELEMENT_LABELS) as QiElementKey[]);
  const labels = families.flatMap((family) => (
    forms.flatMap((form) => (
      elements.map((element) => formatQiDescriptorLabel(family, form, element))
    ))
  ));
  return [...new Set(labels)].join('、');
}

function normalizeSelectorValues<T extends string>(
  values: readonly T[] | undefined,
  allValues: readonly T[],
): Array<T | undefined> {
  const uniqueValues = [...new Set(values ?? [])];
  if (uniqueValues.length === 0 || allValues.every((value) => uniqueValues.includes(value))) {
    return [undefined];
  }
  return uniqueValues;
}

function formatQiDescriptorLabel(
  family: QiFamilyKey | undefined,
  form: QiFormKey | undefined,
  element: QiElementKey | undefined,
): string {
  if (!family && !form && !element) {
    return '全部气机';
  }
  const familyLabel = family ? QI_FAMILY_LABELS[family] : '气机';
  const formLabel = form === 'dispersed'
    ? QI_FORM_LABELS.dispersed
    : form === 'refined' && element !== 'neutral'
      ? QI_FORM_LABELS.refined
      : '';
  const elementLabel = element === 'neutral'
    ? family === 'aura' || !family
      ? QI_ELEMENT_LABELS.neutral
      : ''
    : element
      ? `${QI_ELEMENT_LABELS[element]}属性`
      : '';
  return `${formLabel}${elementLabel}${familyLabel}`;
}
