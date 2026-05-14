/**
 * React 版装备面板
 * 展示 5 个装备槽位的当前装备与词条，支持卸下操作和 tooltip
 */
import { useCallback, useMemo, useRef, memo } from 'react';
import { EquipmentSlots, EQUIP_SLOTS, EquipSlot, PlayerState } from '@mud/shared';
import { getEquipSlotLabel } from '../../../domain-labels';
import { resolvePreviewItem } from '../../../content/local-templates';
import { buildItemTooltipPayload, describeEquipmentBonuses, formatEquipmentConditionText } from '../../../ui/equipment-tooltip';
import { getItemDisplayMeta } from '../../../ui/item-display';
import { describePreviewBonuses } from '../../../ui/stat-preview';
import { formatDisplayInteger, formatDisplayPercent } from '../../../utils/number';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../../../ui/floating-tooltip';
import { createPanelStore } from '../../stores/create-panel-store';
import { t } from '../../../ui/i18n';
import type { EquipmentEffectDef } from '@mud/shared';

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

// ─── 纯逻辑（从原生面板搬入） ───────────────────────────────────────────────

function formatEffectCondition(effect: EquipmentEffectDef): string {
  const parts = formatEquipmentConditionText(effect);
  if (parts.length === 0) return '';
  return ` [${parts.join('，')}]`;
}

function formatItemEffects(item: EquipmentSlots[EquipSlot]): string[] {
  const previewItem = item ? resolvePreviewItem(item) : null;
  if (!previewItem?.effects?.length) return [];
  return previewItem.effects.map((effect) => {
    const conditionText = formatEffectCondition(effect);
    switch (effect.type) {
      case 'stat_aura':
      case 'progress_boost': {
        const effectParts = describePreviewBonuses(effect.attrs, effect.stats, effect.valueStats, effect.attrMode, effect.statMode);
        return t('equipment.effect.stat-aura', { effects: effectParts.join(' / ') || t('equipment.effect.no-value-change'), condition: conditionText });
      }
      case 'periodic_cost': {
        const modeLabel = effect.mode === 'flat'
          ? `${formatDisplayInteger(effect.value)}`
          : effect.mode === 'max_ratio_bp'
            ? t('equipment.effect.max-resource-cost', { percent: formatDisplayPercent(effect.value / 100), resource: effect.resource === 'hp' ? t('equipment.resource.hp') : t('equipment.resource.qi') })
            : t('equipment.effect.current-resource-cost', { percent: formatDisplayPercent(effect.value / 100), resource: effect.resource === 'hp' ? t('equipment.resource.hp') : t('equipment.resource.qi') });
        const triggerLabel = effect.trigger === 'on_cultivation_tick' ? t('equipment.trigger.cultivation-tick') : t('equipment.trigger.tick');
        return t('equipment.effect.periodic-cost', { trigger: triggerLabel, mode: modeLabel, condition: conditionText });
      }
      case 'timed_buff': {
        const triggerMap: Record<string, string> = {
          on_equip: t('equipment.trigger.on-equip'),
          on_unequip: t('equipment.trigger.on-unequip'),
          on_tick: t('equipment.trigger.on-tick'),
          on_move: t('equipment.trigger.on-move'),
          on_attack: t('equipment.trigger.on-attack'),
          on_hit: t('equipment.trigger.on-hit'),
          on_kill: t('equipment.trigger.on-kill'),
          on_skill_cast: t('equipment.trigger.on-skill-cast'),
          on_cultivation_tick: t('equipment.trigger.on-cultivation-tick'),
          on_time_segment_changed: t('equipment.trigger.on-time-segment-changed'),
          on_enter_map: t('equipment.trigger.on-enter-map'),
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

function formatItemBonuses(item: EquipmentSlots[EquipSlot], playerRealmLv?: number | null): string {
  if (!item) return t('equipment.empty.affixes');
  const previewItem = resolvePreviewItem(item);
  const bonusParts = describeEquipmentBonuses(previewItem, playerRealmLv);
  const effectParts = formatItemEffects(item);
  const parts = [...bonusParts, ...effectParts];
  return parts.length > 0 ? parts.join(' / ') : t('equipment.empty.affixes');
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export function EquipmentPanel() {
  const { equipment, playerRealmLv } = useEquipmentPanelStore();
  const tooltipRef = useRef<FloatingTooltip | null>(null);
  const tooltipSlotRef = useRef<EquipSlot | null>(null);
  const tapMode = useMemo(() => prefersPinnedTooltipInteraction(), []);

  const getTooltip = useCallback(() => {
    if (!tooltipRef.current) {
      tooltipRef.current = new FloatingTooltip('floating-tooltip equipment-tooltip');
    }
    return tooltipRef.current;
  }, []);

  if (!equipment) {
    return <div className="empty-hint">{t('equipment.empty.all')}</div>;
  }

  const hasAnyEquipment = EQUIP_SLOTS.some((slot) => !!equipment[slot]);

  const handleUnequip = (slot: EquipSlot) => {
    onUnequipCallback?.(slot);
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
      {!hasAnyEquipment && <div className="empty-hint">{t('equipment.empty.all')}</div>}
      {EQUIP_SLOTS.map((slot) => (
        <EquipmentSlotRow
          key={slot}
          slot={slot}
          item={equipment[slot]}
          playerRealmLv={playerRealmLv}
          onUnequip={handleUnequip}
        />
      ))}
    </div>
  );
}

const EquipmentSlotRow = memo(function EquipmentSlotRow({
  slot,
  item,
  playerRealmLv,
  onUnequip,
}: {
  slot: EquipSlot;
  item: EquipmentSlots[EquipSlot];
  playerRealmLv: number | null;
  onUnequip: (slot: EquipSlot) => void;
}) {
  const hasItem = !!item;
  const itemName = item ? getItemDisplayMeta(item).displayItem.name : '';
  const metaText = item ? formatItemBonuses(item, playerRealmLv) : t('equipment.empty.slot-meta');

  return (
    <div
      className="equip-slot"
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
