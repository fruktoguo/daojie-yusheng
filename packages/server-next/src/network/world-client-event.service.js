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
/**
 * 世界客户端事件服务
 *
 * 负责处理与客户端通信的事件，包括：
 * - 协议版本管理（next/legacy）
 * - 事件消息发送
 * - 聊天消息广播
 * - 邮件、市场、任务等业务事件通知
 */
let WorldClientEventService = class WorldClientEventService {
    /** 邮件运行时服务 */
    mailRuntimeService;
    /** 市场运行时服务 */
    marketRuntimeService;
    /** 玩家运行时服务 */
    playerRuntimeService;
    /** 建议运行时服务 */
    suggestionRuntimeService;
    /** 世界会话服务 */
    worldSessionService;
    /** 世界同步服务 */
    worldSyncService;
    constructor(mailRuntimeService, marketRuntimeService, playerRuntimeService, suggestionRuntimeService, worldSessionService, worldSyncService) {
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
    }
    /**
     * 标记客户端偏好使用next协议
     * @param client WebSocket客户端
     */
    markPrefersNext(client) {
        this.markProtocol(client, 'next');
    }
    /**
     * 标记客户端使用的协议版本
     * @param client WebSocket客户端
     * @param protocol 协议版本（'next'或'legacy'）
     */
    markProtocol(client, protocol) {
        if (!client?.data || (protocol !== 'next' && protocol !== 'legacy')) {
            return;
        }
        client.data.protocol = protocol;
        client.data.prefersNext = protocol === 'next';
    }
    /**
     * 获取客户端使用的协议版本
     * @param client WebSocket客户端
     * @returns 协议版本（'next'或'legacy'）
     */
    getProtocol(client) {
        const protocol = client?.data?.protocol;
        if (protocol === 'next' || protocol === 'legacy') {
            return protocol;
        }
        return client?.data?.prefersNext === true ? 'next' : 'legacy';
    }
    /**
     * 获取客户端明确指定的协议版本
     * @param client WebSocket客户端
     * @returns 协议版本（'next'、'legacy'或null）
     */
    getExplicitProtocol(client) {
        const protocol = client?.data?.protocol;
        return protocol === 'next' || protocol === 'legacy' ? protocol : null;
    }
    /**
     * 判断客户端是否偏好使用next协议
     * @param client WebSocket客户端
     * @returns 是否偏好使用next协议
     */
    prefersNext(client) {
        return this.getProtocol(client) === 'next';
    }
    /**
     * 根据客户端协议偏好发送事件
     * @param client WebSocket客户端
     * @param nextEvent next协议事件名
     * @param legacyEvent legacy协议事件名
     * @param payload 事件载荷
     */
    emitByPreference(client, nextEvent, legacyEvent, payload) {
        client.emit(this.prefersNext(client) ? nextEvent : legacyEvent, payload);
    }
    /**
     * 同时发送next和legacy协议事件（根据客户端协议选择）
     * @param client WebSocket客户端
     * @param nextEvent next协议事件名
     * @param legacyEvent legacy协议事件名
     * @param payload 事件载荷
     */
    emitDual(client, nextEvent, legacyEvent, payload) {
        const protocol = this.getExplicitProtocol(client);
        if (protocol !== 'legacy') {
            client.emit(nextEvent, payload);
        }
        if (protocol !== 'next') {
            client.emit(legacyEvent, payload);
        }
    }
    /**
     * 发送错误消息
     * @param client WebSocket客户端
     * @param code 错误代码
     * @param message 错误消息
     */
    emitError(client, code, message) {
        this.emitDual(client, shared_1.NEXT_S2C.Error, shared_1.S2C.Error, { code, message });
    }
    /**
     * 发送网关错误消息
     * @param client WebSocket客户端
     * @param code 错误代码
     * @param error 错误对象或消息
     */
    emitGatewayError(client, code, error) {
        this.emitError(client, code, error instanceof Error ? error.message : 'unknown error');
    }
    /**
     * 发送协议失败消息
     * @param client WebSocket客户端
     * @param code 错误代码
     * @param text 错误文本
     */
    emitProtocolFailure(client, code, text) {
        const protocol = this.getExplicitProtocol(client);
        if (protocol !== 'legacy') {
            client.emit(shared_1.NEXT_S2C.Error, { code, message: text });
        }
        if (protocol !== 'next') {
            client.emit(shared_1.S2C.SystemMsg, {
                text,
                kind: 'system',
            });
        }
    }
    /**
     * 发送未就绪错误消息
     * @param client WebSocket客户端
     */
    emitNotReady(client) {
        this.emitError(client, 'NOT_READY', 'send hello before gameplay commands');
    }
    /**
     * 发送Pong响应消息
     * @param client WebSocket客户端
     * @param payload Ping载荷，包含客户端时间戳
     */
    emitPong(client, payload) {
        this.emitDual(client, shared_1.NEXT_S2C.Pong, shared_1.S2C.Pong, {
            clientAt: payload?.clientAt,
            serverAt: Date.now(),
        });
    }
    /**
     * 发送任务导航结果
     * @param client WebSocket客户端
     * @param questId 任务ID
     * @param ok 是否成功
     * @param error 错误信息
     */
    emitQuestNavigateResult(client, questId, ok, error) {
        this.emitDual(client, shared_1.NEXT_S2C.QuestNavigateResult, shared_1.S2C.QuestNavigateResult, {
            questId,
            ok,
            error,
        });
    }
    /**
     * 发送战利品窗口更新
     * @param client WebSocket客户端
     * @param playerId 玩家ID
     * @param x X坐标
     * @param y Y坐标
     */
    emitLootWindowUpdate(client, playerId, x, y) {
        const payload = this.worldSyncService.openLootWindow(playerId, x, y);
        this.emitDual(client, shared_1.NEXT_S2C.LootWindowUpdate, shared_1.S2C.LootWindowUpdate, payload);
    }
    /**
     * 发送聊天消息
     * @param client WebSocket客户端
     * @param payload 聊天消息载荷
     */
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
    /**
     * 发送待处理的日志消息
     * @param client WebSocket客户端
     * @param playerId 玩家ID
     */
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
    /**
     * 广播聊天消息给同一实例的所有玩家
     * @param playerId 发送消息的玩家ID
     * @param payload 聊天消息载荷
     */
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
    /**
     * 确认系统消息已读
     * @param playerId 玩家ID
     * @param payload 包含消息ID数组的载荷
     */
    acknowledgeSystemMessages(playerId, payload) {
        const ids = Array.isArray(payload?.ids)
            ? payload.ids.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            : [];
        if (ids.length === 0) {
            return;
        }
        this.playerRuntimeService.acknowledgePendingLogbookMessages(playerId, ids);
    }
    /**
     * 发送任务列表
     * @param client WebSocket客户端
     * @param payload 任务列表载荷
     */
    emitQuests(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.Quests, shared_1.S2C.QuestUpdate, payload);
    }
    /**
     * 发送建议更新
     * @param client WebSocket客户端
     * @param suggestions 建议列表
     */
    emitSuggestionUpdate(client, suggestions) {
        this.emitByPreference(client, shared_1.NEXT_S2C.SuggestionUpdate, shared_1.S2C.SuggestionUpdate, {
            suggestions,
        });
    }
    /**
     * 发送邮件摘要
     * @param client WebSocket客户端
     * @param summary 邮件摘要
     */
    emitMailSummary(client, summary) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MailSummary, shared_1.S2C.MailSummary, { summary });
    }
    /**
     * 为指定玩家发送邮件摘要
     * @param client WebSocket客户端
     * @param playerId 玩家ID
     */
    async emitMailSummaryForPlayer(client, playerId) {
        this.emitMailSummary(client, await this.mailRuntimeService.getSummary(playerId));
    }
    /**
     * 发送邮件分页数据
     * @param client WebSocket客户端
     * @param page 邮件分页数据
     */
    emitMailPage(client, page) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MailPage, shared_1.S2C.MailPage, { page });
    }
    /**
     * 发送邮件详情
     * @param client WebSocket客户端
     * @param detail 邮件详情
     */
    emitMailDetail(client, detail) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MailDetail, shared_1.S2C.MailDetail, { detail });
    }
    /**
     * 发送兑换码结果
     * @param client WebSocket客户端
     * @param payload 兑换码结果载荷
     */
    emitRedeemCodesResult(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.RedeemCodesResult, shared_1.S2C.RedeemCodesResult, payload);
    }
    /**
     * 发送邮件操作结果
     * @param client WebSocket客户端
     * @param payload 邮件操作结果载荷
     */
    emitMailOperationResult(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MailOpResult, shared_1.S2C.MailOpResult, payload);
    }
    /**
     * 发送市场更新
     * @param client WebSocket客户端
     * @param payload 市场更新载荷
     */
    emitMarketUpdate(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MarketUpdate, shared_1.S2C.MarketUpdate, payload);
    }
    /**
     * 发送市场物品手册
     * @param client WebSocket客户端
     * @param payload 市场物品手册载荷
     */
    emitMarketItemBook(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MarketItemBook, shared_1.S2C.MarketItemBook, payload);
    }
    /**
     * 发送市场交易历史
     * @param client WebSocket客户端
     * @param payload 市场交易历史载荷
     */
    emitMarketTradeHistory(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.MarketTradeHistory, shared_1.S2C.MarketTradeHistory, payload);
    }
    /**
     * 发送NPC商店数据
     * @param client WebSocket客户端
     * @param payload NPC商店数据载荷
     */
    emitNpcShop(client, payload) {
        this.emitByPreference(client, shared_1.NEXT_S2C.NpcShop, shared_1.S2C.NpcShop, payload);
    }
    /**
     * 刷新市场结果给订阅玩家
     * @param subscriberPlayerIds 订阅玩家ID集合
     * @param result 市场操作结果
     */
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
    /**
     * 广播建议更新给所有在线玩家
     */
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
