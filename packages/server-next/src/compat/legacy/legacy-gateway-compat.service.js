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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyGatewayCompatService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const mail_runtime_service_1 = require("../../runtime/mail/mail-runtime.service");
const market_runtime_service_1 = require("../../runtime/market/market-runtime.service");
const player_runtime_service_1 = require("../../runtime/player/player-runtime.service");
const suggestion_runtime_service_1 = require("../../runtime/suggestion/suggestion-runtime.service");
const world_runtime_service_1 = require("../../runtime/world/world-runtime.service");
const world_session_service_1 = require("../../network/world-session.service");
const world_sync_service_1 = require("../../network/world-sync.service");
const legacy_gm_compat_service_1 = require("./legacy-gm-compat.service");
const legacy_socket_bridge_service_1 = require("./legacy-socket-bridge.service");
let LegacyGatewayCompatService = class LegacyGatewayCompatService {
    legacyGmCompatService;
    legacySocketBridgeService;
    mailRuntimeService;
    marketRuntimeService;
    playerRuntimeService;
    suggestionRuntimeService;
    worldRuntimeService;
    worldSessionService;
    worldSyncService;
    constructor(legacyGmCompatService, legacySocketBridgeService, mailRuntimeService, marketRuntimeService, playerRuntimeService, suggestionRuntimeService, worldRuntimeService, worldSessionService, worldSyncService) {
        this.legacyGmCompatService = legacyGmCompatService;
        this.legacySocketBridgeService = legacySocketBridgeService;
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
    }
    emitDualError(client, code, message) {
        this.legacySocketBridgeService.emitDualError(client, code, message);
    }
    emitGatewayError(client, code, error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.emitDualError(client, code, message);
    }
    emitNotReady(client) {
        this.emitDualError(client, 'NOT_READY', 'send hello before gameplay commands');
    }
    emitLegacyFailure(client, error, code = 'LEGACY_COMMAND_FAILED') {
        const message = error instanceof Error ? error.message : String(error);
        this.legacySocketBridgeService.emitProtocolFailure(client, code, message);
    }
    emitLegacyPong(client, payload) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.Pong, shared_1.S2C.Pong, {
            clientAt: payload?.clientAt,
            serverAt: Date.now(),
        });
    }
    emitLegacyQuestNavigateResult(client, questId, ok, error) {
        const payload = {
            questId,
            ok,
            error,
        };
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.QuestNavigateResult, shared_1.S2C.QuestNavigateResult, payload);
    }
    emitLegacyTileRuntimeDetail(client, playerId, payload) {
        client.emit(shared_1.S2C.TileRuntimeDetail, this.buildLegacyTileRuntimeDetail(playerId, payload));
    }
    emitLootWindowUpdate(client, playerId, x, y) {
        const payload = this.worldSyncService.openLootWindow(playerId, x, y);
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.LootWindowUpdate, shared_1.S2C.LootWindowUpdate, payload);
    }
    emitLegacyTileLootInteraction(client, playerId, payload) {
        this.emitLegacyTileRuntimeDetail(client, playerId, payload);
        this.emitLootWindowUpdate(client, playerId, payload.x, payload.y);
    }
    emitLegacyNpcShop(client, payload) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.NpcShop, shared_1.S2C.NpcShop, payload);
    }
    emitDualNpcShop(client, payload) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.NpcShop, shared_1.S2C.NpcShop, payload);
    }
    emitLegacyQuestUpdate(client, playerId) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.Quests, shared_1.S2C.QuestUpdate, {
            quests: this.playerRuntimeService.listQuests(playerId),
        });
    }
    emitDualQuestUpdate(client, payload) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.Quests, shared_1.S2C.QuestUpdate, payload);
    }
    emitSuggestionUpdate(client, suggestions) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.SuggestionUpdate, shared_1.S2C.SuggestionUpdate, {
            suggestions,
        });
    }
    emitMailSummary(client, summary) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.MailSummary, shared_1.S2C.MailSummary, { summary });
    }
    emitMailPage(client, page) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.MailPage, shared_1.S2C.MailPage, { page });
    }
    emitMailDetail(client, detail) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.MailDetail, shared_1.S2C.MailDetail, { detail });
    }
    emitMailOperationResult(client, payload) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.MailOpResult, shared_1.S2C.MailOpResult, payload);
    }
    emitMarketUpdate(client, payload) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.MarketUpdate, shared_1.S2C.MarketUpdate, payload);
    }
    emitMarketItemBook(client, payload) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.MarketItemBook, shared_1.S2C.MarketItemBook, payload);
    }
    emitMarketTradeHistory(client, payload) {
        this.legacySocketBridgeService.emitDual(client, shared_1.NEXT_S2C.MarketTradeHistory, shared_1.S2C.MarketTradeHistory, payload);
    }
    emitLegacyChatMessage(client, payload) {
        const protocol = this.legacySocketBridgeService.getClientProtocol(client);
        if (protocol !== 'legacy') {
            client.emit(shared_1.NEXT_S2C.Notice, {
                items: [{
                        kind: 'chat',
                        text: payload.text,
                        from: payload.from,
                    }],
            });
        }
        if (protocol !== 'next') {
            client.emit(shared_1.S2C.SystemMsg, payload);
        }
    }
    emitLegacyPendingLogbookMessages(client, playerId) {
        const pending = this.playerRuntimeService.getPendingLogbookMessages(playerId);
        const protocol = this.legacySocketBridgeService.getClientProtocol(client);
        for (const entry of pending) {
            if (protocol !== 'legacy') {
                client.emit(shared_1.NEXT_S2C.Notice, {
                    items: [{
                            legacyId: entry.id,
                            kind: 'grudge',
                            text: entry.text,
                            from: entry.from,
                            occurredAt: entry.at,
                            persistUntilAck: true,
                        }],
                });
            }
            if (protocol !== 'next') {
                client.emit(shared_1.S2C.SystemMsg, {
                    id: entry.id,
                    text: entry.text,
                    from: entry.from,
                    kind: 'grudge',
                    occurredAt: entry.at,
                    persistUntilAck: true,
                });
            }
        }
    }
    handleLegacyMoveTo(client, playerId, payload) {
        this.runLegacyCommand(client, () => {
            this.worldRuntimeService.enqueueMoveTo(playerId, payload?.x, payload?.y, payload?.allowNearestReachable);
        });
    }
    handleLegacyNavigateQuest(client, playerId, payload) {
        const questId = typeof payload?.questId === 'string' ? payload.questId.trim() : '';
        if (!questId) {
            this.emitLegacyQuestNavigateResult(client, '', false, 'questId is required');
            return;
        }
        try {
            this.worldRuntimeService.navigateQuest(playerId, questId);
            this.emitLegacyQuestNavigateResult(client, questId, true);
        }
        catch (error) {
            this.emitLegacyQuestNavigateResult(client, questId, false, error instanceof Error ? error.message : String(error));
        }
    }
    handleLegacyAction(client, playerId, payload) {
        this.runLegacyCommand(client, () => {
            const actionId = this.resolveLegacyActionId(payload);
            if (actionId === 'debug:reset_spawn' || actionId === 'travel:return_spawn') {
                this.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
                return;
            }
            if (actionId === 'loot:open') {
                const tile = typeof payload?.target === 'string' ? (0, shared_1.parseTileTargetRef)(payload.target) : null;
                if (!tile) {
                    throw new Error('拿取需要指定目标格子');
                }
                const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
                if (Math.max(Math.abs(player.x - tile.x), Math.abs(player.y - tile.y)) > 1) {
                    throw new Error('拿取范围只有 1 格。');
                }
                this.emitLegacyTileLootInteraction(client, playerId, this.worldRuntimeService.buildTileDetail(playerId, tile));
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
            if (actionId.startsWith('npc_shop:')
                || actionId.startsWith('npc_quests:')
                || actionId === 'portal:travel') {
                this.emitLegacyActionResult(client, playerId, this.worldRuntimeService.executeAction(playerId, actionId));
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
            this.emitLegacyActionResult(client, playerId, this.worldRuntimeService.executeAction(playerId, actionId));
        });
    }
    handleLegacyDestroyItem(client, playerId, payload) {
        this.runLegacyCommand(client, () => {
            const destroyed = this.playerRuntimeService.destroyInventoryItem(playerId, payload?.slotIndex, payload?.count);
            this.playerRuntimeService.enqueueNotice(playerId, {
                text: `你摧毁了 ${destroyed.name ?? destroyed.itemId} x${destroyed.count}。`,
                kind: 'info',
            });
        });
    }
    handleLegacyTakeLoot(client, playerId, payload) {
        this.runLegacyCommand(client, () => {
            if (payload?.takeAll) {
                this.worldRuntimeService.enqueueTakeGroundAll(playerId, payload?.sourceId);
                return;
            }
            this.worldRuntimeService.enqueueTakeGround(playerId, payload?.sourceId, payload?.itemKey);
        });
    }
    handleLegacySortInventory(client, playerId, _payload) {
        this.runLegacyCommand(client, () => {
            this.playerRuntimeService.sortInventory(playerId);
            this.playerRuntimeService.enqueueNotice(playerId, {
                text: '背包已整理',
                kind: 'info',
            });
        });
    }
    handleLegacyInspectTileRuntime(client, playerId, payload) {
        this.runLegacyCommand(client, () => {
            this.emitLegacyTileRuntimeDetail(client, playerId, this.worldRuntimeService.buildTileDetail(playerId, payload));
        });
    }
    handleLegacyChat(playerId, payload) {
        const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
        if (!message) {
            return;
        }
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const chatLabel = typeof player.displayName === 'string' && player.displayName.trim()
            ? player.displayName.trim()
            : typeof player.name === 'string' && player.name.trim()
                ? player.name.trim()
                : player.playerId;
        const chatMsg = {
            text: message.slice(0, 200),
            kind: 'chat',
            from: chatLabel,
        };
        for (const binding of this.worldSessionService.listBindings()) {
            const target = this.playerRuntimeService.getPlayer(binding.playerId);
            if (!target || target.instanceId !== player.instanceId) {
                continue;
            }
            const socket = this.worldSessionService.getSocketByPlayerId(binding.playerId);
            if (socket) {
                this.emitLegacyChatMessage(socket, chatMsg);
            }
        }
    }
    handleLegacyAckSystemMessages(playerId, payload) {
        const ids = Array.isArray(payload?.ids)
            ? payload.ids.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            : [];
        if (ids.length === 0) {
            return;
        }
        this.playerRuntimeService.acknowledgePendingLogbookMessages(playerId, ids);
    }
    handleLegacyUpdateAutoBattleSkills(client, playerId, payload) {
        this.runLegacyCommand(client, () => {
            this.playerRuntimeService.updateAutoBattleSkills(playerId, payload?.skills ?? []);
        });
    }
    handleLegacyHeavenGateAction(client, playerId, payload) {
        this.runLegacyCommand(client, () => {
            this.worldRuntimeService.enqueueHeavenGateAction(playerId, payload?.action, payload?.element);
        });
    }
    async emitMailSummaryForPlayer(client, playerId) {
        this.emitMailSummary(client, await this.mailRuntimeService.getSummary(playerId));
    }
    flushMarketResult(subscriberPlayerIds, result) {
        for (const notice of result.notices) {
            const player = this.playerRuntimeService.getPlayer(notice.playerId);
            if (!player || !player.sessionId) {
                continue;
            }
            this.playerRuntimeService.enqueueNotice(notice.playerId, {
                text: notice.text,
                kind: notice.kind,
            });
        }
        for (const subscriberPlayerId of Array.from(subscriberPlayerIds)) {
            const socket = this.worldSessionService.getSocketByPlayerId(subscriberPlayerId);
            if (!socket) {
                subscriberPlayerIds.delete(subscriberPlayerId);
                continue;
            }
            this.emitMarketUpdate(socket, this.marketRuntimeService.buildMarketUpdate(subscriberPlayerId));
        }
    }
    broadcastSuggestionUpdate() {
        const suggestions = this.suggestionRuntimeService.getAll();
        for (const binding of this.worldSessionService.listBindings()) {
            const socket = this.worldSessionService.getSocketByPlayerId(binding.playerId);
            if (socket) {
                this.emitSuggestionUpdate(socket, suggestions);
            }
        }
    }
    buildLegacyTileRuntimeDetail(playerId, payload) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        return this.legacyGmCompatService.buildLegacyTileRuntimeDetail(player.templateId, payload);
    }
    runLegacyCommand(client, command) {
        try {
            command();
        }
        catch (error) {
            this.emitLegacyFailure(client, error);
        }
    }
    resolveLegacyActionId(payload) {
        const actionId = typeof payload?.actionId === 'string' && payload.actionId.trim()
            ? payload.actionId.trim()
            : (typeof payload?.type === 'string' ? payload.type.trim() : '');
        if (!actionId) {
            throw new Error('actionId is required');
        }
        return actionId;
    }
    emitLegacyActionResult(client, playerId, result) {
        if (result.kind === 'npcShop' && result.npcShop) {
            this.emitLegacyNpcShop(client, result.npcShop);
            return;
        }
        if (result.kind === 'npcQuests') {
            this.emitLegacyQuestUpdate(client, playerId);
        }
    }
};
exports.LegacyGatewayCompatService = LegacyGatewayCompatService;
exports.LegacyGatewayCompatService = LegacyGatewayCompatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_gm_compat_service_1.LegacyGmCompatService,
        legacy_socket_bridge_service_1.LegacySocketBridgeService,
        mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_service_1.WorldSyncService])
], LegacyGatewayCompatService);
//# sourceMappingURL=legacy-gateway-compat.service.js.map
