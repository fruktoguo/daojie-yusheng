/**
 * 装备提示框内容构建器
 * 复用技能提示框的富文本与 Buff 侧栏卡片表现，展示装备词条与特效。
 */

import {
  ELEMENT_KEY_LABELS,
  EquipmentEffectDef,
  GAME_TIME_PHASES,
  applyEquipmentAttributeEffectivenessToItemStack,
  formatBuffMaxStacks,
  getEquipmentAttributeEffectivenessBreakdown,
  ItemStack,
  type MaterialCategory,
  parseQiResourceKey,
} from '@mud/shared';
import {
  getEntityKindLabel,
  getEquipSlotLabel,
  getItemTypeLabel,
  getTechniqueGradeLabel,
} from '../domain-labels';
import { renderItemSourceListHtml } from '../content/item-sources';
import { getCachedMapMeta } from '../map-static-cache';
import {
  getLocalRealmLevelEntry,
  getLocalTechniqueTemplate,
  resolvePreviewItem,
  resolveTechniqueIdFromBookItemId,
} from '../content/local-templates';
import { SkillTooltipAsideCard, SkillTooltipContent } from './skill-tooltip';
import { describePreviewBonuses } from './stat-preview';
import { formatTechniqueCumulativeBonusSummary } from './technique-bonus-summary';
import { formatDisplayInteger, formatDisplayNumber, formatDisplayPercent } from '../utils/number';
import { t } from './i18n';

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

/** resolveQiElementLabel：解析灵气元素标签。 */
function resolveQiElementLabel(element: string): string {
  switch (element) {
    case 'metal':
      return t('equipment-tooltip.element.metal', undefined);
    case 'wood':
      return t('equipment-tooltip.element.wood', undefined);
    case 'water':
      return t('equipment-tooltip.element.water', undefined);
    case 'fire':
      return t('equipment-tooltip.element.fire', undefined);
    case 'earth':
      return t('equipment-tooltip.element.earth', undefined);
    default:
      return t('equipment-tooltip.element.none', undefined);
  }
}

/** resolveQiFamilyLabel：解析灵气族标签。 */
function resolveQiFamilyLabel(family: string): string {
  switch (family) {
    case 'sha':
      return t('equipment-tooltip.qi-family.sha', undefined);
    case 'demonic':
      return t('equipment-tooltip.qi-family.demonic', undefined);
    default:
      return t('equipment-tooltip.qi-family.aura', undefined);
  }
}

/** resolveTileResourceGainLabel：解析地块资源增益标签。 */
function resolveTileResourceGainLabel(resourceKey: string): string {
  const parsed = parseQiResourceKey(resourceKey);
  if (!parsed) {
    return t('equipment-tooltip.tile-resource.unknown', { resourceKey });
  }
  if (parsed.family === 'aura' && parsed.form === 'refined' && parsed.element === 'neutral') {
    return t('equipment-tooltip.tile-resource.aura', undefined);
  }
  const familyLabel = resolveQiFamilyLabel(parsed.family);
  const elementLabel = resolveQiElementLabel(parsed.element);
  const formLabel = parsed.form === 'dispersed' ? t('equipment-tooltip.qi-form.dispersed', undefined) : t('equipment-tooltip.qi-form.refined', undefined);
  return t('equipment-tooltip.tile-resource.qi', { element: elementLabel, form: formLabel, family: familyLabel });
}

/** resolveMedicineCategoryLabel：解析Medicine Category标签。 */
function resolveMedicineCategoryLabel(item: ItemStack): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const tags = item.tags ?? [];
  const labels: string[] = [];
  const materialCategoryLabel = getMaterialCategoryLabel(item.materialCategory);
  if (materialCategoryLabel) {
    labels.push(materialCategoryLabel);
  }
  if (tags.includes('生命回复')) {
    labels.push(t('equipment-tooltip.medicine-category.hp', undefined));
  }
  if (tags.includes('灵力回复') && !labels.includes(t('equipment-tooltip.medicine-category.qi', undefined))) {
    labels.push(t('equipment-tooltip.medicine-category.qi', undefined));
  }
  if (tags.includes('增益') && !labels.includes(t('equipment-tooltip.medicine-category.buff', undefined))) {
    labels.push(t('equipment-tooltip.medicine-category.buff', undefined));
  }
  if (tags.includes('特殊') && !labels.includes(t('equipment-tooltip.medicine-category.special', undefined))) {
    labels.push(t('equipment-tooltip.medicine-category.special', undefined));
  }
  if (tags.includes('药材') && !labels.includes(t('equipment-tooltip.material.herb', undefined))) {
    labels.push(t('equipment-tooltip.material.herb', undefined));
  }
  if (tags.includes('异材') && !labels.includes(t('equipment-tooltip.material.exotic', undefined))) {
    labels.push(t('equipment-tooltip.material.exotic', undefined));
  }
  return labels.length > 0 ? labels.join(' / ') : null;
}

function getMaterialCategoryLabel(category: MaterialCategory | undefined): string | null {
  switch (category) {
    case 'herb':
      return t('equipment-tooltip.material.herb', undefined);
    case 'exotic':
      return t('equipment-tooltip.material.exotic', undefined);
    case 'ore':
      return t('equipment-tooltip.material.ore', undefined);
    default:
      return null;
  }
}

export function describeMaterialValueDetails(item: ItemStack): string[] {
  const previewItem = resolvePreviewItem(item);
  const elementValues = previewItem.materialValues?.elements;
  if (!elementValues) {
    return [];
  }
  const parts = (['metal', 'wood', 'water', 'fire', 'earth'] as const)
    .flatMap((element) => {
      const value = elementValues[element];
      return typeof value === 'number' && value > 0
        ? [`${ELEMENT_KEY_LABELS[element]} ${formatDisplayInteger(value)}`]
        : [];
    });
  return parts.length > 0 ? [t('equipment-tooltip.material-values.elements', { values: parts.join(' / ') })] : [];
}

/** normalizeBuffMark：规范化Buff Mark。 */
function normalizeBuffMark(name: string, shortMark?: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const value = shortMark?.trim();
  if (value) return [...value][0] ?? value;
  return [...name.trim()][0] ?? t('equipment-tooltip.buff.default-mark', undefined);
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
  attrMode?: 'flat' | 'percent',
  statMode?: 'flat' | 'percent',
): string[] {
  return describePreviewBonuses(attrs, stats, valueStats, attrMode, statMode);
}

function describeSpecialStats(specialStats?: ItemStack['equipSpecialStats']): string[] {
  const lines: string[] = [];
  const comprehension = Math.trunc(Number(specialStats?.comprehension ?? 0) || 0);
  const luck = Math.trunc(Number(specialStats?.luck ?? 0) || 0);
  if (comprehension !== 0) {
    lines.push(t('equipment-tooltip.special.comprehension', { value: `${comprehension > 0 ? '+' : ''}${formatDisplayInteger(comprehension)}` }));
  }
  if (luck !== 0) {
    lines.push(t('equipment-tooltip.special.luck', { value: `${luck > 0 ? '+' : ''}${formatDisplayInteger(luck)}` }));
  }
  return lines;
}

/** getTimePhaseLabel：读取时段标签。 */
function getTimePhaseLabel(phaseId: string): string {
  return GAME_TIME_PHASES.find((entry) => entry.id === phaseId)?.label ?? phaseId;
}

/** getMapLabel：读取地图标签。 */
function getMapLabel(mapId: string): string {
  return getCachedMapMeta(mapId)?.name ?? t('minimap.catalog.unknown-region', undefined);
}

/** getConditionTargetKindLabel：读取条件目标类型标签。 */
function getConditionTargetKindLabel(kind: 'monster' | 'player' | 'tile'): string {
  if (kind === 'tile') {
    return t('equipment-tooltip.target-kind.tile', undefined);
  }
  return getEntityKindLabel(kind, kind);
}

/** formatEquipmentConditionText：格式化装备条件文本。 */
export function formatEquipmentConditionText(effect: EquipmentEffectDef): string[] {
  const conditions = effect.conditions?.items ?? [];
  return conditions.map((condition) => {
    switch (condition.type) {
      case 'time_segment':
        return t('equipment-tooltip.condition.time', { value: condition.in.map((entry) => getTimePhaseLabel(entry)).join(' / ') });
      case 'map':
        return t('equipment-tooltip.condition.map', { value: condition.mapIds.map((entry) => getMapLabel(entry)).join(' / ') });
      case 'hp_ratio':
        return t('equipment-tooltip.condition.hp-ratio', { op: condition.op, value: formatDisplayPercent(condition.value * 100) });
      case 'qi_ratio':
        return t('equipment-tooltip.condition.qi-ratio', { op: condition.op, value: formatDisplayPercent(condition.value * 100) });
      case 'is_cultivating':
        return condition.value ? t('equipment-tooltip.condition.cultivating', undefined) : t('equipment-tooltip.condition.not-cultivating', undefined);
      case 'has_buff':
        return t('equipment-tooltip.condition.has-buff', { buffId: condition.buffId, stacks: condition.minStacks ? t('equipment-tooltip.condition.min-stacks', { stacks: condition.minStacks }) : '' });
      case 'target_kind':
        return t('equipment-tooltip.condition.target-kind', { value: condition.in.map((entry) => getConditionTargetKindLabel(entry)).join(' / ') });
      default:
        return '';
    }
  }).filter((entry) => entry.length > 0);
}

/** formatTriggerLabel：格式化Trigger标签。 */
function formatTriggerLabel(trigger: EquipmentEffectDef extends infer _T ? string : never): string {
  const labels: Record<string, string> = {
    on_equip: t('equipment-tooltip.trigger.on-equip', undefined),
    on_unequip: t('equipment-tooltip.trigger.on-unequip', undefined),
    on_tick: t('equipment-tooltip.trigger.on-tick', undefined),
    on_move: t('equipment-tooltip.trigger.on-move', undefined),
    on_attack: t('equipment-tooltip.trigger.on-attack', undefined),
    on_hit: t('equipment-tooltip.trigger.on-hit', undefined),
    on_kill: t('equipment-tooltip.trigger.on-kill', undefined),
    on_skill_cast: t('equipment-tooltip.trigger.on-skill-cast', undefined),
    on_cultivation_tick: t('equipment-tooltip.trigger.on-cultivation-tick', undefined),
    on_time_segment_changed: t('equipment-tooltip.trigger.on-time-segment-changed', undefined),
    on_enter_map: t('equipment-tooltip.trigger.on-enter-map', undefined),
  };
  return labels[trigger] ?? trigger;
}

/** buildTimedBuffAsideCard：构建Timed Buff Aside卡片。 */
function buildTimedBuffAsideCard(effect: Extract<EquipmentEffectDef, {
/**
 * type：type相关字段。
 */
 type: 'timed_buff' }>): SkillTooltipAsideCard {
  const stackLimit = formatBuffMaxStacks(effect.buff.maxStacks);
  const stackText = stackLimit ? t('equipment-tooltip.buff.stack-limit.suffix', { stackLimit }) : '';
  const conditionLines = formatEquipmentConditionText(effect);
  const buffLines = describeBuffStats(effect.buff.attrs, effect.buff.stats, effect.buff.valueStats, effect.buff.attrMode ?? 'percent', effect.buff.statMode ?? 'percent');
  const lines = [
    t('equipment-tooltip.timed-buff.meta', { trigger: formatTriggerLabel(effect.trigger), target: effect.target === 'target' ? t('equipment-tooltip.target.enemy', undefined) : t('equipment-tooltip.target.self', undefined), duration: formatDisplayInteger(effect.buff.duration), stack: stackText }),
    ...(effect.cooldown !== undefined ? [t('equipment-tooltip.cooldown.line', { cooldown: formatDisplayInteger(effect.cooldown) })] : []),
    ...(effect.chance !== undefined ? [t('equipment-tooltip.chance.line', { chance: formatDisplayPercent(effect.chance * 100) })] : []),
    ...(conditionLines.length > 0 ? [t('equipment-tooltip.condition.line', { conditions: conditionLines.join('，') })] : []),
    ...(buffLines.length > 0 ? [t('equipment-tooltip.effect.line', { effects: buffLines.join('，') })] : []),
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
function buildEffectSummary(effect: EquipmentEffectDef): {
/**
 * lines：line相关字段。
 */
 lines: string[];
 /**
 * asideCard：asideCard相关字段。
 */
 asideCard?: SkillTooltipAsideCard } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const conditionLines = formatEquipmentConditionText(effect);
  switch (effect.type) {
    case 'stat_aura': {
      const effectLines = describeBuffStats(effect.attrs, effect.stats, effect.valueStats, effect.attrMode, effect.statMode);
      return {
        lines: [
          renderPlainLine(t('equipment-tooltip.label.stat-aura', undefined), effectLines.length > 0 ? effectLines.join('，') : t('equipment-tooltip.effect.no-change', undefined)),
          ...(conditionLines.length > 0 ? [renderPlainLine(t('equipment-tooltip.label.conditions', undefined), conditionLines.join('，'))] : []),
        ],
      };
    }
    case 'progress_boost': {
      const effectLines = describeBuffStats(effect.attrs, effect.stats, effect.valueStats, effect.attrMode, effect.statMode);
      return {
        lines: [
          renderPlainLine(t('equipment-tooltip.label.progress-boost', undefined), effectLines.length > 0 ? effectLines.join('，') : t('equipment-tooltip.effect.no-change', undefined)),
          ...(conditionLines.length > 0 ? [renderPlainLine(t('equipment-tooltip.label.conditions', undefined), conditionLines.join('，'))] : []),
        ],
      };
    }
    case 'periodic_cost': {
      const modeLabel = effect.mode === 'flat'
        ? `${formatDisplayNumber(effect.value)}`
      : effect.mode === 'max_ratio_bp'
          ? t('equipment-tooltip.periodic-cost.max-ratio', { value: formatDisplayPercent(effect.value / 100), resource: effect.resource === 'hp' ? t('equipment-tooltip.resource.hp', undefined) : t('equipment-tooltip.resource.qi', undefined) })
          : t('equipment-tooltip.periodic-cost.current-ratio', { value: formatDisplayPercent(effect.value / 100), resource: effect.resource === 'hp' ? t('equipment-tooltip.resource.hp', undefined) : t('equipment-tooltip.resource.qi', undefined) });
      return {
        lines: [
          renderPlainLine(t('equipment-tooltip.label.periodic-cost', undefined), t('equipment-tooltip.periodic-cost.value', { trigger: effect.trigger === 'on_cultivation_tick' ? t('equipment-tooltip.trigger.each-cultivation-tick', undefined) : t('equipment-tooltip.trigger.each-tick', undefined), value: modeLabel })),
          ...(conditionLines.length > 0 ? [renderPlainLine(t('equipment-tooltip.label.conditions', undefined), conditionLines.join('，'))] : []),
        ],
      };
    }
    case 'timed_buff': {
      const stackLimit = formatBuffMaxStacks(effect.buff.maxStacks);
      const stackText = stackLimit ? t('equipment-tooltip.buff.stack-limit.comma', { stackLimit }) : '';
      const meta: string[] = [
        formatTriggerLabel(effect.trigger),
        effect.target === 'target' ? t('equipment-tooltip.target.enemy', undefined) : t('equipment-tooltip.target.self', undefined),
        t('equipment-tooltip.duration.with-stack', { duration: formatDisplayInteger(effect.buff.duration), stack: stackText }),
      ];
      if (effect.cooldown !== undefined) meta.push(t('equipment-tooltip.cooldown.meta', { cooldown: formatDisplayInteger(effect.cooldown) }));
      if (effect.chance !== undefined) meta.push(formatDisplayPercent(effect.chance * 100));
      return {
        lines: [
          renderLabelLine(
            t('equipment-tooltip.label.timed-buff', undefined),
            `${buildBuffInlineBadge(effect.buff.name, effect.buff.shortMark, effect.buff.category)}<span class="skill-tooltip-buff-meta">${escapeHtml(` ${meta.join(' · ')}`)}</span>`,
          ),
          ...(conditionLines.length > 0 ? [renderPlainLine(t('equipment-tooltip.label.trigger-conditions', undefined), conditionLines.join('，'))] : []),
        ],
        asideCard: buildTimedBuffAsideCard(effect),
      };
    }
  }
}

/** ItemTooltipPayload：物品提示框载荷。 */
export interface ItemTooltipPayload {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * lines：line相关字段。
 */

  lines: string[];  
  /**
 * asideCards：asideCard相关字段。
 */

  asideCards: SkillTooltipAsideCard[];  
  /**
 * allowHtml：allowHtml相关字段。
 */

  allowHtml: boolean;
}

/** ItemTooltipCooldownState：物品冷却显示状态。 */
export interface ItemTooltipCooldownState {
/**
 * cooldown：冷却相关字段。
 */

  cooldown: number;  
  /**
 * cooldownLeft：冷却Left相关字段。
 */

  cooldownLeft: number;
}

/** ItemTooltipContext：物品提示预览上下文。 */
export interface ItemTooltipContext {
/**
 * learnedTechniqueIds：learned功法ID相关字段。
 */

  learnedTechniqueIds?: ReadonlySet<string>;  
  /**
 * unlockedMinimapIds：unlockedMinimapID相关字段。
 */

  unlockedMinimapIds?: ReadonlySet<string>;  
  /**
 * equippedItem：equipped道具相关字段。
 */

  equippedItem?: ItemStack | null;  
  /**
 * itemCooldown：道具冷却相关字段。
 */

  itemCooldown?: ItemTooltipCooldownState | null;
  /** playerRealmLv：用于预览装备属性生效率。 */
  playerRealmLv?: number | null;
}

/** isMapUnlockItemRead：判断是否地图解锁物品Read。 */
function isMapUnlockItemRead(item: Pick<ItemStack, 'mapUnlockId' | 'mapUnlockIds'>, unlockedMinimapIds?: ReadonlySet<string>): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const itemCooldown = context?.itemCooldown;
  const activeCooldown: ItemTooltipCooldownState | null = itemCooldown !== null && itemCooldown !== undefined && itemCooldown.cooldownLeft > 0
    ? itemCooldown
    : null;
  if (activeCooldown) {
    return t('equipment-tooltip.status.cooldown', { cooldown: formatDisplayInteger(activeCooldown.cooldownLeft) });
  }
  if (item.type === 'skill_book') {
    const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
    if (techniqueId && context?.learnedTechniqueIds?.has(techniqueId)) {
      return t('equipment-tooltip.status.learned', undefined);
    }
  }
  if (isMapUnlockItemRead(item, context?.unlockedMinimapIds)) {
    return t('equipment-tooltip.status.read', undefined);
  }
  return null;
}

/** buildPlainEffectSummary：构建Plain效果摘要。 */
function buildPlainEffectSummary(effect: EquipmentEffectDef): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const conditionLines = formatEquipmentConditionText(effect);
  switch (effect.type) {
    case 'stat_aura': {
      const effectLines = describeBuffStats(effect.attrs, effect.stats, effect.valueStats, effect.attrMode, effect.statMode);
      return [
        t('equipment-tooltip.plain.stat-aura', { value: effectLines.length > 0 ? effectLines.join('，') : t('equipment-tooltip.effect.no-change', undefined) }),
        ...(conditionLines.length > 0 ? [t('equipment-tooltip.plain.conditions', { value: conditionLines.join('，') })] : []),
      ];
    }
    case 'progress_boost': {
      const effectLines = describeBuffStats(effect.attrs, effect.stats, effect.valueStats, effect.attrMode, effect.statMode);
      return [
        t('equipment-tooltip.plain.progress-boost', { value: effectLines.length > 0 ? effectLines.join('，') : t('equipment-tooltip.effect.no-change', undefined) }),
        ...(conditionLines.length > 0 ? [t('equipment-tooltip.plain.conditions', { value: conditionLines.join('，') })] : []),
      ];
    }
    case 'periodic_cost': {
      const modeLabel = effect.mode === 'flat'
        ? `${formatDisplayNumber(effect.value)}`
        : effect.mode === 'max_ratio_bp'
          ? t('equipment-tooltip.periodic-cost.max-ratio', { value: formatDisplayPercent(effect.value / 100), resource: effect.resource === 'hp' ? t('equipment-tooltip.resource.life', undefined) : t('equipment-tooltip.resource.qi', undefined) })
          : t('equipment-tooltip.periodic-cost.current-ratio', { value: formatDisplayPercent(effect.value / 100), resource: effect.resource === 'hp' ? t('equipment-tooltip.resource.life', undefined) : t('equipment-tooltip.resource.qi', undefined) });
      return [
        t('equipment-tooltip.plain.periodic-cost', { trigger: effect.trigger === 'on_cultivation_tick' ? t('equipment-tooltip.trigger.each-cultivation-tick', undefined) : t('equipment-tooltip.trigger.each-tick', undefined), value: modeLabel }),
        ...(conditionLines.length > 0 ? [t('equipment-tooltip.plain.conditions', { value: conditionLines.join('，') })] : []),
      ];
    }
    case 'timed_buff': {
      const stackLimit = formatBuffMaxStacks(effect.buff.maxStacks);
      const meta = [
        formatTriggerLabel(effect.trigger),
        effect.target === 'target' ? t('equipment-tooltip.target.enemy', undefined) : t('equipment-tooltip.target.self', undefined),
        t('equipment-tooltip.duration.with-stack', { duration: formatDisplayInteger(effect.buff.duration), stack: stackLimit ? t('equipment-tooltip.buff.stack-limit.comma', { stackLimit }) : '' }),
        ...(effect.cooldown !== undefined ? [t('equipment-tooltip.cooldown.meta', { cooldown: formatDisplayInteger(effect.cooldown) })] : []),
        ...(effect.chance !== undefined ? [formatDisplayPercent(effect.chance * 100)] : []),
      ];
      return [
        t('equipment-tooltip.plain.timed-buff', { name: effect.buff.name, meta: meta.join(' · ') }),
        ...(conditionLines.length > 0 ? [t('equipment-tooltip.plain.trigger-conditions', { value: conditionLines.join('，') })] : []),
      ];
    }
  }
}

/** buildConsumableEffectDetails：构建Consumable效果详情。 */
function buildConsumableEffectDetails(item: ItemStack, itemCooldown?: ItemTooltipCooldownState | null): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const previewItem = resolvePreviewItem(item);
  if (previewItem.type !== 'consumable') {
    return [];
  }

  const lines: string[] = [];
  const activeCooldown: ItemTooltipCooldownState | null = itemCooldown !== null && itemCooldown !== undefined && itemCooldown.cooldownLeft > 0
    ? itemCooldown
    : null;
  if (activeCooldown) {
    lines.push(t('equipment-tooltip.consumable.active-cooldown', { left: formatDisplayInteger(activeCooldown.cooldownLeft), cooldown: formatDisplayInteger(activeCooldown.cooldown) }));
  }
  if (typeof previewItem.cooldown === 'number' && previewItem.cooldown > 0) {
    lines.push(t('equipment-tooltip.consumable.cooldown', { cooldown: formatDisplayInteger(previewItem.cooldown) }));
  }
  const instantParts: string[] = [];
  if (typeof previewItem.healAmount === 'number' && previewItem.healAmount > 0) {
    instantParts.push(t('equipment-tooltip.consumable.heal-amount', { amount: formatDisplayInteger(previewItem.healAmount) }));
  }
  if (typeof previewItem.healPercent === 'number' && previewItem.healPercent > 0) {
    instantParts.push(t('equipment-tooltip.consumable.heal-percent', { percent: formatDisplayPercent(previewItem.healPercent * 100) }));
  }
  if (typeof previewItem.qiPercent === 'number' && previewItem.qiPercent > 0) {
    instantParts.push(t('equipment-tooltip.consumable.qi-percent', { percent: formatDisplayPercent(previewItem.qiPercent * 100) }));
  }
  if (instantParts.length > 0) {
    lines.push(t('equipment-tooltip.consumable.instant', { value: instantParts.join('，') }));
  }

  for (const buff of previewItem.consumeBuffs ?? []) {
    const metaParts = [t('equipment-tooltip.consumable.buff-duration', { duration: formatDisplayInteger(buff.duration) })];
    if (typeof buff.maxStacks === 'number' && buff.maxStacks > 1) {
      metaParts.push(t('equipment-tooltip.consumable.buff-max-stacks', { stacks: formatDisplayInteger(buff.maxStacks) }));
    }
    lines.push(t('equipment-tooltip.consumable.buff', { name: buff.name, meta: metaParts.length > 0 ? `，${metaParts.join('，')}` : '' }));
    const bonusLines = describeBuffStats(buff.attrs, buff.stats, buff.valueStats, buff.attrMode ?? 'percent', buff.statMode ?? 'percent');
    if (bonusLines.length > 0) {
      lines.push(t('equipment-tooltip.effect.line', { effects: bonusLines.join('，') }));
    }
    if (bonusLines.length === 0 && buff.desc?.trim()) {
      lines.push(t('equipment-tooltip.desc.line', { desc: buff.desc.trim() }));
    }
  }

  if (Array.isArray(previewItem.tileResourceGains) && previewItem.tileResourceGains.length > 0) {
    for (const gain of previewItem.tileResourceGains) {
      if (typeof gain.amount !== 'number' || gain.amount <= 0) {
        continue;
      }
      lines.push(t('equipment-tooltip.consumable.instant-resource', { resource: resolveTileResourceGainLabel(gain.resourceKey), amount: formatDisplayInteger(gain.amount) }));
    }
  } else if (typeof previewItem.tileAuraGainAmount === 'number' && previewItem.tileAuraGainAmount > 0) {
    lines.push(t('equipment-tooltip.consumable.instant-resource', { resource: t('equipment-tooltip.tile-resource.aura', undefined), amount: formatDisplayInteger(previewItem.tileAuraGainAmount) }));
  }
  if (previewItem.mapUnlockId || (previewItem.mapUnlockIds?.length ?? 0) > 0) {
    lines.push(t('equipment-tooltip.consumable.unlock-map', undefined));
  }
  if (previewItem.respawnBindMapId) {
    lines.push(t('equipment-tooltip.consumable.bind-respawn', undefined));
  }

  return lines;
}

/** describeItemEffectDetails：处理describe物品效果详情。 */
export function describeItemEffectDetails(item: ItemStack): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const previewItem = resolvePreviewItem(item);
  if (previewItem.effects?.length) {
    return previewItem.effects.flatMap((effect) => buildPlainEffectSummary(effect));
  }
  return buildConsumableEffectDetails(previewItem);
}

/** describeEquipmentUtilityBonuses：整理装备功能性词条。 */
export function describeEquipmentUtilityBonuses(item: ItemStack): string[] {
  const lines: string[] = [];
  const formatSignedRate = (value: number): string => `${value > 0 ? '+' : ''}${formatDisplayPercent(value * 100)}`;
  const craftLabel = item.tags?.includes('forging_tool') && !item.tags?.includes('alchemy_furnace') ? t('equipment-tooltip.craft.forging', undefined) : t('equipment-tooltip.craft.alchemy', undefined);
  if (typeof item.alchemySpeedRate === 'number' && item.alchemySpeedRate !== 0) {
    lines.push(t('equipment-tooltip.utility.speed', { craft: craftLabel, value: formatSignedRate(item.alchemySpeedRate) }));
  }
  if (typeof item.alchemySuccessRate === 'number' && item.alchemySuccessRate !== 0) {
    lines.push(t('equipment-tooltip.utility.success', { craft: craftLabel, value: formatSignedRate(item.alchemySuccessRate) }));
  }
  if (typeof item.enhancementSpeedRate === 'number' && item.enhancementSpeedRate !== 0) {
    lines.push(t('equipment-tooltip.utility.enhancement-speed', { value: formatSignedRate(item.enhancementSpeedRate) }));
  }
  if (typeof item.enhancementSuccessRate === 'number' && item.enhancementSuccessRate !== 0) {
    lines.push(t('equipment-tooltip.utility.enhancement-success', { value: formatSignedRate(item.enhancementSuccessRate) }));
  }
  if (typeof item.miningDamageRate === 'number' && item.miningDamageRate !== 0) {
    lines.push(t('equipment-tooltip.utility.mining-damage', { value: formatSignedRate(item.miningDamageRate) }));
  }
  return lines;
}

function formatEquipmentEffectivenessPercent(value: number): string {
  return formatDisplayPercent(value, { maximumFractionDigits: 2 });
}

/** describeEquipmentEffectivenessSummary：整理装备属性总百分比和有效算子。 */
function describeEquipmentEffectivenessSummary(item: ItemStack, playerRealmLv?: number | null): string | null {
  const previewItem = resolvePreviewItem(item);
  if (previewItem.type !== 'equipment') {
    return null;
  }
  const breakdown = getEquipmentAttributeEffectivenessBreakdown(previewItem, playerRealmLv);
  const factors: string[] = [];
  if (breakdown.enhancementPercent !== 100) {
    factors.push(t('equipment-tooltip.effectiveness.factor.enhancement', {
      value: formatEquipmentEffectivenessPercent(breakdown.enhancementPercent),
    }));
  }
  if (breakdown.realmPercent !== 100) {
    factors.push(t('equipment-tooltip.effectiveness.factor.realm-low', {
      value: formatEquipmentEffectivenessPercent(breakdown.realmPercent),
    }));
  }
  return t('equipment-tooltip.effectiveness.summary', {
    value: formatEquipmentEffectivenessPercent(breakdown.effectivePercent),
    factors: factors.length > 0 ? `(${factors.join('x')})` : '',
  });
}

/** describeEquipmentAttributeEffectiveness：整理装备属性生效率。 */
export function describeEquipmentAttributeEffectiveness(item: ItemStack, playerRealmLv?: number | null): string | null {
  return describeEquipmentEffectivenessSummary(item, playerRealmLv);
}

export function describeEquipmentBonuses(item: ItemStack, playerRealmLv?: number | null): string[] {
  const previewItem = applyEquipmentAttributeEffectivenessToItemStack(resolvePreviewItem(item), playerRealmLv);
  return [
    ...describeBuffStats(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats),
    ...describeSpecialStats(previewItem.equipSpecialStats),
    ...describeEquipmentUtilityBonuses(previewItem),
  ];
}

function renderEquipmentBonusPill(line: string): string {
  const trimmed = line.trim();
  const match = trimmed.match(/^(.+?)\s+([+-].+)$/u);
  const label = match?.[1]?.trim() || trimmed;
  const value = match?.[2]?.trim() || '';
  return `<span class="equipment-tooltip-stat-pill"><span class="equipment-tooltip-stat-name">${escapeHtml(label)}</span>${value ? `<span class="equipment-tooltip-stat-value">${escapeHtml(value)}</span>` : ''}</span>`;
}

function renderEquipmentBonusList(lines: string[]): string | null {
  if (lines.length === 0) {
    return null;
  }
  return `<div class="equipment-tooltip-stat-list">${lines.map((line) => renderEquipmentBonusPill(line)).join('')}</div>`;
}

function renderEquipmentAttributeBlock(item: ItemStack, playerRealmLv?: number | null): string | null {
  const effectivenessLine = describeEquipmentEffectivenessSummary(item, playerRealmLv);
  const propertyLines = describeEquipmentBonuses(item, playerRealmLv);
  if (!effectivenessLine && propertyLines.length === 0) {
    return null;
  }
  const bonusList = renderEquipmentBonusList(propertyLines);
  return `<div class="equipment-tooltip-attribute-block">${
    effectivenessLine ? `<div class="equipment-tooltip-effectiveness">${renderLabelLine(t('equipment-tooltip.label.equipment-attrs', undefined), escapeHtml(effectivenessLine))}</div>` : ''
  }${bonusList ?? ''}</div>`;
}

/** buildEquipmentComparisonAsideCard：构建Equipment Comparison Aside卡片。 */
function buildEquipmentComparisonAsideCard(item: ItemStack, playerRealmLv?: number | null): SkillTooltipAsideCard {
  const previewItem = resolvePreviewItem(item);
  const enhancedPreviewItem = applyEquipmentAttributeEffectivenessToItemStack(previewItem, playerRealmLv);
  const propertyLines = describeEquipmentBonuses(previewItem, playerRealmLv);
  const effectivenessLine = describeEquipmentAttributeEffectiveness(previewItem, playerRealmLv);
  const effectLines = (enhancedPreviewItem.effects ?? []).flatMap((effect) => buildPlainEffectSummary(effect));
  return {
    mark: t('equipment-tooltip.equipped.mark', undefined),
    title: t('equipment-tooltip.equipped.title', undefined),
    lines: [
      enhancedPreviewItem.name,
      ...(enhancedPreviewItem.equipSlot ? [t('equipment-tooltip.equipped.slot', { slot: getEquipSlotLabel(enhancedPreviewItem.equipSlot) })] : []),
      ...(effectivenessLine ? [effectivenessLine] : []),
      ...(propertyLines.length > 0 ? [t('equipment-tooltip.equipped.attrs', { attrs: propertyLines.join('，') })] : []),
      ...effectLines,
    ],
    tone: 'buff',
  };
}

/** buildTechniqueBookTooltipLines：构建功法书 tooltip 行。 */
function buildTechniqueBookTooltipLines(item: ItemStack): string[] {
  const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
  if (!techniqueId) {
    return [];
  }
  const technique = getLocalTechniqueTemplate(techniqueId);
  if (!technique) {
    return [];
  }
  const realmLabel = technique.realmLv
    ? (getLocalRealmLevelEntry(technique.realmLv)?.displayName ?? `Lv.${formatDisplayInteger(technique.realmLv)}`)
    : t('equipment-tooltip.value.unknown', undefined);
  const maxLevel = Math.max(
    1,
    ...((technique.layers ?? []).map((layer) => Math.max(1, Math.floor(layer.level)))),
  );
  const skillNames = (technique.skills ?? [])
    .map((skill) => skill.name.trim())
    .filter((name) => name.length > 0);
  return [
    renderPlainLine(t('equipment-tooltip.technique-book.technique', undefined), technique.name),
    renderPlainLine(t('equipment-tooltip.technique-book.desc', undefined), item.desc?.trim() || t('equipment-tooltip.technique-book.no-desc', undefined)),
    renderPlainLine(t('equipment-tooltip.technique-book.realm', undefined), realmLabel),
    renderPlainLine(t('equipment-tooltip.technique-book.grade', undefined), getTechniqueGradeLabel(technique.grade)),
    renderPlainLine(t('equipment-tooltip.technique-book.max-attrs', undefined), formatTechniqueCumulativeBonusSummary(maxLevel, technique.layers)),
    renderPlainLine(
      t('equipment-tooltip.technique-book.skills-label', { count: skillNames.length > 0 ? `（${formatDisplayInteger(skillNames.length)}）` : '' }),
      skillNames.length > 0 ? skillNames.join('、') : t('equipment-tooltip.value.none', undefined),
    ),
  ];
}

/** buildItemTooltipPayload：构建物品提示载荷。 */
export function buildItemTooltipPayload(item: ItemStack, context?: ItemTooltipContext): ItemTooltipPayload {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const previewItem = resolvePreviewItem(item);
  const sourceListHtml = renderItemSourceListHtml(previewItem.itemId, { maxEntries: 3, compact: true });
  const statusLabel = resolveItemStatusLabel(previewItem, context);
  const medicineCategoryLabel = resolveMedicineCategoryLabel(previewItem);
  if (previewItem.type !== 'equipment') {
    const effectLines = previewItem.effects?.length
      ? previewItem.effects.flatMap((effect) => buildPlainEffectSummary(effect))
      : buildConsumableEffectDetails(previewItem, context?.itemCooldown);
    const techniqueBookLines = previewItem.type === 'skill_book'
      ? buildTechniqueBookTooltipLines(previewItem)
      : [];
    const materialValueLines = previewItem.type === 'material'
      ? describeMaterialValueDetails(previewItem)
      : [];
    const lines = [
      ...(previewItem.type === 'skill_book'
        ? []
        : [`<span class="skill-tooltip-desc">${escapeHtml(previewItem.desc ?? '')}</span>`]),
      renderPlainLine(t('equipment-tooltip.label.type', undefined), getItemTypeLabel(previewItem.type)),
      ...(medicineCategoryLabel ? [renderPlainLine(t('equipment-tooltip.label.category', undefined), medicineCategoryLabel)] : []),
      ...materialValueLines.map((line) => renderPlainLine(t('equipment-tooltip.label.element-values', undefined), line.replace(/^五行：/, ''))),
      ...(statusLabel ? [renderPlainLine(t('equipment-tooltip.label.status', undefined), statusLabel)] : []),
      ...techniqueBookLines,
      ...effectLines.map((line) => `<span class="skill-tooltip-detail">${escapeHtml(line)}</span>`),
      `<div class="inventory-source-block"><span class="skill-tooltip-label">${t('equipment-tooltip.label.source', undefined)}：</span>${sourceListHtml}</div>`,
    ].filter((line) => line.length > 0);
    return {
      title: previewItem.name,
      lines,
      asideCards: [],
      allowHtml: true,
    };
  }

  const enhancedPreviewItem = applyEquipmentAttributeEffectivenessToItemStack(previewItem, context?.playerRealmLv);
  const attributeBlock = renderEquipmentAttributeBlock(previewItem, context?.playerRealmLv);
  const effectSummaries = (enhancedPreviewItem.effects ?? []).map((effect) => buildEffectSummary(effect));
  const lines: string[] = [
    `<span class="skill-tooltip-desc">${escapeHtml(enhancedPreviewItem.desc ?? '')}</span>`,
    renderPlainLine(t('equipment-tooltip.label.type', undefined), getItemTypeLabel(enhancedPreviewItem.type)),
    ...(enhancedPreviewItem.equipSlot ? [renderPlainLine(t('equipment-tooltip.label.slot', undefined), getEquipSlotLabel(enhancedPreviewItem.equipSlot))] : []),
    ...(statusLabel ? [renderPlainLine(t('equipment-tooltip.label.status', undefined), statusLabel)] : []),
    ...(attributeBlock ? [attributeBlock] : []),
    ...effectSummaries.flatMap((entry) => entry.lines),
    `<div class="inventory-source-block"><span class="skill-tooltip-label">${t('equipment-tooltip.label.source', undefined)}：</span>${sourceListHtml}</div>`,
  ];
  const asideCards = effectSummaries
    .map((entry) => entry.asideCard)
    .filter((entry): entry is SkillTooltipAsideCard => Boolean(entry));
  if (context?.equippedItem && context.equippedItem.equipSlot === previewItem.equipSlot) {
    asideCards.unshift(buildEquipmentComparisonAsideCard(context.equippedItem, context.playerRealmLv));
  }

  return {
    title: enhancedPreviewItem.name,
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
