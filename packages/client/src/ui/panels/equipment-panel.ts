/**
 * 本文件是客户端 DOM UI 的 equipment panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 装备面板
 * 展示装备槽位的当前装备，支持卸下操作
 */
import { EquipmentSlots, EquipSlot, PlayerState } from '@mud/shared';
import { getEquipSlotLabel } from '../../domain-labels';
import { preserveSelection } from '../selection-preserver';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { getItemDisplayMeta } from '../item-display';
import {
  EQUIPMENT_PANEL_SLOT_ORDER,
  formatEquipmentSlotCompactMeta,
  isWideEquipmentPanelSlot,
} from '../equipment-panel-layout';
import { t } from '../i18n';
import { setEquipmentPanelCallbacks, syncEquipmentPanelState } from '../../react-ui/panels/equipment/EquipmentPanel';
import {
  mountReactEquipmentPanel,
  shouldUseReactEquipmentPanel,
  unmountReactEquipmentPanel,
} from '../../react-ui/panels/equipment/mount-equipment-panel';

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

/** 装备面板：显示装备槽位 */
export class EquipmentPanel {
  /** pane：pane。 */
  private pane = document.getElementById('pane-equipment')!;
  /** onUnequip：on Unequip。 */
  private onUnequip: ((slot: EquipSlot, expectedItemInstanceId?: string) => void) | null = null;
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


  setCallbacks(onUnequip: (slot: EquipSlot, expectedItemInstanceId?: string) => void): void {
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
    for (const slot of EQUIPMENT_PANEL_SLOT_ORDER) {
      const slotView = this.slotViews.get(slot);
      if (!slotView) {
        continue;
      }
      const item = equipment[slot];
      const hasItem = !!item;
      hasAnyEquipment ||= hasItem;
      const itemName = item ? getItemDisplayMeta(item).displayItem.name : '';
      const metaText = item ? formatEquipmentSlotCompactMeta(item) : t('equipment.empty.slot-meta', undefined);
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

    if (this.sectionEl && this.emptyStateEl && this.slotViews.size === EQUIPMENT_PANEL_SLOT_ORDER.length) {
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

      const gridEl = document.createElement('div');
      gridEl.className = 'equip-slot-grid';

      for (const slot of EQUIPMENT_PANEL_SLOT_ORDER) {
        const slotView = this.createSlotView(slot);
        this.slotViews.set(slot, slotView);
        gridEl.append(slotView.root);
      }
      sectionEl.append(gridEl);

      this.pane.append(sectionEl);
      this.sectionEl = sectionEl;
      this.emptyStateEl = emptyStateEl;
    });
  }

  /** createSlotView：创建槽位视图。 */
  private createSlotView(slot: EquipSlot): EquipmentSlotView {
    const root = document.createElement('div');
    root.className = isWideEquipmentPanelSlot(slot) ? 'equip-slot equip-slot--wide' : 'equip-slot';

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
      // 透传 itemInstanceId 给服务端做乐观一致性校验，防止"装备槽切换 + 卸下"竞争错配
      const slotItem = this.lastEquipment?.[slot] ?? null;
      const expectedItemInstanceId = slotItem && typeof slotItem.itemInstanceId === 'string'
        ? slotItem.itemInstanceId
        : undefined;
      this.onUnequip?.(slot, expectedItemInstanceId);
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
