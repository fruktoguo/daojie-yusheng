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
exports.WorldRuntimeSystemCommandService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_gm_queue_service_1 = require("./world-runtime-gm-queue.service");

const world_runtime_respawn_service_1 = require("./world-runtime-respawn.service");

/** world-runtime system-command orchestration：承接系统命令队列消费与分发。 */
let WorldRuntimeSystemCommandService = class WorldRuntimeSystemCommandService {
    worldRuntimeGmQueueService;
    worldRuntimeRespawnService;
    logger = new common_1.Logger(WorldRuntimeSystemCommandService.name);
    constructor(worldRuntimeGmQueueService, worldRuntimeRespawnService) {
        this.worldRuntimeGmQueueService = worldRuntimeGmQueueService;
        this.worldRuntimeRespawnService = worldRuntimeRespawnService;
    }
    dispatchPendingSystemCommands(deps) {
        if (this.worldRuntimeGmQueueService.getPendingSystemCommandCount() === 0) {
            return;
        }
        const commands = this.worldRuntimeGmQueueService.drainPendingSystemCommands();
        for (const command of commands) {
            try {
                this.dispatchSystemCommand(command, deps);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`处理系统指令 ${command.kind} 失败：${message}`);
            }
        }
    }
    dispatchSystemCommand(command, deps) {
        switch (command.kind) {
            case 'spawnMonsterLoot':
                deps.dispatchSpawnMonsterLoot(command.instanceId, command.x, command.y, command.monsterId, command.rolls);
                return;
            case 'damageMonster':
                deps.dispatchDamageMonster(command.instanceId, command.runtimeId, command.amount);
                return;
            case 'defeatMonster':
                deps.dispatchDefeatMonster(command.instanceId, command.runtimeId);
                return;
            case 'damagePlayer':
                deps.dispatchDamagePlayer(command.playerId, command.amount);
                return;
            case 'respawnPlayer':
                this.worldRuntimeRespawnService.respawnPlayer(command.playerId, deps);
                return;
            case 'resetPlayerSpawn':
                this.worldRuntimeRespawnService.respawnPlayer(command.playerId, deps);
                return;
            case 'gmUpdatePlayer':
                this.worldRuntimeGmQueueService.dispatchGmUpdatePlayer(command, {
                    playerRuntimeService: deps.playerRuntimeService,
                    resolveDefaultRespawnMapId: () => deps.resolveDefaultRespawnMapId(),
                    getOrCreatePublicInstance: (mapId) => deps.getOrCreatePublicInstance(mapId),
                    playerLocations: deps.playerLocations,
                    instances: deps.instances,
                    getPlayerViewOrThrow: (playerId) => deps.getPlayerViewOrThrow(playerId),
                    refreshPlayerContextActions: (playerId, view) => deps.refreshPlayerContextActions(playerId, view),
                    resolveCurrentTickForPlayerId: (playerId) => deps.resolveCurrentTickForPlayerId(playerId),
                });
                return;
            case 'gmResetPlayer':
                this.worldRuntimeRespawnService.respawnPlayer(command.playerId, deps);
                return;
            case 'gmSpawnBots':
                this.worldRuntimeGmQueueService.dispatchGmSpawnBots(command.anchorPlayerId, command.count, {
                    playerRuntimeService: deps.playerRuntimeService,
                    resolveDefaultRespawnMapId: () => deps.resolveDefaultRespawnMapId(),
                    connectPlayer: (input) => deps.connectPlayer(input),
                    getPlayerViewOrThrow: (playerId) => deps.getPlayerViewOrThrow(playerId),
                    refreshPlayerContextActions: (playerId, view) => deps.refreshPlayerContextActions(playerId, view),
                    resolveCurrentTickForPlayerId: (playerId) => deps.resolveCurrentTickForPlayerId(playerId),
                });
                return;
            case 'gmRemoveBots':
                this.worldRuntimeGmQueueService.dispatchGmRemoveBots(command.playerIds, command.all, {
                    playerRuntimeService: deps.playerRuntimeService,
                    removePlayer: (playerId) => deps.removePlayer(playerId),
                });
                return;
        }
    }
};
exports.WorldRuntimeSystemCommandService = WorldRuntimeSystemCommandService;
exports.WorldRuntimeSystemCommandService = WorldRuntimeSystemCommandService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_gm_queue_service_1.WorldRuntimeGmQueueService,
        world_runtime_respawn_service_1.WorldRuntimeRespawnService])
], WorldRuntimeSystemCommandService);
