/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 从 world-runtime-player-skill-dispatch.service.ts 抽取的玩家技能派发辅助函数（头部+尾部游离函数）。
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
    TileType,
    applyCombatAttackIntensityQiCost,
    buildEffectiveTargetingGeometry,
    calcQiCostWithOutputLimit,
    computeAffectedCellsFromAnchor,
    formatDisplayNumber,
    horizontalFacingFromTo,
    isOreMinableTileType,
    resolveCooldownTicks,
    resolvePlayerFacingContentName,
    resolveSkillRequiresTarget,
    resolveTargetingGeometryMaxTargets,
    uiLabels,
} from '@mud/shared';
import { resolveMonsterCombatExpEquivalentFallback } from '../../combat/monster-combat-exp-equivalent.helper';
import { isHostileCombatRelationResolution } from '../../player/player-combat-config.helpers';
import { resolveSuppressedMonsterNumericStats } from './formation-combat-effect.helpers';
import {
    resolveCombatantCraftSkillLevel,
    resolveCraftSkillKindFromFormulaVar,
} from '../../combat/skill-formula-craft-level.helpers';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';
import * as world_runtime_path_planning_helpers_1 from '../world-runtime.path-planning.helpers';
import * as world_runtime_observation_helpers_1 from '../query/world-runtime.observation.helpers';

const { findPlayerSkill, getSkillEffectColor, resolveRuntimeSkillRange } = world_runtime_normalization_helpers_1;
const { chebyshevDistance } = world_runtime_path_planning_helpers_1;
const { createTileCombatAttributes, createTileCombatNumericStats, createTileCombatRatioDivisors } = world_runtime_observation_helpers_1;
const {
    buildCombatNoticePayload,
    formatCombatActionClause,
    formatCombatDamageBreakdown,
    formatCombatResolutionOutcome,
    formatTargetLabelWithHp,
} = world_runtime_observation_helpers_1;
export type AnyRecord = Record<string, any>;

export const BASE_CHANT_TICK_DURATION_MS = 1000;
export const CHANT_LABEL_EXTRA_DURATION_MS = 240;

export function resolveMonsterDisplayName(monster) {
    return resolvePlayerFacingContentName(monster?.monsterId ?? monster?.runtimeId, '未知妖兽', monster?.name);
}

export function ensureHostileRelation(resolution) {
    if (isHostileCombatRelationResolution(resolution)) {
        return;
    }
    if (resolution?.blockedReason === 'self_target') {
        throw new BadRequestException('不能攻击自己');
    }
    throw new BadRequestException('当前目标不在敌方判定规则内');
}
export function ensureInstanceSupportsPlayerCombat(instance) {
    if (instance?.meta?.supportsPvp === true) {
        return;
    }
    throw new BadRequestException('当前实例不允许玩家互攻');
}
export function ensureInstanceSupportsTileDamage(instance) {
    if (instance?.meta?.canDamageTile === true) {
        return;
    }
    throw new BadRequestException('当前实例不允许攻击地块');
}
export function resolveMiningJobTargetRef(job) {
    if (!job || !Number.isFinite(Number(job.targetX)) || !Number.isFinite(Number(job.targetY))) {
        return '';
    }
    return `tile:${Math.trunc(Number(job.targetX))}:${Math.trunc(Number(job.targetY))}`;
}
export function isMiningJobIssuedSkillAction(attacker, targetRef) {
    const jobRunId = typeof attacker?.suppressCraftInterruptForMiningJobRunId === 'string'
        ? attacker.suppressCraftInterruptForMiningJobRunId.trim()
        : '';
    const job = attacker?.miningJob;
    if (!jobRunId || job?.jobRunId !== jobRunId) {
        return false;
    }
    const expectedTargetRef = resolveMiningJobTargetRef(job);
    const markerTargetRef = typeof attacker?.suppressCraftInterruptForMiningTargetRef === 'string'
        ? attacker.suppressCraftInterruptForMiningTargetRef.trim()
        : '';
    const commandTargetRef = typeof targetRef === 'string' ? targetRef.trim() : '';
    const actualTargetRef = markerTargetRef || commandTargetRef;
    return Boolean(expectedTargetRef) && actualTargetRef === expectedTargetRef;
}

export type PreparedSkillTileStates = {
    statesByTileIndex: Map<number, AnyRecord | null>;
    miningAoeHitCount: number;
};

export function resolveSkillTileIndex(instance: AnyRecord, target: AnyRecord): number {
    const x = Math.trunc(Number(target?.x));
    const y = Math.trunc(Number(target?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y) || typeof instance?.toTileIndex !== 'function') {
        return -1;
    }
    const tileIndex = instance.toTileIndex(x, y);
    return Number.isInteger(tileIndex) && tileIndex >= 0 ? tileIndex : -1;
}

export function prepareSkillTileStatesForMiningAoe(targets: readonly AnyRecord[], instance: AnyRecord): PreparedSkillTileStates | null {
    if (!Array.isArray(targets) || targets.length <= 1 || typeof instance?.getTileCombatState !== 'function') {
        return null;
    }
    const statesByTileIndex = new Map<number, AnyRecord | null>();
    let miningAoeHitCount = 0;
    for (const target of targets) {
        if (target?.kind !== 'tile') {
            continue;
        }
        const tileIndex = resolveSkillTileIndex(instance, target);
        if (tileIndex < 0 || statesByTileIndex.has(tileIndex)) {
            continue;
        }
        const state = target.state ?? instance.getTileCombatState(Math.trunc(Number(target.x)), Math.trunc(Number(target.y))) ?? null;
        statesByTileIndex.set(tileIndex, state);
        if (state?.destroyed !== true && isOreMinableTileType(state?.tileType)) {
            miningAoeHitCount += 1;
        }
    }
    return statesByTileIndex.size > 0 ? { statesByTileIndex, miningAoeHitCount } : null;
}

export function resolveSkillTileState(instance: AnyRecord, target: AnyRecord, prepared: PreparedSkillTileStates | null): AnyRecord | null {
    const tileIndex = resolveSkillTileIndex(instance, target);
    if (tileIndex >= 0 && prepared?.statesByTileIndex.has(tileIndex)) {
        const state = prepared.statesByTileIndex.get(tileIndex) ?? null;
        prepared.statesByTileIndex.delete(tileIndex);
        return state;
    }
    return typeof instance?.getTileCombatState === 'function'
        ? instance.getTileCombatState(target.x, target.y)
        : null;
}
export function formatAuraDamage(value) {
    const amount = Math.max(0, Number(value) || 0);
    if (amount <= 0) {
        return '0';
    }
    if (amount < 1) {
        return amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    }
    return formatDisplayNumber(amount, { compactMaximumFractionDigits: 2 });
}
export function resolveSkillDamageKind(skill) {
    const damageEffect = Array.isArray(skill?.effects)
        ? skill.effects.find((effect) => effect?.type === 'damage')
        : null;
    return damageEffect?.damageKind === 'physical' ? 'physical' : 'spell';
}
export function resolveSkillDamageElement(skill) {
    const damageEffect = Array.isArray(skill?.effects)
        ? skill.effects.find((effect) => effect?.type === 'damage')
        : null;
    return typeof damageEffect?.element === 'string' ? damageEffect.element : undefined;
}
export function resolvePrimaryDamageRoll(result, fallbackDamageKind, fallbackElement) {
    const firstRoll = Array.isArray(result?.damageRolls)
        ? result.damageRolls.find((entry) => entry && typeof entry === 'object')
        : null;
    if (firstRoll) {
        if (Number.isFinite(firstRoll.rawDamage)
            && Number.isFinite(firstRoll.damage)
            && firstRoll.damageKind
            && (firstRoll.element !== undefined || result?.damageElement === undefined)
            && (firstRoll.damageKind === result?.damageKind || result?.damageKind === undefined)) {
            return firstRoll;
        }
        return {
            ...firstRoll,
            rawDamage: Number.isFinite(Number(firstRoll.rawDamage))
                ? Number(firstRoll.rawDamage)
                : Math.max(0, Math.round(Number(result?.totalRawDamage ?? result?.totalDamage) || 0)),
            damage: Number.isFinite(Number(firstRoll.damage))
                ? Number(firstRoll.damage)
                : Math.max(0, Math.round(Number(result?.totalDamage) || 0)),
            damageKind: firstRoll.damageKind ?? result?.damageKind ?? fallbackDamageKind,
            element: firstRoll.element ?? result?.damageElement ?? fallbackElement,
        };
    }
    return {
        hit: Math.max(0, Math.round(Number(result?.totalDamage) || 0)) > 0,
        rawDamage: Math.max(0, Math.round(Number(result?.totalRawDamage ?? result?.totalDamage) || 0)),
        damage: Math.max(0, Math.round(Number(result?.totalDamage) || 0)),
        crit: result?.crit === true,
        dodged: result?.dodged === true,
        resolved: result?.resolved === true,
        broken: result?.broken === true,
        damageKind: result?.damageKind ?? fallbackDamageKind,
        element: result?.damageElement ?? fallbackElement,
    };
}

/** 单次施法复用地块战斗态，只刷新目标耐久，避免 AOE 按格分配完整数值对象。 */
export function createReusablePlayerSkillTileCombatTarget() {
    return {
        runtimeId: 'skill-cast-tile-target',
        monsterId: 'tile',
        hp: 1,
        maxHp: 1,
        qi: 0,
        maxQi: 0,
        attrs: {
            finalAttrs: createTileCombatAttributes(),
            numericStats: createTileCombatNumericStats(1),
            ratioDivisors: createTileCombatRatioDivisors(),
        },
        buffs: [],
    };
}

export function updateReusablePlayerSkillTileCombatTarget(target, hp, maxHp) {
    target.hp = Math.max(1, Math.round(Number(hp) || 1));
    target.maxHp = Math.max(1, Math.round(Number(maxHp) || target.hp));
    target.attrs.numericStats.maxHp = target.maxHp;
    return target;
}

/** 后续地块只复用目标伤害结果，施法者治疗、buff、资源和冷却仍只在首个有效目标执行。 */
export function createRepeatedPlayerSkillTileResult(result) {
    if (Math.max(0, Math.round(Number(result?.totalHeal) || 0)) <= 0
        && (!Array.isArray(result?.selfBuffs) || result.selfBuffs.length === 0)
        && Math.max(0, Math.round(Number(result?.qiCost) || 0)) <= 0) {
        return result;
    }
    return {
        ...result,
        qiCost: 0,
        totalHeal: 0,
        selfBuffs: [],
    };
}
export function resolveTickScaledChantDurationMs(ticks, tickSpeed = 1) {
    const normalizedTicks = Math.max(0, Math.trunc(Number(ticks) || 0));
    if (normalizedTicks <= 0) {
        return 0;
    }
    const normalizedSpeed = Number.isFinite(Number(tickSpeed)) && Number(tickSpeed) > 0
        ? Number(tickSpeed)
        : 1;
    return Math.max(1, Math.round((normalizedTicks * BASE_CHANT_TICK_DURATION_MS) / normalizedSpeed));
}
export function normalizeAppliedDamage(value, fallback = 0) {
    if (Number.isFinite(Number(value))) {
        return Math.max(0, Math.round(Number(value)));
    }
    return Math.max(0, Math.round(Number(fallback) || 0));
}
export function resolveTileCombatTargetName(tileState) {
    if (typeof tileState?.targetName === 'string' && tileState.targetName.trim()) {
        return tileState.targetName.trim();
    }
    return uiLabels.TILE_TYPE_LABELS[tileState?.tileType] ?? '地块';
}

export function recordPlayerSkillDispatchPerf(deps, key, startedAt, count = 1) {
    const recorder = deps?.recordPendingCommandSectionDuration;
    if (typeof recorder !== 'function') {
        return;
    }
    const durationMs = performance.now() - startedAt;
    if (Number.isFinite(durationMs) && durationMs >= 0) {
        recorder(key, durationMs, count);
    }
}

export function recordPlayerSkillDispatchDuration(deps, key, durationMs, count = 1) {
    const recorder = deps?.recordPendingCommandSectionDuration;
    if (typeof recorder !== 'function') {
        return;
    }
    if (Number.isFinite(durationMs) && durationMs >= 0) {
        recorder(key, durationMs, count);
    }
}

export function recordPlayerSkillOutcomeApplyPerf(deps, startedAt, attributionKey) {
    const recorder = deps?.recordPendingCommandSectionDuration;
    if (typeof recorder !== 'function') {
        return;
    }
    const durationMs = performance.now() - startedAt;
    if (!Number.isFinite(durationMs) || durationMs < 0) {
        return;
    }
    recorder('pendingCommands.castSkill.outcomeApplyMs', durationMs, 1);
    recorder(attributionKey, durationMs, 1);
}

export function isTimeChamberSkillDispatch(attacker, deps): boolean {
    return typeof attacker?.instanceId === 'string'
        && typeof deps?.timeChamberRuntimeService?.isTimeChamberInstance === 'function'
        && deps.timeChamberRuntimeService.isTimeChamberInstance(attacker.instanceId) === true;
}

export function resolveSkillTargetCountDurationKey(targetCount: number): string {
    if (targetCount <= 1) {
        return 'attribution.skill.resolve.targets1Ms';
    }
    if (targetCount <= 5) {
        return 'attribution.skill.resolve.targets2To5Ms';
    }
    if (targetCount <= 20) {
        return 'attribution.skill.resolve.targets6To20Ms';
    }
    return 'attribution.skill.resolve.targets21PlusMs';
}

export const PLAYER_SKILL_TARGET_PLAN_PROFILE_SAMPLE_RATE = 64;

export function buildEffectivePlayerSkillGeometry(attacker, skill) {
    return buildEffectiveTargetingGeometry({
        range: resolveRuntimeSkillRange(skill),
        shape: skill.targeting?.shape ?? 'single',
        radius: skill.targeting?.radius,
        innerRadius: skill.targeting?.innerRadius,
        width: skill.targeting?.width,
        height: skill.targeting?.height,
        checkerParity: skill.targeting?.checkerParity,
    }, {
        extraRange: Math.max(0, Math.floor(attacker.attrs?.numericStats?.extraRange ?? 0)),
        extraArea: Math.max(0, Math.floor(attacker.attrs?.numericStats?.extraArea ?? 0)),
    });
}

export function resolveSkillTargetLimit(skill, effectiveGeometry = null) {
    const configuredMaxTargets = skill.targeting?.maxTargets;
    if (Number.isFinite(Number(configuredMaxTargets)) && Number(configuredMaxTargets) >= 0) {
        return Math.max(0, Math.floor(Number(configuredMaxTargets)));
    }
    if (!Number.isFinite(configuredMaxTargets) || configuredMaxTargets === -1) {
        return resolveTargetingGeometryMaxTargets(effectiveGeometry ?? {
            range: resolveRuntimeSkillRange(skill),
            shape: skill.targeting?.shape ?? 'single',
            radius: skill.targeting?.radius,
            innerRadius: skill.targeting?.innerRadius,
            width: skill.targeting?.width,
            height: skill.targeting?.height,
            checkerParity: skill.targeting?.checkerParity,
        });
    }
    return Math.max(0, Math.floor(Number(configuredMaxTargets) || 0));
}

export function getTemporaryTileEffects(skill) {
    return (skill.effects ?? []).filter((effect) => effect?.type === 'temporary_tile');
}

export function isTemporaryTileSkill(skill) {
    return getTemporaryTileEffects(skill).length > 0;
}

export function isSelfBuffNoTargetSkill(skill) {
    const effects = Array.isArray(skill?.effects) ? skill.effects : [];
    return resolveSkillRequiresTarget(skill) === false
        && effects.length > 0
        && effects.every((effect) => effect?.type === 'buff' && effect.target === 'self');
}

export function isSelfAnchoredNoTargetSkill(skill) {
    return resolveSkillRequiresTarget(skill) === false
        && !isSelfBuffNoTargetSkill(skill)
        && resolveRuntimeSkillRange(skill) <= 0;
}

export function hasHealOrAlliesEffect(skill) {
    const effects = Array.isArray(skill?.effects) ? skill.effects : [];
    return effects.some((effect) =>
        effect?.type === 'heal'
        || (effect?.type === 'buff' && effect.target === 'allies'));
}

export function resolveTechniqueLevelForSkill(player, skillId) {
    for (const technique of player.techniques?.techniques ?? []) {
        if ((technique.skills ?? []).some((entry) => entry.id === skillId)) {
            return Math.max(1, Math.trunc(Number(technique.level) || 1));
        }
    }
    return 1;
}

export function spendSkillCostAndStartCooldown(playerRuntimeService, attacker, skill, currentTick, instance = null) {
    const readyTick = normalizePlayerSkillCooldownReadyTick(attacker, skill, currentTick);
    if (currentTick < readyTick) {
        throw new BadRequestException(`技能 ${skill.id} 尚在冷却`);
    }
    const plannedCost = Math.max(0, Math.round(Number(skill.cost) || 0));
    const standardQiCost = Math.round(calcQiCostWithOutputLimit(plannedCost, Math.max(0, attacker.attrs?.numericStats?.maxQiOutputPerTick ?? 0)));
    const qiCost = applyCombatAttackIntensityQiCost(standardQiCost, attacker.combat?.combatAttackIntensity);
    if (qiCost > 0) {
        if (!Number.isFinite(qiCost) || attacker.qi < qiCost) {
            throw new BadRequestException(`技能 ${skill.id} 元气不足`);
        }
        playerRuntimeService.spendQi(attacker.playerId, qiCost);
        instance?.disperseQiAt?.(attacker.x, attacker.y, qiCost);
    }
    playerRuntimeService.setSkillCooldownReadyTick(attacker.playerId, skill.id, currentTick + resolvePlayerSkillCooldownTicks(attacker, skill.cooldown), currentTick);
    return qiCost;
}
export function normalizePlayerSkillCooldownReadyTick(attacker, skill, currentTick) {
    const cooldowns = attacker?.combat?.cooldownReadyTickBySkillId;
    if (!cooldowns || !skill?.id) {
        return 0;
    }
    const readyTick = Math.max(0, Math.trunc(Number(cooldowns[skill.id] ?? 0)));
    if (readyTick <= 0) {
        return 0;
    }
    const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
    const remainingTicks = readyTick - normalizedCurrentTick;
    const maxCooldownTicks = resolvePlayerSkillCooldownTicks(attacker, skill.cooldown);
    if (remainingTicks <= 0 || remainingTicks > maxCooldownTicks) {
        delete cooldowns[skill.id];
        return 0;
    }
    return readyTick;
}
export function resolvePlayerSkillCooldownTicks(attacker, cooldown) {
    const cooldownSpeed = Math.trunc(Number(attacker.attrs?.numericStats?.cooldownSpeed ?? 0));
    return resolveCooldownTicks(cooldown, cooldownSpeed);
}
export function getPlayerSkillWarningColor(skill) {
    return typeof skill?.playerCast?.warningColor === 'string' && skill.playerCast.warningColor.trim().length > 0
        ? skill.playerCast.warningColor.trim()
        : undefined;
}
export function resolvePlayerSkillFacingAnchor(attacker, targets, castOptions = undefined) {
    const optionX = Number(castOptions?.targetX);
    const optionY = Number(castOptions?.targetY);
    if (Number.isFinite(optionX) && Number.isFinite(optionY)) {
        return { x: Math.trunc(optionX), y: Math.trunc(optionY) };
    }
    const target = (Array.isArray(targets) ? targets : [])
        .find((entry) => entry?.kind !== 'self' && Number.isFinite(Number(entry?.x)) && Number.isFinite(Number(entry?.y)));
    if (!target) {
        return null;
    }
    return { x: Math.trunc(Number(target.x)), y: Math.trunc(Number(target.y)) };
}
export function applyPlayerHorizontalFacingToward(playerRuntimeService, instance, attacker, anchor) {
    if (!anchor || !Number.isFinite(Number(anchor.x)) || !Number.isFinite(Number(anchor.y))) {
        return;
    }
    const nextFacing = horizontalFacingFromTo(attacker.x, attacker.y, anchor.x, anchor.y, attacker.facing);
    if (attacker.facing === nextFacing) {
        return;
    }
    attacker.facing = nextFacing;
    attacker.selfRevision += 1;
    if (instance) {
        instance.markAoiViewChangedAt?.(attacker.x, attacker.y);
        instance.worldRevision += 1;
    }
    playerRuntimeService.markPersistenceDirtyDomains?.(attacker, ['world_anchor', 'position_checkpoint']);
    playerRuntimeService.bumpPersistentRevision?.(attacker);
}
export function buildPlayerSkillAffectedCells(attacker, skill, anchor, effectiveGeometry = null) {
    const geometry = effectiveGeometry ?? buildEffectivePlayerSkillGeometry(attacker, skill);
    const shape = geometry.shape ?? 'single';
    if (shape === 'single') {
        return chebyshevDistance(attacker.x, attacker.y, anchor.x, anchor.y) <= geometry.range
            ? [{ x: anchor.x, y: anchor.y }]
            : [];
    }
    return computeAffectedCellsFromAnchor({ x: attacker.x, y: attacker.y }, anchor, geometry);
}
export function resolveResolvedTargetAnchor(attacker, resolvedTarget, deps) {
    if (!resolvedTarget) {
        return null;
    }
    if (resolvedTarget.kind === 'tile' || resolvedTarget.kind === 'formation_boundary') {
        return { x: resolvedTarget.x, y: resolvedTarget.y };
    }
    if (resolvedTarget.kind === 'monster') {
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const monster = instance.getMonster(resolvedTarget.monsterId);
        return monster ? { x: monster.x, y: monster.y } : null;
    }
    if (resolvedTarget.kind === 'player') {
        const player = deps.playerRuntimeService?.getPlayer?.(resolvedTarget.playerId)
            ?? null;
        return player ? { x: player.x, y: player.y } : null;
    }
    if (resolvedTarget.kind === 'formation') {
        const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
            ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, resolvedTarget.formationId)
            : null;
        return formation ? { x: formation.x, y: formation.y } : null;
    }
    return null;
}
export function findPlayerSkillName(player, skillId) {
    for (const technique of player.techniques?.techniques ?? []) {
        const skill = technique.skills?.find((entry) => entry.id === skillId);
        if (skill?.name) {
            return skill.name;
        }
    }
    return null;
}

export function evaluateCasterSkillFormula(formula, attacker, techLevel, targetCount) {
    if (typeof formula === 'number') {
        return formula;
    }
    if (!formula || typeof formula !== 'object') {
        return 0;
    }
    if ('var' in formula) {
        return resolveCasterSkillFormulaVar(formula.var, attacker, techLevel, targetCount) * (formula.scale ?? 1);
    }
    if (formula.op === 'clamp') {
        const value = evaluateCasterSkillFormula(formula.value, attacker, techLevel, targetCount);
        const min = formula.min === undefined ? Number.NEGATIVE_INFINITY : evaluateCasterSkillFormula(formula.min, attacker, techLevel, targetCount);
        const max = formula.max === undefined ? Number.POSITIVE_INFINITY : evaluateCasterSkillFormula(formula.max, attacker, techLevel, targetCount);
        return Math.min(max, Math.max(min, value));
    }
    const values = Array.isArray(formula.args)
        ? formula.args.map((entry) => evaluateCasterSkillFormula(entry, attacker, techLevel, targetCount))
        : [];
    switch (formula.op) {
        case 'add':
            return values.reduce((sum, value) => sum + value, 0);
        case 'sub':
            return values.slice(1).reduce((sum, value) => sum - value, values[0] ?? 0);
        case 'mul':
            return values.reduce((product, value) => product * value, 1);
        case 'div':
            return values.slice(1).reduce((sum, value) => (value === 0 ? sum : sum / value), values[0] ?? 0);
        case 'min':
            return values.length > 0 ? Math.min(...values) : 0;
        case 'max':
            return values.length > 0 ? Math.max(...values) : 0;
        default:
            return 0;
    }
}

export function resolveCasterSkillFormulaVar(variable, attacker, techLevel, targetCount) {
    if (variable === 'techLevel') {
        return techLevel;
    }
    if (variable === 'caster.realmLv') {
        return attacker.realm?.realmLv ?? attacker.realmLv ?? techLevel;
    }
    if (variable === 'targetCount') {
        return targetCount;
    }
    if (variable === 'caster.hp') {
        return attacker.hp ?? 0;
    }
    if (variable === 'caster.maxHp') {
        return attacker.maxHp ?? 0;
    }
    if (variable === 'caster.qi') {
        return attacker.qi ?? 0;
    }
    if (variable === 'caster.maxQi') {
        return attacker.maxQi ?? 0;
    }
    const craftSkillKind = resolveCraftSkillKindFromFormulaVar(variable);
    if (craftSkillKind) {
        return resolveCombatantCraftSkillLevel(attacker, craftSkillKind);
    }
    if (typeof variable === 'string' && variable.startsWith('caster.attr.')) {
        return attacker.attrs?.finalAttrs?.[variable.slice('caster.attr.'.length)] ?? 0;
    }
    if (typeof variable === 'string' && variable.startsWith('caster.stat.')) {
        return attacker.attrs?.numericStats?.[variable.slice('caster.stat.'.length)] ?? 0;
    }
    if (typeof variable === 'string' && variable.startsWith('caster.buff.') && variable.endsWith('.stacks')) {
        const buffId = variable.slice('caster.buff.'.length, -'.stacks'.length);
        const buff = attacker.buffs?.buffs?.find((entry) => entry.buffId === buffId);
        return buff ? Math.max(0, Number(buff.stacks) || 0) : 0;
    }
    return 0;
}

export function getResolvedSkillTargetKey(target) {
    if (target.kind === 'self') {
        return `self:${target.playerId}`;
    }
    if (target.kind === 'monster') {
        return `monster:${target.monsterId}`;
    }
    if (target.kind === 'formation') {
        return `formation:${target.formationId}`;
    }
    if (target.kind === 'formation_boundary') {
        return `formation-boundary:${target.formationId}:${target.x}:${target.y}`;
    }
    if (target.kind === 'player') {
        return `player:${target.playerId}`;
    }
    return `tile:${target.x}:${target.y}`;
}

export function formatSkippedPlayerSkillTargetRef(target) {
    if (!target || typeof target !== 'object') {
        return undefined;
    }
    if (target.kind === 'self') {
        return 'self';
    }
    if (target.kind === 'monster') {
        return target.monsterId ? String(target.monsterId) : undefined;
    }
    if (target.kind === 'player') {
        return target.playerId ? `player:${target.playerId}` : undefined;
    }
    if (target.kind === 'formation') {
        return target.formationId ? String(target.formationId) : undefined;
    }
    if (target.kind === 'formation_boundary') {
        return target.formationId
            ? `formation-boundary:${target.formationId}:${target.x}:${target.y}`
            : `tile:${target.x}:${target.y}`;
    }
    if (Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
        return `tile:${Math.trunc(Number(target.x))}:${Math.trunc(Number(target.y))}`;
    }
    return undefined;
}

export function isCellInList(cells, x, y) {
    return cells.some((cell) => cell.x === x && cell.y === y);
}

export function isResolvedSkillTargetInsideCells(attacker, target, cells, instance, playerRuntimeService, deps) {
    if (!target || cells.length === 0) {
        return false;
    }
    if (target.kind === 'self') {
        return isCellInList(cells, attacker.x, attacker.y);
    }
    if (target.kind === 'tile' || target.kind === 'formation_boundary') {
        return isCellInList(cells, target.x, target.y);
    }
    if (target.kind === 'monster') {
        const monster = instance.getMonster(target.monsterId);
        return Boolean(monster?.alive && isCellInList(cells, monster.x, monster.y));
    }
    if (target.kind === 'player') {
        const player = playerRuntimeService.getPlayer(target.playerId);
        return Boolean(
            player
            && player.instanceId === attacker.instanceId
            && player.hp > 0
            && isCellInList(cells, player.x, player.y),
        );
    }
    if (target.kind === 'formation') {
        const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
            ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, target.formationId)
            : null;
        return Boolean(formation && isCellInList(cells, formation.x, formation.y));
    }
    return false;
}

export function ensurePlayerSkillActionEnabled(player, skillId) {
    const action = player.actions?.actions?.find((entry) => entry.id === skillId && entry.type === 'skill');
    if (!action) {
        throw new NotFoundException(`技能动作不存在：${skillId}`);
    }
    if (action.skillEnabled === false) {
        throw new BadRequestException('技能未启用，无法释放');
    }
    if (action.passiveOnly === true) {
        throw new BadRequestException('被动技能不需要释放');
    }
}

export function resolveCachedMonsterCombatTargetState(monster, playerRuntimeService, cache, formationService = null, instanceId = monster?.instanceId) {
    const suppressed = resolveSuppressedMonsterNumericStats(monster, formationService, instanceId);
    const cached = cache.get(monster);
    if (cached
        && cached.attrsRef === monster.attrs
        && cached.numericStatsRef === monster.numericStats
        && cached.ratioDivisorsRef === monster.ratioDivisors
        && cached.level === monster.level
        && cached.tier === monster.tier
        && cached.suppressionLayers === suppressed.layers) {
        cached.state.hp = monster.hp;
        cached.state.maxHp = monster.maxHp;
        cached.state.qi = monster.qi ?? 0;
        cached.state.maxQi = monster.maxQi ?? 0;
        cached.state.buffs = monster.buffs;
        return cached.state;
    }
    const attrs = {
        finalAttrs: monster.attrs,
        numericStats: suppressed.numericStats,
        ratioDivisors: monster.ratioDivisors,
    };
    const state = {
        runtimeId: monster.runtimeId,
        monsterId: monster.monsterId,
        level: monster.level,
        realmLv: monster.level,
        combatExp: resolveMonsterCombatExpEquivalent(monster, playerRuntimeService),
        attrs,
        hp: monster.hp,
        maxHp: monster.maxHp,
        qi: monster.qi ?? 0,
        maxQi: monster.maxQi ?? 0,
        buffs: monster.buffs,
    };
    cache.set(monster, {
        attrsRef: monster.attrs,
        numericStatsRef: monster.numericStats,
        ratioDivisorsRef: monster.ratioDivisors,
        level: monster.level,
        tier: monster.tier,
        suppressionLayers: suppressed.layers,
        state,
    });
    return state;
}

export function resolveMonsterCombatExpEquivalent(monster, playerRuntimeService) {
    const progressionService = playerRuntimeService?.playerProgressionService;
    if (typeof progressionService?.getMonsterCombatExpEquivalent === 'function') {
        const resolved = progressionService.getMonsterCombatExpEquivalent(monster);
        if (Number.isFinite(resolved) && resolved > 0) {
            return Math.floor(resolved);
        }
    }
    return resolveMonsterCombatExpEquivalentFallback(monster);
}

export function buildCombatTileKey(x, y) {
    return `${Math.trunc(Number(x))}:${Math.trunc(Number(y))}`;
}

export function buildLiveMonsterTileIndex(monsters) {
    const index = new Map();
    if (!Array.isArray(monsters)) {
        return index;
    }
    for (const monster of monsters) {
        if (!monster?.runtimeId || monster.alive === false) {
            continue;
        }
        const key = buildCombatTileKey(monster.x, monster.y);
        if (!index.has(key)) {
            index.set(key, monster);
        }
    }
    return index;
}

export function buildRuntimeFormationTileIndex(formations) {
    const index = new Map();
    if (!Array.isArray(formations)) {
        return index;
    }
    for (const formation of formations) {
        if (!formation?.id || Number(formation?.remainingAuraBudget) <= 0) {
            continue;
        }
        const key = buildCombatTileKey(formation.x, formation.y);
        if (!index.has(key)) {
            index.set(key, formation);
        }
    }
    return index;
}
