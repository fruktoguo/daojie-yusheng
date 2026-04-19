import { NEXT_C2S, type NEXT_C2S_EventPayload } from '@mud/shared-next';
import type { SocketEmitEvent } from './socket-send-types';

type PanelSenderDeps = {
  emitEvent: SocketEmitEvent;
};

export function createSocketPanelSender(deps: PanelSenderDeps) {
  return {
    sendUseItem(slotIndex: number, count?: number): void {
      deps.emitEvent(NEXT_C2S.UseItem, { slotIndex, count });
    },

    sendDropItem(slotIndex: number, count: number): void {
      deps.emitEvent(NEXT_C2S.DropItem, { slotIndex, count });
    },

    sendDestroyItem(slotIndex: number, count: number): void {
      deps.emitEvent(NEXT_C2S.DestroyItem, { slotIndex, count });
    },

    sendTakeLoot(sourceId: string, itemKey?: string, takeAll = false): void {
      deps.emitEvent(NEXT_C2S.TakeGround, { sourceId, itemKey, takeAll });
    },

    sendSortInventory(): void {
      deps.emitEvent(NEXT_C2S.SortInventory, {});
    },

    sendEquip(slotIndex: number): void {
      deps.emitEvent(NEXT_C2S.Equip, { slotIndex });
    },

    sendUnequip(slot: NEXT_C2S_EventPayload<typeof NEXT_C2S.Unequip>['slot']): void {
      deps.emitEvent(NEXT_C2S.Unequip, { slot });
    },

    sendRequestAttrDetail(): void {
      deps.emitEvent(NEXT_C2S.RequestAttrDetail, {});
    },

    sendRequestLeaderboard(limit?: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestLeaderboard>['limit']): void {
      deps.emitEvent(NEXT_C2S.RequestLeaderboard, { limit });
    },

    sendRequestWorldSummary(): void {
      deps.emitEvent(NEXT_C2S.RequestWorldSummary, {});
    },

    sendRequestNpcShop(npcId: string): void {
      deps.emitEvent(NEXT_C2S.RequestNpcShop, { npcId });
    },

    sendBuyNpcShopItem(npcId: string, itemId: string, quantity: number): void {
      deps.emitEvent(NEXT_C2S.BuyNpcShopItem, { npcId, itemId, quantity });
    },

    sendRequestAlchemyPanel(knownCatalogVersion?: number): void {
      deps.emitEvent(NEXT_C2S.RequestAlchemyPanel, { knownCatalogVersion });
    },

    sendSaveAlchemyPreset(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.SaveAlchemyPreset>,
    ): void {
      deps.emitEvent(NEXT_C2S.SaveAlchemyPreset, payload);
    },

    sendDeleteAlchemyPreset(presetId: string): void {
      deps.emitEvent(NEXT_C2S.DeleteAlchemyPreset, { presetId });
    },

    sendStartAlchemy(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.StartAlchemy>,
    ): void {
      deps.emitEvent(NEXT_C2S.StartAlchemy, payload);
    },

    sendCancelAlchemy(): void {
      deps.emitEvent(NEXT_C2S.CancelAlchemy, {});
    },

    sendRequestEnhancementPanel(): void {
      deps.emitEvent(NEXT_C2S.RequestEnhancementPanel, {});
    },

    sendStartEnhancement(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.StartEnhancement>,
    ): void {
      deps.emitEvent(NEXT_C2S.StartEnhancement, payload);
    },

    sendCancelEnhancement(): void {
      deps.emitEvent(NEXT_C2S.CancelEnhancement, {});
    },
  };
}

export type SocketPanelSender = ReturnType<typeof createSocketPanelSender>;
