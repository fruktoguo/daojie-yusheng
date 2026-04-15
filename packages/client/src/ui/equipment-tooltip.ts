/**
 * 装备提示框内容构建器
 * 复用技能提示框的富文本与 Buff 侧栏卡片表现，展示装备词条与特效。
 */

import {
  EquipmentEffectDef,
  formatBuffMaxStacks,
  ItemStack,
} from '@mud/shared-next';
import {
  getEquipSlotLabel,
  getItemTypeLabel,
} from '../domain-labels';
import { renderItemSourceListHtml } from '../content/item-sources';
import { resolvePreviewItem, resolveTechniqueIdFromBookItemId } from '../content/local-templates';
import { SkillTooltipAsideCard, SkillTooltipContent } from './skill-tooltip';
import { describePreviewBonuses } from './stat-preview';
import { formatDisplayInteger, formatDisplayNumber, formatDisplayPercent } from '../utils/number';

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** renderLabelLine：渲染标签Line。 */
function renderLabelLine(label: string, value: string): string {
  return `<span class="skill-tooltip-label">${escapeHtml(label)}：</span>${value}`;
}

/** renderPlainLine：渲染Plain Line。 */
function renderPlainLine(label: string, value: string): string {
  return renderLabelLine(label, escapeHtml(value));
}

/** resolveMedicineCategoryLabel：解析Medicine Category标签。 */
function resolveMedicineCategoryLabel(item: ItemStack): string | null {
  const tags = item.tags ?? [];
  if (tags.includes('生命回复')) {
    return '生命回复';
  }
  if (tags.includes('灵力回复')) {
    return '灵力回复';
  }
  if (tags.includes('增益')) {
    return '增益';
  }
  if (tags.includes('特殊')) {
    return '特殊';
  }
  return null;
}

/** normalizeBuffMark：规范化Buff Mark。 */
function normalizeBuffMark(name: string, shortMark?: string): string {
  const value = shortMark?.trim();
  if (value) return [...value][0] ?? value;
  return [...name.trim()][0] ?? '气';
}

/** buildBuffInlineBadge：构建Buff Inline Badge。 */
function buildBuffInlineBadge(name: string, shortMark?: string, category?: 'buff' | 'debuff'): string {
  const toneClass = category === 'debuff' ? 'debuff' : 'buff';
  const mark = normalizeBuffMark(name, shortMark);
  return `<span class="skill-tooltip-buff-entry ${toneClass}"><span class="skill-tooltip-buff-mark">${escapeHtml(mark)}</span><span>${escapeHtml(name)}</span></span>`;
}

/** describeBuffStats：处理describe Buff属性。 */
function describeBuffStats(
  attrs?: NonNullable<ItemStack['equipAttrs']>,
  stats?: ItemStack['equipStats'],
  valueStats?: ItemStack['equipValueStats'],
): string[] {
  return describePreviewBonuses(attrs, stats, valueStats);
}

/** formatConditionText：格式化条件文本。 */
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

/** formatTriggerLabel：格式化Trigger标签。 */
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

/** buildTimedBuffAsideCard：构建Timed Buff Aside卡片。 */
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

/** buildEffectSummary：构建效果摘要。 */
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

/** ItemTooltipPayload：物品提示框载荷。 */
export interface ItemTooltipPayload {
  title: string;
  lines: string[];
  asideCards: SkillTooltipAsideCard[];
  allowHtml: boolean;
}

/** ItemTooltipCooldownState：物品冷却显示状态。 */
export interface ItemTooltipCooldownState {
  cooldown: number;
  cooldownLeft: number;
}

/** ItemTooltipContext：物品提示预览上下文。 */
export interface ItemTooltipContext {
  learnedTechniqueIds?: ReadonlySet<string>;
  unlockedMinimapIds?: ReadonlySet<string>;
  equippedItem?: ItemStack | null;
  itemCooldown?: ItemTooltipCooldownState | null;
}

/** isMapUnlockItemRead：判断是否地图解锁物品Read。 */
function isMapUnlockItemRead(item: Pick<ItemStack, 'mapUnlockId' | 'mapUnlockIds'>, unlockedMinimapIds?: ReadonlySet<string>): boolean {
  if (!unlockedMinimapIds) {
    return false;
  }
  const mapIds = item.mapUnlockIds && item.mapUnlockIds.length > 0
    ? item.mapUnlockIds
    : item.mapUnlockId
      ? [item.mapUnlockId]
      : [];
  return mapIds.length > 0 && mapIds.every((mapId) => unlockedMinimapIds.has(mapId));
}

/** resolveItemStatusLabel：解析物品状态标签。 */
function resolveItemStatusLabel(item: ItemStack, context?: ItemTooltipContext): string | null {
  const itemCooldown = context?.itemCooldown;
  const activeCooldown: ItemTooltipCooldownState | null = itemCooldown !== null && itemCooldown !== undefined && itemCooldown.cooldownLeft > 0
    ? itemCooldown
    : null;
  if (activeCooldown) {
    return `冷却 ${formatDisplayInteger(activeCooldown.cooldownLeft)} 息`;
  }
  if (item.type === 'skill_book') {
    const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
    if (techniqueId && context?.learnedTechniqueIds?.has(techniqueId)) {
      return '已学';
    }
  }
  if (isMapUnlockItemRead(item, context?.unlockedMinimapIds)) {
    return '已阅';
  }
  return null;
}

/** buildPlainEffectSummary：构建Plain效果摘要。 */
function buildPlainEffectSummary(effect: EquipmentEffectDef): string[] {
  const conditionLines = formatConditionText(effect);
  switch (effect.type) {
    case 'stat_aura': {
      const effectLines = describeBuffStats(effect.attrs, effect.stats, effect.valueStats);
      return [
        `常驻特效：${effectLines.length > 0 ? effectLines.join('，') : '无数值变化'}`,
        ...(conditionLines.length > 0 ? [`生效条件：${conditionLines.join('，')}`] : []),
      ];
    }
    case 'progress_boost': {
      const effectLines = describeBuffStats(effect.attrs, effect.stats, effect.valueStats);
      return [
        `推进特效：${effectLines.length > 0 ? effectLines.join('，') : '无数值变化'}`,
        ...(conditionLines.length > 0 ? [`生效条件：${conditionLines.join('，')}`] : []),
      ];
    }
    case 'periodic_cost': {
      const modeLabel = effect.mode === 'flat'
        ? `${formatDisplayNumber(effect.value)}`
        : effect.mode === 'max_ratio_bp'
          ? `${formatDisplayPercent(effect.value / 100)} 最大${effect.resource === 'hp' ? '生命' : '灵力'}`
          : `${formatDisplayPercent(effect.value / 100)} 当前${effect.resource === 'hp' ? '生命' : '灵力'}`;
      return [
        `持续代价：${effect.trigger === 'on_cultivation_tick' ? '修炼时每息' : '每息'}损失 ${modeLabel}`,
        ...(conditionLines.length > 0 ? [`生效条件：${conditionLines.join('，')}`] : []),
      ];
    }
    case 'timed_buff': {
      const stackLimit = formatBuffMaxStacks(effect.buff.maxStacks);
      const meta = [
        formatTriggerLabel(effect.trigger),
        effect.target === 'target' ? '目标' : '自身',
        `${formatDisplayInteger(effect.buff.duration)} 息${stackLimit ? `，最多 ${stackLimit} 层` : ''}`,
        ...(effect.cooldown !== undefined ? [`冷却 ${formatDisplayInteger(effect.cooldown)} 息`] : []),
        ...(effect.chance !== undefined ? [formatDisplayPercent(effect.chance * 100)] : []),
      ];
      return [
        `触发增益：${effect.buff.name} ${meta.join(' · ')}`,
        ...(conditionLines.length > 0 ? [`触发条件：${conditionLines.join('，')}`] : []),
      ];
    }
  }
}

/** buildConsumableEffectDetails：构建Consumable效果详情。 */
function buildConsumableEffectDetails(item: ItemStack, itemCooldown?: ItemTooltipCooldownState | null): string[] {
  const previewItem = resolvePreviewItem(item);
  if (previewItem.type !== 'consumable') {
    return [];
  }

  const lines: string[] = [];
  const activeCooldown: ItemTooltipCooldownState | null = itemCooldown !== null && itemCooldown !== undefined && itemCooldown.cooldownLeft > 0
    ? itemCooldown
    : null;
  if (activeCooldown) {
    lines.push(`当前冷却：${formatDisplayInteger(activeCooldown.cooldownLeft)} / ${formatDisplayInteger(activeCooldown.cooldown)} 息`);
  }
  if (typeof previewItem.cooldown === 'number' && previewItem.cooldown > 0) {
    lines.push(`使用冷却：${formatDisplayInteger(previewItem.cooldown)} 息`);
  }
  const instantParts: string[] = [];
  if (typeof previewItem.healAmount === 'number' && previewItem.healAmount > 0) {
    instantParts.push(`恢复 ${formatDisplayInteger(previewItem.healAmount)} 点气血`);
  }
  if (typeof previewItem.healPercent === 'number' && previewItem.healPercent > 0) {
    instantParts.push(`恢复 ${formatDisplayPercent(previewItem.healPercent * 100)} 气血`);
  }
  if (typeof previewItem.qiPercent === 'number' && previewItem.qiPercent > 0) {
    instantParts.push(`恢复 ${formatDisplayPercent(previewItem.qiPercent * 100)} 真气`);
  }
  if (instantParts.length > 0) {
    lines.push(`立即效果：${instantParts.join('，')}`);
  }

  for (const buff of previewItem.consumeBuffs ?? []) {
    const metaParts = [`持续 ${formatDisplayInteger(buff.duration)} 息`];
    if (typeof buff.maxStacks === 'number' && buff.maxStacks > 1) {
      metaParts.push(`最多 ${formatDisplayInteger(buff.maxStacks)} 层`);
    }
    lines.push(`药效：${buff.name}${metaParts.length > 0 ? `，${metaParts.join('，')}` : ''}`);
    const bonusLines = describeBuffStats(buff.attrs, buff.stats, buff.valueStats);
    if (bonusLines.length > 0) {
      lines.push(`具体加成：${bonusLines.join('，')}`);
    }
    if (buff.desc?.trim()) {
      lines.push(`说明：${buff.desc.trim()}`);
    }
  }

  if (typeof previewItem.tileAuraGainAmount === 'number' && previewItem.tileAuraGainAmount > 0) {
    lines.push(`立即效果：当前地块灵力 +${formatDisplayInteger(previewItem.tileAuraGainAmount)}`);
  }
  if (previewItem.mapUnlockId || (previewItem.mapUnlockIds?.length ?? 0) > 0) {
    lines.push('使用效果：永久解锁对应地图');
  }

  return lines;
}

/** describeItemEffectDetails：处理describe物品效果详情。 */
export function describeItemEffectDetails(item: ItemStack): string[] {
  const previewItem = resolvePreviewItem(item);
  if (previewItem.effects?.length) {
    return previewItem.effects.flatMap((effect) => buildPlainEffectSummary(effect));
  }
  return buildConsumableEffectDetails(previewItem);
}

/** buildEquipmentComparisonAsideCard：构建Equipment Comparison Aside卡片。 */
function buildEquipmentComparisonAsideCard(item: ItemStack): SkillTooltipAsideCard {
  const previewItem = resolvePreviewItem(item);
  const staticLines = describeBuffStats(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats);
  const effectLines = (previewItem.effects ?? []).flatMap((effect) => buildPlainEffectSummary(effect));
  return {
    mark: '装',
    title: '已装备',
    lines: [
      previewItem.name,
      ...(previewItem.equipSlot ? [`部位：${getEquipSlotLabel(previewItem.equipSlot)}`] : []),
      ...(staticLines.length > 0 ? [`静态词条：${staticLines.join('，')}`] : []),
      ...effectLines,
    ],
    tone: 'buff',
  };
}

/** buildItemTooltipPayload：构建物品提示载荷。 */
export function buildItemTooltipPayload(item: ItemStack, context?: ItemTooltipContext): ItemTooltipPayload {
  const previewItem = resolvePreviewItem(item);
  const sourceListHtml = renderItemSourceListHtml(previewItem.itemId, { maxEntries: 3, compact: true });
  const statusLabel = resolveItemStatusLabel(previewItem, context);
  const medicineCategoryLabel = resolveMedicineCategoryLabel(previewItem);
  if (previewItem.type !== 'equipment') {
    const effectLines = previewItem.effects?.length
      ? previewItem.effects.flatMap((effect) => buildPlainEffectSummary(effect))
      : buildConsumableEffectDetails(previewItem, context?.itemCooldown);
    const lines = [
      `<span class="skill-tooltip-desc">${escapeHtml(previewItem.desc ?? '')}</span>`,
      renderPlainLine('类型', getItemTypeLabel(previewItem.type)),
      ...(medicineCategoryLabel ? [renderPlainLine('分类', medicineCategoryLabel)] : []),
      ...(statusLabel ? [renderPlainLine('状态', statusLabel)] : []),
      ...effectLines.map((line) => `<span class="skill-tooltip-detail">${escapeHtml(line)}</span>`),
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
    ...(statusLabel ? [renderPlainLine('状态', statusLabel)] : []),
    ...(staticLines.length > 0 ? [renderPlainLine('静态词条', staticLines.join('，'))] : []),
    ...effectSummaries.flatMap((entry) => entry.lines),
    `<div class="inventory-source-block"><span class="skill-tooltip-label">来源：</span>${sourceListHtml}</div>`,
  ];
  const asideCards = effectSummaries
    .map((entry) => entry.asideCard)
    .filter((entry): entry is SkillTooltipAsideCard => Boolean(entry));
  if (context?.equippedItem && context.equippedItem.equipSlot === previewItem.equipSlot) {
    asideCards.unshift(buildEquipmentComparisonAsideCard(context.equippedItem));
  }

  return {
    title: previewItem.name,
    lines,
    asideCards,
    allowHtml: true,
  };
}

/** buildEquipmentTooltipContent：构建Equipment提示Content。 */
export function buildEquipmentTooltipContent(item: ItemStack, context?: ItemTooltipContext): SkillTooltipContent {
  const payload = buildItemTooltipPayload(item, context);
  return {
    lines: payload.lines,
    asideCards: payload.asideCards,
  };
}


