/**
 * 会话回收器服务。
 * 定时轮询过期的断线会话，执行玩家数据 flush、路由清理和缓存释放。
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import { PlayerSessionRouteService } from '../persistence/player-session-route.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldSessionService } from './world-session.service';
import { WorldSyncService } from './world-sync.service';

const SESSION_REAPER_INTERVAL_MS = 1000;
const WORLD_SESSION_REAPER_CONTRACT = Object.freeze({
    intervalMs: SESSION_REAPER_INTERVAL_MS,
    retryOnFlushFailure: true,
    clearLocalRouteAfterFlush: true,
    clearDetachedCachesAfterFlush: true,
    unloadIdleDetachedRuntimeAfterFlush: true,
});

@Injectable()
export class WorldSessionReaperService {
/**
 * worldSessionService：世界Session服务引用。
 */

    worldSessionService;
    /**
 * worldSyncService：世界Sync服务引用。
 */

    worldSyncService;
    /**
 * playerPersistenceFlushService：玩家PersistenceFlush服务引用。
 */

    playerPersistenceFlushService;
    /**
 * playerSessionRouteService：玩家SessionRoute服务引用。
 */

    playerSessionRouteService;
    /**
 * playerRuntimeService：玩家Runtime服务引用。
 */

    playerRuntimeService;
    /**
 * logger：日志器引用。
 */

    logger = new Logger(WorldSessionReaperService.name);
    /**
 * timer：timer相关字段。
 */

    timer = null;
    /**
 * running：running相关字段。
 */

    running = false;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldSessionService 参数说明。
 * @param worldSyncService 参数说明。
 * @param playerPersistenceFlushService 参数说明。
 * @param playerSessionRouteService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(WorldSessionService) worldSessionService: any,
        @Inject(WorldSyncService) worldSyncService: any,
        @Inject(PlayerPersistenceFlushService) playerPersistenceFlushService: any,
        @Inject(PlayerSessionRouteService) playerSessionRouteService: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.playerSessionRouteService = playerSessionRouteService;
        this.playerRuntimeService = playerRuntimeService;
    }
    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    onModuleInit() {
        this.timer = setInterval(() => {
            void this.reapExpiredSessions();
        }, SESSION_REAPER_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`会话回收器已启动，间隔 ${SESSION_REAPER_INTERVAL_MS}ms`);
    }
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    /**
 * reapExpiredSessions：执行reapExpiredSession相关逻辑。
 * @returns 无返回值，直接更新reapExpiredSession相关状态。
 */

    async reapExpiredSessions() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.running) {
            return;
        }
        this.running = true;
        try {

            const expiredBindings = this.worldSessionService.consumeExpiredBindings();
            for (const binding of expiredBindings) {
                try {
                    await this.playerPersistenceFlushService.flushPlayer(binding.playerId);
                    const routeSessionEpoch = resolveRouteSessionEpoch(binding, this.playerRuntimeService.getPlayer?.(binding.playerId));
                    await this.playerSessionRouteService.clearLocalRoute(binding.playerId, routeSessionEpoch);
                    this.worldSyncService.clearDetachedPlayerCaches(binding.playerId);
                    this.unloadIdleDetachedRuntime(binding.playerId);
                    // 这一轮 flush 整链路完成，重置该玩家的 requeue 计数；下次失败从 1 重新累计。
                    if (typeof this.worldSessionService.resetExpiredBindingRetryCounter === 'function') {
                        this.worldSessionService.resetExpiredBindingRetryCounter(binding.playerId);
                    }
                }
                catch (error) {
                    const requeued = this.worldSessionService.requeueExpiredBinding(binding, { lastError: error });
                    if (requeued) {
                        this.logger.error(`回收玩家 ${binding.playerId} 的会话失败，已重入等待下次重试`, error instanceof Error ? error.stack : String(error));
                    }
                    else {
                        this.logger.error(`回收玩家 ${binding.playerId} 的会话连续失败超过上限，已转入死信队列`, error instanceof Error ? error.stack : String(error));
                    }
                }
            }
        }
        catch (error) {
            this.logger.error('会话回收执行失败', error instanceof Error ? error.stack : String(error));
        }
        finally {
            this.running = false;
        }
    }

    private unloadIdleDetachedRuntime(playerId: string): void {
        if (typeof this.worldSyncService?.unloadDetachedPlayerRuntime !== 'function') {
            return;
        }
        try {
            this.worldSyncService.unloadDetachedPlayerRuntime(playerId, {
                allowOfflineHangingDemotion: true,
                reason: 'session_reaped',
            });
        }
        catch (error) {
            this.logger.warn(`卸载 detached 玩家运行态失败：${playerId}`, error instanceof Error ? error.stack : String(error));
        }
    }
}
export { WORLD_SESSION_REAPER_CONTRACT };

function resolveRouteSessionEpoch(binding, player) {
    const sessionEpoch = Number(player?.sessionEpoch ?? binding?.sessionEpoch ?? 0);
    if (!Number.isFinite(sessionEpoch) || sessionEpoch <= 0) {
        return undefined;
    }
    return Math.max(1, Math.trunc(sessionEpoch));
}
