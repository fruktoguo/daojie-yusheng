// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayPlayerControlsHelper = void 0;

/** 世界 socket 玩家控制 helper：只收敛 player-controls 相关入口。 */
class WorldGatewayPlayerControlsHelper {
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
 * handleNextChat：处理NextChat并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextChat相关状态。
 */

    handleNextChat(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gateway.worldClientEventService.broadcastChat(playerId, payload);
    }    
    /**
 * handleNextAckSystemMessages：处理NextAckSystemMessage并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextAckSystemMessage相关状态。
 */

    handleNextAckSystemMessages(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gateway.worldClientEventService.acknowledgeSystemMessages(playerId, payload);
    }    
    /**
 * handleNextDebugResetSpawn：处理NextDebugResetSpawn并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextDebugResetSpawn相关状态。
 */

    handleNextDebugResetSpawn(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gateway.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
    }    
    /**
 * handleNextUpdateAutoBattleSkills：处理NextUpdateAutoBattle技能并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdateAutoBattle技能相关状态。
 */

    handleNextUpdateAutoBattleSkills(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.playerRuntimeService.updateAutoBattleSkills(playerId, payload?.skills ?? []);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_AUTO_BATTLE_SKILLS_FAILED', error);
        }
    }    
    /**
 * handleNextUpdateAutoUsePills：处理NextUpdateAutoUsePill并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdateAutoUsePill相关状态。
 */

    handleNextUpdateAutoUsePills(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.playerRuntimeService.updateAutoUsePills(playerId, payload?.pills ?? []);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_AUTO_USE_PILLS_FAILED', error);
        }
    }    
    /**
 * handleNextUpdateCombatTargetingRules：读取NextUpdate战斗TargetingRule并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdate战斗TargetingRule相关状态。
 */

    handleNextUpdateCombatTargetingRules(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.playerRuntimeService.updateCombatTargetingRules(playerId, payload?.combatTargetingRules);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_COMBAT_TARGETING_RULES_FAILED', error);
        }
    }    
    /**
 * handleNextUpdateAutoBattleTargetingMode：读取NextUpdateAutoBattleTargetingMode并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdateAutoBattleTargetingMode相关状态。
 */

    handleNextUpdateAutoBattleTargetingMode(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.playerRuntimeService.updateAutoBattleTargetingMode(playerId, payload?.mode ?? payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_AUTO_BATTLE_TARGETING_MODE_FAILED', error);
        }
    }    
    /**
 * handleNextUpdateTechniqueSkillAvailability：处理NextUpdate功法技能Availability并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUpdate功法技能Availability相关状态。
 */

    handleNextUpdateTechniqueSkillAvailability(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.playerRuntimeService.updateTechniqueSkillAvailability(playerId, payload?.techId ?? '', payload?.enabled !== false);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_TECHNIQUE_SKILL_AVAILABILITY_FAILED', error);
        }
    }    
    /**
 * handleNextHeavenGateAction：处理NextHeavenGateAction并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextHeavenGateAction相关状态。
 */

    handleNextHeavenGateAction(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueHeavenGateAction(playerId, payload?.action, payload?.element);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'HEAVEN_GATE_ACTION_FAILED', error);
        }
    }    
    /**
 * handleRequestQuests：处理Request任务并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新Request任务相关状态。
 */

    handleRequestQuests(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.gatewayClientEmitHelper.emitNextQuests(client, this.gateway.worldRuntimeService.buildQuestListView(playerId));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_QUESTS_FAILED', error);
        }
    }
}
exports.WorldGatewayPlayerControlsHelper = WorldGatewayPlayerControlsHelper;

export { WorldGatewayPlayerControlsHelper };
