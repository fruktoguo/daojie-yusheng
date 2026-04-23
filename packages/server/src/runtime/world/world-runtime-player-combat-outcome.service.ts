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
exports.WorldRuntimePlayerCombatOutcomeService = void 0;

const common_1 = require("@nestjs/common");
const world_runtime_player_combat_service_1 = require("./world-runtime-player-combat.service");
const world_runtime_respawn_service_1 = require("./world-runtime-respawn.service");

/** world-runtime player-combat outcome orchestration：统一承接伤害结果、击杀奖励与复生入口 facade。 */
let WorldRuntimePlayerCombatOutcomeService = class WorldRuntimePlayerCombatOutcomeService {
/**
 * worldRuntimePlayerCombatService：世界运行态玩家战斗服务引用。
 */

    worldRuntimePlayerCombatService;    
    /**
 * worldRuntimeRespawnService：世界运行态重生服务引用。
 */

    worldRuntimeRespawnService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimePlayerCombatService 参数说明。
 * @param worldRuntimeRespawnService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimePlayerCombatService, worldRuntimeRespawnService) {
        this.worldRuntimePlayerCombatService = worldRuntimePlayerCombatService;
        this.worldRuntimeRespawnService = worldRuntimeRespawnService;
    }    
    /**
 * dispatchDamagePlayer：判断Damage玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

    dispatchDamagePlayer(playerId, amount, deps) {
        this.worldRuntimePlayerCombatService.dispatchDamagePlayer(playerId, amount, deps);
    }    
    /**
 * handlePlayerMonsterKill：处理玩家怪物Kill并更新相关状态。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家怪物Kill相关状态。
 */

    async handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
        return this.worldRuntimePlayerCombatService.handlePlayerMonsterKill(instance, monster, killerPlayerId, deps);
    }    
    /**
 * handlePlayerDefeat：处理玩家Defeat并更新相关状态。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家Defeat相关状态。
 */

    async handlePlayerDefeat(playerId, deps, killerPlayerId = null) {
        return this.worldRuntimePlayerCombatService.handlePlayerDefeat(playerId, deps, killerPlayerId);
    }    
    /**
 * processPendingRespawns：处理待处理重生并更新相关状态。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Pending重生相关状态。
 */

    processPendingRespawns(deps) {
        this.worldRuntimeRespawnService.processPendingRespawns(deps);
    }    
    /**
 * respawnPlayer：执行重生玩家相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新重生玩家相关状态。
 */

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

export { WorldRuntimePlayerCombatOutcomeService };
