import { C2S, type ClientToServerEventPayload } from '@mud/shared';
import type { Socket } from 'socket.io';

interface WorldGatewayPlayerControlsDeps {
  gatewayGuardHelper: {
    requirePlayerId(client: Socket): string | null | undefined;
  };
  worldClientEventService: {
    broadcastChat(playerId: string, payload: ClientToServerEventPayload<typeof C2S.Chat>): void;
    acknowledgeSystemMessages(playerId: string, payload: ClientToServerEventPayload<typeof C2S.AckSystemMessages>): void;
    emitGatewayError(client: Socket, code: string, error: unknown): void;
  };
  worldRuntimeService: {
    buildQuestListView(playerId: string): unknown;
    worldRuntimeCommandIntakeFacadeService: {
      enqueueResetPlayerSpawn(playerId: string, deps: unknown): void;
      enqueueHeavenGateAction(
        playerId: string,
        action: ClientToServerEventPayload<typeof C2S.HeavenGateAction>['action'],
        element: ClientToServerEventPayload<typeof C2S.HeavenGateAction>['element'],
        deps: unknown,
      ): void;
    };
  };
  playerRuntimeService: {
    updateAutoBattleSkills(playerId: string, skills: ClientToServerEventPayload<typeof C2S.UpdateAutoBattleSkills>['skills']): void;
    updateAutoUsePills(playerId: string, pills: ClientToServerEventPayload<typeof C2S.UpdateAutoUsePills>['pills']): void;
    updateCombatTargetingRules(
      playerId: string,
      rules: ClientToServerEventPayload<typeof C2S.UpdateCombatTargetingRules>['combatTargetingRules'],
    ): void;
    updateAutoBattleTargetingMode(
      playerId: string,
      mode: ClientToServerEventPayload<typeof C2S.UpdateAutoBattleTargetingMode>['mode'],
    ): void;
    updateTechniqueSkillAvailability(playerId: string, techId: string, enabled: boolean): void;
  };
  gatewayClientEmitHelper: {
    emitQuests(client: Socket, payload: unknown): void;
  };
}

/** 世界 socket 玩家控制 helper：只收敛 player-controls 相关入口。 */
export class WorldGatewayPlayerControlsHelper {
  constructor(private readonly gateway: WorldGatewayPlayerControlsDeps) {}

  handleChat(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.Chat>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    this.gateway.worldClientEventService.broadcastChat(playerId, payload);
  }

  handleAckSystemMessages(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.AckSystemMessages>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    this.gateway.worldClientEventService.acknowledgeSystemMessages(playerId, payload);
  }

  handleDebugResetSpawn(
    client: Socket,
    _payload: ClientToServerEventPayload<typeof C2S.DebugResetSpawn>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueResetPlayerSpawn(playerId, this.gateway.worldRuntimeService);
  }

  handleUpdateAutoBattleSkills(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.UpdateAutoBattleSkills>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      this.gateway.playerRuntimeService.updateAutoBattleSkills(playerId, payload?.skills ?? []);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_AUTO_BATTLE_SKILLS_FAILED', error);
    }
  }

  handleUpdateAutoUsePills(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.UpdateAutoUsePills>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      this.gateway.playerRuntimeService.updateAutoUsePills(playerId, payload?.pills ?? []);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_AUTO_USE_PILLS_FAILED', error);
    }
  }

  handleUpdateCombatTargetingRules(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.UpdateCombatTargetingRules>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      this.gateway.playerRuntimeService.updateCombatTargetingRules(playerId, payload?.combatTargetingRules);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_COMBAT_TARGETING_RULES_FAILED', error);
    }
  }

  handleUpdateAutoBattleTargetingMode(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.UpdateAutoBattleTargetingMode>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      const mode = typeof payload === 'string' ? payload : payload?.mode;
      this.gateway.playerRuntimeService.updateAutoBattleTargetingMode(playerId, mode ?? 'auto');
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_AUTO_BATTLE_TARGETING_MODE_FAILED', error);
    }
  }

  handleUpdateTechniqueSkillAvailability(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.UpdateTechniqueSkillAvailability>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      this.gateway.playerRuntimeService.updateTechniqueSkillAvailability(
        playerId,
        payload?.techId ?? '',
        payload?.enabled !== false,
      );
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_TECHNIQUE_SKILL_AVAILABILITY_FAILED', error);
    }
  }

  handleHeavenGateAction(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.HeavenGateAction>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueHeavenGateAction(playerId, payload?.action, payload?.element, this.gateway.worldRuntimeService);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'HEAVEN_GATE_ACTION_FAILED', error);
    }
  }

  handleRequestQuests(
    client: Socket,
    _payload: ClientToServerEventPayload<typeof C2S.RequestQuests>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      this.gateway.gatewayClientEmitHelper.emitQuests(
        client,
        this.gateway.worldRuntimeService.buildQuestListView(playerId),
      );
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_QUESTS_FAILED', error);
    }
  }
}
