import { Inventory, PlayerState } from '@mud/shared-next';
import type { MainQuestStateSource } from './main-quest-state-source';
import { CraftWorkbenchModal } from './ui/craft-workbench-modal';
import { NpcShopModal } from './ui/npc-shop-modal';
import { InventoryPanel } from './ui/panels/inventory-panel';
import { MarketPanel } from './ui/panels/market-panel';

type MainInventoryStateSourceOptions = {
  inventoryPanel: InventoryPanel;
  questStateSource: Pick<MainQuestStateSource, 'syncInventory'>;
  marketPanel: MarketPanel;
  npcShopModal: NpcShopModal;
  craftWorkbenchModal: CraftWorkbenchModal;
  syncInventoryBridgeState: (inventory: Inventory | null) => void;
  syncPlayerBridgeState: (player: PlayerState | null) => void;
  sendUseItem: (slotIndex: number, count?: number) => void;
  sendDropItem: (slotIndex: number, count: number) => void;
  sendDestroyItem: (slotIndex: number, count: number) => void;
  sendEquip: (slotIndex: number) => void;
  sendSortInventory: () => void;
};

type InventoryPlayerContext = Parameters<InventoryPanel['syncPlayerContext']>[0];

export type MainInventoryStateSource = ReturnType<typeof createMainInventoryStateSource>;

export function createMainInventoryStateSource(options: MainInventoryStateSourceOptions) {
  options.inventoryPanel.setCallbacks(
    (slotIndex, count) => options.sendUseItem(slotIndex, count),
    (slotIndex, count) => options.sendDropItem(slotIndex, count),
    (slotIndex, count) => options.sendDestroyItem(slotIndex, count),
    (slotIndex) => options.sendEquip(slotIndex),
    () => options.sendSortInventory(),
  );

  return {
    initFromPlayer(player: PlayerState): void {
      options.inventoryPanel.initFromPlayer(player);
      options.marketPanel.initFromPlayer(player);
      options.npcShopModal.initFromPlayer(player);
      options.craftWorkbenchModal.initFromPlayer(player);
    },

    syncPlayerContext(player?: InventoryPlayerContext): void {
      options.inventoryPanel.syncPlayerContext(player);
    },

    syncInventory(inventory: Inventory, player: PlayerState | null): void {
      options.inventoryPanel.update(inventory);
      options.questStateSource.syncInventory(inventory);
      options.marketPanel.syncInventory(inventory);
      options.npcShopModal.syncInventory(inventory);
      options.craftWorkbenchModal.syncInventory();
      options.syncInventoryBridgeState(inventory);
      options.syncPlayerBridgeState(player);
    },

    clear(): void {
      options.inventoryPanel.clear();
      options.marketPanel.clear();
      options.npcShopModal.clear();
      options.craftWorkbenchModal.clear();
    },
  };
}
