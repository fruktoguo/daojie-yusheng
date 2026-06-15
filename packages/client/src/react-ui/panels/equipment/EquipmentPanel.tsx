/**
 * 本文件负责 装备 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { useCallback, useMemo, useRef, useState, memo } from 'react';
import { EquipmentSlots, EquipSlot, PlayerState } from '@mud/shared';
import { getEquipSlotLabel } from '../../../domain-labels';
import { buildItemTooltipPayload } from '../../../ui/equipment-tooltip';
import { getItemDisplayMeta } from '../../../ui/item-display';
import {
  EQUIPMENT_PANEL_TAB_EMPTY_KEYS,
  EQUIPMENT_PANEL_TAB_LABEL_KEYS,
  EQUIPMENT_PANEL_TABS,
  type EquipmentPanelTab,
  formatEquipmentSlotCompactMeta,
  getEquipmentPanelTabSlotOrder,
  isWideEquipmentPanelSlot,
} from '../../../ui/equipment-panel-layout';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../../../ui/floating-tooltip';
import { createPanelStore } from '../../stores/create-panel-store';
import { t } from '../../../ui/i18n';

// ─── Store ───────────────────────────────────────────────────────────────────

interface EquipmentPanelState {
  equipment: EquipmentSlots | null;
  playerRealmLv: number | null;
}

export const { store: equipmentPanelStore, useStore: useEquipmentPanelStore } = createPanelStore<EquipmentPanelState>({
  equipment: null,
  playerRealmLv: null,
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

let onUnequipCallback: ((slot: EquipSlot) => void) | null = null;

export function setEquipmentPanelCallbacks(callbacks: { onUnequip?: (slot: EquipSlot) => void }): void {
  onUnequipCallback = callbacks.onUnequip ?? null;
}

export function syncEquipmentPanelState(input: {
  equipment: EquipmentSlots | null;
  player?: PlayerState | null;
  playerRealmLv?: number | null;
}): void {
  const rawRealmLv = input.playerRealmLv ?? input.player?.realm?.realmLv ?? input.player?.realmLv;
  const playerRealmLv = Number.isFinite(Number(rawRealmLv))
    ? Math.max(1, Math.floor(Number(rawRealmLv)))
    : null;

  equipmentPanelStore.patchState({
    equipment: input.equipment,
    playerRealmLv,
  });
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export function EquipmentPanel() {
  const { equipment, playerRealmLv } = useEquipmentPanelStore();
  const [activeTab, setActiveTab] = useState<EquipmentPanelTab>('combat');
  const tooltipRef = useRef<FloatingTooltip | null>(null);
  const tooltipSlotRef = useRef<EquipSlot | null>(null);
  const tapMode = useMemo(() => prefersPinnedTooltipInteraction(), []);
  const activeSlots = useMemo(() => getEquipmentPanelTabSlotOrder(activeTab), [activeTab]);

  const getTooltip = useCallback(() => {
    if (!tooltipRef.current) {
      tooltipRef.current = new FloatingTooltip('floating-tooltip equipment-tooltip');
    }
    return tooltipRef.current;
  }, []);

  if (!equipment) {
    return <div className="empty-hint">{t('equipment.empty.all')}</div>;
  }

  const hasAnyActiveEquipment = activeSlots.some((slot) => !!equipment[slot]);

  const handleUnequip = (slot: EquipSlot) => {
    onUnequipCallback?.(slot);
  };

  const handleTabChange = (tab: EquipmentPanelTab) => {
    if (tab === activeTab) {
      return;
    }
    tooltipSlotRef.current = null;
    getTooltip().hide(true);
    setActiveTab(tab);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (tapMode && getTooltip().isPinned()) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      if (tooltipSlotRef.current) {
        tooltipSlotRef.current = null;
        getTooltip().hide();
      }
      return;
    }
    const slotNode = target.closest<HTMLElement>('[data-equip-tooltip-slot]');
    if (!slotNode) {
      if (tooltipSlotRef.current) {
        tooltipSlotRef.current = null;
        getTooltip().hide();
      }
      return;
    }
    const slot = slotNode.dataset.equipTooltipSlot as EquipSlot | undefined;
    const item = slot ? equipment[slot] : null;
    if (!slot || !item) {
      if (tooltipSlotRef.current) {
        tooltipSlotRef.current = null;
        getTooltip().hide();
      }
      return;
    }
    if (tooltipSlotRef.current !== slot) {
      tooltipSlotRef.current = slot;
      const payload = buildItemTooltipPayload(item, { playerRealmLv });
      getTooltip().show(payload.title, payload.lines, event.clientX, event.clientY, {
        allowHtml: payload.allowHtml,
        asideCards: payload.asideCards,
      });
      return;
    }
    getTooltip().move(event.clientX, event.clientY);
  };

  const handlePointerLeave = () => {
    tooltipSlotRef.current = null;
    getTooltip().hide();
  };

  const handleClick = (event: React.MouseEvent) => {
    if (!tapMode) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest('[data-unequip]')) return;
    const slotNode = target.closest<HTMLElement>('[data-equip-tooltip-slot]');
    if (!slotNode) return;
    const tooltip = getTooltip();
    if (tooltip.isPinnedTo(slotNode)) {
      tooltipSlotRef.current = null;
      tooltip.hide(true);
      return;
    }
    const slot = slotNode.dataset.equipTooltipSlot as EquipSlot | undefined;
    const item = slot ? equipment[slot] : null;
    if (!slot || !item) return;
    const payload = buildItemTooltipPayload(item, { playerRealmLv });
    tooltipSlotRef.current = slot;
    tooltip.showPinned(slotNode, payload.title, payload.lines, event.clientX, event.clientY, {
      allowHtml: payload.allowHtml,
      asideCards: payload.asideCards,
    });
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className="panel-section"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      <div className="panel-section-title">{t('equipment.title')}</div>
      <div className="equipment-subtabs" role="tablist" aria-label={t('equipment.title')}>
        {EQUIPMENT_PANEL_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`equipment-subtab${tab === activeTab ? ' is-active' : ''}`}
            role="tab"
            aria-selected={tab === activeTab}
            onClick={() => handleTabChange(tab)}
          >
            {t(EQUIPMENT_PANEL_TAB_LABEL_KEYS[tab])}
          </button>
        ))}
      </div>
      {!hasAnyActiveEquipment && <div className="empty-hint">{t(EQUIPMENT_PANEL_TAB_EMPTY_KEYS[activeTab])}</div>}
      <div className="equip-slot-grid">
        {activeSlots.map((slot) => (
          <EquipmentSlotRow
            key={slot}
            slot={slot}
            item={equipment[slot]}
            onUnequip={handleUnequip}
          />
        ))}
      </div>
    </div>
  );
}

const EquipmentSlotRow = memo(function EquipmentSlotRow({
  slot,
  item,
  onUnequip,
}: {
  slot: EquipSlot;
  item: EquipmentSlots[EquipSlot];
  onUnequip: (slot: EquipSlot) => void;
}) {
  const hasItem = !!item;
  const itemName = item ? getItemDisplayMeta(item).displayItem.name : '';
  const metaText = item ? formatEquipmentSlotCompactMeta(item) : t('equipment.empty.slot-meta');

  return (
    <div
      className={`equip-slot${isWideEquipmentPanelSlot(slot) ? ' equip-slot--wide' : ''}`}
      data-equip-tooltip-slot={hasItem ? slot : undefined}
    >
      <div className="equip-copy">
        <span className="equip-slot-name">{getEquipSlotLabel(slot)}</span>
        {hasItem && <span className="equip-slot-item">{itemName}</span>}
        {!hasItem && <span className="equip-slot-empty">{t('equipment.empty.slot-short')}</span>}
        <span className="equip-slot-meta">{metaText}</span>
      </div>
      {hasItem && (
        <button
          className="small-btn"
          type="button"
          data-unequip={slot}
          onClick={(e) => { e.stopPropagation(); onUnequip(slot); }}
        >
          {t('equipment.action.unequip')}
        </button>
      )}
    </div>
  );
});
