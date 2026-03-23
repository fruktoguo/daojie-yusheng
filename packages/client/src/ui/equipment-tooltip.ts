/**
 * 装备提示框内容构建器
 * 复用技能提示框的富文本与 Buff 侧栏卡片表现，展示装备词条与特效。
 */

import {
  ElementKey,
  EquipmentEffectDef,
  ItemStack,
  NUMERIC_SCALAR_STAT_KEYS,
  NumericScalarStatKey,
} from '@mud/shared';
import { SkillTooltipAsideCard, SkillTooltipContent } from './skill-tooltip';

const SLOT_LABELS: Record<string, string> = {
  weapon: '武器',
  head: '头部',
  body: '身体',
  legs: '腿部',
  accessory: '饰品',
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  consumable: '消耗品',
  equipment: '装备',
  material: '材料',
  quest_item: '任务物',
  skill_book: '功法书',
};

const ATTR_LABELS = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
} as const;

const NUMERIC_STAT_LABELS: Partial<Record<NumericScalarStatKey, string>> = {
  maxHp: '最大生命',
  maxQi: '最大灵力',
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
  maxQiOutputPerTick: '灵力输出',
  qiRegenRate: '灵力回复',
  hpRegenRate: '生命回复',
  cooldownSpeed: '冷却速度',
  auraCostReduce: '灵耗减免',
  auraPowerRate: '术法增幅',
  playerExpRate: '角色经验',
  techniqueExpRate: '功法经验',
  realmExpPerTick: '每息境界经验',
  techniqueExpPerTick: '每息功法经验',
  lootRate: '掉落增幅',
  rareLootRate: '稀有掉落',
  viewRange: '视野',
  moveSpeed: '移动速度',
};

const ELEMENT_NAMES: Record<ElementKey, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLabelLine(label: string, value: string): string {
  return `<span class="skill-tooltip-label">${escapeHtml(label)}：</span>${value}`;
}

function renderPlainLine(label: string, value: string): string {
  return renderLabelLine(label, escapeHtml(value));
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value % 1) < 1e-6) return String(Math.round(value));
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatSignedValue(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}`;
}

function formatBonusValue(key: string, value: number): string {
  if (key === 'critDamage') {
    return `${value / 10}%`;
  }
  if ([
    'qiRegenRate',
    'hpRegenRate',
    'auraCostReduce',
    'auraPowerRate',
    'playerExpRate',
    'techniqueExpRate',
    'lootRate',
    'rareLootRate',
  ].includes(key)) {
    return `${value / 100}%`;
  }
  return `${value}`;
}

function normalizeBuffMark(name: string, shortMark?: string): string {
  const value = shortMark?.trim();
  if (value) return [...value][0] ?? value;
  return [...name.trim()][0] ?? '气';
}

function buildBuffInlineBadge(name: string, shortMark?: string, category?: 'buff' | 'debuff'): string {
  const toneClass = category === 'debuff' ? 'debuff' : 'buff';
  const mark = normalizeBuffMark(name, shortMark);
  return `<span class="skill-tooltip-buff-entry ${toneClass}"><span class="skill-tooltip-buff-mark">${escapeHtml(mark)}</span><span>${escapeHtml(name)}</span></span>`;
}

function describeBuffStats(
  attrs?: NonNullable<ItemStack['equipAttrs']>,
  stats?: NonNullable<NonNullable<ItemStack['effects']>[number] extends infer _T ? ItemStack['equipStats'] : never>,
): string[] {
  const lines: string[] = [];
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value !== 'number' || value === 0) continue;
      lines.push(`${ATTR_LABELS[key as keyof typeof ATTR_LABELS] ?? key} ${formatSignedValue(value)}`);
    }
  }
  if (stats) {
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
      const value = stats[key];
      if (typeof value !== 'number' || value === 0) continue;
      lines.push(`${NUMERIC_STAT_LABELS[key] ?? key} ${formatSignedValue(value)}`);
    }
    if (stats.elementDamageBonus) {
      for (const [key, value] of Object.entries(stats.elementDamageBonus)) {
        if (typeof value !== 'number' || value === 0) continue;
        lines.push(`${ELEMENT_NAMES[key as ElementKey]}行增伤 ${formatSignedValue(value)}`);
      }
    }
    if (stats.elementDamageReduce) {
      for (const [key, value] of Object.entries(stats.elementDamageReduce)) {
        if (typeof value !== 'number' || value === 0) continue;
        lines.push(`${ELEMENT_NAMES[key as ElementKey]}行减伤 ${formatSignedValue(value)}`);
      }
    }
  }
  return lines;
}

function formatConditionText(effect: EquipmentEffectDef): string[] {
  const conditions = effect.conditions?.items ?? [];
  return conditions.map((condition) => {
    switch (condition.type) {
      case 'time_segment':
        return `时段：${condition.in.join(' / ')}`;
      case 'map':
        return `地图：${condition.mapIds.join(' / ')}`;
      case 'hp_ratio':
        return `生命 ${condition.op} ${Math.round(condition.value * 100)}%`;
      case 'qi_ratio':
        return `灵力 ${condition.op} ${Math.round(condition.value * 100)}%`;
      case 'is_cultivating':
        return condition.value ? '仅修炼中生效' : '仅未修炼时生效';
      case 'has_buff':
        return `需带有 ${condition.buffId}${condition.minStacks ? ` ${condition.minStacks} 层` : ''}`;
      case 'target_kind':
        return `目标：${condition.in.join(' / ')}`;
      default:
        return '';
    }
  }).filter((entry) => entry.length > 0);
}

function formatTriggerLabel(trigger: EquipmentEffectDef extends infer _T ? string : never): string {
  const labels: Record<string, string> = {
    on_equip: '装备时',
    on_unequip: '卸下时',
    on_tick: '每息',
    on_move: '移动后',
    on_attack: '攻击后',
    on_hit: '受击后',
    on_kill: '击杀后',
    on_skill_cast: '施法后',
    on_cultivation_tick: '修炼时',
    on_time_segment_changed: '时段切换时',
    on_enter_map: '入图时',
  };
  return labels[trigger] ?? trigger;
}

function buildTimedBuffAsideCard(effect: Extract<EquipmentEffectDef, { type: 'timed_buff' }>): SkillTooltipAsideCard {
  const stackText = effect.buff.maxStacks && effect.buff.maxStacks > 1 ? ` · 最多 ${effect.buff.maxStacks} 层` : '';
  const conditionLines = formatConditionText(effect);
  const buffLines = describeBuffStats(effect.buff.attrs, effect.buff.stats);
  const lines = [
    `${formatTriggerLabel(effect.trigger)} · ${effect.target === 'target' ? '目标' : '自身'} · ${effect.buff.duration} 息${stackText}`,
    ...(effect.cooldown !== undefined ? [`冷却：${effect.cooldown} 息`] : []),
    ...(effect.chance !== undefined ? [`触发概率：${formatNumber(effect.chance * 100)}%`] : []),
    ...(conditionLines.length > 0 ? [`条件：${conditionLines.join('，')}`] : []),
    ...(buffLines.length > 0 ? [`效果：${buffLines.join('，')}`] : []),
    ...(effect.buff.desc ? [effect.buff.desc] : []),
  ];
  return {
    mark: normalizeBuffMark(effect.buff.name, effect.buff.shortMark),
    title: effect.buff.name,
    lines,
    tone: effect.buff.category === 'debuff' ? 'debuff' : 'buff',
  };
}

function buildEffectSummary(effect: EquipmentEffectDef): { lines: string[]; asideCard?: SkillTooltipAsideCard } {
  const conditionLines = formatConditionText(effect);
  switch (effect.type) {
    case 'stat_aura': {
      const effectLines = describeBuffStats(effect.attrs, effect.stats);
      return {
        lines: [
          renderPlainLine('常驻特效', effectLines.length > 0 ? effectLines.join('，') : '无数值变化'),
          ...(conditionLines.length > 0 ? [renderPlainLine('生效条件', conditionLines.join('，'))] : []),
        ],
      };
    }
    case 'progress_boost': {
      const effectLines = describeBuffStats(effect.attrs, effect.stats);
      return {
        lines: [
          renderPlainLine('推进特效', effectLines.length > 0 ? effectLines.join('，') : '无数值变化'),
          ...(conditionLines.length > 0 ? [renderPlainLine('生效条件', conditionLines.join('，'))] : []),
        ],
      };
    }
    case 'periodic_cost': {
      const modeLabel = effect.mode === 'flat'
        ? `${effect.value}`
        : effect.mode === 'max_ratio_bp'
          ? `${effect.value / 100}% 最大${effect.resource === 'hp' ? '生命' : '灵力'}`
          : `${effect.value / 100}% 当前${effect.resource === 'hp' ? '生命' : '灵力'}`;
      return {
        lines: [
          renderPlainLine('持续代价', `${effect.trigger === 'on_cultivation_tick' ? '修炼时每息' : '每息'}损失 ${modeLabel}`),
          ...(conditionLines.length > 0 ? [renderPlainLine('生效条件', conditionLines.join('，'))] : []),
        ],
      };
    }
    case 'timed_buff': {
      const stackText = effect.buff.maxStacks && effect.buff.maxStacks > 1 ? `，最多 ${effect.buff.maxStacks} 层` : '';
      const meta: string[] = [
        formatTriggerLabel(effect.trigger),
        effect.target === 'target' ? '目标' : '自身',
        `${effect.buff.duration} 息${stackText}`,
      ];
      if (effect.cooldown !== undefined) meta.push(`冷却 ${effect.cooldown} 息`);
      if (effect.chance !== undefined) meta.push(`${formatNumber(effect.chance * 100)}%`);
      return {
        lines: [
          renderLabelLine(
            '触发增益',
            `${buildBuffInlineBadge(effect.buff.name, effect.buff.shortMark, effect.buff.category)}<span class="skill-tooltip-buff-meta">${escapeHtml(` ${meta.join(' · ')}`)}</span>`,
          ),
          ...(conditionLines.length > 0 ? [renderPlainLine('触发条件', conditionLines.join('，'))] : []),
        ],
        asideCard: buildTimedBuffAsideCard(effect),
      };
    }
  }
}

export interface ItemTooltipPayload {
  title: string;
  lines: string[];
  asideCards: SkillTooltipAsideCard[];
  allowHtml: boolean;
}

export function buildItemTooltipPayload(item: ItemStack): ItemTooltipPayload {
  if (item.type !== 'equipment') {
    const lines = [
      item.desc,
      `类型：${ITEM_TYPE_LABELS[item.type] ?? item.type}`,
    ].filter((line) => line.length > 0);
    return {
      title: item.name,
      lines,
      asideCards: [],
      allowHtml: false,
    };
  }

  const staticLines = [
    ...describeBuffStats(item.equipAttrs, item.equipStats),
  ];
  const effectSummaries = (item.effects ?? []).map((effect) => buildEffectSummary(effect));
  const lines: string[] = [
    `<span class="skill-tooltip-desc">${escapeHtml(item.desc ?? '')}</span>`,
    renderPlainLine('类型', ITEM_TYPE_LABELS[item.type] ?? item.type),
    ...(item.equipSlot ? [renderPlainLine('部位', SLOT_LABELS[item.equipSlot] ?? item.equipSlot)] : []),
    ...(staticLines.length > 0 ? [renderPlainLine('静态词条', staticLines.join('，'))] : []),
    ...effectSummaries.flatMap((entry) => entry.lines),
  ];
  const asideCards = effectSummaries
    .map((entry) => entry.asideCard)
    .filter((entry): entry is SkillTooltipAsideCard => Boolean(entry));

  return {
    title: item.name,
    lines,
    asideCards,
    allowHtml: true,
  };
}

export function buildEquipmentTooltipContent(item: ItemStack): SkillTooltipContent {
  const payload = buildItemTooltipPayload(item);
  return {
    lines: payload.lines,
    asideCards: payload.asideCards,
  };
}
