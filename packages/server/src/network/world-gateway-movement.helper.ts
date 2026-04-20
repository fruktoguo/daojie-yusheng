// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayMovementHelper = void 0;

const movement_debug_1 = require("../debug/movement-debug");

/** 世界 socket 移动/导航 helper：只收敛移动相关入口。 */
class WorldGatewayMovementHelper {
/**
 * gateway：WorldGatewayMovementHelper 内部字段。
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
 * handleNextMoveTo：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextMoveTo(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.gateway.logger, 'gateway.recv.moveTo', {
            playerId,
            socketId: client.id,
            protocol: 'next',
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
            this.gateway.worldRuntimeService.enqueueMoveTo(playerId, payload?.x, payload?.y, payload?.allowNearestReachable, payload?.packedPath, payload?.packedPathSteps, payload?.pathStartX, payload?.pathStartY);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'MOVE_TO_FAILED', error);
        }
    }    
    /**
 * handleNextNavigateQuest：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextNavigateQuest(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        const questId = typeof payload?.questId === 'string' ? payload.questId.trim() : '';
        (0, movement_debug_1.logServerNextMovement)(this.gateway.logger, 'gateway.recv.navigateQuest', {
            playerId,
            socketId: client.id,
            protocol: 'next',
            questId,
        });
        if (!questId) {
            this.gateway.worldClientEventService.emitQuestNavigateResult(client, '', false, 'questId is required');
            return;
        }
        try {
            this.gateway.worldRuntimeService.navigateQuest(playerId, questId);
            this.gateway.worldClientEventService.emitQuestNavigateResult(client, questId, true);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitQuestNavigateResult(client, questId, false, error instanceof Error ? error.message : String(error));
        }
    }    
    /**
 * handleMove：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
            protocol: 'next',
            direction: payload?.d ?? null,
        });
        try {
            this.gateway.worldRuntimeService.enqueueMove(playerId, payload?.d);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'MOVE_FAILED', error);
        }
    }
}
exports.WorldGatewayMovementHelper = WorldGatewayMovementHelper;

export { WorldGatewayMovementHelper };
