"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
/** __param：定义该变量以承载业务值。 */
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldClientEventService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** mail_runtime_service_1：定义该变量以承载业务值。 */
const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");
/** market_runtime_service_1：定义该变量以承载业务值。 */
const market_runtime_service_1 = require("../runtime/market/market-runtime.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
/** suggestion_runtime_service_1：定义该变量以承载业务值。 */
const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");
/** world_session_service_1：定义该变量以承载业务值。 */
const world_session_service_1 = require("./world-session.service");
/** world_sync_service_1：定义该变量以承载业务值。 */
const world_sync_service_1 = require("./world-sync.service");
/** WorldClientEventService：定义该变量以承载业务值。 */
let WorldClientEventService = class WorldClientEventService {
    mailRuntimeService;
    marketRuntimeService;
    playerRuntimeService;
    suggestionRuntimeService;
    worldSessionService;
    worldSyncService;
/** 构造函数：执行实例初始化流程。 */
    constructor(mailRuntimeService, marketRuntimeService, playerRuntimeService, suggestionRuntimeService, worldSessionService, worldSyncService) {
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
    }
/** markPrefersNext：执行对应的业务逻辑。 */
    markPrefersNext(client) {
        this.markProtocol(client, 'next');
    }
/** markProtocol：执行对应的业务逻辑。 */
    markProtocol(client, protocol) {
        if (!client?.data || protocol !== 'next') {
            return;
        }
        client.data.protocol = protocol;
    }
/** getProtocol：执行对应的业务逻辑。 */
    getProtocol(client) {
        return 'next';
    }
/** getExplicitProtocol：执行对应的业务逻辑。 */
    getExplicitProtocol(client) {
        return 'next';
    }
/** resolveProtocolEmission：执行对应的业务逻辑。 */
    resolveProtocolEmission(client) {
        return {
            protocol: 'next',
/** emitNext：定义该变量以承载业务值。 */
            emitNext: true,
        };
    }
/** prefersNext：执行对应的业务逻辑。 */
    prefersNext(client) {
        return true;
    }
/** resolveEffectiveProtocol：执行对应的业务逻辑。 */
    resolveEffectiveProtocol(client) {
        return 'next';
    }
/** emit：执行对应的业务逻辑。 */
    emit(client, event, payload) {
        client.emit(event, payload);
    }
/** emitError：执行对应的业务逻辑。 */
    emitError(client, code, message) {
        this.emit(client, shared_1.NEXT_S2C.Error, { code, message });
    }
/** emitGatewayError：执行对应的业务逻辑。 */
    emitGatewayError(client, code, error) {
        this.emitError(client, code, error instanceof Error ? error.message : 'unknown error');
    }
/** emitProtocolFailure：执行对应的业务逻辑。 */
    emitProtocolFailure(client, code, text) {
        client.emit(shared_1.NEXT_S2C.Error, { code, message: text });
    }
/** emitSystemMessage：执行对应的业务逻辑。 */
    emitSystemMessage(client, text, kind = 'info') {
/** normalizedText：定义该变量以承载业务值。 */
        const normalizedText = typeof text === 'string' ? text.trim() : '';
        if (!normalizedText) {
            return;
        }
        client.emit(shared_1.NEXT_S2C.Notice, {
            items: [{
                    kind,
                    text: normalizedText,
                }],
        });
    }
/** emitNotReady：执行对应的业务逻辑。 */
    emitNotReady(client) {
        this.emitError(client, 'NOT_READY', 'send hello before gameplay commands');
    }
/** emitPong：执行对应的业务逻辑。 */
    emitPong(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.Pong, {
            clientAt: payload?.clientAt,
            serverAt: Date.now(),
        });
    }
/** emitQuestNavigateResult：执行对应的业务逻辑。 */
    emitQuestNavigateResult(client, questId, ok, error) {
        this.emit(client, shared_1.NEXT_S2C.QuestNavigateResult, {
            questId,
            ok,
            error,
        });
    }
/** emitLootWindowUpdate：执行对应的业务逻辑。 */
    emitLootWindowUpdate(client, playerId, x, y) {
/** payload：定义该变量以承载业务值。 */
        const payload = this.worldSyncService.openLootWindow(playerId, x, y);
        this.emit(client, shared_1.NEXT_S2C.LootWindowUpdate, payload);
    }
/** emitChatMessage：执行对应的业务逻辑。 */
    emitChatMessage(client, payload) {
        client.emit(shared_1.NEXT_S2C.Notice, {
            items: [{
                    kind: 'chat',
                    text: payload.text,
                    from: payload.from,
                }],
        });
    }
/** emitPendingLogbookMessages：执行对应的业务逻辑。 */
    emitPendingLogbookMessages(client, playerId) {
/** pending：定义该变量以承载业务值。 */
        const pending = this.playerRuntimeService.getPendingLogbookMessages(playerId);
        for (const entry of pending) {
            client.emit(shared_1.NEXT_S2C.Notice, {
                items: [{
                        messageId: entry.id,
                        kind: entry.kind,
                        text: entry.text,
                        from: entry.from,
                        occurredAt: entry.at,
                        persistUntilAck: true,
                    }],
            });
        }
    }
/** broadcastChat：执行对应的业务逻辑。 */
    broadcastChat(playerId, payload) {
/** message：定义该变量以承载业务值。 */
        const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
        if (!message) {
            return;
        }
/** player：定义该变量以承载业务值。 */
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
/** chatLabel：定义该变量以承载业务值。 */
        const chatLabel = typeof player.displayName === 'string' && player.displayName.trim()
            ? player.displayName.trim()
            : typeof player.name === 'string' && player.name.trim()
                ? player.name.trim()
                : player.playerId;
/** chatMsg：定义该变量以承载业务值。 */
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
/** socket：定义该变量以承载业务值。 */
            const socket = this.worldSessionService.getSocketByPlayerId(binding.playerId);
            if (socket) {
                this.emitChatMessage(socket, chatMsg);
            }
        }
    }
/** acknowledgeSystemMessages：执行对应的业务逻辑。 */
    acknowledgeSystemMessages(playerId, payload) {
/** ids：定义该变量以承载业务值。 */
        const ids = Array.isArray(payload?.ids)
            ? payload.ids.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            : [];
        if (ids.length === 0) {
            return;
        }
        this.playerRuntimeService.acknowledgePendingLogbookMessages(playerId, ids);
    }
/** emitQuests：执行对应的业务逻辑。 */
    emitQuests(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.Quests, payload);
    }
/** emitSuggestionUpdate：执行对应的业务逻辑。 */
    emitSuggestionUpdate(client, suggestions) {
        this.emit(client, shared_1.NEXT_S2C.SuggestionUpdate, {
            suggestions,
        });
    }
/** emitMailSummary：执行对应的业务逻辑。 */
    emitMailSummary(client, summary) {
        this.emit(client, shared_1.NEXT_S2C.MailSummary, { summary });
    }
/** emitMailSummaryForPlayer：执行对应的业务逻辑。 */
    async emitMailSummaryForPlayer(client, playerId) {
        this.emitMailSummary(client, await this.mailRuntimeService.getSummary(playerId));
    }
/** emitMailPage：执行对应的业务逻辑。 */
    emitMailPage(client, page) {
        this.emit(client, shared_1.NEXT_S2C.MailPage, { page });
    }
/** emitMailDetail：执行对应的业务逻辑。 */
    emitMailDetail(client, detail) {
        this.emit(client, shared_1.NEXT_S2C.MailDetail, { detail });
    }
/** emitRedeemCodesResult：执行对应的业务逻辑。 */
    emitRedeemCodesResult(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.RedeemCodesResult, payload);
    }
/** emitMailOperationResult：执行对应的业务逻辑。 */
    emitMailOperationResult(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MailOpResult, payload);
    }
/** emitMarketUpdate：执行对应的业务逻辑。 */
    emitMarketUpdate(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketUpdate, payload);
    }
/** emitMarketListings：执行对应的业务逻辑。 */
    emitMarketListings(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketListings, payload);
    }
/** emitMarketOrders：执行对应的业务逻辑。 */
    emitMarketOrders(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketOrders, payload);
    }
/** emitMarketStorage：执行对应的业务逻辑。 */
    emitMarketStorage(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketStorage, payload);
    }
/** emitMarketItemBook：执行对应的业务逻辑。 */
    emitMarketItemBook(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketItemBook, payload);
    }
/** emitMarketTradeHistory：执行对应的业务逻辑。 */
    emitMarketTradeHistory(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketTradeHistory, payload);
    }
/** emitNpcShop：执行对应的业务逻辑。 */
    emitNpcShop(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.NpcShop, payload);
    }
/** normalizePlayerIds：执行对应的业务逻辑。 */
    normalizePlayerIds(playerIds) {
        if (!Array.isArray(playerIds)) {
            return [];
        }
        return Array.from(new Set(playerIds.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())));
    }
/** resolveMarketListingsRequest：执行对应的业务逻辑。 */
    resolveMarketListingsRequest(playerId, listingRequests) {
        if (listingRequests instanceof Map) {
            const request = listingRequests.get(playerId);
            if (request && typeof request === 'object') {
                return request;
            }
        }
        return { page: 1 };
    }
/** resolveMarketTradeHistoryPage：执行对应的业务逻辑。 */
    resolveMarketTradeHistoryPage(playerId, tradeHistoryRequests) {
        if (tradeHistoryRequests instanceof Map) {
            const page = tradeHistoryRequests.get(playerId);
            if (Number.isFinite(page)) {
                return Math.max(1, Math.trunc(page));
            }
        }
        return null;
    }
/** flushMarketResult：执行对应的业务逻辑。 */
    flushMarketResult(subscriberPlayerIds, result, options) {
        const notices = Array.isArray(result?.notices) ? result.notices : [];
        const affectedPlayerIds = this.normalizePlayerIds(result?.affectedPlayerIds);
        const tradeHistoryPlayerIds = this.normalizePlayerIds(result?.tradeHistoryPlayerIds);
        for (const notice of notices) {
            const player = this.playerRuntimeService.getPlayer(notice.playerId);
            if (!player || !player.sessionId) {
                continue;
            }
            this.playerRuntimeService.enqueueNotice(notice.playerId, {
                text: notice.text,
                kind: notice.kind,
            });
        }
        for (const affectedPlayerId of affectedPlayerIds) {
            const socket = this.worldSessionService.getSocketByPlayerId(affectedPlayerId);
            if (!socket) {
                continue;
            }
            this.emitMarketOrders(socket, this.marketRuntimeService.buildMarketOrders(affectedPlayerId));
            this.emitMarketStorage(socket, this.marketRuntimeService.buildMarketStorage(affectedPlayerId));
        }
        for (const subscriberPlayerId of Array.from(subscriberPlayerIds)) {
            const socket = this.worldSessionService.getSocketByPlayerId(subscriberPlayerId);
            if (!socket) {
                subscriberPlayerIds.delete(subscriberPlayerId);
                if (options?.marketTradeHistoryRequests instanceof Map) {
                    options.marketTradeHistoryRequests.delete(subscriberPlayerId);
                }
                continue;
            }
            const listingRequest = this.resolveMarketListingsRequest(subscriberPlayerId, options?.marketListingRequests);
            this.emitMarketListings(socket, this.marketRuntimeService.buildMarketListingsPage(listingRequest));
            this.emitMarketUpdate(socket, this.marketRuntimeService.buildMarketUpdate(subscriberPlayerId));
        }
        for (const tradeHistoryPlayerId of tradeHistoryPlayerIds) {
            const socket = this.worldSessionService.getSocketByPlayerId(tradeHistoryPlayerId);
            if (!socket) {
                if (options?.marketTradeHistoryRequests instanceof Map) {
                    options.marketTradeHistoryRequests.delete(tradeHistoryPlayerId);
                }
                continue;
            }
            const page = this.resolveMarketTradeHistoryPage(tradeHistoryPlayerId, options?.marketTradeHistoryRequests);
            if (!page) {
                continue;
            }
            this.emitMarketTradeHistory(socket, this.marketRuntimeService.buildTradeHistoryPage(tradeHistoryPlayerId, page));
        }
    }
/** broadcastSuggestionUpdate：执行对应的业务逻辑。 */
    broadcastSuggestionUpdate() {
/** suggestions：定义该变量以承载业务值。 */
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
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_sync_service_1.WorldSyncService))),
    __metadata("design:paramtypes", [mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_service_1.WorldSyncService])
], WorldClientEventService);
