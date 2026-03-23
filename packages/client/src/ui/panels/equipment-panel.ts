/**
 * 装备面板
 * 展示 5 个装备槽位的当前装备与词条，支持卸下操作
 */

import { EquipmentEffectDef, EquipmentSlots, EquipSlot, PlayerState } from '@mud/shared';
import { getAttrKeyLabel, getEquipSlotLabel, getNumericScalarStatKeyLabel } from '../../domain-labels';
import { preserveSelection } from '../selection-preserver';
import { FloatingTooltip } from '../floating-tooltip';
import { buildItemTooltipPayload } from '../equipment-tooltip';

const SLOT_ORDER: EquipSlot[] = ['weapon', 'head', 'body', 'legs', 'accessory'];

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

function formatItemEffects(item: EquipmentSlots[EquipSlot]): string[] {
  if (!item?.effects?.length) {
    return [];
  }
  return item.effects.map((effect) => {
    const conditionText = formatEffectCondition(effect);
    switch (effect.type) {
      case 'stat_aura':
      case 'progress_boost': {
        const attrParts = effect.attrs
          ? Object.entries(effect.attrs).map(([key, value]) => `${getAttrKeyLabel(key)}+${value}`)
          : [];
        const statParts = effect.stats
          ? Object.entries(effect.stats)
            .filter(([, value]) => typeof value === 'number' && value !== 0)
            .map(([key, value]) => `${getNumericScalarStatKeyLabel(key)}+${formatBonusValue(key, value as number)}`)
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

function formatItemBonuses(item: EquipmentSlots[EquipSlot]): string {
  if (!item) return '暂无词条';
  const attrParts = item.equipAttrs
    ? Object.entries(item.equipAttrs).map(([key, value]) => `${getAttrKeyLabel(key)}+${value}`)
    : [];
  const statParts = item.equipStats
    ? Object.entries(item.equipStats)
      .filter(([, value]) => typeof value === 'number' && value !== 0)
      .map(([key, value]) => `${getNumericScalarStatKeyLabel(key)}+${formatBonusValue(key, value as number)}`)
    : [];
  const effectParts = formatItemEffects(item);
  const parts = [...attrParts, ...statParts, ...effectParts];
  return parts.length > 0 ? parts.join(' / ') : '暂无词条';
}

/** 装备面板：显示5个装备槽位 */
export class EquipmentPanel {
  private pane = document.getElementById('pane-equipment')!;
  private onUnequip: ((slot: EquipSlot) => void) | null = null;
  private lastEquipment: EquipmentSlots | null = null;
  private tooltip = new FloatingTooltip('floating-tooltip equipment-tooltip');
  private tooltipSlot: EquipSlot | null = null;

  constructor() {
    this.ensureTooltipStyle();
    this.bindTooltipEvents();
  }

  clear(): void {
    this.lastEquipment = null;
    this.tooltipSlot = null;
    this.tooltip.hide();
    this.pane.innerHTML = '<div class="empty-hint">尚未装备任何物品</div>';
  }

  setCallbacks(onUnequip: (slot: EquipSlot) => void): void {
    this.onUnequip = onUnequip;
  }

  /** 更新装备数据并重新渲染 */
  update(equipment: EquipmentSlots): void {
    this.lastEquipment = equipment;
    this.render(equipment);
  }

  initFromPlayer(player: PlayerState): void {
    this.lastEquipment = player.equipment;
    this.render(player.equipment);
  }

  private render(equipment: EquipmentSlots): void {
    let html = '<div class="panel-section">';
    html += '<div class="panel-section-title">装备栏</div>';

    for (const slot of SLOT_ORDER) {
      const item = equipment[slot];
      if (item) {
        const bonusText = formatItemBonuses(item);
        html += `<div class="equip-slot" data-equip-tooltip-slot="${slot}">
          <div class="equip-copy">
            <span class="equip-slot-name">${getEquipSlotLabel(slot)}</span>
            <span class="equip-slot-item">${item.name}</span>
            <span class="equip-slot-meta">${bonusText}</span>
          </div>
          <button class="small-btn" data-unequip="${slot}">卸下</button>
        </div>`;
      } else {
        html += `<div class="equip-slot">
          <div class="equip-copy">
            <span class="equip-slot-name">${getEquipSlotLabel(slot)}</span>
            <span class="equip-slot-empty">空</span>
            <span class="equip-slot-meta">尚未装备</span>
          </div>
        </div>`;
      }
    }

    html += '</div>';
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = html;

      this.pane.querySelectorAll('[data-unequip]').forEach(btn => {
        btn.addEventListener('click', () => {
          const slot = (btn as HTMLElement).dataset.unequip as EquipSlot;
          this.onUnequip?.(slot);
        });
      });
    });
  }

  private bindTooltipEvents(): void {
    this.pane.addEventListener('pointermove', (event) => {
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
        const tooltip = buildItemTooltipPayload(item);
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

  private ensureTooltipStyle(): void {
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
