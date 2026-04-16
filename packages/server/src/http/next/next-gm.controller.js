"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextGmController = void 0;
const common_1 = require("@nestjs/common");
const next_gm_auth_guard_1 = require("./next-gm-auth.guard");
const next_gm_mail_service_1 = require("./next-gm-mail.service");
const next_gm_player_service_1 = require("./next-gm-player.service");
const next_gm_world_service_1 = require("./next-gm-world.service");
const next_managed_account_service_1 = require("./next-managed-account.service");
const next_gm_contract_1 = require("./next-gm-contract");
const redeem_code_runtime_service_1 = require("../../runtime/redeem/redeem-code-runtime.service");
let NextGmController = class NextGmController {
    nextGmWorldService;
    nextManagedAccountService;
    nextGmPlayerService;
    nextGmMailService;
    redeemCodeRuntimeService;
    constructor(nextGmWorldService, nextManagedAccountService, nextGmPlayerService, nextGmMailService, redeemCodeRuntimeService) {
        this.nextGmWorldService = nextGmWorldService;
        this.nextManagedAccountService = nextManagedAccountService;
        this.nextGmPlayerService = nextGmPlayerService;
        this.nextGmMailService = nextGmMailService;
        this.redeemCodeRuntimeService = redeemCodeRuntimeService;
    }
    getState() {
        return this.nextGmWorldService.getState();
    }
    getEditorCatalog() {
        return this.nextGmWorldService.getEditorCatalog();
    }
    getMaps() {
        return this.nextGmWorldService.getMaps();
    }
    getMapRuntime(mapId, qx, qy, qw, qh, viewerId) {
        return this.nextGmWorldService.getMapRuntime(mapId, qx, qy, qw, qh, viewerId);
    }
    async getPlayer(playerId) {
        const player = await this.nextGmWorldService.getPlayerDetail(playerId);
        if (!player) {
            throw new common_1.BadRequestException('目标玩家不存在');
        }
        return player;
    }
    async updatePlayerPassword(playerId, body) {
        const nextPassword = typeof body?.newPassword === 'string' && body.newPassword.trim()
            ? body.newPassword
            : body?.password ?? '';
        await this.nextManagedAccountService.updateManagedPlayerPassword(playerId, nextPassword);
        return { ok: true };
    }
    async updatePlayerAccount(playerId, body) {
        await this.nextManagedAccountService.updateManagedPlayerAccount(playerId, body?.username ?? '');
        return { ok: true };
    }
    async updatePlayer(playerId, body) {
        await this.nextGmPlayerService.updatePlayer(playerId, body ?? {});
        return { ok: true };
    }
    async resetPlayer(playerId) {
        if (this.nextGmPlayerService.hasRuntimePlayer(playerId)) {
            this.nextGmPlayerService.resetPlayer(playerId);
        }
        else {
            await this.nextGmPlayerService.resetPersistedPlayer(playerId);
        }
        return { ok: true };
    }
    async resetHeavenGate(playerId) {
        await this.nextGmPlayerService.resetHeavenGate(playerId);
        return { ok: true };
    }
    async spawnBots(body) {
        this.nextGmPlayerService.spawnBots(body?.anchorPlayerId ?? '', body?.count);
        return { ok: true };
    }
    async removeBots(body) {
        this.nextGmPlayerService.removeBots(body?.playerIds, body?.all);
        return { ok: true };
    }
    async returnAllPlayersToDefaultSpawn() {
        return this.nextGmPlayerService.returnAllPlayersToDefaultSpawn();
    }
    resetNetworkPerf() {
        this.nextGmWorldService.resetNetworkPerf();
        return { ok: true };
    }
    resetCpuPerf() {
        this.nextGmWorldService.resetCpuPerf();
        return { ok: true };
    }
    resetPathfindingPerf() {
        this.nextGmWorldService.resetPathfindingPerf();
        return { ok: true };
    }
    async createDirectMail(playerId, body) {
        const mailId = await this.nextGmMailService.createDirectMail(playerId, body ?? {});
        return { ok: true, mailId };
    }
    async createBroadcastMail(body) {
        const result = await this.nextGmMailService.createBroadcastMail(body ?? {});
        return { ok: true, mailId: result.mailId, batchId: result.batchId, recipientCount: result.recipientCount };
    }
    getRedeemCodeGroups() {
        return this.redeemCodeRuntimeService.listGroups();
    }
    async createRedeemCodeGroup(body) {
        return this.redeemCodeRuntimeService.createGroup(body?.name ?? '', body?.rewards ?? [], Number(body?.count));
    }
    async getRedeemCodeGroup(groupId) {
        return this.redeemCodeRuntimeService.getGroupDetail(groupId);
    }
    async updateRedeemCodeGroup(groupId, body) {
        return this.redeemCodeRuntimeService.updateGroup(groupId, body?.name ?? '', body?.rewards ?? []);
    }
    async appendRedeemCodes(groupId, body) {
        return this.redeemCodeRuntimeService.appendCodes(groupId, Number(body?.count));
    }
    async destroyRedeemCode(codeId) {
        return this.redeemCodeRuntimeService.destroyCode(codeId);
    }
    getSuggestions(query) {
        return this.nextGmWorldService.getSuggestions(query ?? {});
    }
    async completeSuggestion(id) {
        return this.nextGmWorldService.completeSuggestion(id);
    }
    async replySuggestion(id, body) {
        return this.nextGmWorldService.replySuggestion(id, body ?? {});
    }
    async removeSuggestion(id) {
        return this.nextGmWorldService.removeSuggestion(id);
    }
    updateMapTick(mapId, body) {
        this.nextGmWorldService.updateMapTick(mapId, body ?? {});
        return { ok: true };
    }
    updateMapTime(mapId, body) {
        this.nextGmWorldService.updateMapTime(mapId, body ?? {});
        return { ok: true };
    }
    reloadTickConfig() {
        return this.nextGmWorldService.reloadTickConfig();
    }
    clearWorldObservation(viewerId) {
        this.nextGmWorldService.clearWorldObservation(viewerId);
        return { ok: true };
    }
};
exports.NextGmController = NextGmController;
__decorate([
    (0, common_1.Get)('state'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "getState", null);
__decorate([
    (0, common_1.Get)('editor-catalog'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "getEditorCatalog", null);
__decorate([
    (0, common_1.Get)('maps'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "getMaps", null);
__decorate([
    (0, common_1.Get)('maps/:mapId/runtime'),
    __param(0, (0, common_1.Param)('mapId')),
    __param(1, (0, common_1.Query)('x')),
    __param(2, (0, common_1.Query)('y')),
    __param(3, (0, common_1.Query)('w')),
    __param(4, (0, common_1.Query)('h')),
    __param(5, (0, common_1.Query)('viewerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "getMapRuntime", null);
__decorate([
    (0, common_1.Get)('players/:playerId'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "getPlayer", null);
__decorate([
    (0, common_1.Post)('players/:playerId/password'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "updatePlayerPassword", null);
__decorate([
    (0, common_1.Put)('players/:playerId/account'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "updatePlayerAccount", null);
__decorate([
    (0, common_1.Put)('players/:playerId'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "updatePlayer", null);
__decorate([
    (0, common_1.Post)('players/:playerId/reset'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "resetPlayer", null);
__decorate([
    (0, common_1.Post)('players/:playerId/heaven-gate/reset'),
    __param(0, (0, common_1.Param)('playerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "resetHeavenGate", null);
__decorate([
    (0, common_1.Post)('bots/spawn'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "spawnBots", null);
__decorate([
    (0, common_1.Post)('bots/remove'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "removeBots", null);
__decorate([
    (0, common_1.Post)('shortcuts/players/return-all-to-default-spawn'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "returnAllPlayersToDefaultSpawn", null);
__decorate([
    (0, common_1.Post)('perf/network/reset'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "resetNetworkPerf", null);
__decorate([
    (0, common_1.Post)('perf/cpu/reset'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "resetCpuPerf", null);
__decorate([
    (0, common_1.Post)('perf/pathfinding/reset'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "resetPathfindingPerf", null);
__decorate([
    (0, common_1.Post)('players/:playerId/mail'),
    __param(0, (0, common_1.Param)('playerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "createDirectMail", null);
__decorate([
    (0, common_1.Post)('mail/broadcast'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "createBroadcastMail", null);
__decorate([
    (0, common_1.Get)('redeem-code-groups'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "getRedeemCodeGroups", null);
__decorate([
    (0, common_1.Post)('redeem-code-groups'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "createRedeemCodeGroup", null);
__decorate([
    (0, common_1.Get)('redeem-code-groups/:groupId'),
    __param(0, (0, common_1.Param)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "getRedeemCodeGroup", null);
__decorate([
    (0, common_1.Put)('redeem-code-groups/:groupId'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "updateRedeemCodeGroup", null);
__decorate([
    (0, common_1.Post)('redeem-code-groups/:groupId/codes'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "appendRedeemCodes", null);
__decorate([
    (0, common_1.Delete)('redeem-codes/:codeId'),
    __param(0, (0, common_1.Param)('codeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "destroyRedeemCode", null);
__decorate([
    (0, common_1.Get)('suggestions'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "getSuggestions", null);
__decorate([
    (0, common_1.Post)('suggestions/:id/complete'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "completeSuggestion", null);
__decorate([
    (0, common_1.Post)('suggestions/:id/replies'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "replySuggestion", null);
__decorate([
    (0, common_1.Delete)('suggestions/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NextGmController.prototype, "removeSuggestion", null);
__decorate([
    (0, common_1.Put)('maps/:mapId/tick'),
    __param(0, (0, common_1.Param)('mapId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "updateMapTick", null);
__decorate([
    (0, common_1.Put)('maps/:mapId/time'),
    __param(0, (0, common_1.Param)('mapId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "updateMapTime", null);
__decorate([
    (0, common_1.Post)('tick-config/reload'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "reloadTickConfig", null);
__decorate([
    (0, common_1.Delete)('world-observers/:viewerId'),
    __param(0, (0, common_1.Param)('viewerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], NextGmController.prototype, "clearWorldObservation", null);
exports.NextGmController = NextGmController = __decorate([
    (0, common_1.Controller)(next_gm_contract_1.NEXT_GM_HTTP_CONTRACT.gmBasePath),
    (0, common_1.UseGuards)(next_gm_auth_guard_1.NextGmAuthGuard),
    __metadata("design:paramtypes", [next_gm_world_service_1.NextGmWorldService,
        next_managed_account_service_1.NextManagedAccountService,
        next_gm_player_service_1.NextGmPlayerService,
        next_gm_mail_service_1.NextGmMailService,
        redeem_code_runtime_service_1.RedeemCodeRuntimeService])
], NextGmController);

