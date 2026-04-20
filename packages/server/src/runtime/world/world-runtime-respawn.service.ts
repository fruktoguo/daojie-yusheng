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

/** world-runtime respawn orchestration：承接复生队列消费与单人复生编排。 */
let WorldRuntimeRespawnService = class WorldRuntimeRespawnService {
/**
 * playerRuntimeService：对象字段。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * processPendingRespawns：处理事件并驱动执行路径。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
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
 * respawnPlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    respawnPlayer(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const previous = deps.getPlayerLocation(playerId);
        const targetMapId = deps.resolveDefaultRespawnMapId();
        const targetInstance = deps.getOrCreatePublicInstance(targetMapId);
        if (previous) {
            deps.getInstanceRuntime(previous.instanceId)?.disconnectPlayer(playerId);
        }
        const runtimePlayer = targetInstance.connectPlayer({
            playerId,
            sessionId: player.sessionId ?? previous?.sessionId ?? `session:${playerId}`,
            preferredX: targetInstance.template.spawnX,
            preferredY: targetInstance.template.spawnY,
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
