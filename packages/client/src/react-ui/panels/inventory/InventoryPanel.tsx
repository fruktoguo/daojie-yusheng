/**
 * 本文件负责 背包 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, type CSSProperties } from 'react';
import type { Inventory, ItemType } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { INVENTORY_FILTER_TABS, type InventoryFilter } from '../../../constants/ui/inventory';
import { t } from '../../../ui/i18n';

export interface ReactInventoryItemView {
  slotIndex: number;
  itemInstanceId: string | null;
  itemId: string;
  itemKey: string;
  name: string;
  nameClassName: string;
  countLabel: string;
  itemType: ItemType;
  typeLabel: string;
  cellClassName: string;
  grade?: string;
  affinityBadge?: {
    label: string;
    title: string;
    className: string;
  };
  levelLabel?: string;
  cooldown?: {
    title: string;
    progress: string;
    label: string;
  };
  cooldownRemaining?: number;
  primaryAction: ReactInventoryPrimaryAction | null;
}

export interface ReactInventoryPrimaryAction {
  label: string;
  kind: 'use' | 'equip' | 'status';
  disabled?: boolean;
}

export interface ReactInventoryPanelState {
  inventory: Inventory | null;
  title: string;
  items: ReactInventoryItemView[];
  activeFilter: InventoryFilter;
  totalItems: number;
  totalVisibleItems: number;
  renderedVisibleCount: number;
  capacity: number;
  emptyText: string | null;
  loadHint: string | null;
}

export const { store: inventoryPanelStore, useStore: useInventoryPanelStore } = createPanelStore<ReactInventoryPanelState>({
  inventory: null,
  title: t('inventory.title', undefined),
  items: [],
  activeFilter: 'all',
  totalItems: 0,
  totalVisibleItems: 0,
  renderedVisibleCount: 0,
  capacity: 0,
  emptyText: t('inventory.empty.all', undefined),
  loadHint: null,
});

interface InventoryPanelCallbacks {
  onFilterChange: ((filter: InventoryFilter) => void) | null;
  onSortInventory: (() => void) | null;
  onRequestLoadMore: ((scrollTarget: HTMLElement) => void) | null;
  onPrimaryAction: ((slotIndex: number, itemInstanceId: string | null) => void) | null;
  onDropOne: ((slotIndex: number, itemInstanceId: string) => void) | null;
}

const callbacks: InventoryPanelCallbacks = {
  onFilterChange: null,
  onSortInventory: null,
  onRequestLoadMore: null,
  onPrimaryAction: null,
  onDropOne: null,
};

export function setInventoryPanelCallbacks(cbs: Partial<InventoryPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

export const InventoryPanel = memo(function InventoryPanel() {
  const state = useInventoryPanelStore();

  return (
    <div className="panel-section">
      <div className="inventory-panel-head">
        <div className="panel-section-title" data-inventory-title="true">{state.title}</div>
        <button className="small-btn" type="button" onClick={() => callbacks.onSortInventory?.()}>
          {t('inventory.action.sort', undefined)}
        </button>
      </div>
      <div className="inventory-filter-tabs">
          {INVENTORY_FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`inventory-filter-tab${state.activeFilter === tab.id ? ' active' : ''}`}
              type="button"
              onClick={() => callbacks.onFilterChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
      </div>
      {state.emptyText ? (
        <div className="empty-hint" data-inventory-empty="true">{state.emptyText}</div>
      ) : (
        <div
          className="inventory-grid"
          data-inventory-grid="true"
          onScroll={(event) => callbacks.onRequestLoadMore?.(event.currentTarget)}
        >
          {state.items.map((item) => (
            <InventoryCell key={`${item.slotIndex}:${item.itemKey}`} item={item} />
          ))}
        </div>
      )}
      {state.loadHint && (
        <div className="inventory-load-hint" data-inventory-load-hint="true">
          {state.loadHint}
        </div>
      )}
    </div>
  );
});

const InventoryCell = memo(function InventoryCell({ item }: { item: ReactInventoryItemView }) {
  const cooldownStyle = item.cooldown
    ? ({ '--inventory-cooldown-progress': item.cooldown.progress } as CSSProperties)
    : ({ '--inventory-cooldown-progress': '0' } as CSSProperties);

  return (
    <div
      className={item.cellClassName}
      data-open-item={item.slotIndex}
      data-item-slot={item.slotIndex}
      data-item-key={item.itemKey}
      data-item-type={item.itemType}
      data-item-grade={item.grade}
    >
      <div
        className="inventory-cell-cooldown"
        data-item-cooldown="true"
        aria-label={item.cooldown?.title}
        hidden={!item.cooldown}
      >
        <span
          className="inventory-cell-cooldown-pie"
          data-item-cooldown-pie="true"
          style={cooldownStyle}
        />
        <span className="inventory-cell-cooldown-label" data-item-cooldown-label="true">
          {item.cooldown?.label ?? ''}
        </span>
      </div>
      <div className="inventory-cell-head">
        <span className="inventory-cell-type" data-item-type="true">{item.typeLabel}</span>
        <span className="inventory-cell-count" data-item-count="true">{item.countLabel}</span>
      </div>
      <div className={item.nameClassName} data-item-name="true" aria-label={item.name}>
        {item.name}
      </div>
      <div className="inventory-cell-actions" data-item-actions="true">
        {item.primaryAction && (
          <button
            className="small-btn"
            type="button"
            data-item-primary="true"
            data-inline-primary={item.slotIndex}
            disabled={item.primaryAction.disabled === true}
            onClick={(event) => {
              event.stopPropagation();
              callbacks.onPrimaryAction?.(item.slotIndex, item.itemInstanceId);
            }}
          >
            {item.primaryAction.label}
          </button>
        )}
        <button
          className="small-btn danger"
          type="button"
          data-inline-drop={item.slotIndex}
          onClick={(event) => {
            event.stopPropagation();
            callbacks.onDropOne?.(item.slotIndex, item.itemInstanceId ?? '');
          }}
        >
          {t('inventory.action.drop-one', undefined)}
        </button>
      </div>
      {item.affinityBadge && (
        <span
          className={item.affinityBadge.className}
          data-item-affinity="true"
          aria-label={item.affinityBadge.title}
        >
          {item.affinityBadge.label}
        </span>
      )}
      {item.levelLabel && (
        <span className="item-card-chip item-card-chip--level" data-item-level="true">
          {item.levelLabel}
        </span>
      )}
    </div>
  );
});
