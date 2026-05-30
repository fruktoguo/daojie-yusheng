/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_AGGRO_THRESHOLD, DEFAULT_PASSIVE_THREAT_PER_TICK, PLAYER_TARGETING_PREFERENCE_THREAT_MULTIPLIER, buildEffectiveTargetingGeometry, getItemDisplayName, resolveSkillRequiresTarget } from '@mud/shared';
import { isHostileCombatRelationResolution, resolveCombatRelation } from '../../player/player-combat-config.helpers';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import { buildStructuredNotice } from '../structured-notice.helpers';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';
import * as world_runtime_path_planning_helpers_1 from '../world-runtime.path-planning.helpers';
import { buildBasicAttackCommandFromAttackableTarget, resolveAttackableTargetRef } from './world-runtime.attack-target.helpers';
import { WorldRuntimeThreatService, resolveThreatDistanceMultiplier } from './world-runtime-threat.service';

const { findPlayerSkill, resolveAutoBattleSkillQiCost, resolveRuntimeSkillRange } = world_runtime_normalization_helpers_1;
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

function instanceSupportsPvp(instance) {
    return instance?.meta?.supportsPvp === true || instance?.supportsPvp === true;
}

const AUTO_TARGETING_PREFERENCE_MULTIPLIER = PLAYER_TARGETING_PREFERENCE_THREAT_MULTIPLIER;
const AUTO_UNREACHABLE_TARGET_THREAT_MULTIPLIER = 0.2;
const AUTO_COMBAT_ACTION_COMMAND_KINDS = new Set(['basicAttack', 'castSkill']);
const AUTO_USE_PILL_SLOT_LIMIT = 12;
const autoBattleSkillLookupCacheByTechniqueState = new WeakMap();
const autoSelfBuffEffectsBySkill = new WeakMap();

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

function recordAutoCombatDuration(deps, key, durationMs, count = 1) {
    const recorder = deps?.recordAutoCombatSectionDuration;
    if (typeof recorder !== 'function') {
        return;
    }
    recorder(key, durationMs, count);
}

function recordAutoCombatPerf(deps, key, startedAt, count = 1) {
    if (typeof deps?.recordAutoCombatSectionDuration !== 'function') {
        return;
    }
    recordAutoCombatDuration(deps, key, performance.now() - startedAt, count);
}

function resolveMiningJobTargetRef(player) {
    const job = player?.miningJob;
    if (!job || !Number.isFinite(Number(job.targetX)) || !Number.isFinite(Number(job.targetY))) {
        return '';
    }
    return `tile:${Math.trunc(Number(job.targetX))}:${Math.trunc(Number(job.targetY))}`;
}

function isMiningJobTargetRef(player, targetRef) {
    const miningTargetRef = resolveMiningJobTargetRef(player);
    const normalizedTargetRef = typeof targetRef === 'string' ? targetRef.trim() : '';
    return Boolean(miningTargetRef) && normalizedTargetRef === miningTargetRef;
}

function resolveMiningJobCommandMarker(player, target) {
    const jobRunId = typeof player?.miningJob?.jobRunId === 'string'
        ? player.miningJob.jobRunId.trim()
        : '';
    const targetRef = typeof target?.targetRef === 'string' ? target.targetRef.trim() : '';
    const miningTargetRef = resolveMiningJobTargetRef(player);
    if (!jobRunId || !miningTargetRef || targetRef !== miningTargetRef) {
        return null;
    }
    return { miningJobRunId: jobRunId, miningTargetRef };
}

function attachMiningJobCommandMarker(command, player, target) {
    if (!command) {
        return command;
    }
    const marker = resolveMiningJobCommandMarker(player, target);
    return marker ? { ...command, ...marker } : command;
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

function getAutoSelfBuffEffects(skill) {
    if (skill && typeof skill === 'object') {
        const cached = autoSelfBuffEffectsBySkill.get(skill);
        if (cached) {
            return cached;
        }
    }
    let result = [];
    if (resolveSkillRequiresTarget(skill) !== false) {
        if (skill && typeof skill === 'object') {
            autoSelfBuffEffectsBySkill.set(skill, result);
        }
        return result;
    }
    const effects = Array.isArray(skill?.effects) ? skill.effects : [];
    if (effects.length === 0) {
        if (skill && typeof skill === 'object') {
            autoSelfBuffEffectsBySkill.set(skill, result);
        }
        return result;
    }
    const selfBuffEffects = effects.filter((effect) => effect?.type === 'buff'
        && (effect.target === 'self' || effect.target === 'allies')
        && typeof effect.buffId === 'string'
        && effect.buffId.trim().length > 0);
    result = selfBuffEffects.length === effects.length ? selfBuffEffects : [];
    if (skill && typeof skill === 'object') {
        autoSelfBuffEffectsBySkill.set(skill, result);
    }
    return result;
}

function isAutoSelfBuffSkill(skill) {
    return getAutoSelfBuffEffects(skill).length > 0;
}

function shouldAutoCastSelfBuffSkill(player, skill) {
    const effects = getAutoSelfBuffEffects(skill);
    return effects.length > 0 && effects.some((effect) => !isBuffActive(player, effect.buffId));
}

function hasMissingConsumableBuff(player, item) {
    const buffs = Array.isArray(item?.consumeBuffs) ? item.consumeBuffs : [];
    if (buffs.length === 0) {
        return false;
    }
    return buffs.some((buff) => !isBuffActive(player, buff?.buffId));
}

function findVisibleMonsterInAutoCombatView(view, runtimeId) {
    if (typeof runtimeId !== 'string' || runtimeId.length === 0) {
        return null;
    }
    for (const monster of view?.localMonsters ?? []) {
        if (monster?.runtimeId === runtimeId) {
            return monster;
        }
    }
    return null;
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

function resolveAutoBattleEffectiveSkillRange(player, skill, action) {
    const hasAuthoritativeSkillRange = Number.isFinite(Number(skill?.targeting?.range))
        || Number.isFinite(Number(skill?.range));
    const skillRange = buildEffectiveTargetingGeometry({
        range: resolveRuntimeSkillRange(skill),
        shape: skill.targeting?.shape ?? 'single',
        radius: skill.targeting?.radius,
        innerRadius: skill.targeting?.innerRadius,
        width: skill.targeting?.width,
        height: skill.targeting?.height,
        checkerParity: skill.targeting?.checkerParity,
    }, {
        extraRange: Math.max(0, Math.floor(Number(player?.attrs?.numericStats?.extraRange ?? 0))),
        extraArea: Math.max(0, Math.floor(Number(player?.attrs?.numericStats?.extraArea ?? 0))),
    }).range;
    const requiresTarget = resolveSkillRequiresTarget(skill);
    const fallbackActionRange = Number.isFinite(Number(action?.range))
        ? Math.max(requiresTarget === false ? 0 : 1, Math.round(Number(action.range)))
        : skillRange;
    const baseRange = hasAuthoritativeSkillRange ? skillRange : fallbackActionRange;
    return Math.max(requiresTarget === false ? 0 : 1, Math.round(Number(baseRange) || 0));
}

function buildAutoBattleSkillLookup(player) {
    const techniqueState = player?.techniques;
    if (!techniqueState || typeof techniqueState !== 'object') {
        return null;
    }
    const revision = Math.max(0, Math.trunc(Number(techniqueState.revision ?? 0) || 0));
    const cached = autoBattleSkillLookupCacheByTechniqueState.get(techniqueState);
    if (cached?.revision === revision) {
        return cached.lookup;
    }
    if (!Array.isArray(techniqueState.techniques) || techniqueState.techniques.length === 0) {
        autoBattleSkillLookupCacheByTechniqueState.set(techniqueState, { revision, lookup: null });
        return null;
    }
    const lookup = new Map();
    for (const technique of techniqueState.techniques) {
        for (const skill of technique.skills ?? []) {
            const skillId = skill?.id;
            if (typeof skillId !== 'string' || skillId.length === 0 || lookup.has(skillId)) {
                continue;
            }
            lookup.set(skillId, skill);
        }
    }
    autoBattleSkillLookupCacheByTechniqueState.set(techniqueState, { revision, lookup });
    return lookup;
}

function findAutoBattlePlayerSkill(player, skillId, skillLookup = null) {
    if (skillLookup) {
        return skillLookup.get(skillId) ?? null;
    }
    if (!Array.isArray(player?.techniques?.techniques)) {
        return null;
    }
    return findPlayerSkill(player, skillId);
}

function findAutoUsePillInventoryItemRef(player, itemId) {
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
        const itemInstanceId = typeof item.itemInstanceId === 'string' && item.itemInstanceId.trim().length > 0
            ? item.itemInstanceId.trim()
            : '';
        if (!itemInstanceId) {
            continue;
        }
        return { item, itemInstanceId };
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
    worldRuntimeThreatService;
    unreachableThreatReductionByPlayerId = new Map();
    /** T-08: 自动战斗寻路路径缓存（per-player）。 */
    pathCacheByPlayerId = new Map<string, {
        targetX: number;
        targetY: number;
        path: { x: number; y: number }[];
        pathIndex: number;
    }>();
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(WorldRuntimeThreatService) worldRuntimeThreatService: any = undefined,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeThreatService = worldRuntimeThreatService ?? new WorldRuntimeThreatService();
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
                const match = findAutoUsePillInventoryItemRef(player, config?.itemId);
                if (!match || !shouldAutoUsePill(player, match.item, config?.conditions)) {
                    continue;
                }
                try {
                    this.playerRuntimeService.useItemByInstanceId(playerId, match.itemInstanceId);
                    if (typeof deps.refreshQuestStates === 'function') {
                        deps.refreshQuestStates(playerId);
                    }
                    if (typeof deps.queuePlayerNotice === 'function') {
                        const itemName = getItemDisplayName(match.item);
                        const n = buildStructuredNotice('success', 'notice.combat.auto-use-item', `自动使用 ${itemName}`, { vars: { itemName }, pills: [{ key: 'itemName', style: 'target' }] });
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
    /** materializeAutoUsePillsForInstance：只为指定实例的玩家自动使用丹药（加速 tick 补偿用）。 */
    materializeAutoUsePillsForInstance(instanceId, deps) {
        for (const playerId of deps.listConnectedPlayerIds()) {
            if (typeof deps.hasPendingCommand === 'function' && deps.hasPendingCommand(playerId)) {
                continue;
            }
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || player.hp <= 0) {
                continue;
            }
            const location = deps.getPlayerLocation(playerId);
            if (!location || location.instanceId !== instanceId) {
                continue;
            }
            const configs = Array.isArray(player.combat?.autoUsePills)
                ? player.combat.autoUsePills.slice(0, AUTO_USE_PILL_SLOT_LIMIT)
                : [];
            if (configs.length === 0) {
                continue;
            }
            for (const config of configs) {
                const match = findAutoUsePillInventoryItemRef(player, config?.itemId);
                if (!match || !shouldAutoUsePill(player, match.item, config?.conditions)) {
                    continue;
                }
                try {
                    this.playerRuntimeService.useItemByInstanceId(playerId, match.itemInstanceId);
                    if (typeof deps.refreshQuestStates === 'function') {
                        deps.refreshQuestStates(playerId);
                    }
                    if (typeof deps.queuePlayerNotice === 'function') {
                        const itemName = getItemDisplayName(match.item);
                        const n = buildStructuredNotice('success', 'notice.combat.auto-use-item', `自动使用 ${itemName}`, { vars: { itemName }, pills: [{ key: 'itemName', style: 'target' }] });
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
    /** materializeAutoCombatCommandsForInstance：只为指定实例的玩家物化自动战斗命令（加速 tick 补偿用）。 */
    materializeAutoCombatCommandsForInstance(instanceId, deps) {
        for (const playerId of deps.listConnectedPlayerIds()) {
            if (deps.hasPendingCommand(playerId) || deps.worldRuntimeNavigationService.hasNavigationIntent(playerId)) {
                continue;
            }
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || player.hp <= 0) {
                continue;
            }
            const location = deps.getPlayerLocation(playerId);
            if (!location || location.instanceId !== instanceId) {
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
        const viewStartedAt = performance.now();
        const view = typeof instance.buildAutoCombatView === 'function'
            ? instance.buildAutoCombatView(player.playerId, radius)
            : instance.buildPlayerView(player.playerId, radius);
        recordAutoCombatPerf(deps, 'tick.autoCombat.viewMs', viewStartedAt);
        if (!view) {
            return null;
        }
        if (!instanceSupportsPvp(instance) && isPlayerTargetRef(player.combat?.combatTargetId)) {
            this.playerRuntimeService.clearCombatTarget(player.playerId, deps.resolveCurrentTickForPlayerId(player.playerId));
        }
        const threatRefreshStartedAt = performance.now();
        this.refreshPlayerThreats(instance, player, view, deps);
        recordAutoCombatPerf(deps, 'tick.autoCombat.threatRefreshMs', threatRefreshStartedAt);
        const targetSelectStartedAt = performance.now();
        const target = this.selectAutoCombatTarget(instance, player, view, deps, options);
        recordAutoCombatPerf(deps, 'tick.autoCombat.targetSelectMs', targetSelectStartedAt);
        if (!target) {
            return null;
        }
        if (target.playerId && !instanceSupportsPvp(instance)) {
            return null;
        }
        if (inSafeZone && target.playerId) {
            return null;
        }
        const distance = chebyshevDistance(player.x, player.y, target.x, target.y);
        const skillChoiceStartedAt = performance.now();
        const skillChoice = target.supportsSkill === false
            ? null
            : this.resolveAutoBattleSkillChoice(player, distance, options);
        recordAutoCombatPerf(deps, 'tick.autoCombat.skillChoiceMs', skillChoiceStartedAt);
        if (skillChoice?.skillId) {
            // selfCast（以自身为中心的 AOE）不需要对目标做 LOS 检查
            if (skillChoice.selfCast) {
                return attachMiningJobCommandMarker({
                    kind: 'castSkill',
                    skillId: skillChoice.skillId,
                    targetPlayerId: null,
                    targetMonsterId: null,
                    targetRef: null,
                    autoCombat: true,
                }, player, target);
            }
            // LOS 预检：避免对视线被遮挡的目标发出必然失败的 castSkill 指令
            const losRange = Math.max(1, Math.round(skillChoice.range ?? 1));
            const losStartedAt = performance.now();
            const hasLineOfSight = typeof instance.canSeeTileFrom !== 'function'
                || instance.canSeeTileFrom(player.x, player.y, target.x, target.y, losRange) !== false;
            recordAutoCombatPerf(deps, 'tick.autoCombat.losCheckMs', losStartedAt);
            if (!hasLineOfSight) {
                // 视线不通 → 尝试寻路靠近；stationary 模式直接放弃
                if (player.combat.autoBattleStationary) {
                    return null;
                }
                const losPathStartedAt = performance.now();
                const losPathResult = findPathToTargetWithinRangeOnMap(instance, player.playerId, player.x, player.y, target.x, target.y, losRange, false, (x, y) => instance.canSeeTileFrom(x, y, target.x, target.y, losRange) !== false);
                recordAutoCombatPerf(deps, 'tick.autoCombat.losPathMs', losPathStartedAt);
                if (!losPathResult || losPathResult.points.length === 0) {
                    return this.handleUnreachableAutoCombatTarget(instance, player, target, deps, options);
                }
                const losDirection = directionFromStep(player.x, player.y, losPathResult.points[0].x, losPathResult.points[0].y);
                if (losDirection === null) {
                    return null;
                }
                const losMaxSteps = resolveInitialRunLength(losPathResult.points, player.x, player.y, losDirection);
                return attachMiningJobCommandMarker({
                    kind: 'move',
                    direction: losDirection,
                    continuous: true,
                    maxSteps: losMaxSteps,
                    path: losPathResult.points.map((entry) => ({ x: entry.x, y: entry.y })),
                    autoCombat: true,
                }, player, target);
            }
            if (target.targetMonsterId) {
                return attachMiningJobCommandMarker({
                    kind: 'castSkill',
                    skillId: skillChoice.skillId,
                    targetPlayerId: null,
                    targetMonsterId: target.targetMonsterId,
                    targetRef: null,
                    autoCombat: true,
                }, player, target);
            }
            return attachMiningJobCommandMarker({
                kind: 'castSkill',
                skillId: skillChoice.skillId,
                targetPlayerId: null,
                targetMonsterId: null,
                targetRef: target.targetRef,
                autoCombat: true,
            }, player, target);
        }
        if (distance <= 1) {
            // 近战基础攻击也做 LOS 预检
            const meleeLosStartedAt = performance.now();
            const meleeHasLineOfSight = typeof instance.canSeeTileFrom !== 'function'
                || instance.canSeeTileFrom(player.x, player.y, target.x, target.y, 1) !== false;
            recordAutoCombatPerf(deps, 'tick.autoCombat.losCheckMs', meleeLosStartedAt);
            if (!meleeHasLineOfSight) {
                return null;
            }
            return attachMiningJobCommandMarker(buildBasicAttackCommandFromAttackableTarget(target), player, target);
        }
        if (player.combat.autoBattleStationary) {
            return null;
        }
        const desiredRange = Math.max(1, Math.round(skillChoice?.range ?? 1));
        const pathStartedAt = performance.now();
        const pathResult = this.findPathWithCache(instance, player, target.x, target.y, desiredRange);
        recordAutoCombatPerf(deps, 'tick.autoCombat.pathMs', pathStartedAt);
        if (!pathResult || pathResult.points.length === 0) {
            return this.handleUnreachableAutoCombatTarget(instance, player, target, deps, options);
        }
        const direction = directionFromStep(player.x, player.y, pathResult.points[0].x, pathResult.points[0].y);
        if (direction === null) {
            return null;
        }
        const maxSteps = resolveInitialRunLength(pathResult.points, player.x, player.y, direction);
        return attachMiningJobCommandMarker({
            kind: 'move',
            direction,
            continuous: true,
            maxSteps,
            path: pathResult.points.map((entry) => ({ x: entry.x, y: entry.y })),
            autoCombat: true,
        }, player, target);
    }
    /**
 * handleUnreachableAutoCombatTarget：当前目标不可达时降权并立即重选。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param target 当前目标。
 * @param deps 运行时依赖。
 * @param options 构建选项。
 * @returns 返回重选后的命令或空。
 */

    handleUnreachableAutoCombatTarget(instance, player, target, deps, options = undefined) {
        if (options?.retargetingAfterUnreachable === true) {
            return null;
        }
        const targetRef = typeof target?.targetRef === 'string' ? target.targetRef.trim() : '';
        const currentTargetRef = typeof player?.combat?.combatTargetId === 'string'
            ? player.combat.combatTargetId.trim()
            : '';
        if (!targetRef || currentTargetRef !== targetRef) {
            return null;
        }
        let reducedTargets = this.unreachableThreatReductionByPlayerId.get(player.playerId);
        if (!reducedTargets) {
            reducedTargets = new Set();
            this.unreachableThreatReductionByPlayerId.set(player.playerId, reducedTargets);
        }
        if (!reducedTargets.has(targetRef)) {
            reducedTargets.add(targetRef);
            this.worldRuntimeThreatService.multiplyThreat(
                this.worldRuntimeThreatService.buildPlayerOwnerId(player.playerId),
                targetRef,
                AUTO_UNREACHABLE_TARGET_THREAT_MULTIPLIER,
            );
        }
        const currentTick = deps.resolveCurrentTickForPlayerId(player.playerId);
        this.playerRuntimeService.clearManualEngagePending?.(player.playerId);
        this.playerRuntimeService.clearCombatTarget(player.playerId, currentTick);
        const refreshedPlayer = this.playerRuntimeService.getPlayer(player.playerId) ?? player;
        return this.buildAutoCombatCommand(instance, refreshedPlayer, deps, {
            ...(options ?? {}),
            retargetingAfterUnreachable: true,
        });
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
    /** refreshPlayerThreats：按当前视野刷新玩家仇恨表，失效目标做衰减而不是立即清空。 */
    refreshPlayerThreats(instance, player, view, deps) {
        const ownerId = this.worldRuntimeThreatService.buildPlayerOwnerId(player.playerId);
        const activeTargetIds = new Set();
        const currentTick = deps.resolveCurrentTickForPlayerId(player.playerId);
        const extraAggroRate = Number(player?.attrs?.numericStats?.extraAggroRate ?? 0) || 0;
        const monsterRelation = resolveCombatRelation(player, { kind: 'monster' });
        const monsterHostile = isHostileRelation(monsterRelation);
        for (const monster of view.localMonsters ?? []) {
            const liveMonster = instance.getMonster(monster.runtimeId);
            if (!liveMonster?.alive) {
                continue;
            }
            const retaliating = liveMonster.aggroTargetPlayerId === player.playerId;
            if (!player.combat.autoBattle && !retaliating) {
                continue;
            }
            if (!monsterHostile && !retaliating) {
                continue;
            }
            const distance = chebyshevDistance(player.x, player.y, monster.x, monster.y);
            activeTargetIds.add(monster.runtimeId);
            this.worldRuntimeThreatService.addThreat(ownerId, monster.runtimeId, {
                baseThreat: DEFAULT_PASSIVE_THREAT_PER_TICK,
                distance,
                extraAggroRate,
                now: currentTick,
            });
        }
        if (instanceSupportsPvp(instance)) {
            for (const visible of view.visiblePlayers ?? []) {
                const target = this.playerRuntimeService.getPlayer(visible.playerId);
                if (!target || target.instanceId !== player.instanceId || target.hp <= 0) {
                    continue;
                }
                if (instance.isPointInSafeZone(player.x, player.y) || instance.isPointInSafeZone(target.x, target.y)) {
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
                const targetRef = this.worldRuntimeThreatService.buildPlayerTargetId(target.playerId);
                activeTargetIds.add(targetRef);
                this.worldRuntimeThreatService.addThreat(ownerId, targetRef, {
                    baseThreat: DEFAULT_PASSIVE_THREAT_PER_TICK,
                    distance: chebyshevDistance(player.x, player.y, target.x, target.y),
                    extraAggroRate,
                    now: currentTick,
                });
            }
        }
        this.worldRuntimeThreatService.decayMissingTargets(ownerId, activeTargetIds, player.maxHp, currentTick);
    }
    /**
 * selectAutoCombatTarget：读取selectAuto战斗目标并返回结果。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param visibleMonsters 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新selectAuto战斗目标相关状态。
 */

    selectAutoCombatTarget(instance, player, view, deps, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const retaliateStartedAt = performance.now();
        const retaliateTarget = this.resolveRetaliatePlayerOverrideTarget(instance, player, deps);
        recordAutoCombatPerf(deps, 'tick.autoCombat.retargetOverrideMs', retaliateStartedAt);
        if (retaliateTarget) {
            return retaliateTarget;
        }
        const shouldPreferTrackedTarget = player.combat.combatTargetLocked === true
            || player.combat.manualEngagePending === true;
        if (shouldPreferTrackedTarget && options?.retargetingAfterUnreachable !== true) {
            const trackedStartedAt = performance.now();
            const trackedTarget = this.resolveTrackedAutoCombatTarget(instance, player, view, deps);
            recordAutoCombatPerf(deps, 'tick.autoCombat.trackedTargetMs', trackedStartedAt);
            if (trackedTarget) {
                return trackedTarget;
            }
        }
        const candidates = this.collectThreatTargetCandidates(instance, player, view, deps);
        if (candidates.length === 0) {
            return null;
        }
        const scoreStartedAt = performance.now();
        const metrics = {
            nearestDistance: candidates.reduce((min, candidate) => Math.min(min, candidate.distance), Number.POSITIVE_INFINITY),
            lowestHpRatio: candidates.reduce((min, candidate) => Math.min(min, candidate.hpRatio), Number.POSITIVE_INFINITY),
            highestHpRatio: candidates.reduce((max, candidate) => Math.max(max, candidate.hpRatio), Number.NEGATIVE_INFINITY),
        };
        let bestCandidate = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const candidate of candidates) {
            const score = candidate.threatValue
                * resolveThreatDistanceMultiplier(candidate.distance)
                * getAutoTargetingPreferenceMultiplier(player.combat.autoBattleTargetingMode, candidate, metrics);
            if (
                score > bestScore
                || (score === bestScore && bestCandidate && candidate.threatValue > bestCandidate.threatValue)
                || (score === bestScore && bestCandidate && candidate.distance < bestCandidate.distance)
                || (score === bestScore && bestCandidate && candidate.distance === bestCandidate.distance && candidate.tieBreaker < bestCandidate.tieBreaker)
            ) {
                bestCandidate = candidate;
                bestScore = score;
            }
        }
        recordAutoCombatPerf(deps, 'tick.autoCombat.candidateScoreMs', scoreStartedAt, candidates.length);
        if (!bestCandidate) {
            return null;
        }
        if (player.combat.autoBattle && player.combat.combatTargetId !== bestCandidate.target.targetRef) {
            const setTargetStartedAt = performance.now();
            this.unreachableThreatReductionByPlayerId.delete(player.playerId);
            this.playerRuntimeService.setCombatTarget(player.playerId, bestCandidate.target.targetRef, false, deps.resolveCurrentTickForPlayerId(player.playerId));
            recordAutoCombatPerf(deps, 'tick.autoCombat.setTargetMs', setTargetStartedAt);
        }
        return bestCandidate.target;
    }
    collectThreatTargetCandidates(instance, player, view, deps = undefined) {
        const ownerId = this.worldRuntimeThreatService.buildPlayerOwnerId(player.playerId);
        const threatEntriesStartedAt = performance.now();
        const entries = this.worldRuntimeThreatService.getThreatEntries(ownerId, DEFAULT_AGGRO_THRESHOLD, { sort: false });
        recordAutoCombatPerf(deps, 'tick.autoCombat.threatEntriesMs', threatEntriesStartedAt);
        if (entries.length === 0) {
            return [];
        }
        const candidateBuildStartedAt = performance.now();
        const supportsPvp = instanceSupportsPvp(instance);
        const visibleMonstersById = new Map();
        for (const monster of view.localMonsters ?? []) {
            if (typeof monster?.runtimeId === 'string') {
                visibleMonstersById.set(monster.runtimeId, monster);
            }
        }
        const visiblePlayerIds = new Set();
        for (const visible of view.visiblePlayers ?? []) {
            if (typeof visible?.playerId === 'string') {
                visiblePlayerIds.add(visible.playerId);
            }
        }
        const candidates = [];
        const monsterRelation = resolveCombatRelation(player, { kind: 'monster' });
        const monsterHostile = isHostileRelation(monsterRelation);
        for (const entry of entries) {
            if (entry.targetId.startsWith('player:')) {
                if (!supportsPvp) {
                    continue;
                }
                const targetPlayerId = entry.targetId.slice('player:'.length);
                if (!visiblePlayerIds.has(targetPlayerId)) {
                    continue;
                }
                const target = this.playerRuntimeService.getPlayer(targetPlayerId);
                if (!target || target.instanceId !== player.instanceId || target.hp <= 0) {
                    continue;
                }
                if (instance.isPointInSafeZone(player.x, player.y) || instance.isPointInSafeZone(target.x, target.y)) {
                    continue;
                }
                const relation = resolveCombatRelation(player, {
                    kind: 'player',
                    target,
                });
                if (!isHostileRelation(relation)) {
                    continue;
                }
                const priority = resolveAutoCombatPlayerPriority(relation);
                const distance = chebyshevDistance(player.x, player.y, target.x, target.y);
                candidates.push({
                    kind: 'player',
                    target: {
                        kind: 'player',
                        playerId: target.playerId,
                        targetPlayerId: target.playerId,
                        targetRef: entry.targetId,
                        x: target.x,
                        y: target.y,
                        hp: target.hp,
                        maxHp: target.maxHp,
                        distance,
                        priority,
                    },
                    distance,
                    hp: target.hp,
                    maxHp: target.maxHp,
                    hpRatio: getAutoTargetHpRatio({ hp: target.hp, maxHp: target.maxHp }),
                    aggroRank: priority >= 3 ? 1 : 0,
                    priority,
                    isBoss: false,
                    tieBreaker: target.playerId,
                    threatValue: entry.value,
                });
                continue;
            }
            const monster = visibleMonstersById.get(entry.targetId);
            if (!monster) {
                continue;
            }
            const liveMonster = instance.getMonster(monster.runtimeId);
            if (!liveMonster?.alive) {
                continue;
            }
            const retaliating = liveMonster.aggroTargetPlayerId === player.playerId;
            if (!player.combat.autoBattle && !retaliating) {
                continue;
            }
            if (!monsterHostile && !retaliating) {
                continue;
            }
            const distance = chebyshevDistance(player.x, player.y, monster.x, monster.y);
            const aggroRank = retaliating ? 1 : 0;
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
                threatValue: entry.value,
            });
        }
        recordAutoCombatPerf(deps, 'tick.autoCombat.candidateBuildMs', candidateBuildStartedAt, entries.length);
        return candidates;
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
        const radius = isMiningJobTargetRef(player, targetRuntimeId)
            ? undefined
            : Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        const visibleMonster = Number.isFinite(radius)
            ? findVisibleMonsterInAutoCombatView(view, targetRuntimeId)
            : null;
        if (visibleMonster) {
            const liveMonster = typeof instance?.getMonster === 'function' ? instance.getMonster(targetRuntimeId) : null;
            if (liveMonster?.alive && isHostileRelation(resolveCombatRelation(player, { kind: 'monster' }))) {
                return this.normalizeAutoCombatMonsterTarget(visibleMonster);
            }
        }
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

    resolveFirstUsableAutoBattleSkill(player, options = undefined, skillLookup = null, acceptChoice = undefined) {
        if (!Array.isArray(player?.actions?.actions)) {
            return null;
        }
        const activeSkillLookup = skillLookup ?? buildAutoBattleSkillLookup(player);
        const excludedSkillIds = options?.excludedSkillIds;
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
            const skill = findAutoBattlePlayerSkill(player, action.id, activeSkillLookup);
            if (!skill || excludedSkillIds?.has(skill.id)) {
                continue;
            }
            if (player.qi < resolveAutoBattleSkillQiCost(skill.cost, player.attrs.numericStats.maxQiOutputPerTick)) {
                continue;
            }
            if (isAutoSelfBuffSkill(skill)) {
                if (shouldAutoCastSelfBuffSkill(player, skill)) {
                    const choice = { skill, action, range: 0, selfCast: true };
                    if (!acceptChoice || acceptChoice(choice)) {
                        return choice;
                    }
                }
                continue;
            }
            if (resolveSkillRequiresTarget(skill) === false && (action.range ?? 0) === 0) {
                const choice = {
                    skill,
                    action,
                    range: Math.max(1, resolveSkillAoeCoverRadius(skill)),
                    selfCast: true,
                };
                if (!acceptChoice || acceptChoice(choice)) {
                    return choice;
                }
                continue;
            }
            const choice = {
                skill,
                action,
                range: Math.max(1, Math.round(resolveAutoBattleEffectiveSkillRange(player, skill, action))),
                selfCast: false,
            };
            if (!acceptChoice || acceptChoice(choice)) {
                return choice;
            }
        }
        return null;
    }

    /**
 * pickAutoBattleSkill：执行pickAutoBattle技能相关逻辑。
 * @param player 玩家对象。
 * @param distance 参数说明。
 * @returns 无返回值，直接更新pickAutoBattle技能相关状态。
 */

    resolveAutoBattleSkillChoice(player, distance, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const skillLookup = buildAutoBattleSkillLookup(player);
        const choice = this.resolveFirstUsableAutoBattleSkill(player, options, skillLookup);
        if (!choice) {
            return null;
        }
        if (choice.selfCast && isAutoSelfBuffSkill(choice.skill)) {
            return { skillId: choice.skill.id, range: 0, selfCast: true };
        }
        const range = Math.max(1, Math.round(choice.range));
        if (distance <= range) {
            return {
                skillId: choice.skill.id,
                range,
                selfCast: choice.selfCast === true,
            };
        }
        const inRangeChoice = this.resolveFirstUsableAutoBattleSkill(player, options, skillLookup, (candidate) => {
            if (candidate.selfCast && isAutoSelfBuffSkill(candidate.skill)) {
                return true;
            }
            const candidateRange = Math.max(1, Math.round(candidate.range));
            return distance <= candidateRange;
        });
        if (inRangeChoice) {
            const inRange = Math.max(1, Math.round(inRangeChoice.range));
            return {
                skillId: inRangeChoice.skill.id,
                range: inRange,
                selfCast: inRangeChoice.selfCast === true,
            };
        }
        return {
            skillId: null,
            range,
        };
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

        const skillLookup = buildAutoBattleSkillLookup(player);
        const choice = this.resolveFirstUsableAutoBattleSkill(player, options, skillLookup);
        if (!choice || isAutoSelfBuffSkill(choice.skill)) {
            return 1;
        }
        return Math.max(1, Math.round(choice.range));
    }

    /**
     * T-08: 自动战斗寻路路径缓存。
     * 缓存上一次寻路结果，下一 tick 检查目标是否移动 + 路径下一步是否可通行。
     * 目标移动判定：曼哈顿距离 ≥ 2 格时重规划。
     */
    findPathWithCache(instance, player, targetX: number, targetY: number, desiredRange: number) {
        const playerId = player.playerId;
        const cached = this.pathCacheByPlayerId.get(playerId);
        if (cached) {
            const targetMoved = Math.abs(targetX - cached.targetX) + Math.abs(targetY - cached.targetY) >= 2;
            if (!targetMoved && cached.pathIndex < cached.path.length) {
                const nextStep = cached.path[cached.pathIndex];
                const nextStepFree = instance.isWalkable?.(nextStep.x, nextStep.y) !== false
                    && instance.getOccupancy?.(nextStep.x, nextStep.y) == null;
                if (nextStepFree) {
                    // 复用缓存路径
                    const remainingPath = cached.path.slice(cached.pathIndex);
                    cached.pathIndex += 1;
                    return { points: remainingPath, cost: remainingPath.length };
                }
            }
        }
        // 重新规划
        const pathResult = findPathToTargetWithinRangeOnMap(
            instance, player.playerId, player.x, player.y, targetX, targetY, desiredRange, false,
        );
        if (pathResult && pathResult.points.length > 0) {
            this.pathCacheByPlayerId.set(playerId, {
                targetX,
                targetY,
                path: pathResult.points.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
                pathIndex: 1,
            });
        } else {
            this.pathCacheByPlayerId.delete(playerId);
        }
        return pathResult;
    }
};
