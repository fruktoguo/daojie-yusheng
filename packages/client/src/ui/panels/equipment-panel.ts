/**
 * 本文件是客户端 DOM UI 的 equipment panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 装备面板
 * 展示装备槽位的当前装备，支持卸下操作
 */
import { ArtifactSlot, EquipmentSlots, EquipSlot, PlayerState } from '@mud/shared';
import { getEquipSlotLabel } from '../../domain-labels';
import { preserveSelection } from '../selection-preserver';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { getItemDisplayMeta } from '../item-display';
import {
  EQUIPMENT_PANEL_TAB_LABEL_KEYS,
  EQUIPMENT_PANEL_TABS,
  type EquipmentPanelTab,
  EQUIPMENT_PANEL_SLOT_ORDER,
  getEquipmentPanelTabSlotOrder,
  getArtifactPanelSlotOrder,
  formatEquipmentSlotCompactMeta,
  formatArtifactQiText,
  isWideEquipmentPanelSlot,
} from '../equipment-panel-layout';
import {
  findArtifactShortcutSlot,
  loadArtifactShortcutBindings,
  normalizeEquipmentShortcutKey,
  saveArtifactShortcutBindings,
  setArtifactShortcutBinding,
} from '../equipment-panel-shortcuts';
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

type ArtifactSlotView = EquipmentSlotView & {
  stateBadge: HTMLSpanElement;
  qi: HTMLDivElement;
  qiTrack: HTMLSpanElement;
  qiFill: HTMLSpanElement;
  qiText: HTMLSpanElement;
  actions: HTMLDivElement;
  shortcutBind: HTMLButtonElement;
};

type EquipmentPanelUnequipSlot = EquipSlot | ArtifactSlot;

/** 装备面板：显示装备槽位 */
export class EquipmentPanel {
  /** pane：pane。 */
  private pane = document.getElementById('pane-equipment')!;
  /** onUnequip：on Unequip。 */
  private onUnequip: ((slot: EquipmentPanelUnequipSlot, expectedItemInstanceId?: string) => void) | null = null;
  /** onSetArtifactSlotEnabled：设置法宝槽开关。 */
  private onSetArtifactSlotEnabled: ((slot: ArtifactSlot, enabled: boolean) => void) | null = null;
  /** lastEquipment：last Equipment。 */
  private lastEquipment: EquipmentSlots | null = null;
  /** lastArtifacts：last Artifacts。 */
  private lastArtifacts: PlayerState['artifacts'] | null = null;
  /** tooltip：提示。 */
  private tooltip = new FloatingTooltip('floating-tooltip equipment-tooltip');
  /** tooltipSlot：提示槽位。 */
  private tooltipSlot: string | null = null;
  /** playerRealmLv：当前玩家境界等级，用于装备生效率预览。 */
  private playerRealmLv: number | null = null;
  /** slotViews：槽位Views。 */
  private slotViews = new Map<EquipSlot, EquipmentSlotView>();
  /** artifactSlotViews：法宝槽位Views。 */
  private artifactSlotViews = new Map<ArtifactSlot, ArtifactSlotView>();
  /** slotSignatures：槽位显示签名，避免相同装备重复写 DOM。 */
  private slotSignatures = new Map<EquipSlot, string>();
  /** artifactSlotSignatures：法宝槽显示签名。 */
  private artifactSlotSignatures = new Map<ArtifactSlot, string>();
  /** artifactShortcutBindings：法宝槽快捷键绑定。 */
  private artifactShortcutBindings = loadArtifactShortcutBindings();
  /** bindingArtifactSlot：正在等待绑定快捷键的法宝槽。 */
  private bindingArtifactSlot: ArtifactSlot | null = null;
  /** tabButtons：tab按钮引用。 */
  private tabButtons = new Map<EquipmentPanelTab, HTMLButtonElement>();
  /** activeTab：当前显示的装备分类。 */
  private activeTab: EquipmentPanelTab = 'combat';
  /** sectionEl：section元素。 */
  private sectionEl: HTMLDivElement | null = null;  
  /** emptyStateEl：装备总空态提示。 */
  private emptyStateEl: HTMLDivElement | null = null;
  /** gridEl：装备/技艺槽网格。 */
  private gridEl: HTMLDivElement | null = null;
  /** artifactListEl：法宝槽单列容器。 */
  private artifactListEl: HTMLDivElement | null = null;
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.artifactShortcutBindings = loadArtifactShortcutBindings();
    this.ensureTooltipStyle();
    this.bindActionEvents();
    this.bindTooltipEvents();
    this.bindGlobalEvents();
  }

  /** clear：清理clear。 */
  clear(): void {
    this.bindingArtifactSlot = null;
    if (this.useReactPanel()) {
      syncEquipmentPanelState({
        equipment: null,
        artifacts: null,
        playerRealmLv: null,
        artifactShortcutBindings: this.buildArtifactShortcutBindingsState(),
        bindingArtifactSlot: this.bindingArtifactSlot,
      });
      this.lastEquipment = null;
      this.lastArtifacts = null;
      this.tooltipSlot = null;
      this.tooltip.hide(true);
      return;
    }
    this.lastEquipment = null;
    this.lastArtifacts = null;
    this.tooltipSlot = null;
    this.tooltip.hide(true);
    this.activeTab = 'combat';
    this.tabButtons.clear();
    this.slotViews.clear();
    this.artifactSlotViews.clear();
    this.slotSignatures.clear();
    this.artifactSlotSignatures.clear();
    this.sectionEl = null;
    this.emptyStateEl = null;
    this.gridEl = null;
    this.artifactListEl = null;
    this.pane.replaceChildren();
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onUnequip (slot: EquipmentPanelUnequipSlot) => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(
    onUnequip: (slot: EquipmentPanelUnequipSlot, expectedItemInstanceId?: string) => void,
    onSetArtifactSlotEnabled?: (slot: ArtifactSlot, enabled: boolean) => void,
  ): void {
    this.onUnequip = onUnequip;
    this.onSetArtifactSlotEnabled = onSetArtifactSlotEnabled ?? null;
    setEquipmentPanelCallbacks({
      onUnequip,
      onSetArtifactSlotEnabled,
      onBindArtifactShortcut: (slot) => this.toggleArtifactShortcutBinding(slot),
    });
    if (this.useReactPanel()) {
      syncEquipmentPanelState({
        equipment: this.lastEquipment,
        artifacts: this.lastArtifacts,
        playerRealmLv: this.playerRealmLv,
        artifactShortcutBindings: this.buildArtifactShortcutBindingsState(),
        bindingArtifactSlot: this.bindingArtifactSlot,
      });
      this.mountReactPanel();
    }
  }

  /** 更新装备数据并重新渲染 */
  update(equipment: EquipmentSlots, artifacts: PlayerState['artifacts'] | null = this.lastArtifacts): void {
    if (this.useReactPanel()) {
      this.lastEquipment = equipment;
      this.lastArtifacts = artifacts;
      this.syncReactPanelState(equipment, artifacts);
      this.mountReactPanel();
      return;
    }
    this.lastEquipment = equipment;
    this.lastArtifacts = artifacts;
    this.render(equipment, artifacts);
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
      this.syncReactPanelState();
      this.mountReactPanel();
      return;
    }
    this.slotSignatures.clear();
    this.artifactSlotSignatures.clear();
    if (this.lastEquipment) {
      this.render(this.lastEquipment, this.lastArtifacts);
    }
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.playerRealmLv = Number.isFinite(Number(player.realm?.realmLv ?? player.realmLv))
      ? Math.max(1, Math.floor(Number(player.realm?.realmLv ?? player.realmLv)))
      : null;
    this.lastEquipment = player.equipment;
    this.lastArtifacts = player.artifacts;
    if (this.useReactPanel()) {
      this.syncReactPanelState(player.equipment, player.artifacts, player);
      this.mountReactPanel();
      return;
    }
    this.render(player.equipment, player.artifacts);
  }

  private useReactPanel(): boolean {
    return shouldUseReactEquipmentPanel();
  }

  private mountReactPanel(): void {
    if (!mountReactEquipmentPanel()) {
      unmountReactEquipmentPanel();
    }
  }

  /** syncReactPanelState：同步 React 面板需要的装备、法宝和本地快捷键状态。 */
  private syncReactPanelState(
    equipment: EquipmentSlots | null = this.lastEquipment,
    artifacts: PlayerState['artifacts'] | null = this.lastArtifacts,
    player?: PlayerState,
  ): void {
    syncEquipmentPanelState({
      equipment,
      artifacts,
      player,
      playerRealmLv: this.playerRealmLv,
      artifactShortcutBindings: this.buildArtifactShortcutBindingsState(),
      bindingArtifactSlot: this.bindingArtifactSlot,
    });
  }

  /** buildArtifactShortcutBindingsState：转成 React store 友好的普通对象。 */
  private buildArtifactShortcutBindingsState(): Partial<Record<ArtifactSlot, string>> {
    return Object.fromEntries(this.artifactShortcutBindings.entries()) as Partial<Record<ArtifactSlot, string>>;
  }

  /** getArtifactShortcutBindLabel：读取法宝快捷键按钮文案。 */
  private getArtifactShortcutBindLabel(slot: ArtifactSlot): string {
    if (this.bindingArtifactSlot === slot) {
      return t('action.shortcut.binding', undefined);
    }
    const binding = this.artifactShortcutBindings.get(slot);
    return binding
      ? t('action.shortcut.rebind', { key: binding.toUpperCase() })
      : t('action.shortcut.bind', undefined);
  }

  /** toggleArtifactShortcutBinding：进入或退出指定法宝槽的快捷键绑定模式。 */
  private toggleArtifactShortcutBinding(slot: ArtifactSlot): void {
    this.bindingArtifactSlot = this.bindingArtifactSlot === slot ? null : slot;
    this.refreshArtifactShortcutDisplay();
  }

  /** commitArtifactShortcutBinding：保存法宝槽快捷键。 */
  private commitArtifactShortcutBinding(slot: ArtifactSlot, normalizedKey: string): void {
    this.artifactShortcutBindings = setArtifactShortcutBinding(this.artifactShortcutBindings, slot, normalizedKey);
    saveArtifactShortcutBindings(this.artifactShortcutBindings);
    this.bindingArtifactSlot = null;
    this.refreshArtifactShortcutDisplay();
  }

  /** refreshArtifactShortcutDisplay：刷新绑定按钮和快捷键标记。 */
  private refreshArtifactShortcutDisplay(): void {
    this.artifactSlotSignatures.clear();
    if (this.useReactPanel()) {
      this.syncReactPanelState();
      this.mountReactPanel();
      return;
    }
    if (this.lastEquipment) {
      this.render(this.lastEquipment, this.lastArtifacts);
    }
  }

  /** toggleArtifactSlot：切换某个已装备法宝槽。 */
  private toggleArtifactSlot(slot: ArtifactSlot): boolean {
    const entry = this.lastArtifacts?.slots.find((candidate) => candidate.slot === slot);
    if (entry?.unlocked !== true || !entry.item) {
      return false;
    }
    this.onSetArtifactSlotEnabled?.(slot, entry.enabled === false);
    return true;
  }

  /** bindGlobalEvents：绑定全局法宝快捷键。 */
  private bindGlobalEvents(): void {
    window.addEventListener('keydown', (event) => this.handleGlobalKeydown(event), { capture: true });
  }

  /** handleGlobalKeydown：处理法宝快捷键绑定和触发。 */
  private handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.isContentEditable) {
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (this.bindingArtifactSlot) {
      if (event.key === 'Escape') {
        this.bindingArtifactSlot = null;
        this.refreshArtifactShortcutDisplay();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const normalized = normalizeEquipmentShortcutKey(event.key);
      if (!normalized) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.commitArtifactShortcutBinding(this.bindingArtifactSlot, normalized);
      return;
    }

    const normalized = normalizeEquipmentShortcutKey(event.key);
    if (!normalized) {
      return;
    }
    const slot = findArtifactShortcutSlot(this.artifactShortcutBindings, normalized);
    if (!slot || !this.toggleArtifactSlot(slot)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  /** setActiveTab：切换当前显示的装备分类。 */
  private setActiveTab(tab: EquipmentPanelTab): void {
    if (this.activeTab === tab) {
      return;
    }
    this.activeTab = tab;
    this.tooltipSlot = null;
    this.tooltip.hide(true);
    this.updateTabButtons();
    if (this.lastEquipment) {
      this.render(this.lastEquipment, this.lastArtifacts);
    }
  }

  /** render：渲染渲染。 */
  private render(equipment: EquipmentSlots, artifacts: PlayerState['artifacts'] | null = this.lastArtifacts): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.ensureStructure();
    if (!this.sectionEl) {
      return;
    }

    const isArtifactTab = this.activeTab === 'artifact';
    if (this.gridEl) {
      this.gridEl.hidden = isArtifactTab;
    }
    if (this.artifactListEl) {
      this.artifactListEl.hidden = !isArtifactTab;
    }

    const visibleSlots = isArtifactTab ? [] : getEquipmentPanelTabSlotOrder(this.activeTab);
    const visibleSlotSet = new Set(visibleSlots);
    for (const slot of EQUIPMENT_PANEL_SLOT_ORDER) {
      const slotView = this.slotViews.get(slot);
      if (!slotView) {
        continue;
      }
      const isVisible = visibleSlotSet.has(slot);
      const item = equipment[slot];
      const hasItem = !!item;
      const itemName = item ? getItemDisplayMeta(item).displayItem.name : '';
      const metaText = item ? formatEquipmentSlotCompactMeta(item) : t('equipment.empty.slot-meta', undefined);
      const signature = this.buildSlotSignature(slot, isVisible, hasItem, itemName, metaText);
      if (this.slotSignatures.get(slot) === signature) {
        continue;
      }
      this.slotSignatures.set(slot, signature);
      slotView.root.hidden = !isVisible;
      slotView.root.toggleAttribute('data-equip-tooltip-slot', isVisible && hasItem);
      if (isVisible && hasItem) {
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
    if (isArtifactTab) {
      this.renderArtifactSlots(artifacts);
    }
    if (this.emptyStateEl) {
      this.emptyStateEl.textContent = '';
      this.emptyStateEl.hidden = true;
    }
  }

  /** ensureStructure：确保Structure。 */
  private ensureStructure(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (
      this.sectionEl
      && this.emptyStateEl
      && this.gridEl
      && this.artifactListEl
      && this.slotViews.size === EQUIPMENT_PANEL_SLOT_ORDER.length
      && this.artifactSlotViews.size === getArtifactPanelSlotOrder().length
      && this.tabButtons.size === EQUIPMENT_PANEL_TABS.length
    ) {
      this.updateTabButtons();
      return;
    }

    preserveSelection(this.pane, () => {
      this.pane.replaceChildren();
      this.slotViews.clear();
      this.artifactSlotViews.clear();
      this.slotSignatures.clear();
      this.artifactSlotSignatures.clear();
      this.tabButtons.clear();

      const sectionEl = document.createElement('div');
      sectionEl.className = 'panel-section';

      const titleEl = document.createElement('div');
      titleEl.className = 'panel-section-title';
      titleEl.textContent = t('equipment.title', undefined);
      sectionEl.append(titleEl);

      const tabBarEl = document.createElement('div');
      tabBarEl.className = 'equipment-subtabs';
      tabBarEl.setAttribute('role', 'tablist');
      tabBarEl.setAttribute('aria-label', t('equipment.title', undefined));
      for (const tab of EQUIPMENT_PANEL_TABS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'equipment-subtab';
        button.dataset.equipmentTab = tab;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', tab === this.activeTab ? 'true' : 'false');
        button.textContent = t(EQUIPMENT_PANEL_TAB_LABEL_KEYS[tab], undefined);
        button.addEventListener('click', () => this.setActiveTab(tab));
        this.tabButtons.set(tab, button);
        tabBarEl.append(button);
      }
      sectionEl.append(tabBarEl);

      const emptyStateEl = document.createElement('div');
      emptyStateEl.className = 'empty-hint';
      emptyStateEl.textContent = '';
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

      const artifactListEl = document.createElement('div');
      artifactListEl.className = 'artifact-slot-list';
      for (const slot of getArtifactPanelSlotOrder()) {
        const slotView = this.createArtifactSlotView(slot);
        this.artifactSlotViews.set(slot, slotView);
        artifactListEl.append(slotView.root);
      }
      sectionEl.append(artifactListEl);

      this.pane.append(sectionEl);
      this.sectionEl = sectionEl;
      this.emptyStateEl = emptyStateEl;
      this.gridEl = gridEl;
      this.artifactListEl = artifactListEl;
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

  /** createArtifactSlotView：创建法宝槽位视图。 */
  private createArtifactSlotView(slot: ArtifactSlot): ArtifactSlotView {
    const root = document.createElement('div');
    root.className = 'artifact-slot is-locked is-disabled is-empty';

    const copy = document.createElement('div');
    copy.className = 'equip-copy artifact-copy';

    const head = document.createElement('div');
    head.className = 'artifact-slot-head';

    const name = document.createElement('span');
    name.className = 'equip-slot-item artifact-slot-title is-empty-title';
    name.textContent = t('equipment.artifact.locked', undefined);

    const stateBadge = document.createElement('span');
    stateBadge.className = 'artifact-state-badge';
    stateBadge.textContent = t('equipment.artifact.locked', undefined);

    head.append(name, stateBadge);

    const item = document.createElement('span');
    item.className = 'equip-slot-item';
    item.hidden = true;

    const empty = document.createElement('span');
    empty.className = 'equip-slot-empty';
    empty.textContent = t('equipment.artifact.locked', undefined);

    const meta = document.createElement('span');
    meta.className = 'equip-slot-meta';
    meta.textContent = t('equipment.artifact.locked', undefined);

    const qi = document.createElement('div');
    qi.className = 'artifact-qi';
    qi.hidden = true;

    const qiTrack = document.createElement('span');
    qiTrack.className = 'artifact-qi-track';
    qiTrack.setAttribute('aria-hidden', 'true');

    const qiFill = document.createElement('span');
    qiFill.className = 'artifact-qi-fill';

    const qiText = document.createElement('span');
    qiText.className = 'artifact-qi-text';

    qiTrack.append(qiFill);
    qi.append(qiTrack, qiText);

    const action = document.createElement('button');
    action.className = 'small-btn';
    action.type = 'button';
    action.textContent = t('equipment.action.unequip', undefined);
    action.hidden = true;
    action.disabled = true;
    action.dataset.unequip = slot;

    copy.append(head, item, empty, meta, qi);

    const actions = document.createElement('div');
    actions.className = 'artifact-actions';

    const shortcutBind = document.createElement('button');
    shortcutBind.className = 'small-btn ghost artifact-shortcut-bind';
    shortcutBind.type = 'button';
    shortcutBind.dataset.artifactBindShortcut = slot;
    shortcutBind.textContent = this.getArtifactShortcutBindLabel(slot);

    actions.append(shortcutBind, action);
    root.append(copy, actions);
    return { root, name, item, empty, meta, action, stateBadge, qi, qiTrack, qiFill, qiText, actions, shortcutBind };
  }

  /** renderArtifactSlots：渲染法宝槽。 */
  private renderArtifactSlots(artifacts: PlayerState['artifacts'] | null): void {
    const slots = Array.isArray(artifacts?.slots) ? artifacts.slots : [];
    for (const slot of getArtifactPanelSlotOrder()) {
      const slotView = this.artifactSlotViews.get(slot);
      if (!slotView) {
        continue;
      }
      const entry = slots.find((candidate) => candidate.slot === slot);
      const unlocked = entry?.unlocked === true;
      const enabled = unlocked && entry?.enabled !== false;
      const item = entry?.item ?? null;
      const hasItem = !!item;
      const canToggle = unlocked && hasItem;
      const itemName = item ? getItemDisplayMeta(item).displayItem.name : '';
      const currentQi = Math.max(0, Math.floor(Number(entry?.qi ?? 0) || 0));
      const maxQi = Math.max(0, Math.floor(Number(entry?.maxQi ?? 0) || 0));
      const qiPercent = maxQi > 0 ? Math.max(0, Math.min(100, (currentQi / maxQi) * 100)) : 0;
      const qiText = unlocked && hasItem
        ? formatArtifactQiText(currentQi, maxQi)
        : '';
      const stateText = !unlocked
        ? t('equipment.artifact.locked', undefined)
        : enabled ? t('equipment.artifact.enabled', undefined) : t('equipment.artifact.disabled', undefined);
      const titleText = !unlocked
        ? t('equipment.artifact.locked', undefined)
        : hasItem ? itemName : t('equipment.artifact.empty', undefined);
      const metaText = unlocked && hasItem
        ? qiText
        : unlocked ? t('equipment.empty.slot-meta', undefined) : t('equipment.artifact.locked', undefined);
      const shortcutKey = this.artifactShortcutBindings.get(slot) ?? '';
      const shortcutLabel = this.getArtifactShortcutBindLabel(slot);
      const isBindingShortcut = this.bindingArtifactSlot === slot;
      const signature = this.buildArtifactSlotSignature(slot, unlocked, enabled, hasItem, titleText, metaText, currentQi, maxQi, shortcutKey, isBindingShortcut);
      if (this.artifactSlotSignatures.get(slot) === signature) {
        continue;
      }
      this.artifactSlotSignatures.set(slot, signature);
      slotView.root.hidden = false;
      slotView.root.classList.toggle('is-unlocked', unlocked);
      slotView.root.classList.toggle('is-locked', !unlocked);
      slotView.root.classList.toggle('is-enabled', enabled);
      slotView.root.classList.toggle('is-disabled', !enabled);
      slotView.root.classList.toggle('has-item', hasItem);
      slotView.root.classList.toggle('is-empty', !hasItem);
      slotView.root.classList.toggle('is-toggleable', canToggle);
      slotView.root.toggleAttribute('data-artifact-tooltip-slot', hasItem);
      slotView.root.toggleAttribute('data-artifact-click-slot', canToggle);
      if (hasItem) {
        slotView.root.dataset.artifactTooltipSlot = slot;
      } else {
        delete slotView.root.dataset.artifactTooltipSlot;
      }
      if (canToggle) {
        slotView.root.dataset.artifactClickSlot = slot;
        slotView.root.setAttribute('role', 'button');
        slotView.root.tabIndex = 0;
        slotView.root.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      } else {
        delete slotView.root.dataset.artifactClickSlot;
        slotView.root.setAttribute('role', 'group');
        slotView.root.removeAttribute('tabindex');
        slotView.root.removeAttribute('aria-pressed');
      }
      slotView.name.textContent = titleText;
      slotView.name.classList.toggle('is-empty-title', !hasItem);
      slotView.name.querySelectorAll('.action-shortcut-tag').forEach((node) => node.remove());
      if (shortcutKey) {
        const shortcutBadge = document.createElement('span');
        shortcutBadge.className = 'action-shortcut-tag';
        shortcutBadge.textContent = t('action.shortcut.badge', { key: shortcutKey.toUpperCase() });
        slotView.name.append(shortcutBadge);
      }
      slotView.stateBadge.textContent = stateText;
      slotView.item.textContent = '';
      slotView.item.hidden = true;
      slotView.empty.textContent = '';
      slotView.empty.hidden = true;
      slotView.meta.textContent = metaText;
      slotView.meta.hidden = true;
      slotView.qi.hidden = !unlocked || !hasItem;
      slotView.qi.setAttribute('aria-label', qiText);
      slotView.qiText.textContent = qiText;
      slotView.qiFill.style.setProperty('--artifact-qi-percent', `${qiPercent}%`);
      slotView.actions.hidden = !unlocked;
      slotView.shortcutBind.hidden = !unlocked;
      slotView.shortcutBind.disabled = !unlocked;
      slotView.shortcutBind.classList.toggle('is-binding', isBindingShortcut);
      slotView.shortcutBind.textContent = shortcutLabel;
      slotView.action.hidden = !unlocked || !hasItem;
      slotView.action.disabled = !unlocked || !hasItem;
      slotView.action.dataset.unequip = slot;
    }
  }

  /** buildSlotSignature：生成槽位当前展示所需的稳定签名。 */
  private buildSlotSignature(slot: EquipSlot, isVisible: boolean, hasItem: boolean, itemName: string, metaText: string): string {
    return [slot, isVisible ? 'visible' : 'hidden', hasItem ? 'equipped' : 'empty', itemName, metaText].join('|');
  }

  /** buildArtifactSlotSignature：生成法宝槽展示签名。 */
  private buildArtifactSlotSignature(
    slot: ArtifactSlot,
    unlocked: boolean,
    enabled: boolean,
    hasItem: boolean,
    titleText: string,
    metaText: string,
    currentQi: number,
    maxQi: number,
    shortcutKey: string,
    isBindingShortcut: boolean,
  ): string {
    return [
      slot,
      unlocked ? 'unlocked' : 'locked',
      enabled ? 'enabled' : 'disabled',
      hasItem ? 'equipped' : 'empty',
      titleText,
      metaText,
      currentQi,
      maxQi,
      shortcutKey,
      isBindingShortcut ? 'binding' : '',
    ].join('|');
  }

  /** updateTabButtons：同步tab按钮active态。 */
  private updateTabButtons(): void {
    for (const tab of EQUIPMENT_PANEL_TABS) {
      const button = this.tabButtons.get(tab);
      if (!button) {
        continue;
      }
      const active = tab === this.activeTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (this.emptyStateEl) {
      this.emptyStateEl.textContent = '';
      this.emptyStateEl.hidden = true;
    }
  }

  /** resolveSlotItem：按普通装备槽或法宝槽读取当前物品。 */
  private resolveSlotItem(slot: EquipmentPanelUnequipSlot) {
    if (this.isArtifactSlot(slot)) {
      return this.lastArtifacts?.slots.find((entry) => entry.slot === slot)?.item ?? null;
    }
    return this.lastEquipment?.[slot] ?? null;
  }

  /** resolveTooltipTarget：解析当前 tooltip 目标。 */
  private resolveTooltipTarget(node: HTMLElement): { key: string; item: NonNullable<PlayerState['inventory']['items'][number]> } | null {
    const equipSlot = node.dataset.equipTooltipSlot as EquipSlot | undefined;
    if (equipSlot) {
      const item = this.resolveSlotItem(equipSlot);
      return item ? { key: `equip:${equipSlot}`, item } : null;
    }
    const artifactSlot = node.dataset.artifactTooltipSlot as ArtifactSlot | undefined;
    if (artifactSlot) {
      const item = this.resolveSlotItem(artifactSlot);
      return item ? { key: `artifact:${artifactSlot}`, item } : null;
    }
    return null;
  }

  /** isArtifactSlot：判断是否为法宝槽。 */
  private isArtifactSlot(slot: EquipmentPanelUnequipSlot): slot is ArtifactSlot {
    return getArtifactPanelSlotOrder().includes(slot as ArtifactSlot);
  }

  /** bindActionEvents：绑定动作事件。 */
  private bindActionEvents(): void {
    this.pane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const tabButton = target.closest<HTMLButtonElement>('[data-equipment-tab]');
      if (tabButton) {
        return;
      }
      const shortcutBindButton = target.closest<HTMLButtonElement>('[data-artifact-bind-shortcut]');
      const shortcutSlot = shortcutBindButton?.dataset.artifactBindShortcut as ArtifactSlot | undefined;
      if (shortcutBindButton && shortcutSlot && !shortcutBindButton.disabled) {
        this.toggleArtifactShortcutBinding(shortcutSlot);
        return;
      }
      const button = target.closest<HTMLButtonElement>('[data-unequip]');
      const slot = button?.dataset.unequip as EquipmentPanelUnequipSlot | undefined;
      if (button && slot && !button.disabled) {
        // 透传 itemInstanceId 给服务端做乐观一致性校验，防止"装备槽切换 + 卸下"竞争错配
        const slotItem = this.resolveSlotItem(slot);
        const expectedItemInstanceId = slotItem && typeof slotItem.itemInstanceId === 'string'
          ? slotItem.itemInstanceId
          : undefined;
        this.onUnequip?.(slot, expectedItemInstanceId);
        return;
      }
      const artifactSlotNode = target.closest<HTMLElement>('[data-artifact-click-slot]');
      const artifactSlot = artifactSlotNode?.dataset.artifactClickSlot as ArtifactSlot | undefined;
      if (artifactSlot && this.toggleArtifactSlot(artifactSlot)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    this.pane.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest('button')) {
        return;
      }
      const artifactSlotNode = target.closest<HTMLElement>('[data-artifact-click-slot]');
      const artifactSlot = artifactSlotNode?.dataset.artifactClickSlot as ArtifactSlot | undefined;
      if (!artifactSlot || !this.toggleArtifactSlot(artifactSlot)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
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
      if (!(target instanceof HTMLElement) || target.closest('[data-unequip],[data-artifact-bind-shortcut],[data-artifact-click-slot]')) {
        return;
      }
      const slotNode = target.closest<HTMLElement>('[data-equip-tooltip-slot],[data-artifact-tooltip-slot]');
      if (!slotNode) {
        return;
      }
      if (this.tooltip.isPinnedTo(slotNode)) {
        this.tooltipSlot = null;
        this.tooltip.hide(true);
        return;
      }
      const tooltipTarget = this.resolveTooltipTarget(slotNode);
      if (!tooltipTarget) {
        return;
      }
      const tooltip = buildItemTooltipPayload(tooltipTarget.item, { playerRealmLv: this.playerRealmLv });
      this.tooltipSlot = tooltipTarget.key;
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

      const slotNode = target.closest<HTMLElement>('[data-equip-tooltip-slot],[data-artifact-tooltip-slot]');
      if (!slotNode) {
        if (this.tooltipSlot) {
          this.tooltipSlot = null;
          this.tooltip.hide();
        }
        return;
      }

      const tooltipTarget = this.resolveTooltipTarget(slotNode);
      if (!tooltipTarget) {
        if (this.tooltipSlot) {
          this.tooltipSlot = null;
          this.tooltip.hide();
        }
        return;
      }

      if (this.tooltipSlot !== tooltipTarget.key) {
        this.tooltipSlot = tooltipTarget.key;
        const tooltip = buildItemTooltipPayload(tooltipTarget.item, { playerRealmLv: this.playerRealmLv });
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
