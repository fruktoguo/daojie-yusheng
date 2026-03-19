import {
  ATTR_TO_PERCENT_NUMERIC_WEIGHTS,
  ATTR_TO_NUMERIC_WEIGHTS,
  AttrBonus,
  AttrKey,
  Attributes,
  DEFAULT_RATIO_DIVISOR,
  ELEMENT_KEYS,
  ElementKey,
  NumericRatioDivisors,
  NumericStats,
  PlayerState,
  ratioValue,
  S2C_AttrUpdate,
} from '@mud/shared';

type AttrTab = 'base' | 'root' | 'combat' | 'qi' | 'special';
type NumericCardKey = Exclude<keyof NumericStats, 'elementDamageBonus' | 'elementDamageReduce'>;

const ATTR_NAMES: Record<AttrKey, string> = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
};

const ATTR_KEYS: AttrKey[] = ['constitution', 'spirit', 'perception', 'talent', 'comprehension', 'luck'];

const ATTR_TAB_LABELS: Record<AttrTab, string> = {
  base: '六维',
  root: '灵根',
  combat: '斗法',
  qi: '灵力',
  special: '特殊',
};

const ELEMENT_NAMES: Record<ElementKey, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

const ATTR_COLORS = ['#ff8a65', '#ffd54f', '#4fc3f7', '#4db6ac', '#ba68c8', '#f06292'];
const ELEMENT_COLORS = ['#f9a825', '#7cb342', '#039be5', '#e53935', '#6d4c41'];

const TOOLTIP_STYLE_ID = 'attr-panel-tooltip-style';
const RATE_BP_KEYS = new Set<NumericCardKey>([
  'qiRegenRate',
  'hpRegenRate',
  'auraCostReduce',
  'auraPowerRate',
  'playerExpRate',
  'techniqueExpRate',
  'lootRate',
  'rareLootRate',
]);
const NUMERIC_TOOLTIP_LABELS: Partial<Record<NumericCardKey, string>> = {
  maxHp: '最大生命值',
  maxQi: '最大灵力值',
  physAtk: '物理攻击',
  spellAtk: '法术攻击',
  physDef: '物理防御',
  spellDef: '法术防御',
  hit: '命中',
  dodge: '闪避',
  crit: '暴击',
  critDamage: '暴击伤害',
  breakPower: '破招',
  resolvePower: '化解',
  maxQiOutputPerTick: '灵力输出速率',
  qiRegenRate: '灵力回复',
  hpRegenRate: '生命回复',
  cooldownSpeed: '冷却速度',
  auraCostReduce: '光环消耗缩减',
  auraPowerRate: '光环效果增强',
  playerExpRate: '角色经验',
  techniqueExpRate: '功法经验',
  lootRate: '掉落增幅',
  rareLootRate: '稀有掉落',
  moveSpeed: '移动速度',
  viewRange: '视野范围',
};
const NUMERIC_TOOLTIP_DESCRIPTIONS: Partial<Record<NumericCardKey, string>> = {
  maxHp: '决定你在战斗中的生存上限。',
  maxQi: '决定你可承载的灵力总量。',
  physAtk: '影响物理系技能与普通攻击伤害。',
  spellAtk: '影响法术系技能与灵术伤害。',
  physDef: '降低受到的物理伤害，化解触发时会按双倍防御重新计算减伤。',
  spellDef: '降低受到的法术伤害，化解触发时会按双倍防御重新计算减伤。',
  hit: '提高攻击命中目标的能力。',
  dodge: '提高闪避攻击的概率。',
  crit: '提高暴击触发概率。',
  critDamage: '决定暴击命中后的伤害倍率。',
  breakPower: '压低目标化解概率；超出目标化解的部分会按概率触发破招，使本次命中与暴击判定翻倍。',
  resolvePower: '提高化解来招的概率；化解触发时会按双倍防御重新结算本次减伤。',
  maxQiOutputPerTick: '限制每 tick 可稳定输出的灵力上限。',
  qiRegenRate: '决定每 tick 自动回复的灵力比例。',
  hpRegenRate: '决定每 tick 自动回复的生命比例。',
  cooldownSpeed: '提高技能与效果的冷却流转速度。',
  auraCostReduce: '降低光环或阵法持续消耗。',
  auraPowerRate: '提高光环或阵法提供的效果。',
  playerExpRate: '提高角色经验获取效率。',
  techniqueExpRate: '提高功法经验获取效率。',
  lootRate: '提高常规掉落收益。',
  rareLootRate: '提高稀有掉落收益。',
  moveSpeed: '每 100 点移动速度会在每 tick 额外获得 1 次稳定移动，剩余数值按百分比作为再额外移动 1 格的概率。',
  viewRange: '决定地图上的可见范围。',
};

function formatRateBp(value: number): string {
  const percent = value / 100;
  return `${percent.toFixed(percent % 1 === 0 ? 0 : percent % 0.1 === 0 ? 1 : 2)}%`;
}

function formatSimplePercent(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : value % 0.1 === 0 ? 1 : 2)}%`;
}

function formatCritDamageBonus(value: number): string {
  const percent = value / 10;
  return `${percent.toFixed(percent % 1 === 0 ? 0 : percent % 0.1 === 0 ? 1 : 2)}%`;
}

function colorWithAlpha(color: string, alpha: number): string {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  if (normalized.length !== 6) return color;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function formatRatioPercent(raw: number, divisor: number): string {
  return `${(ratioValue(raw, divisor) * 100).toFixed(2)}%`;
}

function formatNumericTooltipValue(key: NumericCardKey, value: number): string {
  if (key === 'critDamage') {
    return formatCritDamageBonus(value);
  }
  if (RATE_BP_KEYS.has(key)) {
    return formatRateBp(value);
  }
  return `${Math.round(value)}`;
}

function buildAttrConversionSummary(key: AttrKey, totalValue: number): string {
  const parts = buildAttrConversionEntries(key, totalValue);
  return parts.length > 0 ? parts.join('，') : '暂无具体转化';
}

function buildAttrConversionLines(key: AttrKey, totalValue: number): string[] {
  const parts = buildAttrConversionEntries(key, totalValue);
  return parts.length > 0 ? parts : ['暂无具体转化'];
}

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

function splitTooltipLines(detail: string): string[] {
  return detail
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function formatCritDamageDisplay(value: number): string {
  const total = 200 + value / 10;
  return `${total.toFixed(total % 1 === 0 ? 0 : total % 0.1 === 0 ? 1 : 2)}%`;
}

function formatDefenseReduction(value: number): string {
  return formatRatioPercent(value, DEFAULT_RATIO_DIVISOR);
}

function formatMoveSpeedEffect(value: number): string {
  const safeValue = Math.max(0, value);
  const guaranteed = Math.floor(safeValue / 100);
  const chance = safeValue - guaranteed * 100;
  if (chance <= 0) {
    return `每 tick 额外稳定移动 ${guaranteed} 格`;
  }
  return `每 tick 额外稳定移动 ${guaranteed} 格，另有 ${chance.toFixed(chance % 1 === 0 ? 0 : 2)}% 概率再移动 1 格`;
}

function buildNumericTooltip(label: string, key: NumericCardKey, numericValue: number, ratioValueText?: string): string {
  const lines = [
    NUMERIC_TOOLTIP_DESCRIPTIONS[key] ?? '该属性影响角色的实际战斗表现。',
    `当前数值：${key === 'critDamage' ? formatCritDamageDisplay(numericValue) : RATE_BP_KEYS.has(key) ? formatRateBp(numericValue) : Math.round(numericValue)}`,
  ];
  if (key === 'physDef' || key === 'spellDef') {
    lines.push(`实际减伤：${formatDefenseReduction(numericValue)}`);
  } else if (key === 'moveSpeed') {
    lines.push(`实际效果：${formatMoveSpeedEffect(numericValue)}`);
  } else if (ratioValueText && key !== 'critDamage') {
    lines.push(ratioValueText);
  }
  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

interface RadarEntry {
  label: string;
  value: number;
  color: string;
  valueLabel?: string;
  tooltipTitle: string;
  tooltipDetail: string;
}

export class AttrPanel {
  private pane = document.getElementById('pane-attr')!;
  private activeTab: AttrTab = 'base';
  private tooltip: HTMLDivElement | null = null;

  constructor() {
    this.ensureTooltipStyle();
  }

  clear(): void {
    this.pane.innerHTML = '<div class="empty-hint">尚未观测到角色属性</div>';
  }

  update(data: S2C_AttrUpdate): void {
    this.render(data.baseAttrs, data.bonuses, data.finalAttrs, data.numericStats, data.ratioDivisors);
  }

  initFromPlayer(player: PlayerState): void {
    const finalAttrs = player.finalAttrs ?? this.mergeAttrs(player.baseAttrs, player.bonuses);
    this.render(player.baseAttrs, player.bonuses, finalAttrs, player.numericStats, player.ratioDivisors);
  }

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

  private render(
    base: Attributes,
    bonuses: AttrBonus[],
    final: Attributes,
    stats?: NumericStats,
    ratioDivisors?: NumericRatioDivisors,
  ): void {
    const totalBonus: Partial<Attributes> = {};
    for (const bonus of bonuses) {
      for (const key of ATTR_KEYS) {
        if (bonus.attrs[key] !== undefined) {
          totalBonus[key] = (totalBonus[key] || 0) + bonus.attrs[key]!;
        }
      }
    }

    const tabs = (Object.keys(ATTR_TAB_LABELS) as AttrTab[])
      .map((tab) => `<button class="action-tab-btn ${this.activeTab === tab ? 'active' : ''}" data-attr-tab="${tab}" type="button">${ATTR_TAB_LABELS[tab]}</button>`)
      .join('');

    const basePane = this.renderBaseRadar(base, final, totalBonus);
    const rootPane = stats && ratioDivisors ? this.renderRootRadar(stats, ratioDivisors) : this.renderPlaceholder('灵根信息尚未同步');
    const combatPane = this.renderNumericGrid('斗法数值', stats, ratioDivisors, {
      keys: ['maxHp', 'physAtk', 'spellAtk', 'physDef', 'spellDef', 'hit', 'dodge', 'crit', 'critDamage', 'breakPower', 'resolvePower'],
      ratioKeys: ['dodge', 'crit', 'breakPower', 'resolvePower'],
      legends: {
        maxHp: '最大生命值',
        physAtk: '物理攻击',
        spellAtk: '法术攻击',
        physDef: '物理防御',
        spellDef: '法术防御',
        hit: '命中',
        dodge: '闪避',
        crit: '暴击',
        critDamage: '暴击伤害',
        breakPower: '破招',
        resolvePower: '化解',
      },
    });
    const qiPane = this.renderNumericGrid('灵力运转', stats, ratioDivisors, {
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
    });
    const specialPane = this.renderNumericGrid('特殊属性', stats, ratioDivisors, {
      keys: ['viewRange', 'moveSpeed', 'playerExpRate', 'techniqueExpRate', 'lootRate', 'rareLootRate'],
      ratioKeys: [],
      legends: {
        viewRange: '视野范围',
        moveSpeed: '移动速度',
        playerExpRate: '角色经验',
        techniqueExpRate: '功法经验',
        lootRate: '掉落增幅',
        rareLootRate: '稀有掉落',
      },
    });

    this.pane.innerHTML = `<div class="attr-layout">
      <div class="action-tab-bar">${tabs}</div>
      <div class="action-tab-pane ${this.activeTab === 'base' ? 'active' : ''}" data-attr-pane="base">${basePane}</div>
      <div class="action-tab-pane ${this.activeTab === 'root' ? 'active' : ''}" data-attr-pane="root">${rootPane}</div>
      <div class="action-tab-pane ${this.activeTab === 'combat' ? 'active' : ''}" data-attr-pane="combat">${combatPane}</div>
      <div class="action-tab-pane ${this.activeTab === 'qi' ? 'active' : ''}" data-attr-pane="qi">${qiPane}</div>
      <div class="action-tab-pane ${this.activeTab === 'special' ? 'active' : ''}" data-attr-pane="special">${specialPane}</div>
    </div>`;

    this.bindTabs();
    this.bindRadarTooltips();
  }

  private renderBaseRadar(base: Attributes, final: Attributes, totalBonus: Partial<Attributes>): string {
    const maxValue = Math.max(20, ...ATTR_KEYS.map((key) => final[key]));
    const radarMax = Math.ceil(maxValue / 5) * 5 || 20;
    const entries: RadarEntry[] = ATTR_KEYS.map((key, index) => {
      const finalValue = final[key];
      const baseValue = base[key];
      const bonusValue = totalBonus[key] ?? 0;
      const roundedValue = Math.round(finalValue);
      return {
        label: ATTR_NAMES[key],
        value: finalValue,
        valueLabel: `${roundedValue}`,
        tooltipTitle: ATTR_NAMES[key],
        tooltipDetail: [
          `当前：${roundedValue}`,
          `基础：${baseValue}`,
          `增益：${(bonusValue >= 0 ? '+' : '') + bonusValue}`,
          '实际转化：',
          ...buildAttrConversionLines(key, finalValue),
        ].join('\n'),
        color: ATTR_COLORS[index % ATTR_COLORS.length],
      };
    });

    return this.buildRadarSection('六维轮图', radarMax, entries, 'base');
  }

  private renderRootRadar(stats: NumericStats, ratioDivisors: NumericRatioDivisors): string {
    const entries: RadarEntry[] = ELEMENT_KEYS.map((key, index) => {
      const damageBonus = stats.elementDamageBonus[key];
      const reductionDivisor = ratioDivisors.elementDamageReduce[key] || 100;
      const roundedBonus = Math.round(damageBonus);
      return {
        label: `${ELEMENT_NAMES[key]}灵根`,
        value: damageBonus,
        valueLabel: `${roundedBonus}`,
        tooltipTitle: `${ELEMENT_NAMES[key]}灵根`,
        tooltipDetail: [
          `当前：${roundedBonus} 点`,
          `${ELEMENT_NAMES[key]}属性伤害增幅：${roundedBonus}%`,
          `${ELEMENT_NAMES[key]}属性伤害削减：${formatRatioPercent(
          stats.elementDamageReduce[key],
          reductionDivisor,
        )}`,
        ].join('\n'),
        color: ELEMENT_COLORS[index % ELEMENT_COLORS.length],
      };
    });
    const radarMax = Math.max(100, ...entries.map((entry) => entry.value)) || 100;
    return this.buildRadarSection('五行灵根', radarMax, entries, 'root');
  }

  private buildRadarSection(title: string, scale: number, entries: RadarEntry[], paneId: string): string {
    const center = 170;
    const radius = 110;
    const safeScale = Math.max(scale, 1);
    const clampRatio = (value: number) => Math.max(0, Math.min(1, value));

    const pointAt = (index: number, ratio: number, clamp = true) => {
      const angle = ((-90 + index * (360 / entries.length)) * Math.PI) / 180;
      const r = radius * (clamp ? clampRatio(ratio) : ratio);
      return {
        x: center + Math.cos(angle) * r,
        y: center + Math.sin(angle) * r,
        angle,
      };
    };

    const entriesRatio = entries.map((entry) => clampRatio(entry.value / safeScale));
    const axisPoints = entriesRatio.map((_, index) => pointAt(index, 1));
    const polygonPoints = entriesRatio
      .map((ratio, index) => {
        const point = pointAt(index, ratio);
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(' ');

    const rings = [0.2, 0.4, 0.6, 0.8, 1]
      .map((ratio) => `<polygon class="attr-radar-ring" points="${entries
        .map((_, index) => {
          const point = pointAt(index, ratio);
          return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
        })
        .join(' ')}"></polygon>`)
      .join('');

    const axes = entries
      .map((entry, index) => {
        const point = axisPoints[index];
        const axisColor = colorWithAlpha(entry.color, 0.35);
        return `<line class="attr-radar-axis" x1="${center}" y1="${center}" x2="${point.x.toFixed(2)}" y2="${point.y.toFixed(2)}" stroke="${axisColor}"></line>`;
      })
      .join('');

    const gradientId = `attr-radar-area-${paneId}`;
    const gradientStops = entries
      .map((entry, index) => {
        const offset = entries.length === 1 ? '50%' : `${(index / (entries.length - 1)) * 100}%`;
        return `<stop offset="${offset}" stop-color="${entry.color}" stop-opacity="0.4"></stop>`;
      })
      .join('');
    const defs = `<defs><linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="100%">
      ${gradientStops}
    </linearGradient></defs>`;
    const areaStroke = entries[0]?.color ?? '#ff8a65';
    const area = `<polygon class="attr-radar-area" points="${polygonPoints}" fill="url(#${gradientId})" stroke="${areaStroke}" stroke-width="2"></polygon>`;

    const nodes = entries
      .map((entry, index) => {
        const centralPoint = pointAt(index, entriesRatio[index], true);
        const labelPoint = pointAt(index, 1.14, false);
        const isUpper = labelPoint.y <= center;
        const valuePoint = {
          x: labelPoint.x,
          y: labelPoint.y + (isUpper ? -18 : 18),
        };
        const displayValue = entry.valueLabel ?? Math.round(entry.value).toString();
        return `<g class="attr-radar-node" data-tooltip-title="${escapeHtml(entry.tooltipTitle)}" data-tooltip-detail="${escapeHtml(entry.tooltipDetail)}">
        <circle class="attr-radar-dot" cx="${centralPoint.x.toFixed(2)}" cy="${centralPoint.y.toFixed(2)}" r="6" fill="${entry.color}" stroke="rgba(255,255,255,0.9)" stroke-width="1.8"></circle>
        <text class="attr-radar-label attr-radar-trigger" x="${labelPoint.x.toFixed(2)}" y="${labelPoint.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle">${entry.label}</text>
        <text class="attr-radar-value attr-radar-trigger" x="${valuePoint.x.toFixed(2)}" y="${valuePoint.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle">${displayValue}</text>
      </g>`;
      })
      .join('');

    return `<div class="panel-section">
      <div class="attr-radar-shell">
        <div class="attr-radar-head">
          <div class="attr-radar-title">${title}</div>
          <div class="attr-radar-scale">刻度 ${scale}</div>
        </div>
        <svg class="attr-radar" viewBox="0 0 340 340" role="img" aria-label="${title}">
          ${defs}
          ${rings}
          ${axes}
          ${area}
          ${nodes}
        </svg>
      </div>
    </div>`;
  }

  private renderNumericGrid(
    title: string,
    stats?: NumericStats,
    ratios?: NumericRatioDivisors,
    meta?: { keys: NumericCardKey[]; ratioKeys: (keyof NumericRatioDivisors)[]; legends?: Record<string, string> },
  ): string {
    if (!stats || !ratios || !meta) {
      return this.renderPlaceholder(`${title}尚未同步`);
    }
    const cards = meta.keys.map((key) => {
      const rawValue = stats[key];
      const numericValue = typeof rawValue === 'number' ? rawValue : 0;
      const label = meta.legends?.[key as string] ?? String(key);
      const ratioKey = meta.ratioKeys.find((ratio) => ratio === key as keyof NumericRatioDivisors);
      let sub: string | undefined;
      let actualLine: string | undefined;
      if (key === 'physDef' || key === 'spellDef') {
        actualLine = `实际减伤：${formatDefenseReduction(numericValue)}`;
        sub = actualLine;
      } else if (ratioKey && ratioKey !== 'elementDamageReduce') {
        actualLine = `实际：${formatRatioPercent(numericValue, ratios[ratioKey])}`;
        sub = actualLine;
      } else if (RATE_BP_KEYS.has(key) && key !== 'critDamage') {
        actualLine = `实际：${formatRateBp(numericValue)}`;
        sub = actualLine;
      } else if (key === 'moveSpeed') {
        actualLine = `效果：${formatMoveSpeedEffect(numericValue)}`;
        sub = actualLine;
      }
      const displayValue = key === 'critDamage'
        ? formatCritDamageDisplay(numericValue)
        : RATE_BP_KEYS.has(key)
          ? formatRateBp(numericValue)
          : `${Math.round(numericValue)}`;
      const tooltip = buildNumericTooltip(label, key, numericValue, actualLine);
      return `<div class="attr-mini" data-tooltip-title="${escapeHtml(label)}" data-tooltip-detail="${escapeHtml(tooltip)}">
        <div class="attr-mini-label">${label}</div>
        <div class="attr-mini-value">${displayValue}</div>
        ${sub ? `<div class="attr-mini-sub">${sub}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="panel-section">
      <div class="panel-section-title">${title}</div>
      <div class="attr-grid wide">${cards}</div>
    </div>`;
  }

  private renderPlaceholder(message: string): string {
    return `<div class="panel-section"><div class="empty-hint">${message}</div></div>`;
  }

  private bindTabs(): void {
    this.pane.querySelectorAll<HTMLElement>('[data-attr-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.attrTab as AttrTab | undefined;
        if (!tab) return;
        if (tab === this.activeTab) return;
        this.activeTab = tab;
        this.pane.querySelectorAll<HTMLElement>('[data-attr-tab]').forEach((entry) => {
          entry.classList.toggle('active', entry.dataset.attrTab === tab);
        });
        this.pane.querySelectorAll<HTMLElement>('[data-attr-pane]').forEach((entry) => {
          entry.classList.toggle('active', entry.dataset.attrPane === tab);
        });
      });
    });
  }

  private ensureTooltipStyle(): void {
    if (document.getElementById(TOOLTIP_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TOOLTIP_STYLE_ID;
    style.textContent = `
      .attr-tooltip {
        position: fixed;
        pointer-events: none;
        background: rgba(255,255,255,0.96);
        border: 1px solid rgba(34,26,19,0.15);
        padding: 8px 12px;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        font-size: 13px;
        color: #1a120a;
        z-index: 2000;
        transition: opacity 120ms ease, transform 120ms ease;
        opacity: 0;
        transform: translate(-50%, -8px);
        font-family: var(--font-text);
        min-width: 140px;
      }
      .attr-tooltip.visible {
        opacity: 1;
      }
      .attr-tooltip-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        line-height: 1.35;
      }
      .attr-tooltip-body strong {
        font-weight: 600;
        display: block;
        margin-bottom: 4px;
      }
      .attr-tooltip-line {
        display: block;
      }
      .attr-tooltip-detail {
        font-size: 12px;
        line-height: 1.4;
        color: var(--ink-grey);
      }
      .attr-radar-shell {
        display: grid;
        gap: 10px;
        padding: 14px 16px 18px;
        border-radius: 10px;
        border: 1px solid rgba(34,26,19,0.18);
        background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.68));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35), 0 6px 18px rgba(0,0,0,0.08);
      }
      .attr-radar-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }
      .attr-radar-title {
        font-family: var(--font-heading-sub);
        font-size: 16px;
        color: var(--ink-black);
      }
      .attr-radar-scale {
        font-size: 11px;
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
        stroke: rgba(34, 26, 19, 0.11);
        stroke-width: 1;
      }
      .attr-radar-axis {
        stroke-width: 1.5;
      }
      .attr-radar-area {
        transition: opacity 160ms ease;
        opacity: 0.9;
      }
      .attr-radar-label {
        font-family: var(--font-heading-sub);
        font-size: 12px;
        fill: var(--ink-black);
      }
      .attr-radar-value {
        font-size: 11px;
        fill: var(--ink-grey);
      }
    `;
    document.head.appendChild(style);
  }

  private getTooltip(): HTMLDivElement {
    if (!this.tooltip) {
      const tooltip = document.createElement('div');
      tooltip.className = 'attr-tooltip';
      document.body.appendChild(tooltip);
      this.tooltip = tooltip;
    }
    return this.tooltip;
  }

  private bindRadarTooltips(): void {
    const tooltip = this.getTooltip();
    const showTooltip = (title: string, detail: string, event: PointerEvent) => {
      const lines = splitTooltipLines(detail);
      tooltip.innerHTML = `<div class="attr-tooltip-body"><strong>${title}</strong>${
        lines.length > 0
          ? `<div class="attr-tooltip-detail">${lines.map((line) => `<span class="attr-tooltip-line">${line}</span>`).join('')}</div>`
          : ''
      }</div>`;
      tooltip.style.left = `${event.clientX + 14}px`;
      tooltip.style.top = `${event.clientY + 10}px`;
      tooltip.classList.add('visible');
    };

    const triggers = this.pane.querySelectorAll<SVGTextElement>('.attr-radar-trigger');
    triggers.forEach((trigger) => {
      const node = trigger.parentElement;
      const title = node?.getAttribute('data-tooltip-title') ?? '';
      const detail = node?.getAttribute('data-tooltip-detail') ?? '';
      trigger.addEventListener('pointerenter', (event) => {
        showTooltip(title, detail, event);
      });
      trigger.addEventListener('pointermove', (event) => {
        tooltip.style.left = `${event.clientX + 14}px`;
        tooltip.style.top = `${event.clientY + 10}px`;
      });
      trigger.addEventListener('pointerleave', () => {
        tooltip.classList.remove('visible');
      });
    });

    const cards = this.pane.querySelectorAll<HTMLElement>('.attr-mini');
    cards.forEach((card) => {
      const title = card.getAttribute('data-tooltip-title') ?? '';
      const detail = card.getAttribute('data-tooltip-detail') ?? '';
      card.addEventListener('pointerenter', (event) => {
        showTooltip(title, detail, event);
      });
      card.addEventListener('pointermove', (event) => {
        tooltip.style.left = `${event.clientX + 14}px`;
        tooltip.style.top = `${event.clientY + 10}px`;
      });
      card.addEventListener('pointerleave', () => {
        tooltip.classList.remove('visible');
      });
    });
  }
}
