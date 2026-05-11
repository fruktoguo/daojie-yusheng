/**
 * 任务与拾取窗口同步服务。
 * 承接任务 revision 变化检测与拾取窗口的打开、刷新和下发。
 */

import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldSessionService } from './world-session.service';
import { WorldSyncProtocolService } from './world-sync-protocol.service';

/** quest / loot 冷路径同步服务：承接任务 revision 与拾取窗口缓存和下发。 */
@Injectable()
export class WorldSyncQuestLootService {
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

    constructor(
        @Inject(forwardRef(() => WorldRuntimeService)) worldRuntimeService: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(WorldSessionService) worldSessionService: any,
        @Inject(WorldSyncProtocolService) worldSyncProtocolService: any,
    ) {
        this.worldRuntimeService = worldRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncProtocolService = worldSyncProtocolService;
    }
    /** 下发任务同步，并记录最新 revision。 */
    emitQuestSync(socket, playerId, revision) {

        const payload = {
            quests: this.playerRuntimeService.listQuests(playerId).map((entry) => toQuestRuntimeState(entry)),
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

function toQuestRuntimeState(source) {
    return {
        id: source.id,
        status: source.status,
        progress: Math.max(0, Math.trunc(Number(source.progress ?? 0))),
    };
}
