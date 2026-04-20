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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSyncService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_service_1 = require("../runtime/world/world-runtime.service");

const player_runtime_service_1 = require("../runtime/player/player-runtime.service");

const world_sync_quest_loot_service_1 = require("./world-sync-quest-loot.service");
const world_sync_protocol_service_1 = require("./world-sync-protocol.service");
const world_sync_aux_state_service_1 = require("./world-sync-aux-state.service");
const world_sync_envelope_service_1 = require("./world-sync-envelope.service");

const world_session_service_1 = require("./world-session.service");
/** 世界同步服务：把 runtime 视图投影成 next 协议增量包并维护同步缓存。 */
let WorldSyncService = class WorldSyncService {
    /** 世界 runtime，用于读取当前玩家视图和上下文动作。 */
    worldRuntimeService;
    /** 玩家 runtime，用于同步玩家对象与任务/背包状态。 */
    playerRuntimeService;
    /** 会话管理入口，用于取在线 socket。 */
    worldSessionService;
    /** quest / loot 冷路径同步服务。 */
    worldSyncQuestLootService;
    /** 协议下发辅助服务。 */
    worldSyncProtocolService;
    /** next 侧首包/增量附加状态编排服务。 */
    worldSyncAuxStateService;
    /** next 主 envelope 编排服务。 */
    worldSyncEnvelopeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param worldSessionService 参数说明。
 * @param worldSyncQuestLootService 参数说明。
 * @param worldSyncProtocolService 参数说明。
 * @param worldSyncAuxStateService 参数说明。
 * @param worldSyncEnvelopeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimeService, playerRuntimeService, worldSessionService, worldSyncQuestLootService, worldSyncProtocolService, worldSyncAuxStateService, worldSyncEnvelopeService) {
        this.worldRuntimeService = worldRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncQuestLootService = worldSyncQuestLootService;
        this.worldSyncProtocolService = worldSyncProtocolService;
        this.worldSyncAuxStateService = worldSyncAuxStateService;
        this.worldSyncEnvelopeService = worldSyncEnvelopeService;
    }
    /** 发送玩家的初始同步包。 */
    emitInitialSync(playerId, socketOverride = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) {
            return;
        }

        const socket = socketOverride ?? this.worldSessionService.getSocketByPlayerId(playerId);

        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) {
            return;
        }
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);

        const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);

        const envelope = this.worldSyncEnvelopeService.createInitialEnvelope(playerId, binding, view, player);
        this.emitNextEnvelope(socket, envelope);
        this.emitNextInitialSync(binding.playerId, socket, view, player);
        this.worldSyncQuestLootService.emitQuestSync(socket, binding.playerId, player.quests.revision);
        this.emitPendingNotices(binding.playerId, socket);
    }
    /** 遍历所有在线玩家并刷新增量同步。 */
    flushConnectedPlayers() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.clearPurgedPlayerCaches();
        for (const binding of this.worldSessionService.listBindings()) {
            const socket = this.worldSessionService.getSocketByPlayerId(binding.playerId);
            const view = this.worldRuntimeService.getPlayerView(binding.playerId);
            if (!socket || !view) {
                continue;
            }
            this.worldRuntimeService.refreshPlayerContextActions(binding.playerId, view);

            const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);

            const envelope = this.worldSyncEnvelopeService.createDeltaEnvelope(binding.playerId, view, player);
            this.emitNextEnvelope(socket, envelope);
            this.emitNextDeltaSync(binding.playerId, socket, view, player);

            this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, binding.playerId, player.quests.revision);
            this.emitPendingNotices(binding.playerId, socket);
        }
    }
    /** 统一发送 next 协议封装包。 */
    emitNextEnvelope(socket, envelope) {
        this.worldSyncProtocolService.sendNextEnvelope(socket, envelope);
    }
    /** 清理断线玩家的同步缓存。 */
    clearDetachedPlayerCaches(playerId) {
        this.clearPlayerCaches(playerId, true);
    }
    /** 清理已 purge 玩家遗留的同步缓存。 */
    clearPurgedPlayerCaches() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const purgedPlayerIds = this.worldSessionService.consumePurgedPlayerIds();
        for (const playerId of purgedPlayerIds) {
            this.clearPlayerCaches(playerId, false);
        }
    }
    /** 清理单个玩家的同步缓存，并按需脱离 runtime session。 */
    clearPlayerCaches(playerId, detachRuntimeSession) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.worldSyncEnvelopeService.clearPlayerCache(playerId);
        if (detachRuntimeSession) {
            this.playerRuntimeService.detachSession(playerId);
        }
        this.worldSyncQuestLootService.clearPlayerCache(playerId);
        this.worldSyncAuxStateService.clearPlayerCache(playerId);
    }    
    /**
 * emitLootWindowUpdate：处理掉落窗口Update并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新掉落窗口Update相关状态。
 */

    emitLootWindowUpdate(playerId) {
        this.worldSyncQuestLootService.emitLootWindowUpdate(playerId);
    }    
    /**
 * openLootWindow：执行open掉落窗口相关逻辑。
 * @param playerId 玩家 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 无返回值，直接更新open掉落窗口相关状态。
 */

    openLootWindow(playerId, x, y) {
        return this.worldSyncQuestLootService.openLootWindow(playerId, x, y);
    }    
    /**
 * emitNextInitialSync：处理NextInitial同步并更新相关状态。
 * @param playerId 玩家 ID。
 * @param socket 参数说明。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新NextInitialSync相关状态。
 */

    emitNextInitialSync(playerId, socket, view, player) {
        this.worldSyncAuxStateService.emitNextInitialSync(playerId, socket, view, player);
    }    
    /**
 * emitNextDeltaSync：处理Next增量同步并更新相关状态。
 * @param playerId 玩家 ID。
 * @param socket 参数说明。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新NextDeltaSync相关状态。
 */

    emitNextDeltaSync(playerId, socket, view, player) {
        this.worldSyncAuxStateService.emitNextDeltaSync(playerId, socket, view, player);
    }    
    /**
 * emitPendingNotices：处理待处理Notice并更新相关状态。
 * @param playerId 玩家 ID。
 * @param socket 参数说明。
 * @returns 无返回值，直接更新PendingNotice相关状态。
 */

    emitPendingNotices(playerId, socket) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const items = this.playerRuntimeService.drainNotices(playerId);
        if (items.length === 0) {
            return;
        }
        this.worldSyncProtocolService.sendNotices(socket, items);
    }
};
exports.WorldSyncService = WorldSyncService;
exports.WorldSyncService = WorldSyncService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_runtime_service_1.WorldRuntimeService))),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_quest_loot_service_1.WorldSyncQuestLootService,
        world_sync_protocol_service_1.WorldSyncProtocolService,
        world_sync_aux_state_service_1.WorldSyncAuxStateService,
        world_sync_envelope_service_1.WorldSyncEnvelopeService])
], WorldSyncService);

export { WorldSyncService };
