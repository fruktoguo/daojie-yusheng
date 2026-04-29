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
 * worldRuntimeBasicAttackService：世界运行态BasicAttack服务引用。
 */

    worldRuntimeBasicAttackService;    
    /**
 * worldRuntimePlayerSkillDispatchService：世界运行态玩家技能Dispatch服务引用。
 */

    worldRuntimePlayerSkillDispatchService;    
    /**
 * worldRuntimeBattleEngageService：世界运行态BattleEngage服务引用。
 */

    worldRuntimeBattleEngageService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeBasicAttackService 参数说明。
 * @param worldRuntimePlayerSkillDispatchService 参数说明。
 * @param worldRuntimeBattleEngageService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimeBasicAttackService, worldRuntimePlayerSkillDispatchService, worldRuntimeBattleEngageService) {
        this.worldRuntimeBasicAttackService = worldRuntimeBasicAttackService;
        this.worldRuntimePlayerSkillDispatchService = worldRuntimePlayerSkillDispatchService;
        this.worldRuntimeBattleEngageService = worldRuntimeBattleEngageService;
    }    
    /**
 * dispatchBasicAttack：判断BasicAttack是否满足条件。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BasicAttack相关状态。
 */

    async dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps) {
        return this.worldRuntimeBasicAttackService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps);
    }    
    /**
 * dispatchCastSkill：判断Cast技能是否满足条件。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能相关状态。
 */

    async dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps) {
        return this.worldRuntimePlayerSkillDispatchService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps);
    }    
    /**
 * resolveLegacySkillTargetRef：读取Legacy技能目标Ref并返回结果。
 * @param attacker 参数说明。
 * @param skill 参数说明。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Legacy技能目标Ref相关状态。
 */

    resolveLegacySkillTargetRef(attacker, skill, targetRef, deps) {
        return this.worldRuntimePlayerSkillDispatchService.resolveLegacySkillTargetRef(attacker, skill, targetRef, deps);
    }    
    /**
 * dispatchCastSkillToMonster：判断Cast技能To怪物是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能To怪物相关状态。
 */

    async dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps) {
        return this.worldRuntimePlayerSkillDispatchService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps);
    }    
    /**
 * dispatchCastSkillToTile：判断Cast技能ToTile是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能ToTile相关状态。
 */

    async dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps) {
        return this.worldRuntimePlayerSkillDispatchService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps);
    }    
    /**
 * dispatchEngageBattle：判断EngageBattle是否满足条件。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param locked 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新EngageBattle相关状态。
 */

    async dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps) {
        return this.worldRuntimeBattleEngageService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps);
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
