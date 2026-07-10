/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 会话回收器服务。
 * 定时轮询过期的断线会话，执行玩家数据 flush、路由清理和缓存释放。
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import { PlayerSessionRouteService } from '../persistence/player-session-route.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldSessionService, type WorldSessionBinding } from './world-session.service';
import { WorldSyncService } from './world-sync.service';

const SESSION_REAPER_INTERVAL_MS = 1000;
const RETAINED_RUNTIME_RECHECK_DELAY_MS = 60_000;
type DetachedRuntimeUnloadDisposition = 'unloaded' | 'retained' | 'absent';
interface RetainedRuntimeBinding {
    binding: WorldSessionBinding;
    nextCheckAt: number;
}
const WORLD_SESSION_REAPER_CONTRACT = Object.freeze({
    intervalMs: SESSION_REAPER_INTERVAL_MS,
    retryOnFlushFailure: true,
    clearLocalRouteAfterFlush: true,
    clearDetachedCachesAfterFlush: true,
    unloadIdleDetachedRuntimeAfterFlush: true,
    retainedRuntimeRecheckDelayMs: RETAINED_RUNTIME_RECHECK_DELAY_MS,
    preserveAssignedRouteDuringTransfer: true,
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
    /** 仍有离线任务的 detached runtime；任务结束后由 reaper 再次刷盘并卸载。 */
    private readonly retainedRuntimeBindings = new Map<string, RetainedRuntimeBinding>();
    /** 测试可收窄该间隔；生产默认一分钟，避免活跃离线任务每秒触发刷盘。 */
    private retainedRuntimeRecheckDelayMs = RETAINED_RUNTIME_RECHECK_DELAY_MS;
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
        this.retainedRuntimeBindings.clear();
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

            const expiredBindings = this.consumeBindingsReadyForReap();
            for (const { binding, retainedRuntimeRecheck } of expiredBindings) {
                try {
                    if (this.hasSupersedingBinding(binding)) {
                        this.discardRetainedBinding(binding.playerId);
                        continue;
                    }
                    if (retainedRuntimeRecheck && this.shouldKeepRetainedRuntime(binding.playerId)) {
                        this.deferRetainedRuntimeBinding(binding);
                        continue;
                    }
                    await this.playerPersistenceFlushService.flushPlayer(binding.playerId);
                    if (this.hasSupersedingBinding(binding)) {
                        // flush 会让出事件循环；重连可能在此期间完成，旧 binding 不得再清缓存、runtime 或 route。
                        this.discardRetainedBinding(binding.playerId);
                        continue;
                    }
                    const runtimePlayer = this.playerRuntimeService.getPlayer?.(binding.playerId) ?? null;
                    const routeSessionEpoch = resolveRouteSessionEpoch(binding, runtimePlayer);
                    this.worldSyncService.clearDetachedPlayerCaches(binding.playerId);
                    const unloadDisposition = this.unloadIdleDetachedRuntime(binding.playerId);
                    if (unloadDisposition === 'unloaded' || unloadDisposition === 'absent') {
                        this.retainedRuntimeBindings.delete(binding.playerId);
                        await this.playerSessionRouteService.clearLocalRoute(binding.playerId, routeSessionEpoch);
                    }
                    else {
                        this.deferRetainedRuntimeBinding(binding);
                    }
                    if (
                        unloadDisposition === 'retained'
                        && routeSessionEpoch
                        && !isRuntimeTransferInProgress(runtimePlayer)
                    ) {
                        // 仍有离线任务的运行态继续由本节点权威推进，route 与 owner 必须一起保留。
                        await this.playerSessionRouteService.registerLocalRoute({
                            playerId: binding.playerId,
                            sessionEpoch: routeSessionEpoch,
                            routeStatus: 'offline',
                        });
                    }
                    // 这一轮 flush 整链路完成，重置该玩家的 requeue 计数；下次失败从 1 重新累计。
                    this.resetBindingRetryCounter(binding.playerId);
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

    private consumeBindingsReadyForReap(): Array<{
        binding: WorldSessionBinding;
        retainedRuntimeRecheck: boolean;
    }> {
        const readyByPlayerId = new Map<string, {
            binding: WorldSessionBinding;
            retainedRuntimeRecheck: boolean;
        }>();
        for (const binding of this.worldSessionService.consumeExpiredBindings()) {
            readyByPlayerId.set(binding.playerId, { binding, retainedRuntimeRecheck: false });
            this.retainedRuntimeBindings.delete(binding.playerId);
        }
        const now = Date.now();
        for (const [playerId, retained] of this.retainedRuntimeBindings) {
            if (retained.nextCheckAt > now || readyByPlayerId.has(playerId)) {
                continue;
            }
            const currentBinding = this.worldSessionService.getBinding?.(playerId) ?? null;
            if (currentBinding) {
                // 玩家已重新连接或进入新的 detach 窗口，旧 binding 不得再参与路由清理。
                this.retainedRuntimeBindings.delete(playerId);
                continue;
            }
            this.retainedRuntimeBindings.delete(playerId);
            readyByPlayerId.set(playerId, {
                binding: retained.binding,
                retainedRuntimeRecheck: true,
            });
        }
        return Array.from(readyByPlayerId.values());
    }

    private shouldKeepRetainedRuntime(playerId: string): boolean {
        const player = this.playerRuntimeService.getPlayer?.(playerId) ?? null;
        if (!player) {
            return false;
        }
        if (typeof this.playerRuntimeService.canUnloadDetachedPlayerRuntime !== 'function') {
            return false;
        }
        return this.playerRuntimeService.canUnloadDetachedPlayerRuntime(playerId) !== true;
    }

    private hasSupersedingBinding(binding: WorldSessionBinding): boolean {
        // expired binding 入队时已从 active map 移除；此处任何当前 binding 都代表更新的连接代次。
        return (this.worldSessionService.getBinding?.(binding.playerId) ?? null) !== null;
    }

    private discardRetainedBinding(playerId: string): void {
        this.retainedRuntimeBindings.delete(playerId);
        this.resetBindingRetryCounter(playerId);
    }

    private resetBindingRetryCounter(playerId: string): void {
        if (typeof this.worldSessionService.resetExpiredBindingRetryCounter === 'function') {
            this.worldSessionService.resetExpiredBindingRetryCounter(playerId);
        }
    }

    private deferRetainedRuntimeBinding(binding: WorldSessionBinding): void {
        this.retainedRuntimeBindings.set(binding.playerId, {
            binding,
            nextCheckAt: Date.now() + this.retainedRuntimeRecheckDelayMs,
        });
    }

    private unloadIdleDetachedRuntime(playerId: string): DetachedRuntimeUnloadDisposition {
        const playerBeforeUnload = this.playerRuntimeService.getPlayer?.(playerId) ?? null;
        if (!playerBeforeUnload) {
            return 'absent';
        }
        if (typeof this.worldSyncService?.unloadDetachedPlayerRuntime !== 'function') {
            throw new Error(`detached_runtime_unload_capability_missing:${playerId}`);
        }
        try {
            const unloaded = this.worldSyncService.unloadDetachedPlayerRuntime(playerId, {
                allowOfflineHangingDemotion: true,
                reason: 'session_reaped',
            }) === true;
            if (unloaded) {
                return 'unloaded';
            }
            return this.playerRuntimeService.getPlayer?.(playerId) ? 'retained' : 'absent';
        }
        catch (error) {
            throw new Error(
                `detached_runtime_unload_failed:${playerId}`,
                { cause: error },
            );
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

function isRuntimeTransferInProgress(player: unknown): boolean {
    if (!player || typeof player !== 'object') {
        return false;
    }
    const runtimePlayer = player as { transferState?: unknown; transferTargetNodeId?: unknown };
    return runtimePlayer.transferState === 'in_transfer'
        || (typeof runtimePlayer.transferTargetNodeId === 'string' && runtimePlayer.transferTargetNodeId.trim().length > 0);
}
