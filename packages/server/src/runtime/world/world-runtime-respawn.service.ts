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
exports.WorldRuntimeRespawnService = void 0;

const common_1 = require("@nestjs/common");

const player_runtime_service_1 = require("../player/player-runtime.service");
const PRISON_MAP_ID = 'prison';

/** world-runtime respawn orchestration：承接复生队列消费与单人复生编排。 */
let WorldRuntimeRespawnService = class WorldRuntimeRespawnService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService) {
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
        const boundRespawnMapId = typeof player.respawnTemplateId === 'string' && player.respawnTemplateId.trim()
            ? player.respawnTemplateId.trim()
            : '';
        const targetMapId = previousMapId === PRISON_MAP_ID
            ? PRISON_MAP_ID
            : boundRespawnMapId || deps.resolveDefaultRespawnMapId();
        const targetInstance = deps.getOrCreatePublicInstance(targetMapId);
        if (previous) {
            previousInstance?.disconnectPlayer(playerId);
        }
        const runtimePlayer = targetInstance.connectPlayer({
            playerId,
            sessionId: player.sessionId ?? previous?.sessionId ?? `session:${playerId}`,
            preferredX: targetMapId === boundRespawnMapId && Number.isFinite(player.respawnX) ? player.respawnX : targetInstance.template.spawnX,
            preferredY: targetMapId === boundRespawnMapId && Number.isFinite(player.respawnY) ? player.respawnY : targetInstance.template.spawnY,
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
        deps.queuePlayerNotice(playerId, `已在 ${targetInstance.template.name} 复生`, 'travel');
    }
};
exports.WorldRuntimeRespawnService = WorldRuntimeRespawnService;
exports.WorldRuntimeRespawnService = WorldRuntimeRespawnService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeRespawnService);

export { WorldRuntimeRespawnService };
