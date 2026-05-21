/**
 * 玩家复生编排服务
 * 消费待复生队列，执行复生点解析、实例迁移、状态重置和通知
 */
import { Inject, Injectable } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import { buildPublicInstanceId } from './world-runtime.normalization.helpers';

const PRISON_MAP_ID = 'prison';

/** world-runtime respawn orchestration：承接复生队列消费与单人复生编排。 */
@Injectable()
export class WorldRuntimeRespawnService {
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
    private removeOfflineDefeatedPlayer(playerId: string, deps) {
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
        // 结算离线收益并移除运行时
        if (typeof this.playerRuntimeService.finalizeOfflineGainSessionForPlayer === 'function') {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (player) {
                void this.playerRuntimeService.finalizeOfflineGainSessionForPlayer(player);
            }
        }
        // 持久化 presence 标记为彻底离线
        if (this.playerRuntimeService.playerDomainPersistenceService?.isEnabled?.()) {
            const presence = this.playerRuntimeService.describePersistencePresence?.(playerId);
            if (presence) {
                void this.playerRuntimeService.playerDomainPersistenceService.savePlayerPresence(playerId, {
                    ...presence,
                    online: false,
                    inWorld: false,
                    offlineSinceAt: presence.offlineSinceAt ?? Date.now(),
                    versionSeed: Date.now(),
                });
            }
        }
        this.playerRuntimeService.removePlayerRuntime(playerId);
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
            return;
        }
        if (previous) {
            previousInstance?.disconnectPlayer(playerId);
        }
        const respawnPlacement = resolveRespawnPlacement(
            targetInstance.template,
            targetMapId === boundRespawnMapId ? player.respawnX : undefined,
            targetMapId === boundRespawnMapId ? player.respawnY : undefined,
        );
        const runtimePlayer = targetInstance.connectPlayer({
            playerId,
            sessionId: player.sessionId ?? previous?.sessionId ?? `session:${playerId}`,
            preferredX: respawnPlacement.x,
            preferredY: respawnPlacement.y,
        });
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
