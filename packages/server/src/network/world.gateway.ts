/**
 * 世界网关主入口。
 * Socket.IO WebSocket 网关，注册所有 C2S 事件 handler 并委托给各 helper 处理。
 * 负责连接生命周期（connect/disconnect）、频率限制和 GM 性能观测挂载。
 */

import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { ATTR_KEYS, ATTR_TO_NUMERIC_WEIGHTS, ATTR_TO_PERCENT_NUMERIC_WEIGHTS, C2S, DEFAULT_PLAYER_REALM_STAGE, ELEMENT_KEYS, NUMERIC_SCALAR_STAT_KEYS, PLAYER_REALM_CONFIG, TechniqueRealm, addPartialNumericStats, applyEquipmentAttributeEffectivenessToItemStack, calcTechniqueFinalAttrBonus, calcTechniqueQiProjectionModifiers, cloneNumericStats, compileValueStatsToActualStats, createNumericStats, resolvePlayerRealmAttributeBonus, resolvePlayerRealmNumericTemplate } from '@mud/shared';
import { Server, Socket } from 'socket.io';
import { resolveServerCorsOptions } from '../config/server-cors';
import { HealthReadinessService } from '../health/health-readiness.service';
import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import { PlayerSessionRouteService } from '../persistence/player-session-route.service';
import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { LeaderboardRuntimeService } from '../runtime/player/leaderboard-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { SuggestionRuntimeService } from '../runtime/suggestion/suggestion-runtime.service';
import { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import { WorldGmSocketService } from './world-gm-socket.service';
import { WorldProtocolProjectionService } from './world-protocol-projection.service';
import { WorldSessionBootstrapService } from './world-session-bootstrap.service';
import { WorldSessionService } from './world-session.service';
import { WorldSyncService } from './world-sync.service';
import { WorldGatewayBootstrapHelper } from './world-gateway-bootstrap.helper';
import { WorldGatewayGmCommandHelper } from './world-gateway-gm-command.helper';
import { WorldGatewayGmSuggestionHelper } from './world-gateway-gm-suggestion.helper';
import { WorldGatewaySuggestionHelper } from './world-gateway-suggestion.helper';
import { WorldGatewayMovementHelper } from './world-gateway-movement.helper';
import { WorldGatewayInventoryHelper } from './world-gateway-inventory.helper';
import { WorldGatewayMailHelper } from './world-gateway-mail.helper';
import { WorldGatewayPlayerControlsHelper } from './world-gateway-player-controls.helper';
import { WorldGatewayActionHelper } from './world-gateway-action.helper';
import { WorldGatewayNpcHelper } from './world-gateway-npc.helper';
import { WorldGatewayCraftHelper } from './world-gateway-craft.helper';
import { WorldGatewayMarketHelper } from './world-gateway-market.helper';
import { WorldGatewayReadModelHelper } from './world-gateway-read-model.helper';
import { WorldGatewayBuildingHelper } from './world-gateway-building.helper';
import { WorldGatewayClientEmitHelper } from './world-gateway-client-emit.helper';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';
import { WorldGatewaySessionStateHelper } from './world-gateway-session-state.helper';
import { WorldGatewayPresenceHelper } from './world-gateway-presence.helper';

const AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES = new Set([
    'mainline',
    'token',
]);
const AUTHENTICATED_CONNECT_CONTRACT = Object.freeze({
    protocolRequiredCode: 'AUTH_PROTOCOL_REQUIRED',
    unsupportedProtocolCode: 'AUTH_PROTOCOL_UNSUPPORTED',
    invalidSessionIdCode: 'AUTH_SESSION_ID_INVALID',
    authFailCode: 'AUTH_FAIL',
    legacyProtocolDisabledCode: 'LEGACY_PROTOCOL_DISABLED',
});
const GM_CONNECT_CONTRACT = Object.freeze({
    authFailCode: 'GM_AUTH_FAIL',
    playerAuthRequiredCode: 'GM_PLAYER_AUTH_REQUIRED',
    sessionIdForbiddenCode: 'GM_SESSION_ID_FORBIDDEN',
});
/** 世界网关：Socket.IO 协议入口，注册所有 C2S handler 并委托 helper 执行，自身只做路由分发。 */
@WebSocketGateway({
    cors: resolveServerCorsOptions(),
    path: '/socket.io',
})
class WorldGateway {
        worldGmSocketService: WorldGmSocketService; worldProtocolProjectionService: WorldProtocolProjectionService; sessionBootstrapService: WorldSessionBootstrapService; healthReadinessService: HealthReadinessService;
        playerDomainPersistenceService: PlayerDomainPersistenceService; playerPersistenceFlushService: PlayerPersistenceFlushService; playerRuntimeService: PlayerRuntimeService; mailRuntimeService: MailRuntimeService;
        marketRuntimeService: any; craftPanelRuntimeService: CraftPanelRuntimeService; suggestionRuntimeService: SuggestionRuntimeService; leaderboardRuntimeService: LeaderboardRuntimeService;
        runtimeGmStateService: RuntimeGmStateService; worldRuntimeService: any; worldClientEventService: WorldClientEventService; worldSessionService: WorldSessionService; playerSessionRouteService: PlayerSessionRouteService;
        worldSyncService: WorldSyncService;
        gatewayBootstrapHelper: WorldGatewayBootstrapHelper; gatewayGmCommandHelper: WorldGatewayGmCommandHelper; gatewayGmSuggestionHelper: WorldGatewayGmSuggestionHelper; gatewaySuggestionHelper: WorldGatewaySuggestionHelper;
        gatewayMovementHelper: WorldGatewayMovementHelper; gatewayInventoryHelper: WorldGatewayInventoryHelper; gatewayMailHelper: WorldGatewayMailHelper; gatewayPlayerControlsHelper: WorldGatewayPlayerControlsHelper;
        gatewayNpcHelper: WorldGatewayNpcHelper; gatewayCraftHelper: WorldGatewayCraftHelper; gatewayMarketHelper: WorldGatewayMarketHelper; gatewayReadModelHelper: WorldGatewayReadModelHelper; gatewayActionHelper: WorldGatewayActionHelper;
        gatewayBuildingHelper: WorldGatewayBuildingHelper;
        gatewayClientEmitHelper: WorldGatewayClientEmitHelper; gatewayGuardHelper: WorldGatewayGuardHelper; gatewaySessionStateHelper: WorldGatewaySessionStateHelper; gatewayPresenceHelper: WorldGatewayPresenceHelper;
        @WebSocketServer()
        server!: Server; logger: Logger = new Logger(WorldGateway.name);
    constructor(worldGmSocketService: WorldGmSocketService, worldProtocolProjectionService: WorldProtocolProjectionService, sessionBootstrapService: WorldSessionBootstrapService, healthReadinessService: HealthReadinessService, playerDomainPersistenceService: PlayerDomainPersistenceService, playerPersistenceFlushService: PlayerPersistenceFlushService, playerRuntimeService: PlayerRuntimeService, mailRuntimeService: MailRuntimeService, @Inject(MarketRuntimeService) marketRuntimeService: any, craftPanelRuntimeService: CraftPanelRuntimeService, suggestionRuntimeService: SuggestionRuntimeService, leaderboardRuntimeService: LeaderboardRuntimeService, runtimeGmStateService: RuntimeGmStateService, @Inject(WorldRuntimeService) worldRuntimeService: any, worldClientEventService: WorldClientEventService, worldSessionService: WorldSessionService, playerSessionRouteService: PlayerSessionRouteService, worldSyncService: WorldSyncService) {
        this.worldGmSocketService = worldGmSocketService;
        this.worldProtocolProjectionService = worldProtocolProjectionService;
        this.sessionBootstrapService = sessionBootstrapService;
        this.healthReadinessService = healthReadinessService;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.playerRuntimeService = playerRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.leaderboardRuntimeService = leaderboardRuntimeService;
        this.runtimeGmStateService = runtimeGmStateService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldClientEventService = worldClientEventService;
        this.worldSessionService = worldSessionService;
        this.playerSessionRouteService = playerSessionRouteService;
        this.worldSyncService = worldSyncService;
        this.gatewayBootstrapHelper = new WorldGatewayBootstrapHelper(this);
        this.gatewayGmCommandHelper = new WorldGatewayGmCommandHelper(this);
        this.gatewayGmSuggestionHelper = new WorldGatewayGmSuggestionHelper(this);
        this.gatewaySuggestionHelper = new WorldGatewaySuggestionHelper(this);
        this.gatewayMovementHelper = new WorldGatewayMovementHelper(this);
        this.gatewayInventoryHelper = new WorldGatewayInventoryHelper(this);
        this.gatewayMailHelper = new WorldGatewayMailHelper(this);
        this.gatewayPlayerControlsHelper = new WorldGatewayPlayerControlsHelper(this);
        this.gatewayNpcHelper = new WorldGatewayNpcHelper(this);
        this.gatewayCraftHelper = new WorldGatewayCraftHelper(this);
        this.gatewayMarketHelper = new WorldGatewayMarketHelper(this);
        this.gatewayReadModelHelper = new WorldGatewayReadModelHelper(this);
        this.gatewayActionHelper = new WorldGatewayActionHelper(this as any);
        this.gatewayBuildingHelper = new WorldGatewayBuildingHelper(this);
        this.gatewayClientEmitHelper = new WorldGatewayClientEmitHelper(this);
        this.gatewayGuardHelper = new WorldGatewayGuardHelper(this);
        this.gatewaySessionStateHelper = new WorldGatewaySessionStateHelper(this);
        this.gatewayPresenceHelper = new WorldGatewayPresenceHelper(this);
    }
    /** 新 socket 连接建立：挂载性能观测、频率限制，然后委托 bootstrap helper 处理鉴权。 */
    async handleConnection(client: Socket) {
        this.worldSessionService.attachSocketServer(this.server);
        this.attachPerfObservers(client);
        this.attachRateLimitGuard(client);
        return this.gatewayBootstrapHelper.handleConnection(client);
    }
    /** 为 socket 挂载每事件频率限制中间件，超限时拒绝后续包。 */
    attachRateLimitGuard(client: Socket) {
        if (!client || typeof client.use !== 'function') {
            return;
        }
        client.use((packet: any[], next: (error?: Error) => void) => {
            const event = Array.isArray(packet) ? packet[0] : '';
            if (!this.gatewayGuardHelper.checkRateLimit(client, event, 60, 1000)) {
                return next(new Error('RATE_LIMIT_EXCEEDED'));
            }
            next();
        });
    }
    /** 挂载 GM 性能观测：记录所有入站/出站事件到 GM state 供调试面板展示。 */
    attachPerfObservers(client: Socket) {
        if (!client || client.data?.gmPerfObserversAttached === true) {
            return;
        }
        if (client.data) {
            client.data.gmPerfObserversAttached = true;
        }
        if (typeof client.onAny === 'function') {
            client.onAny((event: string, ...args: unknown[]) => {
                this.runtimeGmStateService.recordNetworkIn(event, args.length <= 1 ? args[0] : args);
            });
        }
        if (typeof client.onAnyOutgoing === 'function') {
            client.onAnyOutgoing((event: string, ...args: unknown[]) => {
                this.runtimeGmStateService.recordNetworkOut(event, args.length <= 1 ? args[0] : args);
            });
        }
    }
    /** socket 断开：解绑会话、清理订阅状态、持久化离线 presence 并 flush 玩家数据。 */
    async handleDisconnect(client: Socket) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const binding = this.worldSessionService.unregisterSocket(client.id);
        if (!binding) {
            return;
        }
        await this.gatewaySessionStateHelper.clearDisconnectedPlayerState(binding);
        if (binding.connected) {
            return;
        }
        void this.gatewayPresenceHelper.persistOfflinePresence(binding);
        await this.playerPersistenceFlushService.flushPlayer(binding.playerId).catch((error) => {
            this.logger.error(`刷新脱机玩家失败：${binding.playerId}`, error instanceof Error ? error.stack : String(error));
        });
        this.logger.debug(`Socket 已脱离：${client.id} -> ${binding.playerId}, expiresAt=${binding.expireAt}`);
    }
        @SubscribeMessage(C2S.Hello)
        async handleHello(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayBootstrapHelper.handleHello(client, payload);
    }
    @SubscribeMessage(C2S.Heartbeat)
    handleHeartbeat(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        if (!this.gatewayGuardHelper.requirePlayerId(client)) {
            return;
        }
        return this.gatewayPresenceHelper.handleHeartbeat(client);
    }
    shouldPersistHeartbeatPresence(playerId: string, now = Date.now()) {
        return this.gatewayPresenceHelper.shouldPersistHeartbeatPresence(playerId, now);
    }
    clearHeartbeatPresencePersistThrottle(playerId: string) {
        this.gatewayPresenceHelper.clearHeartbeatPresencePersistThrottle(playerId);
    }
    @SubscribeMessage(C2S.GmGetState)
    handleSocketGmGetState(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        return this.gatewayGmCommandHelper.handleGmGetState(client, _payload);
    }
    @SubscribeMessage(C2S.GmSpawnBots)
    handleSocketGmSpawnBots(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayGmCommandHelper.handleGmSpawnBots(client, payload);
    }
    @SubscribeMessage(C2S.GmRemoveBots)
    handleSocketGmRemoveBots(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayGmCommandHelper.handleGmRemoveBots(client, payload);
    }
    @SubscribeMessage(C2S.GmUpdatePlayer)
    handleSocketGmUpdatePlayer(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayGmCommandHelper.handleGmUpdatePlayer(client, payload);
    }
    @SubscribeMessage(C2S.GmResetPlayer)
    handleSocketGmResetPlayer(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayGmCommandHelper.handleGmResetPlayer(client, payload);
    }
    @SubscribeMessage(C2S.MoveTo)
    handleMoveTo(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMovementHelper.handleMoveTo(client, payload);
    }
    @SubscribeMessage(C2S.NavigateQuest)
    handleNavigateQuest(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMovementHelper.handleNavigateQuest(client, payload);
    }
    @SubscribeMessage(C2S.Move)
    handleMove(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMovementHelper.handleMove(client, payload);
    }
    @SubscribeMessage(C2S.DestroyItem)
    handleDestroyItem(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleDestroyItem(client, payload);
    }
    @SubscribeMessage(C2S.SortInventory)
    handleSortInventory(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        return this.gatewayInventoryHelper.handleSortInventory(client, _payload);
    }
    @SubscribeMessage(C2S.Chat)
    handleChat(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayPlayerControlsHelper.handleChat(client, payload);
    }
    @SubscribeMessage(C2S.AckSystemMessages)
    handleAckSystemMessages(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayPlayerControlsHelper.handleAckSystemMessages(client, payload);
    }
    @SubscribeMessage(C2S.AckOfflineGainReports)
    async handleAckOfflineGainReports(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayPlayerControlsHelper.handleAckOfflineGainReports(client, payload); }
    @SubscribeMessage(C2S.DebugResetSpawn)
    handleDebugResetSpawn(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        return this.gatewayPlayerControlsHelper.handleDebugResetSpawn(client, _payload);
    }
    @SubscribeMessage(C2S.UpdateAutoBattleSkills)
    handleUpdateAutoBattleSkills(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayPlayerControlsHelper.handleUpdateAutoBattleSkills(client, payload);
    }
    @SubscribeMessage(C2S.UpdateAutoUsePills)
    handleUpdateAutoUsePills(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayPlayerControlsHelper.handleUpdateAutoUsePills(client, payload);
    }
    @SubscribeMessage(C2S.UpdateCombatTargetingRules)
    handleUpdateCombatTargetingRules(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayPlayerControlsHelper.handleUpdateCombatTargetingRules(client, payload);
    }
    @SubscribeMessage(C2S.UpdateAutoBattleTargetingMode)
    handleUpdateAutoBattleTargetingMode(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayPlayerControlsHelper.handleUpdateAutoBattleTargetingMode(client, payload);
    }
    @SubscribeMessage(C2S.UpdateTechniqueSkillAvailability)
    handleUpdateTechniqueSkillAvailability(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayPlayerControlsHelper.handleUpdateTechniqueSkillAvailability(client, payload);
    }
    @SubscribeMessage(C2S.HeavenGateAction)
    handleHeavenGateAction(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayPlayerControlsHelper.handleHeavenGateAction(client, payload);
    }
    @SubscribeMessage(C2S.UseAction)
    handleUseAction(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayActionHelper.handleUseAction(client, payload);
    }
    @SubscribeMessage(C2S.RequestQuests)
    handleRequestQuests(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        return this.gatewayPlayerControlsHelper.handleRequestQuests(client, _payload);
    }
    @SubscribeMessage(C2S.RequestMailSummary)
    async handleRequestMailSummary(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMailHelper.handleRequestMailSummary(client, payload);
    }
    @SubscribeMessage(C2S.RequestSuggestions)
    handleRequestSuggestions(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewaySuggestionHelper.handleRequestSuggestions(client, payload);
    }
    @SubscribeMessage(C2S.RequestMailPage)
    async handleRequestMailPage(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMailHelper.handleRequestMailPage(client, payload);
    }
    @SubscribeMessage(C2S.RequestMailDetail)
    async handleRequestMailDetail(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMailHelper.handleRequestMailDetail(client, payload);
    }
    @SubscribeMessage(C2S.RedeemCodes)
    handleRedeemCodes(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayActionHelper.handleRedeemCodes(client, payload);
    }
    @SubscribeMessage(C2S.RequestMarket)
    handleRequestMarket(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMarketHelper.handleRequestMarket(client, payload);
    }
    @SubscribeMessage(C2S.RequestMarketListings)
    handleRequestMarketListings(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMarketHelper.handleRequestMarketListings(client, payload);
    }
    @SubscribeMessage(C2S.RequestAuctionListings)
    handleRequestAuctionListings(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayMarketHelper.handleRequestAuctionListings(client, payload); }
    @SubscribeMessage(C2S.MarkMailRead)
    async handleMarkMailRead(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMailHelper.handleMarkMailRead(client, payload);
    }
    @SubscribeMessage(C2S.CreateSuggestion)
    async handleCreateSuggestion(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        await this.gatewaySuggestionHelper.handleCreateSuggestion(client, payload);
    }
    @SubscribeMessage(C2S.VoteSuggestion)
    async handleVoteSuggestion(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        await this.gatewaySuggestionHelper.handleVoteSuggestion(client, payload);
    }
    @SubscribeMessage(C2S.ReplySuggestion)
    async handleReplySuggestion(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        await this.gatewaySuggestionHelper.handleReplySuggestion(client, payload);
    }
    @SubscribeMessage(C2S.MarkSuggestionRepliesRead)
    async handleMarkSuggestionRepliesRead(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        await this.gatewaySuggestionHelper.handleMarkSuggestionRepliesRead(client, payload);
    }
    @SubscribeMessage(C2S.GmMarkSuggestionCompleted)
    async handleGmMarkSuggestionCompleted(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        await this.gatewayGmSuggestionHelper.handleGmMarkSuggestionCompleted(client, payload);
    }
    @SubscribeMessage(C2S.GmRemoveSuggestion)
    async handleGmRemoveSuggestion(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        await this.gatewayGmSuggestionHelper.handleGmRemoveSuggestion(client, payload);
    }
    @SubscribeMessage(C2S.ClaimMailAttachments)
    async handleClaimMailAttachments(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMailHelper.handleClaimMailAttachments(client, payload);
    }
    @SubscribeMessage(C2S.DeleteMail)
    async handleDeleteMail(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMailHelper.handleDeleteMail(client, payload);
    }
    @SubscribeMessage(C2S.RequestMarketItemBook)
    handleRequestMarketItemBook(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMarketHelper.handleRequestMarketItemBook(client, payload);
    }
    @SubscribeMessage(C2S.RequestMarketTradeHistory)
    handleRequestMarketTradeHistory(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayMarketHelper.handleRequestMarketTradeHistory(client, payload);
    }
    @SubscribeMessage(C2S.RequestAttrDetail)
    handleRequestAttrDetail(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        return this.gatewayReadModelHelper.handleRequestAttrDetail(client, _payload);
    }
    @SubscribeMessage(C2S.RequestAlchemyPanel)
    handleRequestAlchemyPanel(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayCraftHelper.handleRequestAlchemyPanel(client, payload);
    }
    @SubscribeMessage(C2S.RequestEnhancementPanel)
    handleRequestEnhancementPanel(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        return this.gatewayCraftHelper.handleRequestEnhancementPanel(client, _payload);
    }
    @SubscribeMessage(C2S.StartAlchemy)
    handleStartAlchemy(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayCraftHelper.handleStartAlchemy(client, payload);
    }
    @SubscribeMessage(C2S.CancelAlchemy)
    handleCancelAlchemy(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        return this.gatewayCraftHelper.handleCancelAlchemy(client, _payload);
    }
    @SubscribeMessage(C2S.SaveAlchemyPreset)
    handleSaveAlchemyPreset(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayCraftHelper.handleSaveAlchemyPreset(client, payload);
    }
    @SubscribeMessage(C2S.DeleteAlchemyPreset)
    handleDeleteAlchemyPreset(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayCraftHelper.handleDeleteAlchemyPreset(client, payload);
    }
    @SubscribeMessage(C2S.StartEnhancement)
    handleStartEnhancement(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayCraftHelper.handleStartEnhancement(client, payload);
    }
    @SubscribeMessage(C2S.CancelEnhancement)
    handleCancelEnhancement(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        return this.gatewayCraftHelper.handleCancelEnhancement(client, _payload);
    }
    @SubscribeMessage(C2S.RequestLeaderboard)
    handleRequestLeaderboard(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayReadModelHelper.handleRequestLeaderboard(client, payload);
    }
    @SubscribeMessage(C2S.RequestLeaderboardPlayerLocations)
    handleRequestLeaderboardPlayerLocations(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayReadModelHelper.handleRequestLeaderboardPlayerLocations(client, payload);
    }
    @SubscribeMessage(C2S.RequestWorldSummary)
    handleRequestWorldSummary(@ConnectedSocket() client: Socket, @MessageBody() _payload: any) {
        return this.gatewayReadModelHelper.handleRequestWorldSummary(client, _payload);
    }
    @SubscribeMessage(C2S.RequestDetail)
    handleRequestDetail(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayReadModelHelper.handleRequestDetail(client, payload);
    }
    @SubscribeMessage(C2S.RequestTileDetail)
    handleRequestTileDetail(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayReadModelHelper.handleRequestTileDetail(client, payload);
    }
    @SubscribeMessage(C2S.UsePortal)
    handleUsePortal(@ConnectedSocket() client: Socket) {
        return this.gatewayActionHelper.handleUsePortal(client);
    }
    @SubscribeMessage(C2S.UseItem)
    handleUseItem(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleUseItem(client, payload);
    }
    @SubscribeMessage(C2S.CreateFormation)
    handleCreateFormation(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleCreateFormation(client, payload);
    }
    @SubscribeMessage(C2S.SetFormationActive)
    handleSetFormationActive(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleSetFormationActive(client, payload);
    }
    @SubscribeMessage(C2S.RefillFormation)
    handleRefillFormation(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleRefillFormation(client, payload);
    }
    @SubscribeMessage(C2S.BuildPlaceIntent)
    handleBuildPlaceIntent(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayBuildingHelper.handleBuildPlaceIntent(client, payload); }
    @SubscribeMessage(C2S.BuildDeconstruct)
    handleBuildDeconstruct(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayBuildingHelper.handleBuildDeconstruct(client, payload); }
    @SubscribeMessage(C2S.RoomSetRole)
    handleRoomSetRole(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayBuildingHelper.handleRoomSetRole(client, payload); }
    @SubscribeMessage(C2S.FengShuiObserve)
    handleFengShuiObserve(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayBuildingHelper.handleFengShuiObserve(client, payload); }
    @SubscribeMessage(C2S.DropItem)
    handleDropItem(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleDropItem(client, payload);
    }
    @SubscribeMessage(C2S.TakeGround)
    handleTakeGround(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleTakeGround(client, payload);
    }
    @SubscribeMessage(C2S.StartGather)
    handleStartGather(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleStartGather(client, payload);
    }
    @SubscribeMessage(C2S.CancelGather)
    handleCancelGather(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleCancelGather(client, payload);
    }
    @SubscribeMessage(C2S.StopLootHarvest)
    handleStopLootHarvest(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleStopLootHarvest(client, payload);
    }
    @SubscribeMessage(C2S.Equip)
    handleEquip(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleEquip(client, payload);
    }
    @SubscribeMessage(C2S.Unequip)
    handleUnequip(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayInventoryHelper.handleUnequip(client, payload);
    }
    @SubscribeMessage(C2S.Cultivate)
    handleCultivate(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayActionHelper.handleCultivate(client, payload);
    }
    @SubscribeMessage(C2S.CastSkill)
    handleCastSkill(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayActionHelper.handleCastSkill(client, payload);
    }
    @SubscribeMessage(C2S.RequestNpcShop)
    handleRequestNpcShop(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayNpcHelper.handleRequestNpcShop(client, payload);
    }
    @SubscribeMessage(C2S.CreateMarketSellOrder)
    async handleCreateMarketSellOrder(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayMarketHelper.handleCreateMarketSellOrder(client, payload); }
    @SubscribeMessage(C2S.CreateMarketBuyOrder)
    async handleCreateMarketBuyOrder(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayMarketHelper.handleCreateMarketBuyOrder(client, payload); }
    @SubscribeMessage(C2S.PlaceAuctionBid)
    async handlePlaceAuctionBid(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayMarketHelper.handlePlaceAuctionBid(client, payload); }
    @SubscribeMessage(C2S.BuyoutAuctionLot)
    async handleBuyoutAuctionLot(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayMarketHelper.handleBuyoutAuctionLot(client, payload); }
    @SubscribeMessage(C2S.BuyMarketItem)
    async handleBuyMarketItem(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayMarketHelper.handleBuyMarketItem(client, payload); }
    @SubscribeMessage(C2S.SellMarketItem)
    async handleSellMarketItem(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayMarketHelper.handleSellMarketItem(client, payload); }
    @SubscribeMessage(C2S.CancelMarketOrder)
    async handleCancelMarketOrder(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayMarketHelper.handleCancelMarketOrder(client, payload); }
    @SubscribeMessage(C2S.ClaimMarketStorage)
    async handleClaimMarketStorage(@ConnectedSocket() client: Socket, @MessageBody() payload: any) { return this.gatewayMarketHelper.handleClaimMarketStorage(client, payload); }
    @SubscribeMessage(C2S.RequestNpcQuests)
    handleRequestNpcQuests(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayNpcHelper.handleRequestNpcQuests(client, payload);
    }
    @SubscribeMessage(C2S.AcceptNpcQuest)
    handleAcceptNpcQuest(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayNpcHelper.handleAcceptNpcQuest(client, payload);
    }
    @SubscribeMessage(C2S.SubmitNpcQuest)
    handleSubmitNpcQuest(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayNpcHelper.handleSubmitNpcQuest(client, payload);
    }
    @SubscribeMessage(C2S.BuyNpcShopItem)
    handleBuyNpcShopItem(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        return this.gatewayNpcHelper.handleBuyNpcShopItem(client, payload);
    }
    @SubscribeMessage(C2S.Ping)
    handlePing(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
        this.worldClientEventService.emitPong(client, payload);
    }
}
function buildAttrDetailBonuses(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const bonuses = [];
    const realmStage = player.realm?.stage ?? player.attrs?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const playerRealmLv = Math.max(1, Math.floor(Number(player.realm?.realmLv ?? 1) || 1));
    const realmConfig = PLAYER_REALM_CONFIG[realmStage];
    const realmAttrBonus = resolvePlayerRealmAttributeBonus(realmStage);
    if (realmConfig && hasNonZeroAttributes(realmAttrBonus)) {
        bonuses.push({
            source: `realm:${realmStage}`,
            label: player.realm?.displayName ?? player.realm?.name ?? '境界',
            attrs: clonePartialAttributes(realmAttrBonus),
        });
    }
    for (const technique of player.techniques?.techniques ?? []) {
        const techniqueState = toTechniqueState(technique);
        const techniqueAttrs = calcTechniqueFinalAttrBonus([techniqueState]);
        const qiProjection = calcTechniqueQiProjectionModifiers(techniqueState.level, techniqueState.layers);
        if (!hasNonZeroAttributes(techniqueAttrs) && qiProjection.length === 0) {
            continue;
        }
        bonuses.push({
            source: `technique:${technique.techId}`,
            label: technique.name ?? technique.techId,
            attrs: clonePartialAttributes(techniqueAttrs) ?? {},
            qiProjection: cloneQiProjectionModifiers(qiProjection),
        });
    }
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item ? applyEquipmentAttributeEffectivenessToItemStack(entry.item, playerRealmLv) : null;
        if (!item || (!hasNonZeroAttributes(item.equipAttrs) && !hasNonZeroPartialNumericStats(resolveItemNumericStats(item)))) {
            continue;
        }
        bonuses.push({
            source: `equipment:${entry.slot}`,
            label: item.itemId,
            attrs: clonePartialAttributes(item.equipAttrs),
            stats: clonePartialNumericStats(resolveItemNumericStats(item)),
        });
    }
    for (const buff of player.buffs?.buffs ?? []) {
        if (!hasNonZeroAttributes(buff.attrs) && !hasNonZeroPartialNumericStats(buff.stats) && !Array.isArray(buff.qiProjection)) {
            continue;
        }
        bonuses.push({
            source: `buff:${buff.buffId}`,
            label: buff.name || buff.buffId,
            attrs: clonePartialAttributes(buff.attrs),
            attrMode: buff.attrMode === 'percent' ? 'percent' : 'flat',
            stats: clonePartialNumericStats(buff.stats),
            qiProjection: cloneQiProjectionModifiers(buff.qiProjection),
            meta: {
                sourceSkillId: typeof buff.sourceSkillId === 'string' ? buff.sourceSkillId : '',
            },
        });
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (!hasNonZeroAttributes(bonus.attrs)
            && !hasNonZeroPartialNumericStats(bonus.stats)
            && !Array.isArray(bonus.qiProjection)
            && !isPlainObject(bonus.meta)) {
            continue;
        }
        bonuses.push({
            source: bonus.source,
            label: bonus.label ?? bonus.source,
            attrs: clonePartialAttributes(bonus.attrs),
            stats: clonePartialNumericStats(bonus.stats),
            qiProjection: cloneQiProjectionModifiers(bonus.qiProjection),
            meta: isPlainObject(bonus.meta) ? { ...bonus.meta } : undefined,
        });
    }
    return bonuses;
}
function buildAttrDetailNumericStatBreakdowns(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const stage = player.realm?.stage ?? player.attrs?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const template = resolvePlayerRealmNumericTemplate(stage);
    const realmBaseStats = template?.stats ? cloneNumericStats(template.stats) : createNumericStats();
    const baseStats = cloneNumericStats(realmBaseStats);
    const flatBuffStats = createNumericStats();
    const attrMultipliers = createNumericStats();
    const finalAttrs = player.attrs?.finalAttrs ?? player.attrs?.baseAttrs;
    if (finalAttrs) {
        for (const key of ATTR_KEYS) {
            const value = Number(finalAttrs[key] ?? 0);
            if (value === 0) {
                continue;
            }
            addPartialNumericStats(baseStats, scalePartialNumericStats(ATTR_TO_NUMERIC_WEIGHTS[key], value));
            addPartialNumericStats(attrMultipliers, scalePartialNumericStats(ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key], value));
        }
    }
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item;
        if (!item) {
            continue;
        }
        addPartialNumericStats(baseStats, resolveItemNumericStats(item));
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (bonus?.stats) {
            addPartialNumericStats(baseStats, bonus.stats);
        }
    }
    const vitalBaselineBonus = resolveVitalBaselineBonus(player.runtimeBonuses);
    if (vitalBaselineBonus?.stats) {
        addPartialNumericStats(baseStats, vitalBaselineBonus.stats);
    }
    for (const buff of player.buffs?.buffs ?? []) {
        if (buff?.stats) {
            addPartialNumericStats(flatBuffStats, buff.stats);
        }
    }
    const preMultiplierStats = cloneNumericStats(baseStats);
    addPartialNumericStats(preMultiplierStats, flatBuffStats);
    const finalStats = player.attrs?.numericStats ?? preMultiplierStats;
    const breakdowns = {};
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
        const realmBaseValue = getNumericStatValue(realmBaseStats, key);
        const baseValue = getNumericStatValue(baseStats, key);
        const flatBuffValue = getNumericStatValue(flatBuffStats, key);
        breakdowns[key] = {
            realmBaseValue,
            bonusBaseValue: baseValue - realmBaseValue,
            baseValue,
            flatBuffValue,
            preMultiplierValue: getNumericStatValue(preMultiplierStats, key),
            attrMultiplierPct: getNumericStatValue(attrMultipliers, key),
            realmMultiplier: 1,
            buffMultiplierPct: 0,
            pillMultiplierPct: 0,
            finalValue: getNumericStatValue(finalStats, key),
        };
    }
    return breakdowns;
}
function getNumericStatValue(stats, key) {
    const value = stats?.[key];
    return typeof value === 'number' ? value : 0;
}
function scalePartialNumericStats(stats, factor) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (!stats || factor === 0) {
        return undefined;
    }
    const result = {};
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
        const value = stats[key];
        if (value !== undefined) {
            result[key] = value * factor;
        }
    }
    for (const groupKey of ['elementDamageBonus', 'elementDamageReduce']) {
        const group = stats[groupKey];
        if (!isPlainObject(group)) {
            continue;
        }
        const scaledGroup = {};
        for (const key of ELEMENT_KEYS) {
            const value = group[key];
            if (value !== undefined) {
                scaledGroup[key] = value * factor;
            }
        }
        if (Object.keys(scaledGroup).length > 0) {
            result[groupKey] = scaledGroup;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
function collectProjectedRuntimeBonuses(runtimeBonuses) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (!Array.isArray(runtimeBonuses) || runtimeBonuses.length === 0) {
        return [];
    }
    return runtimeBonuses.filter((entry) => {
        const source = typeof entry?.source === 'string' ? entry.source : '';
        return Boolean(source && !isDerivedRuntimeBonusSource(source) && (entry.attrs || entry.stats));
    });
}
function resolveVitalBaselineBonus(runtimeBonuses) {
    return Array.isArray(runtimeBonuses)
        ? runtimeBonuses.find((entry) => entry?.source === 'runtime:vitals_baseline' && entry.stats && typeof entry.stats === 'object')
        : null;
}
function isDerivedRuntimeBonusSource(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (typeof source !== 'string' || source.length === 0) {
        return true;
    }
    return source === 'runtime:realm_stage'
        || source === 'runtime:realm_state'
        || source === 'runtime:heaven_gate_roots'
        || source === 'runtime:vitals_baseline'
        || source === 'runtime:technique_aggregate'
        || source.startsWith('technique:')
        || source.startsWith('equipment:')
        || source.startsWith('buff:');
}
function resolveItemNumericStats(item) {
    return item?.equipValueStats ? compileValueStatsToActualStats(item.equipValueStats) : item?.equipStats;
}
function hasNonZeroAttributes(attrs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (!attrs) {
        return false;
    }
    return ATTR_KEYS.some((key) => Number(attrs[key] ?? 0) !== 0);
}
function hasNonZeroPartialNumericStats(stats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (!stats) {
        return false;
    }
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
        if (Number(stats[key] ?? 0) !== 0) {
            return true;
        }
    }
    return ['elementDamageBonus', 'elementDamageReduce'].some((groupKey) => {
        const group = stats[groupKey];
        return isPlainObject(group) && Object.values(group).some((value) => Number(value ?? 0) !== 0);
    });
}
function clonePartialAttributes(attrs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const result = {};
    for (const key of ATTR_KEYS) {
        const value = Number(attrs?.[key] ?? 0);
        if (value !== 0) {
            result[key] = value;
        }
    }
    return result;
}
function clonePartialNumericStats(stats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (!stats) {
        return undefined;
    }
    const clone: any = {};
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
        if (stats[key] !== undefined) {
            clone[key] = stats[key];
        }
    }
    if (isPlainObject(stats.elementDamageBonus)) {
        clone.elementDamageBonus = { ...stats.elementDamageBonus };
    }
    if (isPlainObject(stats.elementDamageReduce)) {
        clone.elementDamageReduce = { ...stats.elementDamageReduce };
    }
    return Object.keys(clone).length > 0 ? clone : undefined;
}
function cloneQiProjectionModifiers(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (!Array.isArray(source) || source.length === 0) {
        return undefined;
    }
    return source.map((entry) => ({
        ...entry,
        selector: entry.selector
            ? {
                ...entry.selector,
                resourceKeys: entry.selector.resourceKeys ? entry.selector.resourceKeys.slice() : undefined,
                families: entry.selector.families ? entry.selector.families.slice() : undefined,
                forms: entry.selector.forms ? entry.selector.forms.slice() : undefined,
                elements: entry.selector.elements ? entry.selector.elements.slice() : undefined,
            }
            : undefined,
    }));
}
function toTechniqueState(entry) {
    const skills = entry.skills?.map((skill) => cloneTechniqueSkill(skill)) ?? [];
    return {
        techId: entry.techId,
        name: '',
        level: entry.level ?? 1,
        exp: entry.exp ?? 0,
        expToNext: entry.expToNext ?? 0,
        realmLv: entry.realmLv ?? 1,
        realm: entry.realm ?? TechniqueRealm.Entry,
        skillsEnabled: entry.skillsEnabled !== false,
        skills,
        grade: entry.grade ?? undefined,
        category: entry.category ?? undefined,
        layers: entry.layers?.map((layer) => ({
            level: layer.level,
            expToNext: layer.expToNext,
            attrs: layer.attrs ? { ...layer.attrs } : undefined,
            qiProjection: cloneQiProjectionModifiers(layer.qiProjection),
        })),
    };
}
function cloneTechniqueSkill(source) {
    return {
        ...source,
        name: '',
        desc: '',
    };
}
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export { WorldGateway };
