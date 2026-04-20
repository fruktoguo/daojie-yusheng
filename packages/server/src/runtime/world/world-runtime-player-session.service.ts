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
exports.WorldRuntimePlayerSessionService = void 0;

const common_1 = require("@nestjs/common");
const world_runtime_world_access_service_1 = require("./world-runtime-world-access.service");

/** world-runtime player-session seam：承接玩家接入、断开与 runtime 注销。 */
let WorldRuntimePlayerSessionService = class WorldRuntimePlayerSessionService {
/**
 * worldRuntimeWorldAccessService：对象字段。
 */

    worldRuntimeWorldAccessService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeWorldAccessService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(worldRuntimeWorldAccessService) {
        this.worldRuntimeWorldAccessService = worldRuntimeWorldAccessService;
    }    
    /**
 * connectPlayer：执行核心业务逻辑。
 * @param input 输入参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    connectPlayer(input, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = input.playerId.trim();
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        const mapId = input.mapId?.trim() || this.worldRuntimeWorldAccessService.resolveDefaultRespawnMapId(deps);
        if (!mapId) {
            throw new common_1.NotFoundException('No map template available');
        }
        const sessionId = input.sessionId?.trim() || `session:${playerId}`;
        const targetInstance = this.worldRuntimeWorldAccessService.getOrCreatePublicInstance(mapId, deps);
        const previous = deps.getPlayerLocation(playerId);
        if (previous && previous.instanceId !== targetInstance.meta.instanceId) {
            deps.getInstanceRuntime(previous.instanceId)?.disconnectPlayer(playerId);
        }
        const runtimePlayer = targetInstance.connectPlayer({
            playerId,
            sessionId,
            preferredX: input.preferredX,
            preferredY: input.preferredY,
        });
        const playerState = deps.playerRuntimeService.ensurePlayer(playerId, sessionId);
        targetInstance.setPlayerMoveSpeed(playerId, playerState.attrs.numericStats.moveSpeed);
        deps.setPlayerLocation(playerId, {
            instanceId: targetInstance.meta.instanceId,
            sessionId: runtimePlayer.sessionId,
        });
        deps.worldRuntimeGmQueueService.clearPendingRespawn(playerId);
        deps.logger.debug(`玩家 ${playerId} 已附着到实例 ${targetInstance.meta.instanceId}`);
        return this.worldRuntimeWorldAccessService.getPlayerViewOrThrow(playerId, deps);
    }    
    /**
 * disconnectPlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    disconnectPlayer(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocation(playerId);
        if (!location) {
            return false;
        }
        deps.worldRuntimeNavigationService.clearNavigationIntent(playerId);
        deps.clearPendingCommand(playerId);
        deps.worldRuntimeGmQueueService.clearPendingRespawn(playerId);
        const disconnected = deps.getInstanceRuntime(location.instanceId)?.disconnectPlayer(playerId) ?? false;
        deps.clearPlayerLocation(playerId);
        return disconnected;
    }    
    /**
 * removePlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param reason 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    removePlayer(playerId, reason = 'removed', deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return false;
        }
        deps.worldSessionService.purgePlayerSession(normalizedPlayerId, reason);
        deps.worldRuntimeNavigationService.clearNavigationIntent(normalizedPlayerId);
        deps.clearPendingCommand(normalizedPlayerId);
        deps.worldRuntimeGmQueueService.clearPendingRespawn(normalizedPlayerId);
        const disconnected = this.disconnectPlayer(normalizedPlayerId, deps);
        const runtimePlayer = deps.playerRuntimeService.getPlayer(normalizedPlayerId);
        if (!runtimePlayer) {
            return disconnected;
        }
        deps.playerRuntimeService.removePlayerRuntime(normalizedPlayerId);
        return true;
    }
};
exports.WorldRuntimePlayerSessionService = WorldRuntimePlayerSessionService;
exports.WorldRuntimePlayerSessionService = WorldRuntimePlayerSessionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_world_access_service_1.WorldRuntimeWorldAccessService])
], WorldRuntimePlayerSessionService);

export { WorldRuntimePlayerSessionService };
