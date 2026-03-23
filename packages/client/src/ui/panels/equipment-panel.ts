/**
 * 装备面板
 * 展示 5 个装备槽位的当前装备与词条，支持卸下操作
 */

import { EquipmentEffectDef, EquipmentSlots, EquipSlot, PlayerState } from '@mud/shared';
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
  const effectParts = formatItemEffects(item);
  const parts = [...attrParts, ...statParts, ...effectParts];
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
