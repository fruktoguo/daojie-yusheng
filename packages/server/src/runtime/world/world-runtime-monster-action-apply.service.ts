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
exports.WorldRuntimeMonsterActionApplyService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const player_combat_service_1 = require("../combat/player-combat.service");
const combat_resolution_helpers_1 = require("../combat/combat-resolution.helpers");
const combat_outcome_apply_adapters_1 = require("../combat/combat-outcome-apply-adapters");
const monster_combat_exp_equivalent_helper_1 = require("../combat/monster-combat-exp-equivalent.helper");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_combat_effects_service_1 = require("./world-runtime-combat-effects.service");
const world_runtime_combat_action_service_1 = require("./world-runtime-combat-action.service");
const combat_action_types_1 = require("./combat-action.types");
const combat_presentation_helpers_1 = require("./world-runtime-combat-presentation.helpers");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");
const { getSkillEffectColor, resolveRuntimeSkillRange } = world_runtime_normalization_helpers_1;
const world_runtime_observation_helpers_1 = require("./world-runtime.observation.helpers");
const {
    formatCombatActionClause,
    formatCombatResolutionOutcome,
} = world_runtime_observation_helpers_1;
function resolvePrimaryDamageRoll(result, fallbackDamageKind, fallbackElement) {
    const firstRoll = Array.isArray(result?.damageRolls)
        ? result.damageRolls.find((entry) => entry && typeof entry === 'object')
        : null;
    if (firstRoll) {
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
function projectDamageDefeated(target, damage) {
    return Math.max(0, Math.round(Number(target?.hp) || 0)) - Math.max(0, Math.round(Number(damage) || 0)) <= 0;
}

/** 妖兽动作落地服务：承接 monster action apply 与 monster skill apply。 */
let WorldRuntimeMonsterActionApplyService = class WorldRuntimeMonsterActionApplyService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * playerCombatService：玩家战斗服务引用。
 */

    playerCombatService;    
    /**
 * worldRuntimeCombatEffectsService：世界运行态战斗Effect服务引用。
 */

    worldRuntimeCombatEffectsService;    
    /**
 * worldRuntimeCombatActionService：统一战斗动作诊断服务引用。
 */

    worldRuntimeCombatActionService;
    /**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(WorldRuntimeMonsterActionApplyService.name);    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param playerCombatService 参数说明。
 * @param worldRuntimeCombatEffectsService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService, playerCombatService, worldRuntimeCombatEffectsService, worldRuntimeCombatActionService) {
        this.playerRuntimeService = playerRuntimeService;
        this.playerCombatService = playerCombatService;
        this.worldRuntimeCombatEffectsService = worldRuntimeCombatEffectsService;
        this.worldRuntimeCombatActionService = worldRuntimeCombatActionService;
    }    
    /**
 * applyMonsterAction：处理怪物Action并更新相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新怪物Action相关状态。
 */

    applyMonsterAction(action, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (action.kind === 'skill_chant') {
            this.applyMonsterSkillChant(action, deps);
            return;
        }
        if (action.kind === 'skill') {
            this.applyMonsterSkill(action, deps);
            return;
        }
        if (action.kind === 'skill_cancel') {
            this.applyMonsterSkillCancel(action, deps);
            return;
        }
        this.applyMonsterBasicAttack(action, deps);
    }    
    applyMonsterSkillCancel(action, deps) {
        const reason = resolveMonsterSkillCancelRejectReason(action?.cancelReason);
        this.recordMonsterActionReject(deps, action, reason, {
            cancelReason: action?.cancelReason ?? null,
            cancelMessage: action?.cancelMessage ?? null,
            cancelledTick: action?.cancelledTick ?? null,
            targetX: action?.targetX ?? null,
            targetY: action?.targetY ?? null,
            warningCellCount: Array.isArray(action?.warningCells) ? action.warningCells.length : 0,
        }, { severity: 'info', log: false });
    }

    applyMonsterSkillChant(action, deps) {
        const instance = deps.getInstanceRuntime(action.instanceId);
        const monster = instance?.getMonster?.(action.runtimeId) ?? null;
        const skill = monster?.skills?.find((entry) => entry.id === action.skillId) ?? null;
        const actionPlan = this.resolveMonsterSkillChantStartPlan(instance, action, skill, monster);
        if (!actionPlan.ok) {
            this.recordMonsterActionReject(deps, action, actionPlan.reason, actionPlan.details ?? {}, { severity: actionPlan.severity ?? 'warn' });
            return;
        }
        const durationMs = actionPlan.durationMs;
        const warningCells = actionPlan.warningCells;
        (0, combat_presentation_helpers_1.emitCombatPresentation)({
            deps,
            effectsService: this.worldRuntimeCombatEffectsService,
            instanceId: action.instanceId,
            actionLabel: {
                x: monster.x,
                y: monster.y,
                text: skill.name,
                options: {
                    actionStyle: 'chant',
                    durationMs: durationMs + 240,
                },
            },
            combatEffects: warningCells.length > 0 ? [{
                type: 'warning_zone',
                cells: warningCells,
                color: actionPlan.warningColor,
                baseColor: '#ff8a8a',
                originX: Number.isFinite(action.warningOriginX) ? action.warningOriginX : undefined,
                originY: Number.isFinite(action.warningOriginY) ? action.warningOriginY : undefined,
                durationMs,
            }] : [],
        });
    }
    /**
 * applyMonsterBasicAttack：处理怪物BasicAttack并更新相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新怪物BasicAttack相关状态。
 */

    applyMonsterBasicAttack(action, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const targetResolution = this.resolveMonsterBasicAttackPlayerTarget(deps, action);
        if (!targetResolution.ok) {
            this.recordMonsterActionReject(deps, action, targetResolution.reason, targetResolution.details, { severity: targetResolution.severity });
            return;
        }
        const instance = targetResolution.instance;
        const monster = targetResolution.monster;
        const player = targetResolution.player;
        const runtimeTargetPosition = targetResolution.position;
        const damageKind = monster.numericStats.spellAtk > monster.numericStats.physAtk ? 'spell' : 'physical';
        const baseDamage = Math.max(1, Math.round(damageKind === 'spell'
            ? monster.numericStats.spellAtk
            : monster.numericStats.physAtk));
        const resolvedDamage = (0, combat_resolution_helpers_1.resolveCombatHitForAction)({
            actor: monster,
            target: player,
            attackerStats: monster.numericStats,
            attackerRatios: monster.ratioDivisors,
            attackerRealmLv: Math.max(1, Math.floor(monster.level ?? 1)),
            attackerCombatExp: resolveMonsterCombatExpEquivalent(monster, this.playerRuntimeService),
            targetStats: player.attrs.numericStats,
            targetRatios: player.attrs.ratioDivisors,
            targetRealmLv: Math.max(1, Math.floor(player.realm?.realmLv ?? 1)),
            targetCombatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
            baseDamage,
            damageKind,
            damageMultiplier: 1,
        });
        const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
        const currentTick = deps.resolveCurrentTickForPlayerId(action.targetPlayerId);
        let updated = player;
        this.applyMonsterCombatOutcome({
            ...deps,
            currentTick,
        }, action, {
            kind: combat_action_types_1.CombatTargetKind.Player,
            id: action.targetPlayerId,
        }, {
            targetPlayerId: action.targetPlayerId,
            targetX: runtimeTargetPosition.x,
            targetY: runtimeTargetPosition.y,
            damageKind,
            damage: resolvedDamage.damage,
            rawDamage: resolvedDamage.rawDamage,
            dodged: resolvedDamage.dodged === true,
            crit: resolvedDamage.crit === true,
            resolved: resolvedDamage.resolved === true,
            broken: resolvedDamage.broken === true,
            autoRetaliate: resolvedDamage.damage > 0,
            defeated: projectDamageDefeated(player, resolvedDamage.damage),
            applyDefeat: false,
        });
        (0, combat_presentation_helpers_1.emitCombatPresentation)({
            deps,
            effectsService: this.worldRuntimeCombatEffectsService,
            instanceId: action.instanceId,
            actionLabel: { x: monster.x, y: monster.y, text: '攻击' },
            attack: { fromX: monster.x, fromY: monster.y, toX: runtimeTargetPosition.x, toY: runtimeTargetPosition.y, color: effectColor },
            resolutionFloat: { x: runtimeTargetPosition.x, y: runtimeTargetPosition.y, resolution: resolvedDamage, fallbackColor: effectColor },
            damageFloat: { x: runtimeTargetPosition.x, y: runtimeTargetPosition.y, damage: resolvedDamage.damage, color: effectColor },
            notices: [{
                playerId: action.targetPlayerId,
                text: `${formatCombatActionClause(monster.name ?? monster.monsterId ?? action.runtimeId, '你', '攻击')}，${formatCombatResolutionOutcome(resolvedDamage, damageKind)}`,
            }],
        });
        updated = this.playerRuntimeService.getPlayer(action.targetPlayerId) ?? player;
        if (updated.hp <= 0) {
            deps.handlePlayerDefeat(updated.playerId);
        }
    }    
    /**
 * applyMonsterSkill：处理怪物技能并更新相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新怪物技能相关状态。
 */

    applyMonsterSkill(action, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntime(action.instanceId);
        const monster = instance?.getMonster?.(action.runtimeId) ?? null;
        const skill = monster?.skills?.find((entry) => entry.id === action.skillId) ?? null;
        const actionPlan = this.resolveMonsterSkillActionPlan(instance, deps, action, skill, monster);
        const effectColor = skill ? getSkillEffectColor(skill) : (0, shared_1.getDamageTrailColor)('spell');
        if (!actionPlan.ok) {
            if (actionPlan.reason === combat_action_types_1.CombatRejectReason.NoRuntimeTargetsInWarningCells
                && (actionPlan.hasAnchoredCast || actionPlan.warningCells?.length > 0)
                && actionPlan.distanceAnchor
                && monster
                && skill) {
                (0, combat_presentation_helpers_1.emitCombatPresentation)({
                    deps,
                    effectsService: this.worldRuntimeCombatEffectsService,
                    instanceId: action.instanceId,
                    actionLabel: { x: monster.x, y: monster.y, text: skill.name },
                    attack: { fromX: monster.x, fromY: monster.y, toX: actionPlan.distanceAnchor.x, toY: actionPlan.distanceAnchor.y, color: effectColor },
                });
            }
            this.recordMonsterActionReject(deps, action, actionPlan.reason, actionPlan.details ?? {}, { severity: actionPlan.severity ?? 'warn' });
            return;
        }
        try {
            const currentTick = instance.tick;
            const targetEntries = actionPlan.targetEntries;
            let labelPushed = false;
            let qiSpent = false;
            let resolvedTargetCount = 0;
            const skippedTargets = [];
            for (let index = 0; index < targetEntries.length; index += 1) {
                const entry = targetEntries[index];
                const applyTarget = this.revalidateMonsterSkillTargetForApply(deps, instance, action, entry, targetEntries.length);
                if (!applyTarget.ok) {
                    const skippedTarget = {
                        reason: applyTarget.reason,
                        ...applyTarget.details,
                    };
                    skippedTargets.push(skippedTarget);
                    this.recordMonsterActionReject(deps, action, applyTarget.reason, {
                        phase: 'monster_skill_target_apply',
                        ...skippedTarget,
                    }, { severity: applyTarget.severity ?? 'debug', log: false });
                    continue;
                }
                const player = applyTarget.player;
                const targetPosition = applyTarget.position;
                resolvedTargetCount += 1;
                const result = this.playerCombatService.castMonsterSkill({
                    runtimeId: monster.runtimeId,
                    monsterId: monster.monsterId,
                    hp: monster.hp,
                    maxHp: monster.maxHp,
                    qi: monster.qi,
                    maxQi: monster.maxQi,
                    level: monster.level,
                    combatExp: resolveMonsterCombatExpEquivalent(monster, this.playerRuntimeService),
                    skills: monster.skills,
                    cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId,
                    attrs: {
                        finalAttrs: monster.attrs,
                        numericStats: monster.numericStats,
                        ratioDivisors: monster.ratioDivisors,
                    },
                    buffs: monster.buffs,
                }, player, action.skillId, currentTick, actionPlan.distance, (buff) => {
                    instance.applyTemporaryBuffToMonster(monster.runtimeId, buff);
                }, (buff) => {
                    this.playerRuntimeService.applyTemporaryBuff(player.playerId, buff);
                }, (amount) => {
                    if (qiSpent) {
                        return;
                    }
                    qiSpent = true;
                    monster.qi = Math.max(0, Math.round((monster.qi ?? 0) - amount));
                    instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
                }, {
                    skipResourceAndCooldown: index > 0,
                    skipTargetDamageApplication: true,
                    targetCount: Math.max(1, targetEntries.length),
                });
                if (skill && !labelPushed) {
                    (0, combat_presentation_helpers_1.emitCombatPresentation)({
                        deps,
                        effectsService: this.worldRuntimeCombatEffectsService,
                        instanceId: action.instanceId,
                        actionLabel: {
                            x: monster.x,
                            y: monster.y,
                            text: skill.name,
                        },
                    });
                    labelPushed = true;
                }
                if (skill.requiresTarget === false) {
                    continue;
                }
                const primaryRoll = resolvePrimaryDamageRoll(result, result.damageKind ?? 'spell', result.damageElement);
                this.applyMonsterCombatOutcome({
                    ...deps,
                    currentTick,
                }, action, {
                    kind: combat_action_types_1.CombatTargetKind.Player,
                    id: player.playerId,
                }, {
                    targetPlayerId: player.playerId,
                    targetX: targetPosition.x,
                    targetY: targetPosition.y,
                    targetSource: entry.source,
                    targetCount: Math.max(1, targetEntries.length),
                    damageKind: primaryRoll.damageKind ?? result.damageKind ?? 'spell',
                    element: primaryRoll.element ?? result.damageElement,
                    damage: Math.max(0, Math.round(Number(result.totalDamage) || 0)),
                    rawDamage: primaryRoll.rawDamage,
                    dodged: primaryRoll.dodged === true,
                    crit: primaryRoll.crit === true,
                    resolved: primaryRoll.resolved === true,
                    broken: primaryRoll.broken === true,
                    autoRetaliate: result.totalDamage > 0,
                    defeated: projectDamageDefeated(player, result.totalDamage),
                    applyDefeat: false,
                });
                (0, combat_presentation_helpers_1.emitCombatPresentation)({
                    deps,
                    effectsService: this.worldRuntimeCombatEffectsService,
                    instanceId: action.instanceId,
                    attack: { fromX: monster.x, fromY: monster.y, toX: targetPosition.x, toY: targetPosition.y, color: effectColor },
                    resolutionFloat: { x: targetPosition.x, y: targetPosition.y, resolution: primaryRoll, fallbackColor: effectColor },
                    damageFloat: { x: targetPosition.x, y: targetPosition.y, damage: result.totalDamage, color: effectColor },
                    notices: [{
                        playerId: player.playerId,
                        text: `${formatCombatActionClause(monster.name ?? monster.monsterId ?? action.runtimeId, '你', skill?.name ?? action.skillId)}，${formatCombatResolutionOutcome(primaryRoll, primaryRoll.damageKind ?? result.damageKind ?? 'spell', primaryRoll.element ?? result.damageElement)}`,
                    }],
                });
                const updatedPlayer = this.playerRuntimeService.getPlayer(player.playerId);
                if (updatedPlayer && updatedPlayer.hp <= 0) {
                    deps.handlePlayerDefeat(updatedPlayer.playerId);
                }
            }
            if (skill.requiresTarget !== false && resolvedTargetCount === 0) {
                this.recordMonsterActionReject(deps, action, combat_action_types_1.CombatRejectReason.MissingTargetRuntimeState, {
                    selectedTargetCount: actionPlan.selectedTargets.length,
                    rejectedTargets: actionPlan.targetCollection.rejected,
                    skippedTargets,
                }, { severity: 'warn' });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.recordMonsterActionReject(deps, action, combat_action_types_1.CombatRejectReason.CastFailed, {
                error: message,
            }, { severity: 'warn' });
            (deps.logger ?? this.logger).warn(`处理妖兽技能 ${action.skillId}（来源 ${action.runtimeId}）失败：${message}`);
        }
    }

    recordMonsterActionReject(deps, action, reason, details = {}, options = undefined) {
        if (this.worldRuntimeCombatActionService?.recordMonsterActionReject) {
            return this.worldRuntimeCombatActionService.recordMonsterActionReject(deps, action, reason, details, options);
        }
        const logger = deps?.logger ?? this.logger;
        logger.warn?.(`combat_action_rejected reason=${reason} action=${action?.skillId ?? action?.kind ?? 'unknown'} instance=${action?.instanceId ?? 'unknown'} runtime=${action?.runtimeId ?? 'unknown'}`);
        return null;
    }
    recordMonsterActionOutcome(deps, action, target, result = {}, options = undefined) {
        if (this.worldRuntimeCombatActionService?.recordMonsterActionOutcome) {
            return this.worldRuntimeCombatActionService.recordMonsterActionOutcome(deps, action, target, result, options);
        }
        if (Array.isArray(deps?.combatOutcomes)) {
            deps.combatOutcomes.push({
                ok: true,
                actionId: action?.skillId ?? action?.kind ?? 'unknown',
                instanceId: action?.instanceId,
                target,
                result,
            });
        }
        return null;
    }
    resolveMonsterBasicAttackPlayerTarget(deps, action) {
        if (this.worldRuntimeCombatActionService?.resolveMonsterBasicAttackPlayerTarget) {
            return this.worldRuntimeCombatActionService.resolveMonsterBasicAttackPlayerTarget({
                deps,
                action,
                playerRuntimeService: this.playerRuntimeService,
            });
        }
        return {
            ok: false,
            reason: combat_action_types_1.CombatRejectReason.Unknown,
            details: {},
            severity: 'warn',
        };
    }
    collectMonsterSkillPlayerTargets(instance, deps, action, skill, fallbackPosition) {
        if (this.worldRuntimeCombatActionService?.collectMonsterSkillPlayerTargets) {
            return this.worldRuntimeCombatActionService.collectMonsterSkillPlayerTargets({
                instance,
                deps,
                action,
                skill,
                fallbackPosition,
                playerRuntimeService: this.playerRuntimeService,
            });
        }
        return {
            targets: collectMonsterSkillRuntimeTargets(instance, this.playerRuntimeService, deps, action, fallbackPosition, action.warningCells, skill),
            warningCells: Array.isArray(action.warningCells) ? action.warningCells : [],
            rejected: [],
        };
    }
    resolveMonsterSkillActionPlan(instance, deps, action, skill, monster) {
        if (this.worldRuntimeCombatActionService?.resolveMonsterSkillActionPlan) {
            return this.worldRuntimeCombatActionService.resolveMonsterSkillActionPlan({
                instance,
                deps,
                action,
                skill,
                monster,
                playerRuntimeService: this.playerRuntimeService,
            });
        }
        return {
            ok: false,
            reason: combat_action_types_1.CombatRejectReason.Unknown,
            severity: 'warn',
            details: {},
            warningCells: Array.isArray(action?.warningCells) ? action.warningCells : [],
            targetCollection: { targets: [], rejected: [] },
            selectedTargets: [],
            targetEntries: [],
        };
    }
    resolveMonsterSkillChantStartPlan(instance, action, skill, monster) {
        if (this.worldRuntimeCombatActionService?.resolveMonsterSkillChantStartPlan) {
            return this.worldRuntimeCombatActionService.resolveMonsterSkillChantStartPlan({
                instance,
                action,
                skill,
                monster,
            });
        }
        return {
            ok: false,
            reason: combat_action_types_1.CombatRejectReason.Unknown,
            severity: 'warn',
            details: {},
            warningCells: Array.isArray(action?.warningCells) ? action.warningCells : [],
        };
    }
    revalidateMonsterSkillTargetForApply(deps, instance, action, entry, targetCount) {
        if (this.worldRuntimeCombatActionService?.revalidateMonsterSkillTargetForApply) {
            return this.worldRuntimeCombatActionService.revalidateMonsterSkillTargetForApply({
                deps,
                instance,
                action,
                entry,
                targetCount,
            });
        }
        return {
            ok: false,
            reason: combat_action_types_1.CombatRejectReason.Unknown,
            severity: 'warn',
            details: {
                targetPlayerId: entry?.player?.playerId ?? entry?.playerId,
                source: entry?.source,
                targetCount,
            },
        };
    }
    applyMonsterCombatOutcome(deps, action, target, result = {}) {
        if (!this.worldRuntimeCombatActionService?.applyCombatOutcome) {
            return null;
        }
        const phase = action?.kind === 'skill'
            ? combat_action_types_1.CombatActionPhase.ChantResolve
            : action?.kind === 'skill_chant'
                ? combat_action_types_1.CombatActionPhase.ChantStart
                : combat_action_types_1.CombatActionPhase.Instant;
        return this.worldRuntimeCombatActionService.applyCombatOutcome({
            phase,
            actor: {
                kind: combat_action_types_1.CombatActorKind.Monster,
                id: action?.runtimeId ?? null,
            },
            actionId: action?.skillId ?? (action?.kind === 'skill' ? null : combat_action_types_1.CombatActionKind.BasicAttack),
            instanceId: action?.instanceId ?? null,
            target,
            result: {
                actionKind: action?.kind ?? 'basic',
                runtimeId: action?.runtimeId,
                skillId: action?.skillId,
                ...result,
            },
            deps: {
                ...deps,
                playerRuntimeService: this.playerRuntimeService,
            },
            adapters: (0, combat_outcome_apply_adapters_1.createCombatOutcomeApplyAdapters)(),
            mergeAdapterResultToOutcome: true,
            record: true,
        });
    }
};
exports.WorldRuntimeMonsterActionApplyService = WorldRuntimeMonsterActionApplyService;
exports.WorldRuntimeMonsterActionApplyService = WorldRuntimeMonsterActionApplyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        player_combat_service_1.PlayerCombatService,
        world_runtime_combat_effects_service_1.WorldRuntimeCombatEffectsService,
        world_runtime_combat_action_service_1.WorldRuntimeCombatActionService])
], WorldRuntimeMonsterActionApplyService);

export { WorldRuntimeMonsterActionApplyService };

function collectMonsterSkillRuntimeTargets(instance, playerRuntimeService, deps, action, fallbackPosition, warningCells, skill) {
    const maxTargets = resolveMonsterSkillMaxTargets(skill);
    const entries = [];
    const seenPlayerIds = new Set();
    const pushPlayerAtPosition = (playerId, position) => {
        if (!playerId || seenPlayerIds.has(playerId) || entries.length >= maxTargets) {
            return;
        }
        const player = playerRuntimeService.getPlayer(playerId);
        if (!player || player.hp <= 0 || !isPlayerLocatedInActionInstance(deps, instance, playerId, action.instanceId)) {
            return;
        }
        seenPlayerIds.add(playerId);
        entries.push({
            player,
            position: {
                x: Math.trunc(Number(position.x)),
                y: Math.trunc(Number(position.y)),
            },
        });
    };
    if (Array.isArray(warningCells) && warningCells.length > 0) {
        if (typeof instance.getPlayersAtTile === 'function') {
            for (const cell of warningCells) {
                if (entries.length >= maxTargets) {
                    break;
                }
                for (const tilePlayer of instance.getPlayersAtTile(cell.x, cell.y) ?? []) {
                    pushPlayerAtPosition(tilePlayer.playerId, { x: cell.x, y: cell.y });
                    if (entries.length >= maxTargets) {
                        break;
                    }
                }
            }
        }
        else if (warningCells.some((cell) => cell.x === fallbackPosition.x && cell.y === fallbackPosition.y)) {
            pushPlayerAtPosition(action.targetPlayerId, fallbackPosition);
        }
        return entries;
    }
    pushPlayerAtPosition(action.targetPlayerId, fallbackPosition);
    return entries;
}
function isPlayerLocatedInActionInstance(deps, instance, playerId, instanceId) {
    if (typeof instance?.getPlayerPosition === 'function' && instance.getPlayerPosition(playerId)) {
        return true;
    }
    const location = typeof deps?.getPlayerLocation === 'function'
        ? deps.getPlayerLocation(playerId)
        : null;
    return Boolean(location && location.instanceId === instanceId);
}
function resolveMonsterSkillMaxTargets(skill) {
    const configured = Number(skill?.targeting?.maxTargets);
    if (Number.isFinite(configured) && configured > 0) {
        return Math.max(1, Math.floor(configured));
    }
    const shape = skill?.targeting?.shape ?? 'single';
    if (shape === 'single') {
        return 1;
    }
    const geometry = {
        range: resolveRuntimeSkillRange(skill),
        shape,
        radius: skill?.targeting?.radius,
        innerRadius: skill?.targeting?.innerRadius,
        width: skill?.targeting?.width,
        height: skill?.targeting?.height,
        checkerParity: skill?.targeting?.checkerParity,
    };
    const width = Math.max(1, Math.round(Number(geometry.width) || 1));
    const height = Math.max(1, Math.round(Number(geometry.height) || 1));
    const radius = Math.max(1, Math.round(Number(geometry.radius) || geometry.range || 1));
    if (shape === 'box' || shape === 'checkerboard') {
        return width * height;
    }
    if (shape === 'line') {
        return Math.max(1, geometry.range) * width;
    }
    return Math.max(1, (radius * 2 + 1) * (radius * 2 + 1));
}

function resolveMonsterSkillCancelRejectReason(reason) {
    if (reason === 'actor_dead') return combat_action_types_1.CombatRejectReason.ActorDead;
    if (reason === 'expired') return combat_action_types_1.CombatRejectReason.PendingCastExpired;
    if (reason === 'config_revision_mismatch') return combat_action_types_1.CombatRejectReason.PendingCastConfigRevisionMismatch;
    return combat_action_types_1.CombatRejectReason.PendingCastCancelled;
}

function resolveMonsterCombatExpEquivalent(monster, playerRuntimeService) {
    const progressionService = playerRuntimeService?.playerProgressionService;
    if (typeof progressionService?.getMonsterCombatExpEquivalent === 'function') {
        const resolved = progressionService.getMonsterCombatExpEquivalent(monster);
        if (Number.isFinite(resolved) && resolved > 0) {
            return Math.floor(resolved);
        }
    }
    return (0, monster_combat_exp_equivalent_helper_1.resolveMonsterCombatExpEquivalentFallback)(monster);
}
