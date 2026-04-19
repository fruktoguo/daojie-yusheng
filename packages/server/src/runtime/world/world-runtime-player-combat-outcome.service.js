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
exports.WorldRuntimePlayerCombatOutcomeService = void 0;

const common_1 = require("@nestjs/common");
const world_runtime_player_combat_service_1 = require("./world-runtime-player-combat.service");
const world_runtime_respawn_service_1 = require("./world-runtime-respawn.service");

/** world-runtime player-combat outcome orchestration：统一承接伤害结果、击杀奖励与复生入口 facade。 */
let WorldRuntimePlayerCombatOutcomeService = class WorldRuntimePlayerCombatOutcomeService {
    worldRuntimePlayerCombatService;
    worldRuntimeRespawnService;
    constructor(worldRuntimePlayerCombatService, worldRuntimeRespawnService) {
        this.worldRuntimePlayerCombatService = worldRuntimePlayerCombatService;
        this.worldRuntimeRespawnService = worldRuntimeRespawnService;
    }
    dispatchDamagePlayer(playerId, amount, deps) {
        this.worldRuntimePlayerCombatService.dispatchDamagePlayer(playerId, amount, deps);
    }
    handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
        this.worldRuntimePlayerCombatService.handlePlayerMonsterKill(instance, monster, killerPlayerId, deps);
    }
    handlePlayerDefeat(playerId, deps) {
        this.worldRuntimePlayerCombatService.handlePlayerDefeat(playerId, deps);
    }
    processPendingRespawns(deps) {
        this.worldRuntimeRespawnService.processPendingRespawns(deps);
    }
    respawnPlayer(playerId, deps) {
        this.worldRuntimeRespawnService.respawnPlayer(playerId, deps);
    }
};
exports.WorldRuntimePlayerCombatOutcomeService = WorldRuntimePlayerCombatOutcomeService;
exports.WorldRuntimePlayerCombatOutcomeService = WorldRuntimePlayerCombatOutcomeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_player_combat_service_1.WorldRuntimePlayerCombatService,
        world_runtime_respawn_service_1.WorldRuntimeRespawnService])
], WorldRuntimePlayerCombatOutcomeService);
