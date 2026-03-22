/**
 * 装备面板
 * 展示 5 个装备槽位的当前装备与词条，支持卸下操作
 */

import { EquipmentSlots, EquipSlot, PlayerState } from '@mud/shared';
import { preserveSelection } from '../selection-preserver';

const SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: '武器',
  head: '头部',
  body: '身体',
  legs: '腿部',
  accessory: '饰品',
};

const SLOT_ORDER: EquipSlot[] = ['weapon', 'head', 'body', 'legs', 'accessory'];
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

function formatBonusValue(key: string, value: number): string {
  if (key === 'critDamage') {
    return `${value / 10}%`;
  }
  if (['qiRegenRate', 'hpRegenRate', 'auraCostReduce', 'auraPowerRate', 'playerExpRate', 'techniqueExpRate', 'lootRate', 'rareLootRate'].includes(key)) {
    return `${value / 100}%`;
  }
  return `${value}`;
}

function formatItemBonuses(item: EquipmentSlots[EquipSlot]): string {
  if (!item) return '暂无词条';
  const attrParts = item.equipAttrs
    ? Object.entries(item.equipAttrs).map(([key, value]) => `${ATTR_LABELS[key] ?? key}+${value}`)
    : [];
  const statParts = item.equipStats
    ? Object.entries(item.equipStats)
      .filter(([, value]) => typeof value === 'number' && value !== 0)
      .map(([key, value]) => `${STAT_LABELS[key] ?? key}+${formatBonusValue(key, value as number)}`)
    : [];
  const parts = [...attrParts, ...statParts];
  return parts.length > 0 ? parts.join(' / ') : '暂无词条';
}

/** 装备面板：显示5个装备槽位 */
export class EquipmentPanel {
  private pane = document.getElementById('pane-equipment')!;
  private onUnequip: ((slot: EquipSlot) => void) | null = null;

  clear(): void {
    this.pane.innerHTML = '<div class="empty-hint">尚未装备任何物品</div>';
  }

  setCallbacks(onUnequip: (slot: EquipSlot) => void): void {
    this.onUnequip = onUnequip;
  }

  /** 更新装备数据并重新渲染 */
  update(equipment: EquipmentSlots): void {
    this.render(equipment);
  }

  initFromPlayer(player: PlayerState): void {
    this.render(player.equipment);
  }

  private render(equipment: EquipmentSlots): void {
    let html = '<div class="panel-section">';
    html += '<div class="panel-section-title">装备栏</div>';

    for (const slot of SLOT_ORDER) {
      const item = equipment[slot];
      if (item) {
        const bonusText = formatItemBonuses(item);
        html += `<div class="equip-slot">
          <div class="equip-copy">
            <span class="equip-slot-name">${SLOT_NAMES[slot]}</span>
            <span class="equip-slot-item">${item.name}</span>
            <span class="equip-slot-meta">${bonusText}</span>
          </div>
          <button class="small-btn" data-unequip="${slot}">卸下</button>
        </div>`;
      } else {
        html += `<div class="equip-slot">
          <div class="equip-copy">
            <span class="equip-slot-name">${SLOT_NAMES[slot]}</span>
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
}
