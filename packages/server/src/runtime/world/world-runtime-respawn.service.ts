/**
 * 玩家复生编排服务
 * 消费待复生队列，执行复生点解析、实例迁移、状态重置和通知
 */
import { Inject, Injectable } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';

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
            this.respawnPlayer(playerId, deps);
        }
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
        let targetInstance = deps.getOrCreatePublicInstance(targetMapId);
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
