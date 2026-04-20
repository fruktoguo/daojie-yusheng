// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayCraftHelper = void 0;

const shared_1 = require("@mud/shared-next");

/** 世界 socket 采集/锻造 helper：只收敛 craft 相关入口。 */
class WorldGatewayCraftHelper {
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
 * handleNextRequestAlchemyPanel：处理NextRequest炼丹面板并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest炼丹面板相关状态。
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
 * handleNextRequestEnhancementPanel：处理NextRequest强化面板并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequest强化面板相关状态。
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
 * handleNextStartAlchemy：处理Next开始炼丹并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextStart炼丹相关状态。
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
 * handleNextCancelAlchemy：判断NextCancel炼丹是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextCancel炼丹相关状态。
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
 * handleNextSaveAlchemyPreset：处理NextSave炼丹Preset并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextSave炼丹Preset相关状态。
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
 * handleNextDeleteAlchemyPreset：处理NextDelete炼丹Preset并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextDelete炼丹Preset相关状态。
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
 * handleNextStartEnhancement：处理Next开始强化并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextStart强化相关状态。
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
 * handleNextCancelEnhancement：判断NextCancel强化是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextCancel强化相关状态。
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
