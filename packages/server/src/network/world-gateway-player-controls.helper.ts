// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayPlayerControlsHelper = void 0;

/** 世界 socket 玩家控制 helper：只收敛 player-controls 相关入口。 */
class WorldGatewayPlayerControlsHelper {
/**
 * gateway：WorldGatewayPlayerControlsHelper 内部字段。
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
 * handleNextChat：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextAckSystemMessages：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextDebugResetSpawn：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 函数返回值。
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
 * handleNextUpdateAutoBattleSkills：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextUpdateAutoUsePills：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextUpdateCombatTargetingRules：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextUpdateAutoBattleTargetingMode：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextUpdateTechniqueSkillAvailability：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextHeavenGateAction：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleRequestQuests：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 函数返回值。
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
