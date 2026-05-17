/**
 * 世界网关移动 helper。
 * 收敛 moveTo、方向移动和任务导航等移动相关入口。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { logServerNextMovement } from '../debug/movement-debug';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';

/** 世界 socket 移动/导航 helper：只收敛移动相关入口。 */
@Injectable()
class WorldGatewayMovementHelper {
    private readonly logger = new Logger(WorldGatewayMovementHelper.name);

    constructor(
        private readonly gatewayGuardHelper: WorldGatewayGuardHelper,
        private readonly worldRuntimeService: WorldRuntimeService,
        private readonly worldClientEventService: WorldClientEventService,
    ) {}

    /**
 * handleMoveTo：处理 MoveTo 并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新 MoveTo 相关状态。
 */

    handleMoveTo(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        logServerNextMovement(this.logger, 'gateway.recv.moveTo', {
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
            this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueMoveTo(playerId, payload?.x, payload?.y, payload?.allowNearestReachable, payload?.packedPath, payload?.packedPathSteps, payload?.pathStartX, payload?.pathStartY, this.worldRuntimeService);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'MOVE_TO_FAILED', error);
        }
    }    
    /**
 * handleNavigateQuest：处理任务导航并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新任务导航相关状态。
 */

    handleNavigateQuest(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        const questId = typeof payload?.questId === 'string' ? payload.questId.trim() : '';
        logServerNextMovement(this.logger, 'gateway.recv.navigateQuest', {
            playerId,
            socketId: client.id,
            protocol: 'mainline',
            questId,
        });
        if (!questId) {
            this.worldClientEventService.emitQuestNavigateResult(client, '', false, '任务 ID 不能为空', undefined);
            return;
        }
        try {
            const result = this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.navigateQuest(playerId, questId, this.worldRuntimeService);
            this.worldClientEventService.emitQuestNavigateResult(client, questId, true, undefined, result?.path);
        }
        catch (error) {
            this.worldClientEventService.emitQuestNavigateResult(client, questId, false, error instanceof Error ? error.message : String(error), undefined);
        }
    }    
    /**
 * handleMove：处理Move并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Move相关状态。
 */

    handleMove(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        logServerNextMovement(this.logger, 'gateway.recv.move', {
            playerId,
            socketId: client.id,
            protocol: 'mainline',
            direction: payload?.d ?? null,
        });
        try {
            this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueMove(playerId, payload?.d, this.worldRuntimeService);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'MOVE_FAILED', error);
        }
    }
}

export { WorldGatewayMovementHelper };
