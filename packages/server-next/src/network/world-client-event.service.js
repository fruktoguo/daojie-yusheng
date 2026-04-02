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
let WorldClientEventService = class WorldClientEventService {
    mailRuntimeService;
    marketRuntimeService;
    playerRuntimeService;
    suggestionRuntimeService;
    worldSessionService;
    constructor(mailRuntimeService, marketRuntimeService, playerRuntimeService, suggestionRuntimeService, worldSessionService) {
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldSessionService = worldSessionService;
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
    prefersNext(client) {
        return this.getProtocol(client) === 'next';
    }
    emitByPreference(client, nextEvent, legacyEvent, payload) {
        client.emit(this.prefersNext(client) ? nextEvent : legacyEvent, payload);
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
        world_session_service_1.WorldSessionService])
], WorldClientEventService);
