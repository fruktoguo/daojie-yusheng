/**
 * 属性面板
 * 以雷达图和数值卡片展示六维、灵根、灵脉、斗法、灵力、特殊六大分类属性
 */

import {
  ATTR_KEYS,
  ATTR_TO_PERCENT_NUMERIC_WEIGHTS,
  ATTR_TO_NUMERIC_WEIGHTS,
  AttrBonus,
  AttrKey,
  Attributes,
  BASE_MOVE_POINTS_PER_TICK,
  ELEMENT_KEYS,
  HeavenGateRootValues,
  NumericRatioDivisors,
  NumericStats,
  PlayerState,
  PlayerSpecialStats,
  ratioValue,
  NEXT_S2C_AttrUpdate,
  TileType,
  getTileTraversalCost,
} from '@mud/shared-next';
import { ATTR_KEY_LABELS, ELEMENT_KEY_LABELS } from '../../domain-labels';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { preserveSelection } from '../selection-preserver';
import {
  ATTR_COLORS,
  ATTR_TAB_LABELS,
  ELEMENT_COLORS,
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
import { formatDisplayInteger, formatDisplayNumber, formatDisplayPercent } from '../../utils/number';
import {
  describeSpiritualRoots,
  getSpiritualRootAbsorptionRate,
  normalizeSpiritualRoots,
  resolveSpiritualRootsFromBonuses,
} from '../../utils/spiritual-roots';


/** formatRateBp：格式化速率Bp。 */
function formatRateBp(value: number): string {
  const percent = value / 100;
  return formatDisplayPercent(percent);
}

/** formatSimplePercent：格式化Simple Percent。 */
function formatSimplePercent(value: number): string {
  return formatDisplayPercent(value);
}

/** getCraftProgressRatio：读取制作进度Ratio。 */
function getCraftProgressRatio(exp: number, expToNext: number): number {
  if (expToNext <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, exp / expToNext));
}

/** formatAuraAbsorptionRate：格式化灵气Absorption速率。 */
function formatAuraAbsorptionRate(value: number): string {
  return formatDisplayPercent(value, { maximumFractionDigits: 2 });
}

/** formatCritDamageBonus：格式化Crit Damage Bonus。 */
function formatCritDamageBonus(value: number): string {
  const percent = value / 10;
  return formatDisplayPercent(percent);
}

/** colorWithAlpha：处理颜色With Alpha。 */
function colorWithAlpha(color: string, alpha: number): string {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  if (normalized.length !== 6) return color;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

/** formatRatioPercent：格式化Ratio Percent。 */
function formatRatioPercent(raw: number, divisor: number): string {
  return formatDisplayPercent(ratioValue(raw, divisor) * 100);
}

/** formatNumericTooltipValue：格式化Numeric提示值。 */
function formatNumericTooltipValue(key: NumericCardKey, value: number): string {
  if (key === 'critDamage') {
    return formatCritDamageBonus(value);
  }
  if (RATE_BP_KEYS.has(key)) {
    return formatRateBp(value);
  }
  return formatDisplayInteger(value);
}

/** buildAttrConversionSummary：构建属性Conversion摘要。 */
function buildAttrConversionSummary(key: AttrKey, totalValue: number): string {
  const parts = buildAttrConversionEntries(key, totalValue);
  return parts.length > 0 ? parts.join('，') : '暂无具体转化';
}

/** buildAttrConversionLines：构建属性Conversion Lines。 */
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
      return `${NUMERIC_TOOLTIP_LABELS[numericKey] ?? entryKey} +${formatSimplePercent(total)}`;
    });
  const flatParts = Object.entries(weights)
    .filter(([entryKey, entryValue]) => entryKey !== 'elementDamageBonus' && entryKey !== 'elementDamageReduce' && typeof entryValue === 'number' && entryValue !== 0)
    .map(([entryKey, entryValue]) => {
      const numericKey = entryKey as NumericCardKey;
      const total = entryValue * totalValue;
      return `${NUMERIC_TOOLTIP_LABELS[numericKey] ?? entryKey} +${formatNumericTooltipValue(numericKey, total)}`;
    });
  return [...percentParts, ...flatParts];
}

/** splitTooltipLines：处理split提示Lines。 */
function splitTooltipLines(detail: string): string[] {
  return detail
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** formatCritDamageDisplay：格式化Crit Damage显示。 */
function formatCritDamageDisplay(value: number): string {
  const total = 200 + value / 10;
  return formatDisplayPercent(total);
}

/** formatMoveSpeedEffect：格式化移动速度效果。 */
function formatMoveSpeedEffect(value: number): string {
  const safeValue = Math.max(0, value);
  const movePoints = BASE_MOVE_POINTS_PER_TICK + safeValue;
  const roadTiles = movePoints / getTileTraversalCost(TileType.Road);
  const trailTiles = movePoints / getTileTraversalCost(TileType.Trail);
  const grassTiles = movePoints / getTileTraversalCost(TileType.Grass);
  const swampTiles = movePoints / getTileTraversalCost(TileType.Swamp);
  return `每息获得 ${formatDisplayNumber(movePoints)} 点移动预算，约等于 ${formatDisplayNumber(roadTiles)} 格大路 / ${formatDisplayNumber(trailTiles)} 格小路 / ${formatDisplayNumber(grassTiles)} 格草地 / ${formatDisplayNumber(swampTiles)} 格沼泽`;
}

/** formatMoveSpeedDisplay：格式化移动速度显示。 */
function formatMoveSpeedDisplay(value: number): string {
  return formatDisplayInteger(BASE_MOVE_POINTS_PER_TICK + Math.max(0, value));
}

/** buildCombatFormulaLines：构建战斗Formula Lines。 */
function buildCombatFormulaLines(key: NumericCardKey): string[] {
  switch (key) {
    case 'physDef':
      return [
        '计算公式：物理减伤 = 物理防御 / (物理防御 + 攻击方物理攻击 × 0.1 + 100)',
        '化解触发时，本次物理防御按双倍参与减伤结算。',
      ];
    case 'spellDef':
      return [
        '计算公式：法术减伤 = 法术防御 / (法术防御 + 攻击方法术攻击 × 0.1 + 100)',
        '元素伤害会再与元素减伤按乘算合并；化解触发时本次法术防御按双倍参与结算。',
      ];
    case 'hit':
      return [
        '你的命中不单独转概率，而是作为对手闪避公式里的对抗基数。',
        '对手闪避率 = 对手闪避 / (对手闪避 + 你的命中 + 100)',
        '战斗经验会提高你的有效命中；若本次先触发破招，则命中按双倍参与判定。',
      ];
    case 'dodge':
      return [
        '闪避率 = 闪避 / (闪避 + 对方命中 + 100)',
        '战斗经验会提高你的有效闪避；若对方先触发破招，则其命中按双倍参与判定。',
      ];
    case 'crit':
      return [
        '暴击率 = 暴击 / (暴击 + 对方免爆 + 100)',
        '若本次先触发破招，则暴击按双倍参与判定。',
      ];
    case 'antiCrit':
      return [
        '对手对你的暴击率 = 对手暴击 / (对手暴击 + 你的免爆 + 100)',
        '免爆越高，对手暴击率越低。',
      ];
    case 'critDamage':
      return [
        '最终暴击伤害倍率 = 200% + 暴击伤害 / 10',
      ];
    case 'breakPower':
      return [
        '只有当你的破招高于对方化解时，才会计算破招率；若两边相等，则本次既不判破招也不判化解。',
        '破招率 = 破招 / (破招 + 对方化解 + 100)',
        '破招触发后，本次命中与暴击都按双倍攻击方数值重新判定。',
      ];
    case 'resolvePower':
      return [
        '只有当你的化解高于对方破招时，才会计算化解率；若两边相等，则本次既不判化解也不判破招。',
        '化解率 = 化解 / (化解 + 对方破招 + 100)',
        '破招与化解只能触发一个；化解触发后，本次防御按双倍参与减伤结算。',
      ];
    default:
      return [];
  }
}

/** buildNumericTooltip：构建Numeric提示。 */
function buildNumericTooltip(label: string, key: NumericCardKey, numericValue: number, ratioValueText?: string): string {
  const lines = [
    NUMERIC_TOOLTIP_DESCRIPTIONS[key] ?? '该属性影响角色的实际战斗表现。',
    `当前数值：${key === 'critDamage' ? formatCritDamageDisplay(numericValue) : key === 'moveSpeed' ? formatMoveSpeedDisplay(numericValue) : RATE_BP_KEYS.has(key) ? formatRateBp(numericValue) : formatDisplayInteger(numericValue)}`,
  ];
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

/** 属性雷达图中的单个节点，包含标签、数值、颜色和提示文案。 */
interface RadarEntry {
  label: string;
  value: number;
  color: string;
  valueLabel?: string;
  tooltipTitle: string;
  tooltipDetail: string;
}

/** 单个雷达节点的渲染快照，记录坐标、标签和值提示。 */
interface AttrRadarNodeSnapshot {
  label: string;
  valueLabel: string;
  color: string;
  dotX: string;
  dotY: string;
  labelX: string;
  labelY: string;
  valueX: string;
  valueY: string;
  tooltipTitle: string;
  tooltipDetail: string;
}

/** 雷达属性页的渲染快照，包含标题、网格、轴线和节点。 */
interface AttrRadarPaneSnapshot {
  kind: 'radar';
  title: string;
  scale: number;
  paneId: string;
  areaPoints: string;
  rings: string[];
  axes: Array<{ x: string; y: string; stroke: string }>;
  nodes: AttrRadarNodeSnapshot[];
}

/** 数值卡片的渲染快照，包含展示值、附加说明和提示内容。 */
interface AttrNumericCardSnapshot {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tooltipTitle: string;
  tooltipDetail: string;
}

/** 数值属性页的渲染快照，按卡片列表组织。 */
interface AttrNumericPaneSnapshot {
  kind: 'numeric';
  title: string;
  cards: AttrNumericCardSnapshot[];
}

/** 属性页占位快照，用于尚未同步到数据时的提示。 */
interface AttrPlaceholderPaneSnapshot {
  kind: 'placeholder';
  message: string;
}

/** 采集 / 炼器 / 强化技能的渲染快照，包含等级和进度信息。 */
interface AttrCraftSkillSnapshot {
  key: string;
  label: string;
  level: string;
  progress: string;
  remain: string;
  progressPercent: string;
}

/** 生活技能页的渲染快照，按技能列表展示。 */
interface AttrCraftPaneSnapshot {
  kind: 'craft';
  skills: AttrCraftSkillSnapshot[];
}

/** 单个属性页的统一渲染快照类型。 */
type AttrPaneSnapshot = AttrRadarPaneSnapshot | AttrNumericPaneSnapshot | AttrPlaceholderPaneSnapshot | AttrCraftPaneSnapshot;

/** 整个属性面板的渲染快照，按分页保存各页内容。 */
interface AttrPanelSnapshot {
  panes: Record<AttrTab, AttrPaneSnapshot>;
}

/** AttrPanel：属性面板实现。 */
export class AttrPanel {
  /** pane：pane。 */
  private pane = document.getElementById('pane-attr')!;
  /** activeTab：活跃Tab。 */
  private activeTab: AttrTab = 'base';
  /** tooltip：提示。 */
  private tooltip = new FloatingTooltip('floating-tooltip attr-tooltip');
  /** lastSnapshot：last快照。 */
  private lastSnapshot: AttrPanelSnapshot | null = null;
  /** lastStructureKey：last Structure Key。 */
  private lastStructureKey: string | null = null;
  /** tooltipTarget：提示目标。 */
  private tooltipTarget: Element | null = null;

  constructor() {
    this.ensureTooltipStyle();
    this.bindPaneEvents();
    this.bindTooltipEvents();
  }

  /** clear：清理clear。 */
  clear(): void {
    this.lastSnapshot = null;
    this.lastStructureKey = null;
    this.tooltipTarget = null;
    this.tooltip.hide(true);
    this.pane.innerHTML = '<div class="empty-hint">尚未观测到角色属性</div>';
  }

  /** 接收属性更新事件并重新渲染 */
  update(data: NEXT_S2C_AttrUpdate): void {
    if (!data.baseAttrs || !data.bonuses) {
      this.clear();
      return;
    }
    const finalAttrs = data.finalAttrs ?? this.mergeAttrs(data.baseAttrs, data.bonuses);
    const snapshot = this.buildSnapshot(
      data.baseAttrs,
      data.bonuses,
      finalAttrs,
      data.numericStats,
      data.ratioDivisors,
      data.specialStats,
      data.alchemySkill,
      data.gatherSkill,
      data.enhancementSkill,
    );
    const structureKey = this.buildStructureKey(snapshot);
    if (this.lastStructureKey !== structureKey || !this.patch(snapshot)) {
      this.render(snapshot);
      return;
    }
    this.lastSnapshot = snapshot;
  }

  /** 使用玩家状态初始化属性面板。 */
  initFromPlayer(player: PlayerState): void {
    const finalAttrs = player.finalAttrs ?? this.mergeAttrs(player.baseAttrs, player.bonuses);
    const snapshot = this.buildSnapshot(
      player.baseAttrs,
      player.bonuses,
      finalAttrs,
      player.numericStats,
      player.ratioDivisors,
      {
        foundation: Math.max(0, Math.floor(player.foundation ?? 0)),
        combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
      },
      player.alchemySkill,
      player.gatherSkill,
      player.enhancementSkill,
    );
    this.render(snapshot);
  }

  /** mergeAttrs：合并属性。 */
  private mergeAttrs(base: Attributes, bonuses: AttrBonus[]): Attributes {
    const result = { ...base };
    for (const bonus of bonuses) {
      for (const key of ATTR_KEYS) {
        if (bonus.attrs[key] !== undefined) {
          result[key] += bonus.attrs[key]!;
        }
      }
    }
    return result;
  }

  private buildSnapshot(
    base: Attributes,
    bonuses: AttrBonus[],
    final: Attributes,
    stats?: NumericStats,
    ratioDivisors?: NumericRatioDivisors,
    specialStats?: PlayerSpecialStats,
    alchemySkill?: PlayerState['alchemySkill'],
    gatherSkill?: PlayerState['gatherSkill'],
    enhancementSkill?: PlayerState['enhancementSkill'],
  ): AttrPanelSnapshot {
    const totalBonus: Partial<Attributes> = {};
    for (const bonus of bonuses) {
      for (const key of ATTR_KEYS) {
        if (bonus.attrs[key] !== undefined) {
          totalBonus[key] = (totalBonus[key] || 0) + bonus.attrs[key]!;
        }
      }
    }

    return {
      panes: {
        base: this.buildBaseRadarSnapshot(base, final, totalBonus),
        root: stats && ratioDivisors
          ? this.buildRootRadarSnapshot(stats, ratioDivisors, bonuses)
          : { kind: 'placeholder', message: '灵根信息尚未同步' },
        vein: stats
          ? this.buildVeinPaneSnapshot(stats, bonuses)
          : { kind: 'placeholder', message: '灵脉信息尚未同步' },
        combat: this.buildNumericPaneSnapshot('斗法数值', stats, ratioDivisors, {
          keys: ['maxHp', 'physAtk', 'spellAtk', 'physDef', 'spellDef', 'hit', 'dodge', 'crit', 'antiCrit', 'critDamage', 'breakPower', 'resolvePower'],
          ratioKeys: [],
          legends: {
            maxHp: '最大生命值',
            physAtk: '物理攻击',
            spellAtk: '法术攻击',
            physDef: '物理防御',
            spellDef: '法术防御',
            hit: '命中',
            dodge: '闪避',
            crit: '暴击',
            antiCrit: '免爆',
            critDamage: '暴击伤害',
            breakPower: '破招',
            resolvePower: '化解',
          },
        }),
        qi: this.buildNumericPaneSnapshot('灵力运转', stats, ratioDivisors, {
          keys: ['maxQi', 'maxQiOutputPerTick', 'qiRegenRate', 'hpRegenRate', 'cooldownSpeed', 'auraCostReduce', 'auraPowerRate'],
          ratioKeys: ['cooldownSpeed'],
          legends: {
            maxQi: '最大灵力值',
            maxQiOutputPerTick: '灵力输出速率',
            qiRegenRate: '灵力回复',
            hpRegenRate: '生命回复',
            cooldownSpeed: '冷却速度',
            auraCostReduce: '光环消耗缩减',
            auraPowerRate: '光环效果增强',
          },
        }),
        special: this.buildSpecialPaneSnapshot(stats, ratioDivisors, specialStats),
        craft: this.buildCraftPaneSnapshot(alchemySkill, gatherSkill, enhancementSkill),
      },
    };
  }

  /** buildBaseRadarSnapshot：构建基础Radar快照。 */
  private buildBaseRadarSnapshot(base: Attributes, final: Attributes, totalBonus: Partial<Attributes>): AttrRadarPaneSnapshot {
    const maxValue = Math.max(20, ...ATTR_KEYS.map((key) => final[key]));
    const radarMax = Math.ceil(maxValue / 5) * 5 || 20;
    const entries: RadarEntry[] = ATTR_KEYS.map((key, index) => {
      const finalValue = final[key];
      const baseValue = base[key];
      const bonusValue = totalBonus[key] ?? 0;
      const roundedValue = Math.round(finalValue);
      return {
        label: ATTR_KEY_LABELS[key],
        value: finalValue,
        valueLabel: formatDisplayInteger(roundedValue),
        tooltipTitle: ATTR_KEY_LABELS[key],
        tooltipDetail: [
          `当前：${formatDisplayInteger(roundedValue)}`,
          `基础：${formatDisplayInteger(baseValue)}`,
          `增益：${bonusValue >= 0 ? '+' : ''}${formatDisplayInteger(bonusValue)}`,
          '实际转化：',
          ...buildAttrConversionLines(key, finalValue),
        ].join('\n'),
        color: ATTR_COLORS[index % ATTR_COLORS.length],
      };
    });

    return this.buildRadarPaneSnapshot('六维轮图', radarMax, entries, 'base');
  }

  private buildRootRadarSnapshot(
    stats: NumericStats,
    ratioDivisors: NumericRatioDivisors,
    bonuses: AttrBonus[],
  ): AttrRadarPaneSnapshot {
    const roots = this.resolveDisplaySpiritualRoots(stats, bonuses);
    const entries: RadarEntry[] = ELEMENT_KEYS.map((key, index) => {
      const damageBonus = stats.elementDamageBonus[key];
      const reductionDivisor = ratioDivisors.elementDamageReduce[key] || 100;
      const roundedBonus = Math.round(damageBonus);
      return {
        label: `${ELEMENT_KEY_LABELS[key]}灵根`,
        value: damageBonus,
        valueLabel: formatDisplayInteger(roundedBonus),
        tooltipTitle: `${ELEMENT_KEY_LABELS[key]}灵根`,
        tooltipDetail: [
          `当前：${formatDisplayInteger(roundedBonus)} 点`,
          `${ELEMENT_KEY_LABELS[key]}属性伤害增幅：${formatDisplayPercent(roundedBonus)}`,
          `${ELEMENT_KEY_LABELS[key]}属性实际减伤：${formatRatioPercent(stats.elementDamageReduce[key], reductionDivisor)}`,
          `${ELEMENT_KEY_LABELS[key]}属性灵气吸收效率：${formatDisplayPercent(getSpiritualRootAbsorptionRate(roundedBonus), { maximumFractionDigits: 2 })}`,
        ].join('\n'),
        color: ELEMENT_COLORS[index % ELEMENT_COLORS.length],
      };
    });
    const radarMax = Math.max(100, ...entries.map((entry) => entry.value)) || 100;
    const rootTitle = describeSpiritualRoots(roots).name;
    return this.buildRadarPaneSnapshot(rootTitle, radarMax, entries, 'root');
  }

  private buildVeinPaneSnapshot(
    stats: NumericStats,
    bonuses: AttrBonus[],
  ): AttrNumericPaneSnapshot {
    const roots = this.resolveDisplaySpiritualRoots(stats, bonuses);
    const cards: AttrNumericCardSnapshot[] = [{
      key: 'neutral-aura',
      label: '无属性灵气',
      value: formatAuraAbsorptionRate(100),
      tooltipTitle: '无属性灵气',
      tooltipDetail: [
        '对无属性灵气吸收效率为 100%。',
      ].join('\n'),
    }];

    for (const key of ELEMENT_KEYS) {
      const rootValue = roots?.[key] ?? 0;
      if (rootValue <= 0) {
        continue;
      }
      const rate = getSpiritualRootAbsorptionRate(rootValue);
      const label = `${ELEMENT_KEY_LABELS[key]}灵气`;
      cards.push({
        key: `${key}-aura`,
        label,
        value: formatAuraAbsorptionRate(rate),
        tooltipTitle: label,
        tooltipDetail: [
          `对${ELEMENT_KEY_LABELS[key]}灵气吸收效率为 ${formatAuraAbsorptionRate(rate)}。`,
          `当前${ELEMENT_KEY_LABELS[key]}灵根：${formatDisplayInteger(rootValue)}`,
        ].join('\n'),
      });
    }

    return {
      kind: 'numeric',
      title: '灵脉流转',
      cards,
    };
  }

  /** buildHeavenGateRootsFromStats：构建Heaven关卡Roots From属性。 */
  private buildHeavenGateRootsFromStats(stats: NumericStats): HeavenGateRootValues {
    return ELEMENT_KEYS.reduce((roots, key) => {
      roots[key] = Math.max(0, Math.min(100, Math.round(stats.elementDamageBonus[key])));
      return roots;
    }, {} as HeavenGateRootValues);
  }

  /** resolveDisplaySpiritualRoots：解析显示Spiritual Roots。 */
  private resolveDisplaySpiritualRoots(stats: NumericStats, bonuses: AttrBonus[]): HeavenGateRootValues | null {
    return resolveSpiritualRootsFromBonuses(bonuses)
      ?? normalizeSpiritualRoots(this.buildHeavenGateRootsFromStats(stats));
  }

  /** buildRadarPaneSnapshot：构建Radar Pane快照。 */
  private buildRadarPaneSnapshot(title: string, scale: number, entries: RadarEntry[], paneId: string): AttrRadarPaneSnapshot {
    const center = 170;
    const radius = 110;
    const safeScale = Math.max(scale, 1);
    /** clampRatio：处理clamp Ratio。 */
    const clampRatio = (value: number) => Math.max(0, Math.min(1, value));

    /** pointAt：处理坐标At。 */
    const pointAt = (index: number, ratio: number, clamp = true) => {
      const angle = ((-90 + index * (360 / entries.length)) * Math.PI) / 180;
      const r = radius * (clamp ? clampRatio(ratio) : ratio);
      return {
        x: center + Math.cos(angle) * r,
        y: center + Math.sin(angle) * r,
      };
    };

    const entriesRatio = entries.map((entry) => clampRatio(entry.value / safeScale));
    const areaPoints = entriesRatio
      .map((ratio, index) => {
        const point = pointAt(index, ratio);
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(' ');
    const rings = [0.2, 0.4, 0.6, 0.8, 1].map((ratio) => {
      return entries
        .map((_, index) => {
          const point = pointAt(index, ratio);
          return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
        })
        .join(' ');
    });
    const axes = entries.map((entry, index) => {
      const point = pointAt(index, 1);
      return {
        x: point.x.toFixed(2),
        y: point.y.toFixed(2),
        stroke: colorWithAlpha(entry.color, 0.35),
      };
    });
    const nodes = entries.map((entry, index) => {
      const dot = pointAt(index, entriesRatio[index]);
      const labelPoint = pointAt(index, 1.14, false);
      const isUpper = labelPoint.y <= center;
      const valuePoint = {
        x: labelPoint.x,
        y: labelPoint.y + (isUpper ? -18 : 18),
      };
      return {
        label: entry.label,
        valueLabel: entry.valueLabel ?? formatDisplayInteger(entry.value),
        color: entry.color,
        dotX: dot.x.toFixed(2),
        dotY: dot.y.toFixed(2),
        labelX: labelPoint.x.toFixed(2),
        labelY: labelPoint.y.toFixed(2),
        valueX: valuePoint.x.toFixed(2),
        valueY: valuePoint.y.toFixed(2),
        tooltipTitle: entry.tooltipTitle,
        tooltipDetail: entry.tooltipDetail,
      };
    });

    return {
      kind: 'radar',
      title,
      scale,
      paneId,
      areaPoints,
      rings,
      axes,
      nodes,
    };
  }

  private buildNumericPaneSnapshot(
    title: string,
    stats?: NumericStats,
    ratios?: NumericRatioDivisors,
    meta?: { keys: NumericCardKey[]; ratioKeys: (keyof NumericRatioDivisors)[]; legends?: Record<string, string> },
  ): AttrPaneSnapshot {
    if (!stats || !ratios || !meta) {
      return { kind: 'placeholder', message: `${title}尚未同步` };
    }

    return {
      kind: 'numeric',
      title,
      cards: meta.keys.map((key) => {
        const rawValue = stats[key];
        const numericValue = typeof rawValue === 'number' ? rawValue : 0;
        const label = meta.legends?.[key as string] ?? String(key);
        const ratioKey = meta.ratioKeys.find((ratio) => ratio === key as keyof NumericRatioDivisors);
        let sub: string | undefined;
        let actualLine: string | undefined;
        if (ratioKey && ratioKey !== 'elementDamageReduce') {
          actualLine = `实际：${formatRatioPercent(numericValue, ratios[ratioKey])}`;
          sub = actualLine;
        } else if (RATE_BP_KEYS.has(key) && key !== 'critDamage') {
          actualLine = `实际：${formatRateBp(numericValue)}`;
          sub = actualLine;
        } else if (key === 'moveSpeed') {
          actualLine = `效果：${formatMoveSpeedEffect(numericValue)}`;
        }
        const value = key === 'critDamage'
          ? formatCritDamageDisplay(numericValue)
          : key === 'moveSpeed'
            ? formatMoveSpeedDisplay(numericValue)
            : RATE_BP_KEYS.has(key)
              ? formatRateBp(numericValue)
              : formatDisplayInteger(numericValue);
        return {
          key,
          label,
          value,
          sub,
          tooltipTitle: label,
          tooltipDetail: buildNumericTooltip(label, key, numericValue, actualLine),
        };
      }),
    };
  }

  private buildSpecialPaneSnapshot(
    stats?: NumericStats,
    ratios?: NumericRatioDivisors,
    specialStats?: PlayerSpecialStats,
  ): AttrPaneSnapshot {
    if (!stats || !ratios) {
      return { kind: 'placeholder', message: '特殊属性尚未同步' };
    }

    const specialCards: AttrNumericCardSnapshot[] = (['foundation', 'combatExp'] as PlayerSpecialCardKey[]).map((key) => {
      const numericValue = Math.max(0, Math.floor(specialStats?.[key] ?? 0));
      const label = PLAYER_SPECIAL_TOOLTIP_LABELS[key];
      const detail = [
        PLAYER_SPECIAL_TOOLTIP_DESCRIPTIONS[key],
        `当前数值：${formatDisplayInteger(numericValue)}`,
      ].join('\n');
      return {
        key,
        label,
        value: formatDisplayInteger(numericValue),
        tooltipTitle: label,
        tooltipDetail: detail,
      };
    });

    const numericPane = this.buildNumericPaneSnapshot('特殊属性', stats, ratios, {
      keys: ['viewRange', 'moveSpeed', 'playerExpRate', 'techniqueExpRate', 'realmExpPerTick', 'techniqueExpPerTick', 'lootRate', 'rareLootRate'],
      ratioKeys: [],
      legends: {
        viewRange: '视野范围',
        moveSpeed: '移动速度',
        playerExpRate: '境界修为',
        techniqueExpRate: '功法经验',
        realmExpPerTick: '每息境界修为',
        techniqueExpPerTick: '每息功法经验',
        lootRate: '掉落增幅',
        rareLootRate: '稀有掉落',
      },
    });
    if (numericPane.kind !== 'numeric') {
      return numericPane;
    }

    return {
      kind: 'numeric',
      title: numericPane.title,
      cards: [...specialCards, ...numericPane.cards],
    };
  }

  private buildCraftSkillSnapshot(
    key: string,
    label: string,
    skill?: PlayerState['alchemySkill'] | PlayerState['gatherSkill'] | PlayerState['enhancementSkill'],
  ): AttrCraftSkillSnapshot | null {
    if (!skill) {
      return null;
    }
    const remain = Math.max(0, skill.expToNext - skill.exp);
    return {
      key,
      label,
      level: `LV ${formatDisplayInteger(skill.level)}`,
      progress: `${formatDisplayInteger(skill.exp)}/${formatDisplayInteger(skill.expToNext)}`,
      remain: `距下一级还需 ${formatDisplayInteger(remain)} ${label}经验`,
      progressPercent: `${(getCraftProgressRatio(skill.exp, skill.expToNext) * 100).toFixed(2)}%`,
    };
  }

  private buildCraftPaneSnapshot(
    alchemySkill?: PlayerState['alchemySkill'],
    gatherSkill?: PlayerState['gatherSkill'],
    enhancementSkill?: PlayerState['enhancementSkill'],
  ): AttrPaneSnapshot {
    const skills = [
      this.buildCraftSkillSnapshot('alchemy', '炼丹', alchemySkill),
      this.buildCraftSkillSnapshot('gather', '采集', gatherSkill),
      this.buildCraftSkillSnapshot('enhancement', '强化', enhancementSkill),
    ].filter((entry): entry is AttrCraftSkillSnapshot => Boolean(entry));
    if (skills.length === 0) {
      return { kind: 'placeholder', message: '技艺信息尚未同步' };
    }
    return {
      kind: 'craft',
      skills,
    };
  }

  /** render：渲染渲染。 */
  private render(snapshot: AttrPanelSnapshot): void {
    this.lastSnapshot = snapshot;
    this.lastStructureKey = this.buildStructureKey(snapshot);
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = `<div class="attr-layout">
        <div class="action-tab-bar ui-tab-strip">${this.renderTabs()}</div>
        <div class="action-tab-pane ${this.activeTab === 'base' ? 'active' : ''}" data-attr-pane="base">${this.renderPane(snapshot.panes.base)}</div>
        <div class="action-tab-pane ${this.activeTab === 'root' ? 'active' : ''}" data-attr-pane="root">${this.renderPane(snapshot.panes.root)}</div>
        <div class="action-tab-pane ${this.activeTab === 'vein' ? 'active' : ''}" data-attr-pane="vein">${this.renderPane(snapshot.panes.vein)}</div>
        <div class="action-tab-pane ${this.activeTab === 'combat' ? 'active' : ''}" data-attr-pane="combat">${this.renderPane(snapshot.panes.combat)}</div>
        <div class="action-tab-pane ${this.activeTab === 'qi' ? 'active' : ''}" data-attr-pane="qi">${this.renderPane(snapshot.panes.qi)}</div>
        <div class="action-tab-pane ${this.activeTab === 'special' ? 'active' : ''}" data-attr-pane="special">${this.renderPane(snapshot.panes.special)}</div>
        <div class="action-tab-pane ${this.activeTab === 'craft' ? 'active' : ''}" data-attr-pane="craft">${this.renderPane(snapshot.panes.craft)}</div>
      </div>`;
    });
  }

  /** renderTabs：渲染标签页。 */
  private renderTabs(): string {
    return (Object.keys(ATTR_TAB_LABELS) as AttrTab[])
      .map((tab) => `<button class="action-tab-btn ui-tab-strip-button ${this.activeTab === tab ? 'active' : ''}" data-attr-tab="${tab}" type="button">${ATTR_TAB_LABELS[tab]}</button>`)
      .join('');
  }

  /** renderPane：渲染Pane。 */
  private renderPane(snapshot: AttrPaneSnapshot): string {
    if (snapshot.kind === 'placeholder') {
      return `<div class="panel-section ui-surface-pane ui-surface-pane--stack" data-pane-kind="placeholder"><div class="empty-hint ui-empty-hint" data-placeholder-text="true">${snapshot.message}</div></div>`;
    }
    if (snapshot.kind === 'numeric') {
      return `<div class="panel-section ui-surface-pane ui-surface-pane--stack" data-pane-kind="numeric">
        <div class="panel-section-title" data-numeric-title="true">${snapshot.title}</div>
        <div class="attr-grid wide">
          ${snapshot.cards.map((card) => `
            <div class="attr-mini ui-surface-card ui-surface-card--compact" data-numeric-card="${card.key}" data-tooltip-title="${escapeHtml(card.tooltipTitle)}" data-tooltip-detail="${escapeHtml(card.tooltipDetail)}">
              <div class="attr-mini-label" data-numeric-label="true">${card.label}</div>
              <div class="attr-mini-value" data-numeric-value="true">${card.value}</div>
              <div class="attr-mini-sub ${card.sub ? '' : 'hidden'}" data-numeric-sub="true">${card.sub ?? ''}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
    }
    if (snapshot.kind === 'craft') {
      return `<div class="body-training-panel" data-pane-kind="craft">
        ${snapshot.skills.map((skill) => `
          <section class="body-training-hero" data-craft-skill="${skill.key}">
            <div class="body-training-hero-main">
              <span class="body-training-kicker" data-craft-label="true">${skill.label}</span>
              <strong class="body-training-level" data-craft-level="true">${skill.level}</strong>
              <span class="body-training-progress-text" data-craft-progress="true">${skill.progress}</span>
            </div>
            <div class="body-training-progress-bar">
              <span class="body-training-progress-fill" data-craft-progress-fill="true" style="width:${skill.progressPercent}"></span>
            </div>
            <div class="body-training-hero-note" data-craft-remain="true">${skill.remain}</div>
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

    return `<div class="panel-section ui-surface-pane ui-surface-pane--stack" data-pane-kind="radar">
      <div class="attr-radar-shell">
        <div class="attr-radar-head">
          <div class="attr-radar-title">${snapshot.title}</div>
          <div class="attr-radar-scale" data-radar-scale="true">刻度 ${snapshot.scale}</div>
        </div>
        <svg class="attr-radar" viewBox="0 0 340 340" role="img" aria-label="${snapshot.title}">
          <defs><linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="100%">${gradientStops}</linearGradient></defs>
          ${snapshot.rings.map((points) => `<polygon class="attr-radar-ring" points="${points}"></polygon>`).join('')}
          ${snapshot.axes.map((axis) => `<line class="attr-radar-axis" x1="170" y1="170" x2="${axis.x}" y2="${axis.y}" stroke="${axis.stroke}"></line>`).join('')}
          <polygon class="attr-radar-area" data-radar-area="true" points="${snapshot.areaPoints}" fill="url(#${gradientId})" stroke="${snapshot.nodes[0]?.color ?? '#ff8a65'}" stroke-width="2"></polygon>
          ${snapshot.nodes.map((node, index) => `
            <g class="attr-radar-node" data-radar-node="${index}" data-tooltip-title="${escapeHtml(node.tooltipTitle)}" data-tooltip-detail="${escapeHtml(node.tooltipDetail)}">
              <circle class="attr-radar-dot" data-radar-dot="true" cx="${node.dotX}" cy="${node.dotY}" r="6" fill="${node.color}" stroke="rgba(255,255,255,0.9)" stroke-width="1.8"></circle>
              <text class="attr-radar-label attr-radar-trigger" data-radar-label="true" x="${node.labelX}" y="${node.labelY}" text-anchor="middle" dominant-baseline="middle">${node.label}</text>
              <text class="attr-radar-value attr-radar-trigger" data-radar-value="true" x="${node.valueX}" y="${node.valueY}" text-anchor="middle" dominant-baseline="middle">${node.valueLabel}</text>
            </g>
          `).join('')}
        </svg>
      </div>
    </div>`;
  }

  /** patch：处理patch。 */
  private patch(snapshot: AttrPanelSnapshot): boolean {
    this.patchTabState();
    return this.patchPane('base', snapshot.panes.base)
      && this.patchPane('root', snapshot.panes.root)
      && this.patchPane('vein', snapshot.panes.vein)
      && this.patchPane('combat', snapshot.panes.combat)
      && this.patchPane('qi', snapshot.panes.qi)
      && this.patchPane('special', snapshot.panes.special)
      && this.patchPane('craft', snapshot.panes.craft);
  }

  /** patchPane：处理patch Pane。 */
  private patchPane(tab: AttrTab, snapshot: AttrPaneSnapshot): boolean {
    const pane = this.pane.querySelector<HTMLElement>(`[data-attr-pane="${tab}"]`);
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
      if (!titleNode || cardNodes.length !== snapshot.cards.length) {
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
        if (!labelNode || !levelNode || !progressNode || !fillNode || !remainNode) {
          return false;
        }
        labelNode.textContent = skill.label;
        levelNode.textContent = skill.level;
        progressNode.textContent = skill.progress;
        fillNode.style.width = skill.progressPercent;
        remainNode.textContent = skill.remain;
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
    scaleNode.textContent = `刻度 ${snapshot.scale}`;
    areaNode.setAttribute('points', snapshot.areaPoints);
    areaNode.setAttribute('stroke', snapshot.nodes[0]?.color ?? '#ff8a65');
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
    }
    return true;
  }

  /** buildStructureKey：构建Structure Key。 */
  private buildStructureKey(snapshot: AttrPanelSnapshot): string {
    const entries = Object.entries(snapshot.panes).map(([tab, pane]) => {
      if (pane.kind === 'numeric') {
        return [tab, { kind: pane.kind, cards: pane.cards.map((card) => card.key) }];
      }
      if (pane.kind === 'radar') {
        return [tab, { kind: pane.kind, nodes: pane.nodes.length }];
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
      const button = target.closest<HTMLElement>('[data-attr-tab]');
      if (!button) {
        return;
      }
      const tab = button.dataset.attrTab as AttrTab | undefined;
      if (!tab || tab === this.activeTab) {
        return;
      }
      this.activeTab = tab;
      this.patchTabState();
    });
  }

  /** patchTabState：处理patch Tab状态。 */
  private patchTabState(): void {
    this.pane.querySelectorAll<HTMLElement>('[data-attr-tab]').forEach((entry) => {
      entry.classList.toggle('active', entry.dataset.attrTab === this.activeTab);
    });
    this.pane.querySelectorAll<HTMLElement>('[data-attr-pane]').forEach((entry) => {
      entry.classList.toggle('active', entry.dataset.attrPane === this.activeTab);
    });
  }

  /** ensureTooltipStyle：确保提示样式。 */
  private ensureTooltipStyle(): void {
    if (document.getElementById(TOOLTIP_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TOOLTIP_STYLE_ID;
    style.textContent = `
      .attr-tooltip {
        position: fixed;
        pointer-events: none;
        font-size: var(--font-size-13);
        color: var(--ink-black);
        z-index: 2000;
        transition: opacity 120ms ease, transform 120ms ease;
        opacity: 0;
        transform: translateY(-8px);
        font-family: var(--font-role-body);
        min-width: 0;
      }
      .attr-tooltip.visible {
        opacity: 1;
      }
      .attr-tooltip .floating-tooltip-shell {
        display: block;
        max-width: min(320px, calc(100vw - 24px));
      }
      .attr-tooltip .floating-tooltip-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        line-height: 1.35;
        min-width: 140px;
        max-width: min(320px, calc(100vw - 24px));
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid rgba(34,26,19,0.15);
        background: var(--surface-card-strong);
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      }
      .attr-tooltip .floating-tooltip-body strong {
        font-weight: var(--font-weight-semibold);
        display: block;
        margin-bottom: 4px;
      }
      .attr-tooltip .floating-tooltip-line {
        display: block;
      }
      .attr-tooltip .floating-tooltip-detail {
        font-size: var(--font-size-12);
        line-height: 1.4;
        color: var(--ink-grey);
      }
      .attr-radar-shell {
        display: grid;
        gap: 10px;
        padding: 14px 16px 18px;
        border-radius: 10px;
        border: 1px solid rgba(34,26,19,0.18);
        background: var(--surface-gradient-tooltip);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35), 0 6px 18px rgba(0,0,0,0.08);
      }
      .attr-radar-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }
      .attr-radar-title {
        font-family: var(--font-role-title);
        font-size: var(--font-size-role-title-16);
        color: var(--ink-black);
      }
      .attr-radar-scale {
        font-size: var(--font-size-11);
        color: var(--ink-grey);
      }
      .attr-radar {
        width: 100%;
        max-width: 320px;
        height: 320px;
        margin: 0 auto;
        display: block;
        overflow: visible;
      }
      .attr-radar-ring {
        fill: none;
        stroke: var(--radar-grid-stroke);
        stroke-width: 1;
      }
      .attr-radar-axis {
        stroke: var(--radar-grid-stroke-strong);
        stroke-width: 1.5;
      }
      .attr-radar-area {
        transition: opacity 160ms ease;
        opacity: 0.9;
      }
      .attr-radar-label {
        font-family: var(--font-role-body);
        font-size: var(--font-size-role-body-12);
        fill: var(--ink-black);
      }
      .attr-radar-value {
        font-size: var(--font-size-11);
        fill: var(--ink-grey);
      }
    `;
    document.head.appendChild(style);
  }

  /** bindTooltipEvents：绑定提示事件。 */
  private bindTooltipEvents(): void {
    const tapMode = prefersPinnedTooltipInteraction();
    this.pane.addEventListener('click', (event) => {
      if (!tapMode) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const tooltipNode = target.closest<HTMLElement>('[data-tooltip-title]');
      if (!tooltipNode) {
        return;
      }
      if (this.tooltip.isPinnedTo(tooltipNode)) {
        this.tooltipTarget = null;
        this.tooltip.hide(true);
        return;
      }
      this.tooltipTarget = tooltipNode;
      const title = tooltipNode.getAttribute('data-tooltip-title') ?? '';
      const detail = tooltipNode.getAttribute('data-tooltip-detail') ?? '';
      this.tooltip.showPinned(tooltipNode, title, splitTooltipLines(detail), event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
    }, true);

    this.pane.addEventListener('pointermove', (event) => {
      if (tapMode && this.tooltip.isPinned()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        if (this.tooltipTarget) {
          this.tooltipTarget = null;
          this.tooltip.hide();
        }
        return;
      }

      const tooltipNode = target.closest('[data-tooltip-title]');
      if (!tooltipNode) {
        if (this.tooltipTarget) {
          this.tooltipTarget = null;
          this.tooltip.hide();
        }
        return;
      }

      if (this.tooltipTarget !== tooltipNode) {
        this.tooltipTarget = tooltipNode;
        const title = tooltipNode.getAttribute('data-tooltip-title') ?? '';
        const detail = tooltipNode.getAttribute('data-tooltip-detail') ?? '';
        this.tooltip.show(title, splitTooltipLines(detail), event.clientX, event.clientY);
        return;
      }

      this.tooltip.move(event.clientX, event.clientY);
    });

    this.pane.addEventListener('pointerleave', () => {
      this.tooltipTarget = null;
      this.tooltip.hide();
    });

    this.pane.addEventListener('pointerdown', () => {
      if (!this.tooltipTarget) {
        return;
      }
      this.tooltipTarget = null;
      this.tooltip.hide();
    });
  }
}

