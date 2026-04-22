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
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldClientEventService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared");

const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");

const market_runtime_service_1 = require("../runtime/market/market-runtime.service");

const player_runtime_service_1 = require("../runtime/player/player-runtime.service");

const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");

const world_session_service_1 = require("./world-session.service");

const world_sync_quest_loot_service_1 = require("./world-sync-quest-loot.service");

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
    /** 复用 quest / loot 同步服务里的拾取窗口推送。 */
    worldSyncQuestLootService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param mailRuntimeService 参数说明。
 * @param marketRuntimeService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param suggestionRuntimeService 参数说明。
 * @param worldSessionService 参数说明。
 * @param worldSyncQuestLootService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(mailRuntimeService, marketRuntimeService, playerRuntimeService, suggestionRuntimeService, worldSessionService, worldSyncQuestLootService) {
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncQuestLootService = worldSyncQuestLootService;
    }
    /** 记录客户端偏好的 mainline 协议。 */
    markPrefersMainline(client) {
        this.markProtocol(client, 'mainline');
    }
    /** 写入客户端协议信息，只保留主线这一条有效路径。 */
    markProtocol(client, protocol) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!client?.data || protocol !== 'mainline') {
            return;
        }
        client.data.protocol = protocol;
    }
    /** 当前实现只支持 mainline 协议。 */
    getProtocol(client) {
        return 'mainline';
    }
    /** 显式返回 mainline 协议，供兼容调用复用。 */
    getExplicitProtocol(client) {
        return 'mainline';
    }
    /** 返回协议投影结果，告知上层直接走主线下发。 */
    resolveProtocolEmission(client) {
        return {
            protocol: 'mainline',

            emitMainline: true,
        };
    }
    /** 判断是否优先使用 mainline 协议。 */
    prefersMainline(client) {
        return true;
    }
    /** 最终协议始终收敛到主线。 */
    resolveEffectiveProtocol(client) {
        return 'mainline';
    }
    /** 统一 Socket emit 包装，便于后续替换发送层。 */
    emit(client, event, payload) {
        client.emit(event, payload);
    }
    /** 发送标准错误包。 */
    emitError(client, code, message) {
        this.emit(client, shared_1.S2C.Error, { code, message });
    }
    /** 发送由异常对象转换来的错误包。 */
    emitGatewayError(client, code, error) {
        this.emitError(client, code, error instanceof Error ? error.message : 'unknown error');
    }
    /** 发送协议层错误，通常用于鉴权或消息格式错误。 */
    emitProtocolFailure(client, code, text) {
        client.emit(shared_1.S2C.Error, { code, message: text });
    }
    /** 向客户端展示系统提示，供任务、聊天和操作反馈复用。 */
    emitSystemMessage(client, text, kind = 'info') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedText = typeof text === 'string' ? text.trim() : '';
        if (!normalizedText) {
            return;
        }
        this.emitNoticeItems(client, [{
                kind,
                text: normalizedText,
            }]);
    }
    /** 统一发送主线 Notice，供即时提示与日志书回放共用。 */
    emitNoticeItems(client, items) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedItems = Array.isArray(items)
            ? items.filter((entry) => entry && typeof entry === 'object' && typeof entry.text === 'string' && entry.text.trim().length > 0)
            : [];
        if (normalizedItems.length <= 0) {
            return;
        }
        client.emit(shared_1.S2C.Notice, {
            items: normalizedItems,
        });
    }
    /** 将待确认日志书条目直接翻译成主线 Notice。 */
    emitPendingLogbookNotice(client, entry) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!entry || typeof entry !== 'object') {
            return;
        }
        this.emitNoticeItems(client, [{
                messageId: entry.id,
                kind: entry.kind,
                text: entry.text,
                from: entry.from,
                occurredAt: entry.at,
                persistUntilAck: true,
            }]);
    }
    /** 发送未完成 hello 的提示，拦住非法 gameplay 命令。 */
    emitNotReady(client) {
        this.emitError(client, 'NOT_READY', 'send hello before gameplay commands');
    }
    /** 推送心跳响应。 */
    emitPong(client, payload) {
        this.emit(client, shared_1.S2C.Pong, {
            clientAt: payload?.clientAt,
            serverAt: Date.now(),
        });
    }
    /** 返回任务导航结果。 */
    emitQuestNavigateResult(client, questId, ok, error) {
        this.emit(client, shared_1.S2C.QuestNavigateResult, {
            questId,
            ok,
            error,
        });
    }
    /** 打开或刷新拾取窗口。 */
    emitLootWindowUpdate(client, playerId, x, y) {

        const payload = this.worldSyncQuestLootService.openLootWindow(playerId, x, y);
        this.emit(client, shared_1.S2C.LootWindowUpdate, payload);
    }
    /** 向客户端补发聊天风格通知。 */
    emitChatMessage(client, payload) {
        client.emit(shared_1.S2C.Notice, {
            items: [{
                    kind: 'chat',
                    text: payload.text,
                    from: payload.from,
                }],
        });
    }
    /** 发送玩家进入后尚未确认的日志书消息。 */
    emitPendingLogbookMessages(client, playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const pending = this.playerRuntimeService.getPendingLogbookMessages(playerId);
        const prefilledMessageIds = client?.data?.prefilledPendingLogbookMessageIds instanceof Set
            ? client.data.prefilledPendingLogbookMessageIds
            : null;
        for (const entry of pending) {
            if (prefilledMessageIds?.has(entry.id)) {
                prefilledMessageIds.delete(entry.id);
                continue;
            }
            this.emitPendingLogbookNotice(client, entry);
        }
        if (prefilledMessageIds && prefilledMessageIds.size <= 0 && client?.data) {
            client.data.prefilledPendingLogbookMessageIds = null;
        }
    }
    /** 将同实例内的聊天广播给所有在线玩家。 */
    broadcastChat(playerId, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
        this.emit(client, shared_1.S2C.Quests, payload);
    }
    /** 推送建议列表变更。 */
    emitSuggestionUpdate(client, suggestions) {
        this.emit(client, shared_1.S2C.SuggestionUpdate, {
            suggestions,
        });
    }
    /** 推送邮件摘要。 */
    emitMailSummary(client, summary) {
        this.emit(client, shared_1.S2C.MailSummary, { summary });
    }
    /** 查询并推送指定玩家的邮件摘要。 */
    async emitMailSummaryForPlayer(client, playerId) {
        this.emitMailSummary(client, await this.mailRuntimeService.getSummary(playerId));
    }
    /** 推送邮件分页。 */
    emitMailPage(client, page) {
        this.emit(client, shared_1.S2C.MailPage, { page });
    }
    /** 推送邮件详情。 */
    emitMailDetail(client, detail) {
        this.emit(client, shared_1.S2C.MailDetail, { detail });
    }
    /** 推送兑换码结果。 */
    emitRedeemCodesResult(client, payload) {
        this.emit(client, shared_1.S2C.RedeemCodesResult, payload);
    }
    /** 推送邮件操作结果。 */
    emitMailOperationResult(client, payload) {
        this.emit(client, shared_1.S2C.MailOpResult, payload);
    }
    /** 推送坊市概览更新。 */
    emitMarketUpdate(client, payload) {
        this.emit(client, shared_1.S2C.MarketUpdate, payload);
    }
    /** 推送坊市列表。 */
    emitMarketListings(client, payload) {
        this.emit(client, shared_1.S2C.MarketListings, payload);
    }
    /** 推送坊市订单。 */
    emitMarketOrders(client, payload) {
        this.emit(client, shared_1.S2C.MarketOrders, payload);
    }
    /** 推送坊市仓库。 */
    emitMarketStorage(client, payload) {
        this.emit(client, shared_1.S2C.MarketStorage, payload);
    }
    /** 推送坊市图鉴。 */
    emitMarketItemBook(client, payload) {
        this.emit(client, shared_1.S2C.MarketItemBook, payload);
    }
    /** 推送坊市成交历史。 */
    emitMarketTradeHistory(client, payload) {
        this.emit(client, shared_1.S2C.MarketTradeHistory, payload);
    }
    /** 推送 NPC 商店数据。 */
    emitNpcShop(client, payload) {
        this.emit(client, shared_1.S2C.NpcShop, payload);
    }    
    /**
 * normalizePlayerIds：规范化或转换玩家ID。
 * @param playerIds player ID 集合。
 * @returns 无返回值，直接更新玩家ID相关状态。
 */

    normalizePlayerIds(playerIds) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!Array.isArray(playerIds)) {
            return [];
        }
        return Array.from(new Set(playerIds.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())));
    }    
    /**
 * resolveMarketListingsRequest：读取坊市ListingRequest并返回结果。
 * @param playerId 玩家 ID。
 * @param listingRequests 参数说明。
 * @returns 无返回值，直接更新坊市ListingRequest相关状态。
 */

    resolveMarketListingsRequest(playerId, listingRequests) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (listingRequests instanceof Map) {
            const request = listingRequests.get(playerId);
            if (request && typeof request === 'object') {
                return request;
            }
        }
        return { page: 1 };
    }    
    /**
 * resolveMarketTradeHistoryPage：判断坊市Trade历史Page是否满足条件。
 * @param playerId 玩家 ID。
 * @param tradeHistoryRequests 参数说明。
 * @returns 无返回值，直接更新坊市TradeHistoryPage相关状态。
 */

    resolveMarketTradeHistoryPage(playerId, tradeHistoryRequests) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (tradeHistoryRequests instanceof Map) {
            const page = tradeHistoryRequests.get(playerId);
            if (Number.isFinite(page)) {
                return Math.max(1, Math.trunc(page));
            }
        }
        return null;
    }    
    /**
 * flushMarketResult：处理刷新坊市结果并更新相关状态。
 * @param subscriberPlayerIds subscriberPlayer ID 集合。
 * @param result 返回结果。
 * @param options 选项参数。
 * @returns 无返回值，直接更新flush坊市结果相关状态。
 */

    flushMarketResult(subscriberPlayerIds, result, options) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * broadcastSuggestionUpdate：处理broadcastSuggestionUpdate并更新相关状态。
 * @returns 无返回值，直接更新broadcastSuggestionUpdate相关状态。
 */

    broadcastSuggestionUpdate() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_sync_quest_loot_service_1.WorldSyncQuestLootService))),
    __metadata("design:paramtypes", [mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_quest_loot_service_1.WorldSyncQuestLootService])
], WorldClientEventService);
export { WorldClientEventService };
