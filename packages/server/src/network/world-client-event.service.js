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
    return function (target, key) { decorator(target, key, paramIndex); };
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
// TODO(next:T23): 把 notice/chat/loot/window 等 runtime emit 面继续纳入 shared protocol/audit 门禁，减少事件服务和 shared 合同脱节。

/** 世界客户端事件服务：把 runtime 结果翻译成 Socket 事件并按玩家维度下发。 */
let WorldClientEventService = class WorldClientEventService {
    /** 邮件 runtime，用于查询邮件摘要、分页和详情。 */
    mailRuntimeService;
    /** 坊市 runtime，用于查询订单、图鉴和成交历史。 */
    marketRuntimeService;
    /** 玩家 runtime，用于读取任务、聊天和日志书状态。 */
    playerRuntimeService;
    /** 建议 runtime，用于推送建议板块更新。 */
    suggestionRuntimeService;
    /** 会话管理入口，用于把 playerId 映射回在线 socket。 */
    worldSessionService;
    /** 复用同步服务里的拾取窗口和世界态辅助推送。 */
    worldSyncService;
    constructor(mailRuntimeService, marketRuntimeService, playerRuntimeService, suggestionRuntimeService, worldSessionService, worldSyncService) {
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
    }
    /** 记录客户端偏好的 next 协议。 */
    markPrefersNext(client) {
        this.markProtocol(client, 'next');
    }
    /** 写入客户端协议信息，只保留 next 这一条有效路径。 */
    markProtocol(client, protocol) {
        if (!client?.data || protocol !== 'next') {
            return;
        }
        client.data.protocol = protocol;
    }
    /** 当前实现只支持 next 协议。 */
    getProtocol(client) {
        return 'next';
    }
    /** 显式返回 next 协议，供兼容调用复用。 */
    getExplicitProtocol(client) {
        return 'next';
    }
    /** 返回协议投影结果，告知上层直接走 next 下发。 */
    resolveProtocolEmission(client) {
        return {
            protocol: 'next',

            emitNext: true,
        };
    }
    /** 判断是否优先使用 next 协议。 */
    prefersNext(client) {
        return true;
    }
    /** 最终协议始终收敛到 next。 */
    resolveEffectiveProtocol(client) {
        return 'next';
    }
    /** 统一 Socket emit 包装，便于后续替换发送层。 */
    emit(client, event, payload) {
        client.emit(event, payload);
    }
    /** 发送标准错误包。 */
    emitError(client, code, message) {
        this.emit(client, shared_1.NEXT_S2C.Error, { code, message });
    }
    /** 发送由异常对象转换来的错误包。 */
    emitGatewayError(client, code, error) {
        this.emitError(client, code, error instanceof Error ? error.message : 'unknown error');
    }
    /** 发送协议层错误，通常用于鉴权或消息格式错误。 */
    emitProtocolFailure(client, code, text) {
        client.emit(shared_1.NEXT_S2C.Error, { code, message: text });
    }
    /** 向客户端展示系统提示，供任务、聊天和操作反馈复用。 */
    emitSystemMessage(client, text, kind = 'info') {

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
    /** 发送未完成 hello 的提示，拦住非法 gameplay 命令。 */
    emitNotReady(client) {
        this.emitError(client, 'NOT_READY', 'send hello before gameplay commands');
    }
    /** 推送心跳响应。 */
    emitPong(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.Pong, {
            clientAt: payload?.clientAt,
            serverAt: Date.now(),
        });
    }
    /** 返回任务导航结果。 */
    emitQuestNavigateResult(client, questId, ok, error) {
        this.emit(client, shared_1.NEXT_S2C.QuestNavigateResult, {
            questId,
            ok,
            error,
        });
    }
    /** 打开或刷新拾取窗口。 */
    emitLootWindowUpdate(client, playerId, x, y) {

        const payload = this.worldSyncService.openLootWindow(playerId, x, y);
        this.emit(client, shared_1.NEXT_S2C.LootWindowUpdate, payload);
    }
    /** 向客户端补发聊天风格通知。 */
    emitChatMessage(client, payload) {
        client.emit(shared_1.NEXT_S2C.Notice, {
            items: [{
                    kind: 'chat',
                    text: payload.text,
                    from: payload.from,
                }],
        });
    }
    /** 发送玩家进入后尚未确认的日志书消息。 */
    emitPendingLogbookMessages(client, playerId) {

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
    /** 将同实例内的聊天广播给所有在线玩家。 */
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
    /** 标记指定日志消息已被玩家确认。 */
    acknowledgeSystemMessages(playerId, payload) {

        const ids = Array.isArray(payload?.ids)
            ? payload.ids.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            : [];
        if (ids.length === 0) {
            return;
        }
        this.playerRuntimeService.acknowledgePendingLogbookMessages(playerId, ids);
    }
    /** 推送任务列表。 */
    emitQuests(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.Quests, payload);
    }
    /** 推送建议列表变更。 */
    emitSuggestionUpdate(client, suggestions) {
        this.emit(client, shared_1.NEXT_S2C.SuggestionUpdate, {
            suggestions,
        });
    }
    /** 推送邮件摘要。 */
    emitMailSummary(client, summary) {
        this.emit(client, shared_1.NEXT_S2C.MailSummary, { summary });
    }
    /** 查询并推送指定玩家的邮件摘要。 */
    async emitMailSummaryForPlayer(client, playerId) {
        this.emitMailSummary(client, await this.mailRuntimeService.getSummary(playerId));
    }
    /** 推送邮件分页。 */
    emitMailPage(client, page) {
        this.emit(client, shared_1.NEXT_S2C.MailPage, { page });
    }
    /** 推送邮件详情。 */
    emitMailDetail(client, detail) {
        this.emit(client, shared_1.NEXT_S2C.MailDetail, { detail });
    }
    /** 推送兑换码结果。 */
    emitRedeemCodesResult(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.RedeemCodesResult, payload);
    }
    /** 推送邮件操作结果。 */
    emitMailOperationResult(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MailOpResult, payload);
    }
    /** 推送坊市概览更新。 */
    emitMarketUpdate(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketUpdate, payload);
    }
    /** 推送坊市列表。 */
    emitMarketListings(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketListings, payload);
    }
    /** 推送坊市订单。 */
    emitMarketOrders(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketOrders, payload);
    }
    /** 推送坊市仓库。 */
    emitMarketStorage(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketStorage, payload);
    }
    /** 推送坊市图鉴。 */
    emitMarketItemBook(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketItemBook, payload);
    }
    /** 推送坊市成交历史。 */
    emitMarketTradeHistory(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.MarketTradeHistory, payload);
    }
    /** 推送 NPC 商店数据。 */
    emitNpcShop(client, payload) {
        this.emit(client, shared_1.NEXT_S2C.NpcShop, payload);
    }
    normalizePlayerIds(playerIds) {
        if (!Array.isArray(playerIds)) {
            return [];
        }
        return Array.from(new Set(playerIds.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())));
    }
    resolveMarketListingsRequest(playerId, listingRequests) {
        if (listingRequests instanceof Map) {
            const request = listingRequests.get(playerId);
            if (request && typeof request === 'object') {
                return request;
            }
        }
        return { page: 1 };
    }
    resolveMarketTradeHistoryPage(playerId, tradeHistoryRequests) {
        if (tradeHistoryRequests instanceof Map) {
            const page = tradeHistoryRequests.get(playerId);
            if (Number.isFinite(page)) {
                return Math.max(1, Math.trunc(page));
            }
        }
        return null;
    }
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
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_sync_service_1.WorldSyncService))),
    __metadata("design:paramtypes", [mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_service_1.WorldSyncService])
], WorldClientEventService);

