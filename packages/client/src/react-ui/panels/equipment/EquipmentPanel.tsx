/**
 * 本文件负责 装备 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { useCallback, useMemo, useRef, useState, memo, type CSSProperties } from 'react';
import { ArtifactSlot, EquipmentSlots, EquipSlot, PlayerState } from '@mud/shared';
import { getEquipSlotLabel } from '../../../domain-labels';
import { buildItemTooltipPayload } from '../../../ui/equipment-tooltip';
import { getItemDisplayMeta } from '../../../ui/item-display';
import {
  EQUIPMENT_PANEL_TAB_EMPTY_KEYS,
  EQUIPMENT_PANEL_TAB_LABEL_KEYS,
  EQUIPMENT_PANEL_TABS,
  type EquipmentPanelTab,
  formatEquipmentSlotCompactMeta,
  getArtifactPanelSlotOrder,
  getEquipmentPanelTabSlotOrder,
  isWideEquipmentPanelSlot,
} from '../../../ui/equipment-panel-layout';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../../../ui/floating-tooltip';
import { createPanelStore } from '../../stores/create-panel-store';
import { t } from '../../../ui/i18n';

// ─── Store ───────────────────────────────────────────────────────────────────

interface EquipmentPanelState {
  equipment: EquipmentSlots | null;
  artifacts: PlayerState['artifacts'] | null;
  playerRealmLv: number | null;
}

export const { store: equipmentPanelStore, useStore: useEquipmentPanelStore } = createPanelStore<EquipmentPanelState>({
  equipment: null,
  artifacts: null,
  playerRealmLv: null,
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

type EquipmentPanelUnequipSlot = EquipSlot | ArtifactSlot;

let onUnequipCallback: ((slot: EquipmentPanelUnequipSlot, expectedItemInstanceId?: string) => void) | null = null;
let onSetArtifactSlotEnabledCallback: ((slot: ArtifactSlot, enabled: boolean) => void) | null = null;

export function setEquipmentPanelCallbacks(callbacks: {
  onUnequip?: (slot: EquipmentPanelUnequipSlot, expectedItemInstanceId?: string) => void;
  onSetArtifactSlotEnabled?: (slot: ArtifactSlot, enabled: boolean) => void;
}): void {
  onUnequipCallback = callbacks.onUnequip ?? null;
  onSetArtifactSlotEnabledCallback = callbacks.onSetArtifactSlotEnabled ?? null;
}

export function syncEquipmentPanelState(input: {
  equipment: EquipmentSlots | null;
  artifacts?: PlayerState['artifacts'] | null;
  player?: PlayerState | null;
  playerRealmLv?: number | null;
}): void {
  const rawRealmLv = input.playerRealmLv ?? input.player?.realm?.realmLv ?? input.player?.realmLv;
  const playerRealmLv = Number.isFinite(Number(rawRealmLv))
    ? Math.max(1, Math.floor(Number(rawRealmLv)))
    : null;

  equipmentPanelStore.patchState({
    equipment: input.equipment,
    artifacts: input.artifacts ?? input.player?.artifacts ?? null,
    playerRealmLv,
  });
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export function EquipmentPanel() {
  const { equipment, artifacts, playerRealmLv } = useEquipmentPanelStore();
  const [activeTab, setActiveTab] = useState<EquipmentPanelTab>('combat');
  const tooltipRef = useRef<FloatingTooltip | null>(null);
  const tooltipSlotRef = useRef<string | null>(null);
  const tapMode = useMemo(() => prefersPinnedTooltipInteraction(), []);
  const activeSlots = useMemo(() => getEquipmentPanelTabSlotOrder(activeTab), [activeTab]);
  const artifactEntries = useMemo(() => {
    const slotEntries = new Map((artifacts?.slots ?? []).map((entry) => [entry.slot, entry]));
    return getArtifactPanelSlotOrder().map((slot) => slotEntries.get(slot) ?? {
      slot,
      unlocked: false,
      enabled: false,
      qi: 0,
      maxQi: 0,
      item: null,
    });
  }, [artifacts]);

  const getTooltip = useCallback(() => {
    if (!tooltipRef.current) {
      tooltipRef.current = new FloatingTooltip('floating-tooltip equipment-tooltip');
    }
    return tooltipRef.current;
  }, []);

  if (!equipment && !artifacts) {
    return <div className="empty-hint">{t('equipment.empty.all')}</div>;
  }

  const hasAnyActiveEquipment = activeTab === 'artifact'
    ? artifactEntries.some((slot) => slot.unlocked && slot.item)
    : activeSlots.some((slot) => !!equipment?.[slot]);

  const handleUnequip = (slot: EquipmentPanelUnequipSlot, expectedItemInstanceId?: string) => {
    onUnequipCallback?.(slot, expectedItemInstanceId);
  };

  const handleArtifactToggle = (slot: ArtifactSlot, enabled: boolean) => {
    onSetArtifactSlotEnabledCallback?.(slot, enabled);
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
    const slotNode = target.closest<HTMLElement>('[data-equip-tooltip-slot],[data-artifact-tooltip-slot]');
    if (!slotNode) {
      if (tooltipSlotRef.current) {
        tooltipSlotRef.current = null;
        getTooltip().hide();
      }
      return;
    }
    const tooltipTarget = resolveTooltipTarget(slotNode, equipment, artifacts);
    if (!tooltipTarget) {
      if (tooltipSlotRef.current) {
        tooltipSlotRef.current = null;
        getTooltip().hide();
      }
      return;
    }
    if (tooltipSlotRef.current !== tooltipTarget.key) {
      tooltipSlotRef.current = tooltipTarget.key;
      const payload = buildItemTooltipPayload(tooltipTarget.item, { playerRealmLv });
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
    if (!(target instanceof HTMLElement) || target.closest('[data-unequip],[data-artifact-toggle]')) return;
    const slotNode = target.closest<HTMLElement>('[data-equip-tooltip-slot],[data-artifact-tooltip-slot]');
    if (!slotNode) return;
    const tooltip = getTooltip();
    if (tooltip.isPinnedTo(slotNode)) {
      tooltipSlotRef.current = null;
      tooltip.hide(true);
      return;
    }
    const tooltipTarget = resolveTooltipTarget(slotNode, equipment, artifacts);
    if (!tooltipTarget) return;
    const payload = buildItemTooltipPayload(tooltipTarget.item, { playerRealmLv });
    tooltipSlotRef.current = tooltipTarget.key;
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
      {activeTab === 'artifact' ? (
        <div className="artifact-slot-list">
          {artifactEntries.map((slot) => (
            <ArtifactSlotRow
              key={slot.slot}
              entry={slot}
              onUnequip={handleUnequip}
              onToggle={handleArtifactToggle}
            />
          ))}
        </div>
      ) : (
        <div className="equip-slot-grid">
          {activeSlots.map((slot) => (
            <EquipmentSlotRow
              key={slot}
              slot={slot}
              item={equipment?.[slot] ?? null}
              onUnequip={handleUnequip}
            />
          ))}
        </div>
      )}
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
  onUnequip: (slot: EquipSlot, expectedItemInstanceId?: string) => void;
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
          onClick={(e) => {
            e.stopPropagation();
            onUnequip(slot, item.itemInstanceId);
          }}
        >
          {t('equipment.action.unequip')}
        </button>
      )}
    </div>
  );
});

const ArtifactSlotRow = memo(function ArtifactSlotRow({
  entry,
  onUnequip,
  onToggle,
}: {
  entry: PlayerState['artifacts']['slots'][number];
  onUnequip: (slot: ArtifactSlot, expectedItemInstanceId?: string) => void;
  onToggle: (slot: ArtifactSlot, enabled: boolean) => void;
}) {
  const hasItem = !!entry.item;
  const itemName = entry.item ? getItemDisplayMeta(entry.item).displayItem.name : '';
  const currentQi = Math.max(0, Math.floor(Number(entry.qi) || 0));
  const maxQi = Math.max(0, Math.floor(Number(entry.maxQi) || 0));
  const qiPercent = maxQi > 0 ? Math.max(0, Math.min(100, (currentQi / maxQi) * 100)) : 0;
  const enabled = entry.unlocked && entry.enabled !== false;
  const stateText = !entry.unlocked
    ? t('equipment.artifact.locked')
    : enabled ? t('equipment.artifact.enabled') : t('equipment.artifact.disabled');
  const qiFillStyle = { '--artifact-qi-percent': `${qiPercent}%` } as CSSProperties;

  return (
    <div
      className={[
        'artifact-slot',
        entry.unlocked ? 'is-unlocked' : 'is-locked',
        enabled ? 'is-enabled' : 'is-disabled',
        hasItem ? 'has-item' : 'is-empty',
      ].join(' ')}
      data-artifact-tooltip-slot={hasItem ? entry.slot : undefined}
    >
      <div className="equip-copy artifact-copy">
        <div className="artifact-slot-head">
          <span className="equip-slot-name">{formatArtifactSlotLabel(entry.slot)}</span>
          <span className="artifact-state-badge">{stateText}</span>
        </div>
        {!entry.unlocked && <span className="equip-slot-empty">{t('equipment.artifact.locked')}</span>}
        {entry.unlocked && hasItem && <span className="equip-slot-item">{itemName}</span>}
        {entry.unlocked && !hasItem && <span className="equip-slot-empty">{t('equipment.artifact.empty')}</span>}
        {entry.unlocked && hasItem ? (
          <div className="artifact-qi" aria-label={t('equipment.artifact.qi', { current: currentQi, max: maxQi })}>
            <span className="artifact-qi-track" aria-hidden="true">
              <span className="artifact-qi-fill" style={qiFillStyle} />
            </span>
            <span className="artifact-qi-text">{t('equipment.artifact.qi', { current: currentQi, max: maxQi })}</span>
          </div>
        ) : (
          <span className="equip-slot-meta">
            {entry.unlocked ? t('equipment.empty.slot-meta') : t('equipment.artifact.locked')}
          </span>
        )}
      </div>
      {entry.unlocked && (
        <div className="artifact-actions">
          <button
            className={`small-btn artifact-toggle${entry.enabled !== false ? ' is-active' : ''}`}
            type="button"
            data-artifact-toggle={entry.slot}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(entry.slot, entry.enabled === false);
            }}
          >
            {entry.enabled !== false ? t('equipment.artifact.enabled') : t('equipment.artifact.disabled')}
          </button>
          {hasItem && (
            <button
              className="small-btn"
              type="button"
              data-unequip={entry.slot}
              onClick={(event) => {
                event.stopPropagation();
                onUnequip(entry.slot, entry.item?.itemInstanceId);
              }}
            >
              {t('equipment.action.unequip')}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

function resolveTooltipTarget(
  node: HTMLElement,
  equipment: EquipmentSlots | null,
  artifacts: PlayerState['artifacts'] | null,
): { key: string; item: NonNullable<PlayerState['inventory']['items'][number]> } | null {
  const equipSlot = node.dataset.equipTooltipSlot as EquipSlot | undefined;
  if (equipSlot) {
    const item = equipment?.[equipSlot] ?? null;
    return item ? { key: `equip:${equipSlot}`, item } : null;
  }
  const artifactSlot = node.dataset.artifactTooltipSlot as ArtifactSlot | undefined;
  if (artifactSlot) {
    const item = artifacts?.slots.find((entry) => entry.slot === artifactSlot)?.item ?? null;
    return item ? { key: `artifact:${artifactSlot}`, item } : null;
  }
  return null;
}

function formatArtifactSlotLabel(slot: ArtifactSlot): string {
  return slot === 'artifact_1' ? t('equipment.tab.artifact') : slot;
}
