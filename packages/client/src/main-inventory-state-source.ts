import { Inventory, PlayerState } from '@mud/shared-next';
import type { MainMarketStateSource } from './main-market-state-source';
import type { MainQuestStateSource } from './main-quest-state-source';
import { CraftWorkbenchModal } from './ui/craft-workbench-modal';
import { NpcShopModal } from './ui/npc-shop-modal';
import { InventoryPanel } from './ui/panels/inventory-panel';
/**
 * MainInventoryStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainInventoryStateSourceOptions = {
/**
 * inventoryPanel：对象字段。
 */

  inventoryPanel: InventoryPanel;  
  /**
 * questStateSource：对象字段。
 */

  questStateSource: Pick<MainQuestStateSource, 'syncInventory'>;  
  /**
 * marketStateSource：对象字段。
 */

  marketStateSource: Pick<MainMarketStateSource, 'initFromPlayer' | 'syncInventory' | 'clear'>;  
  /**
 * npcShopModal：对象字段。
 */

  npcShopModal: NpcShopModal;  
  /**
 * craftWorkbenchModal：对象字段。
 */

  craftWorkbenchModal: CraftWorkbenchModal;  
  /**
 * syncInventoryBridgeState：对象字段。
 */

  syncInventoryBridgeState: (inventory: Inventory | null) => void;  
  /**
 * syncPlayerBridgeState：对象字段。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;  
  /**
 * sendUseItem：对象字段。
 */

  sendUseItem: (slotIndex: number, count?: number) => void;  
  /**
 * sendDropItem：对象字段。
 */

  sendDropItem: (slotIndex: number, count: number) => void;  
  /**
 * sendDestroyItem：对象字段。
 */

  sendDestroyItem: (slotIndex: number, count: number) => void;  
  /**
 * sendEquip：对象字段。
 */

  sendEquip: (slotIndex: number) => void;  
  /**
 * sendSortInventory：对象字段。
 */

  sendSortInventory: () => void;
};
/**
 * InventoryPlayerContext：统一结构类型，保证协议与运行时一致性。
 */


type InventoryPlayerContext = Parameters<InventoryPanel['syncPlayerContext']>[0];
/**
 * MainInventoryStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainInventoryStateSource = ReturnType<typeof createMainInventoryStateSource>;
/**
 * createMainInventoryStateSource：构建并返回目标对象。
 * @param options MainInventoryStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainInventoryStateSource(options: MainInventoryStateSourceOptions) {
  options.inventoryPanel.setCallbacks(
    (slotIndex, count) => options.sendUseItem(slotIndex, count),
    (slotIndex, count) => options.sendDropItem(slotIndex, count),
    (slotIndex, count) => options.sendDestroyItem(slotIndex, count),
    (slotIndex) => options.sendEquip(slotIndex),
    () => options.sendSortInventory(),
  );

  return {  
  /**
 * initFromPlayer：初始化并准备运行时基础状态。
 * @param player PlayerState 玩家对象。
 * @returns void。
 */

    initFromPlayer(player: PlayerState): void {
      options.inventoryPanel.initFromPlayer(player);
      options.marketStateSource.initFromPlayer(player);
      options.npcShopModal.initFromPlayer(player);
      options.craftWorkbenchModal.initFromPlayer(player);
    },    
    /**
 * syncPlayerContext：执行核心业务逻辑。
 * @param player InventoryPlayerContext 玩家对象。
 * @returns void。
 */


    syncPlayerContext(player?: InventoryPlayerContext): void {
      options.inventoryPanel.syncPlayerContext(player);
    },    
    /**
 * syncInventory：执行核心业务逻辑。
 * @param inventory Inventory 参数说明。
 * @param player PlayerState | null 玩家对象。
 * @returns void。
 */


    syncInventory(inventory: Inventory, player: PlayerState | null): void {
      options.inventoryPanel.update(inventory);
      options.questStateSource.syncInventory(inventory);
      options.marketStateSource.syncInventory(inventory);
      options.npcShopModal.syncInventory(inventory);
      options.craftWorkbenchModal.syncInventory();
      options.syncInventoryBridgeState(inventory);
      options.syncPlayerBridgeState(player);
    },    
    /**
 * clear：执行核心业务逻辑。
 * @returns void。
 */


    clear(): void {
      options.inventoryPanel.clear();
      options.marketStateSource.clear();
      options.npcShopModal.clear();
      options.craftWorkbenchModal.clear();
    },
  };
}
