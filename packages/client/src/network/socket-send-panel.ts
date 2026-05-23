/**
 * 本文件属于客户端网络层，负责 socket 生命周期、发包封装或服务端事件消费。
 *
 * 维护时要使用共享协议事件名和最小字段，避免把服务端权威判断下沉到客户端。
 */
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

function buildInventoryItemRef(itemInstanceId: string): { itemInstanceId: string } {
  return { itemInstanceId };
}

function sendTechniqueActivityRequest(
  deps: PanelSenderDeps,
  kind: 'alchemy',
  payload: ClientToServerEventPayload<typeof C2S.RequestAlchemyPanel>,
): void;
function sendTechniqueActivityRequest(
  deps: PanelSenderDeps,
  kind: 'forging',
  payload: ClientToServerEventPayload<typeof C2S.RequestAlchemyPanel>,
): void;
function sendTechniqueActivityRequest(
  deps: PanelSenderDeps,
  kind: 'enhancement',
  payload: ClientToServerEventPayload<typeof C2S.RequestEnhancementPanel>,
): void;
function sendTechniqueActivityRequest(
  deps: PanelSenderDeps,
  kind: 'alchemy' | 'forging' | 'enhancement',
  payload: ClientToServerEventPayload<typeof C2S.RequestAlchemyPanel> | ClientToServerEventPayload<typeof C2S.RequestEnhancementPanel>,
): void {
  const nextPayload = kind === 'forging' ? { ...(payload as object), kind: 'forging' } : payload;
  emitTechniqueActivityPanelRequest(deps.emitEvent, kind, nextPayload as never);
}

function sendTechniqueActivityStart(
  deps: PanelSenderDeps,
  kind: 'alchemy',
  payload: ClientToServerEventPayload<typeof C2S.StartAlchemy>,
): void;
function sendTechniqueActivityStart(
  deps: PanelSenderDeps,
  kind: 'forging',
  payload: ClientToServerEventPayload<typeof C2S.StartAlchemy>,
): void;
function sendTechniqueActivityStart(
  deps: PanelSenderDeps,
  kind: 'enhancement',
  payload: ClientToServerEventPayload<typeof C2S.StartEnhancement>,
): void;
function sendTechniqueActivityStart(
  deps: PanelSenderDeps,
  kind: 'alchemy' | 'forging' | 'enhancement',
  payload: ClientToServerEventPayload<typeof C2S.StartAlchemy> | ClientToServerEventPayload<typeof C2S.StartEnhancement>,
): void {
  const nextPayload = kind === 'forging' ? { ...(payload as object), kind: 'forging' } : payload;
  emitTechniqueActivityStart(deps.emitEvent, kind, nextPayload as never);
}

function sendTechniqueActivityCancel(
  deps: PanelSenderDeps,
  kind: 'alchemy' | 'forging' | 'enhancement',
): void {
  if (kind === 'forging') {
    deps.emitEvent(C2S.CancelAlchemy, { kind: 'forging' });
    return;
  }
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
 * @param itemInstanceId string 背包物品实例 ID。
 * @param count number 数量。
 * @returns 无返回值，直接更新sendUse道具相关状态。
 */

    sendUseItem(itemInstanceId: string, count?: number, options?: { sectName?: string; sectMark?: string }): void {
      deps.emitEvent(C2S.UseItem, {
        itemRef: buildInventoryItemRef(itemInstanceId),
        count,
        ...(options ?? {}),
      });
    },    
    sendRepairInventoryItemInstanceIds(): void {
      deps.emitEvent(C2S.RepairInventoryItemInstanceIds, {});
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
 * @param itemInstanceId string 背包物品实例 ID。
 * @param count number 数量。
 * @returns 无返回值，直接更新sendDrop道具相关状态。
 */


    sendDropItem(itemInstanceId: string, count: number): void {
      deps.emitEvent(C2S.DropItem, { itemRef: buildInventoryItemRef(itemInstanceId), count });
    },    
    /**
 * sendDestroyItem：执行sendDestroy道具相关逻辑。
 * @param itemInstanceId string 背包物品实例 ID。
 * @param count number 数量。
 * @returns 无返回值，直接更新sendDestroy道具相关状态。
 */


    sendDestroyItem(itemInstanceId: string, count: number): void {
      deps.emitEvent(C2S.DestroyItem, { itemRef: buildInventoryItemRef(itemInstanceId), count });
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
 * @param itemInstanceId string 背包物品实例 ID。
 * @returns 无返回值，直接更新sendEquip相关状态。
 */


    sendEquip(itemInstanceId: string): void {
      deps.emitEvent(C2S.Equip, { itemRef: buildInventoryItemRef(itemInstanceId) });
    },    
    /**
 * sendUnequip：执行sendUnequip相关逻辑。
 * @param slot ClientToServerEventPayload<typeof C2S.Unequip>['slot'] 参数说明。
 * @returns 无返回值，直接更新sendUnequip相关状态。
 */


    sendUnequip(slot: ClientToServerEventPayload<typeof C2S.Unequip>['slot'], expectedItemInstanceId?: string): void {
      deps.emitEvent(C2S.Unequip, expectedItemInstanceId ? { slot, expectedItemInstanceId } : { slot });
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
    sendRequestForgingPanel(knownCatalogVersion?: number): void {
      sendTechniqueActivityRequest(deps, 'forging', { knownCatalogVersion, kind: 'forging' });
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
    sendStartForging(
      payload: ClientToServerEventPayload<typeof C2S.StartAlchemy>,
    ): void {
      sendTechniqueActivityStart(deps, 'forging', { ...payload, kind: 'forging' });
    },    
    /**
 * sendCancelAlchemy：判断sendCancel炼丹是否满足条件。
 * @returns 无返回值，直接更新sendCancel炼丹相关状态。
 */


    sendCancelAlchemy(): void {
      sendTechniqueActivityCancel(deps, 'alchemy');
    },
    sendCancelForging(): void {
      sendTechniqueActivityCancel(deps, 'forging');
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
