/**
 * 世界网关建筑 helper。
 * 收敛建筑放置、拆除、房间角色设置和风水观察等入口。
 */

import { S2C } from '@mud/shared';

/** 建筑系统 helper：收敛放置、拆除、房间角色和风水观察入口 */
class WorldGatewayBuildingHelper {
    gateway;

    constructor(gateway) {
        this.gateway = gateway;
    }

    handleBuildPlaceIntent(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = this.gateway.worldRuntimeService.handleBuildPlaceIntent(playerId, payload);
            client.emit(S2C.BuildResult, result);
            if (result?.ok === true) {
                client.emit(S2C.RoomSummaryPatch, this.gateway.worldRuntimeService.buildCurrentRoomSummaryPatch(playerId));
            }
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'BUILD_PLACE_FAILED', error);
        }
    }

    handleBuildDeconstruct(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = this.gateway.worldRuntimeService.handleBuildDeconstructIntent(playerId, payload);
            client.emit(S2C.BuildResult, result);
            if (result?.ok === true) {
                client.emit(S2C.RoomSummaryPatch, this.gateway.worldRuntimeService.buildCurrentRoomSummaryPatch(playerId));
            }
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'BUILD_DECONSTRUCT_FAILED', error);
        }
    }

    handleRoomSetRole(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = this.gateway.worldRuntimeService.handleRoomSetRoleIntent(playerId, payload);
            if (result?.ok !== true) {
                client.emit(S2C.BuildResult, result);
                return;
            }
            client.emit(S2C.RoomSummaryPatch, this.gateway.worldRuntimeService.buildCurrentRoomSummaryPatch(playerId));
            const view = this.gateway.worldRuntimeService.buildFengShuiObserveView(playerId, { roomId: payload?.roomId, overlay: false });
            if (view?.detail) {
                client.emit(S2C.FengShuiDetail, view.detail);
            }
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'ROOM_SET_ROLE_FAILED', error);
        }
    }

    handleFengShuiObserve(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const view = this.gateway.worldRuntimeService.buildFengShuiObserveView(playerId, payload);
            if (view?.overlay) {
                client.emit(S2C.FengShuiOverlayPatch, view.overlay);
            }
            if (view?.detail) {
                client.emit(S2C.FengShuiDetail, view.detail);
            }
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'FENGSHUI_OBSERVE_FAILED', error);
        }
    }
}

export { WorldGatewayBuildingHelper };
