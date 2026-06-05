/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 世界网关建筑 helper。
 * 收敛建筑放置、拆除、房间角色设置和风水观察等入口。
 */

import { Injectable } from '@nestjs/common';
import { S2C } from '@mud/shared';
import type { Socket } from 'socket.io';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';
import { WorldSyncService } from './world-sync.service';

/** 建筑系统 helper：收敛放置、拆除、房间角色和风水观察入口 */
@Injectable()
class WorldGatewayBuildingHelper {
    constructor(
        private readonly gatewayGuardHelper: WorldGatewayGuardHelper,
        private readonly worldRuntimeService: WorldRuntimeService,
        private readonly worldClientEventService: WorldClientEventService,
        private readonly worldSyncService: WorldSyncService,
    ) {}

    handleBuildPlaceIntent(client: Socket, payload: any) {
        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = this.worldRuntimeService.handleBuildPlaceIntent(playerId, payload);
            client.emit(S2C.BuildResult, result);
            if (result?.ok === true) {
                client.emit(S2C.RoomSummaryPatch, this.worldRuntimeService.buildCurrentRoomSummaryPatch(playerId));
                this.worldSyncService.emitDeltaSync(playerId, client);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'BUILD_PLACE_FAILED', error);
        }
    }

    handleBuildDeconstruct(client: Socket, payload: any) {
        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = this.worldRuntimeService.handleBuildDeconstructIntent(playerId, payload);
            client.emit(S2C.BuildResult, result);
            if (result?.ok === true) {
                client.emit(S2C.RoomSummaryPatch, this.worldRuntimeService.buildCurrentRoomSummaryPatch(playerId));
                this.worldSyncService.emitDeltaSync(playerId, client);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'BUILD_DECONSTRUCT_FAILED', error);
        }
    }

    handleRoomSetRole(client: Socket, payload: any) {
        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = this.worldRuntimeService.handleRoomSetRoleIntent(playerId, payload);
            if (result?.ok !== true) {
                client.emit(S2C.BuildResult, result);
                return;
            }
            client.emit(S2C.RoomSummaryPatch, this.worldRuntimeService.buildCurrentRoomSummaryPatch(playerId));
            const view = this.worldRuntimeService.buildFengShuiObserveView(playerId, { roomId: payload?.roomId, overlay: false });
            if (view?.detail) {
                client.emit(S2C.FengShuiDetail, view.detail);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'ROOM_SET_ROLE_FAILED', error);
        }
    }

    handleFengShuiObserve(client: Socket, payload: any) {
        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const view = this.worldRuntimeService.buildFengShuiObserveView(playerId, payload);
            if (view?.overlay) {
                client.emit(S2C.FengShuiOverlayPatch, view.overlay);
            }
            if (view?.detail) {
                client.emit(S2C.FengShuiDetail, view.detail);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'FENGSHUI_OBSERVE_FAILED', error);
        }
    }
}

export { WorldGatewayBuildingHelper };
