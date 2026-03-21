import { Injectable } from '@nestjs/common';
import { PlayerState, ItemStack, ItemType, EquipSlot } from '@mud/shared';

const ITEM_TYPE_ORDER: Record<ItemType, number> = {
  equipment: 0,
  consumable: 1,
  material: 2,
  skill_book: 3,
  quest_item: 4,
};

const EQUIP_SLOT_ORDER: Record<EquipSlot, number> = {
  weapon: 0,
  head: 1,
  body: 2,
  legs: 3,
  accessory: 4,
};

@Injectable()
export class InventoryService {
  getItem(player: PlayerState, slotIndex: number): ItemStack | null {
    return player.inventory.items[slotIndex] ?? null;
  }

  /** 添加物品到背包，返回是否成功 */
  addItem(player: PlayerState, item: ItemStack): boolean {
    // 尝试堆叠到已有同类物品
    const existing = player.inventory.items.find(
      i => i.itemId === item.itemId && i.type !== 'equipment',
    );
    if (existing) {
      existing.count += item.count;
      return true;
    }
    if (player.inventory.items.length >= player.inventory.capacity) {
      return false;
    }
    player.inventory.items.push({ ...item });
    return true;
  }

  /** 从背包移除物品，返回被移除的物品栈（部分或全部） */
  removeItem(player: PlayerState, slotIndex: number, count: number): ItemStack | null {
    const item = player.inventory.items[slotIndex];
    if (!item || count <= 0) return null;
    const removed = Math.min(count, item.count);
    item.count -= removed;
    const result: ItemStack = { ...item, count: removed };
    if (item.count <= 0) {
      player.inventory.items.splice(slotIndex, 1);
    }
    return result;
  }

  /** 使用物品，返回错误信息或 null */
  useItem(player: PlayerState, slotIndex: number): string | null {
    const item = player.inventory.items[slotIndex];
    if (!item) return '物品不存在';
    if (item.type !== 'consumable' && item.type !== 'skill_book') return '该物品不可使用';
    // 消耗一个
    item.count -= 1;
    if (item.count <= 0) {
      player.inventory.items.splice(slotIndex, 1);
    }
    return null;
  }

  /** 丢弃物品，返回被移除的物品栈 */
  dropItem(player: PlayerState, slotIndex: number, count: number): ItemStack | null {
    return this.removeItem(player, slotIndex, count);
  }

  /** 查找物品在背包中的槽位索引，-1 表示未找到 */
  findItem(player: PlayerState, itemId: string): number {
    return player.inventory.items.findIndex(i => i.itemId === itemId);
  }

  /** 整理背包：合并可堆叠物品，并按类型与名称稳定排序 */
  sortInventory(player: PlayerState): void {
    const stackableItems = new Map<string, ItemStack>();
    const equipmentItems: ItemStack[] = [];

    for (const item of player.inventory.items) {
      if (item.count <= 0) {
        continue;
      }
      if (item.type === 'equipment') {
        equipmentItems.push({ ...item });
        continue;
      }

      const existing = stackableItems.get(item.itemId);
      if (existing) {
        existing.count += item.count;
        continue;
      }
      stackableItems.set(item.itemId, { ...item });
    }

    player.inventory.items = [...equipmentItems, ...stackableItems.values()].sort((left, right) => {
      const typeDiff = ITEM_TYPE_ORDER[left.type] - ITEM_TYPE_ORDER[right.type];
      if (typeDiff !== 0) {
        return typeDiff;
      }

      if (left.type === 'equipment' && right.type === 'equipment') {
        const leftSlot = left.equipSlot ? EQUIP_SLOT_ORDER[left.equipSlot] : Number.MAX_SAFE_INTEGER;
        const rightSlot = right.equipSlot ? EQUIP_SLOT_ORDER[right.equipSlot] : Number.MAX_SAFE_INTEGER;
        if (leftSlot !== rightSlot) {
          return leftSlot - rightSlot;
        }
      }

      const nameDiff = left.name.localeCompare(right.name, 'zh-Hans-CN');
      if (nameDiff !== 0) {
        return nameDiff;
      }

      const itemIdDiff = left.itemId.localeCompare(right.itemId);
      if (itemIdDiff !== 0) {
        return itemIdDiff;
      }

      return right.count - left.count;
    });
  }
}
