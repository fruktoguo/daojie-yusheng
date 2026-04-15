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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeController = void 0;

const common_1 = require("@nestjs/common");

const map_persistence_flush_service_1 = require("../../persistence/map-persistence-flush.service");

const player_persistence_flush_service_1 = require("../../persistence/player-persistence-flush.service");

const mail_runtime_service_1 = require("../mail/mail-runtime.service");

const market_runtime_service_1 = require("../market/market-runtime.service");

const player_runtime_service_1 = require("../player/player-runtime.service");

const suggestion_runtime_service_1 = require("../suggestion/suggestion-runtime.service");

const world_player_token_service_1 = require("../../network/world-player-token.service");

const runtime_http_access_guard_1 = require("./runtime-http-access.guard");

const world_runtime_service_1 = require("./world-runtime.service");

let WorldRuntimeController = class WorldRuntimeController {
    worldRuntimeService;
    mailRuntimeService;
    marketRuntimeService;
    playerRuntimeService;
    suggestionRuntimeService;
    playerPersistenceFlushService;
    mapPersistenceFlushService;
    constructor(worldRuntimeService, mailRuntimeService, marketRuntimeService, playerRuntimeService, suggestionRuntimeService, playerPersistenceFlushService, mapPersistenceFlushService) {
        this.worldRuntimeService = worldRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.mapPersistenceFlushService = mapPersistenceFlushService;
    }
    /** getSummary：读取世界运行时摘要。 */
    getSummary() {
        return this.worldRuntimeService.getRuntimeSummary();
    }
    /** getTemplates：读取地图模板列表。 */
    getTemplates() {
        return {
            templates: this.worldRuntimeService.listMapTemplates(),
        };
    }
    /** getInstances：读取实例列表。 */
    getInstances() {
        return {
            instances: this.worldRuntimeService.listInstances(),
        };
    }
    /** getInstance：读取指定实例。 */
    getInstance(instanceId) {
        return {
            instance: this.worldRuntimeService.getInstance(instanceId),
        };
    }
    /** getInstanceMonsters：读取实例中的妖兽列表。 */
    getInstanceMonsters(instanceId) {
        return {
            monsters: this.worldRuntimeService.listInstanceMonsters(instanceId),
        };
    }
    /** getInstanceMonster：读取实例中的单只妖兽。 */
    getInstanceMonster(instanceId, runtimeId) {
        return {
            monster: this.worldRuntimeService.getInstanceMonster(instanceId, runtimeId),
        };
    }
    /** getInstanceTileState：读取实例地块状态。 */
    getInstanceTileState(instanceId, x, y) {

        const parsedX = Number(x);

        const parsedY = Number(y);
        return {
            tile: this.worldRuntimeService.getInstanceTileState(instanceId, Number.isFinite(parsedX) ? Math.trunc(parsedX) : Number.NaN, Number.isFinite(parsedY) ? Math.trunc(parsedY) : Number.NaN),
        };
    }
    /** spawnMonsterLoot：生成妖兽战利品。 */
    spawnMonsterLoot(instanceId, body) {
        return this.worldRuntimeService.enqueueSpawnMonsterLoot(instanceId, body.monsterId ?? '', Number.isFinite(body.x) ? Number(body.x) : Number.NaN, Number.isFinite(body.y) ? Number(body.y) : Number.NaN, Number.isFinite(body.rolls) ? Number(body.rolls) : undefined);
    }
    /** defeatMonster：直接结算一只妖兽被击败后的占用释放。 */
    defeatMonster(instanceId, runtimeId, _body) {
        return this.worldRuntimeService.enqueueDefeatMonster(instanceId, runtimeId);
    }
    /** damageMonster：伤害妖兽。 */
    damageMonster(instanceId, runtimeId, body) {
        return this.worldRuntimeService.enqueueDamageMonster(instanceId, runtimeId, Number.isFinite(body.amount) ? Number(body.amount) : Number.NaN);
    }
    /** connectPlayer：将玩家接入当前实例，并同步初始移动速度与位置。 */
    connectPlayer(body) {
        return this.worldRuntimeService.connectPlayer({
            playerId: body.playerId ?? '',
            sessionId: body.sessionId,
            mapId: body.mapId,
            preferredX: body.preferredX,
            preferredY: body.preferredY,
        });
    }
    /** removePlayer：注销玩家运行态，先清会话再断开实例。 */
    removePlayer(playerId) {
        return {
            ok: this.worldRuntimeService.removePlayer(playerId),
        };
    }
    /** movePlayer：移动玩家。 */
    movePlayer(playerId, body) {
        return this.worldRuntimeService.enqueueMove(playerId, body.direction ?? '');
    }
    /** useAction：使用动作。 */
    useAction(playerId, body) {
        return this.worldRuntimeService.executeAction(playerId, body.actionId ?? '');
    }
    /** usePortal：把当前站位的传送请求排入下一次 tick。 */
    usePortal(playerId) {
        return this.worldRuntimeService.usePortal(playerId);
    }
    /** getPlayerView：读取玩家当前视野快照，并补上 NPC 任务标记。 */
    getPlayerView(playerId, radius) {

        const parsedRadius = radius !== undefined ? Number(radius) : undefined;

        const normalizedRadius = typeof parsedRadius === 'number' && Number.isFinite(parsedRadius)
            ? Math.max(1, Math.trunc(parsedRadius))
            : undefined;
        return {
            view: this.worldRuntimeService.getPlayerView(playerId, normalizedRadius),
        };
    }
    /** getPlayerDetail：读取玩家视野内目标的详情。 */
    getPlayerDetail(playerId, query) {
        return this.worldRuntimeService.buildDetail(playerId, {
            kind: query.kind ?? 'npc',
            id: query.id ?? '',
        });
    }
    /** getPlayerTileDetail：读取玩家指定地块的详情。 */
    getPlayerTileDetail(playerId, query) {

        const x = query.x !== undefined ? Number(query.x) : Number.NaN;

        const y = query.y !== undefined ? Number(query.y) : Number.NaN;
        return this.worldRuntimeService.buildTileDetail(playerId, { x, y });
    }
    /** getPlayerState：读取玩家运行态快照。 */
    getPlayerState(playerId) {
        return {
            player: this.playerRuntimeService.snapshot(playerId),
        };
    }
    /** getAuthTrace：读取最近一次鉴权追踪。 */
    getAuthTrace() {
        return {
            trace: (0, world_player_token_service_1.readAuthTrace)(),
        };
    }
    /** clearAuthTrace：清空鉴权追踪缓存。 */
    clearAuthTrace() {
        /** return：return。 */
        return (0, world_player_token_service_1.clearAuthTrace)();
    }
    /** queuePendingLogbookMessage：把日志本消息排入玩家运行态队列。 */
    queuePendingLogbookMessage(playerId, body) {
        return {
            player: this.playerRuntimeService.queuePendingLogbookMessage(playerId, {
                id: body?.id,
                kind: body?.kind,
                text: body?.text,
                from: body?.from,
                at: Number.isFinite(body?.at) ? Number(body.at) : Date.now(),
            }),
        };
    }
    /** getNpcShop：读取 NPC 商店视图。 */
    getNpcShop(playerId, npcId) {
        return this.worldRuntimeService.buildNpcShopView(playerId, npcId);
    }
    /** getQuests：读取玩家任务列表。 */
    getQuests(playerId) {
        return this.worldRuntimeService.buildQuestListView(playerId);
    }
    /** getMailSummary：读取邮件摘要。 */
    async getMailSummary(playerId) {
        return {
            summary: await this.mailRuntimeService.getSummary(playerId),
        };
    }
    /** getMailPage：读取邮件分页。 */
    async getMailPage(playerId, query) {

        const page = Number(query.page);

        const pageSize = Number(query.pageSize);
        return {
            page: await this.mailRuntimeService.getPage(playerId, Number.isFinite(page) ? Math.trunc(page) : 1, Number.isFinite(pageSize) ? Math.trunc(pageSize) : undefined, query.filter),
        };
    }
    /** getMailDetail：读取邮件详情。 */
    async getMailDetail(playerId, mailId) {
        return {
            detail: await this.mailRuntimeService.getDetail(playerId, mailId),
        };
    }
    /** getSuggestions：读取建议列表。 */
    getSuggestions() {
        return {
            suggestions: this.suggestionRuntimeService.getAll(),
        };
    }
    /** flushPersistence：强制刷新玩家与地图的持久化缓存。 */
    async flushPersistence() {
        await this.playerPersistenceFlushService.flushAllNow();
        await this.mapPersistenceFlushService.flushAllNow();
        return {
            ok: true,
        };
    }
    /** getNpcQuests：读取 NPC 任务列表。 */
    getNpcQuests(playerId, npcId) {
        return this.worldRuntimeService.buildNpcQuestsView(playerId, npcId);
    }
    /** getMarket：读取市场行情。 */
    getMarket(playerId) {
        return this.marketRuntimeService.buildMarketUpdate(playerId);
    }
    /** getMarketItemBook：读取市场物品书。 */
    getMarketItemBook(_playerId, query) {
        return this.marketRuntimeService.buildItemBook(query.itemKey ?? '');
    }
    /** getMarketTradeHistory：读取市场交易历史。 */
    getMarketTradeHistory(playerId, query) {

        const page = Number(query.page);
        return this.marketRuntimeService.buildTradeHistoryPage(playerId, Number.isFinite(page) ? Math.trunc(page) : 1);
    }
    /** updateVitals：同步玩家基础状态。 */
    updateVitals(playerId, body) {
        return {
            player: this.playerRuntimeService.setVitals(playerId, body),
        };
    }
    /** damagePlayer：把玩家受伤请求交给世界运行时排队处理。 */
    damagePlayer(playerId, body) {
        return this.worldRuntimeService.enqueueDamagePlayer(playerId, Number.isFinite(body.amount) ? Number(body.amount) : Number.NaN);
    }
    /** respawnPlayer：把玩家复生请求交给世界运行时处理。 */
    respawnPlayer(playerId, _body) {
        return this.worldRuntimeService.enqueueRespawnPlayer(playerId);
    }
    /** grantItem：直接给玩家发放物品并同步运行态。 */
    grantItem(playerId, body) {
        return {
            player: this.playerRuntimeService.grantItem(playerId, String(body.itemId ?? ''), Number.isFinite(body.count) ? Number(body.count) : 1),
        };
    }
    /** useItem：提交使用物品请求，由世界运行时处理消耗和效果。 */
    useItem(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueUseItem(playerId, Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : -1),
        };
    }
    /** dropItem：提交丢弃物品请求，落地逻辑由实例侧执行。 */
    dropItem(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueDropItem(playerId, Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : -1, Number.isFinite(body.count) ? Number(body.count) : undefined),
        };
    }
    /** takeGround：提交拾取地面或容器物品的请求。 */
    takeGround(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueTakeGround(playerId, body.sourceId ?? '', body.itemKey ?? ''),
        };
    }
    /** equipItem：提交装备请求。 */
    equipItem(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueEquip(playerId, Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : -1),
        };
    }
    /** unequipItem：提交卸下装备请求。 */
    unequipItem(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueUnequip(playerId, String(body.slot ?? '')),
        };
    }
    /** cultivateTechnique：切换或开始修炼指定功法。 */
    cultivateTechnique(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueCultivate(playerId, body.techniqueId ?? null),
        };
    }
    /** castSkill：提交技能释放请求。 */
    castSkill(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueCastSkill(playerId, body.skillId ?? '', body.targetPlayerId ?? '', body.targetMonsterId ?? ''),
        };
    }
    /** buyNpcShopItem：提交 NPC 商店购买请求。 */
    buyNpcShopItem(playerId, npcId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueBuyNpcShopItem(playerId, npcId, body.itemId ?? '', Number.isFinite(body.quantity) ? Number(body.quantity) : undefined),
        };
    }
    /** acceptNpcQuest：提交接取 NPC 任务请求。 */
    acceptNpcQuest(playerId, npcId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueAcceptNpcQuest(playerId, npcId, body.questId ?? ''),
        };
    }
    /** submitNpcQuest：提交完成 NPC 任务请求。 */
    submitNpcQuest(playerId, npcId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueSubmitNpcQuest(playerId, npcId, body.questId ?? ''),
        };
    }
    /** markMailRead：标记邮件为已读。 */
    async markMailRead(playerId, body) {
        return this.mailRuntimeService.markRead(playerId, body.mailIds ?? []);
    }
    /** claimMailAttachments：领取邮件附件。 */
    async claimMailAttachments(playerId, body) {
        return this.mailRuntimeService.claimAttachments(playerId, body.mailIds ?? []);
    }
    /** deleteMail：删除邮件。 */
    async deleteMail(playerId, body) {
        return this.mailRuntimeService.deleteMails(playerId, body.mailIds ?? []);
    }
    /** createDirectMail：创建直达邮件。 */
    async createDirectMail(playerId, body) {
        return {
            mailId: await this.mailRuntimeService.createDirectMail(playerId, {
                templateId: body.templateId,
                fallbackTitle: body.fallbackTitle,
                fallbackBody: body.fallbackBody,
                senderLabel: body.senderLabel,
                expireAt: Number.isFinite(body.expireAt) ? Number(body.expireAt) : null,
                attachments: Array.isArray(body.attachments)
                    ? body.attachments
                        .filter((entry) => typeof entry?.itemId === 'string' && entry.itemId.trim().length > 0)
                        .map((entry) => ({
                        itemId: String(entry.itemId).trim(),
                        count: Number.isFinite(entry.count) ? Number(entry.count) : 1,
                    }))
                    : [],
            }),
        };
    }
    /** createSuggestion：创建建议。 */
    async createSuggestion(playerId, body) {
        return {
            suggestion: await this.suggestionRuntimeService.create(playerId, playerId, body.title ?? '', body.description ?? ''),
        };
    }
    /** voteSuggestion：对建议进行投票。 */
    async voteSuggestion(playerId, suggestionId, body) {
        return {
            suggestion: await this.suggestionRuntimeService.vote(playerId, suggestionId, body.vote ?? 'up'),
        };
    }
    /** replySuggestion：回复建议。 */
    async replySuggestion(playerId, suggestionId, body) {
        return {
            suggestion: await this.suggestionRuntimeService.addReply(suggestionId, 'author', playerId, playerId, body.content ?? ''),
        };
    }
    /** markSuggestionRepliesRead：标记建议回复为已读。 */
    async markSuggestionRepliesRead(playerId, suggestionId) {
        return {
            suggestion: await this.suggestionRuntimeService.markRepliesRead(suggestionId, playerId),
        };
    }
    /** completeSuggestion：完成建议。 */
    async completeSuggestion(suggestionId) {
        return {
            suggestion: await this.suggestionRuntimeService.markCompleted(suggestionId),
        };
    }
    /** reopenSuggestion：重新打开建议。 */
    async reopenSuggestion(suggestionId) {
        return {
            suggestion: await this.suggestionRuntimeService.markPending(suggestionId),
        };
    }
    /** gmReplySuggestion：GM 回复建议。 */
    async gmReplySuggestion(suggestionId, body) {
        return {
            suggestion: await this.suggestionRuntimeService.addReply(suggestionId, 'gm', 'gm', '开发者', body.content ?? ''),
        };
    }
    /** removeSuggestion：删除建议。 */
    async removeSuggestion(suggestionId) {
        return {
            ok: await this.suggestionRuntimeService.remove(suggestionId),
        };
    }
    /** createMarketSellOrder：创建市场卖单。 */
    async createMarketSellOrder(playerId, body) {
        return this.marketRuntimeService.createSellOrder(playerId, {
            slotIndex: Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : Number.NaN,
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
            unitPrice: Number.isFinite(body.unitPrice) ? Number(body.unitPrice) : Number.NaN,
        });
    }
    /** createMarketBuyOrder：创建市场买单。 */
    async createMarketBuyOrder(playerId, body) {
        return this.marketRuntimeService.createBuyOrder(playerId, {
            itemKey: body.itemKey ?? '',
            itemId: body.itemId ?? '',
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
            unitPrice: Number.isFinite(body.unitPrice) ? Number(body.unitPrice) : Number.NaN,
        });
    }
    /** buyMarketItem：执行市场买入。 */
    async buyMarketItem(playerId, body) {
        return this.marketRuntimeService.buyNow(playerId, {
            itemKey: body.itemKey ?? '',
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
        });
    }
    /** sellMarketItem：执行市场卖出。 */
    async sellMarketItem(playerId, body) {
        return this.marketRuntimeService.sellNow(playerId, {
            slotIndex: Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : Number.NaN,
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
        });
    }
    /** cancelMarketOrder：取消市场订单。 */
    async cancelMarketOrder(playerId, body) {
        return this.marketRuntimeService.cancelOrder(playerId, {
            orderId: body.orderId ?? '',
        });
    }
    /** claimMarketStorage：领取市场暂存物品。 */
    async claimMarketStorage(playerId) {
        return this.marketRuntimeService.claimStorage(playerId);
    }
};
exports.WorldRuntimeController = WorldRuntimeController;
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('summary'),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", []),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getSummary", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('templates'),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", []),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getTemplates", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('instances'),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", []),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstances", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('instances/:instanceId'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('instanceId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstance", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('instances/:instanceId/monsters'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('instanceId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstanceMonsters", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('instances/:instanceId/monsters/:runtimeId'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('instanceId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('runtimeId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstanceMonster", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('instances/:instanceId/tiles/:x/:y'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('instanceId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('x')),
    /** __param：param。 */
    __param(2, (0, common_1.Param)('y')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String, String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstanceTileState", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('instances/:instanceId/spawn-monster-loot'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('instanceId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "spawnMonsterLoot", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('instances/:instanceId/monsters/:runtimeId/defeat'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('instanceId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('runtimeId')),
    /** __param：param。 */
    __param(2, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "defeatMonster", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('instances/:instanceId/monsters/:runtimeId/damage'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('instanceId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('runtimeId')),
    /** __param：param。 */
    __param(2, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "damageMonster", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/connect'),
    /** __param：param。 */
    __param(0, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "connectPlayer", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Delete)('players/:playerId'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "removePlayer", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/move'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "movePlayer", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/use-action'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "useAction", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/portal'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "usePortal", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/view'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Query)('radius')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getPlayerView", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/detail'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Query)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getPlayerDetail", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/tile-detail'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Query)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getPlayerTileDetail", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/state'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getPlayerState", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('auth-trace'),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", []),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getAuthTrace", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Delete)('auth-trace'),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", []),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "clearAuthTrace", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/pending-logbook'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "queuePendingLogbookMessage", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/npc-shop/:npcId'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('npcId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getNpcShop", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/quests'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getQuests", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/mail/summary'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "getMailSummary", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/mail/page'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Query)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "getMailPage", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/mail/:mailId'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('mailId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "getMailDetail", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('suggestions'),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", []),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getSuggestions", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('persistence/flush'),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", []),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "flushPersistence", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/npc-quests/:npcId'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('npcId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getNpcQuests", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/market'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getMarket", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/market/item-book'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Query)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getMarketItemBook", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Get)('players/:playerId/market/trade-history'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Query)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getMarketTradeHistory", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/vitals'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "updateVitals", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/damage'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "damagePlayer", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/respawn'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "respawnPlayer", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/grant-item'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "grantItem", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/use-item'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "useItem", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/drop-item'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "dropItem", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/take-ground'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "takeGround", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/equip'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "equipItem", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/unequip'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "unequipItem", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/cultivate'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "cultivateTechnique", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/cast-skill'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "castSkill", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/npc-shop/:npcId/buy'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('npcId')),
    /** __param：param。 */
    __param(2, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "buyNpcShopItem", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/npc-quests/:npcId/accept'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('npcId')),
    /** __param：param。 */
    __param(2, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "acceptNpcQuest", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/npc-quests/:npcId/submit'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('npcId')),
    /** __param：param。 */
    __param(2, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "submitNpcQuest", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/mail/mark-read'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "markMailRead", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/mail/claim'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "claimMailAttachments", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/mail/delete'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "deleteMail", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/mail/direct'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "createDirectMail", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/suggestions'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "createSuggestion", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/suggestions/:suggestionId/vote'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('suggestionId')),
    /** __param：param。 */
    __param(2, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "voteSuggestion", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/suggestions/:suggestionId/reply'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('suggestionId')),
    /** __param：param。 */
    __param(2, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "replySuggestion", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/suggestions/:suggestionId/read-replies'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Param)('suggestionId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "markSuggestionRepliesRead", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('suggestions/:suggestionId/complete'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('suggestionId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "completeSuggestion", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('suggestions/:suggestionId/pending'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('suggestionId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "reopenSuggestion", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('suggestions/:suggestionId/reply'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('suggestionId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "gmReplySuggestion", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Delete)('suggestions/:suggestionId'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('suggestionId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "removeSuggestion", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/market/create-sell-order'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "createMarketSellOrder", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/market/create-buy-order'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "createMarketBuyOrder", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/market/buy'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "buyMarketItem", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/market/sell'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "sellMarketItem", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/market/cancel-order'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __param：param。 */
    __param(1, (0, common_1.Body)()),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String, Object]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "cancelMarketOrder", null);
/** __decorate：decorate。 */
__decorate([
    (0, common_1.Post)('players/:playerId/market/claim-storage'),
    /** __param：param。 */
    __param(0, (0, common_1.Param)('playerId')),
    /** __metadata：metadata。 */
    __metadata("design:type", Function),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [String]),
    /** __metadata：metadata。 */
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "claimMarketStorage", null);
exports.WorldRuntimeController = WorldRuntimeController = __decorate([
    (0, common_1.Controller)('runtime'),
    (0, common_1.UseGuards)(new runtime_http_access_guard_1.RuntimeHttpAccessGuard()),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        player_persistence_flush_service_1.PlayerPersistenceFlushService,
        map_persistence_flush_service_1.MapPersistenceFlushService])
], WorldRuntimeController);
//# sourceMappingURL=world-runtime.controller.js.map



