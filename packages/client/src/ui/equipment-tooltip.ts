/**
 * 装备提示框内容构建器
 * 复用技能提示框的富文本与 Buff 侧栏卡片表现，展示装备词条与特效。
 */

import {
  EquipmentEffectDef,
  formatBuffMaxStacks,
  ItemStack,
} from '@mud/shared';
import {
  getEquipSlotLabel,
  getItemTypeLabel,
} from '../domain-labels';
import { renderItemSourceListHtml } from '../content/item-sources';
import { resolvePreviewItem } from '../content/local-templates';
import { SkillTooltipAsideCard, SkillTooltipContent } from './skill-tooltip';
import { describePreviewBonuses } from './stat-preview';
import { formatDisplayInteger, formatDisplayNumber, formatDisplayPercent } from '../utils/number';

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
  stats?: ItemStack['equipStats'],
  valueStats?: ItemStack['equipValueStats'],
): string[] {
  return describePreviewBonuses(attrs, stats, valueStats);
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
        return `生命 ${condition.op} ${formatDisplayPercent(condition.value * 100)}`;
      case 'qi_ratio':
        return `灵力 ${condition.op} ${formatDisplayPercent(condition.value * 100)}`;
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
  const stackLimit = formatBuffMaxStacks(effect.buff.maxStacks);
  const stackText = stackLimit ? ` · 最多 ${stackLimit} 层` : '';
  const conditionLines = formatConditionText(effect);
  const buffLines = describeBuffStats(effect.buff.attrs, effect.buff.stats, effect.buff.valueStats);
  const lines = [
    `${formatTriggerLabel(effect.trigger)} · ${effect.target === 'target' ? '目标' : '自身'} · ${formatDisplayInteger(effect.buff.duration)} 息${stackText}`,
    ...(effect.cooldown !== undefined ? [`冷却：${formatDisplayInteger(effect.cooldown)} 息`] : []),
    ...(effect.chance !== undefined ? [`触发概率：${formatDisplayPercent(effect.chance * 100)}`] : []),
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
      const effectLines = describeBuffStats(effect.attrs, effect.stats, effect.valueStats);
      return {
        lines: [
          renderPlainLine('常驻特效', effectLines.length > 0 ? effectLines.join('，') : '无数值变化'),
          ...(conditionLines.length > 0 ? [renderPlainLine('生效条件', conditionLines.join('，'))] : []),
        ],
      };
    }
    case 'progress_boost': {
      const effectLines = describeBuffStats(effect.attrs, effect.stats, effect.valueStats);
      return {
        lines: [
          renderPlainLine('推进特效', effectLines.length > 0 ? effectLines.join('，') : '无数值变化'),
          ...(conditionLines.length > 0 ? [renderPlainLine('生效条件', conditionLines.join('，'))] : []),
        ],
      };
    }
    case 'periodic_cost': {
      const modeLabel = effect.mode === 'flat'
        ? `${formatDisplayNumber(effect.value)}`
        : effect.mode === 'max_ratio_bp'
          ? `${formatDisplayPercent(effect.value / 100)} 最大${effect.resource === 'hp' ? '生命' : '灵力'}`
          : `${formatDisplayPercent(effect.value / 100)} 当前${effect.resource === 'hp' ? '生命' : '灵力'}`;
      return {
        lines: [
          renderPlainLine('持续代价', `${effect.trigger === 'on_cultivation_tick' ? '修炼时每息' : '每息'}损失 ${modeLabel}`),
          ...(conditionLines.length > 0 ? [renderPlainLine('生效条件', conditionLines.join('，'))] : []),
        ],
      };
    }
    case 'timed_buff': {
      const stackLimit = formatBuffMaxStacks(effect.buff.maxStacks);
      const stackText = stackLimit ? `，最多 ${stackLimit} 层` : '';
      const meta: string[] = [
        formatTriggerLabel(effect.trigger),
        effect.target === 'target' ? '目标' : '自身',
        `${formatDisplayInteger(effect.buff.duration)} 息${stackText}`,
      ];
      if (effect.cooldown !== undefined) meta.push(`冷却 ${formatDisplayInteger(effect.cooldown)} 息`);
      if (effect.chance !== undefined) meta.push(formatDisplayPercent(effect.chance * 100));
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
  const previewItem = resolvePreviewItem(item);
  const sourceListHtml = renderItemSourceListHtml(previewItem.itemId, { maxEntries: 3, compact: true });
  if (previewItem.type !== 'equipment') {
    const lines = [
      `<span class="skill-tooltip-desc">${escapeHtml(previewItem.desc ?? '')}</span>`,
      renderPlainLine('类型', getItemTypeLabel(previewItem.type)),
      `<div class="inventory-source-block"><span class="skill-tooltip-label">来源：</span>${sourceListHtml}</div>`,
    ].filter((line) => line.length > 0);
    return {
      title: previewItem.name,
      lines,
      asideCards: [],
      allowHtml: true,
    };
  }

  const staticLines = [
    ...describeBuffStats(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats),
  ];
  const effectSummaries = (previewItem.effects ?? []).map((effect) => buildEffectSummary(effect));
  const lines: string[] = [
    `<span class="skill-tooltip-desc">${escapeHtml(previewItem.desc ?? '')}</span>`,
    renderPlainLine('类型', getItemTypeLabel(previewItem.type)),
    ...(previewItem.equipSlot ? [renderPlainLine('部位', getEquipSlotLabel(previewItem.equipSlot))] : []),
    ...(staticLines.length > 0 ? [renderPlainLine('静态词条', staticLines.join('，'))] : []),
    ...effectSummaries.flatMap((entry) => entry.lines),
    `<div class="inventory-source-block"><span class="skill-tooltip-label">来源：</span>${sourceListHtml}</div>`,
  ];
  const asideCards = effectSummaries
    .map((entry) => entry.asideCard)
    .filter((entry): entry is SkillTooltipAsideCard => Boolean(entry));

  return {
    title: previewItem.name,
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
