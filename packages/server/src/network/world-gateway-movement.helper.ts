// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayMovementHelper = void 0;

const movement_debug_1 = require("../debug/movement-debug");

/** 世界 socket 移动/导航 helper：只收敛移动相关入口。 */
class WorldGatewayMovementHelper {
/**
 * gateway：gateway相关字段。
 */

    gateway;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(gateway) {
        this.gateway = gateway;
    }    
    /**
 * handleMoveTo：处理 MoveTo 并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新 MoveTo 相关状态。
 */

    handleMoveTo(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.gateway.logger, 'gateway.recv.moveTo', {
            playerId,
            socketId: client.id,
            protocol: 'mainline',
            payload: {
                x: payload?.x ?? null,
                y: payload?.y ?? null,
                allowNearestReachable: payload?.allowNearestReachable === true,
                ignoreVisibilityLimit: payload?.ignoreVisibilityLimit === true,
                packedPathSteps: payload?.packedPathSteps ?? null,
                packedPath: payload?.packedPath ?? null,
                pathStartX: payload?.pathStartX ?? null,
                pathStartY: payload?.pathStartY ?? null,
            },
        });
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueMoveTo(playerId, payload?.x, payload?.y, payload?.allowNearestReachable, payload?.packedPath, payload?.packedPathSteps, payload?.pathStartX, payload?.pathStartY, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'MOVE_TO_FAILED', error);
        }
    }    
    /**
 * handleNavigateQuest：处理任务导航并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新任务导航相关状态。
 */

    handleNavigateQuest(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        const questId = typeof payload?.questId === 'string' ? payload.questId.trim() : '';
        (0, movement_debug_1.logServerNextMovement)(this.gateway.logger, 'gateway.recv.navigateQuest', {
            playerId,
            socketId: client.id,
            protocol: 'mainline',
            questId,
        });
        if (!questId) {
            this.gateway.worldClientEventService.emitQuestNavigateResult(client, '', false, 'questId is required');
            return;
        }
        try {
            const result = this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.navigateQuest(playerId, questId, this.gateway.worldRuntimeService);
            this.gateway.worldClientEventService.emitQuestNavigateResult(client, questId, true, undefined, result?.path);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitQuestNavigateResult(client, questId, false, error instanceof Error ? error.message : String(error));
        }
    }    
    /**
 * handleMove：处理Move并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Move相关状态。
 */

    handleMove(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.gateway.logger, 'gateway.recv.move', {
            playerId,
            socketId: client.id,
            protocol: 'mainline',
            direction: payload?.d ?? null,
        });
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueMove(playerId, payload?.d, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'MOVE_FAILED', error);
        }
    }
}
exports.WorldGatewayMovementHelper = WorldGatewayMovementHelper;

export { WorldGatewayMovementHelper };
