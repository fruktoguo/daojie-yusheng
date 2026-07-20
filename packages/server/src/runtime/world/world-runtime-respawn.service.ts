/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 玩家复生编排服务
 * 消费待复生队列，执行复生点解析、实例迁移、状态重置和通知
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { nextPlayerPersistenceVersion } from '../../persistence/player-domain-persistence.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import { buildPublicInstanceId } from './world-runtime.normalization.helpers';

const PRISON_MAP_ID = 'prison';
const OFFLINE_DEFEAT_CLEANUP_INITIAL_RETRY_MS = 250;
const OFFLINE_DEFEAT_CLEANUP_MAX_RETRY_MS = 30_000;

/** world-runtime respawn orchestration：承接复生队列消费与单人复生编排。 */
@Injectable()
export class WorldRuntimeRespawnService {
    private readonly logger = new Logger(WorldRuntimeRespawnService.name);
    private readonly offlineDefeatCleanupByPlayerId = new Map<string, Promise<void>>();
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
    }
    /**
 * processPendingRespawns：处理待处理重生并更新相关状态。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Pending重生相关状态。
 */

    processPendingRespawns(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!deps.worldRuntimeGmQueueService.hasPendingRespawns()) {
            return;
        }
        const pending = deps.worldRuntimeGmQueueService.drainPendingRespawnPlayerIds();
        for (const playerId of pending) {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || player.hp > 0) {
                continue;
            }
            // 离线挂机玩家被击杀后不 respawn，直接移出世界标记为彻底离线
            const isOffline = !player.sessionId || (typeof player.sessionId === 'string' && !player.sessionId.trim());
            if (isOffline) {
                this.removeOfflineDefeatedPlayer(playerId, deps);
                continue;
            }
            this.respawnPlayer(playerId, deps);
        }
    }

    /** 离线玩家被击杀后移出世界，标记为彻底离线。 */
    removeOfflineDefeatedPlayer(playerId: string, deps) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return Promise.resolve();
        }
        const previous = deps.getPlayerLocation(playerId);
        if (previous) {
            const previousInstance = deps.getInstanceRuntime(previous.instanceId);
            previousInstance?.disconnectPlayer(playerId);
        }
        deps.worldRuntimePlayerLocationService?.clearPlayerLocation?.(playerId);
        deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
        if (typeof deps.clearPendingCommand === 'function') {
            deps.clearPendingCommand(playerId);
        }
        deps.worldRuntimeGmQueueService?.clearPendingRespawn?.(playerId);
        return this.scheduleOfflineDefeatCleanup(playerId, player, deps);
    }
    /**
     * 离线战败先从世界层脱离，再在 tick 外完成结算和刷盘；只有全部成功才回收运行时。
     * 同一玩家只保留一个清理任务，数据库短暂失败时指数退避重试。
     */
    private scheduleOfflineDefeatCleanup(playerId: string, player, deps): Promise<void> {
        const existing = this.offlineDefeatCleanupByPlayerId.get(playerId);
        if (existing) {
            return existing;
        }
        const cleanup = this.persistAndRemoveOfflineDefeatedPlayer(playerId, player, deps)
            .catch((error) => {
                this.logger.error(
                    `离线战败清理异常终止 playerId=${playerId}`,
                    error instanceof Error ? error.stack : String(error),
                );
            })
            .finally(() => {
                if (this.offlineDefeatCleanupByPlayerId.get(playerId) === cleanup) {
                    this.offlineDefeatCleanupByPlayerId.delete(playerId);
                }
            });
        this.offlineDefeatCleanupByPlayerId.set(playerId, cleanup);
        return cleanup;
    }
    private async persistAndRemoveOfflineDefeatedPlayer(playerId: string, player, deps): Promise<void> {
        let attempt = 0;
        while (this.isOfflineDefeatCleanupCurrent(playerId, player, deps)) {
            try {
                if (typeof this.playerRuntimeService.finalizeOfflineGainSessionForPlayer === 'function') {
                    await this.playerRuntimeService.finalizeOfflineGainSessionForPlayer(player);
                }
                if (!this.isOfflineDefeatCleanupCurrent(playerId, player, deps)) {
                    return;
                }

                const persistence = this.playerRuntimeService.playerDomainPersistenceService;
                if (persistence?.isEnabled?.()) {
                    if (typeof deps.playerPersistenceFlushService?.flushPlayer !== 'function') {
                        throw new Error(`offline_defeat_flush_service_unavailable:${playerId}`);
                    }
                    await deps.playerPersistenceFlushService.flushPlayer(playerId);
                    if (!this.isOfflineDefeatCleanupCurrent(playerId, player, deps)) {
                        return;
                    }
                    const pendingDomains = player.dirtyDomains instanceof Set
                        ? Array.from(player.dirtyDomains).filter((domain) => domain !== 'presence')
                        : [];
                    if (pendingDomains.length > 0) {
                        throw new Error(`offline_defeat_flush_incomplete:${playerId}:${pendingDomains.join(',')}`);
                    }
                    const presence = this.playerRuntimeService.describePersistencePresence?.(playerId);
                    if (!presence || typeof persistence.savePlayerPresence !== 'function') {
                        throw new Error(`offline_defeat_presence_unavailable:${playerId}`);
                    }
                    await persistence.savePlayerPresence(playerId, {
                        ...presence,
                        online: false,
                        inWorld: false,
                        offlineSinceAt: presence.offlineSinceAt ?? Date.now(),
                        versionSeed: nextPlayerPersistenceVersion(),
                    });
                }
                if (!this.isOfflineDefeatCleanupCurrent(playerId, player, deps)) {
                    return;
                }
                this.playerRuntimeService.removePlayerRuntime(playerId);
                return;
            }
            catch (error) {
                if (isPlayerPresenceStaleFenceError(error)) {
                    this.logger.warn(`离线战败清理已被更新的玩家所有权取代 playerId=${playerId}`);
                    if (this.isOfflineDefeatCleanupCurrent(playerId, player, deps)) {
                        this.playerRuntimeService.removePlayerRuntime(playerId);
                    }
                    return;
                }
                attempt += 1;
                if (attempt === 1 || isPowerOfTwo(attempt)) {
                    this.logger.warn(
                        `离线战败持久化失败，等待重试 playerId=${playerId} attempt=${attempt} error=${error instanceof Error ? error.message : String(error)}`,
                    );
                }
                await waitForOfflineDefeatCleanupRetry(attempt);
            }
        }
    }
    private isOfflineDefeatCleanupCurrent(playerId: string, player, deps): boolean {
        if (this.playerRuntimeService.getPlayer(playerId) !== player) {
            return false;
        }
        if (typeof player.sessionId === 'string' && player.sessionId.trim()) {
            return false;
        }
        return !deps.getPlayerLocation?.(playerId);
    }
    /**
 * respawnPlayer：执行重生玩家相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新重生玩家相关状态。
 */

    respawnPlayer(playerId, deps, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const previous = deps.getPlayerLocation(playerId);
        const previousInstance = previous ? deps.getInstanceRuntime(previous.instanceId) : null;
        const previousMapId = previousInstance?.template?.id ?? player.templateId ?? '';
        if (typeof deps.clearPendingCommand === 'function') {
            deps.clearPendingCommand(playerId);
        }
        const boundRespawnMapId = typeof player.respawnTemplateId === 'string' && player.respawnTemplateId.trim()
            ? player.respawnTemplateId.trim()
            : '';
        const targetMapId = previousMapId === PRISON_MAP_ID
            ? PRISON_MAP_ID
            : boundRespawnMapId || deps.resolveDefaultRespawnMapId();
        const boundRespawnInstanceId = targetMapId === boundRespawnMapId && typeof player.respawnInstanceId === 'string' && player.respawnInstanceId.trim()
            ? player.respawnInstanceId.trim()
            : '';
        let targetInstance = resolveRespawnTargetInstance(deps, targetMapId, boundRespawnInstanceId);
        if (!targetInstance && targetMapId !== deps.resolveDefaultRespawnMapId()) {
            targetInstance = deps.getOrCreatePublicInstance(deps.resolveDefaultRespawnMapId());
        }
        if (!targetInstance) {
            deps.worldRuntimeGmQueueService?.markPendingRespawn?.(playerId);
            return;
        }
        const attachReady = resolveRespawnTargetAttachReady(targetInstance, deps);
        if (!attachReady.ok) {
            deps.worldRuntimeGmQueueService?.markPendingRespawn?.(playerId);
            return;
        }
        const respawnPlacement = resolveRespawnPlacement(
            targetInstance.template,
            targetMapId === boundRespawnMapId ? player.respawnX : undefined,
            targetMapId === boundRespawnMapId ? player.respawnY : undefined,
        );
        let runtimePlayer;
        try {
            runtimePlayer = targetInstance.connectPlayer({
                playerId,
                sessionId: player.sessionId ?? previous?.sessionId ?? `session:${playerId}`,
                preferredX: respawnPlacement.x,
                preferredY: respawnPlacement.y,
                relocateExisting: true,
            });
        } catch (error) {
            deps.worldRuntimeGmQueueService?.markPendingRespawn?.(playerId);
            return;
        }
        if (previous && previousInstance && previousInstance !== targetInstance) {
            previousInstance.disconnectPlayer(playerId);
        }
        targetInstance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
        deps.setPlayerLocation(playerId, {
            instanceId: targetInstance.meta.instanceId,
            sessionId: runtimePlayer.sessionId,
        });
        deps.worldRuntimeNavigationService.clearNavigationIntent(playerId);
        this.playerRuntimeService.respawnPlayer(playerId, {
            instanceId: targetInstance.meta.instanceId,
            templateId: targetInstance.template.id,
            x: runtimePlayer.x,
            y: runtimePlayer.y,
            facing: runtimePlayer.facing,
            currentTick: targetInstance.tick,
            buffClearMode: options?.buffClearMode ?? 'death',
        });
        const mapName = targetInstance.template.name;
        const n = buildStructuredNotice('travel', 'notice.respawn.revived', `已在 ${mapName} 复生`, {
            vars: { mapName },
            pills: [{ key: 'mapName', style: 'target' }],
        });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
    }
};

function resolveRespawnTargetInstance(deps, targetMapId, boundRespawnInstanceId) {
    if (boundRespawnInstanceId && boundRespawnInstanceId !== buildPublicInstanceId(targetMapId)) {
        const existing = deps.getInstanceRuntime?.(boundRespawnInstanceId) ?? null;
        if (existing) {
            return existing;
        }
        const sectInstance = deps.worldRuntimeSectService?.ensureSectRuntimeInstanceById?.(boundRespawnInstanceId, deps) ?? null;
        if (sectInstance) {
            return sectInstance;
        }
        return null;
    }
    return deps.getOrCreatePublicInstance(targetMapId);
}

function resolveRespawnTargetAttachReady(instance, deps) {
    const instanceId = typeof instance?.meta?.instanceId === 'string' ? instance.meta.instanceId.trim() : '';
    if (instanceId && typeof deps?.worldRuntimeService?.instanceReadyForPlayerAttach === 'function') {
        return deps.worldRuntimeService.instanceReadyForPlayerAttach(instanceId);
    }
    const runtimeStatus = typeof instance?.meta?.runtimeStatus === 'string' ? instance.meta.runtimeStatus.trim() : '';
    if (runtimeStatus === 'fenced') return { ok: false, reason: 'lease_fenced' };
    if (runtimeStatus === 'lease_degraded') return { ok: false, reason: 'lease_degraded' };
    if (runtimeStatus === 'template_missing') return { ok: false, reason: 'template_missing' };
    if (runtimeStatus === 'stopped') return { ok: false, reason: 'instance_stopped' };
    const status = typeof instance?.meta?.status === 'string' ? instance.meta.status.trim() : '';
    if (status === 'destroyed') return { ok: false, reason: 'instance_destroyed' };
    if (typeof deps?.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
        return { ok: false, reason: 'lease_not_local' };
    }
    return { ok: true, reason: 'ready' };
}
function resolveRespawnPlacement(template, inputX, inputY) {
    const spawnX = Number.isFinite(template?.spawnX) ? Math.trunc(template.spawnX) : 0;
    const spawnY = Number.isFinite(template?.spawnY) ? Math.trunc(template.spawnY) : 0;
    const x = Number.isFinite(inputX) ? Math.trunc(inputX) : spawnX;
    const y = Number.isFinite(inputY) ? Math.trunc(inputY) : spawnY;
    if (isWalkableTemplatePoint(template, x, y)) {
        return { x, y };
    }
    return { x: spawnX, y: spawnY };
}
function isWalkableTemplatePoint(template, x, y) {
    const width = Number.isFinite(template?.width) ? Math.trunc(template.width) : 0;
    const height = Number.isFinite(template?.height) ? Math.trunc(template.height) : 0;
    if (width <= 0 || height <= 0) {
        return true;
    }
    if (x < 0 || y < 0 || x >= width || y >= height) {
        return false;
    }
    const mask = template.walkableMask;
    if (!mask || typeof mask.length !== 'number') {
        return true;
    }
    return mask[(y * width) + x] === 1;
}

function isPlayerPresenceStaleFenceError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith('player_presence_stale_fence:');
}

function isPowerOfTwo(value: number): boolean {
    return value > 0 && (value & (value - 1)) === 0;
}

function waitForOfflineDefeatCleanupRetry(attempt: number): Promise<void> {
    const exponent = Math.max(0, Math.min(7, attempt - 1));
    const delayMs = Math.min(
        OFFLINE_DEFEAT_CLEANUP_MAX_RETRY_MS,
        OFFLINE_DEFEAT_CLEANUP_INITIAL_RETRY_MS * (2 ** exponent),
    );
    return new Promise((resolveRetry) => {
        const timer = setTimeout(resolveRetry, delayMs);
        timer.unref?.();
    });
}
