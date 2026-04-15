/**
 * 装备面板
 * 展示 5 个装备槽位的当前装备与词条，支持卸下操作
 */

import { EquipmentEffectDef, EquipmentSlots, EQUIP_SLOTS, EquipSlot, PlayerState } from '@mud/shared';
import { getEquipSlotLabel } from '../../domain-labels';
import { resolvePreviewItem } from '../../content/local-templates';
import { preserveSelection } from '../selection-preserver';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildItemTooltipPayload, describeEquipmentBonuses, formatEquipmentConditionText } from '../equipment-tooltip';
import { describePreviewBonuses } from '../stat-preview';
import { formatDisplayInteger, formatDisplayPercent } from '../../utils/number';

/** formatEffectCondition：格式化输出字符串用于展示。 */
function formatEffectCondition(effect: EquipmentEffectDef): string {
  const parts = formatEquipmentConditionText(effect);
  if (parts.length === 0) {
    return '';
  }
  return parts.length > 0 ? ` [${parts.join('，')}]` : '';
}

/** formatItemEffects：格式化输出字符串用于展示。 */
function formatItemEffects(item: EquipmentSlots[EquipSlot]): string[] {
  const previewItem = item ? resolvePreviewItem(item) : null;
  if (!previewItem?.effects?.length) {
    return [];
  }
  return previewItem.effects.map((effect) => {
    const conditionText = formatEffectCondition(effect);
    switch (effect.type) {
      case 'stat_aura':
      case 'progress_boost': {
        const effectParts = describePreviewBonuses(effect.attrs, effect.stats, effect.valueStats, effect.attrMode, effect.statMode);
        return `特效:${effectParts.join(' / ') || '无数值变化'}${conditionText}`;
      }
      case 'periodic_cost': {
        const modeLabel = effect.mode === 'flat'
          ? `${formatDisplayInteger(effect.value)}`
          : effect.mode === 'max_ratio_bp'
            ? `${formatDisplayPercent(effect.value / 100)} 最大${effect.resource === 'hp' ? '生命' : '灵力'}`
            : `${formatDisplayPercent(effect.value / 100)} 当前${effect.resource === 'hp' ? '生命' : '灵力'}`;
        const triggerLabel = effect.trigger === 'on_cultivation_tick' ? '修炼时每息' : '每息';
        return `代价:${triggerLabel}损失 ${modeLabel}${conditionText}`;
      }
      case 'timed_buff': {
        const triggerMap: Record<string, string> = {
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
        const buffParts = describePreviewBonuses(
          effect.buff.attrs,
          effect.buff.stats,
          effect.buff.valueStats,
          effect.buff.attrMode ?? 'percent',
          effect.buff.statMode ?? 'percent',
        );
        return `触发:${triggerMap[effect.trigger] ?? effect.trigger}获得 ${effect.buff.name} ${effect.buff.duration}息${conditionText}${buffParts.length > 0 ? `，效果:${buffParts.join(' / ')}` : ''}`;
      }
      default:
        return '';
    }
  }).filter((line) => line.length > 0);
}

/** formatItemBonuses：格式化输出字符串用于展示。 */
function formatItemBonuses(item: EquipmentSlots[EquipSlot]): string {
  if (!item) return '暂无词条';
  const previewItem = resolvePreviewItem(item);
  const bonusParts = describeEquipmentBonuses(previewItem);
  const effectParts = formatItemEffects(item);
  const parts = [
    ...bonusParts,
    ...effectParts,
  ];
  return parts.length > 0 ? parts.join(' / ') : '暂无词条';
}

type EquipmentSlotView = {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  item: HTMLSpanElement;
  empty: HTMLSpanElement;
  meta: HTMLSpanElement;
  action: HTMLButtonElement;
};

/** 装备面板：显示5个装备槽位 */
export class EquipmentPanel {
  private pane = document.getElementById('pane-equipment')!;
  private onUnequip: ((slot: EquipSlot) => void) | null = null;
  private lastEquipment: EquipmentSlots | null = null;
  private tooltip = new FloatingTooltip('floating-tooltip equipment-tooltip');
  private tooltipSlot: EquipSlot | null = null;
  private slotViews = new Map<EquipSlot, EquipmentSlotView>();
  private emptyStateEl: HTMLDivElement | null = null;
  private sectionEl: HTMLDivElement | null = null;

/** constructor：初始化实例并完成构造。 */
  constructor() {
    this.ensureTooltipStyle();
    this.bindActionEvents();
    this.bindTooltipEvents();
  }

/** clear：清理并清空临时数据。 */
  clear(): void {
    this.lastEquipment = null;
    this.tooltipSlot = null;
    this.tooltip.hide(true);
    this.slotViews.clear();
    this.sectionEl = null;
    this.emptyStateEl = null;
    this.pane.innerHTML = '<div class="empty-hint">尚未装备任何物品</div>';
  }

  setCallbacks(onUnequip: (slot: EquipSlot) => void): void {
    this.onUnequip = onUnequip;
  }

  /** 更新装备数据并重新渲染 */
  update(equipment: EquipmentSlots): void {
    this.lastEquipment = equipment;
    this.render(equipment);
  }


  initFromPlayer(player: PlayerState): void {
    this.lastEquipment = player.equipment;
    this.render(player.equipment);
  }

/** render：渲染当前界面内容。 */
  private render(equipment: EquipmentSlots): void {
    this.ensureStructure();
    if (!this.sectionEl || !this.emptyStateEl) {
      return;
    }

    const hasAnyEquipment = EQUIP_SLOTS.some((slot) => !!equipment[slot]);
    this.emptyStateEl.hidden = hasAnyEquipment;

    for (const slot of EQUIP_SLOTS) {
      const slotView = this.slotViews.get(slot);
      if (!slotView) {
        continue;
      }
      const item = equipment[slot];
      const hasItem = !!item;
      slotView.root.toggleAttribute('data-equip-tooltip-slot', hasItem);
      if (hasItem) {
        slotView.root.dataset.equipTooltipSlot = slot;
      } else {
        delete slotView.root.dataset.equipTooltipSlot;
      }
      slotView.name.textContent = getEquipSlotLabel(slot);
      slotView.item.textContent = item?.name ?? '';
      slotView.item.hidden = !hasItem;
      slotView.empty.textContent = '空';
      slotView.empty.hidden = hasItem;
      slotView.meta.textContent = hasItem ? formatItemBonuses(item) : '尚未装备';
      slotView.action.hidden = !hasItem;
      slotView.action.disabled = !hasItem;
      slotView.action.dataset.unequip = slot;
    }
  }


  private ensureStructure(): void {
    if (this.sectionEl && this.emptyStateEl && this.slotViews.size === EQUIP_SLOTS.length) {
      return;
    }

    preserveSelection(this.pane, () => {
      this.pane.replaceChildren();
      this.slotViews.clear();

      const sectionEl = document.createElement('div');
      sectionEl.className = 'panel-section';

      const titleEl = document.createElement('div');
      titleEl.className = 'panel-section-title';
      titleEl.textContent = '装备栏';
      sectionEl.append(titleEl);

      const emptyStateEl = document.createElement('div');
      emptyStateEl.className = 'empty-hint';
      emptyStateEl.textContent = '尚未装备任何物品';
      emptyStateEl.hidden = true;
      sectionEl.append(emptyStateEl);

      for (const slot of EQUIP_SLOTS) {
        const slotView = this.createSlotView(slot);
        this.slotViews.set(slot, slotView);
        sectionEl.append(slotView.root);
      }

      this.pane.append(sectionEl);
      this.sectionEl = sectionEl;
      this.emptyStateEl = emptyStateEl;
    });
  }


  private createSlotView(slot: EquipSlot): EquipmentSlotView {
    const root = document.createElement('div');
    root.className = 'equip-slot';

    const copy = document.createElement('div');
    copy.className = 'equip-copy';

    const name = document.createElement('span');
    name.className = 'equip-slot-name';
    name.textContent = getEquipSlotLabel(slot);

    const item = document.createElement('span');
    item.className = 'equip-slot-item';
    item.hidden = true;

    const empty = document.createElement('span');
    empty.className = 'equip-slot-empty';
    empty.textContent = '空';

    const meta = document.createElement('span');
    meta.className = 'equip-slot-meta';
    meta.textContent = '尚未装备';

    const action = document.createElement('button');
    action.className = 'small-btn';
    action.type = 'button';
    action.textContent = '卸下';
    action.hidden = true;
    action.disabled = true;
    action.dataset.unequip = slot;

    copy.append(name, item, empty, meta);
    root.append(copy, action);

    return { root, name, item, empty, meta, action };
  }

/** bindActionEvents：绑定回调。 */
  private bindActionEvents(): void {
    this.pane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest<HTMLButtonElement>('[data-unequip]');
      const slot = button?.dataset.unequip as EquipSlot | undefined;
      if (!button || !slot || button.disabled) {
        return;
      }
      this.onUnequip?.(slot);
    });
  }

/** bindTooltipEvents：绑定回调。 */
  private bindTooltipEvents(): void {
    const tapMode = prefersPinnedTooltipInteraction();
    this.pane.addEventListener('click', (event) => {
      if (!tapMode) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest('[data-unequip]')) {
        return;
      }
      const slotNode = target.closest<HTMLElement>('[data-equip-tooltip-slot]');
      if (!slotNode || !this.lastEquipment) {
        return;
      }
      if (this.tooltip.isPinnedTo(slotNode)) {
        this.tooltipSlot = null;
        this.tooltip.hide(true);
        return;
      }
      const slot = slotNode.dataset.equipTooltipSlot as EquipSlot | undefined;
      const item = slot ? this.lastEquipment[slot] : null;
      if (!slot || !item) {
        return;
      }
      const tooltip = buildItemTooltipPayload(item);
      this.tooltipSlot = slot;
      this.tooltip.showPinned(slotNode, tooltip.title, tooltip.lines, event.clientX, event.clientY, {
        allowHtml: tooltip.allowHtml,
        asideCards: tooltip.asideCards,
      });
      event.preventDefault();
      event.stopPropagation();
    }, true);

    this.pane.addEventListener('pointermove', (event) => {
      if (tapMode && this.tooltip.isPinned()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        if (this.tooltipSlot) {
          this.tooltipSlot = null;
          this.tooltip.hide();
        }
        return;
      }

      const slotNode = target.closest<HTMLElement>('[data-equip-tooltip-slot]');
      if (!slotNode || !this.lastEquipment) {
        if (this.tooltipSlot) {
          this.tooltipSlot = null;
          this.tooltip.hide();
        }
        return;
      }

      const slot = slotNode.dataset.equipTooltipSlot as EquipSlot | undefined;
      const item = slot ? this.lastEquipment[slot] : null;
      if (!slot || !item) {
        if (this.tooltipSlot) {
          this.tooltipSlot = null;
          this.tooltip.hide();
        }
        return;
      }

      if (this.tooltipSlot !== slot) {
        this.tooltipSlot = slot;
        const tooltip = buildItemTooltipPayload(item);
        this.tooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        return;
      }

      this.tooltip.move(event.clientX, event.clientY);
    });

    this.pane.addEventListener('pointerleave', () => {
      this.tooltipSlot = null;
      this.tooltip.hide();
    });

    this.pane.addEventListener('pointerdown', () => {
      if (this.tooltipSlot) {
        this.tooltipSlot = null;
        this.tooltip.hide();
      }
    });
  }


  private ensureTooltipStyle(): void {
    if (document.getElementById('equipment-panel-tooltip-style')) return;
    const style = document.createElement('style');
    style.id = 'equipment-panel-tooltip-style';
    style.textContent = `
      .equipment-tooltip {
        position: fixed;
        pointer-events: none;
        font-size: var(--font-size-13);
        color: var(--ink-black);
        z-index: 2000;
        opacity: 0;
        transition: opacity 120ms ease;
        min-width: 0;
      }
      .equipment-tooltip.visible {
        opacity: 1;
      }
      .equipment-tooltip .floating-tooltip-body {
        min-width: 180px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        line-height: 1.4;
      }
      .equipment-tooltip .floating-tooltip-body strong {
        display: block;
      }
      .equipment-tooltip .floating-tooltip-detail {
        display: flex;
        flex-direction: column;
        gap: 2px;
        color: var(--ink-grey);
      }
      .equipment-tooltip .floating-tooltip-line {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }
}

