import { C2S, type ClientToServerEventPayload } from '@mud/shared';
import type { SocketEmitEvent } from './socket-send-types';
import {
  emitTechniqueActivityCancel,
  emitTechniqueActivityPanelRequest,
  emitTechniqueActivityStart,
} from '../technique-activity-client.helpers';
/**
 * PanelSenderDeps：统一结构类型，保证协议与运行时一致性。
 */


type PanelSenderDeps = {
/**
 * emitEvent：事件相关字段。
 */

  emitEvent: SocketEmitEvent;
};

function sendTechniqueActivityRequest(
  deps: PanelSenderDeps,
  kind: 'alchemy',
  payload: ClientToServerEventPayload<typeof C2S.RequestAlchemyPanel>,
): void;
function sendTechniqueActivityRequest(
  deps: PanelSenderDeps,
  kind: 'enhancement',
  payload: ClientToServerEventPayload<typeof C2S.RequestEnhancementPanel>,
): void;
function sendTechniqueActivityRequest(
  deps: PanelSenderDeps,
  kind: 'alchemy' | 'enhancement',
  payload: ClientToServerEventPayload<typeof C2S.RequestAlchemyPanel> | ClientToServerEventPayload<typeof C2S.RequestEnhancementPanel>,
): void {
  emitTechniqueActivityPanelRequest(deps.emitEvent, kind, payload as never);
}

function sendTechniqueActivityStart(
  deps: PanelSenderDeps,
  kind: 'alchemy',
  payload: ClientToServerEventPayload<typeof C2S.StartAlchemy>,
): void;
function sendTechniqueActivityStart(
  deps: PanelSenderDeps,
  kind: 'enhancement',
  payload: ClientToServerEventPayload<typeof C2S.StartEnhancement>,
): void;
function sendTechniqueActivityStart(
  deps: PanelSenderDeps,
  kind: 'alchemy' | 'enhancement',
  payload: ClientToServerEventPayload<typeof C2S.StartAlchemy> | ClientToServerEventPayload<typeof C2S.StartEnhancement>,
): void {
  emitTechniqueActivityStart(deps.emitEvent, kind, payload as never);
}

function sendTechniqueActivityCancel(
  deps: PanelSenderDeps,
  kind: 'alchemy' | 'enhancement',
): void {
  emitTechniqueActivityCancel(deps.emitEvent, kind);
}
/**
 * createSocketPanelSender：构建并返回目标对象。
 * @param deps PanelSenderDeps 运行时依赖。
 * @returns 无返回值，直接更新Socket面板Sender相关状态。
 */


export function createSocketPanelSender(deps: PanelSenderDeps) {
  return {  
  /**
 * sendUseItem：执行sendUse道具相关逻辑。
 * @param slotIndex number 参数说明。
 * @param count number 数量。
 * @returns 无返回值，直接更新sendUse道具相关状态。
 */

    sendUseItem(slotIndex: number, count?: number, options?: { sectName?: string; sectMark?: string }): void {
      deps.emitEvent(C2S.UseItem, { slotIndex, count, ...(options ?? {}) });
    },    
    sendCreateFormation(payload: ClientToServerEventPayload<typeof C2S.CreateFormation>): void {
      deps.emitEvent(C2S.CreateFormation, payload);
    },
    sendSetFormationActive(payload: ClientToServerEventPayload<typeof C2S.SetFormationActive>): void {
      deps.emitEvent(C2S.SetFormationActive, payload);
    },
    sendRefillFormation(payload: ClientToServerEventPayload<typeof C2S.RefillFormation>): void {
      deps.emitEvent(C2S.RefillFormation, payload);
    },
    /**
 * sendDropItem：执行sendDrop道具相关逻辑。
 * @param slotIndex number 参数说明。
 * @param count number 数量。
 * @returns 无返回值，直接更新sendDrop道具相关状态。
 */


    sendDropItem(slotIndex: number, count: number): void {
      deps.emitEvent(C2S.DropItem, { slotIndex, count });
    },    
    /**
 * sendDestroyItem：执行sendDestroy道具相关逻辑。
 * @param slotIndex number 参数说明。
 * @param count number 数量。
 * @returns 无返回值，直接更新sendDestroy道具相关状态。
 */


    sendDestroyItem(slotIndex: number, count: number): void {
      deps.emitEvent(C2S.DestroyItem, { slotIndex, count });
    },    
    /**
 * sendTakeLoot：执行sendTake掉落相关逻辑。
 * @param sourceId string source ID。
 * @param itemKey string 参数说明。
 * @param takeAll 参数说明。
 * @returns 无返回值，直接更新sendTake掉落相关状态。
 */


    sendTakeLoot(sourceId: string, itemKey?: string, takeAll = false): void {
      deps.emitEvent(C2S.TakeGround, { sourceId, itemKey, takeAll });
    },    
    /**
 * sendStartGather：执行send开始采集相关逻辑。
 * @param payload StartGatherPayload 载荷参数。
 * @returns 无返回值，直接更新sendStart采集相关状态。
 */


    sendStartGather(payload: ClientToServerEventPayload<typeof C2S.StartGather>): void {
      deps.emitEvent(C2S.StartGather, payload);
    },    
    /**
 * sendCancelGather：执行send取消采集相关逻辑。
 * @returns 无返回值，直接更新sendCancel采集相关状态。
 */

    sendCancelGather(): void {
      deps.emitEvent(C2S.CancelGather, {});
    },    
    /**
 * sendStopLootHarvest：停止当前连续采摘。
 * @returns 无返回值，直接更新停止当前连续采摘相关状态。
 */

    sendStopLootHarvest(): void {
      deps.emitEvent(C2S.StopLootHarvest, {});
    },    
    /**
 * sendSortInventory：执行sendSort背包相关逻辑。
 * @returns 无返回值，直接更新sendSort背包相关状态。
 */


    sendSortInventory(): void {
      deps.emitEvent(C2S.SortInventory, {});
    },    
    /**
 * sendEquip：执行sendEquip相关逻辑。
 * @param slotIndex number 参数说明。
 * @returns 无返回值，直接更新sendEquip相关状态。
 */


    sendEquip(slotIndex: number): void {
      deps.emitEvent(C2S.Equip, { slotIndex });
    },    
    /**
 * sendUnequip：执行sendUnequip相关逻辑。
 * @param slot ClientToServerEventPayload<typeof C2S.Unequip>['slot'] 参数说明。
 * @returns 无返回值，直接更新sendUnequip相关状态。
 */


    sendUnequip(slot: ClientToServerEventPayload<typeof C2S.Unequip>['slot']): void {
      deps.emitEvent(C2S.Unequip, { slot });
    },    
    /**
 * sendRequestAttrDetail：执行sendRequestAttr详情相关逻辑。
 * @returns 无返回值，直接更新sendRequestAttr详情相关状态。
 */


    sendRequestAttrDetail(): void {
      deps.emitEvent(C2S.RequestAttrDetail, {});
    },    
    /**
 * sendRequestLeaderboard：执行sendRequestLeaderboard相关逻辑。
 * @param limit ClientToServerEventPayload<typeof C2S.RequestLeaderboard>['limit'] 参数说明。
 * @returns 无返回值，直接更新sendRequestLeaderboard相关状态。
 */


    sendRequestLeaderboard(limit?: ClientToServerEventPayload<typeof C2S.RequestLeaderboard>['limit']): void {
      deps.emitEvent(C2S.RequestLeaderboard, { limit });
    },    
    /**
 * sendRequestLeaderboardPlayerLocations：执行sendRequestLeaderboard玩家坐标追索相关逻辑。
 * @param playerIds 玩家ID列表。
 * @returns 无返回值，直接更新sendRequestLeaderboard玩家坐标追索相关状态。
 */

    sendRequestLeaderboardPlayerLocations(
      playerIds: ClientToServerEventPayload<typeof C2S.RequestLeaderboardPlayerLocations>['playerIds'],
    ): void {
      deps.emitEvent(C2S.RequestLeaderboardPlayerLocations, { playerIds });
    },    
    /**
 * sendRequestWorldSummary：执行sendRequest世界摘要相关逻辑。
 * @returns 无返回值，直接更新sendRequest世界摘要相关状态。
 */


    sendRequestWorldSummary(): void {
      deps.emitEvent(C2S.RequestWorldSummary, {});
    },    
    /**
 * sendRequestNpcShop：执行sendRequestNPCShop相关逻辑。
 * @param npcId string npc ID。
 * @returns 无返回值，直接更新sendRequestNPCShop相关状态。
 */


    sendRequestNpcShop(npcId: string): void {
      deps.emitEvent(C2S.RequestNpcShop, { npcId });
    },    
    /**
 * sendBuyNpcShopItem：执行sendBuyNPCShop道具相关逻辑。
 * @param npcId string npc ID。
 * @param itemId string 道具 ID。
 * @param quantity number 参数说明。
 * @returns 无返回值，直接更新sendBuyNPCShop道具相关状态。
 */


    sendBuyNpcShopItem(npcId: string, itemId: string, quantity: number): void {
      deps.emitEvent(C2S.BuyNpcShopItem, { npcId, itemId, quantity });
    },    
    /**
 * sendRequestAlchemyPanel：执行sendRequest炼丹面板相关逻辑。
 * @param knownCatalogVersion number 参数说明。
 * @returns 无返回值，直接更新sendRequest炼丹面板相关状态。
 */


    sendRequestAlchemyPanel(knownCatalogVersion?: number): void {
      sendTechniqueActivityRequest(deps, 'alchemy', { knownCatalogVersion });
    },    
    /**
 * sendSaveAlchemyPreset：执行sendSave炼丹Preset相关逻辑。
 * @param payload ClientToServerEventPayload<typeof C2S.SaveAlchemyPreset> 载荷参数。
 * @returns 无返回值，直接更新sendSave炼丹Preset相关状态。
 */


    sendSaveAlchemyPreset(
      payload: ClientToServerEventPayload<typeof C2S.SaveAlchemyPreset>,
    ): void {
      deps.emitEvent(C2S.SaveAlchemyPreset, payload);
    },    
    /**
 * sendDeleteAlchemyPreset：处理sendDelete炼丹Preset并更新相关状态。
 * @param presetId string preset ID。
 * @returns 无返回值，直接更新sendDelete炼丹Preset相关状态。
 */


    sendDeleteAlchemyPreset(presetId: string): void {
      deps.emitEvent(C2S.DeleteAlchemyPreset, { presetId });
    },    
    /**
 * sendStartAlchemy：执行send开始炼丹相关逻辑。
 * @param payload ClientToServerEventPayload<typeof C2S.StartAlchemy> 载荷参数。
 * @returns 无返回值，直接更新sendStart炼丹相关状态。
 */


    sendStartAlchemy(
      payload: ClientToServerEventPayload<typeof C2S.StartAlchemy>,
    ): void {
      sendTechniqueActivityStart(deps, 'alchemy', payload);
    },    
    /**
 * sendCancelAlchemy：判断sendCancel炼丹是否满足条件。
 * @returns 无返回值，直接更新sendCancel炼丹相关状态。
 */


    sendCancelAlchemy(): void {
      sendTechniqueActivityCancel(deps, 'alchemy');
    },    
    /**
 * sendRequestEnhancementPanel：执行sendRequest强化面板相关逻辑。
 * @returns 无返回值，直接更新sendRequest强化面板相关状态。
 */


    sendRequestEnhancementPanel(): void {
      sendTechniqueActivityRequest(deps, 'enhancement', {});
    },    
    /**
 * sendStartEnhancement：执行send开始强化相关逻辑。
 * @param payload ClientToServerEventPayload<typeof C2S.StartEnhancement> 载荷参数。
 * @returns 无返回值，直接更新sendStart强化相关状态。
 */


    sendStartEnhancement(
      payload: ClientToServerEventPayload<typeof C2S.StartEnhancement>,
    ): void {
      sendTechniqueActivityStart(deps, 'enhancement', payload);
    },    
    /**
 * sendCancelEnhancement：判断sendCancel强化是否满足条件。
 * @returns 无返回值，直接更新sendCancel强化相关状态。
 */


    sendCancelEnhancement(): void {
      sendTechniqueActivityCancel(deps, 'enhancement');
    },
  };
}
/**
 * SocketPanelSender：统一结构类型，保证协议与运行时一致性。
 */


export type SocketPanelSender = ReturnType<typeof createSocketPanelSender>;
