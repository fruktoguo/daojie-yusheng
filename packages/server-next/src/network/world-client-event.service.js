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
exports.WorldClientEventService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");
const market_runtime_service_1 = require("../runtime/market/market-runtime.service");
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");
const world_session_service_1 = require("./world-session.service");
const world_sync_service_1 = require("./world-sync.service");
let WorldClientEventService = class WorldClientEventService {
    mailRuntimeService;
    marketRuntimeService;
    playerRuntimeService;
    suggestionRuntimeService;
    worldSessionService;
    worldSyncService;
    constructor(mailRuntimeService, marketRuntimeService, playerRuntimeService, suggestionRuntimeService, worldSessionService, worldSyncService) {
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
    }
    markPrefersNext(client) {
        this.markProtocol(client, 'next');
    }
    markProtocol(client, protocol) {
        if (!client?.data || (protocol !== 'next' && protocol !== 'legacy')) {
            return;
        }
        client.data.protocol = protocol;
        client.data.prefersNext = protocol === 'next';
    }
    getProtocol(client) {
        const protocol = client?.data?.protocol;
        if (protocol === 'next' || protocol === 'legacy') {
            return protocol;
        }
        return client?.data?.prefersNext === true ? 'next' : 'legacy';
    }
    getExplicitProtocol(client) {
        const protocol = client?.data?.protocol;
        return protocol === 'next' || protocol === 'legacy' ? protocol : null;
    }
    prefersNext(client) {
        return this.getProtocol(client) === 'next';
    }
    emitByPreference(client, nextEvent, legacyEvent, payload) {
        client.emit(this.prefersNext(client) ? nextEvent : legacyEvent, payload);
    }
    emitDual(client, nextEvent, legacyEvent, payload) {
        const protocol = this.getExplicitProtocol(client);
        if (protocol !== 'legacy') {
            client.emit(nextEvent, payload);
        }
        if (protocol !== 'next') {
            client.emit(legacyEvent, payload);
        }
    }
    emitError(client, code, message) {
        this.emitDual(client, shared_1.NEXT_S2C.Error, shared_1.S2C.Error, { code, message });
    }
    emitGatewayError(client, code, error) {
        this.emitError(client, code, error instanceof Error ? error.message : 'unknown error');
    }
    emitNotReady(client) {
        this.emitError(client, 'NOT_READY', 'send hello before gameplay commands');
    }
    emitPong(client, payload) {
        this.emitDual(client, shared_1.NEXT_S2C.Pong, shared_1.S2C.Pong, {
            clientAt: payload?.clientAt,
            serverAt: Date.now(),
        });
    }
    emitQuestNavigateResult(client, questId, ok, error) {
        this.emitDual(client, shared_1.NEXT_S2C.QuestNavigateResult, shared_1.S2C.QuestNavigateResult, {
            questId,
            ok,
            error,
        });
    }
    emitLootWindowUpdate(client, playerId, x, y) {
        const payload = this.worldSyncService.openLootWindow(playerId, x, y);
        this.emitDual(client, shared_1.NEXT_S2C.LootWindowUpdate, shared_1.S2C.LootWindowUpdate, payload);
    }
    emitChatMessage(client, payload) {
        const protocol = this.getExplicitProtocol(client);
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
    emitPendingLogbookMessages(client, playerId) {
        const pending = this.playerRuntimeService.getPendingLogbookMessages(playerId);
        const protocol = this.getExplicitProtocol(client);
        for (const entry of pending) {
            if (protocol !== 'legacy') {
                client.emit(shared_1.NEXT_S2C.Notice, {
                    items: [{
                            messageId: entry.id,
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
    broadcastChat(playerId, payload) {
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
                this.emitChatMessage(socket, chatMsg);
            }
        }
    }
    acknowledgeSystemMessages(playerId, payload) {
        const ids = Array.isArray(payload?.ids)
            ? payload.ids.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            : [];
        if (ids.length === 0) {
            return;
        }
        this.playerRuntimeService.acknowledgePendingLogbookMessages(playerId, ids);
    }
    emitQuests(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.Quests, shared_1.S2C.QuestUpdate, payload);
    }
    emitSuggestionUpdate(client, suggestions) {
        this.emitByPreference(client, shared_1.NEXT_S2C.SuggestionUpdate, shared_1.S2C.SuggestionUpdate, {
            suggestions,
        });
    }
    emitMailSummary(client, summary) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MailSummary, shared_1.S2C.MailSummary, { summary });
    }
    async emitMailSummaryForPlayer(client, playerId) {
        this.emitMailSummary(client, await this.mailRuntimeService.getSummary(playerId));
    }
    emitMailPage(client, page) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MailPage, shared_1.S2C.MailPage, { page });
    }
    emitMailDetail(client, detail) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MailDetail, shared_1.S2C.MailDetail, { detail });
    }
    emitRedeemCodesResult(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.RedeemCodesResult, shared_1.S2C.RedeemCodesResult, payload);
    }
    emitMailOperationResult(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MailOpResult, shared_1.S2C.MailOpResult, payload);
    }
    emitMarketUpdate(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MarketUpdate, shared_1.S2C.MarketUpdate, payload);
    }
    emitMarketItemBook(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MarketItemBook, shared_1.S2C.MarketItemBook, payload);
    }
    emitMarketTradeHistory(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MarketTradeHistory, shared_1.S2C.MarketTradeHistory, payload);
    }
    emitNpcShop(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.NpcShop, shared_1.S2C.NpcShop, payload);
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
};
exports.WorldClientEventService = WorldClientEventService;
exports.WorldClientEventService = WorldClientEventService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_service_1.WorldSyncService])
], WorldClientEventService);
