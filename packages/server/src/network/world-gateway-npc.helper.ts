/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 世界网关 NPC helper。
 * 收敛 NPC 商店、NPC 任务接取/提交和商店购买等入口。
 */

import { Injectable } from '@nestjs/common';
import { S2C } from '@mud/shared';
import type { Socket } from 'socket.io';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import { WorldGatewayClientEmitHelper } from './world-gateway-client-emit.helper';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';

/** NPC 交互 helper：收敛商店浏览、任务接取/提交和商品购买入口 */
@Injectable()
class WorldGatewayNpcHelper {
    constructor(
        private readonly gatewayGuardHelper: WorldGatewayGuardHelper,
        private readonly gatewayClientEmitHelper: WorldGatewayClientEmitHelper,
        private readonly worldRuntimeService: WorldRuntimeService,
        private readonly worldClientEventService: WorldClientEventService,
    ) {}

    /**
 * handleRequestNpcShop：处理NextRequestNPCShop并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequestNPCShop相关状态。
 */

    handleRequestNpcShop(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gatewayClientEmitHelper.emitNpcShop(client, this.worldRuntimeService.buildNpcShopView(playerId, payload?.npcId));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_SHOP_REQUEST_FAILED', error);
        }
    }    
    /**
 * handleRequestNpcQuests：处理RequestNPC任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新RequestNPC任务相关状态。
 */

    handleRequestNpcQuests(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(S2C.NpcQuests, toNpcQuestsSyncPayload(this.worldRuntimeService.buildNpcQuestsView(playerId, payload?.npcId)));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_REQUEST_FAILED', error);
        }
    }    
    /**
 * handleAcceptNpcQuest：处理AcceptNPC任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

    handleAcceptNpcQuest(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueAcceptNpcQuest(playerId, payload?.npcId, payload?.questId, this.worldRuntimeService);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_ACCEPT_FAILED', error);
        }
    }    
    /**
 * handleSubmitNpcQuest：处理SubmitNPC任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

    handleSubmitNpcQuest(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSubmitNpcQuest(playerId, payload?.npcId, payload?.questId, this.worldRuntimeService);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_SUBMIT_FAILED', error);
        }
    }    
    /**
 * executeBuyNpcShopItem：执行executeBuyNPCShop道具相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeBuyNPCShop道具相关状态。
 */

    executeBuyNpcShopItem(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueBuyNpcShopItem(playerId, payload?.npcId, payload?.itemId, payload?.quantity, this.worldRuntimeService);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_SHOP_BUY_FAILED', error);
        }
    }    
    /**
 * handleBuyNpcShopItem：处理NextBuyNPCShop道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextBuyNPCShop道具相关状态。
 */

    handleBuyNpcShopItem(client: Socket, payload: any) {
        this.executeBuyNpcShopItem(client, payload);
    }
}

function toNpcQuestsSyncPayload(payload: any) {
    return {
        ...payload,
        quests: Array.isArray(payload?.quests)
            ? payload.quests.map((entry) => toQuestRuntimeState(entry))
            : [],
    };
}

function toQuestRuntimeState(source: any) {
    return {
        id: source.id,
        status: source.status,
        progress: normalizeQuestProgressNumber(source.progress),
    };
}

function normalizeQuestProgressNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

export { WorldGatewayNpcHelper };
