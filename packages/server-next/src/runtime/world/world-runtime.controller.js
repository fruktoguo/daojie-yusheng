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
    getSummary() {
        return this.worldRuntimeService.getRuntimeSummary();
    }
    getTemplates() {
        return {
            templates: this.worldRuntimeService.listMapTemplates(),
        };
    }
    getInstances() {
        return {
            instances: this.worldRuntimeService.listInstances(),
        };
    }
    getInstance(instanceId) {
        return {
            instance: this.worldRuntimeService.getInstance(instanceId),
        };
    }
    getInstanceMonsters(instanceId) {
        return {
            monsters: this.worldRuntimeService.listInstanceMonsters(instanceId),
        };
    }
    getInstanceMonster(instanceId, runtimeId) {
        return {
            monster: this.worldRuntimeService.getInstanceMonster(instanceId, runtimeId),
        };
    }
    getInstanceTileState(instanceId, x, y) {
        const parsedX = Number(x);
        const parsedY = Number(y);
        return {
            tile: this.worldRuntimeService.getInstanceTileState(instanceId, Number.isFinite(parsedX) ? Math.trunc(parsedX) : Number.NaN, Number.isFinite(parsedY) ? Math.trunc(parsedY) : Number.NaN),
        };
    }
    spawnMonsterLoot(instanceId, body) {
        return this.worldRuntimeService.enqueueSpawnMonsterLoot(instanceId, body.monsterId ?? '', Number.isFinite(body.x) ? Number(body.x) : Number.NaN, Number.isFinite(body.y) ? Number(body.y) : Number.NaN, Number.isFinite(body.rolls) ? Number(body.rolls) : undefined);
    }
    defeatMonster(instanceId, runtimeId, _body) {
        return this.worldRuntimeService.enqueueDefeatMonster(instanceId, runtimeId);
    }
    damageMonster(instanceId, runtimeId, body) {
        return this.worldRuntimeService.enqueueDamageMonster(instanceId, runtimeId, Number.isFinite(body.amount) ? Number(body.amount) : Number.NaN);
    }
    connectPlayer(body) {
        return this.worldRuntimeService.connectPlayer({
            playerId: body.playerId ?? '',
            sessionId: body.sessionId,
            mapId: body.mapId,
            preferredX: body.preferredX,
            preferredY: body.preferredY,
        });
    }
    removePlayer(playerId) {
        return {
            ok: this.worldRuntimeService.removePlayer(playerId),
        };
    }
    movePlayer(playerId, body) {
        return this.worldRuntimeService.enqueueMove(playerId, body.direction ?? '');
    }
    useAction(playerId, body) {
        return this.worldRuntimeService.executeAction(playerId, body.actionId ?? '');
    }
    usePortal(playerId) {
        return this.worldRuntimeService.usePortal(playerId);
    }
    getPlayerView(playerId, radius) {
        const parsedRadius = radius !== undefined ? Number(radius) : undefined;
        const normalizedRadius = typeof parsedRadius === 'number' && Number.isFinite(parsedRadius)
            ? Math.max(1, Math.trunc(parsedRadius))
            : undefined;
        return {
            view: this.worldRuntimeService.getPlayerView(playerId, normalizedRadius),
        };
    }
    getPlayerDetail(playerId, query) {
        return this.worldRuntimeService.buildDetail(playerId, {
            kind: query.kind ?? 'npc',
            id: query.id ?? '',
        });
    }
    getPlayerTileDetail(playerId, query) {
        const x = query.x !== undefined ? Number(query.x) : Number.NaN;
        const y = query.y !== undefined ? Number(query.y) : Number.NaN;
        return this.worldRuntimeService.buildTileDetail(playerId, { x, y });
    }
    getPlayerState(playerId) {
        return {
            player: this.playerRuntimeService.snapshot(playerId),
        };
    }
    getAuthTrace() {
        return {
            trace: (0, world_player_token_service_1.readAuthTrace)(),
        };
    }
    clearAuthTrace() {
        return (0, world_player_token_service_1.clearAuthTrace)();
    }
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
    getNpcShop(playerId, npcId) {
        return this.worldRuntimeService.buildNpcShopView(playerId, npcId);
    }
    getQuests(playerId) {
        return this.worldRuntimeService.buildQuestListView(playerId);
    }
    async getMailSummary(playerId) {
        return {
            summary: await this.mailRuntimeService.getSummary(playerId),
        };
    }
    async getMailPage(playerId, query) {
        const page = Number(query.page);
        const pageSize = Number(query.pageSize);
        return {
            page: await this.mailRuntimeService.getPage(playerId, Number.isFinite(page) ? Math.trunc(page) : 1, Number.isFinite(pageSize) ? Math.trunc(pageSize) : undefined, query.filter),
        };
    }
    async getMailDetail(playerId, mailId) {
        return {
            detail: await this.mailRuntimeService.getDetail(playerId, mailId),
        };
    }
    getSuggestions() {
        return {
            suggestions: this.suggestionRuntimeService.getAll(),
        };
    }
    async flushPersistence() {
        await this.playerPersistenceFlushService.flushAllNow();
        await this.mapPersistenceFlushService.flushAllNow();
        return {
            ok: true,
        };
    }
    getNpcQuests(playerId, npcId) {
        return this.worldRuntimeService.buildNpcQuestsView(playerId, npcId);
    }
    getMarket(playerId) {
        return this.marketRuntimeService.buildMarketUpdate(playerId);
    }
    getMarketItemBook(_playerId, query) {
        return this.marketRuntimeService.buildItemBook(query.itemKey ?? '');
    }
    getMarketTradeHistory(playerId, query) {
        const page = Number(query.page);
        return this.marketRuntimeService.buildTradeHistoryPage(playerId, Number.isFinite(page) ? Math.trunc(page) : 1);
    }
    updateVitals(playerId, body) {
        return {
            player: this.playerRuntimeService.setVitals(playerId, body),
        };
    }
    damagePlayer(playerId, body) {
        return this.worldRuntimeService.enqueueDamagePlayer(playerId, Number.isFinite(body.amount) ? Number(body.amount) : Number.NaN);
    }
    respawnPlayer(playerId, _body) {
        return this.worldRuntimeService.enqueueRespawnPlayer(playerId);
    }
    grantItem(playerId, body) {
        return {
            player: this.playerRuntimeService.grantItem(playerId, String(body.itemId ?? ''), Number.isFinite(body.count) ? Number(body.count) : 1),
        };
    }
    useItem(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueUseItem(playerId, Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : -1),
        };
    }
    dropItem(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueDropItem(playerId, Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : -1, Number.isFinite(body.count) ? Number(body.count) : undefined),
        };
    }
    takeGround(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueTakeGround(playerId, body.sourceId ?? '', body.itemKey ?? ''),
        };
    }
    equipItem(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueEquip(playerId, Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : -1),
        };
    }
    unequipItem(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueUnequip(playerId, String(body.slot ?? '')),
        };
    }
    cultivateTechnique(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueCultivate(playerId, body.techniqueId ?? null),
        };
    }
    castSkill(playerId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueCastSkill(playerId, body.skillId ?? '', body.targetPlayerId ?? '', body.targetMonsterId ?? ''),
        };
    }
    buyNpcShopItem(playerId, npcId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueBuyNpcShopItem(playerId, npcId, body.itemId ?? '', Number.isFinite(body.quantity) ? Number(body.quantity) : undefined),
        };
    }
    acceptNpcQuest(playerId, npcId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueAcceptNpcQuest(playerId, npcId, body.questId ?? ''),
        };
    }
    submitNpcQuest(playerId, npcId, body) {
        return {
            queued: true,
            view: this.worldRuntimeService.enqueueSubmitNpcQuest(playerId, npcId, body.questId ?? ''),
        };
    }
    async markMailRead(playerId, body) {
        return this.mailRuntimeService.markRead(playerId, body.mailIds ?? []);
    }
    async claimMailAttachments(playerId, body) {
        return this.mailRuntimeService.claimAttachments(playerId, body.mailIds ?? []);
    }
    async deleteMail(playerId, body) {
        return this.mailRuntimeService.deleteMails(playerId, body.mailIds ?? []);
    }
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
    async createSuggestion(playerId, body) {
        return {
            suggestion: await this.suggestionRuntimeService.create(playerId, playerId, body.title ?? '', body.description ?? ''),
        };
    }
    async voteSuggestion(playerId, suggestionId, body) {
        return {
            suggestion: await this.suggestionRuntimeService.vote(playerId, suggestionId, body.vote ?? 'up'),
        };
    }
    async replySuggestion(playerId, suggestionId, body) {
        return {
            suggestion: await this.suggestionRuntimeService.addReply(suggestionId, 'author', playerId, playerId, body.content ?? ''),
        };
    }
    async markSuggestionRepliesRead(playerId, suggestionId) {
        return {
            suggestion: await this.suggestionRuntimeService.markRepliesRead(suggestionId, playerId),
        };
    }
    async completeSuggestion(suggestionId) {
        return {
            suggestion: await this.suggestionRuntimeService.markCompleted(suggestionId),
        };
    }
    async reopenSuggestion(suggestionId) {
        return {
            suggestion: await this.suggestionRuntimeService.markPending(suggestionId),
        };
    }
    async gmReplySuggestion(suggestionId, body) {
        return {
            suggestion: await this.suggestionRuntimeService.addReply(suggestionId, 'gm', 'gm', '开发者', body.content ?? ''),
        };
    }
    async removeSuggestion(suggestionId) {
        return {
            ok: await this.suggestionRuntimeService.remove(suggestionId),
        };
    }
    async createMarketSellOrder(playerId, body) {
        return this.marketRuntimeService.createSellOrder(playerId, {
            slotIndex: Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : Number.NaN,
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
            unitPrice: Number.isFinite(body.unitPrice) ? Number(body.unitPrice) : Number.NaN,
        });
    }
    async createMarketBuyOrder(playerId, body) {
        return this.marketRuntimeService.createBuyOrder(playerId, {
            itemId: body.itemId ?? '',
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
            unitPrice: Number.isFinite(body.unitPrice) ? Number(body.unitPrice) : Number.NaN,
        });
    }
    async buyMarketItem(playerId, body) {
        return this.marketRuntimeService.buyNow(playerId, {
            itemKey: body.itemKey ?? '',
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
        });
    }
    async sellMarketItem(playerId, body) {
        return this.marketRuntimeService.sellNow(playerId, {
            slotIndex: Number.isFinite(body.slotIndex) ? Number(body.slotIndex) : Number.NaN,
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
        });
    }
    async cancelMarketOrder(playerId, body) {
        return this.marketRuntimeService.cancelOrder(playerId, {
            orderId: body.orderId ?? '',
        });
    }
    async claimMarketStorage(playerId) {
        return this.marketRuntimeService.claimStorage(playerId);
    }
};
exports.WorldRuntimeController = WorldRuntimeController;
__decorate([
    (0, common_1.Get)('summary'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getSummary", null);
__decorate([
    (0, common_1.Get)('templates'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getTemplates", null);
__decorate([
    (0, common_1.Get)('instances'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstances", null);
__decorate([
    (0, common_1.Get)('instances/:instanceId'),
    __param(0, (0, common_1.Param)('instanceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstance", null);
__decorate([
    (0, common_1.Get)('instances/:instanceId/monsters'),
    __param(0, (0, common_1.Param)('instanceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstanceMonsters", null);
__decorate([
    (0, common_1.Get)('instances/:instanceId/monsters/:runtimeId'),
    __param(0, (0, common_1.Param)('instanceId')),
    __param(1, (0, common_1.Param)('runtimeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstanceMonster", null);
__decorate([
    (0, common_1.Get)('instances/:instanceId/tiles/:x/:y'),
    __param(0, (0, common_1.Param)('instanceId')),
    __param(1, (0, common_1.Param)('x')),
    __param(2, (0, common_1.Param)('y')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getInstanceTileState", null);
__decorate([
    (0, common_1.Post)('instances/:instanceId/spawn-monster-loot'),
    __param(0, (0, common_1.Param)('instanceId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "spawnMonsterLoot", null);
__decorate([
    (0, common_1.Post)('instances/:instanceId/monsters/:runtimeId/defeat'),
    __param(0, (0, common_1.Param)('instanceId')),
    __param(1, (0, common_1.Param)('runtimeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "defeatMonster", null);
__decorate([
    (0, common_1.Post)('instances/:instanceId/monsters/:runtimeId/damage'),
    __param(0, (0, common_1.Param)('instanceId')),
    __param(1, (0, common_1.Param)('runtimeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "damageMonster", null);
__decorate([
    (0, common_1.Post)('players/connect'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "connectPlayer", null);
__decorate([
    (0, common_1.Delete)('players/:playerId'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "removePlayer", null);
__decorate([
    (0, common_1.Post)('players/:playerId/move'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "movePlayer", null);
__decorate([
    (0, common_1.Post)('players/:playerId/use-action'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "useAction", null);
__decorate([
    (0, common_1.Post)('players/:playerId/portal'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "usePortal", null);
__decorate([
    (0, common_1.Get)('players/:playerId/view'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Query)('radius')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getPlayerView", null);
__decorate([
    (0, common_1.Get)('players/:playerId/detail'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getPlayerDetail", null);
__decorate([
    (0, common_1.Get)('players/:playerId/tile-detail'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getPlayerTileDetail", null);
__decorate([
    (0, common_1.Get)('players/:playerId/state'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getPlayerState", null);
__decorate([
    (0, common_1.Get)('auth-trace'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getAuthTrace", null);
__decorate([
    (0, common_1.Delete)('auth-trace'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "clearAuthTrace", null);
__decorate([
    (0, common_1.Post)('players/:playerId/pending-logbook'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "queuePendingLogbookMessage", null);
__decorate([
    (0, common_1.Get)('players/:playerId/npc-shop/:npcId'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Param)('npcId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getNpcShop", null);
__decorate([
    (0, common_1.Get)('players/:playerId/quests'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getQuests", null);
__decorate([
    (0, common_1.Get)('players/:playerId/mail/summary'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "getMailSummary", null);
__decorate([
    (0, common_1.Get)('players/:playerId/mail/page'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "getMailPage", null);
__decorate([
    (0, common_1.Get)('players/:playerId/mail/:mailId'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Param)('mailId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "getMailDetail", null);
__decorate([
    (0, common_1.Get)('suggestions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getSuggestions", null);
__decorate([
    (0, common_1.Post)('persistence/flush'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "flushPersistence", null);
__decorate([
    (0, common_1.Get)('players/:playerId/npc-quests/:npcId'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Param)('npcId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getNpcQuests", null);
__decorate([
    (0, common_1.Get)('players/:playerId/market'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getMarket", null);
__decorate([
    (0, common_1.Get)('players/:playerId/market/item-book'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getMarketItemBook", null);
__decorate([
    (0, common_1.Get)('players/:playerId/market/trade-history'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "getMarketTradeHistory", null);
__decorate([
    (0, common_1.Post)('players/:playerId/vitals'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "updateVitals", null);
__decorate([
    (0, common_1.Post)('players/:playerId/damage'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "damagePlayer", null);
__decorate([
    (0, common_1.Post)('players/:playerId/respawn'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "respawnPlayer", null);
__decorate([
    (0, common_1.Post)('players/:playerId/grant-item'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "grantItem", null);
__decorate([
    (0, common_1.Post)('players/:playerId/use-item'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "useItem", null);
__decorate([
    (0, common_1.Post)('players/:playerId/drop-item'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "dropItem", null);
__decorate([
    (0, common_1.Post)('players/:playerId/take-ground'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "takeGround", null);
__decorate([
    (0, common_1.Post)('players/:playerId/equip'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "equipItem", null);
__decorate([
    (0, common_1.Post)('players/:playerId/unequip'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "unequipItem", null);
__decorate([
    (0, common_1.Post)('players/:playerId/cultivate'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "cultivateTechnique", null);
__decorate([
    (0, common_1.Post)('players/:playerId/cast-skill'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "castSkill", null);
__decorate([
    (0, common_1.Post)('players/:playerId/npc-shop/:npcId/buy'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Param)('npcId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "buyNpcShopItem", null);
__decorate([
    (0, common_1.Post)('players/:playerId/npc-quests/:npcId/accept'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Param)('npcId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "acceptNpcQuest", null);
__decorate([
    (0, common_1.Post)('players/:playerId/npc-quests/:npcId/submit'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Param)('npcId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], WorldRuntimeController.prototype, "submitNpcQuest", null);
__decorate([
    (0, common_1.Post)('players/:playerId/mail/mark-read'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "markMailRead", null);
__decorate([
    (0, common_1.Post)('players/:playerId/mail/claim'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "claimMailAttachments", null);
__decorate([
    (0, common_1.Post)('players/:playerId/mail/delete'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "deleteMail", null);
__decorate([
    (0, common_1.Post)('players/:playerId/mail/direct'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "createDirectMail", null);
__decorate([
    (0, common_1.Post)('players/:playerId/suggestions'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "createSuggestion", null);
__decorate([
    (0, common_1.Post)('players/:playerId/suggestions/:suggestionId/vote'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Param)('suggestionId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "voteSuggestion", null);
__decorate([
    (0, common_1.Post)('players/:playerId/suggestions/:suggestionId/reply'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Param)('suggestionId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "replySuggestion", null);
__decorate([
    (0, common_1.Post)('players/:playerId/suggestions/:suggestionId/read-replies'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Param)('suggestionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "markSuggestionRepliesRead", null);
__decorate([
    (0, common_1.Post)('suggestions/:suggestionId/complete'),
    __param(0, (0, common_1.Param)('suggestionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "completeSuggestion", null);
__decorate([
    (0, common_1.Post)('suggestions/:suggestionId/pending'),
    __param(0, (0, common_1.Param)('suggestionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "reopenSuggestion", null);
__decorate([
    (0, common_1.Post)('suggestions/:suggestionId/reply'),
    __param(0, (0, common_1.Param)('suggestionId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "gmReplySuggestion", null);
__decorate([
    (0, common_1.Delete)('suggestions/:suggestionId'),
    __param(0, (0, common_1.Param)('suggestionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "removeSuggestion", null);
__decorate([
    (0, common_1.Post)('players/:playerId/market/create-sell-order'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "createMarketSellOrder", null);
__decorate([
    (0, common_1.Post)('players/:playerId/market/create-buy-order'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "createMarketBuyOrder", null);
__decorate([
    (0, common_1.Post)('players/:playerId/market/buy'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "buyMarketItem", null);
__decorate([
    (0, common_1.Post)('players/:playerId/market/sell'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "sellMarketItem", null);
__decorate([
    (0, common_1.Post)('players/:playerId/market/cancel-order'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "cancelMarketOrder", null);
__decorate([
    (0, common_1.Post)('players/:playerId/market/claim-storage'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorldRuntimeController.prototype, "claimMarketStorage", null);
exports.WorldRuntimeController = WorldRuntimeController = __decorate([
    (0, common_1.Controller)('runtime'),
    (0, common_1.UseGuards)(new runtime_http_access_guard_1.RuntimeHttpAccessGuard()),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        player_persistence_flush_service_1.PlayerPersistenceFlushService,
        map_persistence_flush_service_1.MapPersistenceFlushService])
], WorldRuntimeController);
//# sourceMappingURL=world-runtime.controller.js.map
