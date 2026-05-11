import { Inject, Injectable } from '@nestjs/common';
import { WorldRuntimeBasicAttackService } from './world-runtime-basic-attack.service';
import { WorldRuntimePlayerSkillDispatchService } from './world-runtime-player-skill-dispatch.service';
import { WorldRuntimeBattleEngageService } from './world-runtime-battle-engage.service';
import { WorldRuntimeCombatActionService } from './world-runtime-combat-action.service';

/** world-runtime combat-command orchestration：统一承接普攻、施法与接敌入口 facade。 */
@Injectable()
export class WorldRuntimeCombatCommandService {
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
 * worldRuntimeCombatActionService：统一战斗动作编排服务引用。
 */

    worldRuntimeCombatActionService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeBasicAttackService 参数说明。
 * @param worldRuntimePlayerSkillDispatchService 参数说明。
 * @param worldRuntimeBattleEngageService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(WorldRuntimeBasicAttackService) worldRuntimeBasicAttackService: any,
        @Inject(WorldRuntimePlayerSkillDispatchService) worldRuntimePlayerSkillDispatchService: any,
        @Inject(WorldRuntimeBattleEngageService) worldRuntimeBattleEngageService: any,
        @Inject(WorldRuntimeCombatActionService) worldRuntimeCombatActionService: any,
    ) {
        this.worldRuntimeBasicAttackService = worldRuntimeBasicAttackService;
        this.worldRuntimePlayerSkillDispatchService = worldRuntimePlayerSkillDispatchService;
        this.worldRuntimeBattleEngageService = worldRuntimeBattleEngageService;
        this.worldRuntimeCombatActionService = worldRuntimeCombatActionService;
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
        return this.worldRuntimeCombatActionService.dispatchPlayerBasicAttack({
            playerId,
            targetPlayerId,
            targetMonsterId,
            targetX,
            targetY,
        }, deps, () => this.worldRuntimeBasicAttackService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps));
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
        return this.worldRuntimeCombatActionService.dispatchPlayerSkill({
            playerId,
            skillId,
            targetPlayerId,
            targetMonsterId,
            targetRef,
        }, deps, () => this.worldRuntimePlayerSkillDispatchService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps));
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
        return this.worldRuntimeCombatActionService.dispatchPlayerSkillToMonster({
            attacker,
            skillId,
            targetMonsterId,
        }, deps, () => this.worldRuntimePlayerSkillDispatchService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps));
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
        return this.worldRuntimeCombatActionService.dispatchPlayerSkillToTile({
            attacker,
            skillId,
            targetX,
            targetY,
        }, deps, () => this.worldRuntimePlayerSkillDispatchService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps));
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
        return this.worldRuntimeCombatActionService.dispatchPlayerEngageBattle({
            playerId,
            targetPlayerId,
            targetMonsterId,
            targetX,
            targetY,
            locked,
        }, deps, () => this.worldRuntimeBattleEngageService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps));
    }
};
