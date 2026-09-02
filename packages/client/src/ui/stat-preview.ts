/**
 * 本文件是客户端 DOM UI 的 stat preview 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或交易合法性。
 */
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

export type PreviewBonusItem = {
 key: string;
 label: string;
 valueText: string;
 value: number;
 badgeClassName: string;
 icon: string;
};

const STAT_CAPSULE_META: Record<string, { badgeClassName: string; icon: string }> = {
 maxHp: { badgeClassName: 'skill-scaling-hp', icon: '♥' },
 maxQi: { badgeClassName: 'skill-scaling-qi', icon: '◌' },
 physAtk: { badgeClassName: 'skill-scaling-phys-atk', icon: '⚔' },
 spellAtk: { badgeClassName: 'skill-scaling-spell-atk', icon: '✦' },
 physDef: { badgeClassName: 'skill-scaling-phys-def', icon: '🛡' },
 spellDef: { badgeClassName: 'skill-scaling-spell-def', icon: '◈' },
 hit: { badgeClassName: 'skill-scaling-hit', icon: '◎' },
 dodge: { badgeClassName: 'skill-scaling-dodge', icon: '◌' },
 crit: { badgeClassName: 'skill-scaling-crit', icon: '✧' },
 antiCrit: { badgeClassName: 'skill-scaling-crit', icon: '◈' },
 critDamage: { badgeClassName: 'skill-scaling-crit', icon: '✦' },
 breakPower: { badgeClassName: 'skill-scaling-break', icon: '✕' },
 resolvePower: { badgeClassName: 'skill-scaling-resolve', icon: '⬢' },
 moveSpeed: { badgeClassName: 'skill-scaling-speed', icon: '➜' },
};

function escapeHtml(value: string): string {
 return value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
}

function formatSignedNumber(value: number): string {
 return formatDisplaySignedNumber(value);
}

function formatSignedPercentValue(value: number): string {
 const sign = value >= 0 ? '+' : '-';
 return `${sign}${formatDisplayPercent(Math.abs(value))}`;
}

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

function resolveCapsuleMeta(key: string): { badgeClassName: string; icon: string } {
 return STAT_CAPSULE_META[key] ?? { badgeClassName: 'skill-scaling-attr', icon: '◎' };
}

export function makePreviewBonusItem(input: {
 key: string;
 label: string;
 value: number;
 valueText: string;
 badgeClassName?: string;
 icon?: string;
}): PreviewBonusItem {
 const meta = resolveCapsuleMeta(input.key);
 return {
  key: input.key,
  label: input.label,
  value: input.value,
  valueText: input.valueText,
  badgeClassName: input.badgeClassName ?? meta.badgeClassName,
  icon: input.icon ?? meta.icon,
 };
}

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

export function collectPreviewBonuses(
 attrs?: Partial<Attributes>,
 stats?: PartialNumericStats,
 valueStats?: PartialNumericStats,
 attrMode?: BuffModifierMode,
 statMode?: BuffModifierMode,
): PreviewBonusItem[] {
 const items: PreviewBonusItem[] = [];
 if (attrs) {
  for (const [key, value] of Object.entries(attrs)) {
   if (typeof value !== 'number' || value === 0) {
    continue;
   }
   items.push(makePreviewBonusItem({
    key,
    label: getAttrKeyLabel(key),
    value,
    valueText: attrMode === 'percent' ? formatSignedPercentValue(value) : formatSignedNumber(value),
    badgeClassName: 'skill-scaling-attr',
    icon: '◎',
   }));
  }
 }

 const resolvedStats = resolvePreviewStats(stats, valueStats, statMode);
 if (!resolvedStats) {
  return sortPreviewBonuses(items);
 }

 for (const key of NUMERIC_SCALAR_STAT_KEYS) {
  const value = resolvedStats[key];
  if (typeof value !== 'number' || value === 0) {
   continue;
  }
  items.push(makePreviewBonusItem({
   key,
   label: getNumericScalarStatKeyLabel(key),
   value,
   valueText: statMode === 'percent' ? formatSignedPercentValue(value) : formatSignedStatValue(key, value),
  }));
 }

 if (resolvedStats.elementDamageBonus) {
  for (const [key, value] of Object.entries(resolvedStats.elementDamageBonus)) {
   if (typeof value !== 'number' || value === 0) {
    continue;
   }
   items.push(makePreviewBonusItem({
    key: `element-bonus-${key}`,
    label: `${getElementKeyLabel(key)}行增伤`,
    value,
    valueText: statMode === 'percent' ? formatSignedPercentValue(value) : formatSignedNumber(value),
    badgeClassName: 'skill-scaling-spell-atk',
    icon: '✦',
   }));
  }
 }

 if (resolvedStats.elementDamageReduce) {
  for (const [key, value] of Object.entries(resolvedStats.elementDamageReduce)) {
   if (typeof value !== 'number' || value === 0) {
    continue;
   }
   items.push(makePreviewBonusItem({
    key: `element-reduce-${key}`,
    label: `${getElementKeyLabel(key)}行减伤`,
    value,
    valueText: statMode === 'percent' ? formatSignedPercentValue(value) : formatSignedNumber(value),
    badgeClassName: 'skill-scaling-phys-def',
    icon: '🛡',
   }));
  }
 }

 return sortPreviewBonuses(items);
}

export function sortPreviewBonuses(items: readonly PreviewBonusItem[]): PreviewBonusItem[] {
 return [...items].sort((left, right) => {
  const leftLoss = left.value < 0 ? 1 : 0;
  const rightLoss = right.value < 0 ? 1 : 0;
  return leftLoss - rightLoss;
 });
}

export function renderPreviewBonusCapsules(items: readonly PreviewBonusItem[]): string {
 const sorted = sortPreviewBonuses(items);
 if (sorted.length === 0) {
  return '';
 }
 return `<span class="preview-bonus-capsules">${sorted.map((item) => (
  `<span class="skill-scaling ${item.badgeClassName}${item.value < 0 ? ' skill-scaling-loss' : ''}"><span class="skill-scaling-icon">${escapeHtml(item.icon)}</span><span>${escapeHtml(item.label)} ${escapeHtml(item.valueText)}</span></span>`
 )).join('')}</span>`;
}

export function describePreviewBonuses(
 attrs?: Partial<Attributes>,
 stats?: PartialNumericStats,
 valueStats?: PartialNumericStats,
 attrMode?: BuffModifierMode,
 statMode?: BuffModifierMode,
): string[] {
 return collectPreviewBonuses(attrs, stats, valueStats, attrMode, statMode)
  .map((item) => `${item.label} ${item.valueText}`);
}
