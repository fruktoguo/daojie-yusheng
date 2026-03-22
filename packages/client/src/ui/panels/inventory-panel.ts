/**
 * 背包面板
 * 展示物品网格列表，支持分类筛选、使用/装备/丢弃操作与物品详情弹层
 */

import { Inventory, ItemStack, ItemType, PlayerState, createItemStackSignature } from '@mud/shared';
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
  private selectedSlotIndex: number | null = null;
  private selectedItemKey: string | null = null;

  constructor() {
    this.ensureTooltipStyle();
  }

  clear(): void {
    this.activeFilter = 'all';
    this.lastInventory = null;
    this.selectedSlotIndex = null;
    this.selectedItemKey = null;
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
    this.render(inventory);
    this.renderModal();
  }

  initFromPlayer(player: PlayerState): void {
    this.lastInventory = player.inventory;
    this.render(player.inventory);
    this.renderModal();
  }

  private render(inventory: Inventory): void {
    this.lastInventory = inventory;
    const visibleItems = inventory.items
      .map((item, slotIndex) => ({ item, slotIndex }))
      .filter(({ item }) => this.activeFilter === 'all' || item.type === this.activeFilter);

    let html = `<div class="panel-section">
      <div class="inventory-panel-head">
        <div class="panel-section-title">背包 (${inventory.items.length}/${inventory.capacity})</div>
        <button class="small-btn" data-sort-inventory type="button">一键整理</button>
      </div>
      <div class="inventory-filter-tabs">`;

    for (const tab of FILTER_TABS) {
      html += `<button class="inventory-filter-tab ${this.activeFilter === tab.id ? 'active' : ''}" data-filter="${tab.id}" type="button">${tab.label}</button>`;
    }

    html += '</div>';

    if (visibleItems.length === 0) {
      html += `<div class="empty-hint">${inventory.items.length === 0 ? '背包空空如也' : '当前分类暂无物品'}</div>`;
      html += '</div>';
      preserveSelection(this.pane, () => {
        this.pane.innerHTML = html;
        this.bindActions();
      });
      return;
    }

    html += '<div class="inventory-grid">';

    visibleItems.forEach(({ item, slotIndex }) => {
      const attrLines = item.equipAttrs
        ? Object.entries(item.equipAttrs).map(([key, value]) => `${ATTR_LABELS[key] ?? key} +${value}`)
        : [];
      const statLines = item.equipStats
        ? Object.entries(item.equipStats)
          .filter(([, value]) => typeof value === 'number' && value !== 0)
          .map(([key, value]) => `${STAT_LABELS[key] ?? key} +${formatBonusValue(key, value as number)}`)
        : [];
      const tooltipLines = [
        item.desc,
        `类型：${ITEM_TYPE_LABELS[item.type] ?? item.type}`,
        item.equipSlot ? `部位：${SLOT_LABELS[item.equipSlot] ?? item.equipSlot}` : '',
        ...attrLines,
        ...statLines,
      ].filter((line) => line.length > 0);
      const nameClass = this.getNameClass(item.name);
      const primaryAction = this.getPrimaryAction(item);
      html += `<div class="inventory-cell" data-open-item="${slotIndex}" data-tooltip-title="${this.escapeHtml(item.name)}" data-tooltip-detail="${this.escapeHtml(tooltipLines.join('\n'))}">
        <div class="inventory-cell-head">
          <span class="inventory-cell-type">${ITEM_TYPE_LABELS[item.type] ?? item.type}</span>
          <span class="inventory-cell-count">x${item.count}</span>
        </div>
        <div class="inventory-cell-name ${nameClass}" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</div>
        <div class="inventory-cell-actions">
          ${primaryAction ? `<button class="small-btn" data-inline-primary="${slotIndex}" type="button">${primaryAction.label}</button>` : ''}
          <button class="small-btn danger" data-inline-drop="${slotIndex}" type="button">删除</button>
        </div>
      </div>`;
    });

    html += '</div></div>';
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = html;
      this.bindTooltips();
      this.bindActions();
    });
  }

  private bindActions(): void {
    this.pane.querySelectorAll<HTMLElement>('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter as InventoryFilter | undefined;
        if (!filter || filter === this.activeFilter) {
          return;
        }
        this.activeFilter = filter;
        if (this.lastInventory) {
          this.render(this.lastInventory);
        }
      });
    });
    this.pane.querySelector<HTMLElement>('[data-sort-inventory]')?.addEventListener('click', () => {
      this.onSortInventory?.();
    });
    this.pane.querySelectorAll<HTMLElement>('[data-open-item]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const rawIndex = cell.dataset.openItem;
        if (!rawIndex) {
          return;
        }
        this.selectedSlotIndex = parseInt(rawIndex, 10);
        const item = this.lastInventory?.items[this.selectedSlotIndex];
        this.selectedItemKey = item ? this.getItemIdentity(item) : null;
        this.tooltip.hide();
        this.renderModal();
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-inline-primary]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const rawIndex = button.dataset.inlinePrimary;
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
      });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-inline-drop]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const rawIndex = button.dataset.inlineDrop;
        if (!rawIndex) {
          return;
        }
        this.onDropItem?.(parseInt(rawIndex, 10), 1);
      });
    });
  }

  private bindTooltips(): void {
    const cells = this.pane.querySelectorAll<HTMLElement>('.inventory-cell');
    const show = (title: string, detail: string, event: PointerEvent) => {
      const lines = detail
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      this.tooltip.show(title, lines, event.clientX, event.clientY);
    };

    cells.forEach((cell) => {
      const title = cell.dataset.tooltipTitle ?? '';
      const detail = cell.dataset.tooltipDetail ?? '';
      cell.addEventListener('pointerenter', (event) => show(title, detail, event));
      cell.addEventListener('pointermove', (event) => {
        this.tooltip.move(event.clientX, event.clientY);
      });
      cell.addEventListener('pointerleave', () => {
        this.tooltip.hide();
      });
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
            <span>${this.escapeHtml(ITEM_TYPE_LABELS[item.type] ?? item.type)}</span>
          </div>
          <div class="quest-detail-section">
            <strong>当前数量</strong>
            <span>x${item.count}</span>
          </div>
          ${item.equipSlot ? `<div class="quest-detail-section">
            <strong>装备部位</strong>
            <span>${this.escapeHtml(SLOT_LABELS[item.equipSlot] ?? item.equipSlot)}</span>
          </div>` : ''}
        </div>
        <div class="quest-detail-section">
          <strong>物品说明</strong>
          <span>${this.escapeHtml(item.desc)}</span>
        </div>
        ${bonusLines.length > 0 ? `<div class="quest-detail-section">
          <strong>附加词条</strong>
          <span>${this.escapeHtml(bonusLines.join(' / '))}</span>
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

  private closeModal(): void {
    this.selectedSlotIndex = null;
    this.selectedItemKey = null;
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
