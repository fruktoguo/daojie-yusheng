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
    playerRuntimeService;
    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }
    processPendingRespawns(deps) {
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
    respawnPlayer(playerId, deps) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const previous = deps.playerLocations.get(playerId);
        const targetMapId = deps.resolveDefaultRespawnMapId();
        const targetInstance = deps.getOrCreatePublicInstance(targetMapId);
        if (previous) {
            deps.instances.get(previous.instanceId)?.disconnectPlayer(playerId);
        }
        const runtimePlayer = targetInstance.connectPlayer({
            playerId,
            sessionId: player.sessionId ?? previous?.sessionId ?? `session:${playerId}`,
            preferredX: targetInstance.template.spawnX,
            preferredY: targetInstance.template.spawnY,
        });
        targetInstance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
        deps.playerLocations.set(playerId, {
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
