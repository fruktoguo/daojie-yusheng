import { Inventory, ItemType, PlayerState } from '@mud/shared';
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
  private pane = document.getElementById('pane-inventory')!;
  private onUseItem: ((slotIndex: number) => void) | null = null;
  private onDropItem: ((slotIndex: number, count: number) => void) | null = null;
  private onEquipItem: ((slotIndex: number) => void) | null = null;
  private onSortInventory: (() => void) | null = null;
  private tooltip = new FloatingTooltip('floating-tooltip inventory-tooltip');
  private activeFilter: InventoryFilter = 'all';
  private lastInventory: Inventory | null = null;

  constructor() {
    this.ensureTooltipStyle();
  }

  clear(): void {
    this.activeFilter = 'all';
    this.lastInventory = null;
    this.tooltip.hide();
    this.pane.innerHTML = '<div class="empty-hint">背包空空如也</div>';
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

  update(inventory: Inventory): void {
    this.lastInventory = inventory;
    this.render(inventory);
  }

  initFromPlayer(player: PlayerState): void {
    this.lastInventory = player.inventory;
    this.render(player.inventory);
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
      const shortName = [...item.name].slice(0, 4).join('');
      html += `<div class="inventory-cell" data-tooltip-title="${this.escapeHtml(item.name)}" data-tooltip-detail="${this.escapeHtml(tooltipLines.join('\n'))}">
        <div class="inventory-cell-head">
          <span class="inventory-cell-type">${ITEM_TYPE_LABELS[item.type] ?? item.type}</span>
          <span class="inventory-cell-count">x${item.count}</span>
        </div>
        <div class="inventory-cell-name">${this.escapeHtml(shortName)}</div>
        <div class="inventory-cell-actions">
          ${item.type === 'equipment' ? `<button class="small-btn" data-equip="${slotIndex}" type="button">装备</button>` : `<button class="small-btn" data-use="${slotIndex}" type="button">使用</button>`}
          <button class="small-btn danger" data-drop="${slotIndex}" type="button">丢弃</button>
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
    this.pane.querySelectorAll('[data-use]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.use!);
        this.onUseItem?.(idx);
      });
    });
    this.pane.querySelectorAll('[data-drop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.drop!);
        this.onDropItem?.(idx, 1);
      });
    });
    this.pane.querySelectorAll('[data-equip]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.equip!);
        this.onEquipItem?.(idx);
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
        background: rgba(255,255,255,0.96);
        border: 1px solid rgba(34,26,19,0.15);
        padding: 8px 12px;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        font-size: 13px;
        color: #1a120a;
        z-index: 2000;
        opacity: 0;
        transition: opacity 120ms ease;
        min-width: 160px;
      }
      .inventory-tooltip.visible {
        opacity: 1;
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

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
