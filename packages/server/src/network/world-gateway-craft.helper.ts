// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayCraftHelper = void 0;

const shared_1 = require("@mud/shared-next");

/** 世界 socket 采集/锻造 helper：只收敛 craft 相关入口。 */
class WorldGatewayCraftHelper {
/**
 * gateway：WorldGatewayCraftHelper 内部字段。
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
 * handleNextRequestAlchemyPanel：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextRequestAlchemyPanel(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const player = this.gateway.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.AlchemyPanel, this.gateway.craftPanelRuntimeService.buildAlchemyPanelPayload(player, payload?.knownCatalogVersion));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_ALCHEMY_PANEL_FAILED', error);
        }
    }    
    /**
 * handleNextRequestEnhancementPanel：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 函数返回值。
 */

    handleNextRequestEnhancementPanel(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const player = this.gateway.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.EnhancementPanel, this.gateway.craftPanelRuntimeService.buildEnhancementPanelPayload(player));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_ENHANCEMENT_PANEL_FAILED', error);
        }
    }    
    /**
 * handleNextStartAlchemy：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextStartAlchemy(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueStartAlchemy(playerId, payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'START_ALCHEMY_FAILED', error);
        }
    }    
    /**
 * handleNextCancelAlchemy：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 函数返回值。
 */

    handleNextCancelAlchemy(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueCancelAlchemy(playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CANCEL_ALCHEMY_FAILED', error);
        }
    }    
    /**
 * handleNextSaveAlchemyPreset：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextSaveAlchemyPreset(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueSaveAlchemyPreset(playerId, payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SAVE_ALCHEMY_PRESET_FAILED', error);
        }
    }    
    /**
 * handleNextDeleteAlchemyPreset：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextDeleteAlchemyPreset(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueDeleteAlchemyPreset(playerId, payload?.presetId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DELETE_ALCHEMY_PRESET_FAILED', error);
        }
    }    
    /**
 * handleNextStartEnhancement：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextStartEnhancement(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueStartEnhancement(playerId, payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'START_ENHANCEMENT_FAILED', error);
        }
    }    
    /**
 * handleNextCancelEnhancement：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 函数返回值。
 */

    handleNextCancelEnhancement(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueCancelEnhancement(playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CANCEL_ENHANCEMENT_FAILED', error);
        }
    }
}
exports.WorldGatewayCraftHelper = WorldGatewayCraftHelper;

export { WorldGatewayCraftHelper };
