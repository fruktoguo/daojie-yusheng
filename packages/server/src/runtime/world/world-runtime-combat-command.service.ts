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
exports.WorldRuntimeCombatCommandService = void 0;

const common_1 = require("@nestjs/common");
const world_runtime_basic_attack_service_1 = require("./world-runtime-basic-attack.service");
const world_runtime_player_skill_dispatch_service_1 = require("./world-runtime-player-skill-dispatch.service");
const world_runtime_battle_engage_service_1 = require("./world-runtime-battle-engage.service");

/** world-runtime combat-command orchestration：统一承接普攻、施法与接敌入口 facade。 */
let WorldRuntimeCombatCommandService = class WorldRuntimeCombatCommandService {
/**
 * worldRuntimeBasicAttackService：对象字段。
 */

    worldRuntimeBasicAttackService;    
    /**
 * worldRuntimePlayerSkillDispatchService：对象字段。
 */

    worldRuntimePlayerSkillDispatchService;    
    /**
 * worldRuntimeBattleEngageService：对象字段。
 */

    worldRuntimeBattleEngageService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeBasicAttackService 参数说明。
 * @param worldRuntimePlayerSkillDispatchService 参数说明。
 * @param worldRuntimeBattleEngageService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(worldRuntimeBasicAttackService, worldRuntimePlayerSkillDispatchService, worldRuntimeBattleEngageService) {
        this.worldRuntimeBasicAttackService = worldRuntimeBasicAttackService;
        this.worldRuntimePlayerSkillDispatchService = worldRuntimePlayerSkillDispatchService;
        this.worldRuntimeBattleEngageService = worldRuntimeBattleEngageService;
    }    
    /**
 * dispatchBasicAttack：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps) {
        this.worldRuntimeBasicAttackService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps);
    }    
    /**
 * dispatchCastSkill：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps) {
        this.worldRuntimePlayerSkillDispatchService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps);
    }    
    /**
 * resolveLegacySkillTargetRef：执行核心业务逻辑。
 * @param attacker 参数说明。
 * @param skill 参数说明。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    resolveLegacySkillTargetRef(attacker, skill, targetRef, deps) {
        return this.worldRuntimePlayerSkillDispatchService.resolveLegacySkillTargetRef(attacker, skill, targetRef, deps);
    }    
    /**
 * dispatchCastSkillToMonster：处理事件并驱动执行路径。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps) {
        this.worldRuntimePlayerSkillDispatchService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps);
    }    
    /**
 * dispatchCastSkillToTile：处理事件并驱动执行路径。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps) {
        this.worldRuntimePlayerSkillDispatchService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps);
    }    
    /**
 * dispatchEngageBattle：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param locked 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps) {
        this.worldRuntimeBattleEngageService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps);
    }
};
exports.WorldRuntimeCombatCommandService = WorldRuntimeCombatCommandService;
exports.WorldRuntimeCombatCommandService = WorldRuntimeCombatCommandService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_basic_attack_service_1.WorldRuntimeBasicAttackService,
        world_runtime_player_skill_dispatch_service_1.WorldRuntimePlayerSkillDispatchService,
        world_runtime_battle_engage_service_1.WorldRuntimeBattleEngageService])
], WorldRuntimeCombatCommandService);

export { WorldRuntimeCombatCommandService };
