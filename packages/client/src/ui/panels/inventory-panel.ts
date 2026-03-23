/**
 * 背包面板
 * 展示物品网格列表，支持分类筛选、使用/装备/丢弃操作与物品详情弹层
 */

import { EquipmentEffectDef, Inventory, ItemStack, ItemType, PlayerState, createItemStackSignature } from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { FloatingTooltip } from '../floating-tooltip';
import { preserveSelection } from '../selection-preserver';

const ITEM_TYPE_LABELS: Record<string, string> = {
  consumable: '消耗品',
  equipment: '装备',
  material: '材料',
  quest_item: '任务物',
  skill_book: '功法书',
};
const TOOLTIP_STYLE_ID = 'inventory-panel-tooltip-style';
const SLOT_LABELS: Record<string, string> = {
  weapon: '武器',
  head: '头部',
  body: '身体',
  legs: '腿部',
  accessory: '饰品',
};
const ATTR_LABELS: Record<string, string> = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
};
const STAT_LABELS: Record<string, string> = {
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
  maxQiOutputPerTick: '灵力输出速率',
  qiRegenRate: '灵力回复',
  hpRegenRate: '生命回复',
  cooldownSpeed: '冷却速度',
  auraCostReduce: '光环消耗缩减',
  auraPowerRate: '光环效果增强',
  playerExpRate: '角色经验',
  techniqueExpRate: '功法经验',
  realmExpPerTick: '每息境界经验',
  techniqueExpPerTick: '每息功法经验',
  lootRate: '掉落增幅',
  rareLootRate: '稀有掉落',
  viewRange: '视野范围',
  moveSpeed: '移动速度',
};

type InventoryFilter = 'all' | ItemType;

const FILTER_TABS: Array<{ id: InventoryFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'equipment', label: '装备' },
  { id: 'material', label: '材料' },
  { id: 'skill_book', label: '功法书' },
  { id: 'consumable', label: '消耗品' },
  { id: 'quest_item', label: '任务物' },
];
const USABLE_ITEM_TYPES: ReadonlySet<ItemType> = new Set(['consumable', 'skill_book']);

function formatBonusValue(key: string, value: number): string {
  if (key === 'critDamage') {
    return `${value / 10}%`;
  }
  if (['qiRegenRate', 'hpRegenRate', 'auraCostReduce', 'auraPowerRate', 'playerExpRate', 'techniqueExpRate', 'lootRate', 'rareLootRate'].includes(key)) {
    return `${value / 100}%`;
  }
  return `${value}`;
}

function formatEffectCondition(effect: EquipmentEffectDef): string {
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
        return `生命${condition.op}${Math.round(condition.value * 100)}%`;
      case 'qi_ratio':
        return `灵力${condition.op}${Math.round(condition.value * 100)}%`;
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

function formatItemEffects(item: ItemStack): string[] {
  if (!item.effects || item.effects.length === 0) {
    return [];
  }
  return item.effects.map((effect) => {
    const conditionText = formatEffectCondition(effect);
    switch (effect.type) {
      case 'stat_aura':
      case 'progress_boost': {
        const attrParts = effect.attrs
          ? Object.entries(effect.attrs).map(([key, value]) => `${ATTR_LABELS[key] ?? key}+${value}`)
          : [];
        const statParts = effect.stats
          ? Object.entries(effect.stats)
            .filter(([, value]) => typeof value === 'number' && value !== 0)
            .map(([key, value]) => `${STAT_LABELS[key] ?? key}+${formatBonusValue(key, value as number)}`)
          : [];
        return `特效:${[...attrParts, ...statParts].join(' / ')}${conditionText}`;
      }
      case 'periodic_cost': {
        const modeLabel = effect.mode === 'flat'
          ? `${effect.value}`
          : effect.mode === 'max_ratio_bp'
            ? `${effect.value / 100}% 最大${effect.resource === 'hp' ? '生命' : '灵力'}`
            : `${effect.value / 100}% 当前${effect.resource === 'hp' ? '生命' : '灵力'}`;
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
        return `触发:${triggerMap[effect.trigger] ?? effect.trigger}获得 ${effect.buff.name} ${effect.buff.duration}息${conditionText}`;
      }
      default:
        return '';
    }
  }).filter((line) => line.length > 0);
}

/** 背包面板：显示物品列表，支持使用和丢弃 */
export class InventoryPanel {
  private static readonly MODAL_OWNER = 'inventory-panel';
  private pane = document.getElementById('pane-inventory')!;
  private onUseItem: ((slotIndex: number) => void) | null = null;
  private onDropItem: ((slotIndex: number, count: number) => void) | null = null;
  private onEquipItem: ((slotIndex: number) => void) | null = null;
  private onSortInventory: (() => void) | null = null;
  private tooltip = new FloatingTooltip('floating-tooltip inventory-tooltip');
  private activeFilter: InventoryFilter = 'all';
  private lastInventory: Inventory | null = null;
  private lastStructureKey: string | null = null;
  private selectedSlotIndex: number | null = null;
  private selectedItemKey: string | null = null;
  private tooltipCell: HTMLElement | null = null;

  constructor() {
    this.ensureTooltipStyle();
    this.bindPaneEvents();
    this.bindTooltipEvents();
  }

  clear(): void {
    this.activeFilter = 'all';
    this.lastInventory = null;
    this.lastStructureKey = null;
    this.selectedSlotIndex = null;
    this.selectedItemKey = null;
    this.tooltipCell = null;
    this.tooltip.hide();
    this.pane.innerHTML = '<div class="empty-hint">背包空空如也</div>';
    detailModalHost.close(InventoryPanel.MODAL_OWNER);
  }

  setCallbacks(
    onUse: (slotIndex: number) => void,
    onDrop: (slotIndex: number, count: number) => void,
    onEquip: (slotIndex: number) => void,
    onSort: () => void,
  ): void {
    this.onUseItem = onUse;
    this.onDropItem = onDrop;
    this.onEquipItem = onEquip;
    this.onSortInventory = onSort;
  }

  /** 更新背包数据并刷新列表与弹层 */
  update(inventory: Inventory): void {
    this.lastInventory = inventory;
    const structureKey = this.buildStructureKey(inventory);
    if (this.lastStructureKey !== structureKey || !this.patchList(inventory)) {
      this.render(inventory);
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
  }

  initFromPlayer(player: PlayerState): void {
    this.update(player.inventory);
  }

  private render(inventory: Inventory): void {
    this.lastInventory = inventory;
    const visibleItems = this.getVisibleItems(inventory);
    this.lastStructureKey = this.buildStructureKey(inventory);

    let html = `<div class="panel-section">
      <div class="inventory-panel-head">
        <div class="panel-section-title" data-inventory-title="true">背包 (${inventory.items.length}/${inventory.capacity})</div>
        <button class="small-btn" data-sort-inventory type="button">一键整理</button>
      </div>
      <div class="inventory-filter-tabs">`;

    for (const tab of FILTER_TABS) {
      html += `<button class="inventory-filter-tab ${this.activeFilter === tab.id ? 'active' : ''}" data-filter-button="${tab.id}" data-filter="${tab.id}" type="button">${tab.label}</button>`;
    }

    html += '</div>';

    if (visibleItems.length === 0) {
      html += `<div class="empty-hint" data-inventory-empty="true">${inventory.items.length === 0 ? '背包空空如也' : '当前分类暂无物品'}</div>`;
      html += '</div>';
      preserveSelection(this.pane, () => {
        this.pane.innerHTML = html;
      });
      return;
    }

    html += '<div class="inventory-grid" data-inventory-grid="true">';

    visibleItems.forEach(({ item, slotIndex }) => {
      const tooltip = this.buildTooltipPayload(item);
      const nameClass = this.getNameClass(item.name);
      const primaryAction = this.getPrimaryAction(item);
      html += `<div class="inventory-cell" data-open-item="${slotIndex}" data-item-slot="${slotIndex}" data-item-key="${this.escapeHtml(this.getItemIdentity(item))}" data-tooltip-title="${this.escapeHtml(tooltip.title)}" data-tooltip-detail="${this.escapeHtml(tooltip.detail)}">
        <div class="inventory-cell-head">
          <span class="inventory-cell-type" data-item-type="true">${ITEM_TYPE_LABELS[item.type] ?? item.type}</span>
          <span class="inventory-cell-count" data-item-count="true">x${item.count}</span>
        </div>
        <div class="inventory-cell-name ${nameClass}" data-item-name="true" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</div>
        <div class="inventory-cell-actions">
          ${primaryAction ? `<button class="small-btn" data-inline-primary="${slotIndex}" data-item-primary="true" type="button">${primaryAction.label}</button>` : ''}
          <button class="small-btn danger" data-inline-drop="${slotIndex}" type="button">删除</button>
        </div>
      </div>`;
    });

    html += '</div></div>';
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = html;
    });
  }

  private bindPaneEvents(): void {
    this.pane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const filterButton = target.closest<HTMLElement>('[data-filter-button]');
      if (filterButton) {
        const filter = filterButton.dataset.filter as InventoryFilter | undefined;
        if (!filter || filter === this.activeFilter) {
          return;
        }
        this.activeFilter = filter;
        if (this.lastInventory) {
          this.render(this.lastInventory);
        }
        return;
      }

      if (target.closest('[data-sort-inventory]')) {
        this.onSortInventory?.();
        return;
      }

      const primaryButton = target.closest<HTMLElement>('[data-inline-primary]');
      if (primaryButton) {
        event.stopPropagation();
        const rawIndex = primaryButton.dataset.inlinePrimary;
        if (!rawIndex) {
          return;
        }
        const slotIndex = parseInt(rawIndex, 10);
        const item = this.lastInventory?.items[slotIndex];
        const action = item ? this.getPrimaryAction(item) : null;
        if (!action) {
          return;
        }
        if (action.kind === 'equip') {
          this.onEquipItem?.(slotIndex);
          return;
        }
        this.onUseItem?.(slotIndex);
        return;
      }

      const dropButton = target.closest<HTMLElement>('[data-inline-drop]');
      if (dropButton) {
        event.stopPropagation();
        const rawIndex = dropButton.dataset.inlineDrop;
        if (!rawIndex) {
          return;
        }
        this.onDropItem?.(parseInt(rawIndex, 10), 1);
        return;
      }

      const cell = target.closest<HTMLElement>('[data-open-item]');
      if (!cell) {
        return;
      }
      const rawIndex = cell.dataset.openItem;
      if (!rawIndex) {
        return;
      }
      this.selectedSlotIndex = parseInt(rawIndex, 10);
      const item = this.lastInventory?.items[this.selectedSlotIndex];
      this.selectedItemKey = item ? this.getItemIdentity(item) : null;
      this.tooltip.hide();
      this.tooltipCell = null;
      this.renderModal();
    });
  }

  private bindTooltipEvents(): void {
    const show = (cell: HTMLElement, event: PointerEvent) => {
      const title = cell.dataset.tooltipTitle ?? '';
      const detail = cell.dataset.tooltipDetail ?? '';
      const lines = detail
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      this.tooltip.show(title, lines, event.clientX, event.clientY);
    };

    this.pane.addEventListener('pointermove', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        if (this.tooltipCell) {
          this.tooltipCell = null;
          this.tooltip.hide();
        }
        return;
      }

      const cell = target.closest<HTMLElement>('.inventory-cell');
      if (!cell) {
        if (this.tooltipCell) {
          this.tooltipCell = null;
          this.tooltip.hide();
        }
        return;
      }

      if (this.tooltipCell !== cell) {
        this.tooltipCell = cell;
        show(cell, event);
        return;
      }

      this.tooltip.move(event.clientX, event.clientY);
    });
    this.pane.addEventListener('pointerleave', () => {
      this.tooltipCell = null;
      this.tooltip.hide();
    });
    this.pane.addEventListener('pointerdown', () => {
      if (this.tooltipCell) {
        this.tooltipCell = null;
        this.tooltip.hide();
      }
    });
  }

  private ensureTooltipStyle(): void {
    if (document.getElementById(TOOLTIP_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TOOLTIP_STYLE_ID;
    style.textContent = `
      .inventory-tooltip {
        position: fixed;
        pointer-events: none;
        font-size: 13px;
        color: #1a120a;
        z-index: 2000;
        opacity: 0;
        transition: opacity 120ms ease;
        min-width: 0;
      }
      .inventory-tooltip.visible {
        opacity: 1;
      }
      .inventory-tooltip .floating-tooltip-body {
        min-width: 160px;
      }
      .inventory-tooltip .floating-tooltip-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        line-height: 1.4;
      }
      .inventory-tooltip .floating-tooltip-body strong {
        display: block;
      }
      .inventory-tooltip .floating-tooltip-detail {
        display: flex;
        flex-direction: column;
        gap: 2px;
        color: #5c5349;
      }
      .inventory-tooltip .floating-tooltip-line {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  private renderModal(): void {
    if (!this.lastInventory || !this.selectedItemKey) {
      detailModalHost.close(InventoryPanel.MODAL_OWNER);
      return;
    }

    const resolved = this.resolveSelectedItem(this.lastInventory);
    if (!resolved) {
      this.closeModal();
      return;
    }

    const { item, slotIndex } = resolved;
    const attrLines = item.equipAttrs
      ? Object.entries(item.equipAttrs).map(([key, value]) => `${ATTR_LABELS[key] ?? key} +${value}`)
      : [];
    const statLines = item.equipStats
      ? Object.entries(item.equipStats)
        .filter(([, value]) => typeof value === 'number' && value !== 0)
        .map(([key, value]) => `${STAT_LABELS[key] ?? key} +${formatBonusValue(key, value as number)}`)
      : [];
    const effectLines = formatItemEffects(item);
    const bonusLines = [...attrLines, ...statLines];
    const primaryAction = this.getPrimaryAction(item);

    detailModalHost.open({
      ownerId: InventoryPanel.MODAL_OWNER,
      title: item.name,
      subtitle: `${ITEM_TYPE_LABELS[item.type] ?? item.type} · 数量 x${item.count}`,
      bodyHtml: `
        <div class="quest-detail-grid inventory-detail-grid">
          <div class="quest-detail-section">
            <strong>物品类型</strong>
            <span data-inventory-modal-type="true">${this.escapeHtml(ITEM_TYPE_LABELS[item.type] ?? item.type)}</span>
          </div>
          <div class="quest-detail-section">
            <strong>当前数量</strong>
            <span data-inventory-modal-count="true">x${item.count}</span>
          </div>
          ${item.equipSlot ? `<div class="quest-detail-section">
            <strong>装备部位</strong>
            <span data-inventory-modal-slot="true">${this.escapeHtml(SLOT_LABELS[item.equipSlot] ?? item.equipSlot)}</span>
          </div>` : ''}
        </div>
        <div class="quest-detail-section">
          <strong>物品说明</strong>
          <span data-inventory-modal-desc="true">${this.escapeHtml(item.desc)}</span>
        </div>
        ${bonusLines.length > 0 ? `<div class="quest-detail-section">
          <strong>附加词条</strong>
          <span data-inventory-modal-bonuses="true">${this.escapeHtml(bonusLines.join(' / '))}</span>
        </div>` : ''}
        ${effectLines.length > 0 ? `<div class="quest-detail-section">
          <strong>特殊效果</strong>
          <span data-inventory-modal-effects="true">${this.escapeHtml(effectLines.join(' / '))}</span>
        </div>` : ''}
        <div class="inventory-detail-actions">
          ${primaryAction ? `<button class="small-btn" data-inventory-primary="true" type="button">${primaryAction.label}</button>` : ''}
          <button class="small-btn danger" data-inventory-drop="true" type="button">删除 1 个</button>
        </div>
      `,
      onClose: () => {
        this.selectedSlotIndex = null;
        this.selectedItemKey = null;
      },
      onAfterRender: (body) => {
        body.querySelector<HTMLElement>('[data-inventory-primary]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          if (primaryAction?.kind === 'equip') {
            this.onEquipItem?.(slotIndex);
            return;
          }
          this.onUseItem?.(slotIndex);
        });
        body.querySelector<HTMLElement>('[data-inventory-drop]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.onDropItem?.(slotIndex, 1);
        });
      },
    });
  }

  private patchList(inventory: Inventory): boolean {
    const titleNode = this.pane.querySelector<HTMLElement>('[data-inventory-title="true"]');
    if (!titleNode) {
      return false;
    }
    titleNode.textContent = `背包 (${inventory.items.length}/${inventory.capacity})`;

    for (const tab of FILTER_TABS) {
      const button = this.pane.querySelector<HTMLElement>(`[data-filter-button="${CSS.escape(tab.id)}"]`);
      if (!button) {
        return false;
      }
      button.classList.toggle('active', this.activeFilter === tab.id);
    }

    const visibleItems = this.getVisibleItems(inventory);
    if (visibleItems.length === 0) {
      const emptyNode = this.pane.querySelector<HTMLElement>('[data-inventory-empty="true"]');
      if (!emptyNode) {
        return false;
      }
      emptyNode.textContent = inventory.items.length === 0 ? '背包空空如也' : '当前分类暂无物品';
      this.lastStructureKey = this.buildStructureKey(inventory);
      return true;
    }

    const grid = this.pane.querySelector<HTMLElement>('[data-inventory-grid="true"]');
    if (!grid) {
      return false;
    }

    for (const { item, slotIndex } of visibleItems) {
      const cell = grid.querySelector<HTMLElement>(`[data-item-slot="${CSS.escape(String(slotIndex))}"]`);
      if (!cell) {
        return false;
      }

      const typeNode = cell.querySelector<HTMLElement>('[data-item-type="true"]');
      const countNode = cell.querySelector<HTMLElement>('[data-item-count="true"]');
      const nameNode = cell.querySelector<HTMLElement>('[data-item-name="true"]');
      if (!typeNode || !countNode || !nameNode) {
        return false;
      }

      const tooltip = this.buildTooltipPayload(item);
      const primaryAction = this.getPrimaryAction(item);
      const primaryButton = cell.querySelector<HTMLButtonElement>('[data-item-primary="true"]');

      cell.dataset.itemKey = this.getItemIdentity(item);
      cell.dataset.tooltipTitle = tooltip.title;
      cell.dataset.tooltipDetail = tooltip.detail;
      typeNode.textContent = ITEM_TYPE_LABELS[item.type] ?? item.type;
      countNode.textContent = `x${item.count}`;
      nameNode.textContent = item.name;
      nameNode.title = item.name;
      nameNode.className = `inventory-cell-name ${this.getNameClass(item.name)}`.trim();

      if (primaryAction) {
        if (!primaryButton) {
          return false;
        }
        primaryButton.textContent = primaryAction.label;
        primaryButton.dataset.inlinePrimary = String(slotIndex);
      } else if (primaryButton) {
        return false;
      }
    }

    this.lastStructureKey = this.buildStructureKey(inventory);
    return true;
  }

  private patchModal(): boolean {
    if (!this.lastInventory || !this.selectedItemKey) {
      detailModalHost.close(InventoryPanel.MODAL_OWNER);
      return true;
    }
    if (!detailModalHost.isOpenFor(InventoryPanel.MODAL_OWNER)) {
      return false;
    }

    const resolved = this.resolveSelectedItem(this.lastInventory);
    if (!resolved) {
      this.closeModal();
      return true;
    }

    const { item } = resolved;
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    const typeNode = document.querySelector<HTMLElement>('[data-inventory-modal-type="true"]');
    const countNode = document.querySelector<HTMLElement>('[data-inventory-modal-count="true"]');
    const descNode = document.querySelector<HTMLElement>('[data-inventory-modal-desc="true"]');
    if (!subtitleNode || !typeNode || !countNode || !descNode) {
      return false;
    }

    subtitleNode.textContent = `${ITEM_TYPE_LABELS[item.type] ?? item.type} · 数量 x${item.count}`;
    typeNode.textContent = ITEM_TYPE_LABELS[item.type] ?? item.type;
    countNode.textContent = `x${item.count}`;
    descNode.textContent = item.desc;
    return true;
  }

  private resolveSelectedItem(inventory: Inventory): { item: ItemStack; slotIndex: number } | null {
    if (!this.selectedItemKey) {
      return null;
    }

    if (this.selectedSlotIndex !== null) {
      const current = inventory.items[this.selectedSlotIndex];
      if (current && this.getItemIdentity(current) === this.selectedItemKey) {
        return { item: current, slotIndex: this.selectedSlotIndex };
      }
    }

    const slotIndex = inventory.items.findIndex((item) => this.getItemIdentity(item) === this.selectedItemKey);
    if (slotIndex < 0) {
      return null;
    }
    this.selectedSlotIndex = slotIndex;
    return { item: inventory.items[slotIndex], slotIndex };
  }

  private canUseItem(item: ItemStack): boolean {
    return USABLE_ITEM_TYPES.has(item.type);
  }

  private getPrimaryAction(item: ItemStack): { label: string; kind: 'use' | 'equip' } | null {
    if (item.type === 'equipment') {
      return { label: '装备', kind: 'equip' };
    }
    if (item.type === 'skill_book') {
      return { label: '学习', kind: 'use' };
    }
    if (this.canUseItem(item)) {
      return { label: '使用', kind: 'use' };
    }
    return null;
  }

  private getNameClass(name: string): string {
    const length = [...name].length;
    if (length >= 7) {
      return 'inventory-cell-name--tiny';
    }
    if (length >= 5) {
      return 'inventory-cell-name--compact';
    }
    return '';
  }

  private getItemIdentity(item: ItemStack): string {
    return createItemStackSignature(item);
  }

  private getVisibleItems(inventory: Inventory): Array<{ item: ItemStack; slotIndex: number }> {
    return inventory.items
      .map((item, slotIndex) => ({ item, slotIndex }))
      .filter(({ item }) => this.activeFilter === 'all' || item.type === this.activeFilter);
  }

  private buildStructureKey(inventory: Inventory): string {
    return JSON.stringify({
      filter: this.activeFilter,
      items: this.getVisibleItems(inventory).map(({ item, slotIndex }) => ({
        slotIndex,
        identity: this.getItemIdentity(item),
      })),
    });
  }

  private buildTooltipPayload(item: ItemStack): { title: string; detail: string } {
    const attrLines = item.equipAttrs
      ? Object.entries(item.equipAttrs).map(([key, value]) => `${ATTR_LABELS[key] ?? key} +${value}`)
      : [];
    const statLines = item.equipStats
      ? Object.entries(item.equipStats)
        .filter(([, value]) => typeof value === 'number' && value !== 0)
        .map(([key, value]) => `${STAT_LABELS[key] ?? key} +${formatBonusValue(key, value as number)}`)
      : [];
    const effectLines = formatItemEffects(item);
    const detail = [
      item.desc,
      `类型：${ITEM_TYPE_LABELS[item.type] ?? item.type}`,
      item.equipSlot ? `部位：${SLOT_LABELS[item.equipSlot] ?? item.equipSlot}` : '',
      ...attrLines,
      ...statLines,
      ...effectLines,
    ].filter((line) => line.length > 0).join('\n');

    return {
      title: item.name,
      detail,
    };
  }

  private closeModal(): void {
    this.selectedSlotIndex = null;
    this.selectedItemKey = null;
    this.tooltipCell = null;
    detailModalHost.close(InventoryPanel.MODAL_OWNER);
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
