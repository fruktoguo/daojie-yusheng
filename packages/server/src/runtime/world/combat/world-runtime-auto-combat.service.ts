import { Inject, Injectable } from '@nestjs/common';
import { isHostileCombatRelationResolution, resolveCombatRelation } from '../../player/player-combat-config.helpers';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import { buildStructuredNotice } from '../structured-notice.helpers';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';
import * as world_runtime_path_planning_helpers_1 from '../world-runtime.path-planning.helpers';
import { buildBasicAttackCommandFromAttackableTarget, resolveAttackableTargetRef } from './world-runtime.attack-target.helpers';

const { findPlayerSkill, resolveAutoBattleSkillQiCost } = world_runtime_normalization_helpers_1;
const { chebyshevDistance, findPathToTargetWithinRangeOnMap, directionFromStep, resolveInitialRunLength } = world_runtime_path_planning_helpers_1;

/** 计算原地释放 AOE 技能以玩家为中心时能覆盖到的最大 chebyshev 距离。 */
function resolveSkillAoeCoverRadius(skill) {
    const targeting = skill.targeting;
    if (!targeting) {
        return 0;
    }
    if (targeting.shape === 'box' || targeting.shape === 'orientedBox') {
        const w = Math.max(1, Math.floor(Number(targeting.width) || 1));
        const h = Math.max(1, Math.floor(Number(targeting.height) || 1));
        return Math.floor((Math.max(w, h) - 1) / 2);
    }
    if (targeting.shape === 'area' || targeting.shape === 'ring' || targeting.shape === 'checkerboard') {
        return Math.max(0, Math.floor(Number(targeting.radius) || 0));
    }
    return 0;
}

function isHostileRelation(resolution) {
    return isHostileCombatRelationResolution(resolution);
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

function isPlayerTargetRef(targetRef) {
    return typeof targetRef === 'string' && targetRef.trim().startsWith('player:');
}

const AUTO_TARGETING_PREFERENCE_MULTIPLIER = 5;
const AUTO_COMBAT_ACTION_COMMAND_KINDS = new Set(['basicAttack', 'castSkill']);
const AUTO_USE_PILL_SLOT_LIMIT = 12;

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

function isAutoUsePillCandidate(item) {
    return (item?.healAmount ?? 0) > 0
        || (item?.healPercent ?? 0) > 0
        || (item?.qiPercent ?? 0) > 0
        || (Array.isArray(item?.consumeBuffs) && item.consumeBuffs.length > 0);
}

function resolveResourceRatio(player, resource) {
    const current = resource === 'qi' ? player.qi : player.hp;
    const max = resource === 'qi' ? player.maxQi : player.maxHp;
    if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
        return null;
    }
    return Math.max(0, Math.min(1, current / max));
}

function isBuffActive(player, buffId) {
    if (typeof buffId !== 'string' || !buffId.trim()) {
        return false;
    }
    return Array.isArray(player?.buffs?.buffs)
        && player.buffs.buffs.some((buff) => buff?.buffId === buffId
            && Math.max(0, Math.round(Number(buff?.remainingTicks ?? 0))) > 0
            && Math.max(0, Math.round(Number(buff?.stacks ?? 0))) > 0);
}

function hasMissingConsumableBuff(player, item) {
    const buffs = Array.isArray(item?.consumeBuffs) ? item.consumeBuffs : [];
    if (buffs.length === 0) {
        return false;
    }
    return buffs.some((buff) => !isBuffActive(player, buff?.buffId));
}

function isAutoUsePillConditionMet(player, item, condition) {
    if (condition?.type === 'buff_missing') {
        return hasMissingConsumableBuff(player, item);
    }
    if (condition?.type !== 'resource_ratio') {
        return false;
    }
    const ratio = resolveResourceRatio(player, condition.resource);
    if (ratio === null) {
        return false;
    }
    const threshold = Math.max(0, Math.min(100, Number(condition.thresholdPct ?? 0))) / 100;
    return condition.op === 'gt'
        ? ratio > threshold
        : ratio < threshold;
}

function shouldAutoUsePill(player, item, conditions) {
    if (!Array.isArray(conditions) || conditions.length === 0) {
        return false;
    }
    return conditions.every((condition) => isAutoUsePillConditionMet(player, item, condition));
}

function findAutoUsePillInventorySlot(player, itemId) {
    const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
    if (!normalizedItemId || !Array.isArray(player?.inventory?.items)) {
        return null;
    }
    for (let index = 0; index < player.inventory.items.length; index += 1) {
        const item = player.inventory.items[index];
        if (item?.itemId !== normalizedItemId) {
            continue;
        }
        const count = Math.max(0, Math.trunc(Number(item.count ?? 0)));
        if (count <= 0 || !isAutoUsePillCandidate(item)) {
            continue;
        }
        return { item, slotIndex: index };
    }
    return null;
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
@Injectable()
export class WorldRuntimeAutoCombatService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
    }
    /**
 * materializeAutoUsePills：按玩家配置在 tick 受控流程内自动使用一枚丹药。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家背包、气血、真气或 Buff。
 */

    materializeAutoUsePills(deps) {
        for (const playerId of deps.listConnectedPlayerIds()) {
            if (typeof deps.hasPendingCommand === 'function' && deps.hasPendingCommand(playerId)) {
                continue;
            }
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || player.hp <= 0) {
                continue;
            }
            const configs = Array.isArray(player.combat?.autoUsePills)
                ? player.combat.autoUsePills.slice(0, AUTO_USE_PILL_SLOT_LIMIT)
                : [];
            if (configs.length === 0) {
                continue;
            }
            for (const config of configs) {
                const match = findAutoUsePillInventorySlot(player, config?.itemId);
                if (!match || !shouldAutoUsePill(player, match.item, config?.conditions)) {
                    continue;
                }
                try {
                    this.playerRuntimeService.useItem(playerId, match.slotIndex);
                    if (typeof deps.refreshQuestStates === 'function') {
                        deps.refreshQuestStates(playerId);
                    }
                    if (typeof deps.queuePlayerNotice === 'function') {
                        const n = buildStructuredNotice('success', 'notice.combat.auto-use-item', `自动使用 ${match.item.name ?? match.item.itemId}`, { vars: { itemName: match.item.name ?? match.item.itemId }, pills: [{ key: 'itemName', style: 'target' }] });
                        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
                    }
                }
                catch (_error) {
                    continue;
                }
                break;
            }
        }
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
            const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
            if (typeof this.playerRuntimeService.clearRetaliatePlayerTargetIfExpired === 'function') {
                this.playerRuntimeService.clearRetaliatePlayerTargetIfExpired(playerId, currentTick);
            }
            if (player.combat?.pendingSkillCast) {
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
            const command = this.buildAutoCombatCommand(instance, player, deps);
            if (command) {
                if (isAutoCombatActionCommand(command)) {
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
  // 安全区内允许自动战斗打怪，但不允许自动选择玩家目标。

        const inSafeZone = instance.isPointInSafeZone(player.x, player.y);
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        const view = instance.buildPlayerView(player.playerId, radius);
        if (!view) {
            return null;
        }
        const target = this.selectAutoCombatTarget(instance, player, view, deps);
        if (!target) {
            return null;
        }
        if (inSafeZone && target.playerId) {
            return null;
        }
        const distance = chebyshevDistance(player.x, player.y, target.x, target.y);
        const skillChoice = target.supportsSkill === false
            ? null
            : this.resolveAutoBattleSkillChoice(player, distance, options);
        if (skillChoice?.skillId) {
            // selfCast（以自身为中心的 AOE）不需要对目标做 LOS 检查
            if (skillChoice.selfCast) {
                return {
                    kind: 'castSkill',
                    skillId: skillChoice.skillId,
                    targetPlayerId: null,
                    targetMonsterId: null,
                    targetRef: null,
                    autoCombat: true,
                };
            }
            // LOS 预检：避免对视线被遮挡的目标发出必然失败的 castSkill 指令
            const losRange = Math.max(1, Math.round(skillChoice.range ?? 1));
            if (typeof instance.canSeeTileFrom === 'function' &&
                instance.canSeeTileFrom(player.x, player.y, target.x, target.y, losRange) === false) {
                // 视线不通 → 尝试寻路靠近；stationary 模式直接放弃
                if (player.combat.autoBattleStationary) {
                    return null;
                }
                const losPathResult = findPathToTargetWithinRangeOnMap(instance, player.playerId, player.x, player.y, target.x, target.y, losRange, false);
                if (!losPathResult || losPathResult.points.length === 0) {
                    return null;
                }
                const losDirection = directionFromStep(player.x, player.y, losPathResult.points[0].x, losPathResult.points[0].y);
                if (losDirection === null) {
                    return null;
                }
                const losMaxSteps = resolveInitialRunLength(losPathResult.points, player.x, player.y, losDirection);
                return {
                    kind: 'move',
                    direction: losDirection,
                    continuous: true,
                    maxSteps: losMaxSteps,
                    path: losPathResult.points.map((entry) => ({ x: entry.x, y: entry.y })),
                    autoCombat: true,
                };
            }
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
            // 近战基础攻击也做 LOS 预检
            if (typeof instance.canSeeTileFrom === 'function' &&
                instance.canSeeTileFrom(player.x, player.y, target.x, target.y, 1) === false) {
                return null;
            }
            return buildBasicAttackCommandFromAttackableTarget(target);
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
            targetMonsterId: monster.runtimeId,
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

        const retaliateTarget = this.resolveRetaliatePlayerOverrideTarget(instance, player, deps);
        if (retaliateTarget) {
            return retaliateTarget;
        }
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
            const monsterRelation = resolveCombatRelation(player, { kind: 'monster' });
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
    /** 被玩家攻击时，临时抢占非玩家锁定目标，但不改写原锁定目标。 */
    resolveRetaliatePlayerOverrideTarget(instance, player, deps) {
        if (player?.combat?.autoRetaliate === false) {
            return null;
        }
        const retaliatePlayerId = typeof player?.combat?.retaliatePlayerTargetId === 'string'
            ? player.combat.retaliatePlayerTargetId.trim()
            : '';
        if (!retaliatePlayerId) {
            return null;
        }
        const currentTargetId = typeof player?.combat?.combatTargetId === 'string'
            ? player.combat.combatTargetId.trim()
            : '';
        if (isPlayerTargetRef(currentTargetId)) {
            return null;
        }
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        return resolveAttackableTargetRef(
            instance,
            this.playerRuntimeService,
            player,
            `player:${retaliatePlayerId}`,
            deps,
            {
                currentTick: deps.resolveCurrentTickForPlayerId(player.playerId),
                maxDistance: radius,
            },
        );
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
        const trackedTarget = resolveAttackableTargetRef(
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
            this.playerRuntimeService.clearCombatTarget(player.playerId, currentTick);
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
            const relation = resolveCombatRelation(player, {
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
            // 原地释放技能（requiresTarget:false + range:0）：以玩家为中心，用 AOE 覆盖半径判断能否命中目标
            if (skill.requiresTarget === false && (action.range ?? 0) === 0) {
                const aoeRadius = resolveSkillAoeCoverRadius(skill);
                if (distance <= aoeRadius) {
                    return { skillId: skill.id, range: aoeRadius, selfCast: true };
                }
                chaseRange = Math.max(chaseRange, aoeRadius);
                continue;
            }
            const range = Math.max(1, Math.round(action.range ?? 1));
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
            if (skill.requiresTarget === false && (action.range ?? 0) === 0) {
                desiredRange = Math.max(desiredRange, resolveSkillAoeCoverRadius(skill));
            } else {
                desiredRange = Math.max(desiredRange, Math.max(1, Math.round(action.range ?? 1)));
            }
        }
        return desiredRange;
    }
};
