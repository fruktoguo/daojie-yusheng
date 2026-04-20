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
exports.WorldRuntimeGmSystemCommandService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_gm_queue_service_1 = require("./world-runtime-gm-queue.service");
const world_runtime_player_combat_outcome_service_1 = require("./world-runtime-player-combat-outcome.service");

/** world-runtime gm-system-command seam：承接 GM system-command 分发与依赖收口。 */
let WorldRuntimeGmSystemCommandService = class WorldRuntimeGmSystemCommandService {
/**
 * worldRuntimeGmQueueService：对象字段。
 */

    worldRuntimeGmQueueService;    
    /**
 * worldRuntimePlayerCombatOutcomeService：对象字段。
 */

    worldRuntimePlayerCombatOutcomeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeGmQueueService 参数说明。
 * @param worldRuntimePlayerCombatOutcomeService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(worldRuntimeGmQueueService, worldRuntimePlayerCombatOutcomeService) {
        this.worldRuntimeGmQueueService = worldRuntimeGmQueueService;
        this.worldRuntimePlayerCombatOutcomeService = worldRuntimePlayerCombatOutcomeService;
    }    
    /**
 * dispatchGmSystemCommand：处理事件并驱动执行路径。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchGmSystemCommand(command, deps) {
        switch (command.kind) {
            case 'gmUpdatePlayer':
                this.worldRuntimeGmQueueService.dispatchGmUpdatePlayer(command, {
                    playerRuntimeService: deps.playerRuntimeService,
                    resolveDefaultRespawnMapId: () => deps.resolveDefaultRespawnMapId(),
                    getOrCreatePublicInstance: (mapId) => deps.getOrCreatePublicInstance(mapId),
                    getPlayerLocation: (playerId) => deps.getPlayerLocation(playerId),
                    setPlayerLocation: (playerId, location) => deps.setPlayerLocation(playerId, location),
                    getInstanceRuntime: (instanceId) => deps.getInstanceRuntime(instanceId),
                    getPlayerViewOrThrow: (playerId) => deps.getPlayerViewOrThrow(playerId),
                    refreshPlayerContextActions: (playerId, view) => deps.refreshPlayerContextActions(playerId, view),
                    resolveCurrentTickForPlayerId: (playerId) => deps.resolveCurrentTickForPlayerId(playerId),
                });
                return true;
            case 'gmResetPlayer':
                this.worldRuntimePlayerCombatOutcomeService.respawnPlayer(command.playerId, deps);
                return true;
            case 'gmSpawnBots':
                this.worldRuntimeGmQueueService.dispatchGmSpawnBots(command.anchorPlayerId, command.count, {
                    playerRuntimeService: deps.playerRuntimeService,
                    resolveDefaultRespawnMapId: () => deps.resolveDefaultRespawnMapId(),
                    connectPlayer: (input) => deps.connectPlayer(input),
                    getPlayerViewOrThrow: (playerId) => deps.getPlayerViewOrThrow(playerId),
                    refreshPlayerContextActions: (playerId, view) => deps.refreshPlayerContextActions(playerId, view),
                    resolveCurrentTickForPlayerId: (playerId) => deps.resolveCurrentTickForPlayerId(playerId),
                });
                return true;
            case 'gmRemoveBots':
                this.worldRuntimeGmQueueService.dispatchGmRemoveBots(command.playerIds, command.all, {
                    playerRuntimeService: deps.playerRuntimeService,
                    removePlayer: (playerId) => deps.removePlayer(playerId),
                });
                return true;
            default:
                return false;
        }
    }
};
exports.WorldRuntimeGmSystemCommandService = WorldRuntimeGmSystemCommandService;
exports.WorldRuntimeGmSystemCommandService = WorldRuntimeGmSystemCommandService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_gm_queue_service_1.WorldRuntimeGmQueueService,
        world_runtime_player_combat_outcome_service_1.WorldRuntimePlayerCombatOutcomeService])
], WorldRuntimeGmSystemCommandService);

export { WorldRuntimeGmSystemCommandService };
