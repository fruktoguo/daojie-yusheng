/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 世界网关玩家控制 helper。
 * 收敛聊天、自动战斗配置、修炼、天门和离线收益确认等玩家操作入口。
 */

import { C2S, S2C, type ClientToServerEventPayload, type TimeChamberOperationKind } from '@mud/shared';
import type { Socket } from 'socket.io';

const MAX_OFFLINE_GAIN_REFRESH_REQUEST_ID_LENGTH = 96;
const TIME_CHAMBER_PASSWORD_ATTEMPTS_PER_WINDOW = 6;
const TIME_CHAMBER_PASSWORD_ATTEMPT_WINDOW_MS = 10_000;

interface WorldGatewayPlayerControlsDeps {
  gatewayGuardHelper: {
    requirePlayerId(client: Socket): string | null | undefined;
    requireActivePlayerId(client: Socket): string | null | undefined;
    checkRateLimit?(client: Socket, eventCategory?: string, maxPerWindow?: number, windowMs?: number): boolean;
  };
  worldClientEventService: {
    broadcastChat(
      playerId: string,
      payload: ClientToServerEventPayload<typeof C2S.Chat>,
      runtime: WorldGatewayPlayerControlsDeps['worldRuntimeService'],
    ): void;
    emitChatHistory(client: Socket, playerId: string, payload: ClientToServerEventPayload<typeof C2S.RequestChatHistory>): Promise<void>;
    acknowledgeSystemMessages(playerId: string, payload: ClientToServerEventPayload<typeof C2S.AckSystemMessages>): void;
    emitGatewayError(client: Socket, code: string, error: unknown): void;
  };
  socialRuntimeService: any;
  treasureVaultRuntimeService: any;
  timeChamberRuntimeService: any;
  worldSessionService: {
    getSocketByPlayerId(playerId: string): any;
    getBinding(playerId: string): { connected?: boolean; socketId?: string | null } | null;
  };
  worldRuntimeService: {
    buildQuestListView(playerId: string, input?: unknown): unknown;
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
  sessionBootstrapService: {
    connectBootstrapRuntimePlayer(input: {
      playerId: string;
      sessionId?: string | null;
      instanceId?: string | null;
      mapId?: string | null;
      preferredX?: number;
      preferredY?: number;
      allowCreateFallback?: boolean;
    }): unknown;
  };
  worldSyncService?: {
    emitInitialSync(playerId: string, socketOverride?: Socket): void;
    emitDeltaSync(playerId: string, socketOverride?: Socket): void;
  };
  playerDomainPersistenceService: {
    isEnabled(): boolean;
  };
  playerPersistenceFlushService: {
    flushPlayerDomains(playerId: string, domains: Iterable<string>): Promise<boolean>;
  };
  playerRuntimeService: {
    getPlayer(playerId: string): {
      instanceId?: string | null;
      templateId?: string | null;
      x?: number;
      y?: number;
    } | null | undefined;
    loadOfflineGainPreviewReports(playerId: string): Promise<unknown[]>;
    hasActiveOfflineGainSession?(playerId: string): Promise<boolean>;
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
    acknowledgeOfflineGainReports(playerId: string, reportIds: string[], options?: { sessionId?: string | null }): Promise<boolean>;
    runExclusiveAssetMutation<T>(
      playerIds: readonly string[],
      action: () => Promise<T> | T,
    ): Promise<T>;
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
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    if (!this.allowChatRequest(client, 'chat-send', 5, 5_000, 'CHAT_RATE_LIMITED', '聊天发送过于频繁，请稍后再试')) {
      return;
    }
    this.gateway.worldClientEventService.broadcastChat(playerId, payload, this.gateway.worldRuntimeService);
  }

  async handleRequestChatHistory(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RequestChatHistory>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    if (!this.allowChatRequest(client, 'chat-history', 4, 5_000, 'CHAT_HISTORY_RATE_LIMITED', '聊天记录同步过于频繁')) {
      return;
    }
    try {
      await this.gateway.worldClientEventService.emitChatHistory(client, playerId, payload);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_CHAT_HISTORY_FAILED', error);
    }
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

  async handleAckOfflineGainReports(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.AckOfflineGainReports>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      const sessionId = typeof client.data?.sessionId === 'string' ? client.data.sessionId : null;
      let shouldResumeBootstrap = false;
      await this.gateway.playerRuntimeService.runExclusiveAssetMutation([playerId], async () => {
        shouldResumeBootstrap = await this.gateway.playerRuntimeService.acknowledgeOfflineGainReports(
          playerId,
          payload?.reportIds ?? [],
          { sessionId },
        );
        if (!shouldResumeBootstrap || !sessionId || this.gateway.playerDomainPersistenceService.isEnabled() !== true) {
          return;
        }
        const presencePersisted = await this.gateway.playerPersistenceFlushService.flushPlayerDomains(
          playerId,
          ['presence'],
        );
        if (!presencePersisted) {
          throw new Error(`offline_gain_session_presence_flush_failed:${playerId}`);
        }
      });
      if (!shouldResumeBootstrap) {
        return;
      }
      if (this.gateway.gatewayGuardHelper.requireActivePlayerId(client) !== playerId) {
        return;
      }
      const player = this.gateway.playerRuntimeService.getPlayer(playerId);
      if (sessionId && player) {
        await this.gateway.sessionBootstrapService.connectBootstrapRuntimePlayer({
          playerId,
          sessionId,
          instanceId: player.instanceId ?? undefined,
          mapId: player.templateId ?? undefined,
          preferredX: Number.isFinite(Number(player.x)) ? Number(player.x) : undefined,
          preferredY: Number.isFinite(Number(player.y)) ? Number(player.y) : undefined,
          allowCreateFallback: false,
        });
        this.gateway.worldSyncService?.emitInitialSync(playerId, client);
      }
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'ACK_OFFLINE_GAIN_REPORTS_FAILED', error);
    }
  }

  async handleRequestOfflineGainReports(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RequestOfflineGainReports>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    const requestId = normalizeOfflineGainRefreshRequestId(payload?.requestId);
    if (!requestId) {
      return;
    }
    try {
      const blocking = await this.gateway.playerRuntimeService.hasActiveOfflineGainSession?.(playerId) === true;
      const reports = await this.gateway.playerRuntimeService.loadOfflineGainPreviewReports(playerId);
      if (this.gateway.gatewayGuardHelper.requirePlayerId(client) !== playerId) {
        return;
      }
      client.emit(S2C.OfflineGainReports, {
        requestId,
        reports,
        ...(blocking ? { preview: true, blocking: true } : {}),
      });
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_OFFLINE_GAIN_REPORTS_FAILED', error);
    }
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
      this.gateway.worldSyncService?.emitDeltaSync(playerId, client);
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
      this.gateway.worldSyncService?.emitDeltaSync(playerId, client);
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
      this.gateway.worldSyncService?.emitDeltaSync(playerId, client);
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
      this.gateway.worldSyncService?.emitDeltaSync(playerId, client);
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
      this.gateway.worldSyncService?.emitDeltaSync(playerId, client);
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

  async handleRequestSocialPanel(
    client: Socket,
    _payload: ClientToServerEventPayload<typeof C2S.RequestSocialPanel>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    if (!this.allowChatRequest(client, 'social-panel', 4, 5_000, 'SOCIAL_PANEL_RATE_LIMITED', '社交信息刷新过于频繁')) {
      return;
    }
    try {
      const panel = await this.gateway.socialRuntimeService.buildPanel(playerId, this.gateway.worldRuntimeService);
      if (this.isCurrentPlayerSocket(client, playerId)) {
        client.emit(S2C.SocialPanel, panel);
      }
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_SOCIAL_PANEL_FAILED', error);
    }
  }

  async handleRequestNearbyDaoistCandidates(
    client: Socket,
    _payload: ClientToServerEventPayload<typeof C2S.RequestNearbyDaoistCandidates>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    if (!this.allowChatRequest(client, 'social-nearby', 4, 5_000, 'SOCIAL_NEARBY_RATE_LIMITED', '附近道友刷新过于频繁')) {
      return;
    }
    try {
      const panel = await this.gateway.socialRuntimeService.buildPanel(playerId, this.gateway.worldRuntimeService);
      if (this.isCurrentPlayerSocket(client, playerId)) {
        client.emit(S2C.SocialPanel, panel);
      }
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_DAOIST_CANDIDATES_FAILED', error);
    }
  }

  async handleSendDaoistRequest(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.SendDaoistRequest>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      const result = await this.gateway.socialRuntimeService.sendRequest(playerId, payload?.targetPlayerId, this.gateway.worldRuntimeService);
      this.emitSocialOperationResult(client, 'request', result);
      this.emitTargetSocialPanel(payload?.targetPlayerId, result?.targetPanel);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'SEND_DAOIST_REQUEST_FAILED', error);
    }
  }

  async handleRespondDaoistRequest(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RespondDaoistRequest>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      const result = await this.gateway.socialRuntimeService.respondRequest(playerId, payload?.requestId, payload?.accept === true, this.gateway.worldRuntimeService);
      this.emitSocialOperationResult(client, 'respond', result);
      this.emitTargetSocialPanel(result?.fromPlayerId, result?.fromPanel);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'RESPOND_DAOIST_REQUEST_FAILED', error);
    }
  }

  async handleUpdateDaoistRelationLevel(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.UpdateDaoistRelationLevel>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      const result = await this.gateway.socialRuntimeService.updateRelationLevel(playerId, payload?.targetPlayerId, payload?.level, this.gateway.worldRuntimeService);
      this.emitSocialOperationResult(client, 'level', result);
      this.emitTargetSocialPanel(payload?.targetPlayerId, result?.targetPanel);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'UPDATE_DAOIST_RELATION_FAILED', error);
    }
  }

  async handleRemoveDaoistRelation(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RemoveDaoistRelation>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      const result = await this.gateway.socialRuntimeService.removeRelation(playerId, payload?.targetPlayerId, this.gateway.worldRuntimeService);
      this.emitSocialOperationResult(client, 'remove', result);
      this.emitTargetSocialPanel(payload?.targetPlayerId, result?.targetPanel);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'REMOVE_DAOIST_RELATION_FAILED', error);
    }
  }

  async handleSendDaoistDirectMessage(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.SendDaoistDirectMessage>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    if (!this.allowChatRequest(client, 'daoist-message-send', 5, 5_000, 'DAOIST_MESSAGE_RATE_LIMITED', '私聊发送过于频繁，请稍后再试')) {
      return;
    }
    try {
      const result = await this.gateway.socialRuntimeService.createDirectMessage(playerId, payload?.targetPlayerId, payload?.message);
      if (this.isCurrentPlayerSocket(client, playerId)) {
        client.emit(S2C.SocialOperationResult, { ok: result?.ok === true, operation: 'message', reason: result?.reason });
      }
      if (result?.message) {
        const senderSocket = this.gateway.worldSessionService.getSocketByPlayerId(playerId);
        senderSocket?.emit(S2C.DaoistDirectMessage, result.message);
        const targetSocket = this.gateway.worldSessionService.getSocketByPlayerId(result.message.toPlayerId);
        targetSocket?.emit(S2C.DaoistDirectMessage, result.message);
      }
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'SEND_DAOIST_MESSAGE_FAILED', error);
    }
  }

  async handleRequestDaoistDirectMessageHistory(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RequestDaoistDirectMessageHistory>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    if (!this.allowChatRequest(client, 'daoist-message-history', 4, 5_000, 'DAOIST_HISTORY_RATE_LIMITED', '私聊记录同步过于频繁')) {
      return;
    }
    try {
      const result = await this.gateway.socialRuntimeService.loadDirectMessageHistory(
        playerId,
        payload?.peerPlayerId,
        payload?.cursor,
        payload?.requestId,
      );
      if (!this.isCurrentPlayerSocket(client, playerId)) {
        return;
      }
      if (result?.history) {
        client.emit(S2C.DaoistDirectMessageHistory, result.history);
        return;
      }
      client.emit(S2C.SocialOperationResult, { ok: false, operation: 'message', reason: result?.reason });
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_DAOIST_MESSAGE_HISTORY_FAILED', error);
    }
  }

  async handleMarkDaoistDirectMessagesRead(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.MarkDaoistDirectMessagesRead>,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    if (!this.allowChatRequest(client, 'daoist-message-read', 10, 5_000, 'DAOIST_READ_RATE_LIMITED', '私聊已读同步过于频繁')) {
      return;
    }
    try {
      await this.gateway.socialRuntimeService.markDirectMessagesRead(playerId, payload?.peerPlayerId, payload?.cursor);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'MARK_DAOIST_MESSAGES_READ_FAILED', error);
    }
  }

  async handleRequestTreasureVault(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RequestTreasureVault>,
  ): Promise<void> {
    await this.handleTreasureVaultOperation(client, 'REQUEST_TREASURE_VAULT_FAILED', () => this.gateway.treasureVaultRuntimeService.buildDetail(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService));
  }

  async handleTreasureVaultDeposit(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.TreasureVaultDeposit>,
  ): Promise<void> {
    await this.handleTreasureVaultOperation(client, 'TREASURE_VAULT_DEPOSIT_FAILED', () => this.gateway.treasureVaultRuntimeService.deposit(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService), true);
  }

  async handleTreasureVaultWithdraw(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.TreasureVaultWithdraw>,
  ): Promise<void> {
    await this.handleTreasureVaultOperation(client, 'TREASURE_VAULT_WITHDRAW_FAILED', () => this.gateway.treasureVaultRuntimeService.withdraw(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService), true);
  }

  async handleOrganizeTreasureVault(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.OrganizeTreasureVault>,
  ): Promise<void> {
    await this.handleTreasureVaultOperation(client, 'TREASURE_VAULT_ORGANIZE_FAILED', () => this.gateway.treasureVaultRuntimeService.organize(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService));
  }

  async handleRenameTreasureVault(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RenameTreasureVault>,
  ): Promise<void> {
    await this.handleTreasureVaultOperation(client, 'TREASURE_VAULT_RENAME_FAILED', () => this.gateway.treasureVaultRuntimeService.rename(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService));
  }

  async handleRequestTimeChamber(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RequestTimeChamber>,
  ): Promise<void> {
    const operation = payload?.mode === 'management' ? 'management_detail' : 'usage_detail';
    await this.handleTimeChamberOperation(client, operation, 'REQUEST_TIME_CHAMBER_FAILED', payload?.requestId, () => this.gateway.timeChamberRuntimeService.buildDetail(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService));
  }

  async handleActivateTimeChamber(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.ActivateTimeChamber>,
  ): Promise<void> {
    if (payload?.accessPassword && !this.allowTimeChamberPasswordAttempt(client, 'activate', payload.requestId)) return;
    await this.handleTimeChamberOperation(client, 'activate', 'ACTIVATE_TIME_CHAMBER_FAILED', payload?.requestId, () => this.gateway.timeChamberRuntimeService.activate(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService), true);
  }

  async handleEnterTimeChamber(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.EnterTimeChamber>,
  ): Promise<void> {
    if (payload?.accessPassword && !this.allowTimeChamberPasswordAttempt(client, 'enter', payload.requestId)) return;
    await this.handleTimeChamberOperation(client, 'enter', 'ENTER_TIME_CHAMBER_FAILED', payload?.requestId, () => this.gateway.timeChamberRuntimeService.queueEnter(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService));
  }

  async handleUpdateTimeChamberSettings(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.UpdateTimeChamberSettings>,
  ): Promise<void> {
    await this.handleTimeChamberOperation(client, 'settings', 'UPDATE_TIME_CHAMBER_SETTINGS_FAILED', payload?.requestId, () => this.gateway.timeChamberRuntimeService.updateSettings(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService), true);
  }

  async handleResizeTimeChamber(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.ResizeTimeChamber>,
  ): Promise<void> {
    await this.handleTimeChamberOperation(client, 'resize', 'RESIZE_TIME_CHAMBER_FAILED', payload?.requestId, () => this.gateway.timeChamberRuntimeService.resize(this.gateway.gatewayGuardHelper.requirePlayerId(client), payload, this.gateway.worldRuntimeService));
  }

  private emitSocialOperationResult(client: Socket, operation: 'request' | 'respond' | 'level' | 'remove' | 'message', result: any): void {
    client.emit(S2C.SocialOperationResult, {
      ok: result?.ok === true,
      operation,
      reason: result?.reason,
      ...(result?.panel ? { panel: result.panel } : {}),
    });
    if (result?.panel) {
      client.emit(S2C.SocialPanel, result.panel);
    }
  }

  private allowChatRequest(
    client: Socket,
    category: string,
    maxPerWindow: number,
    windowMs: number,
    code: string,
    message: string,
  ): boolean {
    const checkRateLimit = this.gateway.gatewayGuardHelper.checkRateLimit;
    if (typeof checkRateLimit !== 'function'
      || checkRateLimit.call(this.gateway.gatewayGuardHelper, client, category, maxPerWindow, windowMs)) {
      return true;
    }
    client.emit(S2C.Error, { code, message });
    return false;
  }

  private isCurrentPlayerSocket(client: Socket, playerId: string): boolean {
    const binding = this.gateway.worldSessionService.getBinding(playerId);
    return binding?.connected === true && binding.socketId === client.id;
  }

  private emitTargetSocialPanel(targetPlayerId: unknown, panel: unknown): void {
    const normalizedTargetPlayerId = typeof targetPlayerId === 'string' ? targetPlayerId.trim() : '';
    if (!normalizedTargetPlayerId || !panel) {
      return;
    }
    this.gateway.worldSessionService.getSocketByPlayerId(normalizedTargetPlayerId)?.emit(S2C.SocialPanel, panel);
  }

  private async handleTreasureVaultOperation(
    client: Socket,
    errorCode: string,
    run: () => Promise<any>,
    emitDelta = false,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      const result = await run();
      client.emit(S2C.TreasureVaultOperationResult, result);
      if (result?.detail) {
        client.emit(S2C.TreasureVaultDetail, result.detail);
      }
      if (emitDelta && result?.ok === true) {
        this.gateway.worldSyncService?.emitDeltaSync(playerId, client);
      }
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, errorCode, error);
    }
  }

  private async handleTimeChamberOperation(
    client: Socket,
    operation: TimeChamberOperationKind,
    errorCode: string,
    requestIdInput: unknown,
    run: () => Promise<any>,
    emitDelta = false,
  ): Promise<void> {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      const result = await run();
      client.emit(S2C.TimeChamberOperationResult, result);
      if (emitDelta && result?.ok === true) {
        this.gateway.worldSyncService?.emitDeltaSync(playerId, client);
      }
    } catch (error) {
      client.emit(S2C.TimeChamberOperationResult, {
        ok: false,
        operation,
        requestId: normalizeTimeChamberRequestId(requestIdInput),
        reason: 'time_chamber_operation_failed',
      });
      this.gateway.worldClientEventService.emitGatewayError(client, errorCode, error);
    }
  }

  private allowTimeChamberPasswordAttempt(
    client: Socket,
    operation: 'activate' | 'enter',
    requestIdInput: unknown,
  ): boolean {
    const checkRateLimit = this.gateway.gatewayGuardHelper.checkRateLimit;
    if (typeof checkRateLimit !== 'function' || checkRateLimit.call(
      this.gateway.gatewayGuardHelper,
      client,
      'time-chamber-password',
      TIME_CHAMBER_PASSWORD_ATTEMPTS_PER_WINDOW,
      TIME_CHAMBER_PASSWORD_ATTEMPT_WINDOW_MS,
    )) {
      return true;
    }
    client.emit(S2C.TimeChamberOperationResult, {
      ok: false,
      operation,
      requestId: normalizeTimeChamberRequestId(requestIdInput),
      reason: 'time_chamber_password_rate_limited',
    });
    return false;
  }
}

function normalizeOfflineGainRefreshRequestId(value: unknown): string {
  const requestId = typeof value === 'string' ? value.trim() : '';
  return requestId.length <= MAX_OFFLINE_GAIN_REFRESH_REQUEST_ID_LENGTH ? requestId : '';
}

function normalizeTimeChamberRequestId(value: unknown): string | undefined {
  const requestId = typeof value === 'string' ? value.trim() : '';
  return requestId && requestId.length <= 128 ? requestId : undefined;
}
