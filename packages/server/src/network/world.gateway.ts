// @ts-nocheck
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WorldGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const socket_io_1 = require("socket.io");
const server_cors_1 = require("../config/server-cors");
const health_readiness_service_1 = require("../health/health-readiness.service");
const player_domain_persistence_service_1 = require("../persistence/player-domain-persistence.service");
const player_persistence_flush_service_1 = require("../persistence/player-persistence-flush.service");
const player_session_route_service_1 = require("../persistence/player-session-route.service");
const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");
const market_runtime_service_1 = require("../runtime/market/market-runtime.service");
const craft_panel_runtime_service_1 = require("../runtime/craft/craft-panel-runtime.service");
const leaderboard_runtime_service_1 = require("../runtime/player/leaderboard-runtime.service");
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");
const runtime_gm_state_service_1 = require("../runtime/gm/runtime-gm-state.service");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const world_client_event_service_1 = require("./world-client-event.service");
const world_gm_socket_service_1 = require("./world-gm-socket.service");
const world_protocol_projection_service_1 = require("./world-protocol-projection.service");
const world_session_bootstrap_service_1 = require("./world-session-bootstrap.service");
const world_session_service_1 = require("./world-session.service");
const world_sync_service_1 = require("./world-sync.service");
const world_gateway_bootstrap_helper_1 = require("./world-gateway-bootstrap.helper");
const world_gateway_gm_command_helper_1 = require("./world-gateway-gm-command.helper");
const world_gateway_gm_suggestion_helper_1 = require("./world-gateway-gm-suggestion.helper");
const world_gateway_suggestion_helper_1 = require("./world-gateway-suggestion.helper");
const world_gateway_movement_helper_1 = require("./world-gateway-movement.helper");
const world_gateway_inventory_helper_1 = require("./world-gateway-inventory.helper");
const world_gateway_mail_helper_1 = require("./world-gateway-mail.helper");
const world_gateway_player_controls_helper_1 = require("./world-gateway-player-controls.helper");
const world_gateway_action_helper_1 = require("./world-gateway-action.helper");
const world_gateway_npc_helper_1 = require("./world-gateway-npc.helper");
const world_gateway_craft_helper_1 = require("./world-gateway-craft.helper");
const world_gateway_market_helper_1 = require("./world-gateway-market.helper");
const world_gateway_read_model_helper_1 = require("./world-gateway-read-model.helper");
const world_gateway_client_emit_helper_1 = require("./world-gateway-client-emit.helper");
const world_gateway_guard_helper_1 = require("./world-gateway-guard.helper");
const world_gateway_session_state_helper_1 = require("./world-gateway-session-state.helper");
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
const PLAYER_PRESENCE_HEARTBEAT_FLUSH_INTERVAL_MS = 5_000;
let WorldGateway = WorldGateway_1 = class WorldGateway {
        worldGmSocketService; worldProtocolProjectionService; sessionBootstrapService; healthReadinessService;
        playerDomainPersistenceService; playerPersistenceFlushService; playerRuntimeService; mailRuntimeService;
        marketRuntimeService; craftPanelRuntimeService; suggestionRuntimeService; leaderboardRuntimeService;
        runtimeGmStateService; worldRuntimeService; worldClientEventService; worldSessionService; playerSessionRouteService;
        worldSyncService;
        gatewayBootstrapHelper; gatewayGmCommandHelper; gatewayGmSuggestionHelper; gatewaySuggestionHelper;
        gatewayMovementHelper; gatewayInventoryHelper; gatewayMailHelper; gatewayPlayerControlsHelper;
        gatewayNpcHelper; gatewayCraftHelper; gatewayMarketHelper; gatewayReadModelHelper; gatewayActionHelper;
        gatewayClientEmitHelper; gatewayGuardHelper; gatewaySessionStateHelper;
        presenceHeartbeatPersistedAtByPlayerId = new Map(); server; logger = new common_1.Logger(WorldGateway_1.name);    
    constructor(worldGmSocketService, worldProtocolProjectionService, sessionBootstrapService, healthReadinessService, playerDomainPersistenceService, playerPersistenceFlushService, playerRuntimeService, mailRuntimeService, marketRuntimeService, craftPanelRuntimeService, suggestionRuntimeService, leaderboardRuntimeService, runtimeGmStateService, worldRuntimeService, worldClientEventService, worldSessionService, playerSessionRouteService, worldSyncService) {
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
        this.gatewayBootstrapHelper = new world_gateway_bootstrap_helper_1.WorldGatewayBootstrapHelper(this);
        this.gatewayGmCommandHelper = new world_gateway_gm_command_helper_1.WorldGatewayGmCommandHelper(this);
        this.gatewayGmSuggestionHelper = new world_gateway_gm_suggestion_helper_1.WorldGatewayGmSuggestionHelper(this);
        this.gatewaySuggestionHelper = new world_gateway_suggestion_helper_1.WorldGatewaySuggestionHelper(this);
        this.gatewayMovementHelper = new world_gateway_movement_helper_1.WorldGatewayMovementHelper(this);
        this.gatewayInventoryHelper = new world_gateway_inventory_helper_1.WorldGatewayInventoryHelper(this);
        this.gatewayMailHelper = new world_gateway_mail_helper_1.WorldGatewayMailHelper(this);
        this.gatewayPlayerControlsHelper = new world_gateway_player_controls_helper_1.WorldGatewayPlayerControlsHelper(this);
        this.gatewayNpcHelper = new world_gateway_npc_helper_1.WorldGatewayNpcHelper(this);
        this.gatewayCraftHelper = new world_gateway_craft_helper_1.WorldGatewayCraftHelper(this);
        this.gatewayMarketHelper = new world_gateway_market_helper_1.WorldGatewayMarketHelper(this);
        this.gatewayReadModelHelper = new world_gateway_read_model_helper_1.WorldGatewayReadModelHelper(this);
        this.gatewayActionHelper = new world_gateway_action_helper_1.WorldGatewayActionHelper(this);
        this.gatewayClientEmitHelper = new world_gateway_client_emit_helper_1.WorldGatewayClientEmitHelper(this);
        this.gatewayGuardHelper = new world_gateway_guard_helper_1.WorldGatewayGuardHelper(this);
        this.gatewaySessionStateHelper = new world_gateway_session_state_helper_1.WorldGatewaySessionStateHelper(this);
    }
        async handleConnection(client) {
        this.attachPerfObservers(client);
        return this.gatewayBootstrapHelper.handleConnection(client);
    }
        attachPerfObservers(client) {
        if (!client || client.data?.gmPerfObserversAttached === true) {
            return;
        }
        if (client.data) {
            client.data.gmPerfObserversAttached = true;
        }
        if (typeof client.onAny === 'function') {
            client.onAny((event, ...args) => {
                this.runtimeGmStateService.recordNetworkIn(event, args.length <= 1 ? args[0] : args);
            });
        }
        if (typeof client.onAnyOutgoing === 'function') {
            client.onAnyOutgoing((event, ...args) => {
                this.runtimeGmStateService.recordNetworkOut(event, args.length <= 1 ? args[0] : args);
            });
        }
    }
        async handleDisconnect(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const binding = this.worldSessionService.unregisterSocket(client.id);
        if (!binding) {
            return;
        }
        this.gatewaySessionStateHelper.clearDisconnectedPlayerState(binding);
        if (binding.connected) {
            return;
        }
        this.presenceHeartbeatPersistedAtByPlayerId.delete(binding.playerId);
        const disconnectPresence = this.playerDomainPersistenceService?.isEnabled?.()
            ? this.playerRuntimeService.describePersistencePresence(binding.playerId)
            : null;
        if (disconnectPresence) {
            void this.playerDomainPersistenceService.savePlayerPresence(binding.playerId, {
                ...disconnectPresence,
                online: false,
                inWorld: false,
                offlineSinceAt: Date.now(),
                versionSeed: Date.now(),
            }).catch((error) => {
                this.logger.error(`刷新脱机 presence 失败：${binding.playerId}`, error instanceof Error ? error.stack : String(error));
            });
        }
        await this.playerPersistenceFlushService.flushPlayer(binding.playerId).catch((error) => {
            this.logger.error(`刷新脱机玩家失败：${binding.playerId}`, error instanceof Error ? error.stack : String(error));
        });
        this.logger.debug(`Socket 已脱离：${client.id} -> ${binding.playerId}, expiresAt=${binding.expireAt}`);
    }
        async handleHello(client, payload) {
        return this.gatewayBootstrapHelper.handleHello(client, payload);
    }    
    handleHeartbeat(client, _payload) {
        if (!this.gatewayGuardHelper.requirePlayerId(client)) {
            return;
        }
        const playerId = typeof client?.data?.playerId === 'string' ? client.data.playerId.trim() : '';
        if (playerId) {
            this.playerRuntimeService.markHeartbeat(playerId);
            const heartbeatPresence = this.playerDomainPersistenceService?.isEnabled?.()
                ? this.playerRuntimeService.describePersistencePresence(playerId)
                : null;
            const now = Date.now();
            if (heartbeatPresence && this.shouldPersistHeartbeatPresence(playerId, now)) {
                void this.playerDomainPersistenceService.savePlayerPresence(playerId, {
                    ...heartbeatPresence,
                    online: true,
                    inWorld: Boolean(heartbeatPresence.inWorld),
                    offlineSinceAt: null,
                    versionSeed: now,
                }).catch((error) => {
                    this.logger.error(`刷新心跳 presence 失败：${playerId}`, error instanceof Error ? error.stack : String(error));
                });
                this.presenceHeartbeatPersistedAtByPlayerId.set(playerId, now);
                this.playerRuntimeService.markPersisted?.(playerId);
            }
        }
    }    
    shouldPersistHeartbeatPresence(playerId, now = Date.now()) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return false;
        }
        const lastPersistedAt = Number(this.presenceHeartbeatPersistedAtByPlayerId.get(normalizedPlayerId) ?? 0);
        if (!Number.isFinite(lastPersistedAt) || lastPersistedAt <= 0) {
            return true;
        }
        return now - lastPersistedAt >= PLAYER_PRESENCE_HEARTBEAT_FLUSH_INTERVAL_MS;
    }
    clearHeartbeatPresencePersistThrottle(playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        this.presenceHeartbeatPersistedAtByPlayerId.delete(normalizedPlayerId);
    }
    handleSocketGmGetState(client, _payload) {
        return this.gatewayGmCommandHelper.handleGmGetState(client, _payload);
    }    
    handleSocketGmSpawnBots(client, payload) {
        return this.gatewayGmCommandHelper.handleGmSpawnBots(client, payload);
    }    
    handleSocketGmRemoveBots(client, payload) {
        return this.gatewayGmCommandHelper.handleGmRemoveBots(client, payload);
    }    
    handleSocketGmUpdatePlayer(client, payload) {
        return this.gatewayGmCommandHelper.handleGmUpdatePlayer(client, payload);
    }    
    handleSocketGmResetPlayer(client, payload) {
        return this.gatewayGmCommandHelper.handleGmResetPlayer(client, payload);
    }    
    handleMoveTo(client, payload) {
        return this.gatewayMovementHelper.handleMoveTo(client, payload);
    }    
    handleNavigateQuest(client, payload) {
        return this.gatewayMovementHelper.handleNavigateQuest(client, payload);
    }    
    handleMove(client, payload) {
        return this.gatewayMovementHelper.handleMove(client, payload);
    }    
    handleDestroyItem(client, payload) {
        return this.gatewayInventoryHelper.handleDestroyItem(client, payload);
    }    
    handleSortInventory(client, _payload) {
        return this.gatewayInventoryHelper.handleSortInventory(client, _payload);
    }    
    handleChat(client, payload) {
        return this.gatewayPlayerControlsHelper.handleChat(client, payload);
    }    
    handleAckSystemMessages(client, payload) {
        return this.gatewayPlayerControlsHelper.handleAckSystemMessages(client, payload);
    }    
    handleDebugResetSpawn(client, _payload) {
        return this.gatewayPlayerControlsHelper.handleDebugResetSpawn(client, _payload);
    }    
    handleUpdateAutoBattleSkills(client, payload) {
        return this.gatewayPlayerControlsHelper.handleUpdateAutoBattleSkills(client, payload);
    }    
    handleUpdateAutoUsePills(client, payload) {
        return this.gatewayPlayerControlsHelper.handleUpdateAutoUsePills(client, payload);
    }    
    handleUpdateCombatTargetingRules(client, payload) {
        return this.gatewayPlayerControlsHelper.handleUpdateCombatTargetingRules(client, payload);
    }    
    handleUpdateAutoBattleTargetingMode(client, payload) {
        return this.gatewayPlayerControlsHelper.handleUpdateAutoBattleTargetingMode(client, payload);
    }    
    handleUpdateTechniqueSkillAvailability(client, payload) {
        return this.gatewayPlayerControlsHelper.handleUpdateTechniqueSkillAvailability(client, payload);
    }    
    handleHeavenGateAction(client, payload) {
        return this.gatewayPlayerControlsHelper.handleHeavenGateAction(client, payload);
    }    
    handleUseAction(client, payload) {
        return this.gatewayActionHelper.handleUseAction(client, payload);
    }    
    handleRequestQuests(client, _payload) {
        return this.gatewayPlayerControlsHelper.handleRequestQuests(client, _payload);
    }    
    async handleRequestMailSummary(client, payload) {
        return this.gatewayMailHelper.handleRequestMailSummary(client, payload);
    }    
    handleRequestSuggestions(client, payload) {
        return this.gatewaySuggestionHelper.handleRequestSuggestions(client, payload);
    }    
    async handleRequestMailPage(client, payload) {
        return this.gatewayMailHelper.handleRequestMailPage(client, payload);
    }    
    async handleRequestMailDetail(client, payload) {
        return this.gatewayMailHelper.handleRequestMailDetail(client, payload);
    }    
    handleRedeemCodes(client, payload) {
        return this.gatewayActionHelper.handleRedeemCodes(client, payload);
    }    
    handleRequestMarket(client, payload) {
        return this.gatewayMarketHelper.handleRequestMarket(client, payload);
    }    
    handleRequestMarketListings(client, payload) {
        return this.gatewayMarketHelper.handleRequestMarketListings(client, payload);
    }    
    async handleMarkMailRead(client, payload) {
        return this.gatewayMailHelper.handleMarkMailRead(client, payload);
    }    
    async handleCreateSuggestion(client, payload) {
        await this.gatewaySuggestionHelper.handleCreateSuggestion(client, payload);
    }    
    async handleVoteSuggestion(client, payload) {
        await this.gatewaySuggestionHelper.handleVoteSuggestion(client, payload);
    }    
    async handleReplySuggestion(client, payload) {
        await this.gatewaySuggestionHelper.handleReplySuggestion(client, payload);
    }    
    async handleMarkSuggestionRepliesRead(client, payload) {
        await this.gatewaySuggestionHelper.handleMarkSuggestionRepliesRead(client, payload);
    }    
    async handleGmMarkSuggestionCompleted(client, payload) {
        await this.gatewayGmSuggestionHelper.handleGmMarkSuggestionCompleted(client, payload);
    }    
    async handleGmRemoveSuggestion(client, payload) {
        await this.gatewayGmSuggestionHelper.handleGmRemoveSuggestion(client, payload);
    }    
    async handleClaimMailAttachments(client, payload) {
        return this.gatewayMailHelper.handleClaimMailAttachments(client, payload);
    }    
    async handleDeleteMail(client, payload) {
        return this.gatewayMailHelper.handleDeleteMail(client, payload);
    }    
    handleRequestMarketItemBook(client, payload) {
        return this.gatewayMarketHelper.handleRequestMarketItemBook(client, payload);
    }    
    handleRequestMarketTradeHistory(client, payload) {
        return this.gatewayMarketHelper.handleRequestMarketTradeHistory(client, payload);
    }    
    handleRequestAttrDetail(client, _payload) {
        return this.gatewayReadModelHelper.handleRequestAttrDetail(client, _payload);
    }    
    handleRequestAlchemyPanel(client, payload) {
        return this.gatewayCraftHelper.handleRequestAlchemyPanel(client, payload);
    }    
    handleRequestEnhancementPanel(client, _payload) {
        return this.gatewayCraftHelper.handleRequestEnhancementPanel(client, _payload);
    }    
    handleStartAlchemy(client, payload) {
        return this.gatewayCraftHelper.handleStartAlchemy(client, payload);
    }    
    handleCancelAlchemy(client, _payload) {
        return this.gatewayCraftHelper.handleCancelAlchemy(client, _payload);
    }    
    handleSaveAlchemyPreset(client, payload) {
        return this.gatewayCraftHelper.handleSaveAlchemyPreset(client, payload);
    }    
    handleDeleteAlchemyPreset(client, payload) {
        return this.gatewayCraftHelper.handleDeleteAlchemyPreset(client, payload);
    }    
    handleStartEnhancement(client, payload) {
        return this.gatewayCraftHelper.handleStartEnhancement(client, payload);
    }    
    handleCancelEnhancement(client, _payload) {
        return this.gatewayCraftHelper.handleCancelEnhancement(client, _payload);
    }    
    handleRequestLeaderboard(client, payload) {
        return this.gatewayReadModelHelper.handleRequestLeaderboard(client, payload);
    }    
    handleRequestLeaderboardPlayerLocations(client, payload) {
        return this.gatewayReadModelHelper.handleRequestLeaderboardPlayerLocations(client, payload);
    }    
    handleRequestWorldSummary(client, _payload) {
        return this.gatewayReadModelHelper.handleRequestWorldSummary(client, _payload);
    }    
    handleRequestDetail(client, payload) {
        return this.gatewayReadModelHelper.handleRequestDetail(client, payload);
    }    
    handleRequestTileDetail(client, payload) {
        return this.gatewayReadModelHelper.handleRequestTileDetail(client, payload);
    }    
    handleUsePortal(client) {
        return this.gatewayActionHelper.handleUsePortal(client);
    }    
    handleUseItem(client, payload) {
        return this.gatewayInventoryHelper.handleUseItem(client, payload);
    }    
    handleDropItem(client, payload) {
        return this.gatewayInventoryHelper.handleDropItem(client, payload);
    }    
    handleTakeGround(client, payload) {
        return this.gatewayInventoryHelper.handleTakeGround(client, payload);
    }    
    handleStartGather(client, payload) {
        return this.gatewayInventoryHelper.handleStartGather(client, payload);
    }    
    handleCancelGather(client, payload) {
        return this.gatewayInventoryHelper.handleCancelGather(client, payload);
    }    
    handleStopLootHarvest(client, payload) {
        return this.gatewayInventoryHelper.handleStopLootHarvest(client, payload);
    }    
    handleEquip(client, payload) {
        return this.gatewayInventoryHelper.handleEquip(client, payload);
    }    
    handleUnequip(client, payload) {
        return this.gatewayInventoryHelper.handleUnequip(client, payload);
    }    
    handleCultivate(client, payload) {
        return this.gatewayActionHelper.handleCultivate(client, payload);
    }    
    handleCastSkill(client, payload) {
        return this.gatewayActionHelper.handleCastSkill(client, payload);
    }    
    handleRequestNpcShop(client, payload) {
        return this.gatewayNpcHelper.handleRequestNpcShop(client, payload);
    }    
    async handleCreateMarketSellOrder(client, payload) {
        return this.gatewayMarketHelper.handleCreateMarketSellOrder(client, payload);
    }    
    async handleCreateMarketBuyOrder(client, payload) {
        return this.gatewayMarketHelper.handleCreateMarketBuyOrder(client, payload);
    }    
    async handleBuyMarketItem(client, payload) {
        return this.gatewayMarketHelper.handleBuyMarketItem(client, payload);
    }    
    async handleSellMarketItem(client, payload) {
        return this.gatewayMarketHelper.handleSellMarketItem(client, payload);
    }    
    async handleCancelMarketOrder(client, payload) {
        return this.gatewayMarketHelper.handleCancelMarketOrder(client, payload);
    }    
    async handleClaimMarketStorage(client, payload) {
        return this.gatewayMarketHelper.handleClaimMarketStorage(client, payload);
    }    
    handleRequestNpcQuests(client, payload) {
        return this.gatewayNpcHelper.handleRequestNpcQuests(client, payload);
    }    
    handleAcceptNpcQuest(client, payload) {
        return this.gatewayNpcHelper.handleAcceptNpcQuest(client, payload);
    }    
    handleSubmitNpcQuest(client, payload) {
        return this.gatewayNpcHelper.handleSubmitNpcQuest(client, payload);
    }    
    handleBuyNpcShopItem(client, payload) {
        return this.gatewayNpcHelper.handleBuyNpcShopItem(client, payload);
    }    
    handlePing(client, payload) {
        this.worldClientEventService.emitPong(client, payload);
    }
};
exports.WorldGateway = WorldGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], WorldGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Hello),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleHello", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Heartbeat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleHeartbeat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmGetState),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSocketGmGetState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmSpawnBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSocketGmSpawnBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmRemoveBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSocketGmRemoveBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmUpdatePlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSocketGmUpdatePlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmResetPlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSocketGmResetPlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.MoveTo),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleMoveTo", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.NavigateQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNavigateQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Move),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DestroyItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleDestroyItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.SortInventory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSortInventory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Chat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.AckSystemMessages),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleAckSystemMessages", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DebugResetSpawn),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleDebugResetSpawn", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UpdateAutoBattleSkills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUpdateAutoBattleSkills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UpdateAutoUsePills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUpdateAutoUsePills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UpdateCombatTargetingRules),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUpdateCombatTargetingRules", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UpdateAutoBattleTargetingMode),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUpdateAutoBattleTargetingMode", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UpdateTechniqueSkillAvailability),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUpdateTechniqueSkillAvailability", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.HeavenGateAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleHeavenGateAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UseAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUseAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestQuests),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestQuests", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMailSummary),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleRequestMailSummary", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestSuggestions),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestSuggestions", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMailPage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleRequestMailPage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMailDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleRequestMailDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RedeemCodes),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRedeemCodes", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarket),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarket", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarketListings),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarketListings", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.MarkMailRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleMarkMailRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CreateSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCreateSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.VoteSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleVoteSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.ReplySuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleReplySuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.MarkSuggestionRepliesRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleMarkSuggestionRepliesRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmMarkSuggestionCompleted),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleGmMarkSuggestionCompleted", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmRemoveSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleGmRemoveSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.ClaimMailAttachments),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleClaimMailAttachments", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DeleteMail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleDeleteMail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarketItemBook),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarketItemBook", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarketTradeHistory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarketTradeHistory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestAttrDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestAttrDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestAlchemyPanel),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestAlchemyPanel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestEnhancementPanel),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestEnhancementPanel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.StartAlchemy),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleStartAlchemy", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CancelAlchemy),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleCancelAlchemy", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.SaveAlchemyPreset),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSaveAlchemyPreset", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DeleteAlchemyPreset),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleDeleteAlchemyPreset", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.StartEnhancement),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleStartEnhancement", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CancelEnhancement),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleCancelEnhancement", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestLeaderboard),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestLeaderboard", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestLeaderboardPlayerLocations),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestLeaderboardPlayerLocations", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestWorldSummary),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestWorldSummary", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestTileDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestTileDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UsePortal),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUsePortal", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UseItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUseItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DropItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleDropItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.TakeGround),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleTakeGround", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.StartGather),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleStartGather", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CancelGather),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleCancelGather", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.StopLootHarvest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleStopLootHarvest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Equip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleEquip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Unequip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUnequip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Cultivate),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleCultivate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CastSkill),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleCastSkill", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestNpcShop),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestNpcShop", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CreateMarketSellOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCreateMarketSellOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CreateMarketBuyOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCreateMarketBuyOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.BuyMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleBuyMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.SellMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleSellMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CancelMarketOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCancelMarketOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.ClaimMarketStorage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleClaimMarketStorage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestNpcQuests),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestNpcQuests", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.AcceptNpcQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleAcceptNpcQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.SubmitNpcQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSubmitNpcQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.BuyNpcShopItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleBuyNpcShopItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Ping),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handlePing", null);
exports.WorldGateway = WorldGateway = WorldGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: (0, server_cors_1.resolveServerCorsOptions)(),
        path: '/socket.io',
    }),
    __metadata("design:paramtypes", [world_gm_socket_service_1.WorldGmSocketService,
        world_protocol_projection_service_1.WorldProtocolProjectionService,
        world_session_bootstrap_service_1.WorldSessionBootstrapService,
        health_readiness_service_1.HealthReadinessService,
        player_domain_persistence_service_1.PlayerDomainPersistenceService,
        player_persistence_flush_service_1.PlayerPersistenceFlushService,
        player_runtime_service_1.PlayerRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        leaderboard_runtime_service_1.LeaderboardRuntimeService,
        runtime_gm_state_service_1.RuntimeGmStateService,
        world_runtime_service_1.WorldRuntimeService,
        world_client_event_service_1.WorldClientEventService,
        world_session_service_1.WorldSessionService,
        player_session_route_service_1.PlayerSessionRouteService,
        world_sync_service_1.WorldSyncService])
], WorldGateway);
function buildAttrDetailBonuses(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const bonuses = [];
    const realmStage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const realmConfig = shared_1.PLAYER_REALM_CONFIG[realmStage];
    if (realmConfig && hasNonZeroAttributes(realmConfig.attrBonus)) {
        bonuses.push({
            source: `realm:${realmStage}`,
            label: player.realm?.displayName ?? player.realm?.name ?? '境界',
            attrs: clonePartialAttributes(realmConfig.attrBonus),
        });
    }
    for (const technique of player.techniques?.techniques ?? []) {
        const techniqueAttrs = (0, shared_1.calcTechniqueFinalAttrBonus)([toTechniqueState(technique)]);
        if (!hasNonZeroAttributes(techniqueAttrs)) {
            continue;
        }
        bonuses.push({
            source: `technique:${technique.techId}`,
            label: technique.techId,
            attrs: clonePartialAttributes(techniqueAttrs),
        });
    }
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item;
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
            stats: clonePartialNumericStats(buff.stats),
            qiProjection: cloneQiProjectionModifiers(buff.qiProjection),
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
    const stage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const template = shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[stage] ?? shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE];
    const realmBaseStats = template?.stats ? (0, shared_1.cloneNumericStats)(template.stats) : (0, shared_1.createNumericStats)();
    const baseStats = (0, shared_1.cloneNumericStats)(realmBaseStats);
    const flatBuffStats = (0, shared_1.createNumericStats)();
    const attrMultipliers = (0, shared_1.createNumericStats)();
    const finalAttrs = player.attrs?.finalAttrs ?? player.attrs?.baseAttrs;
    if (finalAttrs) {
        for (const key of shared_1.ATTR_KEYS) {
            const value = Number(finalAttrs[key] ?? 0);
            if (value === 0) {
                continue;
            }
            (0, shared_1.addPartialNumericStats)(baseStats, scalePartialNumericStats(shared_1.ATTR_TO_NUMERIC_WEIGHTS[key], value));
            (0, shared_1.addPartialNumericStats)(attrMultipliers, scalePartialNumericStats(shared_1.ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key], value));
        }
    }
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item;
        if (!item) {
            continue;
        }
        (0, shared_1.addPartialNumericStats)(baseStats, resolveItemNumericStats(item));
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (bonus?.stats) {
            (0, shared_1.addPartialNumericStats)(baseStats, bonus.stats);
        }
    }
    const vitalBaselineBonus = resolveVitalBaselineBonus(player.runtimeBonuses);
    if (vitalBaselineBonus?.stats) {
        (0, shared_1.addPartialNumericStats)(baseStats, vitalBaselineBonus.stats);
    }
    for (const buff of player.buffs?.buffs ?? []) {
        if (buff?.stats) {
            (0, shared_1.addPartialNumericStats)(flatBuffStats, buff.stats);
        }
    }
    const preMultiplierStats = (0, shared_1.cloneNumericStats)(baseStats);
    (0, shared_1.addPartialNumericStats)(preMultiplierStats, flatBuffStats);
    const finalStats = player.attrs?.numericStats ?? preMultiplierStats;
    const breakdowns = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
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
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
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
        for (const key of shared_1.ELEMENT_KEYS) {
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
    return item?.equipValueStats ? (0, shared_1.compileValueStatsToActualStats)(item.equipValueStats) : item?.equipStats;
}
function hasNonZeroAttributes(attrs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (!attrs) {
        return false;
    }
    return shared_1.ATTR_KEYS.some((key) => Number(attrs[key] ?? 0) !== 0);
}
function hasNonZeroPartialNumericStats(stats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (!stats) {
        return false;
    }
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
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
    for (const key of shared_1.ATTR_KEYS) {
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
    const clone = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
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
        realm: entry.realm ?? shared_1.TechniqueRealm.Entry,
        skillsEnabled: entry.skillsEnabled !== false,
        skills,
        grade: entry.grade ?? undefined,
        category: entry.category ?? undefined,
        layers: entry.layers?.map((layer) => ({
            level: layer.level,
            expToNext: layer.expToNext,
            attrs: layer.attrs ? { ...layer.attrs } : undefined,
        })),
        attrCurves: entry.attrCurves ? { ...entry.attrCurves } : undefined,
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
