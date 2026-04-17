"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayPlayerControlsHelper = void 0;

/** 世界 socket 玩家控制 helper：只收敛 player-controls 相关入口。 */
class WorldGatewayPlayerControlsHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleNextChat(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gateway.worldClientEventService.broadcastChat(playerId, payload);
    }
    handleNextAckSystemMessages(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gateway.worldClientEventService.acknowledgeSystemMessages(playerId, payload);
    }
    handleNextDebugResetSpawn(client, _payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gateway.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
    }
    handleNextUpdateAutoBattleSkills(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
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
    handleNextUpdateAutoUsePills(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
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
    handleNextUpdateCombatTargetingRules(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
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
    handleNextUpdateAutoBattleTargetingMode(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
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
    handleNextUpdateTechniqueSkillAvailability(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
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
    handleNextHeavenGateAction(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
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
    handleRequestQuests(client, _payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.emitNextQuests(client, this.gateway.worldRuntimeService.buildQuestListView(playerId));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_QUESTS_FAILED', error);
        }
    }
}
exports.WorldGatewayPlayerControlsHelper = WorldGatewayPlayerControlsHelper;
