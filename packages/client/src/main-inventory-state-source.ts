import { FormationCreatePayload, Inventory, PlayerState, type FormationRangeShape } from '@mud/shared';
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
 * inventoryPanel：背包面板相关字段。
 */

  inventoryPanel: InventoryPanel;
  /**
 * questStateSource：任务状态来源相关字段。
 */

  questStateSource: Pick<MainQuestStateSource, 'syncInventory'>;
  /**
 * marketStateSource：坊市状态来源相关字段。
 */

  marketStateSource: Pick<MainMarketStateSource, 'initFromPlayer' | 'syncInventory' | 'syncPlayerContext' | 'clear'>;
  /**
 * npcShopModal：NPCShop弹层相关字段。
 */

  npcShopModal: NpcShopModal;
  /**
 * craftWorkbenchModal：炼制Workbench弹层相关字段。
 */

  craftWorkbenchModal: CraftWorkbenchModal;
  /**
 * syncInventoryBridgeState：背包桥接状态状态或数据块。
 */

  syncInventoryBridgeState: (inventory: Inventory | null) => void;
  /**
 * syncPlayerBridgeState：玩家桥接状态状态或数据块。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;
  /**
 * sendUseItem：sendUse道具相关字段。
 */

  sendUseItem: (slotIndex: number, count?: number, options?: { sectName?: string; sectMark?: string }) => void;
  /**
 * sendCreateFormation：send布阵相关字段。
 */

  sendCreateFormation: (payload: FormationCreatePayload) => void;
  /**
 * previewFormationRange：预览布阵范围。
 */

  previewFormationRange?: (payload: { shape: FormationRangeShape; radius: number; rangeHighlightColor?: string } | null) => void;
  /**
 * sendDropItem：sendDrop道具相关字段。
 */

  sendDropItem: (slotIndex: number, count: number) => void;
  /**
 * sendDestroyItem：sendDestroy道具相关字段。
 */

  sendDestroyItem: (slotIndex: number, count: number) => void;
  /**
 * sendEquip：sendEquip相关字段。
 */

  sendEquip: (slotIndex: number) => void;
  /**
 * sendSortInventory：sendSort背包相关字段。
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
 * @returns 无返回值，直接更新Main背包状态来源相关状态。
 */


export function createMainInventoryStateSource(options: MainInventoryStateSourceOptions) {
  options.inventoryPanel.setCallbacks(
    (slotIndex, count, useOptions) => options.sendUseItem(slotIndex, count, useOptions),
    (slotIndex, count) => options.sendDropItem(slotIndex, count),
    (slotIndex, count) => options.sendDestroyItem(slotIndex, count),
    (slotIndex) => options.sendEquip(slotIndex),
    () => options.sendSortInventory(),
    (payload) => options.sendCreateFormation(payload),
    (payload) => options.previewFormationRange?.(payload),
  );

  return {
  /**
 * initFromPlayer：执行initFrom玩家相关逻辑。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新initFrom玩家相关状态。
 */

    initFromPlayer(player: PlayerState): void {
      options.inventoryPanel.initFromPlayer(player);
      options.marketStateSource.initFromPlayer(player);
      options.npcShopModal.initFromPlayer(player);
      options.craftWorkbenchModal.initFromPlayer(player);
    },
    /**
 * syncPlayerContext：处理玩家上下文并更新相关状态。
 * @param player InventoryPlayerContext 玩家对象。
 * @returns 无返回值，直接更新玩家上下文相关状态。
 */


    syncPlayerContext(player?: InventoryPlayerContext): void {
      options.inventoryPanel.syncPlayerContext(player);
      options.marketStateSource.syncPlayerContext(player as PlayerState | undefined);
      options.npcShopModal.syncPlayerContext(player as PlayerState | undefined);
    },
    /**
 * syncInventory：处理背包并更新相关状态。
 * @param inventory Inventory 参数说明。
 * @param player PlayerState | null 玩家对象。
 * @returns 无返回值，直接更新背包相关状态。
 */


    syncInventory(inventory: Inventory, player: PlayerState | null): void {
      options.inventoryPanel.syncPlayerContext(player ?? undefined);
      options.inventoryPanel.update(inventory);
      options.questStateSource.syncInventory(inventory);
      options.marketStateSource.syncInventory(inventory);
      options.npcShopModal.syncInventory(inventory);
      options.craftWorkbenchModal.syncInventory(inventory);
      options.syncInventoryBridgeState(inventory);
      options.syncPlayerBridgeState(player);
    },
    /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      options.inventoryPanel.clear();
      options.marketStateSource.clear();
      options.npcShopModal.clear();
      options.craftWorkbenchModal.clear();
    },
  };
}
