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
exports.WorldRuntimeBasicAttackService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const player_runtime_service_1 = require("../player/player-runtime.service");
const player_combat_config_helpers_1 = require("../player/player-combat-config.helpers");
const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const { chebyshevDistance } = world_runtime_path_planning_helpers_1;
const world_runtime_observation_helpers_1 = require("./world-runtime.observation.helpers");
const {
    createTileCombatAttributes,
    createTileCombatNumericStats,
    createTileCombatRatioDivisors,
    formatCombatDamageBreakdown,
    formatCombatActionClause,
} = world_runtime_observation_helpers_1;

function ensureHostileRelation(resolution) {
    if ((0, player_combat_config_helpers_1.isHostileCombatRelationResolution)(resolution)) {
        return;
    }
    if (resolution?.blockedReason === 'self_target') {
        throw new common_1.BadRequestException('不能攻击自己');
    }
    throw new common_1.BadRequestException('当前目标不在敌方判定规则内');
}
function ensureInstanceSupportsPlayerCombat(instance) {
    if (instance?.meta?.supportsPvp === true) {
        return;
    }
    throw new common_1.BadRequestException('当前实例不允许玩家互攻');
}
function ensureInstanceSupportsTileDamage(instance) {
    if (instance?.meta?.canDamageTile === true) {
        return;
    }
    throw new common_1.BadRequestException('当前实例不允许攻击地块');
}

/** 普攻减伤采用与 legacy 对齐的攻防基准。 */
const DEFENSE_REDUCTION_ATTACK_RATIO = 0.1;
const DEFENSE_REDUCTION_BASELINE = 100;

/** 普攻落地服务：承接 dispatchBasicAttack 的伤害与副作用编排。 */
let WorldRuntimeBasicAttackService = class WorldRuntimeBasicAttackService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
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

    dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const attacker = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.recordActivity(playerId, currentTick, {
            interruptCultivation: true,
        });
        deps.worldRuntimeCraftInterruptService.interruptCraftForReason(playerId, attacker, 'attack', deps);
        if (!attacker.instanceId) {
            throw new common_1.BadRequestException(`Player ${playerId} not attached to instance`);
        }
        deps.ensureAttackAllowed(attacker);
        const damageKind = attacker.attrs.numericStats.spellAtk > attacker.attrs.numericStats.physAtk ? 'spell' : 'physical';
        const baseDamage = Math.max(1, Math.round(damageKind === 'spell'
            ? attacker.attrs.numericStats.spellAtk
            : attacker.attrs.numericStats.physAtk));
        if (targetMonsterId) {
            return this.dispatchBasicAttackToMonster(attacker, targetMonsterId, damageKind, baseDamage, deps);
        }
        if (targetPlayerId) {
            return this.dispatchBasicAttackToPlayer(attacker, targetPlayerId, damageKind, baseDamage, currentTick, deps);
        }
        if (targetX !== null && targetY !== null) {
            return this.dispatchBasicAttackToTile(attacker, targetX, targetY, damageKind, baseDamage, deps);
        }
        throw new common_1.BadRequestException('target is required');
    }    
    /**
 * dispatchBasicAttackToMonster：判断BasicAttackTo怪物是否满足条件。
 * @param attacker 参数说明。
 * @param targetMonsterId targetMonster ID。
 * @param damageKind 参数说明。
 * @param baseDamage 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BasicAttackTo怪物相关状态。
 */

    dispatchBasicAttackToMonster(attacker, targetMonsterId, damageKind, baseDamage, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const monster = instance.getMonster(targetMonsterId);
        if (!monster || !monster.alive) {
            throw new common_1.NotFoundException(`Monster ${targetMonsterId} not found`);
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'monster' }));
        if (chebyshevDistance(attacker.x, attacker.y, monster.x, monster.y) > 1) {
            throw new common_1.BadRequestException('目标超出攻击距离');
        }
        const resolvedDamage = this.resolveBasicAttackDamageAgainstMonster(attacker, monster, baseDamage, damageKind);
        const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
        deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
        deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, monster.x, monster.y, effectColor);
        deps.pushDamageFloatEffect(attacker.instanceId, monster.x, monster.y, resolvedDamage.damage, effectColor);
        const outcome = instance.applyDamageToMonster(targetMonsterId, resolvedDamage.damage, attacker.playerId);
        if (outcome?.defeated) {
            deps.handlePlayerMonsterKill(instance, outcome.monster, attacker.playerId);
        }
        deps.queuePlayerNotice(attacker.playerId, `${formatCombatActionClause('你', monster.name, '攻击')}，造成 ${formatCombatDamageBreakdown(resolvedDamage.rawDamage, resolvedDamage.damage, damageKind)} 伤害`, 'combat');
    }    
    /**
 * dispatchBasicAttackToPlayer：判断BasicAttackTo玩家是否满足条件。
 * @param attacker 参数说明。
 * @param targetPlayerId targetPlayer ID。
 * @param damageKind 参数说明。
 * @param baseDamage 参数说明。
 * @param currentTick 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BasicAttackTo玩家相关状态。
 */

    dispatchBasicAttackToPlayer(attacker, targetPlayerId, damageKind, baseDamage, currentTick, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        ensureInstanceSupportsPlayerCombat(instance);
        const target = this.playerRuntimeService.getPlayerOrThrow(targetPlayerId);
        if (target.instanceId !== attacker.instanceId) {
            throw new common_1.BadRequestException('目标不在同一地图');
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, {
            kind: 'player',
            target,
        }));
        if (chebyshevDistance(attacker.x, attacker.y, target.x, target.y) > 1) {
            throw new common_1.BadRequestException('目标超出攻击距离');
        }
        const resolvedDamage = this.resolveBasicAttackDamageAgainstPlayer(attacker, target, baseDamage, damageKind);
        const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
        deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
        deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, target.x, target.y, effectColor);
        deps.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, resolvedDamage.damage, effectColor);
        this.playerRuntimeService.setRetaliatePlayerTarget(target.playerId, attacker.playerId, currentTick);
        const updated = this.playerRuntimeService.applyDamage(target.playerId, resolvedDamage.damage);
        this.playerRuntimeService.recordActivity(target.playerId, currentTick, {
            interruptCultivation: true,
        });
        if (updated.hp <= 0) {
            deps.handlePlayerDefeat(updated.playerId, attacker.playerId);
        }
        deps.queuePlayerNotice(attacker.playerId, `${formatCombatActionClause('你', target.name ?? target.playerId, '攻击')}，造成 ${formatCombatDamageBreakdown(resolvedDamage.rawDamage, resolvedDamage.damage, damageKind)} 伤害`, 'combat');
        deps.queuePlayerNotice(target.playerId, `${formatCombatActionClause(attacker.name ?? attacker.playerId, '你', '攻击')}，造成 ${formatCombatDamageBreakdown(resolvedDamage.rawDamage, resolvedDamage.damage, damageKind)} 伤害`, 'combat');
    }    
    /**
 * dispatchBasicAttackToTile：判断BasicAttackToTile是否满足条件。
 * @param attacker 参数说明。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param damageKind 参数说明。
 * @param baseDamage 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BasicAttackToTile相关状态。
 */

    dispatchBasicAttackToTile(attacker, targetX, targetY, damageKind, baseDamage, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        ensureInstanceSupportsTileDamage(instance);
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
        if (chebyshevDistance(attacker.x, attacker.y, targetX, targetY) > 1) {
            throw new common_1.BadRequestException('目标超出攻击距离');
        }
        const result = instance.damageTile(targetX, targetY, baseDamage);
        if (!result) {
            throw new common_1.BadRequestException('该目标无法被攻击');
        }
        const appliedDamage = Number.isFinite(result.appliedDamage) ? Math.max(0, Math.round(result.appliedDamage)) : 0;
        const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
        deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
        deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, targetX, targetY, effectColor);
        if (appliedDamage > 0) {
            deps.pushDamageFloatEffect(attacker.instanceId, targetX, targetY, appliedDamage, effectColor);
        }
        deps.queuePlayerNotice(attacker.playerId, `${formatCombatActionClause('你', '地块', '攻击')}，造成 ${formatCombatDamageBreakdown(baseDamage, appliedDamage, damageKind)} 伤害`, 'combat');
    }
    /**
 * resolveBasicAttackDamageAgainstMonster：按 legacy 普攻口径结算对怪物伤害。
 * @param attacker 参数说明。
 * @param monster 参数说明。
 * @param baseDamage 参数说明。
 * @param damageKind 参数说明。
 * @returns 返回结算结果。
 */

    resolveBasicAttackDamageAgainstMonster(attacker, monster, baseDamage, damageKind) {
        const combatExpMultiplier = (0, shared_1.getBasicAttackCombatExperienceDamageMultiplier)(Math.max(1, attacker.combatExp ?? 0), Math.max(1, Math.floor(monster.level ?? 1) * 100));
        const realmGapMultiplier = (0, shared_1.getRealmGapDamageMultiplier)(Math.max(1, attacker.realm?.realmLv ?? 1), Math.max(1, Math.floor(monster.level ?? 1)));
        return this.resolveBasicAttackDamage(attacker.attrs.numericStats, attacker.attrs.ratioDivisors, monster.numericStats, monster.ratioDivisors, baseDamage, damageKind, combatExpMultiplier * realmGapMultiplier);
    }    
    /**
 * resolveBasicAttackDamageAgainstPlayer：按 legacy 普攻口径结算对玩家伤害。
 * @param attacker 参数说明。
 * @param target 参数说明。
 * @param baseDamage 参数说明。
 * @param damageKind 参数说明。
 * @returns 返回结算结果。
 */

    resolveBasicAttackDamageAgainstPlayer(attacker, target, baseDamage, damageKind) {
        const combatExpMultiplier = (0, shared_1.getBasicAttackCombatExperienceDamageMultiplier)(Math.max(1, attacker.combatExp ?? 0), Math.max(1, target.combatExp ?? 0));
        const realmGapMultiplier = (0, shared_1.getRealmGapDamageMultiplier)(Math.max(1, attacker.realm?.realmLv ?? 1), Math.max(1, target.realm?.realmLv ?? 1));
        return this.resolveBasicAttackDamage(attacker.attrs.numericStats, attacker.attrs.ratioDivisors, target.attrs.numericStats, target.attrs.ratioDivisors, baseDamage, damageKind, combatExpMultiplier * realmGapMultiplier);
    }    
    /**
 * resolveBasicAttackDamage：统一普攻伤害结算。
 * @param attackerStats 参数说明。
 * @param attackerRatios 参数说明。
 * @param targetStats 参数说明。
 * @param targetRatios 参数说明。
 * @param baseDamage 参数说明。
 * @param damageKind 参数说明。
 * @param extraMultiplier 参数说明。
 * @returns 返回结算结果。
 */

    resolveBasicAttackDamage(attackerStats, attackerRatios, targetStats, targetRatios, baseDamage, damageKind, extraMultiplier = 1) {
        const hitGap = Math.max(0, targetStats.dodge - attackerStats.hit);
        if (hitGap > 0 && Math.random() < (0, shared_1.ratioValue)(hitGap, targetRatios.dodge)) {
            return { rawDamage: 0, damage: 0 };
        }
        const defense = damageKind === 'physical' ? targetStats.physDef : targetStats.spellDef;
        const attackBasis = Math.max(0, damageKind === 'physical' ? attackerStats.physAtk : attackerStats.spellAtk);
        const reductionBasis = Math.max(1, attackBasis * DEFENSE_REDUCTION_ATTACK_RATIO + DEFENSE_REDUCTION_BASELINE);
        const reduction = Math.max(0, (0, shared_1.ratioValue)(Math.max(0, defense), reductionBasis));
        const crit = attackerStats.crit > 0 && Math.random() < (0, shared_1.ratioValue)(attackerStats.crit, attackerRatios.crit);
        let rawDamage = Math.max(1, Math.round(baseDamage));
        let damage = Math.max(1, Math.round(rawDamage * (1 - Math.min(0.95, reduction))));
        if (crit) {
            const critMultiplier = (200 + Math.max(0, attackerStats.critDamage) / 10) / 100;
            rawDamage = Math.max(1, Math.round(rawDamage * critMultiplier));
            damage = Math.max(1, Math.round(damage * critMultiplier));
        }
        rawDamage = Math.max(1, Math.round(rawDamage * Math.max(0, extraMultiplier)));
        damage = Math.max(1, Math.round(damage * Math.max(0, extraMultiplier)));
        return {
            rawDamage,
            damage,
        };
    }
};
exports.WorldRuntimeBasicAttackService = WorldRuntimeBasicAttackService;
exports.WorldRuntimeBasicAttackService = WorldRuntimeBasicAttackService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeBasicAttackService);

export { WorldRuntimeBasicAttackService };
