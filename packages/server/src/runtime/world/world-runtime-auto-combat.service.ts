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
exports.WorldRuntimeAutoCombatService = void 0;

const common_1 = require("@nestjs/common");
const player_combat_config_helpers_1 = require("../player/player-combat-config.helpers");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");
const { findPlayerSkill, resolveAutoBattleSkillQiCost } = world_runtime_normalization_helpers_1;
const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const { chebyshevDistance, findPathToTargetWithinRangeOnMap, directionFromStep, resolveInitialRunLength } = world_runtime_path_planning_helpers_1;
const world_runtime_attack_target_helpers_1 = require("./world-runtime.attack-target.helpers");

function isHostileRelation(resolution) {
    return (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)(resolution);
}

function resolveAutoCombatPlayerPriority(resolution) {
    if (!resolution?.matchedRules?.length) {
        return 0;
    }
    if (resolution.matchedRules.includes('retaliators')) {
        return 3;
    }
    if (resolution.matchedRules.includes('demonized_players')) {
        return 1;
    }
    return 0;
}

const AUTO_TARGETING_PREFERENCE_MULTIPLIER = 5;
const AUTO_COMBAT_ACTION_COMMAND_KINDS = new Set(['basicAttack', 'castSkill']);

function resolveActionsPerTurn(player) {
    const rawValue = Number(player?.attrs?.numericStats?.actionsPerTurn ?? 1);
    if (!Number.isFinite(rawValue)) {
        return 1;
    }
    return Math.max(1, Math.trunc(rawValue));
}

function resolveCombatActionsUsedThisTick(player, currentTick) {
    const combat = player?.combat;
    if (!combat || combat.combatActionTick !== currentTick) {
        return 0;
    }
    const rawValue = Number(combat.combatActionsUsedThisTick ?? 0);
    if (!Number.isFinite(rawValue)) {
        return 0;
    }
    return Math.max(0, Math.trunc(rawValue));
}

function hasCombatActionBudget(player, currentTick) {
    if (!Number.isFinite(currentTick) || currentTick <= 0) {
        return true;
    }
    return resolveCombatActionsUsedThisTick(player, currentTick) < resolveActionsPerTurn(player);
}

function isAutoCombatActionCommand(command) {
    return AUTO_COMBAT_ACTION_COMMAND_KINDS.has(command?.kind);
}

function getAutoTargetHpRatio(candidate) {
    if (!Number.isFinite(candidate.maxHp) || candidate.maxHp <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(1, candidate.hp / candidate.maxHp));
}

function getAutoTargetingPreferenceMultiplier(mode, candidate, metrics) {
    switch (mode) {
        case 'nearest':
            return candidate.distance === metrics.nearestDistance ? AUTO_TARGETING_PREFERENCE_MULTIPLIER : 1;
        case 'low_hp':
            return Math.abs(candidate.hpRatio - metrics.lowestHpRatio) <= 1e-6 ? AUTO_TARGETING_PREFERENCE_MULTIPLIER : 1;
        case 'full_hp':
            return Math.abs(candidate.hpRatio - metrics.highestHpRatio) <= 1e-6 ? AUTO_TARGETING_PREFERENCE_MULTIPLIER : 1;
        case 'boss':
            return candidate.isBoss === true ? AUTO_TARGETING_PREFERENCE_MULTIPLIER : 1;
        case 'player':
            return candidate.kind === 'player' ? AUTO_TARGETING_PREFERENCE_MULTIPLIER : 1;
        default:
            return 1;
    }
}

function scoreAutoCombatCandidate(mode, candidate, metrics) {
    const aggroScore = candidate.aggroRank * 100000;
    const relationScore = candidate.priority * 10000;
    const distanceScore = 1000 / Math.max(1, candidate.distance + 1);
    const hpScore = (1 - candidate.hpRatio) * 100;
    return (aggroScore + relationScore + distanceScore + hpScore)
        * getAutoTargetingPreferenceMultiplier(mode, candidate, metrics);
}

/** 自动战斗编排服务：承接 auto-targeting 与 auto command 物化。 */
let WorldRuntimeAutoCombatService = class WorldRuntimeAutoCombatService {
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
 * materializeAutoCombatCommands：执行materializeAuto战斗Command相关逻辑。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新materializeAuto战斗Command相关状态。
 */

    materializeAutoCombatCommands(deps) {
        for (const playerId of deps.listConnectedPlayerIds()) {
            if (deps.hasPendingCommand(playerId) || deps.worldRuntimeNavigationService.hasNavigationIntent(playerId)) {
                continue;
            }
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || player.hp <= 0) {
                continue;
            }
            const manualEngagePending = player.combat.manualEngagePending === true;
            if (!player.combat.autoBattle && !player.combat.autoRetaliate && !manualEngagePending) {
                continue;
            }
            const location = deps.getPlayerLocation(playerId);
            if (!location) {
                continue;
            }
            const instance = deps.getInstanceRuntime(location.instanceId);
            if (!instance) {
                continue;
            }
            if (player.combat.autoBattle && instance.isSafeZoneTile(player.x, player.y)) {
                const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
                this.playerRuntimeService.updateCombatSettings(playerId, { autoBattle: false }, currentTick);
                this.playerRuntimeService.clearCombatTarget(playerId, currentTick);
                deps.queuePlayerNotice(playerId, '安全区内无法发起攻击，自动战斗已停止。', 'warn');
                continue;
            }
            const command = this.buildAutoCombatCommand(instance, player, deps);
            if (command) {
                if (isAutoCombatActionCommand(command)) {
                    const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
                    if (!hasCombatActionBudget(player, currentTick)) {
                        continue;
                    }
                }
                deps.enqueuePendingCommand(playerId, manualEngagePending ? {
                    ...command,
                    manualEngage: true,
                } : command);
                continue;
            }
            if (manualEngagePending) {
                const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
                this.playerRuntimeService.clearManualEngagePending(playerId);
                this.playerRuntimeService.clearCombatTarget(playerId, currentTick);
            }
        }
    }
    /**
 * buildAutoCombatCommand：构建并返回目标对象。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Auto战斗Command相关状态。
 */

    buildAutoCombatCommand(instance, player, deps, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (instance.isPointInSafeZone(player.x, player.y)) {
            return null;
        }
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        const view = instance.buildPlayerView(player.playerId, radius);
        if (!view) {
            return null;
        }
        const target = this.selectAutoCombatTarget(instance, player, view, deps);
        if (!target) {
            return null;
        }
        const distance = chebyshevDistance(player.x, player.y, target.x, target.y);
        const skillChoice = target.supportsSkill === false
            ? null
            : this.resolveAutoBattleSkillChoice(player, distance, options);
        if (skillChoice?.skillId) {
            if (target.targetMonsterId) {
                return {
                    kind: 'castSkill',
                    skillId: skillChoice.skillId,
                    targetPlayerId: null,
                    targetMonsterId: target.targetMonsterId,
                    targetRef: null,
                    autoCombat: true,
                };
            }
            return {
                kind: 'castSkill',
                skillId: skillChoice.skillId,
                targetPlayerId: null,
                targetMonsterId: null,
                targetRef: target.targetRef,
                autoCombat: true,
            };
        }
        if (distance <= 1) {
            return (0, world_runtime_attack_target_helpers_1.buildBasicAttackCommandFromAttackableTarget)(target);
        }
        if (player.combat.autoBattleStationary) {
            return null;
        }
        const desiredRange = Math.max(1, Math.round(skillChoice?.range ?? 1));
        const pathResult = findPathToTargetWithinRangeOnMap(instance, player.playerId, player.x, player.y, target.x, target.y, desiredRange, false);
        if (!pathResult || pathResult.points.length === 0) {
            return null;
        }
        const direction = directionFromStep(player.x, player.y, pathResult.points[0].x, pathResult.points[0].y);
        if (direction === null) {
            return null;
        }
        const maxSteps = resolveInitialRunLength(pathResult.points, player.x, player.y, direction);
        return {
            kind: 'move',
            direction,
            continuous: true,
            maxSteps,
            path: pathResult.points.map((entry) => ({ x: entry.x, y: entry.y })),
            autoCombat: true,
        };
    }
    /**
 * normalizeAutoCombatMonsterTarget：把视野怪物条目转换为完整自动战斗目标。
 * @param monster 视野中的怪物条目。
 * @returns 返回完整怪物目标。
 */

    normalizeAutoCombatMonsterTarget(monster) {
        return {
            kind: 'monster',
            runtimeId: monster.runtimeId,
            targetRef: monster.runtimeId,
            x: monster.x,
            y: monster.y,
            hp: monster.hp,
        };
    }
    /**
 * selectAutoCombatTarget：读取selectAuto战斗目标并返回结果。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param visibleMonsters 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新selectAuto战斗目标相关状态。
 */

    selectAutoCombatTarget(instance, player, view, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (player.combat.autoBattle || player.combat.manualEngagePending === true) {
            const trackedTarget = this.resolveTrackedAutoCombatTarget(instance, player, view, deps);
            if (trackedTarget) {
                return trackedTarget;
            }
        }
        const candidates = [];
        for (const monster of view.localMonsters) {
            const liveMonster = instance.getMonster(monster.runtimeId);
            if (!liveMonster?.alive) {
                continue;
            }
            const retaliating = liveMonster.aggroTargetPlayerId === player.playerId;
            const monsterRelation = (0, player_combat_config_helpers_1.resolveCombatRelation)(player, { kind: 'monster' });
            const monsterHostile = isHostileRelation(monsterRelation);
            if (!player.combat.autoBattle && !retaliating) {
                continue;
            }
            if (!monsterHostile && !retaliating) {
                continue;
            }
            const aggroRank = retaliating ? 1 : 0;
            const distance = chebyshevDistance(player.x, player.y, monster.x, monster.y);
            candidates.push({
                kind: 'monster',
                target: this.normalizeAutoCombatMonsterTarget(monster),
                distance,
                hp: monster.hp,
                maxHp: liveMonster.maxHp,
                hpRatio: getAutoTargetHpRatio({ hp: monster.hp, maxHp: liveMonster.maxHp }),
                aggroRank,
                priority: aggroRank > 0 ? 2 : 0,
                isBoss: liveMonster.tier === 'demon_king',
                tieBreaker: monster.runtimeId,
            });
        }
        const bestPlayer = this.selectAutoCombatPlayerTarget(player, view);
        if (bestPlayer) {
            candidates.push({
                kind: 'player',
                target: bestPlayer,
                distance: bestPlayer.distance,
                hp: bestPlayer.hp,
                maxHp: bestPlayer.maxHp ?? bestPlayer.hp,
                hpRatio: getAutoTargetHpRatio({ hp: bestPlayer.hp, maxHp: bestPlayer.maxHp ?? bestPlayer.hp }),
                aggroRank: bestPlayer.priority >= 3 ? 1 : 0,
                priority: bestPlayer.priority ?? 0,
                isBoss: false,
                tieBreaker: bestPlayer.playerId,
            });
        }
        if (candidates.length === 0) {
            return null;
        }
        const metrics = {
            nearestDistance: candidates.reduce((min, candidate) => Math.min(min, candidate.distance), Number.POSITIVE_INFINITY),
            lowestHpRatio: candidates.reduce((min, candidate) => Math.min(min, candidate.hpRatio), Number.POSITIVE_INFINITY),
            highestHpRatio: candidates.reduce((max, candidate) => Math.max(max, candidate.hpRatio), Number.NEGATIVE_INFINITY),
        };
        let bestCandidate = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const candidate of candidates) {
            const score = scoreAutoCombatCandidate(player.combat.autoBattleTargetingMode, candidate, metrics);
            if (
                score > bestScore
                || (score === bestScore && bestCandidate && candidate.distance < bestCandidate.distance)
                || (score === bestScore && bestCandidate && candidate.distance === bestCandidate.distance && candidate.tieBreaker < bestCandidate.tieBreaker)
            ) {
                bestCandidate = candidate;
                bestScore = score;
            }
        }
        if (!bestCandidate) {
            return null;
        }
        if (player.combat.autoBattle && player.combat.combatTargetId !== bestCandidate.target.targetRef) {
            this.playerRuntimeService.setCombatTarget(player.playerId, bestCandidate.target.targetRef, false, deps.resolveCurrentTickForPlayerId(player.playerId));
        }
        return bestCandidate.target;
    }
    /**
 * resolveTrackedAutoCombatTarget：读取TrackedAuto战斗目标并返回结果。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param visibleMonsters 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TrackedAuto战斗目标相关状态。
 */

    resolveTrackedAutoCombatTarget(instance, player, view, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const targetRuntimeId = player.combat.combatTargetId;
        if (!targetRuntimeId) {
            return null;
        }
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        const trackedTarget = (0, world_runtime_attack_target_helpers_1.resolveAttackableTargetRef)(
            instance,
            this.playerRuntimeService,
            player,
            targetRuntimeId,
            deps,
            {
                currentTick: deps.resolveCurrentTickForPlayerId(player.playerId),
                maxDistance: radius,
            },
        );
        if (trackedTarget) {
            return trackedTarget;
        }
        return this.handleMissingTrackedTarget(player, deps);
    }
    /**
 * handleMissingTrackedTarget：处理丢失的锁定目标。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 返回空结果。
 */

    handleMissingTrackedTarget(player, deps) {
        const locked = player.combat.combatTargetLocked;
        if (locked) {
            const currentTick = deps.resolveCurrentTickForPlayerId(player.playerId);
            this.playerRuntimeService.updateCombatSettings(player.playerId, { autoBattle: false }, currentTick);
            this.playerRuntimeService.clearCombatTarget(player.playerId, currentTick);
            deps.queuePlayerNotice(player.playerId, '强制攻击目标已经失去踪迹，自动战斗已停止。', 'combat');
            return null;
        }
        if (player.combat.manualEngagePending === true) {
            this.playerRuntimeService.clearManualEngagePending(player.playerId);
        }
        this.playerRuntimeService.clearCombatTarget(player.playerId, deps.resolveCurrentTickForPlayerId(player.playerId));
        return null;
    }
    /** 从可见玩家里选出当前最合适的自动战斗目标。 */
    selectAutoCombatPlayerTarget(player, view) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let best = null;
        for (const visible of view.visiblePlayers ?? []) {
            const target = this.playerRuntimeService.getPlayer(visible.playerId);
            if (!target || target.instanceId !== player.instanceId || target.hp <= 0) {
                continue;
            }
            const relation = (0, player_combat_config_helpers_1.resolveCombatRelation)(player, {
                kind: 'player',
                target,
            });
            if (!isHostileRelation(relation)) {
                continue;
            }
            const retaliating = relation.matchedRules.includes('retaliators');
            if (!player.combat.autoBattle && !retaliating) {
                continue;
            }
            const priority = resolveAutoCombatPlayerPriority(relation);
            const distance = chebyshevDistance(player.x, player.y, target.x, target.y);
            if (!best
                || priority > best.priority
                || (priority === best.priority && distance < best.distance)
                || (priority === best.priority && distance === best.distance && target.hp < best.hp)
                || (priority === best.priority && distance === best.distance && target.hp === best.hp && target.playerId < best.playerId)) {
                best = {
                    kind: 'player',
                    playerId: target.playerId,
                    targetRef: `player:${target.playerId}`,
                    x: target.x,
                    y: target.y,
                    hp: target.hp,
                    maxHp: target.maxHp,
                    distance,
                    priority,
                };
            }
        }
        return best;
    }
    /**
 * pickAutoBattleSkill：执行pickAutoBattle技能相关逻辑。
 * @param player 玩家对象。
 * @param distance 参数说明。
 * @returns 无返回值，直接更新pickAutoBattle技能相关状态。
 */

    resolveAutoBattleSkillChoice(player, distance, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const excludedSkillIds = options?.excludedSkillIds;
        let chaseRange = 1;
        for (const action of player.actions.actions) {
            if (action.type !== 'skill') {
                continue;
            }
            if (action.autoBattleEnabled === false || action.skillEnabled === false) {
                continue;
            }
            if ((action.cooldownLeft ?? 0) > 0) {
                continue;
            }
            const range = Math.max(1, Math.round(action.range ?? 1));
            const skill = findPlayerSkill(player, action.id);
            if (!skill) {
                continue;
            }
            if (excludedSkillIds?.has(skill.id)) {
                continue;
            }
            if (player.qi < resolveAutoBattleSkillQiCost(skill.cost, player.attrs.numericStats.maxQiOutputPerTick)) {
                continue;
            }
            if (distance <= range) {
                return {
                    skillId: skill.id,
                    range,
                };
            }
            chaseRange = Math.max(chaseRange, range);
        }
        return chaseRange > 1
            ? {
                skillId: null,
                range: chaseRange,
            }
            : null;
    }
    /**
 * pickAutoBattleSkill：执行pickAutoBattle技能相关逻辑。
 * @param player 玩家对象。
 * @param distance 参数说明。
 * @returns 无返回值，直接更新pickAutoBattle技能相关状态。
 */

    pickAutoBattleSkill(player, distance, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return this.resolveAutoBattleSkillChoice(player, distance, options)?.skillId ?? null;
    }
    /**
 * resolveAutoBattleDesiredRange：规范化或转换AutoBattleDesired范围。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新AutoBattleDesired范围相关状态。
 */

    resolveAutoBattleDesiredRange(player, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let desiredRange = 1;
        const excludedSkillIds = options?.excludedSkillIds;
        for (const action of player.actions.actions) {
            if (action.type !== 'skill') {
                continue;
            }
            if (action.autoBattleEnabled === false || action.skillEnabled === false) {
                continue;
            }
            const skill = findPlayerSkill(player, action.id);
            if (!skill) {
                continue;
            }
            if (excludedSkillIds?.has(skill.id)) {
                continue;
            }
            if (player.qi < resolveAutoBattleSkillQiCost(skill.cost, player.attrs.numericStats.maxQiOutputPerTick)) {
                continue;
            }
            desiredRange = Math.max(desiredRange, Math.max(1, Math.round(action.range ?? 1)));
        }
        return desiredRange;
    }
};
exports.WorldRuntimeAutoCombatService = WorldRuntimeAutoCombatService;
exports.WorldRuntimeAutoCombatService = WorldRuntimeAutoCombatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeAutoCombatService);

export { WorldRuntimeAutoCombatService };
