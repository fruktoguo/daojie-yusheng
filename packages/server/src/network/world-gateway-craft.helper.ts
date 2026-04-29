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
 * handleRequestTechniqueActivityPanel：统一技艺面板请求入口。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新技艺面板请求相关状态。
 */

    handleRequestTechniqueActivityPanel(client, payload, kind) {
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
            this.gateway.worldClientEventService.markProtocol(client, 'mainline');
            const panelPayload = this.gateway.craftPanelRuntimeService.buildTechniqueActivityPanelPayload(player, kind, payload?.knownCatalogVersion);
            (0, technique_activity_registry_helpers_1.emitTechniqueActivityPanel)(client, kind, panelPayload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, (0, technique_activity_registry_helpers_1.getTechniqueActivityMetadata)(kind).requestPanelErrorCode, error);
        }
    }    
    /**
 * handleStartTechniqueActivity：统一技艺活动开始入口。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新技艺活动开始相关状态。
 */

    handleStartTechniqueActivity(client, payload, kind) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'mainline');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueStartTechniqueActivity(playerId, kind, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, (0, technique_activity_registry_helpers_1.getTechniqueActivityMetadata)(kind).startErrorCode, error);
        }
    }    
    /**
 * handleCancelTechniqueActivity：统一技艺活动取消入口。
 * @param client 参数说明。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新技艺活动取消相关状态。
 */

    handleCancelTechniqueActivity(client, kind) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'mainline');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCancelTechniqueActivity(playerId, kind, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, (0, technique_activity_registry_helpers_1.getTechniqueActivityMetadata)(kind).cancelErrorCode, error);
        }
    }    
    /**
 * handleRequestAlchemyPanel：处理炼丹面板请求并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新炼丹面板请求相关状态。
 */

    handleRequestAlchemyPanel(client, payload) {
        this.handleRequestTechniqueActivityPanel(client, payload, 'alchemy');
    }    
    /**
 * handleRequestEnhancementPanel：处理强化面板请求并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新强化面板请求相关状态。
 */

    handleRequestEnhancementPanel(client, _payload) {
        this.handleRequestTechniqueActivityPanel(client, _payload, 'enhancement');
    }    
    /**
 * handleStartAlchemy：处理开始炼丹并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新开始炼丹相关状态。
 */

    handleStartAlchemy(client, payload) {
        this.handleStartTechniqueActivity(client, payload, 'alchemy');
    }    
    /**
 * handleCancelAlchemy：判断取消炼丹是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新取消炼丹相关状态。
 */

    handleCancelAlchemy(client, _payload) {
        void _payload;
        this.handleCancelTechniqueActivity(client, 'alchemy');
    }    
    /**
 * handleSaveAlchemyPreset：处理保存炼丹预设并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新保存炼丹预设相关状态。
 */

    handleSaveAlchemyPreset(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'mainline');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSaveAlchemyPreset(playerId, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SAVE_ALCHEMY_PRESET_FAILED', error);
        }
    }    
    /**
 * handleDeleteAlchemyPreset：处理删除炼丹预设并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新删除炼丹预设相关状态。
 */

    handleDeleteAlchemyPreset(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'mainline');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDeleteAlchemyPreset(playerId, payload?.presetId, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DELETE_ALCHEMY_PRESET_FAILED', error);
        }
    }    
    /**
 * handleStartEnhancement：处理开始强化并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新开始强化相关状态。
 */

    handleStartEnhancement(client, payload) {
        this.handleStartTechniqueActivity(client, payload, 'enhancement');
    }    
    /**
 * handleCancelEnhancement：判断取消强化是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新取消强化相关状态。
 */

    handleCancelEnhancement(client, _payload) {
        void _payload;
        this.handleCancelTechniqueActivity(client, 'enhancement');
    }
}
exports.WorldGatewayCraftHelper = WorldGatewayCraftHelper;

export { WorldGatewayCraftHelper };
