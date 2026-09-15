/**
 * 本文件是客户端 DOM UI 的 attr panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 属性面板
 * 以雷达图和数值卡片展示六维、灵根、灵脉、斗法、灵力、特殊六大分类属性
 */
import {
  ATTR_KEYS,
  ATTR_TO_PERCENT_NUMERIC_WEIGHTS,
  ATTR_TO_NUMERIC_WEIGHTS,
  AttrBonus,
  AttrDetailView,
  AttrKey,
  Attributes,
  BASE_MOVE_POINTS_PER_TICK,
  CRAFT_EFFECT_SKILL_KINDS,
  CULTIVATE_EXP_PER_TICK,
  CULTIVATION_REALM_EXP_PER_TICK,
  cloneCraftEffectStats,
  DEFAULT_QI_EFFICIENCY_BP,
  ELEMENT_KEYS,
  HEAVENLY_DAO_SUPPRESSION_BUFF_ID,
  NumericStatBreakdownMap,
  NumericRatioDivisors,
  NumericStats,
  percentModifierToMultiplier,
  S2C_AttrDetail,
  PlayerState,
  PlayerSpecialStats,
  PVP_SOUL_INJURY_BUFF_ID,
  type CraftEffectKind,
  type CraftEffectSkillKind,
  type CraftEffectStatsPatch,
  type QiElementKey,
  type QiFamilyKey,
  type QiFormKey,
  type QiProjectionModifier,
  ratioValue,
  S2C_AttrUpdate,
  TECHNIQUE_MAX_ATTR_PERCENT_BONUS_SOURCE,
  TileType,
  getQiResourceDisplayLabel,
  getMovePointsPerTick,
  getTileTraversalCost,
} from '@mud/shared';
import { ATTR_KEY_LABELS, ELEMENT_KEY_LABELS } from '../../domain-labels';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { preserveSelection } from '../selection-preserver';
import {
  ATTR_COLORS,
  ATTR_TAB_LABELS,
  ELEMENT_COLORS,
  ATTR_ICON_ATLAS_CELLS,
  type NumericCardIconAtlasCell,
  NUMERIC_TOOLTIP_DESCRIPTIONS,
  NUMERIC_TOOLTIP_LABELS,
  PLAYER_SPECIAL_TOOLTIP_DESCRIPTIONS,
  PLAYER_SPECIAL_TOOLTIP_LABELS,
  RATE_BP_KEYS,
  TOOLTIP_STYLE_ID,
  type AttrTab,
  type NumericCardKey,
  type PlayerSpecialCardKey,
} from '../../constants/ui/attr-panel';
import { ACTION_SHORTCUTS_CHANGED_EVENT } from '../../constants/ui/action';
import { formatDisplayInteger, formatDisplayNumber, formatDisplayPercent, formatDisplaySignedNumber } from '../../utils/number';
import {
  describeSpiritualRoots,
  getSpiritualRootAbsorptionRate,
  resolveSpiritualRootsFromBonuses,
} from '../../utils/spiritual-roots';
import { t } from '../i18n';
import { detailModalHost } from '../detail-modal-host';
import {
  mountReactAttrPanel,
  setReactAttrPanelCallbacks,
  shouldUseReactAttrPanel,
  syncReactAttrPanelState,
  unmountReactAttrPanel,
} from '../../react-ui/panels/attr/mount-attr-panel';
import {
  resolveRenderNumericStatBreakdownsImpl,
  mergeAttrsImpl,
  resolveCompleteAttrsImpl,
  buildSnapshotImpl,
  buildBaseRadarSnapshotImpl,
  buildRootRadarSnapshotImpl,
  buildVeinPaneSnapshotImpl,
  buildRadarPaneSnapshotImpl,
  buildNumericPaneSnapshotImpl,
  buildSpecialPaneSnapshotImpl,
  buildSpecialDetailPaneSnapshotImpl,
  buildSpecialDetailPaneSnapshotFromDataImpl,
  buildElementSpecialDetailRowsImpl,
  buildSpecialStatCardsImpl,
  buildBaseSpecialStatCardsImpl,
  buildRootFoundationSummaryCardsImpl,
  buildCraftSkillSnapshotImpl,
  buildCraftPaneSnapshotImpl,
} from './attr-panel.snapshots';
import {
  ensureTooltipStyleImpl,
  bindTooltipEventsImpl,
  requestDetailIfNeededImpl,
  refreshActiveTooltipContentImpl,
  clearTooltipTargetImpl,
  resolveTooltipTargetKeyImpl,
  resolveCurrentTooltipTargetImpl,
  scheduleActiveTooltipRefreshImpl,
  cancelScheduledTooltipRefreshImpl,
} from './attr-panel.tooltips';

type AttrPanelCallbacks = {
  onRequestDetail?: () => void;
  onOpenCraftSkill?: (key: string) => void;
  onBindCraftSkill?: (key: string) => void;
  getCraftSkillBindLabel?: (key: string) => string;
};

type DisplayQiDescriptor = {
  family: QiFamilyKey;
  form: QiFormKey;
  element: QiElementKey;
};

type DisplayQiProjection = {
  visibility: 'hidden' | 'observable' | 'absorbable';
  efficiencyBp: number;
  sources: string[];
};

const QI_VISIBILITY_RANK: Record<DisplayQiProjection['visibility'], number> = {
  hidden: 0,
  observable: 1,
  absorbable: 2,
};

export const OPENABLE_CRAFT_SKILL_KEYS = new Set(['alchemy', 'forging', 'enhancement', 'transmission', 'building']);
export const SPECIAL_DETAIL_ACTION_KEY = 'special-details';
const SPECIAL_DETAIL_MODAL_OWNER = 'attr:special-details';

export const CRAFT_EFFECT_SKILL_LABELS: Record<CraftEffectSkillKind, string> = {
  alchemy: '炼丹',
  forging: '炼器',
  enhancement: '强化',
  transmission: '传法',
  gather: '采集',
  mining: '挖矿',
  building: '营造',
  formation: '阵法',
};

export const CRAFT_EFFECT_KIND_LABELS: Record<CraftEffectKind, string> = {
  speedRate: '速度',
  successRate: '成功率',
  outputRate: '产出',
  expRate: '经验',
};
export const CRAFT_EFFECT_DETAIL_KINDS: CraftEffectKind[] = ['speedRate', 'successRate', 'outputRate', 'expRate'];

/** formatRateBp：格式化速率Bp。 */
export function formatRateBp(value: number): string {
  const percent = value / 100;
  return formatDisplayPercent(percent);
}

/** formatSimplePercent：格式化Simple Percent。 */
export function formatSimplePercent(value: number): string {
  return formatDisplayPercent(value);
}

export function formatSignedRatePercent(value: number): string {
  const numericValue = Number.isFinite(value) ? value : 0;
  const sign = numericValue >= 0 ? '+' : '';
  return `${sign}${formatDisplayPercent(numericValue * 100)}`;
}

/** getCraftProgressRatio：读取制作进度Ratio。 */
export function getCraftProgressRatio(exp: number, expToNext: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (expToNext <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, exp / expToNext));
}

/** formatAuraAbsorptionRate：格式化灵气Absorption速率。 */
export function formatAuraAbsorptionRate(value: number): string {
  return formatDisplayPercent(value, { maximumFractionDigits: 2 });
}

export function formatQiEfficiencyBp(value: number): string {
  return formatAuraAbsorptionRate(value / 100);
}

export function resolveQiProjectionDisplay(
  descriptor: DisplayQiDescriptor,
  bonuses: AttrBonus[],
  defaultVisibility: DisplayQiProjection['visibility'],
): DisplayQiProjection {
  let visibility = defaultVisibility;
  const baselineBp = defaultVisibility === 'hidden' ? 0 : DEFAULT_QI_EFFICIENCY_BP;
  let efficiencyDelta = 0;
  let hasEfficiencyModifier = false;
  const sources = new Set<string>();
  for (const bonus of bonuses) {
    for (const modifier of bonus.qiProjection ?? []) {
      if (!matchesQiProjectionModifier(descriptor, modifier)) {
        continue;
      }
      if (modifier.visibility && QI_VISIBILITY_RANK[modifier.visibility] > QI_VISIBILITY_RANK[visibility]) {
        visibility = modifier.visibility;
      }
      if (modifier.efficiencyBpMultiplier !== undefined) {
        hasEfficiencyModifier = true;
        efficiencyDelta += modifier.efficiencyBpMultiplier - DEFAULT_QI_EFFICIENCY_BP;
      }
      sources.add(bonus.label ?? bonus.source);
    }
  }
  return {
    visibility,
    efficiencyBp: hasEfficiencyModifier ? Math.max(0, baselineBp + efficiencyDelta) : baselineBp,
    sources: [...sources],
  };
}

function matchesQiProjectionModifier(descriptor: DisplayQiDescriptor, modifier: QiProjectionModifier): boolean {
  const selector = modifier.selector;
  if (!selector) {
    return true;
  }
  if (selector.families && selector.families.length > 0 && !selector.families.includes(descriptor.family)) {
    return false;
  }
  if (selector.forms && selector.forms.length > 0 && !selector.forms.includes(descriptor.form)) {
    return false;
  }
  if (selector.elements && selector.elements.length > 0 && !selector.elements.includes(descriptor.element)) {
    return false;
  }
  if (selector.resourceKeys && selector.resourceKeys.length > 0) {
    const resourceKey = `${descriptor.family}.${descriptor.form}.${descriptor.element}`;
    return selector.resourceKeys.includes(resourceKey);
  }
  return true;
}

export function buildQiProjectionSourceLines(projection: DisplayQiProjection): string[] {
  return projection.sources.length > 0
    ? [t('attr.qi-projection.source', { sources: projection.sources.join('、') })]
    : [];
}

/** formatCritDamageBonus：格式化Crit Damage Bonus。 */
function formatCritDamageBonus(value: number): string {
  const percent = value / 10;
  return formatDisplayPercent(percent);
}

/** colorWithAlpha：处理颜色With Alpha。 */
export function colorWithAlpha(color: string, alpha: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const hex = color.startsWith('#') ? color.slice(1) : color;
  const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  if (normalized.length !== 6) return color;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

/** formatRatioPercent：格式化Ratio Percent。 */
export function formatRatioPercent(raw: number, divisor: number): string {
  return formatDisplayPercent(ratioValue(raw, divisor) * 100);
}

/** formatNumericTooltipValue：格式化Numeric提示值。 */
function formatNumericTooltipValue(key: NumericCardKey, value: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (key === 'critDamage') {
    return formatCritDamageBonus(value);
  }
  if (key === 'extraAggroRate') {
    return formatDisplayPercent(value);
  }
  if (RATE_BP_KEYS.has(key)) {
    return formatRateBp(value);
  }
  return formatDisplayInteger(value);
}

function buildAttrConversionLines(key: AttrKey, totalValue: number): string[] {
  const parts = buildAttrConversionEntries(key, totalValue);
  return parts.length > 0 ? parts : ['暂无具体转化'];
}

/** buildAttrConversionEntries：构建属性Conversion Entries。 */
function buildAttrConversionEntries(key: AttrKey, totalValue: number): string[] {
  const percentWeights = ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key];
  const weights = ATTR_TO_NUMERIC_WEIGHTS[key];
  const percentParts = Object.entries(percentWeights)
    .filter(([, entryValue]) => typeof entryValue === 'number' && entryValue !== 0)
    .map(([entryKey, entryValue]) => {
      const numericKey = entryKey as NumericCardKey;
      const total = entryValue * totalValue;
      return `${NUMERIC_TOOLTIP_LABELS[numericKey] ?? '未知统计'} +${formatSimplePercent(total)}`;
    });
  const flatParts = Object.entries(weights)
    .filter(([entryKey, entryValue]) => entryKey !== 'elementDamageBonus' && entryKey !== 'elementDamageReduce' && typeof entryValue === 'number' && entryValue !== 0)
    .map(([entryKey, entryValue]) => {
      const numericKey = entryKey as NumericCardKey;
      const total = entryValue * totalValue;
      return `${NUMERIC_TOOLTIP_LABELS[numericKey] ?? '未知统计'} +${formatNumericTooltipValue(numericKey, total)}`;
    });
  return [...percentParts, ...flatParts];
}

function resolveBodyTrainingAttributePercent(specialStats?: PlayerSpecialStats): number {
  return Math.max(0, Math.floor(Number(specialStats?.bodyTrainingLevel ?? 0) || 0));
}

function resolveRootFoundationAttributePercent(specialStats?: PlayerSpecialStats): number {
  return Math.max(0, Math.floor(Number(specialStats?.rootFoundation ?? 0) || 0));
}

function getAttrBonusValue(bonus: AttrBonus, key: AttrKey): number {
  const value = Number(bonus.attrs?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function isTechniqueOrRuntimeAttrBonus(bonus: AttrBonus): boolean {
  return bonus.source.startsWith('technique:') || bonus.source.startsWith('runtime:');
}

function isFixedExtraAttrBonus(bonus: AttrBonus): boolean {
  return bonus.attrMode !== 'percent'
    && (isTechniqueOrRuntimeAttrBonus(bonus)
      || bonus.source.startsWith('equipment:')
      || bonus.source.startsWith('buff:'));
}

function isPillPercentAttrBonus(bonus: AttrBonus): boolean {
  if (bonus.attrMode !== 'percent') {
    return false;
  }
  const sourceSkillId = typeof bonus.meta?.sourceSkillId === 'string' ? bonus.meta.sourceSkillId : '';
  return sourceSkillId.startsWith('pill.') || bonus.source.startsWith('buff:item_buff.');
}

function isTechniqueMaxPercentAttrBonus(bonus: AttrBonus): boolean {
  return bonus.attrMode === 'percent' && bonus.source === TECHNIQUE_MAX_ATTR_PERCENT_BONUS_SOURCE;
}

function isHeavenlyDaoSuppressionAttrBonus(bonus: AttrBonus): boolean {
  return bonus.attrMode === 'percent'
    && bonus.source === `buff:${HEAVENLY_DAO_SUPPRESSION_BUFF_ID}`;
}

export function isPvPSoulInjuryAttrBonus(bonus: AttrBonus): boolean {
  return bonus.attrMode === 'percent'
    && bonus.source === `buff:${PVP_SOUL_INJURY_BUFF_ID}`
    && bonus.meta?.linearReductionPercent === true;
}

function sumAttrBonusPercent(bonuses: AttrBonus[], key: AttrKey, predicate: (bonus: AttrBonus) => boolean): number {
  let total = 0;
  for (const bonus of bonuses) {
    if (predicate(bonus)) {
      total += getAttrBonusValue(bonus, key);
    }
  }
  return total;
}

export function buildAttributeBreakdownLines(
  key: AttrKey,
  baseValue: number,
  finalValue: number,
  bonuses: AttrBonus[],
  specialStats?: PlayerSpecialStats,
): string[] {
  const baseIncludedExtraValue = sumAttrBonusPercent(bonuses, key, isTechniqueOrRuntimeAttrBonus);
  const fixedExtraValue = sumAttrBonusPercent(bonuses, key, isFixedExtraAttrBonus);
  const displayFixedBaseValue = baseValue - baseIncludedExtraValue;
  const displayFixedTotalValue = displayFixedBaseValue + fixedExtraValue;
  const bodyTrainingMultiplier = percentModifierToMultiplier(resolveBodyTrainingAttributePercent(specialStats));
  const techniqueMaxMultiplier = percentModifierToMultiplier(sumAttrBonusPercent(bonuses, key, isTechniqueMaxPercentAttrBonus));
  const realmMultiplier = percentModifierToMultiplier(resolveRootFoundationAttributePercent(specialStats));
  const regularBuffMultiplier = percentModifierToMultiplier(sumAttrBonusPercent(bonuses, key, (bonus) => bonus.attrMode === 'percent' && !isTechniqueMaxPercentAttrBonus(bonus) && !isPillPercentAttrBonus(bonus) && !isHeavenlyDaoSuppressionAttrBonus(bonus) && !isPvPSoulInjuryAttrBonus(bonus)));
  const heavenlyDaoSuppressionMultiplier = percentModifierToMultiplier(sumAttrBonusPercent(bonuses, key, isHeavenlyDaoSuppressionAttrBonus));
  const pvpSoulInjuryMultiplier = Math.max(0, 1 + sumAttrBonusPercent(bonuses, key, isPvPSoulInjuryAttrBonus) / 100);
  const buffMultiplier = regularBuffMultiplier * heavenlyDaoSuppressionMultiplier * pvpSoulInjuryMultiplier;
  const pillMultiplier = percentModifierToMultiplier(sumAttrBonusPercent(bonuses, key, isPillPercentAttrBonus));
  const totalMultiplier = bodyTrainingMultiplier * techniqueMaxMultiplier * realmMultiplier * buffMultiplier * pillMultiplier;
  return [
    renderTooltipPrimaryLine('实际：', formatDisplayInteger(finalValue)),
    renderTooltipSectionLine(t('attr.tooltip.total-fixed', { value: formatDisplayInteger(displayFixedTotalValue) }), 'fixed'),
    renderTooltipChildLine(t('attr.tooltip.base-value'), formatDisplayInteger(displayFixedBaseValue), 'fixed'),
    renderTooltipChildLine(t('attr.tooltip.extra-value'), `${fixedExtraValue >= 0 ? '+' : ''}${formatDisplayInteger(fixedExtraValue)}`, 'fixed'),
    renderTooltipSectionLine(t('attr.tooltip.total-percent', { value: formatMultiplierDisplay(totalMultiplier) }), 'percent'),
    renderTooltipChildLine(t('attr.tooltip.body-training'), formatMultiplierDisplay(bodyTrainingMultiplier), 'percent'),
    renderTooltipChildLine(t('attr.tooltip.technique-max'), formatMultiplierDisplay(techniqueMaxMultiplier), 'percent'),
    renderTooltipChildLine(t('attr.tooltip.root-foundation'), formatMultiplierDisplay(realmMultiplier), 'percent'),
    renderTooltipChildLine(t('attr.tooltip.buff-status'), formatMultiplierDisplay(buffMultiplier), 'percent'),
    renderTooltipChildLine(t('attr.tooltip.pill'), formatMultiplierDisplay(pillMultiplier), 'percent'),
    renderTooltipSectionLine(t('attr.tooltip.actual-conversion'), 'percent'),
    ...buildAttrConversionLines(key, finalValue),
  ];
}

/** splitTooltipLines：处理split提示Lines。 */
export function splitTooltipLines(detail: string): string[] {
  return detail
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

/** formatCritDamageDisplay：格式化Crit Damage显示。 */
export function formatCritDamageDisplay(value: number): string {
  const total = 200 + value / 10;
  return formatDisplayPercent(total);
}

/** formatMoveSpeedEffect：格式化移动速度效果。 */
export function formatMoveSpeedEffect(value: number): string {
  const safeValue = Math.max(0, value);
  const movePoints = getMovePointsPerTick(safeValue);
  const roadTiles = movePoints / getTileTraversalCost(TileType.Road);
  const trailTiles = movePoints / getTileTraversalCost(TileType.Trail);
  const grassTiles = movePoints / getTileTraversalCost(TileType.Grass);
  const swampTiles = movePoints / getTileTraversalCost(TileType.Swamp);
  return t('attr.tooltip.move-speed-detail', { movePoints: formatDisplayNumber(movePoints), roadTiles: formatDisplayNumber(roadTiles), trailTiles: formatDisplayNumber(trailTiles), grassTiles: formatDisplayNumber(grassTiles), swampTiles: formatDisplayNumber(swampTiles) });
}

/** formatMoveSpeedDisplay：格式化移动速度显示。 */
export function formatMoveSpeedDisplay(value: number): string {
  return formatDisplayInteger(getMovePointsPerTick(value));
}

/** formatMultiplierDisplay：格式化乘区倍率显示。 */
function formatMultiplierDisplay(multiplier: number): string {
  return `X${formatDisplayNumber(multiplier * 100)}%`;
}

/** formatBreakdownValue：格式化拆解数值显示。 */
function formatBreakdownValue(key: NumericCardKey, value: number): string {
  if (key === 'critDamage') {
    return formatDisplayPercent(value / 10);
  }
  if (key === 'extraAggroRate') {
    return formatDisplayPercent(value);
  }
  if (RATE_BP_KEYS.has(key)) {
    return formatDisplayPercent(value / 100);
  }
  if (key === 'moveSpeed') {
    return formatDisplayInteger(value);
  }
  return formatDisplayNumber(value);
}

/** formatSignedBreakdownValue：格式化带符号的拆解数值显示。 */
function formatSignedBreakdownValue(key: NumericCardKey, value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const absValue = Math.abs(value);
  if (key === 'critDamage') {
    return `${sign}${formatDisplayPercent(absValue / 10)}`;
  }
  if (key === 'extraAggroRate') {
    return `${sign}${formatDisplayPercent(absValue)}`;
  }
  if (RATE_BP_KEYS.has(key)) {
    return `${sign}${formatDisplayPercent(absValue / 100)}`;
  }
  return `${sign}${formatDisplaySignedNumber(value).replace(/^[+-]/, '')}`;
}

/** renderTooltipPrimaryLine：渲染 tooltip 主行。 */
function renderTooltipPrimaryLine(label: string, value: string): string {
  return `<span class="attr-tooltip-primary"><span class="attr-tooltip-primary-label">${escapeHtml(label)}</span><span class="attr-tooltip-primary-value">${escapeHtml(value)}</span></span>`;
}

/** renderTooltipSectionLine：渲染 tooltip 分组行。 */
function renderTooltipSectionLine(label: string, tone: 'fixed' | 'percent'): string {
  return `<span class="attr-tooltip-section ${tone}">${escapeHtml(label)}</span>`;
}

/** renderTooltipChildLine：渲染 tooltip 子行。 */
function renderTooltipChildLine(label: string, value: string, tone: 'fixed' | 'percent'): string {
  return `<span class="attr-tooltip-child ${tone}"><span class="attr-tooltip-child-label">${escapeHtml(label)}</span><span class="attr-tooltip-child-value">${escapeHtml(value)}</span></span>`;
}

/** SYSTEM_FIXED_BASE_BY_NUMERIC_KEY：数值面板中的系统固定底座。 */
const SYSTEM_FIXED_BASE_BY_NUMERIC_KEY: Partial<Record<NumericCardKey, number>> = {
  realmExpPerTick: CULTIVATION_REALM_EXP_PER_TICK,
  techniqueExpPerTick: CULTIVATE_EXP_PER_TICK,
};

/** getAttrFlatContribution：计算六维对当前数值的固定贡献。 */
function getAttrFlatContribution(key: NumericCardKey, attrs: Attributes): number {
  let total = 0;
  for (const attrKey of ATTR_KEYS) {
    const weight = ATTR_TO_NUMERIC_WEIGHTS[attrKey][key];
    if (typeof weight !== 'number' || weight === 0) {
      continue;
    }
    total += attrs[attrKey] * weight;
  }
  return total;
}

/** buildNumericBreakdownLines：构建 main 风格的数值拆解 tooltip 行。 */
function buildNumericBreakdownLines(
  breakdowns: NumericStatBreakdownMap | undefined,
  key: NumericCardKey,
  attrs: Attributes,
): string[] {
  const breakdown = breakdowns?.[key];
  if (!breakdown) {
    return [];
  }
  const attrMultiplier = percentModifierToMultiplier(breakdown.attrMultiplierPct);
  const buffMultiplier = percentModifierToMultiplier(breakdown.buffMultiplierPct);
  const pillMultiplier = percentModifierToMultiplier(breakdown.pillMultiplierPct);
  const totalMultiplier = attrMultiplier * breakdown.realmMultiplier * buffMultiplier * pillMultiplier;
  const attrFlatContribution = getAttrFlatContribution(key, attrs);
  const systemFixedBase = Math.max(0, SYSTEM_FIXED_BASE_BY_NUMERIC_KEY[key] ?? 0);
  const foldedSystemBase = Math.min(systemFixedBase, Math.max(0, breakdown.flatBuffValue));
  const displayFixedBaseValue = key === 'moveSpeed'
    ? BASE_MOVE_POINTS_PER_TICK + breakdown.realmBaseValue + attrFlatContribution
    : breakdown.realmBaseValue + attrFlatContribution + foldedSystemBase;
  const displayExtraValue = breakdown.baseValue - breakdown.realmBaseValue - attrFlatContribution + breakdown.flatBuffValue - foldedSystemBase;
  const displayFixedTotalValue = key === 'moveSpeed'
    ? BASE_MOVE_POINTS_PER_TICK + breakdown.baseValue + breakdown.flatBuffValue
    : breakdown.baseValue + breakdown.flatBuffValue;
  const displayFinalValue = key === 'moveSpeed'
    ? getMovePointsPerTick(breakdown.finalValue)
    : breakdown.finalValue;
  const lines = [
    renderTooltipPrimaryLine('实际：', formatBreakdownValue(key, displayFinalValue)),
    renderTooltipSectionLine(t('attr.tooltip.total-fixed', { value: formatBreakdownValue(key, displayFixedTotalValue) }), 'fixed'),
    renderTooltipChildLine(t('attr.tooltip.base-value'), formatBreakdownValue(key, displayFixedBaseValue), 'fixed'),
    renderTooltipChildLine(t('attr.tooltip.extra-value'), formatSignedBreakdownValue(key, displayExtraValue), 'fixed'),
    renderTooltipSectionLine(t('attr.tooltip.total-percent', { value: formatMultiplierDisplay(totalMultiplier) }), 'percent'),
    renderTooltipChildLine(t('attr.tooltip.six-dim'), formatMultiplierDisplay(attrMultiplier), 'percent'),
    renderTooltipChildLine(t('attr.tooltip.realm'), formatMultiplierDisplay(breakdown.realmMultiplier), 'percent'),
    renderTooltipChildLine(t('attr.tooltip.buff-status'), formatMultiplierDisplay(buffMultiplier), 'percent'),
    renderTooltipChildLine(t('attr.tooltip.pill'), formatMultiplierDisplay(pillMultiplier), 'percent'),
  ];
  if (breakdown.preMultiplierValue <= 1e-6 && breakdown.finalValue > 0) {
    lines.push(`<span class="attr-tooltip-note">${t('attr.tooltip.base-zero-note')}</span>`);
  }
  if (key === 'moveSpeed') {
    lines.push(`<span class="attr-tooltip-note">${t('attr.tooltip.move-speed-note')}</span>`);
  }
  return lines;
}

/** buildCombatFormulaLines：构建战斗Formula Lines。 */
function buildCombatFormulaLines(key: NumericCardKey): string[] {
  switch (key) {
    case 'physDef':
      return ['物理对抗中，护体愈厚则伤势越轻，化解发动时防御更重。'];
    case 'spellDef':
      return ['法术对抗中，法防愈坚则法伤愈轻，化解发动时法防重算。'];
    case 'hit':
      return ['命中代表取势之机，值越高越易洞穿对手的闪避。'];
    case 'dodge':
      return ['闪避值反映步法稳健，数高则更易避开来势。'];
    case 'crit':
      return ['暴击是重击之机，暴击值越高，重创越易出现。'];
    case 'antiCrit':
      return ['免爆是反噬护体，护体越高，敌手重击越难成。'];
    case 'critDamage':
      return ['暴击后的伤害倍率会随此值浮动，越高则一击更重。'];
    case 'breakPower':
      return ['破招值主导先发之机，优于对方化解则可先破其护。'];
    case 'resolvePower':
      return ['化解可转敌破势为自身稳局，先于对方破招时更能护体。'];
    default:
      return [];
  }
}

/** buildNumericTooltip：构建Numeric提示。 */
export function buildNumericTooltip(
  label: string,
  key: NumericCardKey,
  numericValue: number,
  ratioValueText?: string,
  breakdowns?: NumericStatBreakdownMap,
  attrs?: Attributes,
): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const breakdownLines = attrs ? buildNumericBreakdownLines(breakdowns, key, attrs) : [];
  const lines = [NUMERIC_TOOLTIP_DESCRIPTIONS[key] ?? '该属性影响角色的实际战斗表现。'];
  if (breakdownLines.length > 0) {
    lines.push(...breakdownLines);
  } else {
    lines.push(`当前数值：${key === 'critDamage' ? formatCritDamageDisplay(numericValue) : key === 'moveSpeed' ? formatMoveSpeedDisplay(numericValue) : key === 'extraAggroRate' ? formatDisplayPercent(numericValue) : RATE_BP_KEYS.has(key) ? formatRateBp(numericValue) : formatDisplayInteger(numericValue)}`);
  }
  lines.push(...buildCombatFormulaLines(key));
  if (key === 'moveSpeed') {
    lines.push(`实际效果：${formatMoveSpeedEffect(numericValue)}`);
  } else if (ratioValueText && key !== 'critDamage') {
    lines.push(ratioValueText);
  }
  return lines.join('\n');
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** getNumericCardIconAtlasCell：读取数值卡片在属性图集中的格子坐标。 */
function getNumericCardIconAtlasCell(key: string): NumericCardIconAtlasCell | undefined {
  return ATTR_ICON_ATLAS_CELLS[key];
}

/** renderAtlasIcon：渲染图集中的一个图标。 */
function renderAtlasIcon(key: string, className: string): string {
  const iconCell = getNumericCardIconAtlasCell(key);
  if (!iconCell) {
    return '';
  }
  return `<span class="${className}" style="--attr-icon-col:${iconCell.col};--attr-icon-row:${iconCell.row};" aria-hidden="true"></span>`;
}

/** renderAttrMiniCard：渲染属性数值宫格卡片。 */
function renderAttrMiniCard(
  card: AttrNumericCardSnapshot,
  options: {
    cardAttr: string;
    labelAttr: string;
    valueAttr: string;
    subAttr: string;
  },
): string {
  const mark = card.mark?.trim();
  const iconHtml = mark
    ? `<span class="attr-mini-mark" aria-hidden="true">${escapeHtml(mark)}</span>`
    : renderAtlasIcon(card.key, 'attr-mini-icon');
  return `<div class="attr-mini ${iconHtml ? 'attr-mini--with-icon' : ''}" ${options.cardAttr}="${escapeHtml(card.key)}" data-tooltip-key="${escapeHtml(card.key)}" data-tooltip-title="${escapeHtml(card.tooltipTitle)}" data-tooltip-detail="${escapeHtml(card.tooltipDetail)}">
    <div class="attr-mini-main">
      ${iconHtml}
      <div class="attr-mini-value" ${options.valueAttr}="true">${card.value}</div>
    </div>
    <div class="attr-mini-label" ${options.labelAttr}="true">${card.label}</div>
    <div class="attr-mini-sub ${card.sub ? '' : 'hidden'}" ${options.subAttr}="true">${card.sub ?? ''}</div>
  </div>`;
}

/** formatRadarNodePercent：把雷达 viewBox 坐标转为绝对定位百分比。 */
function formatRadarNodePercent(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '50%';
  }
  return `${((numeric / 340) * 100).toFixed(3)}%`;
}

/** 属性雷达图中的单个节点，包含标签、数值、颜色和提示文案。 */
interface RadarEntry {
/**
 * key：图标与增量更新使用的稳定键。
 */

  key: string;
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: number;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * valueLabel：值Label名称或显示文本。
 */

  valueLabel?: string;  
  /**
 * tooltipTitle：提示Title名称或显示文本。
 */

  tooltipTitle: string;
  /**
 * tooltipDetail：提示详情状态或数据块。
 */

  tooltipDetail: string;
}

/** 单个雷达节点的渲染快照，记录坐标、标签和值提示。 */
export interface AttrRadarNodeSnapshot {
/**
 * key：图标与增量更新使用的稳定键。
 */

  key: string;
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * valueLabel：值Label名称或显示文本。
 */

  valueLabel: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * dotX：dotX相关字段。
 */

  dotX: string;  
  /**
 * dotY：dotY相关字段。
 */

  dotY: string;  
  /**
 * labelX：labelX相关字段。
 */

  labelX: string;  
  /**
 * labelY：labelY相关字段。
 */

  labelY: string;  
  /**
 * valueX：值X相关字段。
 */

  valueX: string;  
  /**
 * valueY：值Y相关字段。
 */

  valueY: string;  
  /**
 * tooltipTitle：提示Title名称或显示文本。
 */

  tooltipTitle: string;
  /**
 * tooltipDetail：提示详情状态或数据块。
 */

  tooltipDetail: string;
}

/** 雷达属性页的渲染快照，包含标题、网格、轴线和节点。 */
export interface AttrRadarPaneSnapshot {
/**
 * kind：kind相关字段。
 */

  kind: 'radar';  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * scaleLabel：scaleLabel相关字段。
 */

  scaleLabel: string;
  /**
 * paneId：paneID标识。
 */

  paneId: string;  
  /**
 * areaPoints：areaPoint相关字段。
 */

  areaPoints: string;  
  /**
 * rings：ring相关字段。
 */

  rings: string[];  
  /**
 * axes：axe相关字段。
 */

  axes: Array<{  
  /**
 * x：x相关字段。
 */
 x: string;  
 /**
 * y：y相关字段。
 */
 y: string;  
 /**
 * stroke：stroke相关字段。
 */
 stroke: string }>;  
 /**
 * nodes：node相关字段。
 */

  nodes: AttrRadarNodeSnapshot[];
  /**
 * cards：雷达下方附加卡片。
 */

  cards?: AttrNumericCardSnapshot[];
  /**
 * summaryCards：雷达图内侧摘要卡片。
 */

  summaryCards?: AttrNumericCardSnapshot[];
}

/** 数值卡片的渲染快照，包含展示值、附加说明和提示内容。 */
export interface AttrNumericCardSnapshot {
/**
 * key：key标识。
 */

  key: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: string;  
  /**
 * sub：sub相关字段。
 */

  sub?: string;
  /** 灵脉等卡片用单字标记替代图集图标。 */
  mark?: string;
  /**
 * tooltipTitle：提示Title名称或显示文本。
 */

  tooltipTitle: string;
  /**
 * tooltipDetail：提示详情状态或数据块。
 */

  tooltipDetail: string;
}

export interface AttrPaneActionSnapshot {
  key: string;
  label: string;
}

/** 数值属性页的渲染快照，按卡片列表组织。 */
export interface AttrNumericPaneSnapshot {
/**
 * kind：kind相关字段。
 */

  kind: 'numeric';  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * cards：card相关字段。
 */

  cards: AttrNumericCardSnapshot[];
  actions?: AttrPaneActionSnapshot[];
}

export interface AttrSpecialDetailRowSnapshot {
  key: string;
  label: string;
  value: string;
  detail?: string;
}

export interface AttrSpecialDetailSectionSnapshot {
  key: string;
  title: string;
  rows: AttrSpecialDetailRowSnapshot[];
}

export interface AttrSpecialDetailPaneSnapshot {
  kind: 'special-detail';
  title: string;
  backLabel: string;
  sections: AttrSpecialDetailSectionSnapshot[];
}

/** 属性页占位快照，用于尚未同步到数据时的提示。 */
export interface AttrPlaceholderPaneSnapshot {
/**
 * kind：kind相关字段。
 */

  kind: 'placeholder';  
  /**
 * message：message相关字段。
 */

  message: string;
}

/** 采集 / 炼器 / 强化技能的渲染快照，包含等级和进度信息。 */
export interface AttrCraftSkillSnapshot {
/**
 * key：key标识。
 */

  key: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * level：等级数值。
 */

  level: string;  
  /**
 * progress：进度状态或数据块。
 */

  progress: string;  
  /**
 * remain：remain相关字段。
 */

  remain: string;  
  /**
 * progressPercent：进度Percent相关字段。
 */

  progressPercent: string;
  /**
 * tooltipTitle：提示Title名称或显示文本。
 */

  tooltipTitle: string;
  /**
 * tooltipDetail：提示详情状态或数据块。
 */

  tooltipDetail: string;
  /**
 * openable：是否可点击打开对应技艺 UI。
 */

  openable: boolean;
  /**
 * bindLabel：快捷键绑定按钮文案。
 */

  bindLabel: string;
}

/** 生活技能页的渲染快照，按技能列表展示。 */
export interface AttrCraftPaneSnapshot {
/**
 * kind：kind相关字段。
 */

  kind: 'craft';  
  /**
 * skills：技能相关字段。
 */

  skills: AttrCraftSkillSnapshot[];
}

/** 单个属性页的统一渲染快照类型。 */
export type AttrPaneSnapshot = AttrRadarPaneSnapshot | AttrNumericPaneSnapshot | AttrPlaceholderPaneSnapshot | AttrCraftPaneSnapshot;

/** 整个属性面板的渲染快照，按分页保存各页内容。 */
export interface AttrPanelSnapshot {
/**
 * panes：pane相关字段。
 */

  panes: Record<AttrTab, AttrPaneSnapshot>;
}

/** AttrPanel：属性面板实现。 */
export class AttrPanel {
  /** pane：pane。 */
  pane = document.getElementById('pane-attr')!;
  /** activeTab：活跃Tab。 */
  activeTab: AttrTab = 'base';
  /** tooltip：提示。 */
  tooltip = new FloatingTooltip('floating-tooltip attr-tooltip');
  /** lastSnapshot：last快照。 */
  private lastSnapshot: AttrPanelSnapshot | null = null;
  /** lastStructureKey：last Structure Key。 */
  private lastStructureKey: string | null = null;
  /** tooltipTarget：提示目标。 */
  tooltipTarget: Element | null = null;  
  tooltipTargetKey: string | null = null;
  tooltipRefreshFrame: number | null = null;
  /** tabButtons：属性页签节点缓存。 */
  private tabButtons = new Map<AttrTab, HTMLElement>();
  /** paneEls：属性分页节点缓存。 */
  private paneEls = new Map<AttrTab, HTMLElement>();
  /** callbacks：详情请求回调。 */
  callbacks: AttrPanelCallbacks | null = null;
  /** latestData：最近一次属性更新。 */
  latestData: S2C_AttrUpdate | null = null;
  /** detailData：最近一次低频详情。 */
  detailData: AttrDetailView | null = null;
  /** detailStale：低频详情是否过期。 */
  detailStale = false;
  /** detailRequested：是否已发出详情请求。 */
  detailRequested = false;
  private renderPendingWhileHidden = false;
  private paneVisibilityObserver: MutationObserver | null = null;
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.ensureTooltipStyle();
    setReactAttrPanelCallbacks({
      onRequestDetail: () => this.callbacks?.onRequestDetail?.(),
      onOpenCraftSkill: (key) => this.openCraftSkill(key),
      onBindCraftSkill: (key) => this.bindCraftSkill(key),
      onOpenSpecialDetails: () => this.openSpecialDetails(),
      onSwitchTab: (tab) => this.switchTab(tab),
    });
    this.bindPaneEvents();
    this.bindTooltipEvents();
    this.bindPaneVisibilityObserver();
    window.addEventListener(ACTION_SHORTCUTS_CHANGED_EVENT, () => this.patchCraftActionButtons());
  }

  /** setCallbacks：注册详情请求回调。 */
  setCallbacks(callbacks: AttrPanelCallbacks): void {
    this.callbacks = callbacks;
  }

  /** clear：清理clear。 */
  clear(): void {
    this.latestData = null;
    this.detailData = null;
    this.detailStale = false;
    this.detailRequested = false;
    this.renderPendingWhileHidden = false;
    this.lastSnapshot = null;
    this.lastStructureKey = null;
    this.tooltipTarget = null;
    this.tooltipTargetKey = null;
    this.cancelScheduledTooltipRefresh();
    this.tabButtons.clear();
    this.paneEls.clear();
    this.tooltip.hide(true);
    detailModalHost.close(SPECIAL_DETAIL_MODAL_OWNER);
    if (this.useReactPanel()) {
      unmountReactAttrPanel();
    }
    replaceElementHtml(this.pane, '<div class="empty-hint">尚未观测到角色属性</div>');
  }

  /** 接收属性更新事件并重新渲染 */
  update(data: S2C_AttrUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.latestData = data;
    if (this.deferRenderIfHidden()) {
      return;
    }
    this.renderLatestData(data);
  }

  private renderLatestData(data: S2C_AttrUpdate): void {
    const baseAttrs = this.resolveCompleteAttrs(data.baseAttrs);
    if (!baseAttrs || !data.bonuses) {
      this.clear();
      return;
    }
    const finalAttrs = this.resolveCompleteAttrs(data.finalAttrs) ?? this.mergeAttrs(baseAttrs, data.bonuses);
    const numericStatBreakdowns = this.resolveRenderNumericStatBreakdowns(data.numericStatBreakdowns);
    const snapshot = this.buildSnapshot(
      baseAttrs,
      data.bonuses,
      finalAttrs,
      data.numericStats as NumericStats | undefined,
      data.ratioDivisors as NumericRatioDivisors | undefined,
      data.specialStats as PlayerSpecialStats | undefined,
      data.craftEffectStats,
      data.alchemySkill,
      data.buildingSkill,
      data.gatherSkill,
      data.enhancementSkill,
      numericStatBreakdowns,
      data.forgingSkill,
      data.miningSkill,
      data.formationSkill,
      data.transmissionSkill,
    );
    const structureKey = this.buildStructureKey(snapshot);
    if (this.useReactPanel()) {
      this.renderReact(snapshot);
      this.scheduleActiveTooltipRefresh();
      if (this.tooltipTarget) {
        this.requestDetailIfNeeded();
      }
      return;
    }
    if (this.lastStructureKey !== structureKey || !this.patch(snapshot)) {
      this.render(snapshot);
    } else {
      this.lastSnapshot = snapshot;
    }
    this.refreshActiveTooltipContent();
    if (this.tooltipTarget) {
      this.requestDetailIfNeeded();
    }
  }

  /** 使用玩家状态初始化属性面板。 */
  initFromPlayer(player: PlayerState): void {
    this.latestData = {
      baseAttrs: player.baseAttrs,
      bonuses: player.bonuses,
      finalAttrs: player.finalAttrs ?? this.mergeAttrs(player.baseAttrs, player.bonuses),
      numericStats: player.numericStats,
      ratioDivisors: player.ratioDivisors,
      specialStats: {
        foundation: Math.max(0, Math.floor(player.foundation ?? 0)),
        rootFoundation: Math.max(0, Math.floor(player.rootFoundation ?? 0)),
        bodyTrainingLevel: Math.max(0, Math.floor(player.bodyTraining?.level ?? 0)),
        combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
        comprehension: Math.max(0, Math.floor(player.comprehension ?? 0)),
        luck: Math.max(0, Math.floor(player.luck ?? 0)),
      },
      craftEffectStats: cloneCraftEffectStats(undefined),
      alchemySkill: player.alchemySkill,
      buildingSkill: player.buildingSkill,
      gatherSkill: player.gatherSkill,
      enhancementSkill: player.enhancementSkill,
      forgingSkill: player.forgingSkill,
      miningSkill: player.miningSkill,
      formationSkill: player.formationSkill,
      transmissionSkill: player.transmissionSkill,
    };
    this.detailStale = false;
    const finalAttrs = player.finalAttrs ?? this.mergeAttrs(player.baseAttrs, player.bonuses);
    const snapshot = this.buildSnapshot(
      player.baseAttrs,
      player.bonuses,
      finalAttrs,
      player.numericStats,
      player.ratioDivisors,
      {
        foundation: Math.max(0, Math.floor(player.foundation ?? 0)),
        rootFoundation: Math.max(0, Math.floor(player.rootFoundation ?? 0)),
        bodyTrainingLevel: Math.max(0, Math.floor(player.bodyTraining?.level ?? 0)),
        combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
        comprehension: Math.max(0, Math.floor(player.comprehension ?? 0)),
        luck: Math.max(0, Math.floor(player.luck ?? 0)),
      },
      this.latestData.craftEffectStats,
      player.alchemySkill,
      player.buildingSkill,
      player.gatherSkill,
      player.enhancementSkill,
      this.resolveRenderNumericStatBreakdowns(this.latestData.numericStatBreakdowns),
      player.forgingSkill,
      player.miningSkill,
      player.formationSkill,
      player.transmissionSkill,
    );
    if (this.useReactPanel()) {
      this.renderReact(snapshot);
      this.scheduleActiveTooltipRefresh();
      return;
    }
    this.render(snapshot);
  }

  /** invalidateDetail：将当前低频详情标记为过期。 */
  invalidateDetail(): void {
    this.detailStale = this.detailData !== null;
    this.detailRequested = false;
  }

  /** applyDetail：写入低频详情并用现有 update 流刷新。 */
  applyDetail(detail: S2C_AttrDetail): void {
    this.detailData = detail;
    this.detailStale = false;
    this.detailRequested = true;
    if (this.latestData) {
      this.update(this.latestData);
      return;
    }
    const snapshot = this.buildSnapshot(
      detail.baseAttrs,
      detail.bonuses,
      detail.finalAttrs,
      detail.numericStats,
      detail.ratioDivisors,
      undefined,
      undefined,
      detail.alchemySkill,
      detail.buildingSkill,
      detail.gatherSkill,
      detail.enhancementSkill,
      detail.numericStatBreakdowns,
      detail.forgingSkill,
      detail.miningSkill,
      detail.formationSkill,
      detail.transmissionSkill,
    );
    const structureKey = this.buildStructureKey(snapshot);
    if (this.lastStructureKey !== structureKey || !this.patch(snapshot)) {
      this.render(snapshot);
    } else {
      this.lastSnapshot = snapshot;
    }
    this.refreshActiveTooltipContent();
  }

  private resolveRenderNumericStatBreakdowns(
    breakdowns?: NumericStatBreakdownMap,
  ): NumericStatBreakdownMap | undefined {
    return resolveRenderNumericStatBreakdownsImpl(this, breakdowns);
  }

  /** mergeAttrs：合并属性。 */
  private mergeAttrs(base: Attributes, bonuses: AttrBonus[]): Attributes {
    return mergeAttrsImpl(this, base, bonuses);
  }

  /** 把属性 patch 解析成完整六维属性；不完整时返回 null。 */
  private resolveCompleteAttrs(attrs: Partial<Attributes> | undefined): Attributes | null {
    return resolveCompleteAttrsImpl(this, attrs);
  }

  private buildSnapshot(
    base: Attributes,
    bonuses: AttrBonus[],
    final: Attributes,
    stats?: NumericStats,
    ratioDivisors?: NumericRatioDivisors,
    specialStats?: PlayerSpecialStats,
    craftEffectStats?: CraftEffectStatsPatch,
    alchemySkill?: PlayerState['alchemySkill'],
    buildingSkill?: PlayerState['buildingSkill'],
    gatherSkill?: PlayerState['gatherSkill'],
    enhancementSkill?: PlayerState['enhancementSkill'],
    numericStatBreakdowns?: NumericStatBreakdownMap,
    forgingSkill?: PlayerState['forgingSkill'],
    miningSkill?: PlayerState['miningSkill'],
    formationSkill?: PlayerState['formationSkill'],
    transmissionSkill?: PlayerState['transmissionSkill'],
  ): AttrPanelSnapshot {
    return buildSnapshotImpl(this, base, bonuses, final, stats, ratioDivisors, specialStats, craftEffectStats, alchemySkill, buildingSkill, gatherSkill, enhancementSkill, numericStatBreakdowns, forgingSkill, miningSkill, formationSkill, transmissionSkill);
  }

  private buildBaseRadarSnapshot(
    base: Attributes,
    final: Attributes,
    bonuses: AttrBonus[],
    specialStats?: PlayerSpecialStats,
  ): AttrRadarPaneSnapshot {
    return buildBaseRadarSnapshotImpl(this, base, final, bonuses, specialStats);
  }

  private buildRootRadarSnapshot(
    stats: NumericStats,
    ratioDivisors: NumericRatioDivisors,
    bonuses: AttrBonus[],
  ): AttrRadarPaneSnapshot {
    return buildRootRadarSnapshotImpl(this, stats, ratioDivisors, bonuses);
  }

  private buildVeinPaneSnapshot(
    bonuses: AttrBonus[],
  ): AttrNumericPaneSnapshot {
    return buildVeinPaneSnapshotImpl(this, bonuses);
  }

  private buildRadarPaneSnapshot(title: string, scale: number, entries: RadarEntry[], paneId: string): AttrRadarPaneSnapshot {
    return buildRadarPaneSnapshotImpl(this, title, scale, entries, paneId);
  }

  private buildNumericPaneSnapshot(
    title: string,
    stats?: NumericStats,
    ratios?: NumericRatioDivisors,
    meta?: { keys: NumericCardKey[]; ratioKeys: (keyof NumericRatioDivisors)[]; legends?: Record<string, string> },
    attrs?: Attributes,
    breakdowns?: NumericStatBreakdownMap,
  ): AttrPaneSnapshot {
    return buildNumericPaneSnapshotImpl(this, title, stats, ratios, meta, attrs, breakdowns);
  }

  private buildSpecialPaneSnapshot(
    stats?: NumericStats,
    ratios?: NumericRatioDivisors,
    specialStats?: PlayerSpecialStats,
    craftEffectStats?: CraftEffectStatsPatch,
    attrs?: Attributes,
    breakdowns?: NumericStatBreakdownMap,
  ): AttrPaneSnapshot {
    return buildSpecialPaneSnapshotImpl(this, stats, ratios, specialStats, craftEffectStats, attrs, breakdowns);
  }

  private buildSpecialDetailPaneSnapshot(
    stats: NumericStats,
    ratios: NumericRatioDivisors,
    craftEffectStats?: CraftEffectStatsPatch,
  ): AttrSpecialDetailPaneSnapshot | null {
    return buildSpecialDetailPaneSnapshotImpl(this, stats, ratios, craftEffectStats);
  }

  private buildSpecialDetailPaneSnapshotFromData(data: S2C_AttrUpdate): AttrSpecialDetailPaneSnapshot | null {
    return buildSpecialDetailPaneSnapshotFromDataImpl(this, data);
  }

  private buildElementSpecialDetailRows(stats: NumericStats, ratios: NumericRatioDivisors): AttrSpecialDetailRowSnapshot[] {
    return buildElementSpecialDetailRowsImpl(this, stats, ratios);
  }

  private buildSpecialStatCards(keys: PlayerSpecialCardKey[], specialStats?: PlayerSpecialStats): AttrNumericCardSnapshot[] {
    return buildSpecialStatCardsImpl(this, keys, specialStats);
  }

  private buildBaseSpecialStatCards(specialStats?: PlayerSpecialStats): AttrNumericCardSnapshot[] {
    return buildBaseSpecialStatCardsImpl(this, specialStats);
  }

  private buildRootFoundationSummaryCards(specialStats?: PlayerSpecialStats): AttrNumericCardSnapshot[] {
    return buildRootFoundationSummaryCardsImpl(this, specialStats);
  }

  private buildCraftSkillSnapshot(
    key: string,
    label: string,
    skill?: PlayerState['alchemySkill'] | PlayerState['gatherSkill'] | PlayerState['enhancementSkill'] | PlayerState['forgingSkill'] | PlayerState['buildingSkill'] | PlayerState['miningSkill'] | PlayerState['transmissionSkill'],
  ): AttrCraftSkillSnapshot | null {
    return buildCraftSkillSnapshotImpl(this, key, label, skill);
  }

  private buildCraftPaneSnapshot(
    alchemySkill?: PlayerState['alchemySkill'],
    buildingSkill?: PlayerState['buildingSkill'],
    gatherSkill?: PlayerState['gatherSkill'],
    enhancementSkill?: PlayerState['enhancementSkill'],
    forgingSkill?: PlayerState['forgingSkill'],
    miningSkill?: PlayerState['miningSkill'],
    formationSkill?: PlayerState['formationSkill'],
    transmissionSkill?: PlayerState['transmissionSkill'],
  ): AttrPaneSnapshot {
    return buildCraftPaneSnapshotImpl(this, alchemySkill, buildingSkill, gatherSkill, enhancementSkill, forgingSkill, miningSkill, formationSkill, transmissionSkill);
  }

  /** render：渲染渲染。 */
  private render(snapshot: AttrPanelSnapshot): void {
    this.lastSnapshot = snapshot;
    this.lastStructureKey = this.buildStructureKey(snapshot);
    preserveSelection(this.pane, () => {
      replaceElementHtml(this.pane, `<div class="attr-layout">
        <div class="action-tab-bar">${this.renderTabs()}</div>
        <div class="action-tab-pane ${this.activeTab === 'base' ? 'active' : ''}" data-attr-pane="base">${this.renderPane(snapshot.panes.base)}</div>
        <div class="action-tab-pane ${this.activeTab === 'root' ? 'active' : ''}" data-attr-pane="root">${this.renderPane(snapshot.panes.root)}</div>
        <div class="action-tab-pane ${this.activeTab === 'vein' ? 'active' : ''}" data-attr-pane="vein">${this.renderPane(snapshot.panes.vein)}</div>
        <div class="action-tab-pane ${this.activeTab === 'combat' ? 'active' : ''}" data-attr-pane="combat">${this.renderPane(snapshot.panes.combat)}</div>
        <div class="action-tab-pane ${this.activeTab === 'qi' ? 'active' : ''}" data-attr-pane="qi">${this.renderPane(snapshot.panes.qi)}</div>
        <div class="action-tab-pane ${this.activeTab === 'special' ? 'active' : ''}" data-attr-pane="special">${this.renderPane(snapshot.panes.special)}</div>
        <div class="action-tab-pane ${this.activeTab === 'craft' ? 'active' : ''}" data-attr-pane="craft">${this.renderPane(snapshot.panes.craft)}</div>
      </div>`);
      this.refreshDomRefs();
    });
  }

  private useReactPanel(): boolean {
    return shouldUseReactAttrPanel();
  }

  private isPaneVisible(): boolean {
    return this.pane.isConnected && this.pane.classList.contains('active');
  }

  private deferRenderIfHidden(): boolean {
    if (this.isPaneVisible()) {
      return false;
    }
    this.clearTooltipTarget();
    this.tooltip.hide(true);
    this.renderPendingWhileHidden = true;
    return true;
  }

  private bindPaneVisibilityObserver(): void {
    this.paneVisibilityObserver = new MutationObserver(() => {
      if (this.renderPendingWhileHidden && this.isPaneVisible()) {
        this.flushHiddenRender();
      }
    });
    this.paneVisibilityObserver.observe(this.pane, { attributes: true, attributeFilter: ['class'] });
  }

  private flushHiddenRender(): void {
    const latestData = this.latestData;
    if (!this.renderPendingWhileHidden || !latestData) {
      return;
    }
    this.renderPendingWhileHidden = false;
    this.renderLatestData(latestData);
  }

  private renderReact(snapshot: AttrPanelSnapshot): void {
    this.lastSnapshot = snapshot;
    this.lastStructureKey = this.buildStructureKey(snapshot);
    this.tabButtons.clear();
    this.paneEls.clear();
    syncReactAttrPanelState({
      snapshot,
      activeTab: this.activeTab,
      rawData: this.latestData,
    });
    mountReactAttrPanel();
  }

  private switchTab(tab: AttrTab): void {
    if (tab === this.activeTab) {
      return;
    }
    this.clearTooltipTarget();
    this.tooltip.hide(true);
    this.activeTab = tab;
    if (this.useReactPanel()) {
      if (this.lastSnapshot) {
        this.renderReact(this.lastSnapshot);
      }
      return;
    }
    this.patchTabState();
    if (this.lastSnapshot && !this.patchPane(tab, this.lastSnapshot.panes[tab])) {
      this.render(this.lastSnapshot);
    }
  }

  private openCraftSkill(key: string): void {
    this.clearTooltipTarget();
    this.tooltip.hide(true);
    this.callbacks?.onOpenCraftSkill?.(key);
  }

  private bindCraftSkill(key: string): void {
    this.clearTooltipTarget();
    this.tooltip.hide(true);
    this.callbacks?.onBindCraftSkill?.(key);
    this.patchCraftActionButtons();
    if (this.useReactPanel() && this.lastSnapshot) {
      this.renderReact(this.lastSnapshot);
    }
  }

  private openSpecialDetails(): void {
    const latestData = this.latestData;
    if (!latestData) {
      return;
    }
    this.clearTooltipTarget();
    this.tooltip.hide(true);
    this.openSpecialDetailsModal(latestData);
  }

  private openSpecialDetailsModal(data: S2C_AttrUpdate): void {
    const snapshot = this.buildSpecialDetailPaneSnapshotFromData(data);
    if (!snapshot) {
      detailModalHost.open({
        ownerId: SPECIAL_DETAIL_MODAL_OWNER,
        variantClass: 'detail-modal--attr-special',
        size: 'wide',
        title: '全部特殊属性',
        subtitle: '当前属性数据尚未同步完整',
        renderBody: (body) => replaceElementHtml(body, '<div class="empty-hint">暂无特殊属性数据</div>'),
      });
      return;
    }
    const modalOptions = {
      ownerId: SPECIAL_DETAIL_MODAL_OWNER,
      variantClass: 'detail-modal--attr-special',
      size: 'wide' as const,
      title: snapshot.title,
      subtitle: '所有特殊属性最终值',
      renderBody: (body: HTMLElement) => replaceElementHtml(body, this.renderSpecialDetailBody(snapshot)),
      onClose: () => {
        this.clearTooltipTarget();
        this.tooltip.hide(true);
      },
    };
    detailModalHost.open(modalOptions);
  }

  /** renderTabs：渲染标签页。 */
  private renderTabs(): string {
    return (Object.keys(ATTR_TAB_LABELS) as AttrTab[])
      .map((tab) => `<button class="action-tab-btn ${this.activeTab === tab ? 'active' : ''}" data-attr-tab="${tab}" data-guided-tour-attr-tab="${tab}" type="button">${ATTR_TAB_LABELS[tab]}</button>`)
      .join('');
  }

  /** renderPane：渲染Pane。 */
  private renderPane(snapshot: AttrPaneSnapshot): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (snapshot.kind === 'placeholder') {
      return `<div class="panel-section" data-pane-kind="placeholder"><div class="empty-hint" data-placeholder-text="true">${snapshot.message}</div></div>`;
    }
    if (snapshot.kind === 'numeric') {
      return `<div class="panel-section" data-pane-kind="numeric">
        <div class="attr-section-head">
          <div class="panel-section-title" data-numeric-title="true">${snapshot.title}</div>
          ${snapshot.actions?.length ? `<div class="attr-section-actions" data-numeric-actions="true">
            ${snapshot.actions.map((action) => `<button class="small-btn" data-attr-pane-action="${escapeHtml(action.key)}" type="button">${escapeHtml(action.label)}</button>`).join('')}
          </div>` : ''}
        </div>
        <div class="attr-grid wide">
          ${snapshot.cards.map((card) => renderAttrMiniCard(card, {
            cardAttr: 'data-numeric-card',
            labelAttr: 'data-numeric-label',
            valueAttr: 'data-numeric-value',
            subAttr: 'data-numeric-sub',
          })).join('')}
        </div>
      </div>`;
    }
    if (snapshot.kind === 'craft') {
      return `<div class="attr-craft-list" data-pane-kind="craft" data-guided-tour-craft-pane="true">
        ${snapshot.skills.map((skill) => `
          <section class="attr-craft-row" data-craft-skill="${escapeHtml(skill.key)}" data-guided-tour-craft-skill="${escapeHtml(skill.key)}" data-tooltip-title="${escapeHtml(skill.tooltipTitle)}" data-tooltip-detail="${escapeHtml(skill.tooltipDetail)}">
            <span class="attr-craft-label" data-craft-label="true">${escapeHtml(skill.label)}</span>
            <strong class="attr-craft-level" data-craft-level="true">${escapeHtml(skill.level)}</strong>
            <div class="attr-craft-exp">
              <span class="attr-craft-exp-text" data-craft-progress="true">${escapeHtml(skill.progress)}</span>
              <div class="attr-craft-exp-track" aria-hidden="true">
                <span class="attr-craft-exp-fill" data-craft-progress-fill="true" style="width:${skill.progressPercent}"></span>
              </div>
            </div>
            <span class="attr-craft-remain" data-craft-remain="true">${escapeHtml(skill.remain)}</span>
            ${skill.openable ? `
              <div class="attr-craft-actions" data-craft-actions="true">
                <button class="small-btn" data-craft-open="${escapeHtml(skill.key)}" data-guided-tour-craft-open="${escapeHtml(skill.key)}" type="button">打开</button>
                <button class="small-btn ghost" data-craft-bind="${escapeHtml(skill.key)}" type="button">${escapeHtml(skill.bindLabel)}</button>
              </div>
            ` : ''}
          </section>
        `).join('')}
      </div>`;
    }

    const gradientId = `attr-radar-area-${snapshot.paneId}`;
    const gradientStops = snapshot.nodes
      .map((node, index) => {
        const offset = snapshot.nodes.length === 1 ? '50%' : `${(index / (snapshot.nodes.length - 1)) * 100}%`;
        return `<stop offset="${offset}" stop-color="${node.color}" stop-opacity="0.4"></stop>`;
      })
      .join('');

    return `<div class="panel-section" data-pane-kind="radar">
      <div class="attr-radar-shell">
        <div class="attr-radar-head">
          <div class="attr-radar-title">${snapshot.title}</div>
          <div class="attr-radar-scale" data-radar-scale="true">刻度 ${snapshot.scaleLabel}</div>
        </div>
        <div class="attr-radar-body">
          <svg class="attr-radar" viewBox="0 0 340 340" role="img" aria-label="${snapshot.title}">
            <defs><linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="100%">${gradientStops}</linearGradient></defs>
            ${snapshot.rings.map((points) => `<polygon class="attr-radar-ring" points="${points}"></polygon>`).join('')}
            ${snapshot.axes.map((axis) => `<line class="attr-radar-axis" x1="170" y1="170" x2="${axis.x}" y2="${axis.y}" stroke="${axis.stroke}"></line>`).join('')}
            <polygon class="attr-radar-area" data-radar-area="true" points="${snapshot.areaPoints}" fill="url(#${gradientId})" stroke="${snapshot.nodes[0]?.color ?? ATTR_COLORS[0]}" stroke-width="2"></polygon>
            ${snapshot.nodes.map((node, index) => `
              <g class="attr-radar-node" data-radar-node="${index}" data-tooltip-title="${escapeHtml(node.tooltipTitle)}" data-tooltip-detail="${escapeHtml(node.tooltipDetail)}">
                <circle class="attr-radar-dot" data-radar-dot="true" cx="${node.dotX}" cy="${node.dotY}" r="6" fill="${node.color}" stroke-width="1.8"></circle>
                <text class="attr-radar-label attr-radar-trigger" data-radar-label="true" x="${node.labelX}" y="${node.labelY}" text-anchor="middle" dominant-baseline="middle">${node.label}</text>
                <text class="attr-radar-value attr-radar-trigger" data-radar-value="true" x="${node.valueX}" y="${node.valueY}" text-anchor="middle" dominant-baseline="middle">${node.valueLabel}</text>
              </g>
            `).join('')}
          </svg>
          ${snapshot.nodes.map((node, index) => `
            <div class="attr-radar-icon-node" data-radar-icon-node="${index}" style="left:${formatRadarNodePercent(node.labelX)};top:${formatRadarNodePercent(node.labelY)};" data-tooltip-title="${escapeHtml(node.tooltipTitle)}" data-tooltip-detail="${escapeHtml(node.tooltipDetail)}">
              ${renderAtlasIcon(node.key, 'attr-radar-icon')}
              <span class="attr-radar-icon-value" data-radar-icon-value="true">${node.valueLabel}</span>
            </div>
          `).join('')}
          ${snapshot.summaryCards?.length ? snapshot.summaryCards.map((card) => `
            <div class="attr-radar-floating-stat" data-radar-summary-card="${card.key}" data-tooltip-title="${escapeHtml(card.tooltipTitle)}" data-tooltip-detail="${escapeHtml(card.tooltipDetail)}">
              ${renderAtlasIcon(card.key, 'attr-radar-floating-icon')}
              <span class="attr-radar-floating-label" data-radar-summary-label="true">${card.label}</span>
              <span class="attr-radar-floating-value" data-radar-summary-value="true">${card.value}</span>
            </div>
          `).join('') : ''}
        </div>
      </div>
      ${snapshot.cards?.length ? `
        <div class="attr-grid wide attr-radar-extra-grid" data-radar-extra-grid="true">
          ${snapshot.cards.map((card) => renderAttrMiniCard(card, {
            cardAttr: 'data-radar-extra-card',
            labelAttr: 'data-radar-extra-label',
            valueAttr: 'data-radar-extra-value',
            subAttr: 'data-radar-extra-sub',
          })).join('')}
        </div>
      ` : ''}
    </div>`;
  }

  private renderSpecialDetailBody(snapshot: AttrSpecialDetailPaneSnapshot): string {
    return `<div class="attr-special-detail" data-pane-kind="special-detail">
      <div class="attr-special-detail-sections">
        ${snapshot.sections.map((section) => `
          <section class="attr-special-detail-section" data-special-detail-section="${escapeHtml(section.key)}">
            <h4 class="attr-special-detail-section-title">${escapeHtml(section.title)}</h4>
            <div class="attr-special-detail-grid">
              ${section.rows.map((row) => `
                <div class="attr-special-detail-row" data-special-detail-row="${escapeHtml(row.key)}" ${row.detail ? `title="${escapeHtml(row.detail)}"` : ''}>
                  <span class="attr-special-detail-label">${escapeHtml(row.label)}</span>
                  <strong class="attr-special-detail-value">${escapeHtml(row.value)}</strong>
                </div>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    </div>`;
  }

  /** patch：处理patch。 */
  private patch(snapshot: AttrPanelSnapshot): boolean {
    this.patchTabState();
    return this.patchPane(this.activeTab, snapshot.panes[this.activeTab]);
  }

  /** refreshDomRefs：刷新属性面板的稳定节点缓存。 */
  private refreshDomRefs(): void {
    this.tabButtons.clear();
    this.paneEls.clear();
    this.pane.querySelectorAll<HTMLElement>('[data-attr-tab]').forEach((entry) => {
      const tab = entry.dataset.attrTab as AttrTab | undefined;
      if (tab) {
        this.tabButtons.set(tab, entry);
      }
    });
    this.pane.querySelectorAll<HTMLElement>('[data-attr-pane]').forEach((entry) => {
      const tab = entry.dataset.attrPane as AttrTab | undefined;
      if (tab) {
        this.paneEls.set(tab, entry);
      }
    });
  }

  /** getPaneEl：读取并补齐指定分页节点。 */
  private getPaneEl(tab: AttrTab): HTMLElement | null {
    const cached = this.paneEls.get(tab);
    if (cached?.isConnected) {
      return cached;
    }
    const pane = this.pane.querySelector<HTMLElement>(`[data-attr-pane="${tab}"]`);
    if (pane) {
      this.paneEls.set(tab, pane);
    }
    return pane;
  }

  /** patchPane：处理patch Pane。 */
  private patchPane(tab: AttrTab, snapshot: AttrPaneSnapshot): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const pane = this.getPaneEl(tab);
    if (!pane) {
      return false;
    }
    if (snapshot.kind === 'placeholder') {
      const textNode = pane.querySelector<HTMLElement>('[data-placeholder-text="true"]');
      if (!textNode) {
        return false;
      }
      textNode.textContent = snapshot.message;
      return true;
    }
    if (snapshot.kind === 'numeric') {
      const titleNode = pane.querySelector<HTMLElement>('[data-numeric-title="true"]');
      const cardNodes = pane.querySelectorAll<HTMLElement>('[data-numeric-card]');
      const actionNodes = pane.querySelectorAll<HTMLElement>('[data-attr-pane-action]');
      if (!titleNode || cardNodes.length !== snapshot.cards.length || actionNodes.length !== (snapshot.actions?.length ?? 0)) {
        return false;
      }
      titleNode.textContent = snapshot.title;
      for (const card of snapshot.cards) {
        const cardNode = pane.querySelector<HTMLElement>(`[data-numeric-card="${card.key}"]`);
        if (!cardNode) {
          return false;
        }
        const labelNode = cardNode.querySelector<HTMLElement>('[data-numeric-label="true"]');
        const valueNode = cardNode.querySelector<HTMLElement>('[data-numeric-value="true"]');
        const subNode = cardNode.querySelector<HTMLElement>('[data-numeric-sub="true"]');
        if (!labelNode || !valueNode || !subNode) {
          return false;
        }
        cardNode.setAttribute('data-tooltip-title', card.tooltipTitle);
        cardNode.setAttribute('data-tooltip-detail', card.tooltipDetail);
        labelNode.textContent = card.label;
        valueNode.textContent = card.value;
        subNode.textContent = card.sub ?? '';
        subNode.classList.toggle('hidden', !card.sub);
      }
      return true;
    }
    if (snapshot.kind === 'craft') {
      const skillNodes = pane.querySelectorAll<HTMLElement>('[data-craft-skill]');
      if (skillNodes.length !== snapshot.skills.length) {
        return false;
      }
      for (const skill of snapshot.skills) {
        const skillNode = pane.querySelector<HTMLElement>(`[data-craft-skill="${skill.key}"]`);
        if (!skillNode) {
          return false;
        }
        const labelNode = skillNode.querySelector<HTMLElement>('[data-craft-label="true"]');
        const levelNode = skillNode.querySelector<HTMLElement>('[data-craft-level="true"]');
        const progressNode = skillNode.querySelector<HTMLElement>('[data-craft-progress="true"]');
        const fillNode = skillNode.querySelector<HTMLElement>('[data-craft-progress-fill="true"]');
        const remainNode = skillNode.querySelector<HTMLElement>('[data-craft-remain="true"]');
        const openNode = skillNode.querySelector<HTMLButtonElement>('[data-craft-open]');
        const bindNode = skillNode.querySelector<HTMLButtonElement>('[data-craft-bind]');
        if (!labelNode || !levelNode || !progressNode || !fillNode || !remainNode) {
          return false;
        }
        if (skill.openable && (!openNode || !bindNode)) {
          return false;
        }
        if (!skill.openable && (openNode || bindNode)) {
          return false;
        }
        skillNode.setAttribute('data-tooltip-title', skill.tooltipTitle);
        skillNode.setAttribute('data-tooltip-detail', skill.tooltipDetail);
        labelNode.textContent = skill.label;
        levelNode.textContent = skill.level;
        progressNode.textContent = skill.progress;
        fillNode.style.width = skill.progressPercent;
        remainNode.textContent = skill.remain;
        if (openNode && bindNode) {
          openNode.dataset.craftOpen = skill.key;
          bindNode.dataset.craftBind = skill.key;
          bindNode.textContent = this.callbacks?.getCraftSkillBindLabel?.(skill.key) ?? skill.bindLabel;
        }
      }
      return true;
    }

    const scaleNode = pane.querySelector<HTMLElement>('[data-radar-scale="true"]');
    const titleNode = pane.querySelector<HTMLElement>('.attr-radar-title');
    const areaNode = pane.querySelector<SVGPolygonElement>('[data-radar-area="true"]');
    if (!scaleNode || !titleNode || !areaNode) {
      return false;
    }
    titleNode.textContent = snapshot.title;
    scaleNode.textContent = t('attr.tooltip.scale', { label: snapshot.scaleLabel });
    areaNode.setAttribute('points', snapshot.areaPoints);
    areaNode.setAttribute('stroke', snapshot.nodes[0]?.color ?? ATTR_COLORS[0]);
    const svgNode = pane.querySelector<SVGSVGElement>('svg.attr-radar');
    svgNode?.setAttribute('aria-label', snapshot.title);

    for (let index = 0; index < snapshot.nodes.length; index += 1) {
      const node = snapshot.nodes[index];
      const group = pane.querySelector<SVGGElement>(`[data-radar-node="${index}"]`);
      if (!group) {
        return false;
      }
      const dot = group.querySelector<SVGCircleElement>('[data-radar-dot="true"]');
      const label = group.querySelector<SVGTextElement>('[data-radar-label="true"]');
      const value = group.querySelector<SVGTextElement>('[data-radar-value="true"]');
      if (!dot || !label || !value) {
        return false;
      }
      group.setAttribute('data-tooltip-title', node.tooltipTitle);
      group.setAttribute('data-tooltip-detail', node.tooltipDetail);
      dot.setAttribute('cx', node.dotX);
      dot.setAttribute('cy', node.dotY);
      dot.setAttribute('fill', node.color);
      label.textContent = node.label;
      label.setAttribute('x', node.labelX);
      label.setAttribute('y', node.labelY);
      value.textContent = node.valueLabel;
      value.setAttribute('x', node.valueX);
      value.setAttribute('y', node.valueY);
      const iconNode = pane.querySelector<HTMLElement>(`[data-radar-icon-node="${index}"]`);
      if (!iconNode) {
        return false;
      }
      const iconValueNode = iconNode.querySelector<HTMLElement>('[data-radar-icon-value="true"]');
      if (!iconValueNode) {
        return false;
      }
      iconNode.setAttribute('data-tooltip-title', node.tooltipTitle);
      iconNode.setAttribute('data-tooltip-detail', node.tooltipDetail);
      iconNode.style.left = formatRadarNodePercent(node.labelX);
      iconNode.style.top = formatRadarNodePercent(node.labelY);
      iconValueNode.textContent = node.valueLabel;
    }
    const summaryCards = snapshot.summaryCards ?? [];
    if (summaryCards.length > 0) {
      const summaryCardNodes = pane.querySelectorAll<HTMLElement>('[data-radar-summary-card]');
      if (summaryCardNodes.length !== summaryCards.length) {
        return false;
      }
      for (const card of summaryCards) {
        const cardNode = pane.querySelector<HTMLElement>(`[data-radar-summary-card="${card.key}"]`);
        if (!cardNode) {
          return false;
        }
        const labelNode = cardNode.querySelector<HTMLElement>('[data-radar-summary-label="true"]');
        const valueNode = cardNode.querySelector<HTMLElement>('[data-radar-summary-value="true"]');
        if (!labelNode || !valueNode) {
          return false;
        }
        cardNode.setAttribute('data-tooltip-title', card.tooltipTitle);
        cardNode.setAttribute('data-tooltip-detail', card.tooltipDetail);
        labelNode.textContent = card.label;
        valueNode.textContent = card.value;
      }
    } else if (pane.querySelector<HTMLElement>('[data-radar-summary-card]')) {
      return false;
    }
    const extraGridNode = pane.querySelector<HTMLElement>('[data-radar-extra-grid="true"]');
    const extraCards = snapshot.cards ?? [];
    if (extraCards.length > 0) {
      const extraCardNodes = pane.querySelectorAll<HTMLElement>('[data-radar-extra-card]');
      if (!extraGridNode || extraCardNodes.length !== extraCards.length) {
        return false;
      }
      for (const card of extraCards) {
        const cardNode = pane.querySelector<HTMLElement>(`[data-radar-extra-card="${card.key}"]`);
        if (!cardNode) {
          return false;
        }
        const labelNode = cardNode.querySelector<HTMLElement>('[data-radar-extra-label="true"]');
        const valueNode = cardNode.querySelector<HTMLElement>('[data-radar-extra-value="true"]');
        const subNode = cardNode.querySelector<HTMLElement>('[data-radar-extra-sub="true"]');
        if (!labelNode || !valueNode || !subNode) {
          return false;
        }
        cardNode.setAttribute('data-tooltip-title', card.tooltipTitle);
        cardNode.setAttribute('data-tooltip-detail', card.tooltipDetail);
        labelNode.textContent = card.label;
        valueNode.textContent = card.value;
        subNode.textContent = card.sub ?? '';
        subNode.classList.toggle('hidden', !card.sub);
      }
    } else if (extraGridNode) {
      return false;
    }
    return true;
  }

  /** buildStructureKey：构建Structure Key。 */
  private buildStructureKey(snapshot: AttrPanelSnapshot): string {
    const entries = Object.entries(snapshot.panes).map(([tab, pane]) => {
      if (pane.kind === 'numeric') {
        return [tab, { kind: pane.kind, cards: pane.cards.map((card) => card.key), actions: pane.actions?.map((action) => action.key) ?? [] }];
      }
      if (pane.kind === 'radar') {
        return [tab, {
          kind: pane.kind,
          nodes: pane.nodes.length,
          cards: pane.cards?.map((card) => card.key) ?? [],
          summaryCards: pane.summaryCards?.map((card) => card.key) ?? [],
        }];
      }
      if (pane.kind === 'craft') {
        return [tab, { kind: pane.kind, skills: pane.skills.map((skill) => skill.key) }];
      }
      return [tab, { kind: pane.kind }];
    });
    return JSON.stringify(Object.fromEntries(entries));
  }

  /** bindPaneEvents：绑定Pane事件。 */
  private bindPaneEvents(): void {
    this.pane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const paneActionButton = target.closest<HTMLElement>('[data-attr-pane-action]');
      if (paneActionButton) {
        const actionKey = paneActionButton.dataset.attrPaneAction;
        if (actionKey === SPECIAL_DETAIL_ACTION_KEY) {
          this.openSpecialDetails();
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const craftBindButton = target.closest<HTMLElement>('[data-craft-bind]');
      if (craftBindButton) {
        const key = craftBindButton.dataset.craftBind;
        if (key) {
          this.bindCraftSkill(key);
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const craftSkillRow = target.closest<HTMLElement>('[data-craft-open]');
      if (craftSkillRow) {
        const key = craftSkillRow.dataset.craftOpen;
        if (key) {
          this.openCraftSkill(key);
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const button = target.closest<HTMLElement>('[data-attr-tab]');
      if (!button) {
        return;
      }
      const tab = button.dataset.attrTab as AttrTab | undefined;
      if (!tab || tab === this.activeTab) {
        return;
      }
      this.switchTab(tab);
    });
    this.pane.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const craftSkillRow = target.closest<HTMLElement>('[data-craft-open]');
      const key = craftSkillRow?.dataset.craftOpen;
      if (!key) {
        return;
      }
      this.clearTooltipTarget();
      this.tooltip.hide(true);
      this.callbacks?.onOpenCraftSkill?.(key);
      event.preventDefault();
      event.stopPropagation();
    });
  }

  /** patchTabState：处理patch Tab状态。 */
  private patchTabState(): void {
    if (this.tabButtons.size === 0 || this.paneEls.size === 0) {
      this.refreshDomRefs();
    }
    this.tabButtons.forEach((entry, tab) => {
      entry.classList.toggle('active', tab === this.activeTab);
    });
    this.paneEls.forEach((entry, tab) => {
      entry.classList.toggle('active', tab === this.activeTab);
    });
  }

  /** 局部刷新技艺行上的绑键按钮，不重建属性面板。 */
  private patchCraftActionButtons(): void {
    this.pane.querySelectorAll<HTMLButtonElement>('[data-craft-bind]').forEach((button) => {
      const key = button.dataset.craftBind;
      if (!key) {
        return;
      }
      button.textContent = this.callbacks?.getCraftSkillBindLabel?.(key) ?? '绑定键';
    });
  }

  /** ensureTooltipStyle：确保提示样式。 */
  ensureTooltipStyle(): void {
    ensureTooltipStyleImpl(this);
  }

  /** bindTooltipEvents：绑定提示事件。 */
  bindTooltipEvents(): void {
    bindTooltipEventsImpl(this);
  }

  /** requestDetailIfNeeded：按需触发低频详情请求。 */
  requestDetailIfNeeded(): void {
    requestDetailIfNeededImpl(this);
  }

  /** refreshActiveTooltipContent：详情异步回包后刷新当前已打开的 hover 内容。 */
  refreshActiveTooltipContent(): void {
    refreshActiveTooltipContentImpl(this);
  }

  clearTooltipTarget(): void {
    clearTooltipTargetImpl(this);
  }

  resolveTooltipTargetKey(target: Element): string | null {
    return resolveTooltipTargetKeyImpl(this, target);
  }

  resolveCurrentTooltipTarget(): Element | null {
    return resolveCurrentTooltipTargetImpl(this);
  }

  scheduleActiveTooltipRefresh(): void {
    scheduleActiveTooltipRefreshImpl(this);
  }

  cancelScheduledTooltipRefresh(): void {
    cancelScheduledTooltipRefreshImpl(this);
  }
}
