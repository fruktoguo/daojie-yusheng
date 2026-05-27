/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { formatDisplayNumber, getBasicAttackCombatExperienceDamageMultiplier, getDamageTrailColor, uiLabels } from '@mud/shared';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import { resolveCombatDamage } from '../../combat/combat-pipeline-compose';
import { createCombatOutcomeApplyAdapters } from '../../combat/combat-outcome-apply-adapters';
import { resolveMonsterCombatExpEquivalentFallback } from '../../combat/monster-combat-exp-equivalent.helper';
import { isHostileCombatRelationResolution, resolveCombatRelation } from '../../player/player-combat-config.helpers';
import { WorldRuntimeCombatActionService } from './world-runtime-combat-action.service';
import { CombatActionKind, CombatActionPhase, CombatActorKind, CombatRejectReason, CombatTargetKind } from './combat-action.types';
import { emitCombatPresentation } from './world-runtime-combat-presentation.helpers';
import { buildStructuredNotice } from '../structured-notice.helpers';
import { applyMiningExpForTileDamage, resolveMiningAdjustedTileDamage, spawnTileDrops } from './tile-drop.helpers';
import { WorldRuntimeThreatService } from './world-runtime-threat.service';
import * as world_runtime_path_planning_helpers_1 from '../world-runtime.path-planning.helpers';
import * as world_runtime_observation_helpers_1 from '../query/world-runtime.observation.helpers';

const { chebyshevDistance } = world_runtime_path_planning_helpers_1;
const {
    buildCombatNoticePayload,
    createTileCombatAttributes,
    createTileCombatNumericStats,
    createTileCombatRatioDivisors,
    formatCombatDamageBreakdown,
    formatCombatResolutionOutcome,
    formatCombatActionClause,
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
function normalizeAppliedDamage(value, fallback = 0) {
    if (Number.isFinite(Number(value))) {
        return Math.max(0, Math.round(Number(value)));
    }
    return Math.max(0, Math.round(Number(fallback) || 0));
}
function buildBasicAttackNoticeResolution(resolvedDamage, damageKind) {
    const resolution: Record<string, unknown> = {
        rawDamage: resolvedDamage.rawDamage,
        damage: resolvedDamage.damage,
        damageKind,
    };
    if (resolvedDamage.dodged) {
        resolution.dodged = true;
    }
    if (resolvedDamage.crit) {
        resolution.crit = true;
    }
    if (resolvedDamage.broken) {
        resolution.broken = true;
    }
    if (resolvedDamage.resolved) {
        resolution.resolved = true;
    }
    return resolution;
}

/** 普攻落地服务：承接 dispatchBasicAttack 的伤害与副作用编排。 */
@Injectable()
export class WorldRuntimeBasicAttackService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    worldRuntimeCombatActionService;
    worldRuntimeThreatService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(WorldRuntimeCombatActionService) worldRuntimeCombatActionService: any,
        @Inject(WorldRuntimeThreatService) worldRuntimeThreatService: any = undefined,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeCombatActionService = worldRuntimeCombatActionService;
        this.worldRuntimeThreatService = worldRuntimeThreatService ?? new WorldRuntimeThreatService();
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
            throw new BadRequestException(`玩家 ${playerId} 未进入地图实例`);
        }
        deps.ensureAttackAllowed(attacker);
        const damageKind = attacker.attrs.numericStats.spellAtk > attacker.attrs.numericStats.physAtk ? 'spell' : 'physical';
        const baseDamage = Math.max(1, Math.round(damageKind === 'spell'
            ? attacker.attrs.numericStats.spellAtk
            : attacker.attrs.numericStats.physAtk));
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const actionPlan = this.resolvePlayerBasicAttackActionPlan(
            attacker,
            {
                playerId,
                targetPlayerId,
                targetMonsterId,
                targetX,
                targetY,
            },
            instance,
            deps,
        );
        if (!actionPlan.ok) {
            throw this.createBasicAttackRejectException(actionPlan);
        }
        const plannedTarget = actionPlan.selectedTargets?.[0] ?? actionPlan.targetEntries?.[0] ?? null;
        if (plannedTarget?.kind === CombatTargetKind.Formation) {
            if (plannedTarget.source === 'formation_boundary') {
                return this.dispatchBasicAttackToTile(attacker, plannedTarget.x, plannedTarget.y, damageKind, baseDamage, deps, currentTick, { plannedTarget });
            }
            return this.dispatchBasicAttackToFormation(attacker, plannedTarget.runtime ?? {
                id: plannedTarget.id,
                name: plannedTarget.name ?? plannedTarget.id,
                x: plannedTarget.x,
                y: plannedTarget.y,
            }, damageKind, baseDamage, deps);
        }
        if (plannedTarget?.kind === CombatTargetKind.Monster) {
            return this.dispatchBasicAttackToMonster(attacker, plannedTarget.id, damageKind, baseDamage, deps);
        }
        if (plannedTarget?.kind === CombatTargetKind.Player) {
            return this.dispatchBasicAttackToPlayer(attacker, plannedTarget.id, damageKind, baseDamage, currentTick, deps);
        }
        if (plannedTarget?.kind === CombatTargetKind.Tile || plannedTarget?.kind === CombatTargetKind.Container) {
            return this.dispatchBasicAttackToTile(attacker, plannedTarget.x, plannedTarget.y, damageKind, baseDamage, deps, currentTick, { plannedTarget });
        }
        throw new BadRequestException('必须指定目标');
    }
    resolvePlayerBasicAttackActionPlan(attacker, targetInput, instance, deps) {
        return this.worldRuntimeCombatActionService.resolvePlayerBasicAttackActionPlan({
            ...targetInput,
            attacker,
            instanceId: attacker.instanceId,
            instance,
            deps,
            playerRuntimeService: this.playerRuntimeService,
            formationService: deps.worldRuntimeFormationService,
            supportsPvp: instance?.meta?.supportsPvp === true,
            canDamageTile: instance?.meta?.canDamageTile === true,
            resolveCombatRelation: (_actor, target) => {
                if (target.kind === CombatTargetKind.Player) {
                    const playerTarget = target.runtime ?? this.playerRuntimeService.getPlayer(target.id);
                    return resolveCombatRelation(attacker, {
                        kind: 'player',
                        target: playerTarget,
                    });
                }
                if (target.kind === CombatTargetKind.Monster) {
                    return resolveCombatRelation(attacker, { kind: 'monster' });
                }
                return resolveCombatRelation(attacker, { kind: 'terrain' });
            },
        });
    }
    createBasicAttackRejectException(actionPlan) {
        const reason = actionPlan?.reason;
        if (reason === CombatRejectReason.MissingMonster || reason === CombatRejectReason.MonsterDead) {
            return new NotFoundException(`妖兽不存在：${actionPlan?.action?.target?.id ?? ''}`);
        }
        if (reason === CombatRejectReason.ActorDead) {
            return new BadRequestException('你已经重伤，无法攻击');
        }
        if (reason === CombatRejectReason.TargetInstanceMismatch) {
            return new BadRequestException('目标不在同一地图');
        }
        if (reason === CombatRejectReason.OutOfRange) {
            return new BadRequestException('目标超出攻击距离');
        }
        if (reason === CombatRejectReason.MapCapabilityDisabled) {
            const capability = actionPlan?.details?.rejectedTargets?.[0]?.details?.capability;
            return new BadRequestException(capability === 'supportsPvp' ? '当前实例不允许玩家互攻' : '当前实例不允许攻击地块');
        }
        if (reason === CombatRejectReason.CombatRelationNotAllowed) {
            return new BadRequestException('当前目标不在敌方判定规则内');
        }
        if (reason === CombatRejectReason.TargetDead || reason === CombatRejectReason.MissingTargetRuntimeState) {
            return new BadRequestException('该目标无法被攻击');
        }
        return new BadRequestException('必须指定目标');
    }
    dispatchBasicAttackToFormation(attacker, formation, damageKind, baseDamage, deps) {
  // 阵法无生命条，承受伤害时直接按配置折算扣除阵眼剩余灵力。

        ensureHostileRelation(resolveCombatRelation(attacker, { kind: 'terrain' }));
        if (chebyshevDistance(attacker.x, attacker.y, formation.x, formation.y) > 1) {
            throw new BadRequestException('目标超出攻击距离');
        }
        const effectColor = getDamageTrailColor(damageKind);
        const appliedOutcome = this.applyPlayerBasicAttackOutcome(deps, attacker, {
            kind: CombatTargetKind.Formation,
            id: formation.id,
            x: formation.x,
            y: formation.y,
        }, {
            targetType: 'formation',
            targetId: formation.id,
            targetX: formation.x,
            targetY: formation.y,
            damageKind,
            damage: baseDamage,
            rawDamage: baseDamage,
        });
        const adapterResult = appliedOutcome?.adapterResult ?? {};
        const appliedDamage = normalizeAppliedDamage(adapterResult.appliedDamage, baseDamage);
        const auraDamage = Math.max(0, Number(adapterResult.auraDamage) || 0);
        emitCombatPresentation({
            deps,
            instanceId: attacker.instanceId,
            actionLabel: { x: attacker.x, y: attacker.y, text: '攻击' },
            attack: { fromX: attacker.x, fromY: attacker.y, toX: formation.x, toY: formation.y, color: effectColor },
            damageFloat: { x: formation.x, y: formation.y, damage: appliedDamage, color: effectColor },
            notices: [{
                playerId: attacker.playerId,
                text: `${formatCombatActionClause('你', formation.name, '攻击')}，造成 ${formatCombatDamageBreakdown(baseDamage, appliedDamage, damageKind)} 伤害，削减阵眼灵力 ${formatAuraDamage(auraDamage)}。`,
                combat: buildCombatNoticePayload({ caster: '你', target: formation.name, skill: '攻击', formationResolution: { rawDamage: baseDamage, damage: appliedDamage, damageKind, auraDamage } }),
            }],
        });
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
            throw new NotFoundException(`妖兽不存在：${targetMonsterId}`);
        }
        ensureHostileRelation(resolveCombatRelation(attacker, { kind: 'monster' }));
        if (chebyshevDistance(attacker.x, attacker.y, monster.x, monster.y) > 1) {
            throw new BadRequestException('目标超出攻击距离');
        }
        const resolvedDamage = this.resolveBasicAttackDamageAgainstMonster(attacker, monster, baseDamage, damageKind);
        const effectColor = getDamageTrailColor(damageKind);
        const appliedOutcome = this.applyPlayerBasicAttackOutcome({ ...deps, instance }, attacker, {
            kind: CombatTargetKind.Monster,
            id: targetMonsterId,
        }, {
            targetType: 'monster',
            targetMonsterId,
            targetX: monster.x,
            targetY: monster.y,
            damageKind,
            damage: resolvedDamage.damage,
            rawDamage: resolvedDamage.rawDamage,
            dodged: resolvedDamage.dodged === true,
            crit: resolvedDamage.crit === true,
            resolved: resolvedDamage.resolved === true,
            broken: resolvedDamage.broken === true,
            applyKillReward: false,
        });
        const outcome = appliedOutcome?.adapterResult;
        if (outcome?.defeated) {
            await deps.handlePlayerMonsterKill(instance, outcome.monster, attacker.playerId);
        }
        emitCombatPresentation({
            deps,
            instanceId: attacker.instanceId,
            actionLabel: { x: attacker.x, y: attacker.y, text: '攻击' },
            attack: { fromX: attacker.x, fromY: attacker.y, toX: monster.x, toY: monster.y, color: effectColor },
            resolutionFloat: { x: monster.x, y: monster.y, resolution: resolvedDamage, fallbackColor: effectColor },
            damageFloat: { x: monster.x, y: monster.y, damage: resolvedDamage.damage, color: effectColor },
            notices: [{
                playerId: attacker.playerId,
                text: `${formatCombatActionClause('你', formatTargetLabelWithHp(monster.name, outcome?.hp ?? monster.hp, monster.maxHp), '攻击')}，${formatCombatResolutionOutcome(resolvedDamage, damageKind)}`,
                combat: buildCombatNoticePayload({ caster: '你', target: monster.name, targetHp: outcome?.hp ?? monster.hp, targetMaxHp: monster.maxHp, skill: '攻击', resolution: buildBasicAttackNoticeResolution(resolvedDamage, damageKind) }),
            }],
        });
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
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        ensureInstanceSupportsPlayerCombat(instance);
        if (instance.isPointInSafeZone(attacker.x, attacker.y)) {
            throw new BadRequestException('安全区内无法对其他玩家造成伤害。');
        }
        const target = this.playerRuntimeService.getPlayer(targetPlayerId);
        if (!target) {
            return;
        }
        if (target.hp <= 0) {
            throw new BadRequestException('目标已死亡');
        }
        if (instance.isPointInSafeZone(target.x, target.y)) {
            throw new BadRequestException('目标处于安全区内，无法对其造成伤害。');
        }
        if (target.instanceId !== attacker.instanceId) {
            throw new BadRequestException('目标不在同一地图');
        }
        ensureHostileRelation(resolveCombatRelation(attacker, {
            kind: 'player',
            target,
        }));
        if (chebyshevDistance(attacker.x, attacker.y, target.x, target.y) > 1) {
            throw new BadRequestException('目标超出攻击距离');
        }
        if (typeof instance.canSeeTileFrom === 'function' && instance.canSeeTileFrom(attacker.x, attacker.y, target.x, target.y, 1) === false) {
            throw new BadRequestException('目标被遮挡');
        }
        const resolvedDamage = this.resolveBasicAttackDamageAgainstPlayer(attacker, target, baseDamage, damageKind);
        const effectColor = getDamageTrailColor(damageKind);
        emitCombatPresentation({
            deps,
            instanceId: attacker.instanceId,
            actionLabel: { x: attacker.x, y: attacker.y, text: '攻击' },
            attack: { fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, color: effectColor },
            damageFloat: { x: target.x, y: target.y, damage: resolvedDamage.damage, color: effectColor },
        });
        const projectedDefeated = Math.max(0, Math.round(Number(target.hp) || 0)) - Math.max(0, Math.round(Number(resolvedDamage.damage) || 0)) <= 0;
        const appliedOutcome = this.applyPlayerBasicAttackOutcome({
            ...deps,
            currentTick,
        }, attacker, {
            kind: CombatTargetKind.Player,
            id: target.playerId,
        }, {
            targetType: 'player',
            targetPlayerId: target.playerId,
            targetX: target.x,
            targetY: target.y,
            damageKind,
            damage: resolvedDamage.damage,
            rawDamage: resolvedDamage.rawDamage,
            dodged: resolvedDamage.dodged === true,
            crit: resolvedDamage.crit === true,
            resolved: resolvedDamage.resolved === true,
            broken: resolvedDamage.broken === true,
            retaliatePlayerTargetId: attacker.playerId,
            recordActivity: false,
            defeated: projectedDefeated,
            applyDefeat: false,
        });
        this.worldRuntimeThreatService.addThreat(
            this.worldRuntimeThreatService.buildPlayerOwnerId(target.playerId),
            this.worldRuntimeThreatService.buildPlayerTargetId(attacker.playerId),
            {
                baseThreat: Math.max(0, Math.round(Number(resolvedDamage.damage) || 0)),
                distance: chebyshevDistance(attacker.x, attacker.y, target.x, target.y),
                extraAggroRate: Number(attacker?.attrs?.numericStats?.extraAggroRate ?? 0) || 0,
                now: currentTick,
            },
        );
        const updated = typeof this.playerRuntimeService.getPlayer === 'function'
            ? (this.playerRuntimeService.getPlayer(target.playerId) ?? target)
            : this.playerRuntimeService.getPlayerOrThrow(target.playerId);
        this.playerRuntimeService.recordActivity(target.playerId, currentTick, {
            interruptCultivation: true,
        });
        if (updated.hp <= 0 && appliedOutcome?.adapterResult?.handledDefeat !== true) {
            await deps.handlePlayerDefeat(updated.playerId, attacker.playerId);
        }
        emitCombatPresentation({
            deps,
            instanceId: attacker.instanceId,
            resolutionFloat: { x: target.x, y: target.y, resolution: resolvedDamage, fallbackColor: effectColor },
            notices: [
                {
                    playerId: attacker.playerId,
                    text: `${formatCombatActionClause('你', formatTargetLabelWithHp(target.name ?? target.playerId, updated.hp, updated.maxHp ?? target.maxHp), '攻击')}，${formatCombatResolutionOutcome(resolvedDamage, damageKind)}`,
                    combat: buildCombatNoticePayload({ caster: '你', target: target.name ?? target.playerId, targetHp: updated.hp, targetMaxHp: updated.maxHp ?? target.maxHp, skill: '攻击', resolution: buildBasicAttackNoticeResolution(resolvedDamage, damageKind) }),
                },
                {
                    playerId: target.playerId,
                    text: `${formatCombatActionClause(attacker.name ?? attacker.playerId, '你', '攻击')}，${formatCombatResolutionOutcome(resolvedDamage, damageKind)}`,
                    combat: buildCombatNoticePayload({ caster: attacker.name ?? attacker.playerId, target: '你', skill: '攻击', resolution: buildBasicAttackNoticeResolution(resolvedDamage, damageKind) }),
                },
            ],
        });
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

    dispatchBasicAttackToTile(attacker, targetX, targetY, damageKind, baseDamage, deps, currentTick = undefined, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const plannedTarget = options?.plannedTarget ?? null;
        const planTargetsBoundary = plannedTarget?.kind === CombatTargetKind.Formation && plannedTarget.source === 'formation_boundary';
        const planTargetsContainer = plannedTarget?.kind === CombatTargetKind.Container;
        const planTargetsTile = plannedTarget?.kind === CombatTargetKind.Tile;
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const boundary = !planTargetsTile && !planTargetsContainer && typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
            ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, targetX, targetY)
            : null;
        if (boundary) {
            ensureHostileRelation(resolveCombatRelation(attacker, { kind: 'terrain' }));
            if (chebyshevDistance(attacker.x, attacker.y, targetX, targetY) > 1) {
                throw new BadRequestException('目标超出攻击距离');
            }
            const effectColor = getDamageTrailColor(damageKind);
            const appliedOutcome = this.applyPlayerBasicAttackOutcome({ ...deps, instance }, attacker, {
                kind: CombatTargetKind.Formation,
                id: boundary.id ?? boundary.formationId,
                x: targetX,
                y: targetY,
            }, {
                targetType: 'formation_boundary',
                targetId: boundary.id ?? boundary.formationId,
                targetX,
                targetY,
                damageKind,
                damage: baseDamage,
                rawDamage: baseDamage,
                formationBoundary: true,
            });
            const adapterResult = appliedOutcome?.adapterResult ?? {};
            const appliedDamage = normalizeAppliedDamage(adapterResult.appliedDamage, baseDamage);
            const auraDamage = Math.max(0, Number(adapterResult.auraDamage) || 0);
            emitCombatPresentation({
                deps,
                instanceId: attacker.instanceId,
                actionLabel: { x: attacker.x, y: attacker.y, text: '攻击' },
                attack: { fromX: attacker.x, fromY: attacker.y, toX: targetX, toY: targetY, color: effectColor },
                damageFloat: { x: targetX, y: targetY, damage: appliedDamage, color: effectColor },
                notices: [{
                    playerId: attacker.playerId,
                    text: `${formatCombatActionClause('你', boundary.name, '攻击')}边界，造成 ${formatCombatDamageBreakdown(baseDamage, appliedDamage, damageKind)} 伤害，削减阵眼灵力 ${formatAuraDamage(auraDamage)}。`,
                    combat: buildCombatNoticePayload({ caster: '你', target: boundary.name, skill: '攻击', formationResolution: { rawDamage: baseDamage, damage: appliedDamage, damageKind, auraDamage } }),
                }],
            });
            return;
        }
        if (planTargetsBoundary) {
            throw new BadRequestException('该目标无法被攻击');
        }
        ensureHostileRelation(resolveCombatRelation(attacker, { kind: 'terrain' }));
        if (chebyshevDistance(attacker.x, attacker.y, targetX, targetY) > 1) {
            throw new BadRequestException('目标超出攻击距离');
        }
        const container = !planTargetsTile && !planTargetsBoundary && typeof instance.getContainerAtTile === 'function' ? instance.getContainerAtTile(targetX, targetY) : null;
        const lootContainerService = deps.worldRuntimeLootContainerService;
        const damageContainerAtTile = typeof lootContainerService?.damageAttackableContainerAtTile === 'function'
            ? lootContainerService.damageAttackableContainerAtTile.bind(lootContainerService)
            : typeof lootContainerService?.damageHerbContainerAtTile === 'function'
                ? lootContainerService.damageHerbContainerAtTile.bind(lootContainerService)
                : null;
        const containerTick = Number.isFinite(Number(instance.tick))
            ? Math.max(0, Math.trunc(Number(instance.tick) || 0))
            : Math.max(0, Math.trunc(Number(currentTick ?? deps.tick) || 0));
        const containerAttackOutcome = (!planTargetsTile && !planTargetsBoundary && (planTargetsContainer || !plannedTarget)) && container && damageContainerAtTile
            ? this.applyPlayerBasicAttackOutcome({
                ...deps,
                instance,
                currentTick: containerTick,
            }, attacker, {
                kind: CombatTargetKind.Container,
                id: container.id,
                x: targetX,
                y: targetY,
                runtime: container,
            }, {
                targetType: 'container',
                targetId: container.id,
                targetX,
                targetY,
                damageKind,
                damage: baseDamage,
                rawDamage: baseDamage,
                container,
                currentTick: containerTick,
            })
            : null;
        const containerAttackResult = containerAttackOutcome?.ok === true ? containerAttackOutcome.adapterResult : null;
        if (containerAttackResult) {
            const effectColor = getDamageTrailColor(damageKind);
            if (containerAttackResult.appliedDamage > 0) {
                const countdown = containerAttackResult.remainingCount <= 0 && containerAttackResult.respawnRemainingTicks !== undefined
                    ? `，药性回生还需 ${Math.max(1, containerAttackResult.respawnRemainingTicks)} 息`
                    : '';
                const noticeText = `你攻击 ${containerAttackResult.title}，打落 1 朵，剩余 ${Math.max(0, containerAttackResult.remainingCount)} 朵${countdown}`;
                const notice = buildStructuredNotice('combat', 'notice.combat.herb-container-hit', noticeText, {
                    vars: { title: containerAttackResult.title, remaining: Math.max(0, containerAttackResult.remainingCount), countdown },
                    pills: [{ key: 'title', style: 'target' }],
                });
                emitCombatPresentation({
                    deps,
                    instanceId: attacker.instanceId,
                    actionLabel: { x: attacker.x, y: attacker.y, text: '攻击' },
                    attack: { fromX: attacker.x, fromY: attacker.y, toX: targetX, toY: targetY, color: effectColor },
                    damageFloat: { x: targetX, y: targetY, damage: containerAttackResult.appliedDamage, color: effectColor },
                    notices: [{
                        playerId: attacker.playerId,
                        text: notice.text,
                        structured: notice.structured,
                    }],
                });
                return;
            }
            const countdown = containerAttackResult.respawnRemainingTicks !== undefined
                ? `还需 ${Math.max(1, containerAttackResult.respawnRemainingTicks)} 息。`
                : '暂时无法再生。';
            const noticeText = `${containerAttackResult.title} 当前没有可打落的草药，${countdown}`;
            const notice = buildStructuredNotice('combat', 'notice.combat.herb-container-empty', noticeText, {
                vars: { title: containerAttackResult.title, countdown },
                pills: [{ key: 'title', style: 'target' }],
            });
            emitCombatPresentation({
                deps,
                instanceId: attacker.instanceId,
                actionLabel: { x: attacker.x, y: attacker.y, text: '攻击' },
                attack: { fromX: attacker.x, fromY: attacker.y, toX: targetX, toY: targetY, color: effectColor },
                notices: [{
                    playerId: attacker.playerId,
                    text: notice.text,
                    structured: notice.structured,
                }],
            });
            return;
        }
        if (planTargetsContainer) {
            throw new BadRequestException('该目标无法被攻击');
        }
        ensureInstanceSupportsTileDamage(instance);
        let tileType: string | undefined;
        let tileMaxHp = 0;
        if (typeof instance.getTileCombatState === 'function') {
            const tileState = instance.getTileCombatState(targetX, targetY);
            if (!tileState || tileState.destroyed === true) {
                throw new BadRequestException('该目标无法被攻击');
            }
            tileType = tileState.tileType;
            tileMaxHp = tileState.maxHp ?? 0;
        }
        const effectiveBaseDamage = resolveMiningAdjustedTileDamage({
            attacker,
            tileType,
            baseDamage,
        }).damage;
        const mitigatedDamage = typeof deps.worldRuntimeFormationService?.mitigateTerrainDamage === 'function'
            ? deps.worldRuntimeFormationService.mitigateTerrainDamage(attacker.instanceId, targetX, targetY, effectiveBaseDamage)
            : effectiveBaseDamage;
        const appliedOutcome = this.applyPlayerBasicAttackOutcome({ ...deps, instance }, attacker, {
            kind: CombatTargetKind.Tile,
            x: targetX,
            y: targetY,
        }, {
            targetType: 'tile',
            targetX,
            targetY,
            damageKind,
            damage: mitigatedDamage,
            rawDamage: effectiveBaseDamage,
            mitigatedDamage: Math.max(0, Math.round(Number(mitigatedDamage) || 0)),
        });
        const result = appliedOutcome?.adapterResult;
        if (!result) {
            throw new BadRequestException('该目标无法被攻击');
        }
        const appliedDamage = Number.isFinite(result.appliedDamage) ? Math.max(0, Math.round(result.appliedDamage)) : 0;
        spawnTileDrops({
            playerId: attacker.playerId,
            tileDrops: result.tileDrops,
            deps,
        });
        const miningExpResult = applyMiningExpForTileDamage({
            attacker,
            tileType,
            appliedDamage,
            playerRuntimeService: this.playerRuntimeService,
        });
        if (miningExpResult.changed) {
            this.playerRuntimeService.markPersistenceDirtyDomains(attacker, ['profession']);
            this.playerRuntimeService.bumpPersistentRevision(attacker);
        }
        const effectColor = getDamageTrailColor(damageKind);
        emitCombatPresentation({
            deps,
            instanceId: attacker.instanceId,
            actionLabel: { x: attacker.x, y: attacker.y, text: '攻击' },
            attack: { fromX: attacker.x, fromY: attacker.y, toX: targetX, toY: targetY, color: effectColor },
            damageFloat: { x: targetX, y: targetY, damage: appliedDamage, color: effectColor },
            notices: [{
                playerId: attacker.playerId,
                text: `${formatCombatActionClause('你', formatTargetLabelWithHp(uiLabels.TILE_TYPE_LABELS[tileType] ?? '地块', result.hp ?? 0, tileMaxHp), '攻击')}，造成 ${formatCombatDamageBreakdown(baseDamage, appliedDamage, damageKind)} 伤害`,
                combat: buildCombatNoticePayload({ caster: '你', target: uiLabels.TILE_TYPE_LABELS[tileType] ?? '地块', targetHp: result.hp ?? 0, targetMaxHp: tileMaxHp, skill: '攻击', resolution: { rawDamage: baseDamage, damage: appliedDamage, damageKind } }),
            }],
        });
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
        const combatExpMultiplier = getBasicAttackCombatExperienceDamageMultiplier(Math.max(1, attacker.combatExp ?? 0), Math.max(1, monsterCombatExp));
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
        const progressionService = this.playerRuntimeService?.playerProgressionService;
        if (typeof progressionService?.getMonsterCombatExpEquivalent === 'function') {
            const resolved = progressionService.getMonsterCombatExpEquivalent(monster);
            if (Number.isFinite(resolved) && resolved > 0) {
                return Math.floor(resolved);
            }
        }
        return resolveMonsterCombatExpEquivalentFallback(monster);
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
        const combatExpMultiplier = getBasicAttackCombatExperienceDamageMultiplier(Math.max(1, attacker.combatExp ?? 0), Math.max(1, target.combatExp ?? 0));
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
        return resolveCombatDamage({
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
            extraMultiplier,
        });
    }
    applyPlayerBasicAttackOutcome(deps, attacker, target, result = {}) {
        if (!this.worldRuntimeCombatActionService?.applyCombatOutcome) {
            return null;
        }
        return this.worldRuntimeCombatActionService.applyCombatOutcome({
            phase: CombatActionPhase.Instant,
            actor: {
                kind: CombatActorKind.Player,
                id: attacker.playerId,
            },
            actionId: CombatActionKind.BasicAttack,
            instanceId: attacker.instanceId,
            target,
            result: {
                actionKind: 'basic_attack',
                attackerPlayerId: attacker.playerId,
                ...result,
            },
            deps: {
                ...deps,
                playerRuntimeService: this.playerRuntimeService,
            },
            adapters: createCombatOutcomeApplyAdapters({
                handleMonsterDefeat: () => ({ deferred: true }),
            }),
            mergeAdapterResultToOutcome: true,
            record: true,
        });
    }
    recordPlayerBasicAttackOutcome(deps, attacker, target, result = {}) {
        if (this.worldRuntimeCombatActionService?.recordOutcome) {
            return this.worldRuntimeCombatActionService.recordOutcome(deps, {
                phase: CombatActionPhase.Instant,
                actor: {
                    kind: CombatActorKind.Player,
                    id: attacker.playerId,
                },
                actionId: CombatActionKind.BasicAttack,
                instanceId: attacker.instanceId,
                target,
                result: {
                    actionKind: 'basic_attack',
                    attackerPlayerId: attacker.playerId,
                    ...result,
                },
            });
        }
        if (Array.isArray(deps?.combatOutcomes)) {
            deps.combatOutcomes.push({
                ok: true,
                actionId: CombatActionKind.BasicAttack,
                instanceId: attacker.instanceId,
                target,
                result,
            });
        }
        return null;
    }
};
