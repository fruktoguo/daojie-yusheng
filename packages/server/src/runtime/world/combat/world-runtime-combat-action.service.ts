/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  assertCombatAoiResultEventBudget,
  computeAffectedCellsFromAnchor,
  normalizeCombatProtocolResult,
  resolvePlayerFacingContentName,
  resolveTargetingGeometryMaxTargets,
  resolveSkillRequiresTarget,
} from '@mud/shared';
import {
  CombatActionKind,
  CombatActionPhase,
  CombatActionSource,
  CombatActorKind,
  CombatEffectKind,
  CombatRejectReason,
  CombatTargetKind,
  createCombatAction,
  createCombatActionDefinition,
  createCombatRejectOutcome,
  createCombatSuccessOutcome,
} from './combat-action.types';
import {
  buildCombatTargetKey,
  buildCombatTileKey,
  combatChebyshevDistance,
  elapsedMs,
  findSkillDefinition,
  hasBuffResultSignal,
  hasDamageResultSignal,
  heapDeltaSince,
  heapUsedBytes,
  indexLiveMonstersByTile,
  indexRuntimeFormationsByTile,
  isCombatSelfOnlySkill,
  isPlayerLocatedInCombatActionInstance,
  isPlayerSelfOnlySkill,
  normalizeCombatCell,
  normalizeCombatCells,
  normalizeCombatResolvedEffect,
  normalizeCooldownTicks,
  normalizeSkillCost,
  normalizeSkillGeometry,
  normalizeWindupTicks,
  nowMs,
  resolveCombatApplyAdapter,
  resolveCombatAuditEventAction,
  resolveCombatOutcomeResult,
  resolveMonsterCombatActionKind,
  resolveMonsterSkillMaxTargets,
  resolveOutcomeTargetCount,
  resolvePlayerCommandTarget,
  resolveSkillAllowedTargetKinds,
  resolveSkillMaxTargets,
  uniqueStrings,
} from './world-runtime-combat-action.helpers';
import {
  recordBoundedCombatRing,
  listBoundedCombatRing,
} from '../../combat/combat-runtime-event-ring.helpers';
import {
  aggregateCombatDiagnostics,
  buildCombatAuditHeatmap,
  queryMonsterSkillFailureReasons,
  queryRecentCombatAuditEvents,
} from '../../combat/combat-event-query';

import * as combat_action_targets from './combat-action.targets';
import * as combat_action_monster_plans from './combat-action.monster-plans';
import * as combat_action_audit from './combat-action.audit';
import { beginCombatOutcomePerf, recordCombatOutcomePerf } from './combat-action.audit';

const {
  collectCombatTargetsImpl,
  collectCombatTargetsFromCellsImpl,
  resolvePlayerBasicAttackTargetImpl,
  resolveSingleCombatTargetImpl,
  validateCombatTargetsImpl,
  validateSingleCombatTargetImpl,
  collectMonsterSkillPlayerTargetsImpl,
  resolveMonsterBasicAttackPlayerTargetImpl,
} = combat_action_targets;

const {
  resolveMonsterSkillActionPlanImpl,
  resolveMonsterSkillChantStartPlanImpl,
  revalidateMonsterSkillTargetForApplyImpl,
  explainMonsterBasicAttackImpl,
  recordMonsterActionRejectImpl,
  recordMonsterActionOutcomeImpl,
} = combat_action_monster_plans;

const {
  recordRejectImpl,
  recordOutcomeImpl,
  recordCombatEventsImpl,
  recordInternalCombatEventsImpl,
  enqueueCombatAuditEventImpl,
  listCombatEventsImpl,
  queryRecentCombatAuditEventsImpl,
  aggregateCombatDiagnosticsImpl,
  queryMonsterSkillFailureReasonsImpl,
  buildCombatAuditHeatmapImpl,
  buildCombatAuditEventImpl,
  buildCombatDiagnosticEventImpl,
} = combat_action_audit;


type AnyRecord = Record<string, any>;

/** 统一战斗主链路骨架：先承接动作规范化、结构化拒绝原因和诊断输出。 */
@Injectable()
export class WorldRuntimeCombatActionService {
  readonly logger = new Logger(WorldRuntimeCombatActionService.name);
  readonly combatEvents = [];

  constructor() {}

  createMonsterAction(action, phase: any = CombatActionPhase.Instant) {
    const kind = resolveMonsterCombatActionKind(action);
    return createCombatAction({
      actor: {
        kind: CombatActorKind.Monster,
        id: action?.runtimeId ?? null,
      },
      actionId: action?.skillId ?? (kind === CombatActionKind.BasicAttack ? CombatActionKind.BasicAttack : null),
      kind,
      source: CombatActionSource.MonsterAi,
      phase,
      instanceId: action?.instanceId ?? null,
      target: action?.targetPlayerId
        ? {
          kind: CombatTargetKind.Player,
          id: action.targetPlayerId,
        }
        : null,
      anchor: Number.isFinite(Number(action?.targetX)) && Number.isFinite(Number(action?.targetY))
        ? { x: Math.trunc(Number(action.targetX)), y: Math.trunc(Number(action.targetY)) }
        : null,
      warningCells: action?.warningCells,
      raw: action,
    });
  }

  createPlayerBasicAttackAction(input: AnyRecord = {}) {
    const normalizedTarget = input.target ?? resolvePlayerCommandTarget(input);
    return createCombatAction({
      actor: {
        kind: CombatActorKind.Player,
        id: input.playerId ?? null,
      },
      actionId: CombatActionKind.BasicAttack,
      kind: CombatActionKind.BasicAttack,
      source: input.source ?? CombatActionSource.PlayerInput,
      phase: CombatActionPhase.Instant,
      instanceId: input.instanceId ?? null,
      target: normalizedTarget,
      anchor: Number.isFinite(Number(input.targetX)) && Number.isFinite(Number(input.targetY))
        ? { x: Math.trunc(Number(input.targetX)), y: Math.trunc(Number(input.targetY)) }
        : normalizeCombatCell(normalizedTarget),
      raw: input,
    });
  }

  createPlayerSkillAction(input: AnyRecord = {}) {
    return createCombatAction({
      actor: {
        kind: CombatActorKind.Player,
        id: input.playerId ?? null,
      },
      actionId: input.skillId ?? null,
      kind: CombatActionKind.Skill,
      source: input.source ?? CombatActionSource.PlayerInput,
      phase: input.phase ?? CombatActionPhase.Instant,
      instanceId: input.instanceId ?? null,
      target: resolvePlayerCommandTarget(input),
      anchor: Number.isFinite(Number(input.targetX)) && Number.isFinite(Number(input.targetY))
        ? { x: Math.trunc(Number(input.targetX)), y: Math.trunc(Number(input.targetY)) }
        : input.anchor ?? null,
      raw: input,
    });
  }

  async dispatchPlayerBasicAttack(input, deps, execute) {
    const combatAction = this.createPlayerBasicAttackAction(input);
    try {
      const result = await execute(combatAction);
      return result;
    }
    catch (error) {
      this.recordReject(deps, {
        phase: combatAction.phase,
        reason: CombatRejectReason.CastFailed,
        actor: combatAction.actor,
        actionId: combatAction.actionId,
        instanceId: combatAction.instanceId,
        target: combatAction.target,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      }, { severity: 'debug' });
      throw error;
    }
  }

  async dispatchPlayerSkill(input, deps, execute) {
    const combatAction = this.createPlayerSkillAction(input);
    try {
      const result = await execute(combatAction);
      return result;
    }
    catch (error) {
      this.recordReject(deps, {
        phase: combatAction.phase,
        reason: CombatRejectReason.CastFailed,
        actor: combatAction.actor,
        actionId: combatAction.actionId,
        instanceId: combatAction.instanceId,
        target: combatAction.target,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      }, { severity: 'debug' });
      throw error;
    }
  }

  async dispatchPlayerEngageBattle(input, deps, execute) {
    const combatAction = this.createPlayerBasicAttackAction({
      playerId: input.playerId,
      targetPlayerId: input.targetPlayerId,
      targetMonsterId: input.targetMonsterId,
      targetX: input.targetX,
      targetY: input.targetY,
    });
    try {
      return await execute(combatAction);
    } catch (error) {
      this.recordReject(deps, {
        phase: combatAction.phase,
        reason: CombatRejectReason.CastFailed,
        actor: combatAction.actor,
        actionId: combatAction.actionId,
        instanceId: combatAction.instanceId,
        target: combatAction.target,
        details: { error: error instanceof Error ? error.message : String(error), engage: true },
      }, { severity: 'debug' });
      throw error;
    }
  }

  async dispatchPlayerSkillToMonster(input, deps, execute) {
    const combatAction = this.createPlayerSkillAction({
      playerId: input.attacker?.playerId ?? input.playerId,
      skillId: input.skillId,
      targetMonsterId: input.targetMonsterId,
    });
    try {
      return await execute(combatAction);
    } catch (error) {
      this.recordReject(deps, {
        phase: combatAction.phase,
        reason: CombatRejectReason.CastFailed,
        actor: combatAction.actor,
        actionId: combatAction.actionId,
        instanceId: combatAction.instanceId,
        target: combatAction.target,
        details: { error: error instanceof Error ? error.message : String(error) },
      }, { severity: 'debug' });
      throw error;
    }
  }

  async dispatchPlayerSkillToTile(input, deps, execute) {
    const combatAction = this.createPlayerSkillAction({
      playerId: input.attacker?.playerId ?? input.playerId,
      skillId: input.skillId,
      targetX: input.targetX,
      targetY: input.targetY,
    });
    try {
      return await execute(combatAction);
    } catch (error) {
      this.recordReject(deps, {
        phase: combatAction.phase,
        reason: CombatRejectReason.CastFailed,
        actor: combatAction.actor,
        actionId: combatAction.actionId,
        instanceId: combatAction.instanceId,
        target: combatAction.target,
        details: { error: error instanceof Error ? error.message : String(error) },
      }, { severity: 'debug' });
      throw error;
    }
  }

  createReject(input: AnyRecord = {}) {
    return createCombatRejectOutcome(input);
  }

  createSuccess(input: AnyRecord = {}) {
    return createCombatSuccessOutcome(input);
  }

  resolveActionDefinition(input: AnyRecord = {}): AnyRecord {
    const action = input.action ?? null;
    if (!action?.actionId) {
      return {
        ok: false,
        reason: action?.kind === CombatActionKind.Skill ? CombatRejectReason.MissingSkillId : CombatRejectReason.MissingActionId,
        action,
        definition: null,
        details: {},
      };
    }
    if (action.kind === CombatActionKind.BasicAttack) {
      return {
        ok: true,
        action,
        definition: this.createBasicAttackDefinition(action, input),
      };
    }
    const skill = input.skill ?? findSkillDefinition(input.actor ?? input.monster ?? input.player, action.actionId);
    if (!skill) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingSkill,
        action,
        definition: null,
        details: {
          actionId: action.actionId,
          actorId: action.actor?.id,
        },
      };
    }
    return {
      ok: true,
      action,
      definition: this.createSkillDefinition(action, skill, input),
    };
  }

  createBasicAttackDefinition(action, input: AnyRecord = {}) {
    const actor = input.actor ?? input.monster ?? input.player ?? {};
    const actorKind = action?.actor?.kind ?? input.actorKind ?? null;
    const range = Number.isFinite(Number(input.range))
      ? Number(input.range)
      : Number.isFinite(Number(actor.attackRange))
        ? Number(actor.attackRange)
        : 1;
    const effects = input.effects ?? [{
      type: CombatEffectKind.Damage,
      damageKind: input.damageKind ?? (actorKind === CombatActorKind.Monster ? 'physical' : 'basic'),
    }];
    return createCombatActionDefinition({
      actionId: CombatActionKind.BasicAttack,
      kind: CombatActionKind.BasicAttack,
      actorKind,
      name: input.name ?? '普攻',
      source: action?.source ?? CombatActionSource.System,
      requiresTarget: true,
      allowedTargetKinds: input.allowedTargetKinds ?? [
        CombatTargetKind.Player,
        CombatTargetKind.Monster,
        CombatTargetKind.Tile,
        CombatTargetKind.Formation,
        CombatTargetKind.Container,
      ],
      range,
      geometry: { shape: 'single' },
      effects,
      cost: input.cost ?? null,
      cooldownTicks: Number.isFinite(Number(input.cooldownTicks))
        ? Number(input.cooldownTicks)
        : Number.isFinite(Number(actor.attackCooldownTicks))
          ? Number(actor.attackCooldownTicks)
          : 0,
      windupTicks: 0,
      maxTargets: 1,
      raw: input.raw ?? input,
    });
  }

  createSkillDefinition(action, skill, input: AnyRecord = {}) {
    const geometry = normalizeSkillGeometry(skill);
    const precomputedMaxTargets = Number(input.precomputedMaxTargets);
    const maxTargets = Number.isFinite(precomputedMaxTargets) && precomputedMaxTargets >= 0
      ? Math.max(0, Math.floor(precomputedMaxTargets))
      : resolveSkillMaxTargets(skill, geometry);
    const requiresTarget = resolveSkillRequiresTarget({
      ...skill,
      range: geometry.range,
      targeting: {
        ...(skill.targeting ?? {}),
        range: geometry.range,
      },
    });
    return createCombatActionDefinition({
      actionId: skill.id ?? action?.actionId ?? null,
      kind: CombatActionKind.Skill,
      actorKind: action?.actor?.kind ?? input.actorKind ?? null,
      name: resolvePlayerFacingContentName(skill.id ?? action?.actionId, '未知技能', skill.name),
      source: action?.source ?? CombatActionSource.System,
      requiresTarget,
      allowedTargetKinds: resolveSkillAllowedTargetKinds(skill),
      range: geometry.range,
      geometry,
      effects: Array.isArray(skill.effects) ? skill.effects : [],
      cost: normalizeSkillCost(skill),
      cooldownTicks: normalizeCooldownTicks(skill.cooldown),
      windupTicks: normalizeWindupTicks(skill),
      maxTargets,
      raw: skill,
    });
  }

  explainCombatAction(input: AnyRecord = {}) {
    const action = input.action ?? null;
    const definitionResult = this.resolveActionDefinition(input);
    if (!definitionResult.ok) {
      return {
        ok: false,
        action,
        phase: action?.phase ?? CombatActionPhase.Instant,
        reason: definitionResult.reason,
        details: definitionResult.details ?? {},
        targetCount: 0,
        dryRun: true,
      };
    }
    const targets = Array.isArray(input.targets)
      ? input.targets
      : action?.target
        ? [action.target]
        : [];
    const targetCount = targets.length;
    const rejected = [];
    if (definitionResult.definition.requiresTarget && targetCount === 0) {
      rejected.push({
        reason: CombatRejectReason.MissingTargetLocation,
        target: null,
      });
    }
    return {
      ok: rejected.length === 0,
      action,
      phase: action?.phase ?? CombatActionPhase.Instant,
      definition: definitionResult.definition,
      targetCount,
      targets,
      rejected,
      reason: rejected[0]?.reason ?? null,
      dryRun: true,
    };
  }

  dryRunCombatAction(input: AnyRecord = {}) {
    const action = input.action ?? null;
    const phases = [];
    const startedAt = nowMs();
    const startedHeapBytes = heapUsedBytes();
    const pushPhase = (name, result: AnyRecord = {}, phaseStartedAt = nowMs(), phaseStartedHeapBytes = heapUsedBytes()) => {
      const heapDeltaBytes = heapDeltaSince(phaseStartedHeapBytes);
      phases.push({
        name,
        ok: result.ok !== false,
        reason: result.reason ?? result.rejected?.[0]?.reason ?? null,
        targetCount: result.targetCount ?? result.targets?.length ?? result.allowedCount ?? 0,
        rejectedCount: result.rejectedCount ?? result.rejected?.length ?? 0,
        durationMs: elapsedMs(phaseStartedAt),
        heapDeltaBytes,
      });
    };

    let phaseStartedAt = nowMs();
    let phaseStartedHeapBytes = heapUsedBytes();
    const definitionResult = this.resolveActionDefinition(input);
    pushPhase('action_definition', definitionResult, phaseStartedAt, phaseStartedHeapBytes);
    if (!definitionResult.ok) {
      return {
        ok: false,
        dryRun: true,
        action,
        phase: action?.phase ?? CombatActionPhase.Instant,
        reason: definitionResult.reason,
        phases,
        targets: [],
        allowed: [],
        rejected: [{
          reason: definitionResult.reason,
          target: action?.target ?? null,
          details: definitionResult.details ?? {},
        }],
        durationMs: elapsedMs(startedAt),
        heapDeltaBytes: heapDeltaSince(startedHeapBytes),
      };
    }

    phaseStartedAt = nowMs();
    phaseStartedHeapBytes = heapUsedBytes();
    const collection = this.collectCombatTargets({
      ...input,
      definition: definitionResult.definition,
      candidates: Array.isArray(input.candidates)
        ? input.candidates
        : Array.isArray(input.targets)
          ? input.targets
          : undefined,
    });
    pushPhase('target_collection', collection, phaseStartedAt, phaseStartedHeapBytes);
    phaseStartedAt = nowMs();
    phaseStartedHeapBytes = heapUsedBytes();
    const validation = this.validateCombatTargets({
      ...input,
      action,
      definition: definitionResult.definition,
      targets: collection.targets,
    });
    pushPhase('target_validation', validation, phaseStartedAt, phaseStartedHeapBytes);
    phaseStartedAt = nowMs();
    phaseStartedHeapBytes = heapUsedBytes();
    const timing = this.validateActionCostAndCooldown({
      ...input,
      action,
      definition: definitionResult.definition,
    });
    pushPhase('resource_cooldown', timing, phaseStartedAt, phaseStartedHeapBytes);

    const rejected = [
      ...(collection.rejected ?? []),
      ...(validation.rejected ?? []),
      ...(timing.rejected ?? []),
    ];
    const ok = collection.ok !== false
      && validation.ok !== false
      && timing.ok !== false
      && rejected.length === 0;
    return {
      ok,
      dryRun: true,
      action,
      phase: action?.phase ?? CombatActionPhase.Instant,
      definition: definitionResult.definition,
      targets: collection.targets,
      allowed: validation.allowed,
      rejected,
      reason: rejected[0]?.reason ?? null,
      phases,
      targetCount: collection.targets.length,
      allowedCount: validation.allowed.length,
      rejectedCount: rejected.length,
      durationMs: elapsedMs(startedAt),
      heapDeltaBytes: heapDeltaSince(startedHeapBytes),
    };
  }

  collectCombatTargets(input: AnyRecord = {}) {
    return collectCombatTargetsImpl(this, input);
  }

  collectCombatTargetsFromCells(input: AnyRecord = {}) {
    return collectCombatTargetsFromCellsImpl(this, input);
  }

  resolvePlayerBasicAttackActionPlan(input: AnyRecord = {}) {
    const attacker = input.attacker
      ?? input.player
      ?? input.playerRuntimeService?.getPlayer?.(input.playerId)
      ?? null;
    const instanceId = input.instanceId ?? attacker?.instanceId ?? null;
    const action = this.createPlayerBasicAttackAction({
      ...input,
      playerId: input.playerId ?? attacker?.playerId,
      instanceId,
    });
    if (!attacker || attacker.hp <= 0) {
      return {
        ok: false,
        action,
        definition: this.createBasicAttackDefinition(action, {
          ...input,
          actor: attacker,
          actorKind: CombatActorKind.Player,
        }),
        reason: attacker ? CombatRejectReason.ActorDead : CombatRejectReason.MissingTargetRuntimeState,
        severity: 'debug',
        details: { playerId: input.playerId },
        targetCollection: { targets: [], rejected: [] },
      };
    }
    const instance = input.instance
      ?? input.deps?.getInstanceRuntime?.(instanceId)
      ?? null;
    const normalizedTarget = this.resolvePlayerBasicAttackTarget(input, attacker, instance, instanceId);
    const definition = this.createBasicAttackDefinition(action, {
      ...input,
      actor: attacker,
      actorKind: CombatActorKind.Player,
      range: input.range ?? 1,
    });
    if (!instanceId || !instance) {
      return {
        ok: false,
        action,
        definition,
        reason: CombatRejectReason.MissingInstance,
        severity: 'debug',
        details: { instanceId },
        targetCollection: { targets: [], rejected: [] },
      };
    }
    if (!normalizedTarget) {
      return {
        ok: false,
        action,
        definition,
        reason: CombatRejectReason.NoTargets,
        severity: 'debug',
        details: {},
        targetCollection: { targets: [], rejected: [] },
      };
    }
    const targetCollection = this.collectCombatTargets({
      ...input,
      action: {
        ...action,
        target: normalizedTarget,
        anchor: normalizeCombatCell(normalizedTarget) ?? action.anchor,
      },
      definition,
      instance,
      playerRuntimeService: input.playerRuntimeService,
      formationService: input.formationService,
    });
    const validation = this.validateCombatTargets({
      ...input,
      action: {
        ...action,
        target: normalizedTarget,
        anchor: normalizeCombatCell(normalizedTarget) ?? action.anchor,
      },
      definition,
      targets: targetCollection.targets,
      actorPosition: attacker,
      instance,
      supportsPvp: input.supportsPvp ?? instance.supportsPvp,
      canDamageTile: input.canDamageTile ?? instance.canDamageTile,
      resolveCombatRelation: input.resolveCombatRelation,
    });
    const rejected = [
      ...(targetCollection.rejected ?? []),
      ...(validation.rejected ?? []),
    ];
    if (targetCollection.targets.length === 0 || validation.allowedCount === 0 || rejected.length > 0) {
      return {
        ok: false,
        action: {
          ...action,
          target: normalizedTarget,
          anchor: normalizeCombatCell(normalizedTarget) ?? action.anchor,
        },
        definition,
        reason: rejected[0]?.reason ?? CombatRejectReason.NoTargets,
        severity: 'debug',
        details: {
          targetCount: targetCollection.targets.length,
          allowedCount: validation.allowedCount,
          rejectedTargets: rejected,
        },
        targetCollection,
        validation,
      };
    }
    return {
      ok: true,
      action: {
        ...action,
        target: normalizedTarget,
        anchor: normalizeCombatCell(normalizedTarget) ?? action.anchor,
      },
      definition,
      targetCollection,
      validation,
      selectedTargets: validation.allowed,
      targetEntries: validation.allowed,
    };
  }

  resolvePlayerSkillActionPlan(input: AnyRecord = {}) {
    let phaseStartedAt = typeof input.recordPlanSectionDuration === 'function' ? nowMs() : 0;
    const attacker = input.attacker
      ?? input.player
      ?? input.playerRuntimeService?.getPlayer?.(input.playerId)
      ?? null;
    const instanceId = input.instanceId ?? attacker?.instanceId ?? null;
    const phase = input.phase ?? CombatActionPhase.Instant;
    const action = this.createPlayerSkillAction({
      ...input,
      playerId: input.playerId ?? attacker?.playerId,
      instanceId,
      phase,
    });
    const skill = input.skill ?? findSkillDefinition(attacker, input.skillId ?? action.actionId);
    const definition = skill
      ? this.createPlayerSkillPlanDefinition(action, skill, input, attacker)
      : null;
    if (phaseStartedAt > 0) {
      input.recordPlanSectionDuration('definitionMs', elapsedMs(phaseStartedAt), 1);
    }
    if (!attacker || attacker.hp <= 0) {
      return {
        ok: false,
        action,
        definition,
        reason: attacker ? CombatRejectReason.ActorDead : CombatRejectReason.MissingTargetRuntimeState,
        severity: 'debug',
        details: { playerId: input.playerId },
        targetCollection: { targets: [], rejected: [] },
      };
    }
    if (!instanceId || !input.instance) {
      return {
        ok: false,
        action,
        definition,
        reason: CombatRejectReason.MissingInstance,
        severity: 'debug',
        details: { instanceId },
        targetCollection: { targets: [], rejected: [] },
      };
    }
    if (!skill || !definition) {
      return {
        ok: false,
        action,
        definition: null,
        reason: CombatRejectReason.MissingSkill,
        severity: 'debug',
        details: { skillId: input.skillId ?? action.actionId },
        targetCollection: { targets: [], rejected: [] },
      };
    }

    phaseStartedAt = typeof input.recordPlanSectionDuration === 'function' ? nowMs() : 0;
    const targets = Array.isArray(input.resolvedTargets)
      ? this.normalizePlayerSkillPlanTargets(input.resolvedTargets, {
        ...input,
        action,
        definition,
        attacker,
        instance: input.instance,
      })
      : null;
    const targetCollection = targets
      ? {
        ok: targets.length > 0 || definition.requiresTarget === false,
        action,
        definition,
        targets,
        rejected: targets.length > 0 || definition.requiresTarget === false
          ? []
          : [{ reason: CombatRejectReason.NoTargets, target: action.target ?? null, details: {} }],
        targetCount: targets.length,
        maxTargets: definition.maxTargets,
      }
      : this.collectCombatTargets({
        ...input,
        action,
        definition,
        actorPosition: attacker,
        instance: input.instance,
        playerRuntimeService: input.playerRuntimeService,
        formationService: input.formationService,
        collectTargetsFromCells: 'prefer',
      });
    if (phaseStartedAt > 0) {
      input.recordPlanSectionDuration('collectionMs', elapsedMs(phaseStartedAt), 1);
    }
    phaseStartedAt = typeof input.recordPlanSectionDuration === 'function' ? nowMs() : 0;
    const validation = this.validateCombatTargets({
      ...input,
      action,
      definition,
      targets: targetCollection.targets,
      actorPosition: attacker,
      instance: input.instance,
      supportsPvp: input.supportsPvp ?? input.instance?.supportsPvp ?? input.instance?.meta?.supportsPvp,
      canDamageTile: input.canDamageTile ?? input.instance?.canDamageTile ?? input.instance?.meta?.canDamageTile,
      resolveCombatRelation: input.resolveCombatRelation,
    });
    if (phaseStartedAt > 0) {
      input.recordPlanSectionDuration('validationMs', elapsedMs(phaseStartedAt), 1);
    }
    phaseStartedAt = typeof input.recordPlanSectionDuration === 'function' ? nowMs() : 0;
    const timing = input.skipResourceAndCooldown === true
      ? { ok: true, rejected: [] }
      : this.validateActionCostAndCooldown({
        ...input,
        action,
        definition,
        actor: attacker,
        resources: input.resources ?? attacker,
        currentTick: input.currentTick,
        cooldownReadyTickByActionId: input.cooldownReadyTickByActionId ?? attacker.combat?.cooldownReadyTickBySkillId,
      });
    if (phaseStartedAt > 0) {
      input.recordPlanSectionDuration('resourceCooldownMs', elapsedMs(phaseStartedAt), 1);
    }
    const rejected = [
      ...(targetCollection.rejected ?? []),
      ...(validation.rejected ?? []),
      ...(timing.rejected ?? []),
    ];
    const timingRejected = timing.rejected ?? [];
    const noTargetsButAllowed = targetCollection.targets.length === 0 && definition.requiresTarget === false;
    if ((!noTargetsButAllowed && (targetCollection.targets.length === 0 || validation.allowedCount === 0)) || timingRejected.length > 0) {
      return {
        ok: false,
        action,
        definition,
        reason: timingRejected[0]?.reason ?? rejected[0]?.reason ?? CombatRejectReason.NoTargets,
        severity: 'debug',
        details: {
          targetCount: targetCollection.targets.length,
          allowedCount: validation.allowedCount,
          rejectedTargets: rejected,
        },
        targetCollection,
        validation,
        timing,
      };
    }
    return {
      ok: true,
      action,
      definition,
      targetCollection,
      validation,
      timing,
      details: {
        targetCount: targetCollection.targets.length,
        allowedCount: validation.allowedCount,
        rejectedTargets: rejected,
      },
      selectedTargets: validation.allowed,
      targetEntries: validation.allowed,
    };
  }

  createPlayerSkillPlanDefinition(action, skill, input: AnyRecord = {}, attacker = null) {
    const baseDefinition = this.createSkillDefinition(action, skill, {
      ...input,
      actorKind: CombatActorKind.Player,
      precomputedMaxTargets: input.maxTargets,
    });
    const allowedTargetKinds = Array.isArray(input.allowedTargetKinds) && input.allowedTargetKinds.length > 0
      ? input.allowedTargetKinds
      : isPlayerSelfOnlySkill(skill)
        ? [CombatTargetKind.Self]
        : baseDefinition.allowedTargetKinds;
    const effectiveGeometry = input.effectiveGeometry ?? null;
    if (!effectiveGeometry) {
      return {
        ...baseDefinition,
        allowedTargetKinds,
      };
    }
    return {
      ...baseDefinition,
      allowedTargetKinds,
      range: Math.max(0, Math.floor(Number(effectiveGeometry.range ?? baseDefinition.range) || 0)),
      geometry: {
        ...baseDefinition.geometry,
        ...effectiveGeometry,
      },
      maxTargets: Math.max(0, Math.floor(Number(input.maxTargets ?? baseDefinition.maxTargets) || 0)),
      raw: skill,
    };
  }

  normalizePlayerSkillPlanTargets(targets = [], input: AnyRecord = {}) {
    const instance = input.instance ?? null;
    const attacker = input.attacker ?? null;
    const normalized = [];
    for (const target of targets) {
      if (!target || typeof target !== 'object') {
        continue;
      }
      if (target.kind === 'self') {
        normalized.push({
          kind: CombatTargetKind.Self,
          id: target.playerId ?? attacker?.playerId ?? input.action?.actor?.id,
          x: target.x ?? attacker?.x,
          y: target.y ?? attacker?.y,
          runtime: attacker,
          source: target.source ?? 'legacy_targets',
        });
        continue;
      }
      if (target.kind === 'monster') {
        const monster = typeof instance?.getMonster === 'function'
          ? instance.getMonster(target.monsterId)
          : target.runtime ?? null;
        normalized.push({
          kind: CombatTargetKind.Monster,
          id: target.monsterId,
          x: monster?.x ?? target.x,
          y: monster?.y ?? target.y,
          runtime: monster,
          source: target.source ?? 'legacy_targets',
        });
        continue;
      }
      if (target.kind === 'player') {
        const player = input.playerRuntimeService?.getPlayer?.(target.playerId) ?? target.runtime ?? null;
        normalized.push({
          kind: CombatTargetKind.Player,
          id: target.playerId,
          x: player?.x ?? target.x,
          y: player?.y ?? target.y,
          runtime: player,
          source: target.source ?? 'legacy_targets',
        });
        continue;
      }
      if (target.kind === 'formation') {
        const formation = typeof input.formationService?.getFormationCombatState === 'function'
          ? input.formationService.getFormationCombatState(input.action?.instanceId ?? input.instanceId, target.formationId)
          : target.runtime ?? null;
        normalized.push({
          kind: CombatTargetKind.Formation,
          id: target.formationId,
          x: formation?.x ?? target.x,
          y: formation?.y ?? target.y,
          runtime: formation,
          source: target.source ?? 'legacy_targets',
        });
        continue;
      }
      if (target.kind === 'formation_boundary') {
        const boundary = typeof input.formationService?.getBoundaryBarrierCombatState === 'function'
          ? input.formationService.getBoundaryBarrierCombatState(input.action?.instanceId ?? input.instanceId, target.x, target.y)
          : target.runtime ?? null;
        normalized.push({
          kind: CombatTargetKind.Formation,
          id: target.formationId ?? boundary?.formationId ?? boundary?.id,
          x: target.x,
          y: target.y,
          runtime: boundary,
          source: 'formation_boundary',
        });
        continue;
      }
      if (target.kind === 'tile') {
        const state = target.state ?? (typeof instance?.getTileCombatState === 'function'
          ? instance.getTileCombatState(target.x, target.y)
          : null);
        normalized.push({
          kind: CombatTargetKind.Tile,
          x: target.x,
          y: target.y,
          state,
          source: target.source ?? 'legacy_targets',
        });
      }
    }
    return normalized;
  }

  resolvePlayerBasicAttackTarget(input, attacker, instance, instanceId) {
    return resolvePlayerBasicAttackTargetImpl(this, input, attacker, instance, instanceId);
  }

  resolveSingleCombatTarget(target, input: AnyRecord = {}, action = null) {
    return resolveSingleCombatTargetImpl(this, target, input, action);
  }

  validateCombatTargets(input: AnyRecord = {}) {
    return validateCombatTargetsImpl(this, input);
  }

  validateActionCostAndCooldown(input: AnyRecord = {}) {
    const action = input.action ?? null;
    const definition = input.definition ?? this.resolveActionDefinition(input).definition ?? null;
    if (!definition) {
      return {
        ok: false,
        rejected: [{
          reason: CombatRejectReason.MissingActionId,
          details: {},
        }],
      };
    }
    const rejected = [];
    const resources = input.resources ?? input.actor?.resources ?? input.player ?? input.monster ?? {};
    const cost = definition.cost ?? {};
    const qiCost = Math.max(0, Math.round(Number(cost.qi ?? cost.qiCost ?? 0) || 0));
    const currentQi = Math.max(0, Math.round(Number(resources.qi ?? resources.currentQi ?? 0) || 0));
    if (qiCost > currentQi) {
      rejected.push({
        reason: CombatRejectReason.InsufficientResource,
        details: {
          resource: 'qi',
          required: qiCost,
          current: currentQi,
        },
      });
    }
    const currentTick = Math.max(0, Math.floor(Number(input.currentTick) || 0));
    const readyTickByActionId = input.cooldownReadyTickByActionId
      ?? input.actor?.cooldownReadyTickBySkillId
      ?? input.player?.combat?.cooldownReadyTickBySkillId
      ?? input.monster?.cooldownReadyTickBySkillId
      ?? {};
    const readyTick = Math.max(0, Math.floor(Number(readyTickByActionId[definition.actionId]) || 0));
    if (readyTick > currentTick) {
      rejected.push({
        reason: CombatRejectReason.CooldownNotReady,
        details: {
          actionId: definition.actionId,
          readyTick,
          currentTick,
          cooldownLeft: readyTick - currentTick,
        },
      });
    }
    return {
      ok: rejected.length === 0,
      action,
      definition,
      rejected,
    };
  }

  computeCombatTargetCells(input: AnyRecord = {}) {
    const action = input.action ?? null;
    const definition = input.definition ?? this.resolveActionDefinition(input).definition ?? null;
    const origin = normalizeCombatCell(input.origin ?? input.actorPosition ?? input.actor ?? input.monster ?? input.player);
    const anchor = normalizeCombatCell(input.anchor ?? action?.anchor ?? action?.target);
    if (!definition || !origin || !anchor) {
      return {
        ok: false,
        action,
        definition,
        origin,
        anchor,
        cells: [],
        reason: !definition
          ? CombatRejectReason.MissingActionId
          : !origin
            ? CombatRejectReason.MissingRuntimeTargetPosition
            : CombatRejectReason.MissingTargetLocation,
      };
    }
    const geometry = definition.geometry ?? {};
    const cells = normalizeCombatCells(computeAffectedCellsFromAnchor(origin, anchor, {
      range: Math.max(0, Math.floor(Number(definition.range ?? geometry.range) || 0)),
      shape: geometry.shape ?? 'single',
      radius: geometry.radius,
      innerRadius: geometry.innerRadius,
      width: geometry.width,
      height: geometry.height,
      checkerParity: geometry.checkerParity,
    }));
    return {
      ok: cells.length > 0 || definition.requiresTarget === false,
      action,
      definition,
      origin,
      anchor,
      cells,
      cellCount: cells.length,
      reason: cells.length > 0 || definition.requiresTarget === false ? null : CombatRejectReason.OutOfRange,
    };
  }

  validateSingleCombatTarget(input: AnyRecord = {}) {
    return validateSingleCombatTargetImpl(this, input);
  }

  collectMonsterSkillPlayerTargets(input: AnyRecord = {}) {
    return collectMonsterSkillPlayerTargetsImpl(this, input);
  }

  resolveMonsterSkillActionPlan(input: AnyRecord = {}) {
    return resolveMonsterSkillActionPlanImpl(this, input);
  }

  resolveMonsterSkillChantStartPlan(input: AnyRecord = {}) {
    return resolveMonsterSkillChantStartPlanImpl(this, input);
  }

  revalidateMonsterSkillTargetForApply(input: AnyRecord = {}) {
    return revalidateMonsterSkillTargetForApplyImpl(this, input);
  }

  resolveMonsterBasicAttackPlayerTarget(input: AnyRecord = {}) {
    return resolveMonsterBasicAttackPlayerTargetImpl(this, input);
  }

  explainMonsterBasicAttack(input: AnyRecord = {}) {
    return explainMonsterBasicAttackImpl(this, input);
  }

  recordReject(deps, input = {}, options = undefined) {
    return recordRejectImpl(this, deps, input, options);
  }

  recordOutcome(deps, input: AnyRecord = {}, options = undefined) {
    return recordOutcomeImpl(this, deps, input, options);
  }

  recordCombatEvents(deps, outcome, options = undefined) {
    return recordCombatEventsImpl(this, deps, outcome, options);
  }

  recordInternalCombatEvents(events) {
    return recordInternalCombatEventsImpl(this, events);
  }

  enqueueCombatAuditEvent(auditEvent) {
    return enqueueCombatAuditEventImpl(this, auditEvent);
  }

  listCombatEvents(limit = 50) {
    return listCombatEventsImpl(this, limit);
  }

  queryRecentCombatAuditEvents(options = {}) {
    return queryRecentCombatAuditEventsImpl(this, options);
  }

  aggregateCombatDiagnostics(options = {}) {
    return aggregateCombatDiagnosticsImpl(this, options);
  }

  queryMonsterSkillFailureReasons(options = {}) {
    return queryMonsterSkillFailureReasonsImpl(this, options);
  }

  buildCombatAuditHeatmap(options = {}) {
    return buildCombatAuditHeatmapImpl(this, options);
  }

  normalizeCombatOutcomeResult(result: AnyRecord = {}, input: AnyRecord = {}) {
    const normalized = {
      ...result,
    };
    const effects = this.resolveCombatEffects({
      ...input,
      result,
    });
    if (hasDamageResultSignal(result)) {
      const effect = effects.find((entry) => entry?.kind === CombatEffectKind.Damage || entry?.type === CombatEffectKind.Damage)
        ?? this.createDamageEffectResult(result);
      normalized.damage = effect.damage;
      normalized.rawDamage = effect.rawDamage;
      normalized.damageKind = effect.damageKind;
      normalized.element = effect.element;
      normalized.dodged = effect.dodged;
      normalized.crit = effect.crit;
      normalized.resolved = effect.resolved;
      normalized.broken = effect.broken;
      normalized.effects = effects;
    }
    else if (effects.length > 0) {
      normalized.effects = effects;
    }
    normalized.immune = result.immune === true || effects.some((entry) => entry?.kind === CombatEffectKind.Immune);
    normalized.resisted = result.resisted === true || result.resolved === true || effects.some((entry) => entry?.kind === CombatEffectKind.Resist);
    normalized.blocked = result.blocked === true || effects.some((entry) => entry?.kind === CombatEffectKind.Block);
    normalized.outcomeResult = resolveCombatOutcomeResult(normalized);
    return normalized;
  }

  resolveCombatEffects(input: AnyRecord = {}) {
    const result = input.result ?? {};
    const definition = input.definition ?? null;
    const effects = [];
    const pushEffect = (effect) => {
      const normalized = normalizeCombatResolvedEffect(effect);
      if (!normalized) {
        return;
      }
      effects.push(normalized);
    };

    if (hasDamageResultSignal(result)) {
      pushEffect(this.createDamageEffectResult(result));
    }
    if (Number.isFinite(Number(result.heal ?? result.healing ?? result.totalHeal))) {
      pushEffect({
        kind: CombatEffectKind.Heal,
        type: CombatEffectKind.Heal,
        amount: Math.max(0, Math.round(Number(result.heal ?? result.healing ?? result.totalHeal) || 0)),
      });
    }
    if (result.buffApplied === true || result.buffId) {
      pushEffect({
        kind: CombatEffectKind.Buff,
        type: CombatEffectKind.Buff,
        buffId: result.buffId ?? null,
        applied: result.buffApplied === true,
      });
    }
    if (result.cleansed === true || result.cleanseCount) {
      pushEffect({
        kind: CombatEffectKind.Cleanse,
        type: CombatEffectKind.Cleanse,
        count: Math.max(0, Math.round(Number(result.cleanseCount) || 0)),
      });
    }
    if (result.immune === true) {
      pushEffect({
        kind: CombatEffectKind.Immune,
        type: CombatEffectKind.Immune,
        reason: result.immuneReason ?? null,
      });
    }
    if (result.resisted === true || result.resolved === true) {
      pushEffect({
        kind: CombatEffectKind.Resist,
        type: CombatEffectKind.Resist,
        reason: result.resistReason ?? (result.resolved === true ? 'resolve_power' : null),
      });
    }
    if (result.blocked === true) {
      pushEffect({
        kind: CombatEffectKind.Block,
        type: CombatEffectKind.Block,
        reason: result.blockReason ?? null,
      });
    }
    if (Array.isArray(definition?.effects)) {
      for (const effect of definition.effects) {
        if (!effect) {
          continue;
        }
        const kind = effect.kind ?? effect.type;
        if (kind === CombatEffectKind.Damage && effects.some((entry) => entry.kind === CombatEffectKind.Damage)) {
          continue;
        }
        if (kind === CombatEffectKind.Buff && effects.some((entry) => entry.kind === CombatEffectKind.Buff && entry.buffId === effect.buffId)) {
          continue;
        }
        if (kind === CombatEffectKind.Heal && effects.some((entry) => entry.kind === CombatEffectKind.Heal)) {
          continue;
        }
        if (kind === CombatEffectKind.Cleanse && effects.some((entry) => entry.kind === CombatEffectKind.Cleanse)) {
          continue;
        }
        pushEffect(effect);
      }
    }
    if (Array.isArray(result.effects)) {
      for (const effect of result.effects) {
        const normalized = normalizeCombatResolvedEffect(effect);
        if (!normalized) {
          continue;
        }
        const duplicate = effects.some((entry) => entry.kind === normalized.kind
          && entry.type === normalized.type
          && (entry as AnyRecord).buffId === (normalized as AnyRecord).buffId
          && (entry as AnyRecord).damageKind === (normalized as AnyRecord).damageKind
          && (entry as AnyRecord).element === (normalized as AnyRecord).element);
        if (!duplicate) {
          effects.push(normalized);
        }
      }
    }
    return effects;
  }

  createDamageEffectResult(result: AnyRecord = {}) {
    const damage = Math.max(0, Math.round(Number(result.damage ?? result.totalDamage) || 0));
    const rawDamage = Number.isFinite(Number(result.rawDamage ?? result.totalRawDamage))
      ? Math.max(0, Math.round(Number(result.rawDamage ?? result.totalRawDamage)))
      : damage;
    return {
      kind: CombatEffectKind.Damage,
      type: CombatEffectKind.Damage,
      damage,
      rawDamage,
      damageKind: result.damageKind ?? null,
      element: result.element ?? result.damageElement ?? null,
      dodged: result.dodged === true,
      immune: result.immune === true,
      resisted: result.resisted === true || result.resolved === true,
      blocked: result.blocked === true,
      crit: result.crit === true,
      resolved: result.resolved === true,
      broken: result.broken === true,
    };
  }

  createCombatResultApplication(input: AnyRecord = {}) {
    const target = input.target ?? {};
    const result = input.result ?? {};
    const targetKind = target.kind ?? null;
    const dirtyDomains = this.resolveCombatDirtyDomains({ target, result, actor: input.actor });
    return {
      targetKind,
      targetId: target.id ?? result.targetId ?? result.targetPlayerId ?? result.targetMonsterId ?? null,
      x: target.x ?? result.targetX ?? null,
      y: target.y ?? result.targetY ?? null,
      effectKinds: Array.isArray(result.effects)
        ? result.effects.map((effect) => effect?.kind ?? effect?.type).filter(Boolean)
        : [],
      dirtyDomains,
      persistenceTransfer: dirtyDomains.length > 0 ? 'dirty_domain_flush' : 'none',
      writesDatabaseInTick: false,
      appliesOnlySettledOutcome: true,
    };
  }

  applyCombatOutcome(input: AnyRecord = {}) {
    const outcomeNormalizeStartedAt = beginCombatOutcomePerf(input?.deps);
    const outcome = input.outcome ?? createCombatSuccessOutcome({
      phase: input.phase,
      actor: input.actor,
      actionId: input.actionId,
      instanceId: input.instanceId,
      target: input.target,
      result: this.normalizeCombatOutcomeResult(input.result ?? {}, input),
      application: input.application,
    });
    recordCombatOutcomePerf(input?.deps, 'combat.outcome.createNormalizeMs', outcomeNormalizeStartedAt);
    const shouldRecord = input.record === true;
    if (!outcome.ok) {
      if (shouldRecord) {
        this.recordReject(input.deps, outcome, input.recordOptions ?? input.options);
      }
      return {
        ok: false,
        outcome,
        reason: outcome.reason ?? CombatRejectReason.Unknown,
      };
    }
    const application = outcome.application ?? this.createCombatResultApplication(outcome);
    const adapter = resolveCombatApplyAdapter(input.adapters, outcome.target?.kind);
    if (!adapter) {
      return {
        ok: false,
        outcome,
        application,
        reason: CombatRejectReason.TargetTypeNotAllowed,
      };
    }
    const adapterStartedAt = beginCombatOutcomePerf(input?.deps);
    const adapterResult = adapter({
      outcome,
      application,
      actor: outcome.actor,
      target: outcome.target,
      result: outcome.result,
      deps: input.deps,
    });
    recordCombatOutcomePerf(input?.deps, 'combat.outcome.adapterMs', adapterStartedAt);
    const mergeStartedAt = beginCombatOutcomePerf(input?.deps);
    if (input.mergeAdapterResultToOutcome === true && adapterResult?.ok !== false) {
      this.mergeAdapterResultToOutcome(outcome, adapterResult);
    }
    recordCombatOutcomePerf(input?.deps, 'combat.outcome.mergeMs', mergeStartedAt);
    const recordStartedAt = beginCombatOutcomePerf(input?.deps);
    if (shouldRecord && adapterResult?.ok !== false) {
      if (outcome.application !== application) {
        outcome.application = application;
      }
      this.recordAppliedCombatOutcome(input.deps, outcome, input.recordOptions ?? input.options);
    }
    recordCombatOutcomePerf(input?.deps, 'combat.outcome.recordMs', recordStartedAt);
    return {
      ok: adapterResult?.ok !== false,
      outcome,
      application,
      adapterResult: adapterResult ?? null,
      dirtyDomains: application.dirtyDomains,
      targetKind: application.targetKind,
    };
  }

  mergeAdapterResultToOutcome(outcome, adapterResult: AnyRecord = {}) {
    if (!outcome?.result || !adapterResult || adapterResult.ok === false) {
      return outcome;
    }
    const patch: AnyRecord = {};
    if (Number.isFinite(Number(adapterResult.appliedDamage))) {
      patch.damage = Math.max(0, Math.round(Number(adapterResult.appliedDamage)));
      patch.appliedDamage = patch.damage;
    }
    if (Number.isFinite(Number(adapterResult.auraDamage))) {
      patch.auraDamage = Number(adapterResult.auraDamage);
    }
    if (adapterResult.defeated === true) {
      patch.defeated = true;
    }
    if (adapterResult.destroyed === true) {
      patch.destroyed = true;
    }
    if (adapterResult.consumed === true) {
      patch.consumed = true;
    }
    if (adapterResult.handledDefeat === true) {
      patch.handledDefeat = true;
    }
    if (Number.isFinite(Number(adapterResult.remainingCount))) {
      patch.remainingCount = Math.max(0, Math.round(Number(adapterResult.remainingCount)));
    }
    if (adapterResult.respawnRemainingTicks !== undefined) {
      patch.respawnRemainingTicks = adapterResult.respawnRemainingTicks;
    }
    if (adapterResult.title !== undefined) {
      patch.title = adapterResult.title;
    }
    if (Object.keys(patch).length === 0) {
      return outcome;
    }
    outcome.result = this.normalizeCombatOutcomeResult({
      ...outcome.result,
      ...patch,
    }, {
      ...outcome,
      result: {
        ...outcome.result,
        ...patch,
      },
    });
    return outcome;
  }

  recordAppliedCombatOutcome(deps, outcome, options = undefined) {
    if (typeof deps?.recordCombatOutcome === 'function') {
      deps.recordCombatOutcome(outcome);
    }
    else if (Array.isArray(deps?.combatOutcomes)) {
      deps.combatOutcomes.push(outcome);
    }
    else if (typeof deps?.recordCombatDiagnostic === 'function') {
      deps.recordCombatDiagnostic(outcome);
    }
    else if (Array.isArray(deps?.combatDiagnostics)) {
      deps.combatDiagnostics.push(outcome);
    }
    if (options?.log === true) {
      const logger = deps?.logger ?? this.logger;
      const message = this.formatOutcomeLog(outcome);
      if (typeof logger.debug === 'function') {
        logger.debug(message);
      }
      else {
        logger.log?.(message);
      }
    }
    this.recordCombatEvents(deps, outcome, options);
    return outcome;
  }

  resolveCombatDirtyDomains(input: AnyRecord = {}) {
    const result = input.result ?? {};
    if (Array.isArray(result.dirtyDomains)) {
      return uniqueStrings(result.dirtyDomains);
    }
    const target = input.target ?? {};
    const domains = [];
    if (target.kind === CombatTargetKind.Player || target.kind === CombatTargetKind.Self) {
      domains.push('player:vitals');
      if (hasBuffResultSignal(result)) {
        domains.push('player:buff', 'player:attr');
      }
      if (result.defeated === true) {
        domains.push('player:death');
      }
    }
    else if (target.kind === CombatTargetKind.Monster) {
      domains.push('instance:monster_runtime');
      if (result.defeated === true) {
        domains.push('instance:ground_items', 'player:progression');
      }
    }
    else if (target.kind === CombatTargetKind.Tile) {
      domains.push('instance:tile_damage');
    }
    else if (target.kind === CombatTargetKind.Formation) {
      domains.push('instance:formation');
    }
    else if (target.kind === CombatTargetKind.Container) {
      domains.push('instance:container');
    }
    if (result.resourceSpent === true || result.cooldownWritten === true || result.qiSpent === true) {
      if (input.actor?.kind === CombatActorKind.Monster) {
        domains.push('instance:monster_runtime');
      }
      else if (input.actor?.kind === CombatActorKind.Player) {
        domains.push('player:combat');
      }
    }
    return uniqueStrings(domains);
  }

  buildCombatEvents(outcome, input = {}) {
    if (!outcome?.ok) {
      return {
        aoiEvent: null,
        notificationEvent: null,
        auditEvent: null,
        diagnosticEvent: this.buildCombatDiagnosticEvent(outcome, input),
      };
    }
    return {
      aoiEvent: this.buildCombatAoiEvent(outcome, input),
      notificationEvent: this.buildCombatNotificationEvent(outcome, input),
      auditEvent: this.buildCombatAuditEvent(outcome, input),
      diagnosticEvent: null,
    };
  }

  buildCombatAoiEvent(outcome, input: AnyRecord = {}) {
    const target: AnyRecord = outcome.target ?? {};
    const result: AnyRecord = outcome.result ?? {};
    const event = {
      type: 'combat_result' as const,
      instanceId: outcome.instanceId ?? null,
      actorId: outcome.actor?.id ?? null,
      actionId: outcome.actionId ?? null,
      targetKind: target.kind ?? null,
      targetId: target.id ?? null,
      x: target.x ?? result.x ?? input.x ?? null,
      y: target.y ?? result.y ?? input.y ?? null,
      result: normalizeCombatProtocolResult(result),
      damage: Math.max(0, Math.round(Number(result.damage) || 0)),
    };
    if (!assertCombatAoiResultEventBudget(event)) {
      this.logger.warn(`战斗 AOI 结果字段预算超限：${Object.keys(event).length} > 预算，事件已降级 [instanceId=${outcome.instanceId}, actorId=${outcome.actor?.id}]`);
    }
    return event;
  }

  buildCombatNotificationEvent(outcome, input: AnyRecord = {}) {
    const target: AnyRecord = outcome.target ?? {};
    const result: AnyRecord = outcome.result ?? {};
    return {
      type: 'combat_notice',
      playerId: input.playerId ?? target.id ?? null,
      kind: 'combat',
      actorId: outcome.actor?.id ?? null,
      actionId: outcome.actionId ?? null,
      targetKind: target.kind ?? null,
      targetId: target.id ?? null,
      result: normalizeCombatProtocolResult(result),
      damage: Math.max(0, Math.round(Number(result.damage) || 0)),
    };
  }

  buildCombatAuditEvent(outcome, input: AnyRecord = {}) {
    return buildCombatAuditEventImpl(this, outcome, input);
  }

  buildCombatDiagnosticEvent(outcome, input: AnyRecord = {}) {
    return buildCombatDiagnosticEventImpl(this, outcome, input);
  }

  recordMonsterActionReject(deps, action, reason, details = {}, options = undefined) {
    return recordMonsterActionRejectImpl(this, deps, action, reason, details, options);
  }

  recordMonsterActionOutcome(deps, action, target, result: AnyRecord = {}, options = undefined) {
    return recordMonsterActionOutcomeImpl(this, deps, action, target, result, options);
  }

  formatRejectLog(outcome) {
    const actor = outcome.actor ? `${outcome.actor.kind}:${outcome.actor.id}` : '未知';
    const target = outcome.target ? `${outcome.target.kind}:${outcome.target.id ?? ''}` : '无';
    const targetCount = resolveOutcomeTargetCount(outcome);
    return `战斗动作被拒绝 原因=${outcome.reason} 阶段=${outcome.phase} 施放者=${actor} 动作=${outcome.actionId ?? '未知'} 实例=${outcome.instanceId ?? '未知'} 目标=${target} 目标数=${targetCount}`;
  }

  formatOutcomeLog(outcome) {
    const actor = outcome.actor ? `${outcome.actor.kind}:${outcome.actor.id}` : '未知';
    const target = outcome.target ? `${outcome.target.kind}:${outcome.target.id ?? ''}` : '无';
    const damage = Number.isFinite(Number(outcome.result?.damage)) ? Number(outcome.result.damage) : 0;
    const targetCount = resolveOutcomeTargetCount(outcome);
    return `战斗动作结算 阶段=${outcome.phase} 施放者=${actor} 动作=${outcome.actionId ?? '未知'} 实例=${outcome.instanceId ?? '未知'} 目标=${target} 目标数=${targetCount} 伤害=${damage}`;
  }
}



export {
  CombatActionKind,
  CombatActionPhase,
  CombatActionSource,
  CombatActorKind,
  CombatEffectKind,
  CombatRejectReason,
  CombatTargetKind,
};
