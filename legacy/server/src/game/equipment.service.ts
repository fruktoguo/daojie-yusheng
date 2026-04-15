/**
 * 装备管理：穿戴、卸下、装备属性加成刷新
 */
import { Injectable } from '@nestjs/common';
import {
  PlayerState,
  EquipSlot,
  EquipmentSlots,
  AttrBonus,
  EQUIP_SLOTS,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { EquipmentEffectService } from './equipment-effect.service';
import { InventoryService } from './inventory.service';

@Injectable()
export class EquipmentService {
  constructor(
    private readonly attrService: AttrService,
    private readonly inventoryService: InventoryService,
    private readonly equipmentEffectService: EquipmentEffectService,
  ) {}

  /** 从背包装备到槽位，已有装备则交换回背包 */
  equip(player: PlayerState, slotIndex: number): string | null {
    const item = player.inventory.items[slotIndex];
    if (!item) return '物品不存在';
    if (item.type !== 'equipment' || !item.equipSlot) return '该物品不可装备';

    const slot = item.equipSlot;
    const current = player.equipment[slot];

    const removed = this.inventoryService.removeItem(player, slotIndex, 1);
    if (!removed) {
      return '物品不存在';
    }

    // 旧装备放回背包
    if (current) {
      if (!this.inventoryService.addItem(player, current)) {
        this.inventoryService.addItem(player, removed);
        return '背包已满，无法卸下当前装备';
      }
    }

    player.equipment[slot] = { ...removed, count: 1 };
    this.refreshBonuses(player);
    this.equipmentEffectService.handleEquipmentChange(player, {
      equipped: player.equipment[slot],
      unequipped: current,
    });
    return null;
  }

  /** 从槽位卸下到背包 */
  unequip(player: PlayerState, slot: EquipSlot): string | null {
    const item = player.equipment[slot];
    if (!item) return '该槽位没有装备';

    if (!this.inventoryService.addItem(player, item)) {
      return '背包已满';
    }

    player.equipment[slot] = null;
    this.refreshBonuses(player);
    this.equipmentEffectService.handleEquipmentChange(player, {
      unequipped: item,
    });
    return null;
  }

  /** 登录、读档或 GM 修改后，重建装备静态与动态加成 */
  rebuildBonuses(player: PlayerState): void {
    this.refreshBonuses(player);
    this.equipmentEffectService.handleEquipmentChange(player, {});
  }

  /** 获取所有装备提供的属性加成 */
  getEquipBonuses(equipment: EquipmentSlots): AttrBonus[] {
    const bonuses: AttrBonus[] = [];
    for (const slot of EQUIP_SLOTS) {
      const item = equipment[slot];
      if (item?.equipAttrs || item?.equipStats) {
        bonuses.push({
          source: `equip:${slot}`,
          attrs: item.equipAttrs ?? {},
          stats: item.equipStats,
        });
      }
    }
    return bonuses;
  }

  /** 刷新装备加成并重算属性 */
  private refreshBonuses(player: PlayerState): void {
    // 移除旧的装备加成
    player.bonuses = player.bonuses.filter(b => !b.source.startsWith('equip:'));
    // 添加新的装备加成
    player.bonuses.push(...this.getEquipBonuses(player.equipment));
    this.attrService.recalcPlayer(player);
  }
}

