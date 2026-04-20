/**
 * 装备面板
 * 展示 5 个装备槽位的当前装备与词条，支持卸下操作
 */
import { EquipmentEffectDef, EquipmentSlots, EQUIP_SLOTS, EquipSlot, PlayerState } from '@mud/shared-next';
import { getEquipSlotLabel } from '../../domain-labels';
import { resolvePreviewItem } from '../../content/local-templates';
import { preserveSelection } from '../selection-preserver';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { describePreviewBonuses } from '../stat-preview';
import { formatDisplayInteger, formatDisplayPercent } from '../../utils/number';

/** formatEffectCondition：格式化效果条件。 */
function formatEffectCondition(effect: EquipmentEffectDef): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const conditions = effect?.conditions?.items ?? [];
  if (conditions.length === 0) {
    return '';
  }
  const parts = conditions.map((condition) => {
    switch (condition.type) {
      case 'time_segment':
        return `时段:${condition.in.join('/')}`;
      case 'map':
        return `地图:${condition.mapIds.join('/')}`;
      case 'hp_ratio':
        return `生命${condition.op}${formatDisplayPercent(condition.value * 100)}`;
      case 'qi_ratio':
        return `灵力${condition.op}${formatDisplayPercent(condition.value * 100)}`;
      case 'is_cultivating':
        return condition.value ? '修炼中' : '未修炼';
      case 'has_buff':
        return `需带有 ${condition.buffId}`;
      case 'target_kind':
        return `目标:${condition.in.join('/')}`;
      default:
        return '';
    }
  }).filter((part) => part.length > 0);
  return parts.length > 0 ? ` [${parts.join('，')}]` : '';
}

/** formatItemEffects：格式化物品效果。 */
function formatItemEffects(item: EquipmentSlots[EquipSlot]): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const previewItem = item ? resolvePreviewItem(item) : null;
  if (!previewItem?.effects?.length) {
    return [];
  }
  return previewItem.effects.map((effect) => {
    const conditionText = formatEffectCondition(effect);
    switch (effect.type) {
      case 'stat_aura':
      case 'progress_boost': {
        const effectParts = describePreviewBonuses(effect.attrs, effect.stats, effect.valueStats);
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
        const buffParts = describePreviewBonuses(effect.buff.attrs, effect.buff.stats, effect.buff.valueStats);
        return `触发:${triggerMap[effect.trigger] ?? effect.trigger}获得 ${effect.buff.name} ${effect.buff.duration}息${conditionText}${buffParts.length > 0 ? `，效果:${buffParts.join(' / ')}` : ''}`;
      }
      default:
        return '';
    }
  }).filter((line) => line.length > 0);
}

/** formatItemBonuses：格式化物品Bonuses。 */
function formatItemBonuses(item: EquipmentSlots[EquipSlot]): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!item) return '暂无词条';
  const previewItem = resolvePreviewItem(item);
  const bonusParts = describePreviewBonuses(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats);
  const effectParts = formatItemEffects(item);
  const parts = [...bonusParts, ...effectParts];
  return parts.length > 0 ? parts.join(' / ') : '暂无词条';
}

/** createFragmentFromHtml：从 HTML 文本创建文档片段。 */
function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.cloneNode(true) as DocumentFragment;
}

/** EquipmentSlotView：装备槽位的渲染引用集合。 */
type EquipmentSlotView = {
/**
 * root：对象字段。
 */

  root: HTMLDivElement;  
  /**
 * name：对象字段。
 */

  name: HTMLSpanElement;  
  /**
 * item：对象字段。
 */

  item: HTMLSpanElement;  
  /**
 * empty：对象字段。
 */

  empty: HTMLSpanElement;  
  /**
 * meta：对象字段。
 */

  meta: HTMLSpanElement;  
  /**
 * action：对象字段。
 */

  action: HTMLButtonElement;
};

/** 装备面板：显示5个装备槽位 */
export class EquipmentPanel {
  /** pane：pane。 */
  private pane = document.getElementById('pane-equipment')!;
  /** onUnequip：on Unequip。 */
  private onUnequip: ((slot: EquipSlot) => void) | null = null;
  /** lastEquipment：last Equipment。 */
  private lastEquipment: EquipmentSlots | null = null;
  /** tooltip：提示。 */
  private tooltip = new FloatingTooltip('floating-tooltip equipment-tooltip');
  /** tooltipSlot：提示槽位。 */
  private tooltipSlot: EquipSlot | null = null;
  /** slotViews：槽位Views。 */
  private slotViews = new Map<EquipSlot, EquipmentSlotView>();
  /** emptyStateEl：empty状态元素。 */
  private emptyStateEl: HTMLDivElement | null = null;
  /** sectionEl：section元素。 */
  private sectionEl: HTMLDivElement | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值（构造函数）。
 */


  constructor() {
    this.ensureTooltipStyle();
    this.bindActionEvents();
    this.bindTooltipEvents();
  }

  /** clear：清理clear。 */
  clear(): void {
    this.lastEquipment = null;
    this.tooltipSlot = null;
    this.tooltip.hide(true);
    this.slotViews.clear();
    this.sectionEl = null;
    this.emptyStateEl = null;
    this.pane.replaceChildren(createFragmentFromHtml('<div class="empty-hint ui-empty-hint">尚未装备任何物品</div>'));
  }  
  /**
 * setCallbacks：更新/写入相关状态。
 * @param onUnequip (slot: EquipSlot) => void 参数说明。
 * @returns void。
 */


  setCallbacks(onUnequip: (slot: EquipSlot) => void): void {
    this.onUnequip = onUnequip;
  }

  /** 更新装备数据并重新渲染 */
  update(equipment: EquipmentSlots): void {
    this.lastEquipment = equipment;
    this.render(equipment);
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.lastEquipment = player.equipment;
    this.render(player.equipment);
  }

  /** render：渲染渲染。 */
  private render(equipment: EquipmentSlots): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** ensureStructure：确保Structure。 */
  private ensureStructure(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.sectionEl && this.emptyStateEl && this.slotViews.size === EQUIP_SLOTS.length) {
      return;
    }

    preserveSelection(this.pane, () => {
      this.pane.replaceChildren();
      this.slotViews.clear();

      const sectionEl = document.createElement('div');
      sectionEl.className = 'panel-section ui-surface-pane ui-surface-pane--stack';

      const titleEl = document.createElement('div');
      titleEl.className = 'panel-section-title';
      titleEl.textContent = '装备栏';
      sectionEl.append(titleEl);

      const emptyStateEl = document.createElement('div');
      emptyStateEl.className = 'empty-hint ui-empty-hint';
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

  /** createSlotView：创建槽位视图。 */
  private createSlotView(slot: EquipSlot): EquipmentSlotView {
    const root = document.createElement('div');
    root.className = 'equip-slot ui-surface-card ui-surface-card--compact';

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

  /** bindActionEvents：绑定动作事件。 */
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

  /** bindTooltipEvents：绑定提示事件。 */
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

  /** ensureTooltipStyle：确保提示样式。 */
  private ensureTooltipStyle(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
