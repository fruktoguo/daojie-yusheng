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
const combat_resolution_helpers_1 = require("../combat/combat-resolution.helpers");
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
function formatAuraDamage(value) {
    const amount = Math.max(0, Number(value) || 0);
    if (amount <= 0) {
        return '0';
    }
    if (amount < 1) {
        return amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    }
    return amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

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

    async dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const attacker = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.recordActivity(playerId, currentTick, {
            interruptCultivation: true,
        });
        deps.worldRuntimeCraftInterruptService.interruptCraftForReason(playerId, attacker, 'attack', deps);
        if (!attacker.instanceId) {
            throw new common_1.BadRequestException(`玩家 ${playerId} 未进入地图实例`);
        }
        deps.ensureAttackAllowed(attacker);
        const damageKind = attacker.attrs.numericStats.spellAtk > attacker.attrs.numericStats.physAtk ? 'spell' : 'physical';
        const baseDamage = Math.max(1, Math.round(damageKind === 'spell'
            ? attacker.attrs.numericStats.spellAtk
            : attacker.attrs.numericStats.physAtk));
        if (targetMonsterId) {
            const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
                ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, targetMonsterId)
                : null;
            if (formation) {
                return this.dispatchBasicAttackToFormation(attacker, formation, damageKind, baseDamage, deps);
            }
            return this.dispatchBasicAttackToMonster(attacker, targetMonsterId, damageKind, baseDamage, deps);
        }
        if (targetPlayerId) {
            return this.dispatchBasicAttackToPlayer(attacker, targetPlayerId, damageKind, baseDamage, currentTick, deps);
        }
        if (targetX !== null && targetY !== null) {
            return this.dispatchBasicAttackToTile(attacker, targetX, targetY, damageKind, baseDamage, deps, currentTick);
        }
        throw new common_1.BadRequestException('必须指定目标');
    }
    dispatchBasicAttackToFormation(attacker, formation, damageKind, baseDamage, deps) {
  // 阵法无生命条，承受伤害时直接按配置折算扣除阵眼剩余灵力。

        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
        if (chebyshevDistance(attacker.x, attacker.y, formation.x, formation.y) > 1) {
            throw new common_1.BadRequestException('目标超出攻击距离');
        }
        const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
        deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
        deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, formation.x, formation.y, effectColor);
        const outcome = deps.worldRuntimeFormationService.applyDamageToFormation(
            attacker.instanceId,
            formation.id,
            baseDamage,
            attacker.playerId,
            deps,
        );
        const appliedDamage = Math.max(0, Math.round(Number(outcome?.appliedDamage) || 0));
        if (appliedDamage > 0) {
            deps.pushDamageFloatEffect(attacker.instanceId, formation.x, formation.y, appliedDamage, effectColor);
        }
        deps.queuePlayerNotice(
            attacker.playerId,
            `${formatCombatActionClause('你', formation.name, '攻击')}，造成 ${formatCombatDamageBreakdown(baseDamage, appliedDamage, damageKind)} 伤害，削减阵眼灵力 ${formatAuraDamage(outcome?.auraDamage)}。`,
            'combat',
        );
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

    async dispatchBasicAttackToMonster(attacker, targetMonsterId, damageKind, baseDamage, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const monster = instance.getMonster(targetMonsterId);
        if (!monster || !monster.alive) {
            throw new common_1.NotFoundException(`妖兽不存在：${targetMonsterId}`);
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'monster' }));
        if (chebyshevDistance(attacker.x, attacker.y, monster.x, monster.y) > 1) {
            throw new common_1.BadRequestException('目标超出攻击距离');
        }
        const resolvedDamage = this.resolveBasicAttackDamageAgainstMonster(attacker, monster, baseDamage, damageKind);
        const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
        deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
        deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, monster.x, monster.y, effectColor);
        if (resolvedDamage.damage > 0) {
            deps.pushDamageFloatEffect(attacker.instanceId, monster.x, monster.y, resolvedDamage.damage, effectColor);
        }
        const outcome = instance.applyDamageToMonster(targetMonsterId, resolvedDamage.damage, attacker.playerId);
        if (outcome?.defeated) {
            await deps.handlePlayerMonsterKill(instance, outcome.monster, attacker.playerId);
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

    async dispatchBasicAttackToPlayer(attacker, targetPlayerId, damageKind, baseDamage, currentTick, deps) {
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
        if (resolvedDamage.damage > 0) {
            deps.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, resolvedDamage.damage, effectColor);
        }
        this.playerRuntimeService.setRetaliatePlayerTarget(target.playerId, attacker.playerId, currentTick);
        const updated = this.playerRuntimeService.applyDamage(target.playerId, resolvedDamage.damage);
        this.playerRuntimeService.recordActivity(target.playerId, currentTick, {
            interruptCultivation: true,
        });
        if (updated.hp <= 0) {
            await deps.handlePlayerDefeat(updated.playerId, attacker.playerId);
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

    dispatchBasicAttackToTile(attacker, targetX, targetY, damageKind, baseDamage, deps, currentTick = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const boundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
            ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, targetX, targetY)
            : null;
        if (boundary) {
            ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
            if (chebyshevDistance(attacker.x, attacker.y, targetX, targetY) > 1) {
                throw new common_1.BadRequestException('目标超出攻击距离');
            }
            const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
            deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
            deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, targetX, targetY, effectColor);
            const outcome = deps.worldRuntimeFormationService.applyDamageToBoundaryBarrier(
                attacker.instanceId,
                targetX,
                targetY,
                baseDamage,
                attacker.playerId,
                deps,
            );
            const appliedDamage = Math.max(0, Math.round(Number(outcome?.appliedDamage) || 0));
            if (appliedDamage > 0) {
                deps.pushDamageFloatEffect(attacker.instanceId, targetX, targetY, appliedDamage, effectColor);
            }
            deps.queuePlayerNotice(
                attacker.playerId,
                `${formatCombatActionClause('你', boundary.name, '攻击')}边界，造成 ${formatCombatDamageBreakdown(baseDamage, appliedDamage, damageKind)} 伤害，削减阵眼灵力 ${formatAuraDamage(outcome?.auraDamage)}。`,
                'combat',
            );
            return;
        }
        ensureInstanceSupportsTileDamage(instance);
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
        if (chebyshevDistance(attacker.x, attacker.y, targetX, targetY) > 1) {
            throw new common_1.BadRequestException('目标超出攻击距离');
        }
        const container = typeof instance.getContainerAtTile === 'function' ? instance.getContainerAtTile(targetX, targetY) : null;
        const lootContainerService = deps.worldRuntimeLootContainerService;
        const damageContainerAtTile = typeof lootContainerService?.damageAttackableContainerAtTile === 'function'
            ? lootContainerService.damageAttackableContainerAtTile.bind(lootContainerService)
            : typeof lootContainerService?.damageHerbContainerAtTile === 'function'
                ? lootContainerService.damageHerbContainerAtTile.bind(lootContainerService)
                : null;
        const containerAttackResult = container && damageContainerAtTile
            ? damageContainerAtTile(attacker.instanceId, container, currentTick ?? deps.tick ?? 0)
            : null;
        if (containerAttackResult) {
            const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
            deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
            deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, targetX, targetY, effectColor);
            if (containerAttackResult.appliedDamage > 0) {
                deps.pushDamageFloatEffect(attacker.instanceId, targetX, targetY, containerAttackResult.appliedDamage, effectColor);
                const countdown = containerAttackResult.remainingCount <= 0 && containerAttackResult.respawnRemainingTicks !== undefined
                    ? `，药性回生还需 ${Math.max(1, containerAttackResult.respawnRemainingTicks)} 息`
                    : '';
                deps.queuePlayerNotice(attacker.playerId, `你攻击 ${containerAttackResult.title}，打落 1 朵，剩余 ${Math.max(0, containerAttackResult.remainingCount)} 朵${countdown}`, 'combat');
                return;
            }
            const countdown = containerAttackResult.respawnRemainingTicks !== undefined
                ? `还需 ${Math.max(1, containerAttackResult.respawnRemainingTicks)} 息。`
                : '暂时无法再生。';
            deps.queuePlayerNotice(attacker.playerId, `${containerAttackResult.title} 当前没有可打落的草药，${countdown}`, 'combat');
            return;
        }
        if (typeof instance.getTileCombatState === 'function') {
            const tileState = instance.getTileCombatState(targetX, targetY);
            if (!tileState || tileState.destroyed === true) {
                throw new common_1.BadRequestException('该目标无法被攻击');
            }
        }
        const mitigatedDamage = typeof deps.worldRuntimeFormationService?.mitigateTerrainDamage === 'function'
            ? deps.worldRuntimeFormationService.mitigateTerrainDamage(attacker.instanceId, targetX, targetY, baseDamage)
            : baseDamage;
        const result = instance.damageTile(targetX, targetY, mitigatedDamage);
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
        if (result.destroyed === true) {
            deps.worldRuntimeSectService?.expandSectForDestroyedTile?.(attacker.instanceId, targetX, targetY, deps);
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
        const monsterCombatExp = this.resolveMonsterCombatExpEquivalent(monster);
        const combatExpMultiplier = (0, shared_1.getBasicAttackCombatExperienceDamageMultiplier)(Math.max(1, attacker.combatExp ?? 0), Math.max(1, monsterCombatExp));
        return this.resolveBasicAttackDamage(
            attacker.attrs.numericStats,
            attacker.attrs.ratioDivisors,
            Math.max(1, attacker.realm?.realmLv ?? 1),
            Math.max(1, attacker.combatExp ?? 0),
            monster.numericStats,
            monster.ratioDivisors,
            Math.max(1, Math.floor(monster.level ?? 1)),
            Math.max(1, monsterCombatExp),
            baseDamage,
            damageKind,
            combatExpMultiplier,
        );
    }
    resolveMonsterCombatExpEquivalent(monster) {
        const level = Math.max(1, Math.floor(Number(monster?.level) || 1));
        const progressionService = this.playerRuntimeService?.playerProgressionService;
        if (typeof progressionService?.getMonsterCombatExpEquivalent === 'function') {
            const resolved = progressionService.getMonsterCombatExpEquivalent(level);
            if (Number.isFinite(resolved) && resolved > 0) {
                return Math.floor(resolved);
            }
        }
        return level * 100;
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
        return this.resolveBasicAttackDamage(
            attacker.attrs.numericStats,
            attacker.attrs.ratioDivisors,
            Math.max(1, attacker.realm?.realmLv ?? 1),
            Math.max(1, attacker.combatExp ?? 0),
            target.attrs.numericStats,
            target.attrs.ratioDivisors,
            Math.max(1, target.realm?.realmLv ?? 1),
            Math.max(1, target.combatExp ?? 0),
            baseDamage,
            damageKind,
            combatExpMultiplier,
        );
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

    resolveBasicAttackDamage(attackerStats, attackerRatios, attackerRealmLv, attackerCombatExp, targetStats, targetRatios, targetRealmLv, targetCombatExp, baseDamage, damageKind, extraMultiplier = 1) {
        return (0, combat_resolution_helpers_1.resolveCombatHit)({
            attackerStats,
            attackerRatios,
            attackerRealmLv,
            attackerCombatExp,
            targetStats,
            targetRatios,
            targetRealmLv,
            targetCombatExp,
            baseDamage,
            damageKind,
            damageMultiplier: extraMultiplier,
        });
    }
};
exports.WorldRuntimeBasicAttackService = WorldRuntimeBasicAttackService;
exports.WorldRuntimeBasicAttackService = WorldRuntimeBasicAttackService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeBasicAttackService);

export { WorldRuntimeBasicAttackService };
