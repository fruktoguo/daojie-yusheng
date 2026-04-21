// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayCraftHelper = void 0;

const technique_activity_registry_helpers_1 = require("../runtime/craft/technique-activity-registry.helpers");

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
 * handleNextRequestTechniqueActivityPanel：统一技艺面板请求入口。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新技艺面板请求相关状态。
 */

    handleNextRequestTechniqueActivityPanel(client, payload, kind) {
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
            const panelPayload = this.gateway.craftPanelRuntimeService.buildTechniqueActivityPanelPayload(player, kind, payload?.knownCatalogVersion);
            (0, technique_activity_registry_helpers_1.emitTechniqueActivityPanel)(client, kind, panelPayload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, (0, technique_activity_registry_helpers_1.getTechniqueActivityMetadata)(kind).requestPanelErrorCode, error);
        }
    }    
    /**
 * handleNextStartTechniqueActivity：统一技艺活动开始入口。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新技艺活动开始相关状态。
 */

    handleNextStartTechniqueActivity(client, payload, kind) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueStartTechniqueActivity(playerId, kind, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, (0, technique_activity_registry_helpers_1.getTechniqueActivityMetadata)(kind).startErrorCode, error);
        }
    }    
    /**
 * handleNextCancelTechniqueActivity：统一技艺活动取消入口。
 * @param client 参数说明。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新技艺活动取消相关状态。
 */

    handleNextCancelTechniqueActivity(client, kind) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCancelTechniqueActivity(playerId, kind, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, (0, technique_activity_registry_helpers_1.getTechniqueActivityMetadata)(kind).cancelErrorCode, error);
        }
    }    
    /**
 * handleNextRequestAlchemyPanel：处理NextRequest炼丹面板并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest炼丹面板相关状态。
 */

    handleNextRequestAlchemyPanel(client, payload) {
        this.handleNextRequestTechniqueActivityPanel(client, payload, 'alchemy');
    }    
    /**
 * handleNextRequestEnhancementPanel：处理NextRequest强化面板并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequest强化面板相关状态。
 */

    handleNextRequestEnhancementPanel(client, _payload) {
        this.handleNextRequestTechniqueActivityPanel(client, _payload, 'enhancement');
    }    
    /**
 * handleNextStartAlchemy：处理Next开始炼丹并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextStart炼丹相关状态。
 */

    handleNextStartAlchemy(client, payload) {
        this.handleNextStartTechniqueActivity(client, payload, 'alchemy');
    }    
    /**
 * handleNextCancelAlchemy：判断NextCancel炼丹是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextCancel炼丹相关状态。
 */

    handleNextCancelAlchemy(client, _payload) {
        void _payload;
        this.handleNextCancelTechniqueActivity(client, 'alchemy');
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
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSaveAlchemyPreset(playerId, payload, this.gateway.worldRuntimeService);
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
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDeleteAlchemyPreset(playerId, payload?.presetId, this.gateway.worldRuntimeService);
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
        this.handleNextStartTechniqueActivity(client, payload, 'enhancement');
    }    
    /**
 * handleNextCancelEnhancement：判断NextCancel强化是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextCancel强化相关状态。
 */

    handleNextCancelEnhancement(client, _payload) {
        void _payload;
        this.handleNextCancelTechniqueActivity(client, 'enhancement');
    }
}
exports.WorldGatewayCraftHelper = WorldGatewayCraftHelper;

export { WorldGatewayCraftHelper };
