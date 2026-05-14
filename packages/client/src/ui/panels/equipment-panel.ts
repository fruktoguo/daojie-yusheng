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
import { getItemDisplayMeta } from '../item-display';
import { describePreviewBonuses } from '../stat-preview';
import { formatDisplayInteger, formatDisplayPercent } from '../../utils/number';
import { t } from '../i18n';
import { setEquipmentPanelCallbacks, syncEquipmentPanelState } from '../../react-ui/panels/equipment/EquipmentPanel';
import {
  mountReactEquipmentPanel,
  shouldUseReactEquipmentPanel,
  unmountReactEquipmentPanel,
} from '../../react-ui/panels/equipment/mount-equipment-panel';

/** formatEffectCondition：格式化效果条件。 */
function formatEffectCondition(effect: EquipmentEffectDef): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const parts = formatEquipmentConditionText(effect);
  if (parts.length === 0) {
    return '';
  }
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
        const effectParts = describePreviewBonuses(effect.attrs, effect.stats, effect.valueStats, effect.attrMode, effect.statMode);
        return t('equipment.effect.stat-aura', { effects: effectParts.join(' / ') || t('equipment.effect.no-value-change', undefined), condition: conditionText });
      }
      case 'periodic_cost': {
        const modeLabel = effect.mode === 'flat'
          ? `${formatDisplayInteger(effect.value)}`
          : effect.mode === 'max_ratio_bp'
            ? t('equipment.effect.max-resource-cost', { percent: formatDisplayPercent(effect.value / 100), resource: effect.resource === 'hp' ? t('equipment.resource.hp', undefined) : t('equipment.resource.qi', undefined) })
            : t('equipment.effect.current-resource-cost', { percent: formatDisplayPercent(effect.value / 100), resource: effect.resource === 'hp' ? t('equipment.resource.hp', undefined) : t('equipment.resource.qi', undefined) });
        const triggerLabel = effect.trigger === 'on_cultivation_tick' ? t('equipment.trigger.cultivation-tick', undefined) : t('equipment.trigger.tick', undefined);
        return t('equipment.effect.periodic-cost', { trigger: triggerLabel, mode: modeLabel, condition: conditionText });
      }
      case 'timed_buff': {
        const triggerMap: Record<string, string> = {
          on_equip: t('equipment.trigger.on-equip', undefined),
          on_unequip: t('equipment.trigger.on-unequip', undefined),
          on_tick: t('equipment.trigger.on-tick', undefined),
          on_move: t('equipment.trigger.on-move', undefined),
          on_attack: t('equipment.trigger.on-attack', undefined),
          on_hit: t('equipment.trigger.on-hit', undefined),
          on_kill: t('equipment.trigger.on-kill', undefined),
          on_skill_cast: t('equipment.trigger.on-skill-cast', undefined),
          on_cultivation_tick: t('equipment.trigger.on-cultivation-tick', undefined),
          on_time_segment_changed: t('equipment.trigger.on-time-segment-changed', undefined),
          on_enter_map: t('equipment.trigger.on-enter-map', undefined),
        };
        const buffParts = describePreviewBonuses(effect.buff.attrs, effect.buff.stats, effect.buff.valueStats, effect.buff.attrMode ?? 'percent', effect.buff.statMode ?? 'percent');
        return t('equipment.effect.timed-buff', {
          trigger: triggerMap[effect.trigger] ?? effect.trigger,
          buffName: effect.buff.name,
          duration: effect.buff.duration,
          condition: conditionText,
          effects: buffParts.length > 0 ? t('equipment.effect.timed-buff-effects', { effects: buffParts.join(' / ') }) : '',
        });
      }
      default:
        return '';
    }
  }).filter((line) => line.length > 0);
}

/** formatItemBonuses：格式化物品Bonuses。 */
function formatItemBonuses(item: EquipmentSlots[EquipSlot], playerRealmLv?: number | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!item) return t('equipment.empty.affixes', undefined);
  const previewItem = resolvePreviewItem(item);
  const bonusParts = describeEquipmentBonuses(previewItem, playerRealmLv);
  const effectParts = formatItemEffects(item);
  const parts = [...bonusParts, ...effectParts];
  return parts.length > 0 ? parts.join(' / ') : t('equipment.empty.affixes', undefined);
}

/** EquipmentSlotView：装备槽位的渲染引用集合。 */
type EquipmentSlotView = {
/**
 * root：根容器相关字段。
 */

  root: HTMLDivElement;  
  /**
 * name：名称名称或显示文本。
 */

  name: HTMLSpanElement;  
  /**
 * item：道具相关字段。
 */

  item: HTMLSpanElement;  
  /**
 * empty：empty相关字段。
 */

  empty: HTMLSpanElement;  
  /**
 * meta：meta相关字段。
 */

  meta: HTMLSpanElement;  
  /**
 * action：action相关字段。
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
  /** playerRealmLv：当前玩家境界等级，用于装备生效率预览。 */
  private playerRealmLv: number | null = null;
  /** slotViews：槽位Views。 */
  private slotViews = new Map<EquipSlot, EquipmentSlotView>();
  /** slotSignatures：槽位显示签名，避免相同装备重复写 DOM。 */
  private slotSignatures = new Map<EquipSlot, string>();
  /** sectionEl：section元素。 */
  private sectionEl: HTMLDivElement | null = null;  
  /** emptyStateEl：装备总空态提示。 */
  private emptyStateEl: HTMLDivElement | null = null;
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.ensureTooltipStyle();
    this.bindActionEvents();
    this.bindTooltipEvents();
  }

  /** clear：清理clear。 */
  clear(): void {
    if (this.useReactPanel()) {
      syncEquipmentPanelState({ equipment: null, playerRealmLv: null });
      this.lastEquipment = null;
      this.tooltipSlot = null;
      this.tooltip.hide(true);
      return;
    }
    this.lastEquipment = null;
    this.tooltipSlot = null;
    this.tooltip.hide(true);
    this.slotViews.clear();
    this.slotSignatures.clear();
    this.sectionEl = null;
    this.emptyStateEl = null;
    this.pane.replaceChildren();
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onUnequip (slot: EquipSlot) => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(onUnequip: (slot: EquipSlot) => void): void {
    this.onUnequip = onUnequip;
    setEquipmentPanelCallbacks({ onUnequip });
    if (this.useReactPanel()) {
      syncEquipmentPanelState({ equipment: this.lastEquipment, playerRealmLv: this.playerRealmLv });
      this.mountReactPanel();
    }
  }

  /** 更新装备数据并重新渲染 */
  update(equipment: EquipmentSlots): void {
    if (this.useReactPanel()) {
      this.lastEquipment = equipment;
      syncEquipmentPanelState({ equipment, playerRealmLv: this.playerRealmLv });
      this.mountReactPanel();
      return;
    }
    this.lastEquipment = equipment;
    this.render(equipment);
  }

  /** syncPlayerContext：同步装备提示依赖的玩家上下文。 */
  syncPlayerContext(player?: PlayerState | null): void {
    const nextRealmLv = Number.isFinite(Number(player?.realm?.realmLv ?? player?.realmLv))
      ? Math.max(1, Math.floor(Number(player?.realm?.realmLv ?? player?.realmLv)))
      : null;
    if (this.playerRealmLv === nextRealmLv) {
      return;
    }
    this.playerRealmLv = nextRealmLv;
    if (this.useReactPanel()) {
      syncEquipmentPanelState({ equipment: this.lastEquipment, playerRealmLv: this.playerRealmLv });
      this.mountReactPanel();
      return;
    }
    this.slotSignatures.clear();
    if (this.lastEquipment) {
      this.render(this.lastEquipment);
    }
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.playerRealmLv = Number.isFinite(Number(player.realm?.realmLv ?? player.realmLv))
      ? Math.max(1, Math.floor(Number(player.realm?.realmLv ?? player.realmLv)))
      : null;
    this.lastEquipment = player.equipment;
    if (this.useReactPanel()) {
      syncEquipmentPanelState({ equipment: player.equipment, player });
      this.mountReactPanel();
      return;
    }
    this.render(player.equipment);
  }

  private useReactPanel(): boolean {
    return shouldUseReactEquipmentPanel();
  }

  private mountReactPanel(): void {
    if (!mountReactEquipmentPanel()) {
      unmountReactEquipmentPanel();
    }
  }

  /** render：渲染渲染。 */
  private render(equipment: EquipmentSlots): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.ensureStructure();
    if (!this.sectionEl) {
      return;
    }

    let hasAnyEquipment = false;
    for (const slot of EQUIP_SLOTS) {
      const slotView = this.slotViews.get(slot);
      if (!slotView) {
        continue;
      }
      const item = equipment[slot];
      const hasItem = !!item;
      hasAnyEquipment ||= hasItem;
      const itemName = item ? getItemDisplayMeta(item).displayItem.name : '';
      const metaText = item ? formatItemBonuses(item, this.playerRealmLv) : t('equipment.empty.slot-meta', undefined);
      const signature = this.buildSlotSignature(slot, hasItem, itemName, metaText);
      if (this.slotSignatures.get(slot) === signature) {
        continue;
      }
      this.slotSignatures.set(slot, signature);
      slotView.root.toggleAttribute('data-equip-tooltip-slot', hasItem);
      if (hasItem) {
        slotView.root.dataset.equipTooltipSlot = slot;
      } else {
        delete slotView.root.dataset.equipTooltipSlot;
      }
      slotView.name.textContent = getEquipSlotLabel(slot);
      slotView.item.textContent = itemName;
      slotView.item.hidden = !hasItem;
      slotView.empty.textContent = t('equipment.empty.slot-short', undefined);
      slotView.empty.hidden = hasItem;
      slotView.meta.textContent = metaText;
      slotView.action.hidden = !hasItem;
      slotView.action.disabled = !hasItem;
      slotView.action.dataset.unequip = slot;
    }
    if (this.emptyStateEl) {
      this.emptyStateEl.hidden = hasAnyEquipment;
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
      this.slotSignatures.clear();

      const sectionEl = document.createElement('div');
      sectionEl.className = 'panel-section';

      const titleEl = document.createElement('div');
      titleEl.className = 'panel-section-title';
      titleEl.textContent = t('equipment.title', undefined);
      sectionEl.append(titleEl);

      const emptyStateEl = document.createElement('div');
      emptyStateEl.className = 'empty-hint';
      emptyStateEl.textContent = t('equipment.empty.all', undefined);
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
    empty.textContent = t('equipment.empty.slot-short', undefined);

    const meta = document.createElement('span');
    meta.className = 'equip-slot-meta';
    meta.textContent = t('equipment.empty.slot-meta', undefined);

    const action = document.createElement('button');
    action.className = 'small-btn';
    action.type = 'button';
    action.textContent = t('equipment.action.unequip', undefined);
    action.hidden = true;
    action.disabled = true;
    action.dataset.unequip = slot;

    copy.append(name, item, empty, meta);
    root.append(copy, action);

    return { root, name, item, empty, meta, action };
  }

  /** buildSlotSignature：生成槽位当前展示所需的稳定签名。 */
  private buildSlotSignature(slot: EquipSlot, hasItem: boolean, itemName: string, metaText: string): string {
    return [slot, hasItem ? 'equipped' : 'empty', itemName, metaText].join('|');
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
      const tooltip = buildItemTooltipPayload(item, { playerRealmLv: this.playerRealmLv });
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
        const tooltip = buildItemTooltipPayload(item, { playerRealmLv: this.playerRealmLv });
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
