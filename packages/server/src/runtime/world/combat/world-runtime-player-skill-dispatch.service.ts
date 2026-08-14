/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import { Inject, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TileType, applyCombatAttackIntensityQiCost, buildEffectiveTargetingGeometry, calcQiCostWithOutputLimit, computeAffectedCellsFromAnchor, formatDisplayNumber, horizontalFacingFromTo, parseTileTargetRef, percentModifierToMultiplier, resolvePlayerFacingContentName, resolveSkillPlayerWindupTicks as getPlayerSkillWindupTicks, resolveSkillRequiresTarget, resolveTargetingGeometryMaxTargets, signedRatioValue, uiLabels } from '@mud/shared';
import { PlayerCombatService } from '../../combat/player-combat.service';
import { createCombatOutcomeApplyAdapters, projectCombatOutcomeDeps } from '../../combat/combat-outcome-apply-adapters';
import { resolveMonsterCombatExpEquivalentFallback } from '../../combat/monster-combat-exp-equivalent.helper';
import { isHostileCombatRelationResolution, resolveCombatRelation } from '../../player/player-combat-config.helpers';
import { arePlayersInSameParty } from '../../party/party-combat-registry';
import { recordPartyMemberSupport } from '../../party/party-reward-runtime';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import { WorldRuntimeCombatActionService } from './world-runtime-combat-action.service';
import { CombatActionPhase, CombatActorKind, CombatRejectReason, CombatTargetKind } from './combat-action.types';
import { emitCombatPresentation, nextCastId } from './world-runtime-combat-presentation.helpers';
import { CombatPendingCastCancelReason, CombatPendingCastStatus, cancelPendingCombatCast, createPlayerPendingCombatCast, createPlayerSkillActionFromPendingCast, resolvePendingCombatCastCancellation } from '../../combat/pending-combat-cast.helpers';
import { buildStructuredNotice } from '../structured-notice.helpers';
import { applyMiningExpForTileDamage, applyMiningExpForTileDamageBatch, resolveMiningAdjustedTileDamage, resolveMiningDropRateBonus, resolveMiningTileDamageMultiplier, spawnTileDrops } from './tile-drop.helpers';
import { WorldRuntimeThreatService } from './world-runtime-threat.service';
import { resolvePlayerDisplayName } from '../../player/player-display-name';
import { resolveSuppressedMonsterNumericStats } from './formation-combat-effect.helpers';
import {
    resolveCombatantCraftSkillLevel,
    resolveCraftSkillKindFromFormulaVar,
} from '../../combat/skill-formula-craft-level.helpers';
import {
    buildPlayerSkillDamageSummaryEffect,
    buildPlayerSkillSummaryNotice,
    createPlayerSkillCastSummary,
    recordPlayerSkillEnemySummary,
    recordPlayerSkillTileSummary,
    shouldAggregatePlayerSkillPresentation,
} from './player-skill-cast-summary.helpers';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';
import * as world_runtime_path_planning_helpers_1 from '../world-runtime.path-planning.helpers';
import * as world_runtime_observation_helpers_1 from '../query/world-runtime.observation.helpers';

type AnyRecord = Record<string, any>;

const BASE_CHANT_TICK_DURATION_MS = 1000;
const CHANT_LABEL_EXTRA_DURATION_MS = 240;

function resolveMonsterDisplayName(monster) {
    return resolvePlayerFacingContentName(monster?.monsterId ?? monster?.runtimeId, '未知妖兽', monster?.name);
}

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

function ensureHostileRelation(resolution) {
    if (isHostileCombatRelationResolution(resolution)) {
        return;
    }
    if (resolution?.blockedReason === 'self_target') {
        throw new BadRequestException('不能攻击自己');
    }
    throw new BadRequestException('当前目标不在敌方判定规则内');
}
function ensureInstanceSupportsPlayerCombat(instance) {
    if (instance?.meta?.supportsPvp === true) {
        return;
    }
    throw new BadRequestException('当前实例不允许玩家互攻');
}
function ensureInstanceSupportsTileDamage(instance) {
    if (instance?.meta?.canDamageTile === true) {
        return;
    }
    throw new BadRequestException('当前实例不允许攻击地块');
}
function resolveMiningJobTargetRef(job) {
    if (!job || !Number.isFinite(Number(job.targetX)) || !Number.isFinite(Number(job.targetY))) {
        return '';
    }
    return `tile:${Math.trunc(Number(job.targetX))}:${Math.trunc(Number(job.targetY))}`;
}
function isMiningJobIssuedSkillAction(attacker, targetRef) {
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
function formatAuraDamage(value) {
    const amount = Math.max(0, Number(value) || 0);
    if (amount <= 0) {
        return '0';
    }
    if (amount < 1) {
        return amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    }
    return formatDisplayNumber(amount, { compactMaximumFractionDigits: 2 });
}
function resolveSkillDamageKind(skill) {
    const damageEffect = Array.isArray(skill?.effects)
        ? skill.effects.find((effect) => effect?.type === 'damage')
        : null;
    return damageEffect?.damageKind === 'physical' ? 'physical' : 'spell';
}
function resolveSkillDamageElement(skill) {
    const damageEffect = Array.isArray(skill?.effects)
        ? skill.effects.find((effect) => effect?.type === 'damage')
        : null;
    return typeof damageEffect?.element === 'string' ? damageEffect.element : undefined;
}
function resolvePrimaryDamageRoll(result, fallbackDamageKind, fallbackElement) {
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
function createReusablePlayerSkillTileCombatTarget() {
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

function updateReusablePlayerSkillTileCombatTarget(target, hp, maxHp) {
    target.hp = Math.max(1, Math.round(Number(hp) || 1));
    target.maxHp = Math.max(1, Math.round(Number(maxHp) || target.hp));
    target.attrs.numericStats.maxHp = target.maxHp;
    return target;
}

/** 后续地块只复用目标伤害结果，施法者治疗、buff、资源和冷却仍只在首个有效目标执行。 */
function createRepeatedPlayerSkillTileResult(result) {
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
function resolveTickScaledChantDurationMs(ticks, tickSpeed = 1) {
    const normalizedTicks = Math.max(0, Math.trunc(Number(ticks) || 0));
    if (normalizedTicks <= 0) {
        return 0;
    }
    const normalizedSpeed = Number.isFinite(Number(tickSpeed)) && Number(tickSpeed) > 0
        ? Number(tickSpeed)
        : 1;
    return Math.max(1, Math.round((normalizedTicks * BASE_CHANT_TICK_DURATION_MS) / normalizedSpeed));
}
function normalizeAppliedDamage(value, fallback = 0) {
    if (Number.isFinite(Number(value))) {
        return Math.max(0, Math.round(Number(value)));
    }
    return Math.max(0, Math.round(Number(fallback) || 0));
}
function resolveTileCombatTargetName(tileState) {
    if (typeof tileState?.targetName === 'string' && tileState.targetName.trim()) {
        return tileState.targetName.trim();
    }
    return uiLabels.TILE_TYPE_LABELS[tileState?.tileType] ?? '地块';
}

function recordPlayerSkillDispatchPerf(deps, key, startedAt, count = 1) {
    const recorder = deps?.recordPendingCommandSectionDuration;
    if (typeof recorder !== 'function') {
        return;
    }
    const durationMs = performance.now() - startedAt;
    if (Number.isFinite(durationMs) && durationMs >= 0) {
        recorder(key, durationMs, count);
    }
}

function recordPlayerSkillDispatchDuration(deps, key, durationMs, count = 1) {
    const recorder = deps?.recordPendingCommandSectionDuration;
    if (typeof recorder !== 'function') {
        return;
    }
    if (Number.isFinite(durationMs) && durationMs >= 0) {
        recorder(key, durationMs, count);
    }
}

function recordPlayerSkillOutcomeApplyPerf(deps, startedAt, attributionKey) {
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

function isTimeChamberSkillDispatch(attacker, deps): boolean {
    return typeof attacker?.instanceId === 'string'
        && typeof deps?.timeChamberRuntimeService?.isTimeChamberInstance === 'function'
        && deps.timeChamberRuntimeService.isTimeChamberInstance(attacker.instanceId) === true;
}

function resolveSkillTargetCountDurationKey(targetCount: number): string {
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

const PLAYER_SKILL_TARGET_PLAN_PROFILE_SAMPLE_RATE = 64;

function buildEffectivePlayerSkillGeometry(attacker, skill) {
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

function resolveSkillTargetLimit(skill, effectiveGeometry = null) {
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

function getTemporaryTileEffects(skill) {
    return (skill.effects ?? []).filter((effect) => effect?.type === 'temporary_tile');
}

function isTemporaryTileSkill(skill) {
    return getTemporaryTileEffects(skill).length > 0;
}

function isSelfBuffNoTargetSkill(skill) {
    const effects = Array.isArray(skill?.effects) ? skill.effects : [];
    return resolveSkillRequiresTarget(skill) === false
        && effects.length > 0
        && effects.every((effect) => effect?.type === 'buff' && effect.target === 'self');
}

function isSelfAnchoredNoTargetSkill(skill) {
    return resolveSkillRequiresTarget(skill) === false
        && !isSelfBuffNoTargetSkill(skill)
        && resolveRuntimeSkillRange(skill) <= 0;
}

function hasHealOrAlliesEffect(skill) {
    const effects = Array.isArray(skill?.effects) ? skill.effects : [];
    return effects.some((effect) =>
        effect?.type === 'heal'
        || (effect?.type === 'buff' && effect.target === 'allies'));
}

function resolveTechniqueLevelForSkill(player, skillId) {
    for (const technique of player.techniques?.techniques ?? []) {
        if ((technique.skills ?? []).some((entry) => entry.id === skillId)) {
            return Math.max(1, Math.trunc(Number(technique.level) || 1));
        }
    }
    return 1;
}

function spendSkillCostAndStartCooldown(playerRuntimeService, attacker, skill, currentTick, instance = null) {
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
function normalizePlayerSkillCooldownReadyTick(attacker, skill, currentTick) {
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
function resolvePlayerSkillCooldownTicks(attacker, cooldown) {
    const baseCooldown = Math.max(1, Math.round(Number(cooldown) || 1));
    const cooldownSpeed = Math.trunc(Number(attacker.attrs?.numericStats?.cooldownSpeed ?? 0));
    const cooldownDivisor = Math.max(1, Math.trunc(Number(attacker.attrs?.ratioDivisors?.cooldownSpeed ?? 100)));
    const cooldownRate = signedRatioValue(cooldownSpeed, cooldownDivisor);
    const cooldownMultiplier = percentModifierToMultiplier(-cooldownRate * 100);
    return Math.max(1, Math.ceil(baseCooldown * cooldownMultiplier));
}
function getPlayerSkillWarningColor(skill) {
    return typeof skill?.playerCast?.warningColor === 'string' && skill.playerCast.warningColor.trim().length > 0
        ? skill.playerCast.warningColor.trim()
        : undefined;
}
function resolvePlayerSkillFacingAnchor(attacker, targets, castOptions = undefined) {
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
function applyPlayerHorizontalFacingToward(playerRuntimeService, instance, attacker, anchor) {
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
function buildPlayerSkillAffectedCells(attacker, skill, anchor, effectiveGeometry = null) {
    const geometry = effectiveGeometry ?? buildEffectivePlayerSkillGeometry(attacker, skill);
    const shape = geometry.shape ?? 'single';
    if (shape === 'single') {
        return chebyshevDistance(attacker.x, attacker.y, anchor.x, anchor.y) <= geometry.range
            ? [{ x: anchor.x, y: anchor.y }]
            : [];
    }
    return computeAffectedCellsFromAnchor({ x: attacker.x, y: attacker.y }, anchor, geometry);
}
function resolveResolvedTargetAnchor(attacker, resolvedTarget, deps) {
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
function findPlayerSkillName(player, skillId) {
    for (const technique of player.techniques?.techniques ?? []) {
        const skill = technique.skills?.find((entry) => entry.id === skillId);
        if (skill?.name) {
            return skill.name;
        }
    }
    return null;
}

function evaluateCasterSkillFormula(formula, attacker, techLevel, targetCount) {
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

function resolveCasterSkillFormulaVar(variable, attacker, techLevel, targetCount) {
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

function getResolvedSkillTargetKey(target) {
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

function formatSkippedPlayerSkillTargetRef(target) {
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

function isCellInList(cells, x, y) {
    return cells.some((cell) => cell.x === x && cell.y === y);
}

function isResolvedSkillTargetInsideCells(attacker, target, cells, instance, playerRuntimeService, deps) {
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

function ensurePlayerSkillActionEnabled(player, skillId) {
    const action = player.actions?.actions?.find((entry) => entry.id === skillId && entry.type === 'skill');
    if (!action) {
        throw new NotFoundException(`技能动作不存在：${skillId}`);
    }
    if (action.skillEnabled === false) {
        throw new BadRequestException('技能未启用，无法释放');
    }
}

/** 玩家技能派发服务：承接 player skill dispatch 与 legacy target 解析。 */
@Injectable()
export class WorldRuntimePlayerSkillDispatchService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * playerCombatService：玩家战斗服务引用。
 */

    playerCombatService;    
    worldRuntimeCombatActionService;
    worldRuntimeThreatService;
    playerSkillOutcomeAdapters;
    monsterCombatStateCache = new WeakMap();
    playerSkillTargetPlanProfileSequence = 0;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param playerCombatService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(PlayerCombatService) playerCombatService: any,
        @Inject(WorldRuntimeCombatActionService) worldRuntimeCombatActionService: any,
        @Inject(WorldRuntimeThreatService) worldRuntimeThreatService: any = undefined,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.playerCombatService = playerCombatService;
        this.worldRuntimeCombatActionService = worldRuntimeCombatActionService ?? new WorldRuntimeCombatActionService();
        this.worldRuntimeThreatService = worldRuntimeThreatService ?? new WorldRuntimeThreatService();
        this.playerSkillOutcomeAdapters = createCombatOutcomeApplyAdapters({
            handleMonsterDefeat: () => ({ deferred: true }),
        });
    }    
    /** resolveMonsterCombatTargetState：复用妖兽稳定战斗字段，避免多目标施法重复包装。 */
    resolveMonsterCombatTargetState(monster, deps = null, instanceId = monster?.instanceId) {
        return resolveCachedMonsterCombatTargetState(
            monster,
            this.playerRuntimeService,
            this.monsterCombatStateCache,
            deps?.worldRuntimeFormationService,
            instanceId,
        );
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

    async dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef = null, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const attacker = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (attacker.combat?.pendingSkillCast) {
            throw new BadRequestException('正在吟唱中，无法继续施法。');
        }
        ensurePlayerSkillActionEnabled(attacker, skillId);
        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.recordActivity(playerId, currentTick, { interruptCultivation: true, reason: 'attack' });
        if (!isMiningJobIssuedSkillAction(attacker, targetRef)) {
            deps.worldRuntimeCraftInterruptService.interruptCraftForReason(playerId, attacker, 'attack', deps);
        }
        if (!attacker.instanceId) {
            throw new BadRequestException('尚未进入地图实例');
        }
        const skill = findPlayerSkill(attacker, skillId);
        if (!skill) {
            throw new NotFoundException(`技能不存在：${skillId}`);
        }
        deps.ensureAttackAllowed(attacker, skill);
        if (isTemporaryTileSkill(skill)) {
            if (!targetRef) {
                throw new BadRequestException('必须选择地块目标');
            }
            const tile = parseTileTargetRef(targetRef);
            if (!tile) {
                throw new BadRequestException('必须选择地块目标');
            }
            return this.dispatchTemporaryTileSkill(attacker, skill, tile.x, tile.y, currentTick, deps);
        }
        if (isSelfAnchoredNoTargetSkill(skill)) {
            const anchor = { x: attacker.x, y: attacker.y };
            if (getPlayerSkillWindupTicks(skill) > 0) {
                return this.beginPlayerSkillCast(attacker, skill, anchor, null, deps);
            }
            return this.dispatchCastSkillAtAnchor(attacker, skillId, skill, anchor, null, deps);
        }
        if (targetRef && !targetMonsterId && !targetPlayerId) {
            if (targetRef === 'self' && resolveSkillRequiresTarget(skill) === false && !isSelfBuffNoTargetSkill(skill)) {
                const anchor = { x: attacker.x, y: attacker.y };
                if (getPlayerSkillWindupTicks(skill) > 0) {
                    return this.beginPlayerSkillCast(attacker, skill, anchor, null, deps);
                }
                return this.dispatchCastSkillAtAnchor(attacker, skillId, skill, anchor, null, deps);
            }
            const tileAnchor = parseTileTargetRef(targetRef);
            const resolvedTarget = this.resolveLegacySkillTargetRef(attacker, skill, targetRef, deps);
            if (!resolvedTarget) {
                throw new BadRequestException('没有可命中的目标');
            }
            if (tileAnchor) {
                if (getPlayerSkillWindupTicks(skill) > 0) {
                    return this.beginPlayerSkillCast(attacker, skill, tileAnchor, targetRef, deps);
                }
                return this.dispatchCastSkillAtAnchor(attacker, skillId, skill, tileAnchor, resolvedTarget, deps);
            }
            if (getPlayerSkillWindupTicks(skill) > 0) {
                const anchor = resolveResolvedTargetAnchor(attacker, resolvedTarget, deps);
                if (!anchor) {
                    throw new BadRequestException('目标不存在或不可选中');
                }
                return this.beginPlayerSkillCast(attacker, skill, anchor, targetRef, deps);
            }
            if (resolvedTarget.kind === 'monster') {
                return this.dispatchCastSkillToMonster(attacker, skillId, resolvedTarget.monsterId, deps);
            }
            if (resolvedTarget.kind === 'tile') {
                return this.dispatchCastSkillToTile(attacker, skillId, resolvedTarget.x, resolvedTarget.y, deps);
            }
            if (resolvedTarget.kind === 'formation') {
                return this.dispatchCastSkillToFormation(attacker, skillId, resolvedTarget.formationId, deps);
            }
            if (resolvedTarget.kind === 'formation_boundary') {
                return this.dispatchCastSkillToTile(attacker, skillId, resolvedTarget.x, resolvedTarget.y, deps);
            }
            return this.dispatchCastSkill(playerId, skillId, resolvedTarget.playerId, null, null, deps);
        }
        if (targetMonsterId) {
            const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
                ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, targetMonsterId)
                : null;
            if (formation) {
                if (getPlayerSkillWindupTicks(skill) > 0) {
                    return this.beginPlayerSkillCast(attacker, skill, { x: formation.x, y: formation.y }, targetMonsterId, deps);
                }
                return this.dispatchCastSkillToFormation(attacker, skillId, targetMonsterId, deps);
            }
            if (getPlayerSkillWindupTicks(skill) > 0) {
                const instanceForAnchor = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
                const monster = instanceForAnchor.getMonster(targetMonsterId);
                if (!monster) {
                    throw new NotFoundException(`妖兽不存在：${targetMonsterId}`);
                }
                return this.beginPlayerSkillCast(attacker, skill, { x: monster.x, y: monster.y }, targetMonsterId, deps);
            }
            return this.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps);
        }
        if (!targetPlayerId) {
            if (resolveSkillRequiresTarget(skill) === false) {
                const anchor = { x: attacker.x, y: attacker.y };
                if (isSelfBuffNoTargetSkill(skill)) {
                    const selfTarget = { kind: 'self', playerId: attacker.playerId, x: attacker.x, y: attacker.y };
                    if (getPlayerSkillWindupTicks(skill) > 0) {
                        return this.beginPlayerSkillCast(attacker, skill, anchor, 'self', deps);
                    }
                    await this.dispatchSkillTargets(attacker, skillId, skill, [selfTarget], deps);
                    return;
                }
                if (getPlayerSkillWindupTicks(skill) > 0) {
                    return this.beginPlayerSkillCast(attacker, skill, anchor, null, deps);
                }
                return this.dispatchCastSkillAtAnchor(attacker, skillId, skill, anchor, null, deps);
            }
            throw new BadRequestException('必须指定玩家或妖兽目标');
        }
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        ensureInstanceSupportsPlayerCombat(instance);
        if (instance.isPointInSafeZone(attacker.x, attacker.y)) {
            throw new BadRequestException('安全区内无法对其他玩家造成伤害。');
        }
        const target = this.playerRuntimeService.getPlayer(targetPlayerId);
        if (!target) {
            throw new BadRequestException('目标玩家已离线');
        }
        if (instance.isPointInSafeZone(target.x, target.y)) {
            throw new BadRequestException('目标处于安全区内，无法对其造成伤害。');
        }
        if (attacker.instanceId !== target.instanceId) {
            throw new BadRequestException(`目标 ${targetPlayerId} 不在同一地图实例`);
        }
        ensureHostileRelation(resolveCombatRelation(attacker, {
            kind: 'player',
            target,
        }));
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: target.x, y: target.y }, deps, {
            kind: 'player',
            playerId: target.playerId,
            x: target.x,
            y: target.y,
        });
        if (targets.length === 0) {
            throw new BadRequestException('没有可命中的目标');
        }
        if (getPlayerSkillWindupTicks(skill) > 0) {
            return this.beginPlayerSkillCast(attacker, skill, { x: target.x, y: target.y }, `player:${target.playerId}`, deps);
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps, {
            prevalidatedTargets: true,
            targetX: target.x,
            targetY: target.y,
        });
    }    
    async dispatchCastSkillAtAnchor(attacker, skillId, skill, anchor, primaryTarget, deps) {
        let targets = this.collectSkillTargetsFromAnchor(attacker, skill, anchor, deps, primaryTarget);
        if (targets.length === 0) {
            // 含有 heal/allies 效果或 requiresTarget:false 的技能允许无敌对目标释放
            if (hasHealOrAlliesEffect(skill) || resolveSkillRequiresTarget(skill) === false) {
                targets = [{ kind: 'self', playerId: attacker.playerId, x: attacker.x, y: attacker.y }];
            } else {
                throw new BadRequestException('没有可命中的目标');
            }
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps, {
            prevalidatedTargets: true,
            targetRef: primaryTarget?.targetRef,
            targetX: anchor.x,
            targetY: anchor.y,
        });
    }
    dispatchTemporaryTileSkill(attacker, skill, targetX, targetY, currentTick, deps) {
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const geometry = buildEffectivePlayerSkillGeometry(attacker, skill);
        const anchor = { x: Math.trunc(Number(targetX)), y: Math.trunc(Number(targetY)) };
        const cells = computeAffectedCellsFromAnchor({ x: attacker.x, y: attacker.y }, anchor, geometry);
        if (cells.length === 0) {
            throw new BadRequestException(`技能 ${skill.id} 超出范围`);
        }
        const effects = getTemporaryTileEffects(skill);
        const techLevel = resolveTechniqueLevelForSkill(attacker, skill.id);
        const plans = [];
        for (const effect of effects) {
            const targetCells = effect.excludeAnchor === true
                ? cells.filter((cell) => cell.x !== anchor.x || cell.y !== anchor.y)
                : cells;
            const availableCells = targetCells.filter((cell) => instance.canCreateTemporaryTile?.(cell.x, cell.y) === true);
            if (availableCells.length <= 0) {
                continue;
            }
            const hp = Math.max(1, Math.round(evaluateCasterSkillFormula(effect.hpFormula, attacker, techLevel, Math.max(1, targetCells.length))));
            const durationTicks = Math.max(1, Math.round(Number(effect.durationTicks) || 1));
            const tileType = typeof effect.tileType === 'string' && effect.tileType.length > 0 ? effect.tileType : TileType.Stone;
            plans.push({ effect, cells: availableCells, hp, durationTicks, tileType });
        }
        if (plans.length <= 0) {
            throw new BadRequestException('没有可生成石头的地块');
        }
        spendSkillCostAndStartCooldown(this.playerRuntimeService, attacker, skill, currentTick, instance);
        applyPlayerHorizontalFacingToward(this.playerRuntimeService, instance, attacker, anchor);
        emitCombatPresentation({
            deps,
            instanceId: attacker.instanceId,
            actionLabel: {
                x: attacker.x,
                y: attacker.y,
                text: skill.name,
            },
        });
        let created = 0;
        const temporaryTileStartTick = Math.max(0, Math.trunc(Number(instance.tick ?? currentTick) || 0));
        for (const plan of plans) {
            for (const cell of plan.cells) {
                const result = instance.createTemporaryTile?.(cell.x, cell.y, plan.tileType, plan.hp, plan.durationTicks, temporaryTileStartTick, {
                    ownerPlayerId: attacker.playerId,
                    sourceSkillId: skill.id,
                });
                if (result?.created === true) {
                    created += 1;
                    emitCombatPresentation({
                        deps,
                        instanceId: attacker.instanceId,
                        attack: {
                            fromX: attacker.x,
                            fromY: attacker.y,
                            toX: cell.x,
                            toY: cell.y,
                            color: getSkillEffectColor(skill),
                        },
                    });
                }
            }
        }
        const notice = buildStructuredNotice('combat', 'notice.combat.temporary-tiles-created', `${skill.name}生成了 ${created} 处临时石头。`, {
            vars: { skillName: skill.name, count: created },
            pills: [{ key: 'skillName', style: 'skill' }],
        });
        emitCombatPresentation({
            deps,
            instanceId: attacker.instanceId,
            notices: [{
                playerId: attacker.playerId,
                text: notice.text,
                structured: notice.structured,
            }],
        });
    }
    beginPlayerSkillCast(attacker, skill, anchor, targetRef, deps) {
        const windupTicks = getPlayerSkillWindupTicks(skill);
        if (windupTicks <= 0) {
            const primaryTarget = targetRef ? this.resolveLegacySkillTargetRef(attacker, skill, targetRef, deps) : null;
            return this.dispatchCastSkillAtAnchor(attacker, skill.id, skill, anchor, primaryTarget, deps);
        }
        const geometry = buildEffectivePlayerSkillGeometry(attacker, skill);
        const warningCells = buildPlayerSkillAffectedCells(attacker, skill, anchor, geometry);
        if (warningCells.length === 0) {
            throw new BadRequestException('目标超出技能范围');
        }
        const currentTick = deps.resolveCurrentTickForPlayerId(attacker.playerId);
        const instance = deps.getInstanceRuntime?.(attacker.instanceId) ?? null;
        const qiCost = spendSkillCostAndStartCooldown(this.playerRuntimeService, attacker, skill, currentTick, instance);
        const cooldownReadyTick = Math.max(0, Math.trunc(Number(attacker.combat?.cooldownReadyTickBySkillId?.[skill.id] ?? 0)));
        deps.worldRuntimeNavigationService?.clearNavigationIntent?.(attacker.playerId);
        applyPlayerHorizontalFacingToward(this.playerRuntimeService, instance, attacker, anchor);
        const warningOrigin = (geometry.shape ?? 'single') === 'line'
            ? { x: attacker.x, y: attacker.y }
            : anchor;
        attacker.combat.pendingSkillCast = createPlayerPendingCombatCast({
            playerId: attacker.playerId,
            instanceId: attacker.instanceId,
            skillId: skill.id,
            anchor,
            targetRef: typeof targetRef === 'string' && targetRef.trim().length > 0 ? targetRef.trim() : undefined,
            warningCells,
            warningOrigin,
            remainingTicks: windupTicks,
            qiCost,
            warningColor: getPlayerSkillWarningColor(skill),
            startedTick: currentTick,
            resolveTick: currentTick + windupTicks + (attacker.combat?.autoBattle !== true ? 1 : 0),
            committedResourceSnapshot: {
                kind: 'qi',
                spent: qiCost,
                remaining: Math.max(0, Math.round(Number(attacker.qi) || 0)),
            },
            committedCooldownSnapshot: {
                actionId: skill.id,
                readyTick: cooldownReadyTick,
            },
            configRevision: skill.version ?? skill.revision,
            skipProgressThisTick: attacker.combat?.autoBattle !== true,
        });
        const durationMs = resolveTickScaledChantDurationMs(windupTicks, instance?.tickSpeed);
        emitCombatPresentation({
            deps,
            instanceId: attacker.instanceId,
            actionLabel: {
                x: attacker.x,
                y: attacker.y,
                text: skill.name,
                options: {
                    actionStyle: 'chant',
                    durationMs: durationMs + CHANT_LABEL_EXTRA_DURATION_MS,
                },
            },
            combatEffects: [{
                type: 'warning_zone',
                cells: warningCells.map((cell) => ({ x: cell.x, y: cell.y })),
                color: attacker.combat.pendingSkillCast.warningColor ?? '#ff9a30',
                baseColor: '#ffe0a6',
                originX: warningOrigin.x,
                originY: warningOrigin.y,
                durationMs,
            }],
        });
    }
    async resolvePendingPlayerSkillCast(playerId, deps) {
        const attacker = this.playerRuntimeService.getPlayer(playerId);
        const pendingCast = attacker?.combat?.pendingSkillCast;
        if (!attacker || !pendingCast) {
            return false;
        }
        const currentTick = typeof deps.resolveCurrentTickForPlayerId === 'function'
            ? deps.resolveCurrentTickForPlayerId(attacker.playerId)
            : null;
        if (attacker.hp <= 0) {
            const cancelled = cancelPendingCombatCast(pendingCast, {
                reason: CombatPendingCastCancelReason.ActorDead,
                cancelledTick: currentTick,
            });
            attacker.combat.pendingSkillCast = undefined;
            this.recordPlayerSkillReject(deps, attacker, null, cancelled, CombatRejectReason.ActorDead, {
                cancelReason: cancelled.cancelReason,
                phase: 'pending_cast_cancel',
                resourcePolicy: cancelled.cancellation?.resourcePolicy,
                cooldownPolicy: cancelled.cancellation?.cooldownPolicy,
            });
            return true;
        }
        const expiredCancellation = resolvePendingCombatCastCancellation(pendingCast, {
            currentTick,
            cancelledTick: currentTick,
        });
        if (expiredCancellation) {
            attacker.combat.pendingSkillCast = undefined;
            this.recordPlayerSkillReject(deps, attacker, null, expiredCancellation, CombatRejectReason.PendingCastExpired, {
                cancelReason: expiredCancellation.cancelReason,
                phase: 'pending_cast_cancel',
                resourcePolicy: expiredCancellation.cancellation?.resourcePolicy,
                cooldownPolicy: expiredCancellation.cancellation?.cooldownPolicy,
            });
            deps.queuePlayerNotice?.(attacker.playerId, '当前神通的吟唱已过期。', 'combat', undefined, undefined, buildStructuredNotice('combat', 'notice.combat.chant-expired', '当前神通的吟唱已过期。', {}).structured);
            return true;
        }
        if (pendingCast.skipProgressThisTick) {
            pendingCast.skipProgressThisTick = false;
            return true;
        }
        pendingCast.remainingTicks = Math.max(0, Math.trunc(Number(pendingCast.remainingTicks) || 0) - 1);
        if (pendingCast.remainingTicks > 0) {
            return true;
        }
        const skill = findPlayerSkill(attacker, pendingCast.skillId);
        if (!skill) {
            attacker.combat.pendingSkillCast = undefined;
            this.recordPlayerSkillReject(deps, attacker, null, pendingCast, CombatRejectReason.MissingSkill, {
                targetX: pendingCast.targetX,
                targetY: pendingCast.targetY,
                targetRef: pendingCast.targetRef,
                phase: 'pending_cast_resolve',
            });
            return true;
        }
        const revisionCancellation = resolvePendingCombatCastCancellation(pendingCast, {
            configRevision: skill.version ?? skill.revision,
            cancelledTick: currentTick,
        });
        if (revisionCancellation) {
            attacker.combat.pendingSkillCast = undefined;
            this.recordPlayerSkillReject(deps, attacker, skill, revisionCancellation, CombatRejectReason.PendingCastConfigRevisionMismatch, {
                cancelReason: revisionCancellation.cancelReason,
                phase: 'pending_cast_cancel',
                expectedConfigRevision: skill.version ?? skill.revision,
                pendingConfigRevision: pendingCast.configRevision,
                resourcePolicy: revisionCancellation.cancellation?.resourcePolicy,
                cooldownPolicy: revisionCancellation.cancellation?.cooldownPolicy,
            });
            deps.queuePlayerNotice?.(attacker.playerId, `${skill.name}的吟唱已取消：技能配置已更新`, 'combat', undefined, undefined, buildStructuredNotice('combat', 'notice.combat.chant-cancelled-config', `${skill.name}的吟唱已取消：技能配置已更新`, { vars: { skillName: skill.name }, pills: [{ key: 'skillName', style: 'skill' }] }).structured);
            return true;
        }
        attacker.combat.pendingSkillCast = undefined;
        const skillQiCost = Number.isFinite(skill.cost) ? Math.max(0, Math.round(Number(skill.cost))) : 0;
        if (skillQiCost > 0) {
            const standardCost = Math.round(calcQiCostWithOutputLimit(skillQiCost, Math.max(0, attacker.attrs?.numericStats?.maxQiOutputPerTick ?? 0)));
            const effectiveCost = applyCombatAttackIntensityQiCost(standardCost, attacker.combat?.combatAttackIntensity);
            if (Number.isFinite(effectiveCost) && attacker.qi < effectiveCost) {
                this.recordPlayerSkillReject(deps, attacker, skill, pendingCast, CombatRejectReason.InsufficientResource, {
                    phase: 'pending_cast_resolve_resource_check',
                    requiredQi: effectiveCost,
                    currentQi: attacker.qi,
                });
                deps.queuePlayerNotice?.(attacker.playerId, `${skill.name}的吟唱结算失败：元气不足。`, 'combat', undefined, undefined, buildStructuredNotice('combat', 'notice.combat.chant-fail-qi', `${skill.name}的吟唱结算失败：元气不足。`, { vars: { skillName: skill.name }, pills: [{ key: 'skillName', style: 'skill' }] }).structured);
                return true;
            }
        }
        const pendingCombatAction = createPlayerSkillActionFromPendingCast(pendingCast, {
            actorId: attacker.playerId,
            instanceId: attacker.instanceId,
        });
        const anchor = pendingCombatAction.anchor ?? {
            x: Math.trunc(Number(pendingCast.targetX)),
            y: Math.trunc(Number(pendingCast.targetY)),
        };
        const primaryTarget = pendingCast.targetRef
            ? this.resolveLegacySkillTargetRef(attacker, skill, pendingCast.targetRef, deps)
            : null;
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, anchor, deps, primaryTarget);
        emitCombatPresentation({
            deps,
            instanceId: attacker.instanceId,
            actionLabel: {
                x: attacker.x,
                y: attacker.y,
                text: skill.name,
            },
        });
        if (targets.length === 0) {
            this.recordPlayerSkillReject(deps, attacker, skill, pendingCast, CombatRejectReason.NoTargets, {
                targetX: anchor.x,
                targetY: anchor.y,
                targetRef: pendingCast.targetRef,
                targetCount: 0,
                phase: 'pending_cast_resolve',
            });
            return true;
        }
        await this.dispatchSkillTargets(attacker, skill.id, skill, targets, deps, {
            prevalidatedTargets: true,
            skipResourceAndCooldown: true,
            showActionLabel: false,
            combatActionPhase: CombatActionPhase.ChantResolve,
            targetRef: pendingCast.targetRef,
            targetX: anchor.x,
            targetY: anchor.y,
        });
        return true;
    }
    interruptPendingPlayerSkillCast(playerId, reason, deps) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        const pendingCast = player?.combat?.pendingSkillCast;
        if (!player || !pendingCast) {
            return false;
        }
        const cancelled = cancelPendingCombatCast(pendingCast, {
            reason: CombatPendingCastCancelReason.Interrupted,
            message: reason,
            cancelledTick: deps.resolveCurrentTickForPlayerId?.(playerId),
        });
        player.combat.pendingSkillCast = undefined;
        this.recordPlayerSkillReject(deps, player, null, cancelled, CombatRejectReason.PendingCastCancelled, {
            cancelReason: cancelled.cancelReason,
            cancelMessage: cancelled.cancelMessage,
            phase: 'pending_cast_cancel',
            resourcePolicy: cancelled.cancellation?.resourcePolicy,
            cooldownPolicy: cancelled.cancellation?.cooldownPolicy,
        });
        if (reason) {
            const skillName = findPlayerSkillName(player, pendingCast.skillId) ?? '当前神通';
            deps.queuePlayerNotice?.(playerId, `${skillName}的吟唱被打断：${reason}`, 'combat', undefined, undefined, buildStructuredNotice('combat', 'notice.combat.chant-interrupted', `${skillName}的吟唱被打断：${reason}`, { vars: { skillName, reason }, pills: [{ key: 'skillName', style: 'skill' }] }).structured);
        }
        return true;
    }
    /**
     * cancelPendingPlayerSkillCastForInstanceTransfer：地图实例迁移前的静默清理。
     * 与 interruptPendingPlayerSkillCast 的区别：不发玩家通知（迁移本身已有场景切换提示），
     * 只记录结构化 `instance_transfer` 诊断，保留 committed_no_refund / committed_no_rollback 资源冷却策略。
     */
    cancelPendingPlayerSkillCastForInstanceTransfer(playerId, deps) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        const pendingCast = player?.combat?.pendingSkillCast;
        if (!player || !pendingCast) {
            return false;
        }
        const cancelled = cancelPendingCombatCast(pendingCast, {
            reason: CombatPendingCastCancelReason.InstanceTransfer,
            message: 'instance_transfer',
            cancelledTick: deps?.resolveCurrentTickForPlayerId?.(playerId),
        });
        player.combat.pendingSkillCast = undefined;
        this.recordPlayerSkillReject(deps, player, null, cancelled, CombatRejectReason.PendingCastCancelled, {
            cancelReason: cancelled.cancelReason,
            cancelMessage: cancelled.cancelMessage,
            phase: 'pending_cast_cancel',
            resourcePolicy: cancelled.cancellation?.resourcePolicy,
            cooldownPolicy: cancelled.cancellation?.cooldownPolicy,
        });
        return true;
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!attacker.instanceId) {
            return null;
        }
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        if (targetRef === 'self') {
            return isSelfBuffNoTargetSkill(skill)
                ? { kind: 'self', playerId: attacker.playerId, x: attacker.x, y: attacker.y }
                : null;
        }
        const targetPlayerId = targetRef.startsWith('player:') ? targetRef.slice('player:'.length).trim() : '';
        if (targetPlayerId) {
            if (instance?.meta?.supportsPvp !== true) {
                return null;
            }
            const target = this.playerRuntimeService.getPlayer(targetPlayerId);
            if (!target || target.playerId === attacker.playerId || target.instanceId !== attacker.instanceId || target.hp <= 0) {
                return null;
            }
            if (!isHostileCombatRelationResolution(resolveCombatRelation(attacker, {
                kind: 'player',
                target,
            }))) {
                return null;
            }
            return { kind: 'player', playerId: target.playerId };
        }
        if (!targetRef.startsWith('tile:')) {
            const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
                ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, targetRef)
                : null;
            if (formation) {
                if (!isHostileCombatRelationResolution(resolveCombatRelation(attacker, { kind: 'terrain' }))) {
                    return null;
                }
                return { kind: 'formation', formationId: formation.id };
            }
            const monster = instance.getMonster(targetRef);
            if (!monster?.alive) {
                return null;
            }
            if (!isHostileCombatRelationResolution(resolveCombatRelation(attacker, { kind: 'monster' }))) {
                return null;
            }
            return { kind: 'monster', monsterId: monster.runtimeId };
        }
        const tile = parseTileTargetRef(targetRef);
        if (!tile) {
            return null;
        }
        const geometry = buildEffectivePlayerSkillGeometry(attacker, skill);
        const directDistance = chebyshevDistance(attacker.x, attacker.y, tile.x, tile.y);
        const terrainHostile = isHostileCombatRelationResolution(resolveCombatRelation(attacker, { kind: 'terrain' }));
        const directBoundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
            ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, tile.x, tile.y)
            : null;
        if (directDistance <= geometry.range && directBoundary && terrainHostile) {
            return { kind: 'formation_boundary', formationId: directBoundary.formationId, x: tile.x, y: tile.y };
        }
        const directTileState = instance.getTileCombatState(tile.x, tile.y);
        if (
            instance?.meta?.canDamageTile === true
            && (
            directDistance <= geometry.range
            && directTileState
            && directTileState.destroyed !== true
            && terrainHostile
            )
        ) {
            return { kind: 'tile', x: tile.x, y: tile.y };
        }
        const affectedCells = computeAffectedCellsFromAnchor({ x: attacker.x, y: attacker.y }, { x: tile.x, y: tile.y }, geometry);
        if (affectedCells.length === 0) {
            return null;
        }
        const getMonsterAtTile = typeof instance.getMonsterRuntimeRefAtTile === 'function'
            ? instance.getMonsterRuntimeRefAtTile.bind(instance)
            : typeof instance.getMonsterAtTile === 'function'
                ? instance.getMonsterAtTile.bind(instance)
                : null;
        const monsterByTile = getMonsterAtTile
            ? null
            : buildLiveMonsterTileIndex(typeof instance.listMonsters === 'function' ? instance.listMonsters() : []);
        for (const cell of affectedCells) {
            const monster = getMonsterAtTile
                ? getMonsterAtTile(cell.x, cell.y)
                : monsterByTile.get(buildCombatTileKey(cell.x, cell.y));
            if (
                monster?.runtimeId
                && monster.alive !== false
                && isHostileCombatRelationResolution(resolveCombatRelation(attacker, { kind: 'monster' }))
            ) {
                return { kind: 'monster', monsterId: monster.runtimeId };
            }
        }
        const formationByTile = typeof deps.worldRuntimeFormationService?.getFormationAtTile === 'function'
            ? null
            : buildRuntimeFormationTileIndex(typeof deps.worldRuntimeFormationService?.listRuntimeFormations === 'function'
                ? deps.worldRuntimeFormationService.listRuntimeFormations(attacker.instanceId)
                : []);
        for (const cell of affectedCells) {
            const formation = typeof deps.worldRuntimeFormationService?.getFormationAtTile === 'function'
                ? deps.worldRuntimeFormationService.getFormationAtTile(attacker.instanceId, cell.x, cell.y)
                : formationByTile.get(buildCombatTileKey(cell.x, cell.y));
            if (
                formation?.id
                && terrainHostile
            ) {
                return { kind: 'formation', formationId: formation.id };
            }
        }
        for (const cell of affectedCells) {
            const boundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
                ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, cell.x, cell.y)
                : null;
            if (boundary && terrainHostile) {
                return { kind: 'formation_boundary', formationId: boundary.formationId, x: cell.x, y: cell.y };
            }
        }
        // N17：禁止退化到 playerRuntimeService.listPlayerSnapshots —— 全服 5000 玩家深克隆只为找
        // affectedCells (通常 ≤ 50 格) 上的玩家，是 OOM 现场短命对象主源之一。
        // 改成对每个 affectedCell 直接走 instance.getPlayersAtTile，是 O(occupants) 扫桶。
        // 如果 instance 没实现，直接跳过本段、继续地块/阵眼分支，不退化全服扫。
        const getPlayersAtTile = typeof instance?.getPlayerRuntimeRefsAtTile === 'function'
            ? instance.getPlayerRuntimeRefsAtTile.bind(instance)
            : typeof instance?.getPlayersAtTile === 'function'
                ? instance.getPlayersAtTile.bind(instance)
                : null;
        if (instance?.meta?.supportsPvp === true && getPlayersAtTile) {
            for (const cell of affectedCells) {
                const occupants = getPlayersAtTile(cell.x, cell.y);
                for (const candidate of occupants) {
                    if (
                        !candidate?.playerId
                        || candidate.playerId === attacker.playerId
                        || candidate.hp <= 0
                    ) {
                        continue;
                    }
                    if (isHostileCombatRelationResolution(resolveCombatRelation(attacker, {
                        kind: 'player',
                        target: candidate,
                    }))) {
                        return { kind: 'player', playerId: candidate.playerId };
                    }
                }
            }
        }
        for (const cell of affectedCells) {
            const tileState = instance.getTileCombatState(cell.x, cell.y);
            if (
                tileState
                && tileState.destroyed !== true
                && terrainHostile
            ) {
                return { kind: 'tile', x: cell.x, y: cell.y };
            }
        }
        // 含有 heal 或 allies 效果的技能：即使没有敌对目标也允许释放（对自身施加治疗/buff）
        if (hasHealOrAlliesEffect(skill)) {
            return { kind: 'self', playerId: attacker.playerId, x: attacker.x, y: attacker.y };
        }
        return null;
    }

    collectSkillTargetsFromAnchor(attacker, skill, anchor, deps, primaryTarget = null) {
        const startedAt = performance.now();
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const currentTick = typeof deps.resolveCurrentTickForPlayerId === 'function'
            ? deps.resolveCurrentTickForPlayerId(attacker.playerId)
            : 0;
        const targetInput = this.toPlayerSkillPlanTargetInput(primaryTarget, anchor);
        const effectiveGeometry = buildEffectivePlayerSkillGeometry(attacker, skill);
        const actionPlan = this.resolvePlayerSkillActionPlanForDispatch(attacker, skill, {
            ...targetInput,
            targetX: targetInput.resolvedTargets ? targetInput.targetX : (targetInput.targetX ?? anchor.x),
            targetY: targetInput.resolvedTargets ? targetInput.targetY : (targetInput.targetY ?? anchor.y),
            currentTick,
            effectiveGeometry,
            maxTargets: resolveSkillTargetLimit(skill, effectiveGeometry),
            skipResourceAndCooldown: true,
        }, instance, deps);
        recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.targetPlanMs', startedAt);
        if (!actionPlan?.ok) {
            this.recordRejectedPlayerSkillPlanTargets(deps, attacker, skill, actionPlan);
            return [];
        }
        this.recordRejectedPlayerSkillPlanTargets(deps, attacker, skill, actionPlan);
        return this.toLegacyPlayerSkillTargets(actionPlan.selectedTargets ?? [], attacker);
    }
    toPlayerSkillPlanTargetInput(primaryTarget, anchor) {
        if (!primaryTarget || typeof primaryTarget !== 'object') {
            return { targetX: anchor.x, targetY: anchor.y };
        }
        if (primaryTarget.kind === 'self') {
            return { targetRef: 'self', resolvedTargets: [primaryTarget] };
        }
        if (primaryTarget.kind === 'monster') {
            return { targetMonsterId: primaryTarget.monsterId };
        }
        if (primaryTarget.kind === 'player') {
            return { targetPlayerId: primaryTarget.playerId };
        }
        if (primaryTarget.kind === 'formation') {
            return { targetFormationId: primaryTarget.formationId };
        }
        if (primaryTarget.kind === 'formation_boundary' || primaryTarget.kind === 'tile') {
            return { targetX: anchor.x, targetY: anchor.y };
        }
        return { targetX: anchor.x, targetY: anchor.y };
    }

    async dispatchSkillTargets(attacker, skillId, skill, targets, deps, castOptions = undefined) {
        if (targets.length === 0) {
            throw new BadRequestException('没有可命中的目标');
        }
        const attributedSkillResolveStartedAt = performance.now();
        const isTimeChamber = isTimeChamberSkillDispatch(attacker, deps);
        const castId = nextCastId();
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const syncKillRewardOwner = typeof deps.handlePlayerMonsterKillSynchronously === 'function'
            ? deps
            : deps.worldRuntimePlayerCombatOutcomeService;
        const syncKillReward = typeof syncKillRewardOwner?.handlePlayerMonsterKillSynchronously === 'function'
            ? syncKillRewardOwner.handlePlayerMonsterKillSynchronously
            : null;
        let syncKillRewardCalls = 0;
        let asyncKillRewardFallbackCalls = 0;
        let monsterRuntimeRefCalls = 0;
        let monsterSnapshotFallbackCalls = 0;
        const currentTick = deps.resolveCurrentTickForPlayerId(attacker.playerId);
        const effectColor = getSkillEffectColor(skill);
        const damageKind = resolveSkillDamageKind(skill);
        const damageElement = resolveSkillDamageElement(skill);
        const effectiveGeometry = buildEffectivePlayerSkillGeometry(attacker, skill);
        const effectiveRange = effectiveGeometry.range;
        const resolvedSkill = typeof this.playerCombatService.resolvePlayerSkillForCast === 'function'
            ? this.playerCombatService.resolvePlayerSkillForCast(attacker, skillId, currentTick)
            : undefined;
        if (castOptions?.prevalidatedTargets !== true) {
            const targetPlanStartedAt = performance.now();
            const actionPlan = this.resolvePlayerSkillActionPlanForDispatch(attacker, skill, {
                targetRef: castOptions?.targetRef,
                targetX: castOptions?.targetX,
                targetY: castOptions?.targetY,
                resolvedTargets: targets,
                phase: castOptions?.combatActionPhase ?? CombatActionPhase.Instant,
                skipResourceAndCooldown: castOptions?.skipResourceAndCooldown === true,
                skipResolvedTargetRangeValidation: true,
                currentTick,
                effectiveGeometry,
                maxTargets: resolveSkillTargetLimit(skill, effectiveGeometry),
            }, instance, deps);
            recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.targetPlanMs', targetPlanStartedAt);
            if (!actionPlan?.ok) {
                this.recordRejectedPlayerSkillPlanTargets(deps, attacker, skill, actionPlan);
                throw this.createPlayerSkillActionRejectException(actionPlan, skill);
            }
            this.recordRejectedPlayerSkillPlanTargets(deps, attacker, skill, actionPlan);
            const plannedTargets = this.toLegacyPlayerSkillTargets(actionPlan.selectedTargets ?? [], attacker);
            if (plannedTargets.length === 0) {
                throw new BadRequestException('没有可命中的目标');
            }
            targets = plannedTargets;
        }
        applyPlayerHorizontalFacingToward(
            this.playerRuntimeService,
            instance,
            attacker,
            resolvePlayerSkillFacingAnchor(attacker, targets, castOptions),
        );
        const outcomeDeps = castOptions?.combatActionPhase
            ? projectCombatOutcomeDeps(deps, { combatActionPhase: castOptions.combatActionPhase })
            : deps;
        const outcomeDepsWithInstance = outcomeDeps?.instance === instance
            ? outcomeDeps
            : projectCombatOutcomeDeps(outcomeDeps, { instance });
        if (castOptions?.showActionLabel !== false) {
            emitCombatPresentation({
                deps,
                instanceId: attacker.instanceId,
                actionLabel: {
                    x: attacker.x,
                    y: attacker.y,
                    text: skill.name,
                },
            });
        }
        let castIndex = 0;
        let totalSkillHeal = 0;
        let selfBuffs = [];
        const destroyedTiles = [];
        const aggregatePresentation = shouldAggregatePlayerSkillPresentation(targets.length, skill?.effects);
        const castSummary = aggregatePresentation ? createPlayerSkillCastSummary() : null;
        const pendingTileDamage = [];
        const attackerCombatState = typeof this.playerCombatService.createCombatPlayerState === 'function'
            ? this.playerCombatService.createCombatPlayerState(attacker)
            : undefined;
        const tileCombatTargetState = createReusablePlayerSkillTileCombatTarget();
        const canReuseTileSkillResult = aggregatePresentation
            && resolvedSkill
            && typeof this.playerCombatService.canReuseResolvedTileSkillResult === 'function'
            && this.playerCombatService.canReuseResolvedTileSkillResult(resolvedSkill) === true;
        let miningTileDamageMultiplier = null;
        let repeatedTileSkillResult = null;
        const recordSkillCastSectionDuration = (sectionKey, durationMs, count = 1) => {
            const normalizedKey = typeof sectionKey === 'string' && sectionKey
                ? sectionKey
                : 'unknownMs';
            recordPlayerSkillDispatchDuration(deps, `pendingCommands.castSkill.${normalizedKey}`, durationMs, count);
        };
        const options = {
            targetCount: targets.length,
            skipResourceAndCooldown: castOptions?.skipResourceAndCooldown === true,
            skipSelfEffects: false,
            skipRangeValidation: true,
            range: effectiveRange,
            resolvedSkill,
            attackerCombatState,
            formulaCacheOwner: attacker,
            isTileTarget: false,
            onQiSpent: (player, amount) => instance.disperseQiAt?.(player?.x, player?.y, amount),
            recordSkillCastSectionDuration,
        };
        const resolveTileSkillResult = (hp, maxHp, distance) => {
            if (repeatedTileSkillResult) {
                return repeatedTileSkillResult;
            }
            const combatResolveStartedAt = performance.now();
            const result = this.playerCombatService.castSkillToMonster(
                attacker,
                updateReusablePlayerSkillTileCombatTarget(tileCombatTargetState, hp, maxHp),
                skillId,
                currentTick,
                distance,
                () => undefined,
                options,
            );
            recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.combatResolveMs', combatResolveStartedAt);
            if (canReuseTileSkillResult) {
                repeatedTileSkillResult = createRepeatedPlayerSkillTileResult(result);
            }
            return result;
        };
        const targetApplyStartedAt = performance.now();
        for (const target of targets) {
            options.skipResourceAndCooldown = castOptions?.skipResourceAndCooldown === true || castIndex > 0;
            options.skipSelfEffects = castIndex > 0;
            options.isTileTarget = target.kind === 'tile'
                || target.kind === 'formation'
                || target.kind === 'formation_boundary';
            if (target.kind === 'self') {
                const combatResolveStartedAt = performance.now();
                const result = this.playerCombatService.castSelfSkill(attacker, skillId, currentTick, options);
                recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.combatResolveMs', combatResolveStartedAt);
                const outcomeApplyStartedAt = performance.now();
                this.recordPlayerSkillOutcome(outcomeDeps, attacker, skill, {
                    kind: CombatTargetKind.Self,
                    id: attacker.playerId,
                }, result, {
                    targetType: 'self',
                    targetPlayerId: attacker.playerId,
                    targetX: attacker.x,
                    targetY: attacker.y,
                });
                recordPlayerSkillOutcomeApplyPerf(
                    deps,
                    outcomeApplyStartedAt,
                    'pendingCommands.castSkill.outcomeApply.selfMs',
                );
                castIndex += 1;
                const selfHeal = Math.max(0, Math.round(Number(result.totalHeal) || 0));
                const buffs = Array.isArray(result.selfBuffs) ? result.selfBuffs : [];
                const effects = [];
                if (selfHeal > 0) effects.push({ type: 'heal', amount: selfHeal });
                for (const buff of buffs) {
                    effects.push({ type: 'buff', buffId: buff.buffId, name: buff.name, category: buff.category, duration: buff.duration });
                }
                if (effects.length > 0) {
                    const parts = [];
                    if (selfHeal > 0) parts.push(`恢复生命 ${selfHeal}`);
                    if (buffs.length > 0) parts.push(`获得 ${buffs.map(b => b.name).join('、')}`);
                    const presentationStartedAt = performance.now();
                    emitCombatPresentation({
                        deps,
                        instanceId: attacker.instanceId,
                        castId,
                        notices: [{
                            playerId: attacker.playerId,
                            text: `你施展${skill.name}，${parts.join('，')}。`,
                            combat: buildCombatNoticePayload({ caster: '你', target: '自身', skill: skill.name, effects }),
                        }],
                    });
                    recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                } else {
                    const presentationStartedAt = performance.now();
                    emitCombatPresentation({
                        deps,
                        instanceId: attacker.instanceId,
                        castId,
                        notices: [{
                            playerId: attacker.playerId,
                            text: `你施展${skill.name}。`,
                            combat: buildCombatNoticePayload({ caster: '你', target: '自身', skill: skill.name }),
                        }],
                    });
                    recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                }
                continue;
            }
            if (target.kind === 'monster') {
                let monster;
                if (typeof instance.getMonsterRuntimeRef === 'function') {
                    monsterRuntimeRefCalls += 1;
                    monster = instance.getMonsterRuntimeRef(target.monsterId);
                }
                else {
                    monsterSnapshotFallbackCalls += 1;
                    monster = instance.getMonster(target.monsterId);
                }
                if (!monster?.alive) {
                    this.recordPlayerSkillTargetSkip(deps, attacker, skill, target, monster
                        ? CombatRejectReason.MonsterDead
                        : CombatRejectReason.MissingMonster, {
                        targetMonsterId: target.monsterId,
                        targetCount: targets.length,
                        phase: 'skill_target_apply',
                    });
                    continue;
                }
                const distance = chebyshevDistance(attacker.x, attacker.y, monster.x, monster.y);
                const monsterCombatState = this.resolveMonsterCombatTargetState(monster, deps, attacker.instanceId);
                const combatResolveStartedAt = performance.now();
                const result = this.playerCombatService.castSkillToMonster(attacker, monsterCombatState, skillId, currentTick, distance, (buff) => {
                    instance.applyTemporaryBuffToMonster(monster.runtimeId, buff, { skipSnapshot: true });
                }, options);
                recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.combatResolveMs', combatResolveStartedAt);
                castIndex += 1;
                totalSkillHeal += Math.max(0, Math.round(Number(result.totalHeal) || 0));
                if (selfBuffs.length === 0 && Array.isArray(result.selfBuffs) && result.selfBuffs.length > 0) {
                    selfBuffs = result.selfBuffs;
                }
                const primaryRoll = resolvePrimaryDamageRoll(result, damageKind, damageElement);
                if (result.totalDamage <= 0) {
                    const outcomeApplyStartedAt = performance.now();
                    this.applyPlayerSkillOutcome(outcomeDeps, attacker, skill, {
                        kind: CombatTargetKind.Monster,
                        id: monster.runtimeId,
                    }, {
                        targetType: 'monster',
                        targetMonsterId: monster.runtimeId,
                        targetX: monster.x,
                        targetY: monster.y,
                        damageKind: primaryRoll.damageKind ?? damageKind,
                        element: primaryRoll.element ?? damageElement,
                        damage: 0,
                        rawDamage: primaryRoll.rawDamage,
                        dodged: primaryRoll.dodged === true,
                        crit: primaryRoll.crit === true,
                        resolved: primaryRoll.resolved === true,
                        broken: primaryRoll.broken === true,
                        defeated: false,
                        applyKillReward: false,
                    });
                    recordPlayerSkillOutcomeApplyPerf(
                        deps,
                        outcomeApplyStartedAt,
                        'pendingCommands.castSkill.outcomeApply.monsterMs',
                    );
                    if (castSummary) {
                        recordPlayerSkillEnemySummary(castSummary, 0, false);
                        continue;
                    }
                    const presentationStartedAt = performance.now();
                    emitCombatPresentation({
                        deps,
                        instanceId: attacker.instanceId,
                        castId,
                        attack: { fromX: attacker.x, fromY: attacker.y, toX: monster.x, toY: monster.y, color: effectColor },
                        resolutionFloat: { x: monster.x, y: monster.y, resolution: primaryRoll, fallbackColor: effectColor },
                        notices: [{
                            playerId: attacker.playerId,
                            text: `${formatCombatActionClause('你', formatTargetLabelWithHp(resolveMonsterDisplayName(monster), monster.hp, monster.maxHp), skill.name)}，${formatCombatResolutionOutcome(primaryRoll, primaryRoll.damageKind ?? damageKind, primaryRoll.element ?? damageElement)}`,
                            combat: buildCombatNoticePayload({ caster: '你', target: resolveMonsterDisplayName(monster), targetHp: monster.hp, targetMaxHp: monster.maxHp, skill: skill.name, resolution: { ...primaryRoll, damageKind: primaryRoll.damageKind ?? damageKind, element: primaryRoll.element ?? damageElement } }),
                        }],
                    });
                    recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                    continue;
                }
                const outcomeApplyStartedAt = performance.now();
                const appliedOutcome = this.applyPlayerSkillOutcome(outcomeDepsWithInstance, attacker, skill, {
                    kind: CombatTargetKind.Monster,
                    id: monster.runtimeId,
                }, {
                    targetType: 'monster',
                    targetMonsterId: monster.runtimeId,
                    targetX: monster.x,
                    targetY: monster.y,
                    damageKind: primaryRoll.damageKind ?? damageKind,
                    element: primaryRoll.element ?? damageElement,
                    damage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                    rawDamage: primaryRoll.rawDamage,
                    dodged: primaryRoll.dodged === true,
                    crit: primaryRoll.crit === true,
                    resolved: primaryRoll.resolved === true,
                    broken: primaryRoll.broken === true,
                    applyKillReward: false,
                });
                recordPlayerSkillOutcomeApplyPerf(
                    deps,
                    outcomeApplyStartedAt,
                    'pendingCommands.castSkill.outcomeApply.monsterMs',
                );
                const outcome = appliedOutcome?.adapterResult;
                if (outcome?.defeated) {
                    const killRewardStartedAt = performance.now();
                    if (syncKillReward) {
                        syncKillReward.call(syncKillRewardOwner, instance, outcome.monster, attacker.playerId, deps);
                        syncKillRewardCalls += 1;
                    }
                    else {
                        asyncKillRewardFallbackCalls += 1;
                        await deps.handlePlayerMonsterKill(instance, outcome.monster, attacker.playerId);
                    }
                    recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.killRewardMs', killRewardStartedAt);
                    recordPlayerSkillDispatchDuration(
                        deps,
                        isTimeChamber
                            ? 'attribution.skill.timeChamber.monsterDefeats'
                            : 'attribution.skill.nonTimeChamber.monsterDefeats',
                        0,
                        1,
                    );
                }
                if (castSummary) {
                    recordPlayerSkillEnemySummary(
                        castSummary,
                        normalizeAppliedDamage(outcome?.appliedDamage, result.totalDamage),
                        outcome?.defeated === true,
                    );
                    continue;
                }
                const presentationStartedAt = performance.now();
                emitCombatPresentation({
                    deps,
                    instanceId: attacker.instanceId,
                    castId,
                    attack: { fromX: attacker.x, fromY: attacker.y, toX: monster.x, toY: monster.y, color: effectColor },
                    resolutionFloat: { x: monster.x, y: monster.y, resolution: primaryRoll, fallbackColor: effectColor },
                    damageFloat: { x: monster.x, y: monster.y, damage: result.totalDamage, color: effectColor },
                    notices: [{
                        playerId: attacker.playerId,
                        text: `${formatCombatActionClause('你', formatTargetLabelWithHp(resolveMonsterDisplayName(monster), outcome?.hp ?? 0, monster.maxHp), skill.name)}，${formatCombatResolutionOutcome(primaryRoll, primaryRoll.damageKind ?? damageKind, primaryRoll.element ?? damageElement)}`,
                        combat: buildCombatNoticePayload({ caster: '你', target: resolveMonsterDisplayName(monster), targetHp: outcome?.hp ?? 0, targetMaxHp: monster.maxHp, skill: skill.name, resolution: { ...primaryRoll, damageKind: primaryRoll.damageKind ?? damageKind, element: primaryRoll.element ?? damageElement }, effects: Array.isArray(result.targetBuffs) && result.targetBuffs.length > 0 ? result.targetBuffs.map(b => ({ type: b.category === 'debuff' ? 'debuff' : 'buff', buffId: b.buffId, name: b.name, category: b.category, duration: b.duration })) : undefined }),
                    }],
                });
                recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                continue;
            }
            if (target.kind === 'player') {
                if (instance.isPointInSafeZone(attacker.x, attacker.y)) {
                    continue;
                }
                const targetPlayer = this.playerRuntimeService.getPlayer(target.playerId);
                if (targetPlayer && instance.isPointInSafeZone(targetPlayer.x, targetPlayer.y)) {
                    continue;
                }
                if (!targetPlayer || targetPlayer.instanceId !== attacker.instanceId || targetPlayer.hp <= 0) {
                    this.recordPlayerSkillTargetSkip(deps, attacker, skill, target, !targetPlayer
                        ? CombatRejectReason.MissingTargetRuntimeState
                        : targetPlayer.hp <= 0
                            ? CombatRejectReason.TargetDead
                            : CombatRejectReason.TargetInstanceMismatch, {
                        targetPlayerId: target.playerId,
                        targetPlayerInstanceId: targetPlayer?.instanceId,
                        attackerInstanceId: attacker.instanceId,
                        targetHp: targetPlayer?.hp,
                        targetCount: targets.length,
                        phase: 'skill_target_apply',
                    });
                    continue;
                }
                const distance = chebyshevDistance(attacker.x, attacker.y, targetPlayer.x, targetPlayer.y);
                const combatResolveStartedAt = performance.now();
                const result = this.playerCombatService.castSkill(attacker, targetPlayer, skillId, currentTick, distance, {
                    ...options,
                    skipTargetDamageApplication: true,
                });
                recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.combatResolveMs', combatResolveStartedAt);
                castIndex += 1;
                totalSkillHeal += Math.max(0, Math.round(Number(result.totalHeal) || 0));
                const appliedFriendlySupport = (
                    Math.max(0, Number(result.totalHeal) || 0) > 0
                    || (Array.isArray(result.targetBuffs)
                        && result.targetBuffs.some((entry) => entry?.category === 'buff'))
                ) && arePlayersInSameParty(attacker, targetPlayer);
                if (appliedFriendlySupport) {
                    recordPartyMemberSupport(
                        attacker.instanceId,
                        attacker.playerId,
                        targetPlayer.playerId,
                        currentTick,
                    );
                }
                if (selfBuffs.length === 0 && Array.isArray(result.selfBuffs) && result.selfBuffs.length > 0) {
                    selfBuffs = result.selfBuffs;
                }
                const primaryRoll = resolvePrimaryDamageRoll(result, damageKind, damageElement);
                const projectedDefeated = Math.max(0, Math.round(Number(targetPlayer.hp) || 0)) - Math.max(0, Math.round(Number(result.totalDamage) || 0)) <= 0;
                const outcomeApplyStartedAt = performance.now();
                const appliedOutcome = this.applyPlayerSkillOutcome({
                    ...outcomeDeps,
                    currentTick,
                }, attacker, skill, {
                    kind: CombatTargetKind.Player,
                    id: targetPlayer.playerId,
                }, {
                    targetType: 'player',
                    targetPlayerId: targetPlayer.playerId,
                    targetX: targetPlayer.x,
                    targetY: targetPlayer.y,
                    damageKind: primaryRoll.damageKind ?? damageKind,
                    element: primaryRoll.element ?? damageElement,
                    damage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                    rawDamage: primaryRoll.rawDamage,
                    dodged: primaryRoll.dodged === true,
                    crit: primaryRoll.crit === true,
                    resolved: primaryRoll.resolved === true,
                    broken: primaryRoll.broken === true,
                    recordActivity: false,
                    defeated: projectedDefeated,
                    applyDefeat: false,
                });
                recordPlayerSkillOutcomeApplyPerf(
                    deps,
                    outcomeApplyStartedAt,
                    'pendingCommands.castSkill.outcomeApply.playerMs',
                );
                this.worldRuntimeThreatService.addThreat(
                    this.worldRuntimeThreatService.buildPlayerOwnerId(targetPlayer.playerId),
                    this.worldRuntimeThreatService.buildPlayerTargetId(attacker.playerId),
                    {
                        baseThreat: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                        distance,
                        extraAggroRate: Number(attacker?.attrs?.numericStats?.extraAggroRate ?? 0) || 0,
                        now: currentTick,
                    },
                );
                this.playerRuntimeService.recordActivity(targetPlayer.playerId, currentTick, { interruptCultivation: true, reason: 'attack' });
                const updatedTarget = this.playerRuntimeService.getPlayer(targetPlayer.playerId);
                if (updatedTarget && updatedTarget.hp <= 0 && appliedOutcome?.adapterResult?.handledDefeat !== true) {
                    const killRewardStartedAt = performance.now();
                    await deps.handlePlayerDefeat(updatedTarget.playerId, attacker.playerId);
                    recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.killRewardMs', killRewardStartedAt);
                }
                if (castSummary) {
                    recordPlayerSkillEnemySummary(
                        castSummary,
                        normalizeAppliedDamage(appliedOutcome?.adapterResult?.appliedDamage, result.totalDamage),
                        Boolean(updatedTarget && updatedTarget.hp <= 0),
                    );
                    const presentationStartedAt = performance.now();
                    emitCombatPresentation({
                        deps,
                        instanceId: attacker.instanceId,
                        castId,
                        notices: [{
                            playerId: targetPlayer.playerId,
                            text: `${formatCombatActionClause(resolvePlayerDisplayName(attacker, { playerId: attacker.playerId, fallback: '未知玩家' }), '你', skill.name)}，${formatCombatResolutionOutcome(primaryRoll, primaryRoll.damageKind ?? damageKind, primaryRoll.element ?? damageElement)}`,
                            combat: buildCombatNoticePayload({ caster: resolvePlayerDisplayName(attacker, { playerId: attacker.playerId, fallback: '未知玩家' }), target: '你', skill: skill.name, resolution: { ...primaryRoll, damageKind: primaryRoll.damageKind ?? damageKind, element: primaryRoll.element ?? damageElement } }),
                        }],
                    });
                    recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                    continue;
                }
                const presentationStartedAt = performance.now();
                emitCombatPresentation({
                    deps,
                    instanceId: attacker.instanceId,
                    castId,
                    attack: { fromX: attacker.x, fromY: attacker.y, toX: targetPlayer.x, toY: targetPlayer.y, color: effectColor },
                    resolutionFloat: { x: targetPlayer.x, y: targetPlayer.y, resolution: primaryRoll, fallbackColor: effectColor },
                    damageFloat: { x: targetPlayer.x, y: targetPlayer.y, damage: result.totalDamage, color: effectColor },
                    notices: [
                        {
                            playerId: attacker.playerId,
                            text: `${formatCombatActionClause('你', formatTargetLabelWithHp(resolvePlayerDisplayName(targetPlayer, { playerId: targetPlayer.playerId, fallback: '未知玩家' }), updatedTarget?.hp ?? targetPlayer.hp, targetPlayer.maxHp), skill.name)}，${formatCombatResolutionOutcome(primaryRoll, primaryRoll.damageKind ?? damageKind, primaryRoll.element ?? damageElement)}`,
                            combat: buildCombatNoticePayload({ caster: '你', target: resolvePlayerDisplayName(targetPlayer, { playerId: targetPlayer.playerId, fallback: '未知玩家' }), targetHp: updatedTarget?.hp ?? targetPlayer.hp, targetMaxHp: targetPlayer.maxHp, skill: skill.name, resolution: { ...primaryRoll, damageKind: primaryRoll.damageKind ?? damageKind, element: primaryRoll.element ?? damageElement } }),
                        },
                        {
                            playerId: targetPlayer.playerId,
                            text: `${formatCombatActionClause(resolvePlayerDisplayName(attacker, { playerId: attacker.playerId, fallback: '未知玩家' }), '你', skill.name)}，${formatCombatResolutionOutcome(primaryRoll, primaryRoll.damageKind ?? damageKind, primaryRoll.element ?? damageElement)}`,
                            combat: buildCombatNoticePayload({ caster: resolvePlayerDisplayName(attacker, { playerId: attacker.playerId, fallback: '未知玩家' }), target: '你', skill: skill.name, resolution: { ...primaryRoll, damageKind: primaryRoll.damageKind ?? damageKind, element: primaryRoll.element ?? damageElement } }),
                        },
                    ],
                });
                recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                continue;
            }
            if (target.kind === 'formation') {
                const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
                    ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, target.formationId)
                    : null;
                if (!formation) {
                    this.recordPlayerSkillTargetSkip(deps, attacker, skill, target, CombatRejectReason.MissingTargetRuntimeState, {
                        targetFormationId: target.formationId,
                        targetCount: targets.length,
                        phase: 'skill_target_apply',
                    });
                    continue;
                }
                const distance = chebyshevDistance(attacker.x, attacker.y, formation.x, formation.y);
                const effectiveDurability = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(formation.remainingAuraBudget * formation.damagePerAura)));
                const result = resolveTileSkillResult(effectiveDurability, effectiveDurability, distance);
                castIndex += 1;
                totalSkillHeal += Math.max(0, Math.round(Number(result.totalHeal) || 0));
                if (selfBuffs.length === 0 && Array.isArray(result.selfBuffs) && result.selfBuffs.length > 0) {
                    selfBuffs = result.selfBuffs;
                }
                if (result.totalDamage <= 0) {
                    const outcomeApplyStartedAt = performance.now();
                    this.applyPlayerSkillOutcome(outcomeDeps, attacker, skill, {
                        kind: CombatTargetKind.Formation,
                        id: formation.id,
                        x: formation.x,
                        y: formation.y,
                    }, {
                        targetType: 'formation',
                        targetId: formation.id,
                        targetX: formation.x,
                        targetY: formation.y,
                        damage: 0,
                        rawDamage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                    });
                    recordPlayerSkillOutcomeApplyPerf(
                        deps,
                        outcomeApplyStartedAt,
                        'pendingCommands.castSkill.outcomeApply.formationMs',
                    );
                    const presentationStartedAt = performance.now();
                    emitCombatPresentation({
                        deps,
                        instanceId: attacker.instanceId,
                        attack: { fromX: attacker.x, fromY: attacker.y, toX: formation.x, toY: formation.y, color: effectColor },
                    });
                    recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                    continue;
                }
                const outcomeApplyStartedAt = performance.now();
                const appliedOutcome = this.applyPlayerSkillOutcome(outcomeDepsWithInstance, attacker, skill, {
                    kind: CombatTargetKind.Formation,
                    id: formation.id,
                    x: formation.x,
                    y: formation.y,
                }, {
                    targetType: 'formation',
                    targetId: formation.id,
                    targetX: formation.x,
                    targetY: formation.y,
                    damage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                    rawDamage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                });
                recordPlayerSkillOutcomeApplyPerf(
                    deps,
                    outcomeApplyStartedAt,
                    'pendingCommands.castSkill.outcomeApply.formationMs',
                );
                const adapterResult = appliedOutcome?.adapterResult ?? {};
                const appliedDamage = normalizeAppliedDamage(adapterResult.appliedDamage, result.totalDamage);
                const auraDamage = Math.max(0, Number(adapterResult.auraDamage) || 0);
                const presentationStartedAt = performance.now();
                emitCombatPresentation({
                    deps,
                    instanceId: attacker.instanceId,
                    castId,
                    attack: { fromX: attacker.x, fromY: attacker.y, toX: formation.x, toY: formation.y, color: effectColor },
                    damageFloat: { x: formation.x, y: formation.y, damage: appliedDamage, color: effectColor },
                    notices: [{
                        playerId: attacker.playerId,
                        text: `${formatCombatActionClause('你', formation.name, '攻击')}，造成 ${formatCombatDamageBreakdown(result.totalDamage, appliedDamage, result.damageKind ?? 'spell', result.damageElement)} 伤害，削减阵法灵力 ${formatAuraDamage(auraDamage)}。`,
                        combat: buildCombatNoticePayload({ caster: '你', target: formation.name, skill: '攻击', formationResolution: { rawDamage: result.totalDamage, damage: appliedDamage, damageKind: result.damageKind ?? 'spell', element: result.damageElement, auraDamage } }),
                    }],
                });
                recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                continue;
            }
            if (target.kind === 'formation_boundary') {
                const boundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
                    ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, target.x, target.y)
                    : null;
                if (!boundary) {
                    this.recordPlayerSkillTargetSkip(deps, attacker, skill, target, CombatRejectReason.MissingTargetRuntimeState, {
                        targetFormationId: target.formationId,
                        targetX: target.x,
                        targetY: target.y,
                        targetCount: targets.length,
                        phase: 'skill_target_apply',
                    });
                    continue;
                }
                const distance = chebyshevDistance(attacker.x, attacker.y, target.x, target.y);
                const effectiveDurability = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(boundary.remainingAuraBudget * boundary.damagePerAura)));
                const result = resolveTileSkillResult(effectiveDurability, effectiveDurability, distance);
                castIndex += 1;
                totalSkillHeal += Math.max(0, Math.round(Number(result.totalHeal) || 0));
                if (selfBuffs.length === 0 && Array.isArray(result.selfBuffs) && result.selfBuffs.length > 0) {
                    selfBuffs = result.selfBuffs;
                }
                if (result.totalDamage <= 0) {
                    const outcomeApplyStartedAt = performance.now();
                    this.applyPlayerSkillOutcome(outcomeDeps, attacker, skill, {
                        kind: CombatTargetKind.Formation,
                        id: boundary.formationId,
                        x: target.x,
                        y: target.y,
                    }, {
                        targetType: 'formation_boundary',
                        targetId: boundary.formationId,
                        targetX: target.x,
                        targetY: target.y,
                        damage: 0,
                        rawDamage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                        formationBoundary: true,
                    });
                    recordPlayerSkillOutcomeApplyPerf(
                        deps,
                        outcomeApplyStartedAt,
                        'pendingCommands.castSkill.outcomeApply.formationBoundaryMs',
                    );
                    const presentationStartedAt = performance.now();
                    emitCombatPresentation({
                        deps,
                        instanceId: attacker.instanceId,
                        attack: { fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, color: effectColor },
                    });
                    recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                    continue;
                }
                const outcomeApplyStartedAt = performance.now();
                const appliedOutcome = this.applyPlayerSkillOutcome(outcomeDeps, attacker, skill, {
                    kind: CombatTargetKind.Formation,
                    id: boundary.formationId,
                    x: target.x,
                    y: target.y,
                }, {
                    targetType: 'formation_boundary',
                    targetId: boundary.formationId,
                    targetX: target.x,
                    targetY: target.y,
                    damage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                    rawDamage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                    formationBoundary: true,
                });
                recordPlayerSkillOutcomeApplyPerf(
                    deps,
                    outcomeApplyStartedAt,
                    'pendingCommands.castSkill.outcomeApply.formationBoundaryMs',
                );
                const adapterResult = appliedOutcome?.adapterResult ?? {};
                const appliedDamage = normalizeAppliedDamage(adapterResult.appliedDamage, result.totalDamage);
                const auraDamage = Math.max(0, Number(adapterResult.auraDamage) || 0);
                const presentationStartedAt = performance.now();
                emitCombatPresentation({
                    deps,
                    instanceId: attacker.instanceId,
                    castId,
                    attack: { fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, color: effectColor },
                    damageFloat: { x: target.x, y: target.y, damage: appliedDamage, color: effectColor },
                    notices: [{
                        playerId: attacker.playerId,
                        text: `${formatCombatActionClause('你', boundary.name, '攻击')}边界，造成 ${formatCombatDamageBreakdown(result.totalDamage, appliedDamage, result.damageKind ?? 'spell', result.damageElement)} 伤害，削减阵法灵力 ${formatAuraDamage(auraDamage)}。`,
                        combat: buildCombatNoticePayload({ caster: '你', target: boundary.name, skill: '攻击', formationResolution: { rawDamage: result.totalDamage, damage: appliedDamage, damageKind: result.damageKind ?? 'spell', element: result.damageElement, auraDamage } }),
                    }],
                });
                recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                continue;
            }
            const tileState = target.state ?? instance.getTileCombatState(target.x, target.y);
            if (!tileState || tileState.destroyed) {
                this.recordPlayerSkillTargetSkip(deps, attacker, skill, target, tileState?.destroyed
                    ? CombatRejectReason.TargetDead
                    : CombatRejectReason.MissingTargetRuntimeState, {
                    targetX: target.x,
                    targetY: target.y,
                    destroyed: tileState?.destroyed === true,
                    targetCount: targets.length,
                    phase: 'skill_target_apply',
                });
                continue;
            }
            if (miningTileDamageMultiplier === null) {
                miningTileDamageMultiplier = resolveMiningTileDamageMultiplier(attacker);
            }
            const distance = chebyshevDistance(attacker.x, attacker.y, target.x, target.y);
            const result = resolveTileSkillResult(tileState.hp, tileState.maxHp, distance);
            castIndex += 1;
            totalSkillHeal += Math.max(0, Math.round(Number(result.totalHeal) || 0));
            if (selfBuffs.length === 0 && Array.isArray(result.selfBuffs) && result.selfBuffs.length > 0) {
                selfBuffs = result.selfBuffs;
            }
            if (castSummary && typeof instance.damageTilesBatch === 'function') {
                const effectiveTileDamage = result.totalDamage > 0
                    ? resolveMiningAdjustedTileDamage({
                        attacker,
                        tileType: tileState.tileType,
                        baseDamage: result.totalDamage,
                        miningDamageMultiplier: miningTileDamageMultiplier,
                    }).damage
                    : 0;
                const mitigatedDamage = effectiveTileDamage > 0
                    && typeof deps.worldRuntimeFormationService?.mitigateTerrainDamage === 'function'
                    ? deps.worldRuntimeFormationService.mitigateTerrainDamage(attacker.instanceId, target.x, target.y, effectiveTileDamage)
                    : effectiveTileDamage;
                pendingTileDamage.push({
                    x: target.x,
                    y: target.y,
                    damage: Math.max(0, Math.round(Number(mitigatedDamage) || 0)),
                    state: tileState,
                    tileState,
                    tileType: tileState.tileType,
                    effectiveTileDamage,
                    appliedDamage: 0,
                });
                continue;
            }
            if (result.totalDamage <= 0) {
                const outcomeApplyStartedAt = performance.now();
                this.applyPlayerSkillOutcome(outcomeDeps, attacker, skill, {
                    kind: CombatTargetKind.Tile,
                    x: target.x,
                    y: target.y,
                }, {
                    targetType: 'tile',
                    targetX: target.x,
                    targetY: target.y,
                    damage: 0,
                    rawDamage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                });
                recordPlayerSkillOutcomeApplyPerf(
                    deps,
                    outcomeApplyStartedAt,
                    'pendingCommands.castSkill.outcomeApply.tileMs',
                );
                if (castSummary) {
                    recordPlayerSkillTileSummary(castSummary, 0, false);
                    continue;
                }
                const presentationStartedAt = performance.now();
                emitCombatPresentation({
                    deps,
                    instanceId: attacker.instanceId,
                    attack: { fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, color: effectColor },
                });
                recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
                continue;
            }
            const effectiveTileDamage = resolveMiningAdjustedTileDamage({
                attacker,
                tileType: tileState.tileType,
                baseDamage: result.totalDamage,
                miningDamageMultiplier: miningTileDamageMultiplier,
            }).damage;
            const mitigatedDamage = typeof deps.worldRuntimeFormationService?.mitigateTerrainDamage === 'function'
                ? deps.worldRuntimeFormationService.mitigateTerrainDamage(attacker.instanceId, target.x, target.y, effectiveTileDamage)
                : effectiveTileDamage;
            const outcomeApplyStartedAt = performance.now();
            const appliedOutcome = this.applyPlayerSkillOutcome(outcomeDepsWithInstance, attacker, skill, {
                kind: CombatTargetKind.Tile,
                x: target.x,
                y: target.y,
            }, {
                targetType: 'tile',
                targetX: target.x,
                targetY: target.y,
                damage: Math.max(0, Math.round(Number(mitigatedDamage) || 0)),
                rawDamage: Math.max(0, Math.round(Number(effectiveTileDamage) || 0)),
                mitigatedDamage: Math.max(0, Math.round(Number(mitigatedDamage) || 0)),
                tileDropRateBonus: resolveMiningDropRateBonus(attacker),
            });
            recordPlayerSkillOutcomeApplyPerf(
                deps,
                outcomeApplyStartedAt,
                'pendingCommands.castSkill.outcomeApply.tileMs',
            );
            const tileDamageResult = appliedOutcome?.adapterResult;
            const appliedDamage = normalizeAppliedDamage(tileDamageResult?.appliedDamage, mitigatedDamage);
            spawnTileDrops({
                playerId: attacker.playerId,
                tileDrops: tileDamageResult?.tileDrops,
                deps,
            });
            const miningExpResult = applyMiningExpForTileDamage({
                attacker,
                tileType: tileState.tileType,
                appliedDamage,
                playerRuntimeService: this.playerRuntimeService,
            });
            if (miningExpResult.changed) {
                this.playerRuntimeService.markPersistenceDirtyDomains(attacker, ['profession']);
                this.playerRuntimeService.bumpPersistentRevision(attacker);
            }
            if (castSummary) {
                recordPlayerSkillTileSummary(castSummary, appliedDamage, tileDamageResult?.destroyed === true);
                if (tileDamageResult?.destroyed === true) {
                    destroyedTiles.push({ x: target.x, y: target.y });
                }
                continue;
            }
            const tileTargetName = resolveTileCombatTargetName(tileState);
            const presentationStartedAt = performance.now();
            emitCombatPresentation({
                deps,
                instanceId: attacker.instanceId,
                castId,
                attack: { fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, color: effectColor },
                damageFloat: { x: target.x, y: target.y, damage: appliedDamage, color: effectColor },
                notices: [{
                    playerId: attacker.playerId,
                    text: `${formatCombatActionClause('你', formatTargetLabelWithHp(tileTargetName, tileDamageResult?.hp ?? 0, tileState.maxHp), skill.name)}，造成 ${formatCombatDamageBreakdown(result.totalDamage, appliedDamage, damageKind, damageElement)} 伤害`,
                    combat: buildCombatNoticePayload({ caster: '你', target: tileTargetName, targetHp: tileDamageResult?.hp ?? 0, targetMaxHp: tileState.maxHp, skill: skill.name, resolution: { rawDamage: result.totalDamage, damage: appliedDamage, damageKind, element: damageElement } }),
                }],
            });
            recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.presentationMs', presentationStartedAt);
            if (tileDamageResult?.destroyed === true) {
                destroyedTiles.push({ x: target.x, y: target.y });
            }
        }
        if (pendingTileDamage.length > 0 && castSummary) {
            const outcomeApplyStartedAt = performance.now();
            let tileBatchSectionStartedAt = outcomeApplyStartedAt;
            const dropRateBonus = resolveMiningDropRateBonus(attacker);
            const batchResult = instance.damageTilesBatch(pendingTileDamage, {
                dropRateBonus,
                assumeUniqueEntries: true,
                recordBatchSectionDuration: typeof deps?.recordPendingCommandSectionDuration === 'function'
                    ? (section: string, durationMs: number, count = 1) => recordPlayerSkillDispatchDuration(
                        deps,
                        `pendingCommands.castSkill.tileBatch.damageApply.${section}`,
                        durationMs,
                        count,
                    )
                    : undefined,
            });
            recordPlayerSkillDispatchPerf(
                deps,
                'pendingCommands.castSkill.tileBatch.damageApplyMs',
                tileBatchSectionStartedAt,
            );
            tileBatchSectionStartedAt = performance.now();
            let appliedTotalDamage = 0;
            let rawTotalDamage = 0;
            let hitCount = 0;
            let settledTargetCount = 0;
            const batchedTileDrops = [];
            for (let index = 0; index < pendingTileDamage.length; index += 1) {
                const pending = pendingTileDamage[index];
                const tileDamageResult = batchResult.results[index];
                if (!tileDamageResult) {
                    continue;
                }
                const appliedDamage = normalizeAppliedDamage(tileDamageResult.appliedDamage, pending.damage);
                pending.appliedDamage = appliedDamage;
                settledTargetCount += 1;
                appliedTotalDamage += appliedDamage;
                rawTotalDamage += Math.max(0, Math.round(Number(pending.effectiveTileDamage) || 0));
                if (appliedDamage > 0) {
                    hitCount += 1;
                }
                if (Array.isArray(tileDamageResult.tileDrops) && tileDamageResult.tileDrops.length > 0) {
                    batchedTileDrops.push(...tileDamageResult.tileDrops);
                }
                recordPlayerSkillTileSummary(castSummary, appliedDamage, tileDamageResult.destroyed === true);
                if (tileDamageResult.destroyed === true) {
                    destroyedTiles.push({ x: pending.x, y: pending.y });
                }
            }
            recordPlayerSkillDispatchPerf(
                deps,
                'pendingCommands.castSkill.tileBatch.resultCollectMs',
                tileBatchSectionStartedAt,
            );
            tileBatchSectionStartedAt = performance.now();
            spawnTileDrops({
                playerId: attacker.playerId,
                tileDrops: batchedTileDrops,
                deps,
            });
            recordPlayerSkillDispatchPerf(
                deps,
                'pendingCommands.castSkill.tileBatch.dropSpawnMs',
                tileBatchSectionStartedAt,
            );
            tileBatchSectionStartedAt = performance.now();
            const miningExpResult = applyMiningExpForTileDamageBatch({
                attacker,
                entries: pendingTileDamage,
                playerRuntimeService: this.playerRuntimeService,
            });
            if (miningExpResult.changed) {
                this.playerRuntimeService.markPersistenceDirtyDomains(attacker, ['profession']);
                this.playerRuntimeService.bumpPersistentRevision(attacker);
            }
            recordPlayerSkillDispatchPerf(
                deps,
                'pendingCommands.castSkill.tileBatch.miningExpMs',
                tileBatchSectionStartedAt,
            );
            tileBatchSectionStartedAt = performance.now();
            if (settledTargetCount > 0) {
                const firstTarget = pendingTileDamage[0];
                this.recordPlayerSkillOutcome(outcomeDeps, attacker, skill, {
                    kind: CombatTargetKind.Tile,
                    x: firstTarget.x,
                    y: firstTarget.y,
                }, {
                    hitCount,
                    targetCount: settledTargetCount,
                    totalDamage: appliedTotalDamage,
                    totalRawDamage: rawTotalDamage,
                    damageKind,
                    damageElement,
                }, {
                    targetType: 'tile_batch',
                    batch: true,
                    fastPathCount: batchResult.fastPathCount,
                    fallbackCount: batchResult.fallbackCount,
                });
            }
            recordPlayerSkillDispatchPerf(
                deps,
                'pendingCommands.castSkill.tileBatch.recordMs',
                tileBatchSectionStartedAt,
            );
            recordPlayerSkillOutcomeApplyPerf(
                deps,
                outcomeApplyStartedAt,
                'pendingCommands.castSkill.outcomeApply.tileBatchMs',
            );
        }
        if (castIndex === 0) {
            throw new BadRequestException('没有可命中的目标');
        }
        if (syncKillRewardCalls > 0) {
            recordPlayerSkillDispatchDuration(
                deps,
                'pendingCommands.castSkill.killRewardSyncCalls',
                0,
                syncKillRewardCalls,
            );
        }
        if (asyncKillRewardFallbackCalls > 0) {
            recordPlayerSkillDispatchDuration(
                deps,
                'pendingCommands.castSkill.killRewardAsyncFallbackCalls',
                0,
                asyncKillRewardFallbackCalls,
            );
        }
        if (monsterRuntimeRefCalls > 0) {
            recordPlayerSkillDispatchDuration(
                deps,
                'pendingCommands.castSkill.monsterRuntimeRefCalls',
                0,
                monsterRuntimeRefCalls,
            );
        }
        if (monsterSnapshotFallbackCalls > 0) {
            recordPlayerSkillDispatchDuration(
                deps,
                'pendingCommands.castSkill.monsterSnapshotFallbackCalls',
                0,
                monsterSnapshotFallbackCalls,
            );
        }
        recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.targetApplyMs', targetApplyStartedAt, targets.length);
        const postEffectsStartedAt = performance.now();
        if (castSummary) {
            const summaryEffect = buildPlayerSkillDamageSummaryEffect({
                summary: castSummary,
                x: attacker.x,
                y: attacker.y,
                color: effectColor,
            });
            const summaryNotice = buildPlayerSkillSummaryNotice(castSummary, skill.name);
            if (summaryEffect || summaryNotice) {
                emitCombatPresentation({
                    deps,
                    instanceId: attacker.instanceId,
                    castId,
                    combatEffects: summaryEffect ? [summaryEffect] : undefined,
                    notices: summaryNotice
                        ? [{ playerId: attacker.playerId, text: '', combat: summaryNotice }]
                        : undefined,
                });
            }
        }
        if (totalSkillHeal > 0 || selfBuffs.length > 0) {
            const effects = [];
            if (totalSkillHeal > 0) {
                effects.push({ type: 'heal', amount: totalSkillHeal });
            }
            for (const buff of selfBuffs) {
                effects.push({ type: 'buff', buffId: buff.buffId, name: buff.name, category: buff.category, duration: buff.duration });
            }
            const parts = [];
            if (totalSkillHeal > 0) parts.push(`恢复生命 ${totalSkillHeal}`);
            if (selfBuffs.length > 0) parts.push(`获得 ${selfBuffs.map(b => b.name).join('、')}`);
            emitCombatPresentation({
                deps,
                instanceId: attacker.instanceId,
                castId,
                notices: [{
                    playerId: attacker.playerId,
                    text: `${skill.name}：${parts.join('，')}。`,
                    combat: buildCombatNoticePayload({ caster: '你', target: '自身', skill: skill.name, effects }),
                }],
            });
        }
        for (const tile of destroyedTiles) {
            deps.worldRuntimeSectService?.expandSectForDestroyedTile?.(attacker.instanceId, tile.x, tile.y, deps);
        }
        recordPlayerSkillDispatchPerf(deps, 'pendingCommands.castSkill.postEffectsMs', postEffectsStartedAt);
        const attributedResolveDurationMs = performance.now() - attributedSkillResolveStartedAt;
        recordPlayerSkillDispatchDuration(
            deps,
            isTimeChamber
                ? 'attribution.skill.timeChamber.resolveMs'
                : 'attribution.skill.nonTimeChamber.resolveMs',
            attributedResolveDurationMs,
            1,
        );
        recordPlayerSkillDispatchDuration(
            deps,
            resolveSkillTargetCountDurationKey(targets.length),
            attributedResolveDurationMs,
            1,
        );
        recordPlayerSkillDispatchDuration(deps, 'attribution.skill.targets', 0, targets.length);
    }
    resolvePlayerSkillActionPlanForDispatch(attacker, skill, input, instance, deps) {
        if (!this.worldRuntimeCombatActionService?.resolvePlayerSkillActionPlan) {
            return null;
        }
        const cooldownReadyTickByActionId = skill?.id
            ? { [skill.id]: normalizePlayerSkillCooldownReadyTick(attacker, skill, input.currentTick) }
            : attacker.combat?.cooldownReadyTickBySkillId;
        const shouldProfilePlan = typeof deps?.recordPendingCommandSectionDuration === 'function'
            && (this.playerSkillTargetPlanProfileSequence++ % PLAYER_SKILL_TARGET_PLAN_PROFILE_SAMPLE_RATE) === 0;
        const recordPlanSectionDuration = shouldProfilePlan
            ? (sectionKey, durationMs, count = 1) => recordPlayerSkillDispatchDuration(
                deps,
                `pendingCommands.castSkill.targetPlan.${sectionKey}`,
                durationMs * PLAYER_SKILL_TARGET_PLAN_PROFILE_SAMPLE_RATE,
                count * PLAYER_SKILL_TARGET_PLAN_PROFILE_SAMPLE_RATE,
            )
            : undefined;
        let monsterRelationResolved = false;
        let monsterRelation = null;
        let terrainRelationResolved = false;
        let terrainRelation = null;
        const plan = this.worldRuntimeCombatActionService.resolvePlayerSkillActionPlan({
            playerId: attacker.playerId,
            skillId: skill?.id,
            attacker,
            skill,
            instanceId: attacker.instanceId,
            instance,
            playerRuntimeService: this.playerRuntimeService,
            formationService: deps.worldRuntimeFormationService,
            supportsPvp: instance?.meta?.supportsPvp === true,
            canDamageTile: instance?.meta?.canDamageTile === true,
            resources: attacker,
            cooldownReadyTickByActionId,
            resolveCombatRelation: (_actor, target) => {
                if (target.kind === CombatTargetKind.Player) {
                    const playerTarget = target.runtime ?? this.playerRuntimeService.getPlayer(target.id);
                    return resolveCombatRelation(attacker, {
                        kind: 'player',
                        target: playerTarget,
                    });
                }
                if (target.kind === CombatTargetKind.Monster) {
                    if (!monsterRelationResolved) {
                        monsterRelation = resolveCombatRelation(attacker, { kind: 'monster' });
                        monsterRelationResolved = true;
                    }
                    return monsterRelation;
                }
                if (target.kind === CombatTargetKind.Self) {
                    return { hostile: true, canAttack: true, relation: 'self' };
                }
                if (!terrainRelationResolved) {
                    terrainRelation = resolveCombatRelation(attacker, { kind: 'terrain' });
                    terrainRelationResolved = true;
                }
                return terrainRelation;
            },
            ...input,
            recordPlanSectionDuration,
        });
        return plan;
    }
    toLegacyPlayerSkillTargets(targets, attacker) {
        const legacyTargets = [];
        for (const target of targets) {
            if (!target || typeof target !== 'object') {
                continue;
            }
            if (target.kind === CombatTargetKind.Self) {
                legacyTargets.push({
                    kind: 'self',
                    playerId: target.id ?? attacker.playerId,
                    x: target.x ?? attacker.x,
                    y: target.y ?? attacker.y,
                    source: target.source,
                });
                continue;
            }
            if (target.kind === CombatTargetKind.Monster) {
                legacyTargets.push({
                    kind: 'monster',
                    monsterId: target.id,
                    x: target.x,
                    y: target.y,
                    source: target.source,
                });
                continue;
            }
            if (target.kind === CombatTargetKind.Player) {
                legacyTargets.push({
                    kind: 'player',
                    playerId: target.id,
                    x: target.x,
                    y: target.y,
                    source: target.source,
                });
                continue;
            }
            if (target.kind === CombatTargetKind.Formation) {
                legacyTargets.push({
                    kind: target.source === 'formation_boundary' ? 'formation_boundary' : 'formation',
                    formationId: target.id,
                    x: target.x,
                    y: target.y,
                    source: target.source,
                });
                continue;
            }
            if (target.kind === CombatTargetKind.Tile) {
                legacyTargets.push({
                    kind: 'tile',
                    x: target.x,
                    y: target.y,
                    state: target.state,
                    source: target.source,
                });
            }
        }
        return legacyTargets;
    }
    recordRejectedPlayerSkillPlanTargets(deps, attacker, skill, actionPlan) {
        const rejectedTargets = actionPlan?.details?.rejectedTargets;
        if (!Array.isArray(rejectedTargets) || rejectedTargets.length === 0) {
            return;
        }
        for (const rejected of rejectedTargets) {
            if (!rejected?.target || !rejected.reason) {
                continue;
            }
            const legacyTarget = this.toLegacyPlayerSkillTargets([rejected.target], attacker)[0] ?? rejected.target;
            this.recordPlayerSkillTargetSkip(deps, attacker, skill, legacyTarget, rejected.reason, {
                ...rejected.details,
                targetCount: actionPlan?.targetCollection?.targets?.length ?? 0,
                phase: 'skill_target_plan',
            });
        }
    }
    createPlayerSkillActionRejectException(actionPlan, skill) {
        const reason = actionPlan?.reason;
        if (reason === CombatRejectReason.ActorDead) {
            return new BadRequestException('施法者已死亡');
        }
        if (reason === CombatRejectReason.MissingSkill) {
            return new BadRequestException(`技能不存在：${skill?.id ?? actionPlan?.action?.actionId ?? ''}`);
        }
        if (reason === CombatRejectReason.MissingInstance) {
            return new BadRequestException('当前地图实例不存在');
        }
        if (reason === CombatRejectReason.InsufficientResource) {
            return new BadRequestException(`技能 ${skill?.id ?? actionPlan?.action?.actionId ?? ''} 元气不足`);
        }
        if (reason === CombatRejectReason.CooldownNotReady) {
            return new BadRequestException(`技能 ${skill?.id ?? actionPlan?.action?.actionId ?? ''} 尚在冷却`);
        }
        if (reason === CombatRejectReason.OutOfRange) {
            return new BadRequestException(`技能 ${skill?.id ?? actionPlan?.action?.actionId ?? ''} 超出范围`);
        }
        if (reason === CombatRejectReason.LineOfSightBlocked) {
            return new BadRequestException('目标被遮挡');
        }
        if (reason === CombatRejectReason.MapCapabilityDisabled) {
            const capability = actionPlan?.details?.rejectedTargets?.[0]?.details?.capability;
            return new BadRequestException(capability === 'supportsPvp' ? '当前实例不允许玩家互攻' : '当前实例不允许攻击地块');
        }
        if (reason === CombatRejectReason.CombatRelationNotAllowed) {
            return new BadRequestException('当前目标不在敌方判定规则内');
        }
        if (reason === CombatRejectReason.TargetDead) {
            return new BadRequestException('目标已经死亡');
        }
        if (reason === CombatRejectReason.MissingMonster
            || reason === CombatRejectReason.MissingTargetRuntimeState
            || reason === CombatRejectReason.TargetInstanceMismatch
            || reason === CombatRejectReason.TargetTypeNotAllowed) {
            return new BadRequestException('没有可命中的目标');
        }
        return new BadRequestException('没有可命中的目标');
    }
    resolvePlayerSkillActionPlanShadow(attacker, skill, input, instance, deps) {
        try {
            const plan = this.resolvePlayerSkillActionPlanForDispatch(attacker, skill, input, instance, deps);
            if (Array.isArray(deps?.combatActionPlanShadows)) {
                deps.combatActionPlanShadows.push(plan);
            }
            if (!plan.ok && Array.isArray(deps?.combatActionPlanShadowDiagnostics)) {
                deps.combatActionPlanShadowDiagnostics.push({
                    ok: false,
                    phase: plan.action?.phase ?? input.phase ?? CombatActionPhase.Instant,
                    reason: plan.reason,
                    actor: plan.action?.actor ?? {
                        kind: CombatActorKind.Player,
                        id: attacker.playerId,
                    },
                    actionId: skill?.id ?? null,
                    instanceId: attacker.instanceId,
                    target: plan.action?.target ?? null,
                    details: {
                        shadow: true,
                        targetCount: plan.targetCollection?.targets?.length ?? 0,
                        rejectedCount: plan.details?.rejectedTargets?.length ?? 0,
                    },
                    createdAt: new Date().toISOString(),
                });
            }
            return plan;
        }
        catch (error) {
            if (Array.isArray(deps?.combatActionPlanShadowDiagnostics)) {
                deps.combatActionPlanShadowDiagnostics.push({
                    ok: false,
                    phase: input.phase ?? CombatActionPhase.Instant,
                    reason: CombatRejectReason.CastFailed,
                    actor: {
                        kind: CombatActorKind.Player,
                        id: attacker.playerId,
                    },
                    actionId: skill?.id ?? null,
                    instanceId: attacker.instanceId,
                    target: null,
                    details: {
                        shadow: true,
                        error: error instanceof Error ? error.message : String(error),
                    },
                    createdAt: new Date().toISOString(),
                });
            }
            return null;
        }
    }

    applyPlayerSkillOutcome(deps, attacker, skill, target, result: AnyRecord = {}) {
        if (!this.worldRuntimeCombatActionService?.applyCombatOutcome) {
            return null;
        }
        return this.worldRuntimeCombatActionService.applyCombatOutcome({
            phase: deps?.combatActionPhase ?? CombatActionPhase.Instant,
            actor: {
                kind: CombatActorKind.Player,
                id: attacker.playerId,
            },
            actionId: skill?.id ?? result?.skillId ?? null,
            instanceId: attacker.instanceId,
            target,
            result: {
                actionKind: 'skill',
                attackerPlayerId: attacker.playerId,
                skillId: skill?.id ?? result?.skillId,
                ...result,
            },
            deps: this.resolvePlayerSkillOutcomeDeps(deps),
            adapters: this.playerSkillOutcomeAdapters,
            mergeAdapterResultToOutcome: true,
            record: true,
        });
    }
    resolvePlayerSkillOutcomeDeps(deps) {
        if (deps?.playerRuntimeService === this.playerRuntimeService) {
            return deps;
        }
        return projectCombatOutcomeDeps(deps, {
            playerRuntimeService: this.playerRuntimeService,
        });
    }

    recordPlayerSkillOutcome(deps, attacker, skill, target, result: AnyRecord = {}, details: AnyRecord = {}) {
        if (this.worldRuntimeCombatActionService?.recordOutcome) {
            return this.worldRuntimeCombatActionService.recordOutcome(deps, {
                phase: deps?.combatActionPhase ?? CombatActionPhase.Instant,
                actor: {
                    kind: CombatActorKind.Player,
                    id: attacker.playerId,
                },
                actionId: skill?.id ?? result?.skillId ?? null,
                instanceId: attacker.instanceId,
                target,
                result: {
                    actionKind: 'skill',
                    attackerPlayerId: attacker.playerId,
                    skillId: skill?.id ?? result?.skillId,
                    qiCost: Math.max(0, Math.round(Number(result?.qiCost) || 0)),
                    hitCount: Math.max(0, Math.round(Number(result?.hitCount) || 0)),
                    targetCount: Math.max(1, Math.round(Number(result?.targetCount ?? details.targetCount ?? 1) || 1)),
                    totalDamage: Math.max(0, Math.round(Number(result?.totalDamage) || 0)),
                    totalRawDamage: Math.max(0, Math.round(Number(result?.totalRawDamage) || 0)),
                    damageKind: result?.damageKind,
                    element: result?.damageElement,
                    dodged: result?.dodged === true,
                    crit: result?.crit === true,
                    resolved: result?.resolved === true,
                    broken: result?.broken === true,
                    ...details,
                },
            });
        }
        if (Array.isArray(deps?.combatOutcomes)) {
            deps.combatOutcomes.push({
                ok: true,
                phase: deps?.combatActionPhase ?? CombatActionPhase.Instant,
                actionId: skill?.id ?? result?.skillId ?? null,
                instanceId: attacker.instanceId,
                target,
                result: details,
            });
        }
        return null;
    }
    recordPlayerSkillTargetSkip(deps, attacker, skill, target, reason, details = {}) {
        const targetRef = formatSkippedPlayerSkillTargetRef(target);
        return this.recordPlayerSkillReject(deps, attacker, skill, {
            skillId: skill?.id,
            targetRef,
            targetX: target?.x,
            targetY: target?.y,
        }, reason, {
            targetKind: target?.kind,
            targetRef,
            ...details,
        });
    }
    recordPlayerSkillReject(deps, attacker, skill, pendingCast, reason, details = {}) {
        if (!this.worldRuntimeCombatActionService?.recordReject) {
            return null;
        }
        const action = pendingCast?.kind === 'combat_pending_cast'
            ? createPlayerSkillActionFromPendingCast(pendingCast, {
                actorId: attacker.playerId,
                instanceId: attacker.instanceId,
                phase: pendingCast.status === CombatPendingCastStatus.Cancelled
                    ? CombatActionPhase.Cancel
                    : CombatActionPhase.ChantResolve,
            })
            : this.worldRuntimeCombatActionService.createPlayerSkillAction?.({
            playerId: attacker.playerId,
            skillId: skill?.id ?? pendingCast?.skillId,
            instanceId: attacker.instanceId,
            phase: CombatActionPhase.ChantResolve,
            targetRef: pendingCast?.targetRef,
            targetX: pendingCast?.targetX,
            targetY: pendingCast?.targetY,
        }) ?? null;
        const phase = pendingCast?.status === CombatPendingCastStatus.Cancelled
            ? CombatActionPhase.Cancel
            : CombatActionPhase.ChantResolve;
        return this.worldRuntimeCombatActionService.recordReject(deps, {
            phase,
            reason,
            actor: action?.actor ?? {
                kind: CombatActorKind.Player,
                id: attacker.playerId,
            },
            actionId: skill?.id ?? pendingCast?.skillId ?? null,
            instanceId: attacker.instanceId,
            target: action?.target ?? null,
            details: {
                skillId: skill?.id ?? pendingCast?.skillId,
                ...details,
            },
        }, { severity: 'debug' });
    }

    async dispatchCastSkillToFormation(attacker, skillId, formationInstanceId, deps) {
  // 阵法按地形敌对规则承受技能，伤害折算为阵眼剩余灵力扣减。

        ensurePlayerSkillActionEnabled(attacker, skillId);
        const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
            ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, formationInstanceId)
            : null;
        if (!formation) {
            throw new NotFoundException(`阵法不存在：${formationInstanceId}`);
        }
        ensureHostileRelation(resolveCombatRelation(attacker, { kind: 'terrain' }));
        const skill = findPlayerSkill(attacker, skillId);
        if (!skill) {
            throw new NotFoundException(`技能不存在：${skillId}`);
        }
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: formation.x, y: formation.y }, deps, {
            kind: 'formation',
            formationId: formation.id,
            x: formation.x,
            y: formation.y,
        });
        if (targets.length === 0) {
            throw new BadRequestException('没有可命中的目标');
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps, {
            prevalidatedTargets: true,
            targetX: formation.x,
            targetY: formation.y,
        });
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        ensurePlayerSkillActionEnabled(attacker, skillId);
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const target = instance.getMonster(targetMonsterId);
        if (!target) {
            throw new NotFoundException(`妖兽不存在：${targetMonsterId}`);
        }
        ensureHostileRelation(resolveCombatRelation(attacker, { kind: 'monster' }));
        const skill = findPlayerSkill(attacker, skillId);
        if (!skill) {
            throw new NotFoundException(`技能不存在：${skillId}`);
        }
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: target.x, y: target.y }, deps, {
            kind: 'monster',
            monsterId: target.runtimeId,
            x: target.x,
            y: target.y,
        });
        if (targets.length === 0) {
            throw new BadRequestException('没有可命中的目标');
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps, {
            prevalidatedTargets: true,
            targetX: target.x,
            targetY: target.y,
        });
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        ensurePlayerSkillActionEnabled(attacker, skillId);
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const boundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
            ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, targetX, targetY)
            : null;
        if (boundary) {
            ensureHostileRelation(resolveCombatRelation(attacker, { kind: 'terrain' }));
            const skill = findPlayerSkill(attacker, skillId);
            if (!skill) {
                throw new NotFoundException(`技能不存在：${skillId}`);
            }
            const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: targetX, y: targetY }, deps, {
                kind: 'formation_boundary',
                formationId: boundary.formationId,
                x: targetX,
                y: targetY,
            });
            if (targets.length === 0) {
                throw new BadRequestException('没有可命中的目标');
            }
            await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps, {
                prevalidatedTargets: true,
                targetX,
                targetY,
            });
            return;
        }
        ensureInstanceSupportsTileDamage(instance);
        const tileState = instance.getTileCombatState(targetX, targetY);
        if (!tileState || tileState.destroyed) {
            throw new BadRequestException('该目标无法被攻击');
        }
        ensureHostileRelation(resolveCombatRelation(attacker, { kind: 'terrain' }));
        const skill = findPlayerSkill(attacker, skillId);
        if (!skill) {
            throw new NotFoundException(`技能不存在：${skillId}`);
        }
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: targetX, y: targetY }, deps, {
            kind: 'tile',
            x: targetX,
            y: targetY,
        });
        if (targets.length === 0) {
            throw new BadRequestException('没有可命中的目标');
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps, {
            prevalidatedTargets: true,
            targetX,
            targetY,
        });
    }
};

function resolveCachedMonsterCombatTargetState(monster, playerRuntimeService, cache, formationService = null, instanceId = monster?.instanceId) {
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

function resolveMonsterCombatExpEquivalent(monster, playerRuntimeService) {
    const progressionService = playerRuntimeService?.playerProgressionService;
    if (typeof progressionService?.getMonsterCombatExpEquivalent === 'function') {
        const resolved = progressionService.getMonsterCombatExpEquivalent(monster);
        if (Number.isFinite(resolved) && resolved > 0) {
            return Math.floor(resolved);
        }
    }
    return resolveMonsterCombatExpEquivalentFallback(monster);
}

function buildCombatTileKey(x, y) {
    return `${Math.trunc(Number(x))}:${Math.trunc(Number(y))}`;
}

function buildLiveMonsterTileIndex(monsters) {
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

function buildRuntimeFormationTileIndex(formations) {
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
