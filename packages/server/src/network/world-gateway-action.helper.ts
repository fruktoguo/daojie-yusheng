// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayActionHelper = void 0;

const shared_1 = require("@mud/shared-next");

/** 世界 socket 小型 action helper：收敛 redeem / portal / cultivate / cast skill 入口。 */
class WorldGatewayActionHelper {
/**
 * gateway：WorldGatewayActionHelper 内部字段。
 */

    gateway;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(gateway) {
        this.gateway = gateway;
    }    
    /**
 * handleNextRedeemCodes：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextRedeemCodes(client, payload) {
        this.executeRedeemCodes(client, payload);
    }    
    /**
 * handleUseAction：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleUseAction(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gateway.worldClientEventService.markProtocol(client, 'next');
        try {
            this.handleProtocolAction(client, playerId, payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'USE_ACTION_FAILED', error);
        }
    }    
    /**
 * handleProtocolAction：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleProtocolAction(client, playerId, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const actionId = this.resolveActionId(payload);
        if (actionId === 'debug:reset_spawn' || actionId === 'travel:return_spawn') {
            this.gateway.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
            return;
        }
        if (actionId === 'loot:open') {
            const tile = typeof payload?.target === 'string' ? (0, shared_1.parseTileTargetRef)(payload.target) : null;
            if (!tile) {
                throw new Error('拿取需要指定目标格子');
            }
            const player = this.gateway.playerRuntimeService.getPlayerOrThrow(playerId);
            if (Math.max(Math.abs(player.x - tile.x), Math.abs(player.y - tile.y)) > 1) {
                throw new Error('拿取范围只有 1 格。');
            }
            this.gateway.worldProtocolProjectionService.emitTileLootInteraction(client, playerId, this.gateway.worldRuntimeService.buildTileDetail(playerId, tile));
            return;
        }
        if (actionId === 'battle:engage' || actionId === 'battle:force_attack') {
            const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
            const tile = target ? (0, shared_1.parseTileTargetRef)(target) : null;
            const targetPlayerId = target.startsWith('player:') ? target.slice('player:'.length) : null;
            const targetMonsterId = target && !target.startsWith('player:') && !tile ? target : null;
            if (targetMonsterId) {
                this.gateway.worldRuntimeService.enqueueBattleTarget(playerId, actionId === 'battle:force_attack', null, targetMonsterId);
                return;
            }
            this.gateway.worldRuntimeService.enqueueBattleTarget(playerId, actionId === 'battle:force_attack', targetPlayerId, null, tile?.x, tile?.y);
            return;
        }
        if (actionId.startsWith('npc:')) {
            this.gateway.worldRuntimeService.enqueueNpcInteraction(playerId, actionId);
            return;
        }
        const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
        if (actionId === 'body_training:infuse') {
            this.emitProtocolActionResult(client, playerId, this.gateway.worldRuntimeService.executeAction(playerId, actionId, target));
            return;
        }
        if (target) {
            this.gateway.worldRuntimeService.enqueueCastSkillTargetRef(playerId, actionId, target);
            return;
        }
        this.emitProtocolActionResult(client, playerId, this.gateway.worldRuntimeService.executeAction(playerId, actionId));
    }    
    /**
 * resolveActionId：执行核心业务逻辑。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    resolveActionId(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const actionId = typeof payload?.actionId === 'string' && payload.actionId.trim()
            ? payload.actionId.trim()
            : (typeof payload?.type === 'string' ? payload.type.trim() : '');
        if (!actionId) {
            throw new Error('actionId is required');
        }
        return actionId;
    }    
    /**
 * emitProtocolActionResult：执行核心业务逻辑。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @param result 返回结果。
 * @returns 函数返回值。
 */

    emitProtocolActionResult(client, playerId, result) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (result.kind === 'npcShop' && result.npcShop) {
            this.gateway.gatewayClientEmitHelper.emitNextNpcShop(client, result.npcShop);
            return;
        }
        if (result.kind !== 'npcQuests') {
            return;
        }
        if (this.gateway.worldClientEventService.getExplicitProtocol(client) === 'next' && result.npcQuests) {
            client.emit(shared_1.NEXT_S2C.NpcQuests, result.npcQuests);
        }
        this.gateway.gatewayClientEmitHelper.emitNextQuests(client, this.gateway.worldRuntimeService.buildQuestListView(playerId));
    }    
    /**
 * executeRedeemCodes：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    executeRedeemCodes(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueRedeemCodes(playerId, payload?.codes ?? []);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REDEEM_CODES_FAILED', error);
        }
    }    
    /**
 * handleUsePortal：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @returns 函数返回值。
 */

    handleUsePortal(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.usePortal(playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'PORTAL_FAILED', error);
        }
    }    
    /**
 * executeCultivate：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    executeCultivate(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueCultivate(playerId, payload?.techId ?? null);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CULTIVATE_FAILED', error);
        }
    }    
    /**
 * handleNextCultivate：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextCultivate(client, payload) {
        this.executeCultivate(client, payload);
    }    
    /**
 * handleCastSkill：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleCastSkill(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueCastSkill(playerId, payload?.skillId, payload?.targetPlayerId ?? null, payload?.targetMonsterId ?? null, payload?.targetRef ?? null);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CAST_SKILL_FAILED', error);
        }
    }
}
exports.WorldGatewayActionHelper = WorldGatewayActionHelper;

export { WorldGatewayActionHelper };
