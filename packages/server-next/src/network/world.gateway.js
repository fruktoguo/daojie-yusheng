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
const shared_1 = require("@mud/shared-next");
const socket_io_1 = require("socket.io");
const legacy_gm_compat_service_1 = require("../compat/legacy/legacy-gm-compat.service");
const legacy_gm_admin_compat_service_1 = require("../compat/legacy/http/legacy-gm-admin-compat.service");
const legacy_gateway_compat_service_1 = require("../compat/legacy/legacy-gateway-compat.service");
const legacy_session_bootstrap_service_1 = require("../compat/legacy/legacy-session-bootstrap.service");
const health_readiness_service_1 = require("../health/health-readiness.service");
const player_persistence_flush_service_1 = require("../persistence/player-persistence-flush.service");
const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");
const market_runtime_service_1 = require("../runtime/market/market-runtime.service");
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const world_client_event_service_1 = require("./world-client-event.service");
const world_session_service_1 = require("./world-session.service");
let WorldGateway = WorldGateway_1 = class WorldGateway {
    legacyGmCompatService;
    legacyGmAdminCompatService;
    legacyGatewayCompatService;
    legacySessionBootstrapService;
    healthReadinessService;
    playerPersistenceFlushService;
    playerRuntimeService;
    mailRuntimeService;
    marketRuntimeService;
    suggestionRuntimeService;
    worldRuntimeService;
    worldClientEventService;
    worldSessionService;
    server;
    logger = new common_1.Logger(WorldGateway_1.name);
    marketSubscriberPlayerIds = new Set();
    constructor(legacyGmCompatService, legacyGmAdminCompatService, legacyGatewayCompatService, legacySessionBootstrapService, healthReadinessService, playerPersistenceFlushService, playerRuntimeService, mailRuntimeService, marketRuntimeService, suggestionRuntimeService, worldRuntimeService, worldClientEventService, worldSessionService) {
        this.legacyGmCompatService = legacyGmCompatService;
        this.legacyGmAdminCompatService = legacyGmAdminCompatService;
        this.legacyGatewayCompatService = legacyGatewayCompatService;
        this.legacySessionBootstrapService = legacySessionBootstrapService;
        this.healthReadinessService = healthReadinessService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.playerRuntimeService = playerRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldClientEventService = worldClientEventService;
        this.worldSessionService = worldSessionService;
    }
    async handleConnection(client) {
        this.logger.debug(`Socket connected: ${client.id}`);
        const handshakeProtocol = typeof client.handshake?.auth?.protocol === 'string'
            ? client.handshake.auth.protocol.trim().toLowerCase()
            : '';
        if (handshakeProtocol === 'next' || handshakeProtocol === 'legacy') {
            this.markClientProtocol(client, handshakeProtocol);
        }
        if (this.rejectWhenNotReady(client)) {
            return;
        }
        const token = this.legacySessionBootstrapService.pickSocketToken(client);
        const gmToken = this.legacySessionBootstrapService.pickSocketGmToken(client);
        if (gmToken) {
            if (!this.legacySessionBootstrapService.authenticateSocketGmToken(gmToken)) {
                this.legacyGatewayCompatService.emitDualError(client, 'GM_AUTH_FAIL', 'GM 认证失败');
                client.disconnect(true);
                return;
            }
            if (!token) {
                this.legacyGatewayCompatService.emitDualError(client, 'GM_PLAYER_AUTH_REQUIRED', 'GM socket 需要同时提供玩家登录令牌');
                client.disconnect(true);
                return;
            }
            client.data.isGm = true;
            client.data.gmRole = 'gm';
        }
        if (!token || typeof client.data.playerId === 'string') {
            return;
        }
        try {
            const identity = await this.legacySessionBootstrapService.authenticateSocketToken(token);
            if (!identity) {
                this.legacyGatewayCompatService.emitDualError(client, 'AUTH_FAIL', '认证失败');
                client.disconnect(true);
                return;
            }
            await this.legacySessionBootstrapService.bootstrapPlayerSession(client, {
                playerId: identity.playerId,
                name: identity.playerName,
                displayName: identity.displayName,
                mapId: undefined,
                preferredX: undefined,
                preferredY: undefined,
                loadSnapshot: () => this.legacySessionBootstrapService.loadBootstrapSnapshot(identity.playerId, true),
            });
            client.data.userId = identity.userId;
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'LEGACY_AUTH_FAILED', error);
            client.disconnect(true);
        }
    }
    async handleDisconnect(client) {
        const binding = this.worldSessionService.unregisterSocket(client.id);
        if (!binding) {
            return;
        }
        if (binding.connected) {
            return;
        }
        this.marketSubscriberPlayerIds.delete(binding.playerId);
        this.playerRuntimeService.detachSession(binding.playerId);
        await this.playerPersistenceFlushService.flushPlayer(binding.playerId).catch((error) => {
            this.logger.error(`Flush detached player failed: ${binding.playerId}`, error instanceof Error ? error.stack : String(error));
        });
        this.logger.debug(`Socket detached: ${client.id} -> ${binding.playerId}, expiresAt=${binding.expireAt}`);
    }
    async handleHello(client, payload) {
        this.markClientProtocol(client, 'next');
        try {
            if (this.rejectWhenNotReady(client)) {
                return;
            }
            if (typeof client.data.playerId === 'string' && client.data.playerId.trim()) {
                return;
            }
            const gmToken = this.legacySessionBootstrapService.pickSocketGmToken(client);
            if (gmToken) {
                if (!this.legacySessionBootstrapService.authenticateSocketGmToken(gmToken)) {
                    this.legacyGatewayCompatService.emitDualError(client, 'GM_AUTH_FAIL', 'GM 认证失败');
                    client.disconnect(true);
                    return;
                }
                client.data.isGm = true;
                client.data.gmRole = 'gm';
            }
            const token = this.legacySessionBootstrapService.pickSocketToken(client);
            const identity = token
                ? await this.legacySessionBootstrapService.authenticateSocketToken(token)
                : null;
            if (gmToken && !identity) {
                this.legacyGatewayCompatService.emitDualError(client, 'GM_PLAYER_AUTH_REQUIRED', 'GM socket 需要同时提供玩家登录令牌');
                client.disconnect(true);
                return;
            }
            if (token && !identity) {
                this.legacyGatewayCompatService.emitDualError(client, 'AUTH_FAIL', '认证失败');
                client.disconnect(true);
                return;
            }
            const requestedPlayerId = String(payload?.playerId ?? '').trim();
            if (identity && requestedPlayerId && requestedPlayerId !== identity.playerId) {
                this.legacyGatewayCompatService.emitDualError(client, 'PLAYER_ID_MISMATCH', 'playerId 与登录令牌不匹配');
                client.disconnect(true);
                return;
            }
            const playerId = identity?.playerId ?? requestedPlayerId;
            if (!playerId) {
                this.legacyGatewayCompatService.emitDualError(client, 'PLAYER_ID_REQUIRED', 'playerId is required');
                return;
            }
            await this.legacySessionBootstrapService.bootstrapPlayerSession(client, {
                playerId,
                name: identity?.playerName,
                displayName: identity?.displayName,
                requestedSessionId: payload.sessionId,
                mapId: payload.mapId,
                preferredX: payload.preferredX,
                preferredY: payload.preferredY,
                loadSnapshot: () => this.legacySessionBootstrapService.loadBootstrapSnapshot(playerId, Boolean(identity)),
            });
            if (identity) {
                client.data.userId = identity.userId;
            }
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'HELLO_FAILED', error);
        }
    }
    handleLegacyHeartbeat(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
    }
    handleNextHeartbeat(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
    }
    handleLegacyPing(client, payload) {
        this.legacyGatewayCompatService.emitLegacyPong(client, payload);
    }
    rejectWhenNotReady(client) {
        if (readBooleanEnv('SERVER_NEXT_ALLOW_UNREADY_TRAFFIC') || readBooleanEnv('SERVER_NEXT_SMOKE_ALLOW_UNREADY')) {
            return false;
        }
        const health = this.healthReadinessService.build();
        if (health.readiness.ok) {
            return false;
        }
        const isMaintenance = health.readiness.maintenance?.active === true;
        this.legacyGatewayCompatService.emitDualError(client, isMaintenance ? 'SERVER_BUSY' : 'SERVER_NOT_READY', isMaintenance ? '数据库维护中，请稍后重连' : '服务未就绪，请稍后重连');
        client.disconnect(true);
        return true;
    }
    handleLegacyGmGetState(client, _payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        this.legacyGmCompatService.emitState(client);
    }
    handleLegacyGmSpawnBots(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            this.legacyGmCompatService.enqueueSpawnBots(playerId, payload?.count);
            this.legacyGmCompatService.queueStatePush(playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'GM_SPAWN_BOTS_FAILED', error);
        }
    }
    handleLegacyGmRemoveBots(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            this.legacyGmCompatService.enqueueRemoveBots(payload?.playerIds, payload?.all);
            this.legacyGmCompatService.queueStatePush(playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'GM_REMOVE_BOTS_FAILED', error);
        }
    }
    handleLegacyGmUpdatePlayer(client, payload) {
        const requesterPlayerId = this.requireGm(client);
        if (!requesterPlayerId) {
            return;
        }
        try {
            this.legacyGmCompatService.enqueueUpdatePlayer(payload);
            this.legacyGmCompatService.queueStatePush(requesterPlayerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'GM_UPDATE_PLAYER_FAILED', error);
        }
    }
    handleLegacyGmResetPlayer(client, payload) {
        const requesterPlayerId = this.requireGm(client);
        if (!requesterPlayerId) {
            return;
        }
        try {
            this.legacyGmCompatService.enqueueResetPlayer(payload?.playerId);
            this.legacyGmCompatService.queueStatePush(requesterPlayerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'GM_RESET_PLAYER_FAILED', error);
        }
    }
    handleLegacyMove(client, payload) {
        this.handleMove(client, payload);
    }
    handleLegacyMoveTo(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyMoveTo(client, playerId, payload);
    }
    handleNextMoveTo(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueMoveTo(playerId, payload?.x, payload?.y, payload?.allowNearestReachable);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'MOVE_TO_FAILED', error);
        }
    }
    handleLegacyNavigateQuest(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyNavigateQuest(client, playerId, payload);
    }
    handleNextNavigateQuest(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        const questId = typeof payload?.questId === 'string' ? payload.questId.trim() : '';
        if (!questId) {
            this.legacyGatewayCompatService.emitLegacyQuestNavigateResult(client, '', false, 'questId is required');
            return;
        }
        try {
            this.worldRuntimeService.navigateQuest(playerId, questId);
            this.legacyGatewayCompatService.emitLegacyQuestNavigateResult(client, questId, true);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitLegacyQuestNavigateResult(client, questId, false, error instanceof Error ? error.message : String(error));
        }
    }
    handleLegacyAction(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyAction(client, playerId, payload);
    }
    handleMove(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueMove(playerId, payload?.d);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'MOVE_FAILED', error);
        }
    }
    handleLegacyDestroyItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyDestroyItem(client, playerId, payload);
    }
    handleNextDestroyItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const destroyed = this.playerRuntimeService.destroyInventoryItem(playerId, payload?.slotIndex, payload?.count);
            this.playerRuntimeService.enqueueNotice(playerId, {
                text: `你摧毁了 ${destroyed.name ?? destroyed.itemId} x${destroyed.count}。`,
                kind: 'info',
            });
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'DESTROY_ITEM_FAILED', error);
        }
    }
    handleLegacyTakeLoot(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyTakeLoot(client, playerId, payload);
    }
    handleLegacySortInventory(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacySortInventory(client, playerId, _payload);
    }
    handleNextSortInventory(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.playerRuntimeService.sortInventory(playerId);
            this.playerRuntimeService.enqueueNotice(playerId, {
                text: '背包已整理',
                kind: 'info',
            });
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'SORT_INVENTORY_FAILED', error);
        }
    }
    handleLegacyInspectTileRuntime(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyInspectTileRuntime(client, playerId, payload);
    }
    handleLegacyChat(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyChat(playerId, payload);
    }
    handleNextChat(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyChat(playerId, payload);
    }
    handleLegacyAckSystemMessages(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyAckSystemMessages(playerId, payload);
    }
    handleNextAckSystemMessages(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyAckSystemMessages(playerId, payload);
    }
    handleLegacyDebugResetSpawn(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
    }
    handleNextDebugResetSpawn(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
    }
    handleLegacyUpdateAutoBattleSkills(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyUpdateAutoBattleSkills(client, playerId, payload);
    }
    handleNextUpdateAutoBattleSkills(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.playerRuntimeService.updateAutoBattleSkills(playerId, payload?.skills ?? []);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'UPDATE_AUTO_BATTLE_SKILLS_FAILED', error);
        }
    }
    handleLegacyHeavenGateAction(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.handleLegacyHeavenGateAction(client, playerId, payload);
    }
    handleNextHeavenGateAction(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueHeavenGateAction(playerId, payload?.action, payload?.element);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'HEAVEN_GATE_ACTION_FAILED', error);
        }
    }
    handleUseAction(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const actionId = typeof payload?.actionId === 'string' && payload.actionId.trim()
                ? payload.actionId.trim()
                : (typeof payload?.type === 'string' ? payload.type.trim() : '');
            if (!actionId) {
                throw new common_1.BadRequestException('actionId is required');
            }
            if (actionId === 'debug:reset_spawn' || actionId === 'travel:return_spawn') {
                this.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
                return;
            }
            if (actionId === 'loot:open') {
                const tile = typeof payload?.target === 'string' ? (0, shared_1.parseTileTargetRef)(payload.target) : null;
                if (!tile) {
                    throw new common_1.BadRequestException('拿取需要指定目标格子');
                }
                const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
                if (Math.max(Math.abs(player.x - tile.x), Math.abs(player.y - tile.y)) > 1) {
                    throw new common_1.BadRequestException('拿取范围只有 1 格。');
                }
                client.emit(shared_1.NEXT_S2C.TileDetail, this.worldRuntimeService.buildTileDetail(playerId, tile));
                this.legacyGatewayCompatService.emitLootWindowUpdate(client, playerId, tile.x, tile.y);
                return;
            }
            if (actionId === 'battle:engage' || actionId === 'battle:force_attack') {
                const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
                const tile = target ? (0, shared_1.parseTileTargetRef)(target) : null;
                const targetPlayerId = target.startsWith('player:') ? target.slice('player:'.length) : null;
                const targetMonsterId = target && !target.startsWith('player:') && !tile ? target : null;
                if (targetMonsterId) {
                    this.worldRuntimeService.enqueueBattleTarget(playerId, actionId === 'battle:force_attack', null, targetMonsterId);
                    return;
                }
                this.worldRuntimeService.enqueueBattleTarget(playerId, actionId === 'battle:force_attack', targetPlayerId, null, tile?.x, tile?.y);
                return;
            }
            if (actionId.startsWith('npc:')) {
                this.worldRuntimeService.enqueueLegacyNpcInteraction(playerId, actionId);
                return;
            }
            const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
            if (target) {
                this.worldRuntimeService.enqueueCastSkillTargetRef(playerId, actionId, target);
                return;
            }
            const result = this.worldRuntimeService.executeAction(playerId, actionId);
            if (result.kind === 'npcShop' && result.npcShop) {
                this.emitNextNpcShop(client, result.npcShop);
            }
            else if (result.kind === 'npcQuests' && result.npcQuests) {
                client.emit(shared_1.NEXT_S2C.NpcQuests, result.npcQuests);
                this.emitNextQuests(client, this.worldRuntimeService.buildQuestListView(playerId));
            }
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'USE_ACTION_FAILED', error);
        }
    }
    handleRequestQuests(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextQuests(client, this.worldRuntimeService.buildQuestListView(playerId));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_QUESTS_FAILED', error);
        }
    }
    async handleRequestMailSummary(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.legacyGatewayCompatService.emitMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MAIL_SUMMARY_FAILED', error);
        }
    }
    async handleNextRequestMailSummary(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MAIL_SUMMARY_FAILED', error);
        }
    }
    handleRequestSuggestions(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.legacyGatewayCompatService.emitSuggestionUpdate(client, this.suggestionRuntimeService.getAll());
    }
    handleNextRequestSuggestions(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.emitNextSuggestionUpdate(client, this.suggestionRuntimeService.getAll());
    }
    async handleRequestMailPage(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.legacyGatewayCompatService.emitMailPage(client, await this.mailRuntimeService.getPage(playerId, payload?.page, payload?.pageSize, payload?.filter));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MAIL_PAGE_FAILED', error);
        }
    }
    async handleNextRequestMailPage(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextMailPage(client, await this.mailRuntimeService.getPage(playerId, payload?.page, payload?.pageSize, payload?.filter));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MAIL_PAGE_FAILED', error);
        }
    }
    async handleRequestMailDetail(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.legacyGatewayCompatService.emitMailDetail(client, await this.mailRuntimeService.getDetail(playerId, payload?.mailId ?? ''));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MAIL_DETAIL_FAILED', error);
        }
    }
    async handleNextRequestMailDetail(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextMailDetail(client, await this.mailRuntimeService.getDetail(playerId, payload?.mailId ?? ''));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MAIL_DETAIL_FAILED', error);
        }
    }
    handleRedeemCodes(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueRedeemCodes(playerId, payload?.codes ?? []);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REDEEM_CODES_FAILED', error);
        }
    }
    handleNextRedeemCodes(client, payload) {
        this.handleRedeemCodes(client, payload);
    }
    handleRequestMarket(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.marketSubscriberPlayerIds.add(playerId);
            const response = this.marketRuntimeService.buildMarketUpdate(playerId);
            this.legacyGatewayCompatService.emitMarketUpdate(client, response);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MARKET_FAILED', error);
        }
    }
    handleNextRequestMarket(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.marketSubscriberPlayerIds.add(playerId);
            this.emitNextMarketUpdate(client, this.marketRuntimeService.buildMarketUpdate(playerId));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MARKET_FAILED', error);
        }
    }
    async handleMarkMailRead(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.mailRuntimeService.markRead(playerId, payload?.mailIds ?? []);
            this.legacyGatewayCompatService.emitMailOperationResult(client, response);
            await this.emitMailSummary(client, playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'MARK_MAIL_READ_FAILED', error);
        }
    }
    async handleNextMarkMailRead(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextMailOperationResult(client, await this.mailRuntimeService.markRead(playerId, payload?.mailIds ?? []));
            await this.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'MARK_MAIL_READ_FAILED', error);
        }
    }
    async handleCreateSuggestion(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.create(playerId, playerId, payload?.title ?? '', payload?.description ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CREATE_SUGGESTION_FAILED', error);
        }
    }
    async handleNextCreateSuggestion(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.create(playerId, playerId, payload?.title ?? '', payload?.description ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CREATE_SUGGESTION_FAILED', error);
        }
    }
    async handleVoteSuggestion(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.vote(playerId, payload?.suggestionId ?? '', payload?.vote);
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'VOTE_SUGGESTION_FAILED', error);
        }
    }
    async handleNextVoteSuggestion(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.vote(playerId, payload?.suggestionId ?? '', payload?.vote);
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'VOTE_SUGGESTION_FAILED', error);
        }
    }
    async handleReplySuggestion(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.addReply(payload?.suggestionId ?? '', 'author', playerId, playerId, payload?.content ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REPLY_SUGGESTION_FAILED', error);
        }
    }
    async handleNextReplySuggestion(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.addReply(payload?.suggestionId ?? '', 'author', playerId, playerId, payload?.content ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REPLY_SUGGESTION_FAILED', error);
        }
    }
    async handleMarkSuggestionRepliesRead(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.markRepliesRead(payload?.suggestionId ?? '', playerId);
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'MARK_SUGGESTION_REPLIES_READ_FAILED', error);
        }
    }
    async handleNextMarkSuggestionRepliesRead(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.markRepliesRead(payload?.suggestionId ?? '', playerId);
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'MARK_SUGGESTION_REPLIES_READ_FAILED', error);
        }
    }
    async handleGmMarkSuggestionCompleted(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.markCompleted(payload?.suggestionId ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'GM_MARK_SUGGESTION_COMPLETED_FAILED', error);
        }
    }
    async handleNextGmMarkSuggestionCompleted(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.markCompleted(payload?.suggestionId ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'GM_MARK_SUGGESTION_COMPLETED_FAILED', error);
        }
    }
    async handleGmRemoveSuggestion(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.remove(payload?.suggestionId ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'GM_REMOVE_SUGGESTION_FAILED', error);
        }
    }
    async handleNextGmRemoveSuggestion(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.remove(payload?.suggestionId ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'GM_REMOVE_SUGGESTION_FAILED', error);
        }
    }
    async handleClaimMailAttachments(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.mailRuntimeService.claimAttachments(playerId, payload?.mailIds ?? []);
            this.legacyGatewayCompatService.emitMailOperationResult(client, response);
            await this.emitMailSummary(client, playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CLAIM_MAIL_ATTACHMENTS_FAILED', error);
        }
    }
    async handleNextClaimMailAttachments(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextMailOperationResult(client, await this.mailRuntimeService.claimAttachments(playerId, payload?.mailIds ?? []));
            await this.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CLAIM_MAIL_ATTACHMENTS_FAILED', error);
        }
    }
    async handleDeleteMail(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.mailRuntimeService.deleteMails(playerId, payload?.mailIds ?? []);
            this.legacyGatewayCompatService.emitMailOperationResult(client, response);
            await this.emitMailSummary(client, playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'DELETE_MAIL_FAILED', error);
        }
    }
    async handleNextDeleteMail(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextMailOperationResult(client, await this.mailRuntimeService.deleteMails(playerId, payload?.mailIds ?? []));
            await this.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'DELETE_MAIL_FAILED', error);
        }
    }
    handleRequestMarketItemBook(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = this.marketRuntimeService.buildItemBook(payload?.itemKey ?? '');
            this.legacyGatewayCompatService.emitMarketItemBook(client, response);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MARKET_ITEM_BOOK_FAILED', error);
        }
    }
    handleNextRequestMarketItemBook(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextMarketItemBook(client, this.marketRuntimeService.buildItemBook(payload?.itemKey ?? ''));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MARKET_ITEM_BOOK_FAILED', error);
        }
    }
    handleRequestMarketTradeHistory(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = this.marketRuntimeService.buildTradeHistoryPage(playerId, payload?.page);
            this.legacyGatewayCompatService.emitMarketTradeHistory(client, response);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MARKET_TRADE_HISTORY_FAILED', error);
        }
    }
    handleNextRequestMarketTradeHistory(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextMarketTradeHistory(client, this.marketRuntimeService.buildTradeHistoryPage(playerId, payload?.page));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_MARKET_TRADE_HISTORY_FAILED', error);
        }
    }
    handleRequestDetail(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.Detail, this.worldRuntimeService.buildDetail(playerId, {
                kind: payload?.kind,
                id: payload?.id ?? '',
            }));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_DETAIL_FAILED', error);
        }
    }
    handleRequestTileDetail(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.TileDetail, this.worldRuntimeService.buildTileDetail(playerId, {
                x: payload?.x,
                y: payload?.y,
            }));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'REQUEST_TILE_DETAIL_FAILED', error);
        }
    }
    handleUsePortal(client) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.usePortal(playerId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'PORTAL_FAILED', error);
        }
    }
    handleUseItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueUseItem(playerId, payload?.slotIndex);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'USE_ITEM_FAILED', error);
        }
    }
    handleNextUseItem(client, payload) {
        this.handleUseItem(client, payload);
    }
    handleDropItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueDropItem(playerId, payload?.slotIndex, payload?.count);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'DROP_ITEM_FAILED', error);
        }
    }
    handleNextDropItem(client, payload) {
        this.handleDropItem(client, payload);
    }
    handleTakeGround(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            if (payload?.takeAll) {
                this.worldRuntimeService.enqueueTakeGroundAll(playerId, payload?.sourceId);
                return;
            }
            this.worldRuntimeService.enqueueTakeGround(playerId, payload?.sourceId, payload?.itemKey);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'TAKE_GROUND_FAILED', error);
        }
    }
    handleEquip(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueEquip(playerId, payload?.slotIndex);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'EQUIP_FAILED', error);
        }
    }
    handleNextEquip(client, payload) {
        this.handleEquip(client, payload);
    }
    handleUnequip(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueUnequip(playerId, payload?.slot);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'UNEQUIP_FAILED', error);
        }
    }
    handleNextUnequip(client, payload) {
        this.handleUnequip(client, payload);
    }
    handleCultivate(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueCultivate(playerId, payload?.techId ?? null);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CULTIVATE_FAILED', error);
        }
    }
    handleNextCultivate(client, payload) {
        this.handleCultivate(client, payload);
    }
    handleCastSkill(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueCastSkill(playerId, payload?.skillId, payload?.targetPlayerId ?? null, payload?.targetMonsterId ?? null, payload?.targetRef ?? null);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CAST_SKILL_FAILED', error);
        }
    }
    handleRequestNpcShop(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = this.worldRuntimeService.buildNpcShopView(playerId, payload?.npcId);
            this.legacyGatewayCompatService.emitDualNpcShop(client, response);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'NPC_SHOP_REQUEST_FAILED', error);
        }
    }
    handleNextRequestNpcShop(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextNpcShop(client, this.worldRuntimeService.buildNpcShopView(playerId, payload?.npcId));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'NPC_SHOP_REQUEST_FAILED', error);
        }
    }
    async handleCreateMarketSellOrder(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.createSellOrder(playerId, {
                slotIndex: payload?.slotIndex,
                quantity: payload?.quantity,
                unitPrice: payload?.unitPrice,
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CREATE_MARKET_SELL_ORDER_FAILED', error);
        }
    }
    async handleNextCreateMarketSellOrder(client, payload) {
        await this.handleCreateMarketSellOrder(client, payload);
    }
    async handleCreateMarketBuyOrder(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.createBuyOrder(playerId, {
                itemId: payload?.itemId ?? '',
                quantity: payload?.quantity,
                unitPrice: payload?.unitPrice,
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CREATE_MARKET_BUY_ORDER_FAILED', error);
        }
    }
    async handleNextCreateMarketBuyOrder(client, payload) {
        await this.handleCreateMarketBuyOrder(client, payload);
    }
    async handleBuyMarketItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.buyNow(playerId, {
                itemKey: payload?.itemKey ?? '',
                quantity: payload?.quantity,
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'BUY_MARKET_ITEM_FAILED', error);
        }
    }
    async handleNextBuyMarketItem(client, payload) {
        await this.handleBuyMarketItem(client, payload);
    }
    async handleSellMarketItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.sellNow(playerId, {
                slotIndex: payload?.slotIndex,
                quantity: payload?.quantity,
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'SELL_MARKET_ITEM_FAILED', error);
        }
    }
    async handleNextSellMarketItem(client, payload) {
        await this.handleSellMarketItem(client, payload);
    }
    async handleCancelMarketOrder(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.cancelOrder(playerId, {
                orderId: payload?.orderId ?? '',
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CANCEL_MARKET_ORDER_FAILED', error);
        }
    }
    async handleNextCancelMarketOrder(client, payload) {
        await this.handleCancelMarketOrder(client, payload);
    }
    async handleClaimMarketStorage(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.claimStorage(playerId);
            this.flushMarketResult(result);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'CLAIM_MARKET_STORAGE_FAILED', error);
        }
    }
    async handleNextClaimMarketStorage(client, payload) {
        await this.handleClaimMarketStorage(client, payload);
    }
    handleRequestNpcQuests(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.NpcQuests, this.worldRuntimeService.buildNpcQuestsView(playerId, payload?.npcId));
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'NPC_QUEST_REQUEST_FAILED', error);
        }
    }
    handleAcceptNpcQuest(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueAcceptNpcQuest(playerId, payload?.npcId, payload?.questId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'NPC_QUEST_ACCEPT_FAILED', error);
        }
    }
    handleSubmitNpcQuest(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueSubmitNpcQuest(playerId, payload?.npcId, payload?.questId);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'NPC_QUEST_SUBMIT_FAILED', error);
        }
    }
    handleBuyNpcShopItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueBuyNpcShopItem(playerId, payload?.npcId, payload?.itemId, payload?.quantity);
        }
        catch (error) {
            this.legacyGatewayCompatService.emitGatewayError(client, 'NPC_SHOP_BUY_FAILED', error);
        }
    }
    handleNextBuyNpcShopItem(client, payload) {
        this.handleBuyNpcShopItem(client, payload);
    }
    handlePing(client, payload) {
        client.emit(shared_1.NEXT_S2C.Pong, {
            clientAt: payload?.clientAt,
            serverAt: Date.now(),
        });
    }
    emitNextQuests(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitQuests(client, payload);
    }
    emitNextSuggestionUpdate(client, suggestions) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitSuggestionUpdate(client, suggestions);
    }
    emitNextMailSummary(client, summary) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailSummary(client, summary);
    }
    async emitNextMailSummaryForPlayer(client, playerId) {
        this.worldClientEventService.markProtocol(client, 'next');
        await this.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
    emitNextMailPage(client, page) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailPage(client, page);
    }
    emitNextMailDetail(client, detail) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailDetail(client, detail);
    }
    emitNextMailOperationResult(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailOperationResult(client, payload);
    }
    emitNextMarketUpdate(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketUpdate(client, payload);
    }
    emitNextMarketItemBook(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketItemBook(client, payload);
    }
    emitNextMarketTradeHistory(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketTradeHistory(client, payload);
    }
    emitNextNpcShop(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitNpcShop(client, payload);
    }
    markClientProtocol(client, protocol) {
        if (!client?.data || (protocol !== 'next' && protocol !== 'legacy')) {
            return;
        }
        client.data.protocol = protocol;
    }
    isNextClient(client) {
        return client?.data?.protocol === 'next';
    }
    requirePlayerId(client) {
        const playerId = typeof client.data.playerId === 'string' ? client.data.playerId : '';
        if (playerId) {
            return playerId;
        }
        this.legacyGatewayCompatService.emitNotReady(client);
        return null;
    }
    requireGm(client) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return null;
        }
        if (client.data?.isGm === true) {
            return playerId;
        }
        this.legacyGatewayCompatService.emitDualError(client, 'GM_FORBIDDEN', 'GM 权限不足');
        return null;
    }
    flushMarketResult(result) {
        this.worldClientEventService.flushMarketResult(this.marketSubscriberPlayerIds, result);
    }
    async emitMailSummary(client, playerId) {
        await this.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
    broadcastSuggestions() {
        this.worldClientEventService.broadcastSuggestionUpdate();
    }
};
exports.WorldGateway = WorldGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], WorldGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Hello),
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
], WorldGateway.prototype, "handleLegacyHeartbeat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Heartbeat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextHeartbeat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Ping),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyPing", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmGetState),
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmGetState),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmGetState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmSpawnBots),
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmSpawnBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmSpawnBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmRemoveBots),
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmRemoveBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmRemoveBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmUpdatePlayer),
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmUpdatePlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmUpdatePlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmResetPlayer),
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmResetPlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmResetPlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Move),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.MoveTo),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyMoveTo", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MoveTo),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextMoveTo", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.NavigateQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyNavigateQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.NavigateQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextNavigateQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Action),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Move),
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
], WorldGateway.prototype, "handleLegacyDestroyItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DestroyItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDestroyItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.TakeLoot),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyTakeLoot", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.SortInventory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacySortInventory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SortInventory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextSortInventory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.InspectTileRuntime),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyInspectTileRuntime", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Chat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Chat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.AckSystemMessages),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyAckSystemMessages", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.AckSystemMessages),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextAckSystemMessages", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DebugResetSpawn),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyDebugResetSpawn", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DebugResetSpawn),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDebugResetSpawn", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UpdateAutoBattleSkills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyUpdateAutoBattleSkills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateAutoBattleSkills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateAutoBattleSkills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.HeavenGateAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyHeavenGateAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.HeavenGateAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextHeavenGateAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UseAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUseAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestQuests),
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
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailSummary),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailSummary", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestSuggestions),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestSuggestions", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestSuggestions),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestSuggestions", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMailPage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleRequestMailPage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailPage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailPage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMailDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleRequestMailDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RedeemCodes),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRedeemCodes", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RedeemCodes),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRedeemCodes", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarket),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarket", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarket),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarket", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.MarkMailRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleMarkMailRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MarkMailRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextMarkMailRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CreateSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCreateSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.VoteSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleVoteSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.VoteSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextVoteSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.ReplySuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleReplySuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ReplySuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextReplySuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.MarkSuggestionRepliesRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleMarkSuggestionRepliesRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MarkSuggestionRepliesRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextMarkSuggestionRepliesRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmMarkSuggestionCompleted),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleGmMarkSuggestionCompleted", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmMarkSuggestionCompleted),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextGmMarkSuggestionCompleted", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmRemoveSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleGmRemoveSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmRemoveSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextGmRemoveSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.ClaimMailAttachments),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleClaimMailAttachments", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ClaimMailAttachments),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextClaimMailAttachments", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DeleteMail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleDeleteMail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DeleteMail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextDeleteMail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarketItemBook),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarketItemBook", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketItemBook),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketItemBook", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarketTradeHistory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarketTradeHistory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketTradeHistory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketTradeHistory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestTileDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestTileDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UsePortal),
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
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UseItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUseItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DropItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleDropItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DropItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDropItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.TakeGround),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleTakeGround", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Equip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleEquip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Equip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextEquip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Unequip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUnequip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Unequip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUnequip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Cultivate),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleCultivate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Cultivate),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextCultivate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CastSkill),
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
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestNpcShop),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestNpcShop", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CreateMarketSellOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCreateMarketSellOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateMarketSellOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateMarketSellOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CreateMarketBuyOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCreateMarketBuyOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateMarketBuyOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateMarketBuyOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.BuyMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleBuyMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.BuyMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextBuyMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.SellMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleSellMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SellMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextSellMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CancelMarketOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCancelMarketOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CancelMarketOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCancelMarketOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.ClaimMarketStorage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleClaimMarketStorage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ClaimMarketStorage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextClaimMarketStorage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestNpcQuests),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestNpcQuests", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.AcceptNpcQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleAcceptNpcQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SubmitNpcQuest),
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
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.BuyNpcShopItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextBuyNpcShopItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Ping),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handlePing", null);
exports.WorldGateway = WorldGateway = WorldGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: true,
        path: '/socket.io',
    }),
    __metadata("design:paramtypes", [legacy_gm_compat_service_1.LegacyGmCompatService,
        legacy_gm_admin_compat_service_1.LegacyGmAdminCompatService,
        legacy_gateway_compat_service_1.LegacyGatewayCompatService,
        legacy_session_bootstrap_service_1.LegacySessionBootstrapService,
        health_readiness_service_1.HealthReadinessService,
        player_persistence_flush_service_1.PlayerPersistenceFlushService,
        player_runtime_service_1.PlayerRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        world_client_event_service_1.WorldClientEventService,
        world_session_service_1.WorldSessionService])
], WorldGateway);
function readBooleanEnv(key) {
    const value = process.env[key];
    if (typeof value !== 'string') {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
//# sourceMappingURL=world.gateway.js.map
