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
exports.WorldSyncQuestLootService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_service_1 = require("../runtime/world/world-runtime.service");

const player_runtime_service_1 = require("../runtime/player/player-runtime.service");

const world_session_service_1 = require("./world-session.service");

const world_sync_protocol_service_1 = require("./world-sync-protocol.service");

/** quest / loot 冷路径同步服务：承接任务 revision 与拾取窗口缓存和下发。 */
let WorldSyncQuestLootService = class WorldSyncQuestLootService {
    /** 世界 runtime，用于构造拾取窗口同步状态。 */
    worldRuntimeService;
    /** 玩家 runtime，用于读取任务列表与 loot target。 */
    playerRuntimeService;
    /** 会话管理入口，用于取在线 socket。 */
    worldSessionService;
    /** 协议下发辅助服务。 */
    worldSyncProtocolService;
    /** 每个玩家最近一次任务 revision。 */
    lastQuestRevisionByPlayerId = new Map();
    /** 每个玩家的拾取窗口缓存。 */
    lootWindowByPlayerId = new Map();    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param worldSessionService 参数说明。
 * @param worldSyncProtocolService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimeService, playerRuntimeService, worldSessionService, worldSyncProtocolService) {
        this.worldRuntimeService = worldRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncProtocolService = worldSyncProtocolService;
    }
    /** 下发任务同步，并记录最新 revision。 */
    emitQuestSync(socket, playerId, revision) {

        const payload = {
            quests: this.playerRuntimeService.listQuests(playerId),
        };
        this.worldSyncProtocolService.sendQuestSync(socket, payload);
        this.lastQuestRevisionByPlayerId.set(playerId, revision);
    }
    /** revision 变化时才下发任务同步。 */
    emitQuestSyncIfChanged(socket, playerId, revision) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const lastQuestRevision = this.lastQuestRevisionByPlayerId.get(playerId) ?? 0;
        if (lastQuestRevision === revision) {
            return;
        }
        this.emitQuestSync(socket, playerId, revision);
    }
    /** 打开或刷新拾取窗口。 */
    openLootWindow(playerId, x, y) {
        this.lootWindowByPlayerId.set(playerId, {
            tileX: Math.trunc(x),
            tileY: Math.trunc(y),
        });
        this.playerRuntimeService.openLootWindow(playerId, Math.trunc(x), Math.trunc(y));
        return {
            window: this.buildLootWindowSyncState(playerId),
        };
    }
    /** 给在线玩家主动补发一次拾取窗口。 */
    emitLootWindowUpdate(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const socket = this.worldSessionService.getSocketByPlayerId(playerId);
        if (!socket) {
            return;
        }
        this.worldSyncProtocolService.sendLootWindow(socket, {
            window: this.buildLootWindowSyncState(playerId),
        });
    }
    /** 构造当前玩家的拾取窗口状态。 */
    buildLootWindowSyncState(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            this.lootWindowByPlayerId.delete(playerId);
            return null;
        }

        const target = this.playerRuntimeService.getLootWindowTarget(playerId) ?? this.lootWindowByPlayerId.get(playerId);
        if (!target) {
            return null;
        }

        const lootWindow = this.worldRuntimeService.buildLootWindowSyncState(playerId, target.tileX, target.tileY);
        if (!lootWindow) {
            this.playerRuntimeService.clearLootWindow(playerId);
            this.lootWindowByPlayerId.delete(playerId);
            return null;
        }
        return lootWindow;
    }
    /** 清理指定玩家的 quest / loot 同步缓存。 */
    clearPlayerCache(playerId) {
        this.lastQuestRevisionByPlayerId.delete(playerId);
        this.lootWindowByPlayerId.delete(playerId);
    }
};
exports.WorldSyncQuestLootService = WorldSyncQuestLootService;
exports.WorldSyncQuestLootService = WorldSyncQuestLootService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_runtime_service_1.WorldRuntimeService))),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_protocol_service_1.WorldSyncProtocolService])
], WorldSyncQuestLootService);

export { WorldSyncQuestLootService };
