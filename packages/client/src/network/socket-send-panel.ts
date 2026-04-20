import { NEXT_C2S, type NEXT_C2S_EventPayload } from '@mud/shared-next';
import type { SocketEmitEvent } from './socket-send-types';
/**
 * PanelSenderDeps：统一结构类型，保证协议与运行时一致性。
 */


type PanelSenderDeps = {
/**
 * emitEvent：对象字段。
 */

  emitEvent: SocketEmitEvent;
};
/**
 * createSocketPanelSender：构建并返回目标对象。
 * @param deps PanelSenderDeps 运行时依赖。
 * @returns 函数返回值。
 */


export function createSocketPanelSender(deps: PanelSenderDeps) {
  return {  
  /**
 * sendUseItem：执行核心业务逻辑。
 * @param slotIndex number 参数说明。
 * @param count number 数量。
 * @returns void。
 */

    sendUseItem(slotIndex: number, count?: number): void {
      deps.emitEvent(NEXT_C2S.UseItem, { slotIndex, count });
    },    
    /**
 * sendDropItem：执行核心业务逻辑。
 * @param slotIndex number 参数说明。
 * @param count number 数量。
 * @returns void。
 */


    sendDropItem(slotIndex: number, count: number): void {
      deps.emitEvent(NEXT_C2S.DropItem, { slotIndex, count });
    },    
    /**
 * sendDestroyItem：执行核心业务逻辑。
 * @param slotIndex number 参数说明。
 * @param count number 数量。
 * @returns void。
 */


    sendDestroyItem(slotIndex: number, count: number): void {
      deps.emitEvent(NEXT_C2S.DestroyItem, { slotIndex, count });
    },    
    /**
 * sendTakeLoot：执行核心业务逻辑。
 * @param sourceId string source ID。
 * @param itemKey string 参数说明。
 * @param takeAll 参数说明。
 * @returns void。
 */


    sendTakeLoot(sourceId: string, itemKey?: string, takeAll = false): void {
      deps.emitEvent(NEXT_C2S.TakeGround, { sourceId, itemKey, takeAll });
    },    
    /**
 * sendSortInventory：执行核心业务逻辑。
 * @returns void。
 */


    sendSortInventory(): void {
      deps.emitEvent(NEXT_C2S.SortInventory, {});
    },    
    /**
 * sendEquip：执行核心业务逻辑。
 * @param slotIndex number 参数说明。
 * @returns void。
 */


    sendEquip(slotIndex: number): void {
      deps.emitEvent(NEXT_C2S.Equip, { slotIndex });
    },    
    /**
 * sendUnequip：执行核心业务逻辑。
 * @param slot NEXT_C2S_EventPayload<typeof NEXT_C2S.Unequip>['slot'] 参数说明。
 * @returns void。
 */


    sendUnequip(slot: NEXT_C2S_EventPayload<typeof NEXT_C2S.Unequip>['slot']): void {
      deps.emitEvent(NEXT_C2S.Unequip, { slot });
    },    
    /**
 * sendRequestAttrDetail：执行核心业务逻辑。
 * @returns void。
 */


    sendRequestAttrDetail(): void {
      deps.emitEvent(NEXT_C2S.RequestAttrDetail, {});
    },    
    /**
 * sendRequestLeaderboard：执行核心业务逻辑。
 * @param limit NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestLeaderboard>['limit'] 参数说明。
 * @returns void。
 */


    sendRequestLeaderboard(limit?: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestLeaderboard>['limit']): void {
      deps.emitEvent(NEXT_C2S.RequestLeaderboard, { limit });
    },    
    /**
 * sendRequestWorldSummary：执行核心业务逻辑。
 * @returns void。
 */


    sendRequestWorldSummary(): void {
      deps.emitEvent(NEXT_C2S.RequestWorldSummary, {});
    },    
    /**
 * sendRequestNpcShop：执行核心业务逻辑。
 * @param npcId string npc ID。
 * @returns void。
 */


    sendRequestNpcShop(npcId: string): void {
      deps.emitEvent(NEXT_C2S.RequestNpcShop, { npcId });
    },    
    /**
 * sendBuyNpcShopItem：执行核心业务逻辑。
 * @param npcId string npc ID。
 * @param itemId string 道具 ID。
 * @param quantity number 参数说明。
 * @returns void。
 */


    sendBuyNpcShopItem(npcId: string, itemId: string, quantity: number): void {
      deps.emitEvent(NEXT_C2S.BuyNpcShopItem, { npcId, itemId, quantity });
    },    
    /**
 * sendRequestAlchemyPanel：执行核心业务逻辑。
 * @param knownCatalogVersion number 参数说明。
 * @returns void。
 */


    sendRequestAlchemyPanel(knownCatalogVersion?: number): void {
      deps.emitEvent(NEXT_C2S.RequestAlchemyPanel, { knownCatalogVersion });
    },    
    /**
 * sendSaveAlchemyPreset：执行核心业务逻辑。
 * @param payload NEXT_C2S_EventPayload<typeof NEXT_C2S.SaveAlchemyPreset> 载荷参数。
 * @returns void。
 */


    sendSaveAlchemyPreset(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.SaveAlchemyPreset>,
    ): void {
      deps.emitEvent(NEXT_C2S.SaveAlchemyPreset, payload);
    },    
    /**
 * sendDeleteAlchemyPreset：执行核心业务逻辑。
 * @param presetId string preset ID。
 * @returns void。
 */


    sendDeleteAlchemyPreset(presetId: string): void {
      deps.emitEvent(NEXT_C2S.DeleteAlchemyPreset, { presetId });
    },    
    /**
 * sendStartAlchemy：执行核心业务逻辑。
 * @param payload NEXT_C2S_EventPayload<typeof NEXT_C2S.StartAlchemy> 载荷参数。
 * @returns void。
 */


    sendStartAlchemy(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.StartAlchemy>,
    ): void {
      deps.emitEvent(NEXT_C2S.StartAlchemy, payload);
    },    
    /**
 * sendCancelAlchemy：执行核心业务逻辑。
 * @returns void。
 */


    sendCancelAlchemy(): void {
      deps.emitEvent(NEXT_C2S.CancelAlchemy, {});
    },    
    /**
 * sendRequestEnhancementPanel：执行核心业务逻辑。
 * @returns void。
 */


    sendRequestEnhancementPanel(): void {
      deps.emitEvent(NEXT_C2S.RequestEnhancementPanel, {});
    },    
    /**
 * sendStartEnhancement：执行核心业务逻辑。
 * @param payload NEXT_C2S_EventPayload<typeof NEXT_C2S.StartEnhancement> 载荷参数。
 * @returns void。
 */


    sendStartEnhancement(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.StartEnhancement>,
    ): void {
      deps.emitEvent(NEXT_C2S.StartEnhancement, payload);
    },    
    /**
 * sendCancelEnhancement：执行核心业务逻辑。
 * @returns void。
 */


    sendCancelEnhancement(): void {
      deps.emitEvent(NEXT_C2S.CancelEnhancement, {});
    },
  };
}
/**
 * SocketPanelSender：统一结构类型，保证协议与运行时一致性。
 */


export type SocketPanelSender = ReturnType<typeof createSocketPanelSender>;
