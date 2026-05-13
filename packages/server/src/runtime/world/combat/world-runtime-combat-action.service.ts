import { Injectable, Logger } from '@nestjs/common';
import {
  assertCombatAoiResultEventBudget,
  computeAffectedCellsFromAnchor,
  normalizeCombatProtocolResult,
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
  recordBoundedCombatRing,
  listBoundedCombatRing,
} from '../../combat/combat-runtime-event-ring.helpers';
import {
  aggregateCombatDiagnostics,
  buildCombatAuditHeatmap,
  queryMonsterSkillFailureReasons,
  queryRecentCombatAuditEvents,
} from '../../combat/combat-event-query';

type AnyRecord = Record<string, any>;

/** 统一战斗主链路骨架：先承接动作规范化、结构化拒绝原因和诊断输出。 */
@Injectable()
export class WorldRuntimeCombatActionService {
  private readonly logger = new Logger(WorldRuntimeCombatActionService.name);
  private readonly combatEvents = [];

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
      targetMode: input.targetMode ?? 'entity',
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
    const maxTargets = resolveSkillMaxTargets(skill, geometry);
    return createCombatActionDefinition({
      actionId: skill.id ?? action?.actionId ?? null,
      kind: CombatActionKind.Skill,
      actorKind: action?.actor?.kind ?? input.actorKind ?? null,
      name: skill.name ?? skill.id ?? action?.actionId ?? null,
      source: action?.source ?? CombatActionSource.System,
      requiresTarget: skill.requiresTarget !== false,
      targetMode: skill.targetMode ?? skill.targeting?.targetMode ?? null,
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
    const action = input.action ?? null;
    const definitionResult = input.definition
      ? { ok: true, definition: input.definition }
      : this.resolveActionDefinition(input);
    if (!action) {
      return {
        ok: false,
        targets: [],
        rejected: [{ reason: CombatRejectReason.MissingActionId, target: null }],
      };
    }
    if (!definitionResult.ok) {
      return {
        ok: false,
        targets: [],
        rejected: [{
          reason: definitionResult.reason,
          target: action.target ?? null,
          details: definitionResult.details ?? {},
        }],
      };
    }
    const definition = definitionResult.definition;
    const instance = input.instance ?? null;
    const targets = [];
    const rejected = [];
    const push = (target) => {
      if (!target || targets.length >= definition.maxTargets) {
        return;
      }
      targets.push(target);
    };
    // 统一的 relation 过滤器：收集阶段就按战斗目标规则过滤敌/友方关系，
    // 后续 validateSingleCombatTarget 不再重复做 relation 检查。
    const resolveCombatRelationFn = typeof input.resolveCombatRelation === 'function' ? input.resolveCombatRelation : null;
    const passesRelationFilter = (candidateOrTarget) => {
      if (!resolveCombatRelationFn) {
        return true;
      }
      const relation = resolveCombatRelationFn(action?.actor, candidateOrTarget);
      return relation === true
        || relation?.hostile === true
        || relation?.canAttack === true
        || relation?.relation === 'hostile';
    };

    if (Array.isArray(input.candidates) && input.candidates.length > 0) {
      for (const candidate of input.candidates) {
        if (targets.length >= definition.maxTargets) {
          break;
        }
        const resolved = this.resolveSingleCombatTarget(candidate, input, action);
        if (!resolved.ok) {
          rejected.push(resolved);
          continue;
        }
        if (!passesRelationFilter(resolved.target)) {
          rejected.push({
            ok: false,
            reason: CombatRejectReason.CombatRelationNotAllowed,
            target: resolved.target,
            details: {},
          });
          continue;
        }
        push(resolved.target);
      }
    }
    else if (action.warningCells?.length > 0 && typeof instance?.getPlayersAtTile === 'function') {
      const seen = new Set();
      for (const cell of action.warningCells) {
        if (targets.length >= definition.maxTargets) {
          break;
        }
        for (const player of instance.getPlayersAtTile(cell.x, cell.y) ?? []) {
          if (!player?.playerId || seen.has(player.playerId)) {
            continue;
          }
          const playerCandidate = {
            kind: CombatTargetKind.Player,
            id: player.playerId,
            x: cell.x,
            y: cell.y,
            source: 'warning_cell',
            runtime: player,
          };
          // AOE 类收集：relation 过滤失败静默跳过，不产生 rejected 日志。
          if (!passesRelationFilter(playerCandidate)) {
            continue;
          }
          seen.add(player.playerId);
          push(playerCandidate);
          if (targets.length >= definition.maxTargets) {
            break;
          }
        }
      }
    }
    else if (input.collectTargetsFromCells === true || input.collectTargetsFromCells === 'prefer') {
      const cellsResult = this.computeCombatTargetCells({
        ...input,
        action,
        definition,
        origin: input.actorPosition ?? input.actor ?? input.attacker ?? input.player,
        anchor: input.anchor ?? action.anchor ?? action.target,
      });
      if (!cellsResult.ok) {
        rejected.push({
          ok: false,
          reason: cellsResult.reason ?? CombatRejectReason.NoTargets,
          target: action.target ?? action.anchor ?? null,
          details: {
            cellCount: cellsResult.cellCount ?? cellsResult.cells?.length ?? 0,
          },
        });
      }
      else {
        this.collectCombatTargetsFromCells({
          ...input,
          action,
          definition,
          instance,
          cells: cellsResult.cells,
          push,
          rejected,
          targets,
        });
      }
    }
    else if (action.target && input.collectTargetsFromCells !== 'prefer') {
      const resolved = this.resolveSingleCombatTarget(action.target, input, action);
      if (!resolved.ok) {
        rejected.push(resolved);
      }
      else if (!passesRelationFilter(resolved.target)) {
        rejected.push({
          ok: false,
          reason: CombatRejectReason.CombatRelationNotAllowed,
          target: resolved.target,
          details: {},
        });
      }
      else {
        push(resolved.target);
      }
    }
    else if (action.anchor && definition.allowedTargetKinds.includes(CombatTargetKind.Tile)) {
      const resolved = this.resolveSingleCombatTarget({
        kind: CombatTargetKind.Tile,
        x: action.anchor.x,
        y: action.anchor.y,
      }, input, action);
      if (!resolved.ok) {
        rejected.push(resolved);
      }
      else if (!passesRelationFilter(resolved.target)) {
        rejected.push({
          ok: false,
          reason: CombatRejectReason.CombatRelationNotAllowed,
          target: resolved.target,
          details: {},
        });
      }
      else {
        push(resolved.target);
      }
    }

    if (definition.requiresTarget && targets.length === 0 && rejected.length === 0) {
      rejected.push({
        ok: false,
        reason: CombatRejectReason.NoTargets,
        target: action.target ?? null,
        details: {},
      });
    }
    return {
      ok: targets.length > 0 || !definition.requiresTarget,
      action,
      definition,
      targets,
      rejected,
      targetCount: targets.length,
      maxTargets: definition.maxTargets,
    };
  }

  collectCombatTargetsFromCells(input: AnyRecord = {}) {
    const instance = input.instance ?? null;
    const cells = Array.isArray(input.cells) ? input.cells : [];
    const definition = input.definition ?? {};
    const push = typeof input.push === 'function' ? input.push : () => undefined;
    const targets = Array.isArray(input.targets) ? input.targets : [];
    const seen = new Set();
    const resolveCombatRelation = typeof input.resolveCombatRelation === 'function' ? input.resolveCombatRelation : null;
    const pushCandidate = (candidate) => {
      if (!candidate || targets.length >= definition.maxTargets) {
        return;
      }
      // Early filter: 在收集阶段就按战斗目标规则过滤敌/友方关系。
      // 自身是否应被收集由 resolveCombatRelation 决定（当前返回 blocked → 非 hostile 被跳过），
      // 收集逻辑本身不做身份硬编码。
      if (resolveCombatRelation) {
        const relation = resolveCombatRelation(input.action?.actor, candidate);
        const hostile = relation === true
          || relation?.hostile === true
          || relation?.canAttack === true
          || relation?.relation === 'hostile';
        if (!hostile) {
          return;
        }
      }
      const resolved = this.resolveSingleCombatTarget(candidate, input, input.action);
      if (!resolved.ok) {
        input.rejected?.push?.(resolved);
        return;
      }
      const key = buildCombatTargetKey(resolved.target);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      push(resolved.target);
    };
    const candidatesByCell = (cell) => {
      const candidates = [];
      if (definition.allowedTargetKinds?.includes(CombatTargetKind.Monster) && typeof instance?.getMonsterAtTile === 'function') {
        const monster = instance.getMonsterAtTile(cell.x, cell.y);
        if (monster?.runtimeId) {
          candidates.push({ kind: CombatTargetKind.Monster, id: monster.runtimeId, source: 'affected_cell' });
        }
      }
      if (definition.allowedTargetKinds?.includes(CombatTargetKind.Monster) && typeof instance?.listMonsters === 'function') {
        const monster = instance.listMonsters().find((entry) => entry?.alive !== false && entry.x === cell.x && entry.y === cell.y);
        if (monster?.runtimeId) {
          candidates.push({ kind: CombatTargetKind.Monster, id: monster.runtimeId, source: 'affected_cell' });
        }
      }
      if (definition.allowedTargetKinds?.includes(CombatTargetKind.Formation) && typeof input.formationService?.getFormationAtTile === 'function') {
        const formation = input.formationService.getFormationAtTile(input.action?.instanceId ?? input.instanceId, cell.x, cell.y);
        if (formation?.id) {
          candidates.push({ kind: CombatTargetKind.Formation, id: formation.id, x: cell.x, y: cell.y, source: 'affected_cell' });
        }
      }
      if (definition.allowedTargetKinds?.includes(CombatTargetKind.Formation) && typeof input.formationService?.listRuntimeFormations === 'function') {
        const formation = input.formationService.listRuntimeFormations(input.action?.instanceId ?? input.instanceId)
          .find((entry) => Number(entry?.remainingAuraBudget) > 0 && entry.x === cell.x && entry.y === cell.y);
        if (formation?.id) {
          candidates.push({ kind: CombatTargetKind.Formation, id: formation.id, x: cell.x, y: cell.y, source: 'affected_cell' });
        }
      }
      if (definition.allowedTargetKinds?.includes(CombatTargetKind.Formation) && typeof input.formationService?.getBoundaryBarrierCombatState === 'function') {
        const boundary = input.formationService.getBoundaryBarrierCombatState(input.action?.instanceId ?? input.instanceId, cell.x, cell.y);
        if (boundary) {
          candidates.push({
            kind: CombatTargetKind.Formation,
            id: boundary.formationId ?? boundary.id,
            x: cell.x,
            y: cell.y,
            runtime: boundary,
            source: 'formation_boundary',
          });
        }
      }
      if (definition.allowedTargetKinds?.includes(CombatTargetKind.Player) && typeof instance?.getPlayersAtTile === 'function') {
        for (const player of instance.getPlayersAtTile(cell.x, cell.y) ?? []) {
          if (player?.playerId) {
            candidates.push({ kind: CombatTargetKind.Player, id: player.playerId, x: cell.x, y: cell.y, runtime: player, source: 'affected_cell' });
          }
        }
      }
      if (definition.allowedTargetKinds?.includes(CombatTargetKind.Container) && typeof instance?.getContainerAtTile === 'function') {
        const container = instance.getContainerAtTile(cell.x, cell.y);
        if (container) {
          candidates.push({ kind: CombatTargetKind.Container, id: container.id, x: cell.x, y: cell.y, runtime: container, source: 'affected_cell' });
        }
      }
      if (definition.allowedTargetKinds?.includes(CombatTargetKind.Tile)) {
        const tileState = typeof instance?.getTileCombatState === 'function'
          ? instance.getTileCombatState(cell.x, cell.y)
          : null;
        if (tileState && tileState.destroyed !== true) {
          candidates.push({ kind: CombatTargetKind.Tile, x: cell.x, y: cell.y, state: tileState, source: 'affected_cell' });
        }
      }
      return candidates;
    };
    for (const cell of cells) {
      if (targets.length >= definition.maxTargets) {
        break;
      }
      for (const candidate of candidatesByCell(cell)) {
        pushCandidate(candidate);
        if (targets.length >= definition.maxTargets) {
          break;
        }
      }
    }
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
        severity: 'warn',
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
        severity: 'warn',
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
    if (!attacker || attacker.hp <= 0) {
      return {
        ok: false,
        action,
        definition,
        reason: attacker ? CombatRejectReason.ActorDead : CombatRejectReason.MissingTargetRuntimeState,
        severity: 'warn',
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
        severity: 'warn',
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
        severity: 'warn',
        details: { skillId: input.skillId ?? action.actionId },
        targetCollection: { targets: [], rejected: [] },
      };
    }

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
    const rejected = [
      ...(targetCollection.rejected ?? []),
      ...(validation.rejected ?? []),
      ...(timing.rejected ?? []),
    ];
    const timingRejected = timing.rejected ?? [];
    if (targetCollection.targets.length === 0 || validation.allowedCount === 0 || timingRejected.length > 0) {
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
    });
    const allowedTargetKinds = Array.isArray(input.allowedTargetKinds) && input.allowedTargetKinds.length > 0
      ? input.allowedTargetKinds
      : isPlayerSelfOnlySkill(skill)
        ? [CombatTargetKind.Self]
        : [
          CombatTargetKind.Player,
          CombatTargetKind.Monster,
          CombatTargetKind.Tile,
          CombatTargetKind.Formation,
          CombatTargetKind.Container,
          CombatTargetKind.Self,
        ];
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
      maxTargets: Math.max(1, Math.floor(Number(input.maxTargets ?? baseDefinition.maxTargets) || 1)),
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
        const state = typeof instance?.getTileCombatState === 'function'
          ? instance.getTileCombatState(target.x, target.y)
          : target.state ?? null;
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
    if (input.target) {
      return input.target;
    }
    if (input.targetMonsterId) {
      const formation = typeof input.formationService?.getFormationCombatState === 'function'
        ? input.formationService.getFormationCombatState(instanceId, input.targetMonsterId)
        : null;
      if (formation) {
        return {
          kind: CombatTargetKind.Formation,
          id: formation.id ?? input.targetMonsterId,
          x: formation.x,
          y: formation.y,
          runtime: formation,
          source: 'target_ref',
        };
      }
      return { kind: CombatTargetKind.Monster, id: input.targetMonsterId };
    }
    if (input.targetPlayerId) {
      return { kind: CombatTargetKind.Player, id: input.targetPlayerId };
    }
    if (Number.isFinite(Number(input.targetX)) && Number.isFinite(Number(input.targetY))) {
      const x = Math.trunc(Number(input.targetX));
      const y = Math.trunc(Number(input.targetY));
      if (input.targetKind === CombatTargetKind.Tile || input.targetType === CombatTargetKind.Tile) {
        return { kind: CombatTargetKind.Tile, x, y, source: 'target_ref' };
      }
      if (input.targetKind === CombatTargetKind.Container || input.targetType === CombatTargetKind.Container || input.targetContainerId) {
        const container = typeof instance?.getContainerAtTile === 'function'
          ? instance.getContainerAtTile(x, y)
          : null;
        return {
          kind: CombatTargetKind.Container,
          id: input.targetContainerId ?? container?.id ?? `container:${x}:${y}`,
          x,
          y,
          runtime: container,
          source: 'tile_container',
        };
      }
      const boundary = typeof input.formationService?.getBoundaryBarrierCombatState === 'function'
        ? input.formationService.getBoundaryBarrierCombatState(instanceId, x, y)
        : null;
      if (boundary) {
        return {
          kind: CombatTargetKind.Formation,
          id: boundary.id ?? boundary.formationId ?? `boundary:${x}:${y}`,
          x,
          y,
          runtime: boundary,
          source: 'formation_boundary',
        };
      }
      const container = typeof instance?.getContainerAtTile === 'function'
        ? instance.getContainerAtTile(x, y)
        : null;
      if (container) {
        return {
          kind: CombatTargetKind.Container,
          id: container.id,
          x,
          y,
          runtime: container,
          source: 'tile_container',
        };
      }
      return { kind: CombatTargetKind.Tile, x, y };
    }
    return null;
  }

  resolveSingleCombatTarget(target, input: AnyRecord = {}, action = null) {
    const kind = target?.kind ?? null;
    const instance = input.instance ?? null;
    if (!kind) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingTarget,
        target,
        details: {},
      };
    }
    if (kind === CombatTargetKind.Self) {
      return {
        ok: true,
        target: {
          kind,
          id: action?.actor?.id ?? input.actor?.id ?? null,
          source: 'self',
        },
      };
    }
    if (kind === CombatTargetKind.Player) {
      const playerId = target.id;
      const position = typeof instance?.getPlayerPosition === 'function'
        ? instance.getPlayerPosition(playerId)
        : normalizeCombatCell(target);
      const player = input.playerRuntimeService?.getPlayer?.(playerId)
        ?? input.playersById?.get?.(playerId)
        ?? target.runtime
        ?? null;
      if (!player && !position) {
        return {
          ok: false,
          reason: CombatRejectReason.MissingTargetRuntimeState,
          target,
          details: { playerId },
        };
      }
      return {
        ok: true,
        target: {
          kind,
          id: playerId,
          x: position?.x,
          y: position?.y,
          source: target.source ?? 'target_ref',
          runtime: player,
        },
      };
    }
    if (kind === CombatTargetKind.Monster) {
      const monsterId = target.id;
      const monster = typeof instance?.getMonster === 'function'
        ? instance.getMonster(monsterId)
        : input.monstersById?.get?.(monsterId) ?? target.runtime ?? null;
      if (!monster) {
        return {
          ok: false,
          reason: CombatRejectReason.MissingMonster,
          target,
          details: { monsterId },
        };
      }
      if (monster.alive === false) {
        return {
          ok: false,
          reason: CombatRejectReason.MonsterDead,
          target,
          details: { monsterId },
        };
      }
      return {
        ok: true,
        target: {
          kind,
          id: monster.runtimeId ?? monsterId,
          x: monster.x,
          y: monster.y,
          source: target.source ?? 'target_ref',
          runtime: monster,
        },
      };
    }
    if (kind === CombatTargetKind.Tile) {
      const cell = normalizeCombatCell(target);
      if (!cell) {
        return {
          ok: false,
          reason: CombatRejectReason.MissingTargetLocation,
          target,
          details: {},
        };
      }
      const state = typeof instance?.getTileCombatState === 'function'
        ? instance.getTileCombatState(cell.x, cell.y)
        : null;
      return {
        ok: true,
        target: {
          kind,
          x: cell.x,
          y: cell.y,
          source: target.source ?? 'target_ref',
          state,
        },
      };
    }
    if (kind === CombatTargetKind.Formation) {
      const formationId = target.id ?? target.formationId;
      const formation = typeof input.formationService?.getFormationCombatState === 'function'
        ? input.formationService.getFormationCombatState(action?.instanceId ?? input.instanceId, formationId)
        : target.runtime ?? null;
      return {
        ok: true,
        target: {
          kind,
          id: formationId,
          x: formation?.x ?? target.x,
          y: formation?.y ?? target.y,
          source: target.source ?? 'target_ref',
          runtime: formation,
        },
      };
    }
    if (kind === CombatTargetKind.Container) {
      const containerId = target.id ?? target.containerId;
      const container = typeof instance?.getContainerState === 'function'
        ? instance.getContainerState(containerId)
        : target.runtime ?? null;
      return {
        ok: true,
        target: {
          kind,
          id: containerId,
          x: container?.x ?? target.x,
          y: container?.y ?? target.y,
          source: target.source ?? 'target_ref',
          runtime: container,
        },
      };
    }
    return {
      ok: false,
      reason: CombatRejectReason.Unknown,
      target,
      details: { kind },
    };
  }

  validateCombatTargets(input: AnyRecord = {}) {
    const action = input.action ?? null;
    const definition = input.definition ?? this.resolveActionDefinition(input).definition ?? null;
    const actorPosition = normalizeCombatCell(input.actorPosition ?? input.actor ?? input.monster ?? input.player);
    const targets = Array.isArray(input.targets) ? input.targets : [];
    const allowed = [];
    const rejected = [];
    for (const target of targets) {
      const result = this.validateSingleCombatTarget({
        ...input,
        action,
        definition,
        actorPosition,
        target,
      });
      if (result.ok) {
        allowed.push(result.target);
      }
      else {
        rejected.push(result);
      }
    }
    return {
      ok: rejected.length === 0,
      action,
      definition,
      allowed,
      rejected,
      allowedCount: allowed.length,
      rejectedCount: rejected.length,
    };
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
    const target = input.target;
    const definition = input.definition;
    if (!target) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingTarget,
        target,
        details: {},
      };
    }
    if (definition?.allowedTargetKinds?.length > 0 && !definition.allowedTargetKinds.includes(target.kind)) {
      return {
        ok: false,
        reason: CombatRejectReason.TargetTypeNotAllowed,
        target,
        details: {
          targetKind: target.kind,
          allowedTargetKinds: definition.allowedTargetKinds,
        },
      };
    }
    const actionInstanceId = input.instanceId ?? input.action?.instanceId ?? null;
    const targetInstanceId = target.instanceId ?? target.runtime?.instanceId ?? null;
    if (actionInstanceId && targetInstanceId && actionInstanceId !== targetInstanceId) {
      return {
        ok: false,
        reason: CombatRejectReason.TargetInstanceMismatch,
        target,
        details: {
          actionInstanceId,
          targetInstanceId,
        },
      };
    }
    if (target.kind === CombatTargetKind.Tile && input.canDamageTile === false) {
      return {
        ok: false,
        reason: CombatRejectReason.MapCapabilityDisabled,
        target,
        details: { capability: 'canDamageTile' },
      };
    }
    if (target.kind === CombatTargetKind.Tile && target.state?.destroyed === true) {
      return {
        ok: false,
        reason: CombatRejectReason.TargetDead,
        target,
        details: { targetType: 'tile' },
      };
    }
    if (target.kind === CombatTargetKind.Player && input.supportsPvp === false && input.action?.actor?.kind === CombatActorKind.Player) {
      return {
        ok: false,
        reason: CombatRejectReason.MapCapabilityDisabled,
        target,
        details: { capability: 'supportsPvp' },
      };
    }
    // Relation 检查作为 validateCombatTargets 独立公共 API 的契约与 defense in depth。
    // 正常流程下 collectCombatTargets 已提前过滤不符合 relation 的目标，此分支不会触发；
    // 仅在外部直接调用 validateCombatTargets 或目标绕过收集阶段时才起作用。
    if (typeof input.resolveCombatRelation === 'function') {
      const relation = input.resolveCombatRelation(input.action?.actor, target);
      const hostile = relation === true
        || relation?.hostile === true
        || relation?.canAttack === true
        || relation?.relation === 'hostile';
      if (!hostile) {
        return {
          ok: false,
          reason: CombatRejectReason.CombatRelationNotAllowed,
          target,
          details: { relation },
        };
      }
    }
    if (input.actorPosition && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
      const distance = combatChebyshevDistance(input.actorPosition.x, input.actorPosition.y, target.x, target.y);
      const range = Math.max(0, Math.floor(Number(definition?.range) || 0));
      const skipRangeValidation = input.skipResolvedTargetRangeValidation === true && target.source === 'legacy_targets';
      if (!skipRangeValidation && range > 0 && distance > range) {
        return {
          ok: false,
          reason: CombatRejectReason.OutOfRange,
          target,
          details: { distance, range },
        };
      }
    }
    return {
      ok: true,
      target,
    };
  }

  collectMonsterSkillPlayerTargets(input: AnyRecord = {}) {
    const action = input.action ?? {};
    const instance = input.instance;
    const playerRuntimeService = input.playerRuntimeService;
    const skill = input.skill ?? {};
    const warningCells = normalizeCombatCells(action.warningCells);
    const maxTargets = resolveMonsterSkillMaxTargets(skill);
    const targets = [];
    const seenPlayerIds = new Set();
    const rejected = [];
    const pushPlayerAtPosition = (playerId, position, source) => {
      if (!playerId || seenPlayerIds.has(playerId) || targets.length >= maxTargets) {
        return;
      }
      const player = playerRuntimeService?.getPlayer?.(playerId);
      const runtimePosition = typeof instance?.getPlayerPosition === 'function'
        ? instance.getPlayerPosition(playerId)
        : null;
      const location = typeof input.deps?.getPlayerLocation === 'function'
        ? input.deps.getPlayerLocation(playerId)
        : null;
      const locatedInActionInstance = Boolean(
        runtimePosition
        || source === 'warning_cell'
        || location?.instanceId === action.instanceId
        || player?.instanceId === action.instanceId,
      );
      if (!player) {
        rejected.push({ playerId, reason: CombatRejectReason.MissingTargetRuntimeState, source });
        return;
      }
      if (player.hp <= 0) {
        rejected.push({ playerId, reason: CombatRejectReason.TargetDead, source });
        return;
      }
      if (!locatedInActionInstance) {
        rejected.push({
          playerId,
          reason: CombatRejectReason.TargetInstanceMismatch,
          source,
          playerInstanceId: player.instanceId,
          locationInstanceId: location?.instanceId,
        });
        return;
      }
      const effectivePosition = normalizeCombatCell(runtimePosition ?? position ?? location ?? player);
      if (!effectivePosition) {
        rejected.push({ playerId, reason: CombatRejectReason.MissingRuntimeTargetPosition, source });
        return;
      }
      seenPlayerIds.add(playerId);
      targets.push({
        player,
        position: effectivePosition,
        source,
      });
    };

    if (warningCells.length > 0) {
      if (typeof instance?.getPlayersAtTile === 'function') {
        for (const cell of warningCells) {
          if (targets.length >= maxTargets) {
            break;
          }
          for (const tilePlayer of instance.getPlayersAtTile(cell.x, cell.y) ?? []) {
            pushPlayerAtPosition(tilePlayer?.playerId, cell, 'warning_cell');
            if (targets.length >= maxTargets) {
              break;
            }
          }
        }
      }
      const fallbackPosition = normalizeCombatCell(input.fallbackPosition);
      if (targets.length === 0
        && fallbackPosition
        && warningCells.some((cell) => cell.x === fallbackPosition.x && cell.y === fallbackPosition.y)) {
        pushPlayerAtPosition(action.targetPlayerId, fallbackPosition, 'warning_fallback');
      }
      return {
        targets,
        warningCells,
        rejected,
        maxTargets,
      };
    }

    const fallbackPosition = normalizeCombatCell(input.fallbackPosition);
    if (fallbackPosition) {
      pushPlayerAtPosition(action.targetPlayerId, fallbackPosition, 'primary_target');
    }
    return {
      targets,
      warningCells,
      rejected,
      maxTargets,
    };
  }

  resolveMonsterSkillActionPlan(input: AnyRecord = {}) {
    const action = input.action ?? {};
    const instance = input.instance ?? null;
    const monster = input.monster ?? null;
    const skill = input.skill ?? null;
    const playerRuntimeService = input.playerRuntimeService;
    const combatAction = this.createMonsterAction(action, CombatActionPhase.ChantResolve);
    const definition = skill
      ? this.createSkillDefinition(combatAction, skill, {
        monster,
        actorKind: CombatActorKind.Monster,
      })
      : null;
    const warningCells = normalizeCombatCells(action.warningCells);
    const hasAnchoredCast = Number.isFinite(Number(action.targetX)) && Number.isFinite(Number(action.targetY));
    if (!action.skillId) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingSkillId,
        severity: 'warn',
        details: {},
        warningCells,
        targetCollection: { targets: [], rejected: [] },
      };
    }
    if (!instance) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingInstance,
        severity: 'warn',
        details: { instanceId: action.instanceId },
        warningCells,
        targetCollection: { targets: [], rejected: [] },
      };
    }
    if (!monster) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingMonster,
        severity: 'warn',
        details: { runtimeId: action.runtimeId },
        warningCells,
        targetCollection: { targets: [], rejected: [] },
      };
    }
    if (monster.alive === false) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MonsterDead,
        severity: 'warn',
        details: { runtimeId: monster.runtimeId ?? action.runtimeId },
        warningCells,
        targetCollection: { targets: [], rejected: [] },
      };
    }
    if (!skill) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingSkill,
        severity: 'warn',
        details: { skillId: action.skillId },
        warningCells,
        targetCollection: { targets: [], rejected: [] },
      };
    }
    const location = typeof input.deps?.getPlayerLocation === 'function'
      ? input.deps.getPlayerLocation(action.targetPlayerId)
      : null;
    const runtimeTargetPosition = typeof instance?.getPlayerPosition === 'function'
      ? instance.getPlayerPosition(action.targetPlayerId)
      : null;
    const targetRuntimeState = playerRuntimeService?.getPlayer?.(action.targetPlayerId) ?? null;
    const locationPosition = location
      && location.instanceId === action.instanceId
      && Number.isFinite(Number(location.x))
      && Number.isFinite(Number(location.y))
      ? { x: Math.trunc(Number(location.x)), y: Math.trunc(Number(location.y)) }
      : null;
    const playerStatePosition = targetRuntimeState
      && targetRuntimeState.instanceId === action.instanceId
      && Number.isFinite(Number(targetRuntimeState.x))
      && Number.isFinite(Number(targetRuntimeState.y))
      ? { x: Math.trunc(Number(targetRuntimeState.x)), y: Math.trunc(Number(targetRuntimeState.y)) }
      : null;
    const fallbackTargetPosition = normalizeCombatCell(runtimeTargetPosition ?? locationPosition ?? playerStatePosition);
    const requiresTarget = skill.requiresTarget !== false;
    if (!fallbackTargetPosition && warningCells.length === 0 && requiresTarget) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: location ? CombatRejectReason.TargetLocationMismatch : CombatRejectReason.MissingRuntimeTargetPosition,
        severity: 'warn',
        details: {
          locationInstanceId: location?.instanceId,
          playerInstanceId: targetRuntimeState?.instanceId,
        },
        warningCells,
        targetCollection: { targets: [], rejected: [] },
      };
    }
    const distanceAnchor = hasAnchoredCast
      ? { x: Math.trunc(Number(action.targetX)), y: Math.trunc(Number(action.targetY)) }
      : fallbackTargetPosition ?? warningCells[0] ?? null;
    if (requiresTarget && !distanceAnchor) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingTargetLocation,
        severity: 'warn',
        details: {},
        warningCells,
        targetCollection: { targets: [], rejected: [] },
      };
    }
    const distance = requiresTarget
      ? combatChebyshevDistance(monster.x, monster.y, distanceAnchor.x, distanceAnchor.y)
      : 0;
    if (!requiresTarget) {
      const selfBuffTarget = playerRuntimeService?.getPlayer?.(action.targetPlayerId) ?? null;
      if (!selfBuffTarget || selfBuffTarget.hp <= 0) {
        return {
          ok: false,
          action: combatAction,
          definition,
          reason: selfBuffTarget ? CombatRejectReason.TargetDead : CombatRejectReason.MissingSelfBuffTarget,
          severity: 'warn',
          details: {},
          warningCells,
          distanceAnchor,
          fallbackTargetPosition,
          targetCollection: { targets: [], rejected: [] },
        };
      }
      return {
        ok: true,
        action: combatAction,
        definition,
        warningCells,
        hasAnchoredCast,
        distanceAnchor,
        distance,
        fallbackTargetPosition,
        targetCollection: { targets: [], rejected: [] },
        selectedTargets: [],
        targetEntries: [{ player: selfBuffTarget, position: fallbackTargetPosition ?? { x: monster.x, y: monster.y } }],
        selfBuffTarget,
        validation: { ok: true, allowed: [], rejected: [] },
      };
    }
    const targetCollection = this.collectMonsterSkillPlayerTargets({
      instance,
      deps: input.deps,
      action,
      skill,
      fallbackPosition: fallbackTargetPosition,
      playerRuntimeService,
    });
    const selectedTargets = targetCollection.targets ?? [];
    const validationTargets = selectedTargets.map((entry) => ({
      kind: CombatTargetKind.Player,
      id: entry.player?.playerId ?? entry.playerId ?? null,
      instanceId: action.instanceId,
      x: entry.position?.x,
      y: entry.position?.y,
      runtime: entry.player,
      source: entry.source,
    }));
    const validation = this.validateCombatTargets({
      action: combatAction,
      definition: {
        ...definition,
        range: 0,
        allowedTargetKinds: [CombatTargetKind.Player],
      },
      targets: validationTargets,
      instance,
      requiresLineOfSight: false,
    });
    if (selectedTargets.length === 0 || validation.allowedCount === 0) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: selectedTargets.length === 0
          ? CombatRejectReason.NoRuntimeTargetsInWarningCells
          : validation.rejected?.[0]?.reason ?? CombatRejectReason.NoRuntimeTargetsInWarningCells,
        severity: 'debug',
        details: {
          warningCellCount: warningCells.length,
          fallbackX: fallbackTargetPosition?.x,
          fallbackY: fallbackTargetPosition?.y,
          rejectedTargets: [
            ...(targetCollection.rejected ?? []),
            ...(validation.rejected ?? []),
          ],
        },
        warningCells,
        hasAnchoredCast,
        distanceAnchor,
        distance,
        fallbackTargetPosition,
        targetCollection,
        selectedTargets,
        validation,
      };
    }
    return {
      ok: true,
      action: combatAction,
      definition,
      warningCells,
      hasAnchoredCast,
      distanceAnchor,
      distance,
      fallbackTargetPosition,
      targetCollection,
      selectedTargets,
      targetEntries: selectedTargets,
      validation,
    };
  }

  resolveMonsterSkillChantStartPlan(input: AnyRecord = {}) {
    const action = input.action ?? {};
    const instance = input.instance ?? null;
    const monster = input.monster ?? null;
    const skill = input.skill ?? null;
    const combatAction = this.createMonsterAction(action, CombatActionPhase.ChantStart);
    const definition = skill
      ? this.createSkillDefinition(combatAction, skill, {
        monster,
        actorKind: CombatActorKind.Monster,
      })
      : null;
    const warningCells = normalizeCombatCells(action.warningCells);
    if (!action.skillId) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingSkillId,
        severity: 'warn',
        details: {},
        warningCells,
      };
    }
    if (!instance) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingInstance,
        severity: 'warn',
        details: { instanceId: action.instanceId },
        warningCells,
      };
    }
    if (!monster) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingMonster,
        severity: 'warn',
        details: { runtimeId: action.runtimeId },
        warningCells,
      };
    }
    if (monster.alive === false) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MonsterDead,
        severity: 'warn',
        details: { runtimeId: monster.runtimeId ?? action.runtimeId },
        warningCells,
      };
    }
    if (!skill) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingSkill,
        severity: 'warn',
        details: { skillId: action.skillId },
        warningCells,
      };
    }
    return {
      ok: true,
      action: combatAction,
      definition,
      instance,
      monster,
      skill,
      warningCells,
      durationMs: Math.max(1, Math.round(Number(action.durationMs) || 1000)),
      warningColor: typeof action.warningColor === 'string' && action.warningColor.trim().length > 0
        ? action.warningColor.trim()
        : '#ff3030',
    };
  }

  revalidateMonsterSkillTargetForApply(input: AnyRecord = {}) {
    const entry = input.entry ?? {};
    const player = entry.player ?? null;
    const deps = input.deps ?? {};
    const instance = input.instance ?? null;
    const action = input.action ?? {};
    const targetPlayerId = player?.playerId ?? entry.playerId ?? null;
    const position = normalizeCombatCell(entry.position);
    const targetCount = Math.max(0, Math.floor(Number(input.targetCount) || 0));
    const baseDetails = {
      targetPlayerId,
      playerInstanceId: player?.instanceId,
      targetHp: player?.hp,
      source: entry.source,
      targetX: position?.x,
      targetY: position?.y,
      targetCount,
    };
    if (!player) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingTargetRuntimeState,
        details: baseDetails,
        severity: 'debug',
      };
    }
    if (player.hp <= 0) {
      return {
        ok: false,
        reason: CombatRejectReason.TargetDead,
        details: baseDetails,
        severity: 'debug',
      };
    }
    if (entry.source !== 'warning_cell' && !isPlayerLocatedInCombatActionInstance(deps, instance, player.playerId, action.instanceId)) {
      const location = typeof deps?.getPlayerLocation === 'function'
        ? deps.getPlayerLocation(player.playerId)
        : null;
      return {
        ok: false,
        reason: CombatRejectReason.TargetInstanceMismatch,
        details: {
          ...baseDetails,
          locationInstanceId: location?.instanceId,
        },
        severity: 'debug',
      };
    }
    if (!position) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingRuntimeTargetPosition,
        details: baseDetails,
        severity: 'debug',
      };
    }
    return {
      ok: true,
      player,
      position,
      details: baseDetails,
    };
  }

  resolveMonsterBasicAttackPlayerTarget(input: AnyRecord = {}) {
    const action = input.action ?? {};
    const deps = input.deps;
    const playerRuntimeService = input.playerRuntimeService;
    const location = typeof deps?.getPlayerLocation === 'function'
      ? deps.getPlayerLocation(action.targetPlayerId)
      : null;
    if (!location) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingTargetLocation,
        details: {},
        severity: 'warn',
      };
    }
    const instance = typeof deps?.getInstanceRuntime === 'function'
      ? deps.getInstanceRuntime(action.instanceId)
      : null;
    if (!instance) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingInstance,
        details: {},
        severity: 'warn',
      };
    }
    const monster = typeof instance.getMonster === 'function'
      ? instance.getMonster(action.runtimeId)
      : null;
    if (!monster) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingMonster,
        details: {},
        severity: 'warn',
      };
    }
    if (!monster.alive) {
      return {
        ok: false,
        reason: CombatRejectReason.MonsterDead,
        details: {},
        severity: 'warn',
      };
    }
    const position = typeof instance.getPlayerPosition === 'function'
      ? instance.getPlayerPosition(action.targetPlayerId)
      : null;
    if (!position) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingRuntimeTargetPosition,
        details: {},
        severity: 'warn',
      };
    }
    const player = playerRuntimeService?.getPlayer?.(action.targetPlayerId);
    if (!player || player.instanceId !== location.instanceId || player.hp <= 0) {
      return {
        ok: false,
        reason: !player
          ? CombatRejectReason.MissingTargetRuntimeState
          : player.hp <= 0
            ? CombatRejectReason.TargetDead
            : CombatRejectReason.TargetInstanceMismatch,
        details: {
          playerInstanceId: player?.instanceId,
          locationInstanceId: location.instanceId,
        },
        severity: 'warn',
      };
    }
    const normalizedPosition = normalizeCombatCell(position);
    if (!normalizedPosition) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingRuntimeTargetPosition,
        details: {},
        severity: 'warn',
      };
    }
    const distance = combatChebyshevDistance(monster.x, monster.y, normalizedPosition.x, normalizedPosition.y);
    if (distance > monster.attackRange) {
      return {
        ok: false,
        reason: CombatRejectReason.OutOfRange,
        details: {
          distance,
          attackRange: monster.attackRange,
        },
        severity: 'debug',
      };
    }
    return {
      ok: true,
      instance,
      monster,
      player,
      position: normalizedPosition,
      distance,
      location,
    };
  }

  explainMonsterBasicAttack(input: AnyRecord = {}) {
    const action = input.action ?? {};
    const combatAction = this.createMonsterAction(action, CombatActionPhase.Instant);
    const targetResolution = this.resolveMonsterBasicAttackPlayerTarget(input);
    if (!targetResolution.ok) {
      return {
        ok: false,
        action: combatAction,
        phase: combatAction.phase,
        reason: targetResolution.reason,
        details: targetResolution.details ?? {},
        targetCount: 0,
      };
    }
    return {
      ok: true,
      action: combatAction,
      phase: combatAction.phase,
      reason: null,
      targetCount: 1,
      targets: [{
        kind: CombatTargetKind.Player,
        id: targetResolution.player.playerId,
        x: targetResolution.position.x,
        y: targetResolution.position.y,
        distance: targetResolution.distance,
      }],
    };
  }

  recordReject(deps, input = {}, options = undefined) {
    const outcome = createCombatRejectOutcome(input);
    if (typeof deps?.recordCombatDiagnostic === 'function') {
      deps.recordCombatDiagnostic(outcome);
    }
    else if (Array.isArray(deps?.combatDiagnostics)) {
      deps.combatDiagnostics.push(outcome);
    }
    const shouldLog = options?.log !== false;
    if (shouldLog) {
      const logger = deps?.logger ?? this.logger;
      const message = this.formatRejectLog(outcome);
      if (options?.severity === 'warn') {
        logger.warn?.(message);
      }
      else if (typeof logger.debug === 'function') {
        logger.debug(message);
      }
      else {
        logger.log?.(message);
      }
    }
    this.recordCombatEvents(deps, outcome, options);
    return outcome;
  }

  recordOutcome(deps, input: AnyRecord = {}, options = undefined) {
    const normalizedResult = this.normalizeCombatOutcomeResult(input.result ?? {}, input);
    const outcome = createCombatSuccessOutcome({
      ...input,
      result: normalizedResult,
      application: input.application ?? this.createCombatResultApplication({
        ...input,
        result: normalizedResult,
      }),
    });
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

  recordCombatEvents(deps, outcome, options = undefined) {
    const shouldBuildEvents = options?.buildEvents !== false
      || typeof deps?.recordCombatEvents === 'function'
      || Array.isArray(deps?.combatEvents);
    if (!shouldBuildEvents) {
      return null;
    }
    const events = this.buildCombatEvents(outcome, options?.eventContext ?? options ?? {});
    this.recordInternalCombatEvents(events);
    this.enqueueCombatAuditEvent(events?.auditEvent);
    if (typeof deps?.recordCombatEvents === 'function') {
      deps.recordCombatEvents(events, outcome);
    }
    else if (Array.isArray(deps?.combatEvents)) {
      deps.combatEvents.push(events);
    }
    return events;
  }

  recordInternalCombatEvents(events) {
    recordBoundedCombatRing(this.combatEvents, events, 200);
  }

  enqueueCombatAuditEvent(auditEvent) {
    return false;
  }

  listCombatEvents(limit = 50) {
    return listBoundedCombatRing(this.combatEvents, limit, 200);
  }

  queryRecentCombatAuditEvents(options = {}) {
    return queryRecentCombatAuditEvents(this.combatEvents, options);
  }

  aggregateCombatDiagnostics(options = {}) {
    return aggregateCombatDiagnostics(this.combatEvents, options);
  }

  queryMonsterSkillFailureReasons(options = {}) {
    return queryMonsterSkillFailureReasons(this.combatEvents, options);
  }

  buildCombatAuditHeatmap(options = {}) {
    return buildCombatAuditHeatmap(this.combatEvents, options);
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
    const outcome = input.outcome ?? createCombatSuccessOutcome({
      phase: input.phase,
      actor: input.actor,
      actionId: input.actionId,
      instanceId: input.instanceId,
      target: input.target,
      result: this.normalizeCombatOutcomeResult(input.result ?? {}, input),
      application: input.application,
    });
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
    const adapterResult = adapter({
      outcome,
      application,
      actor: outcome.actor,
      target: outcome.target,
      result: outcome.result,
      deps: input.deps,
    });
    if (input.mergeAdapterResultToOutcome === true && adapterResult?.ok !== false) {
      this.mergeAdapterResultToOutcome(outcome, adapterResult);
    }
    if (shouldRecord && adapterResult?.ok !== false) {
      this.recordAppliedCombatOutcome(input.deps, {
        ...outcome,
        application,
      }, input.recordOptions ?? input.options);
    }
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
    assertCombatAoiResultEventBudget(event);
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
    return {
      type: 'combat_audit',
      action: resolveCombatAuditEventAction(outcome, input),
      instanceId: outcome.instanceId ?? null,
      phase: outcome.phase ?? null,
      actor: outcome.actor ?? null,
      actionId: outcome.actionId ?? null,
      target: outcome.target ?? null,
      result: outcome.result ?? {},
      application: outcome.application ?? null,
      createdAt: outcome.createdAt ?? new Date().toISOString(),
      tags: Array.isArray(input.tags) ? [...input.tags] : [],
    };
  }

  buildCombatDiagnosticEvent(outcome, input: AnyRecord = {}) {
    return {
      type: 'combat_diagnostic',
      instanceId: outcome?.instanceId ?? null,
      phase: outcome?.phase ?? null,
      actor: outcome?.actor ?? null,
      actionId: outcome?.actionId ?? null,
      target: outcome?.target ?? null,
      reason: outcome?.reason ?? CombatRejectReason.Unknown,
      details: outcome?.details ?? {},
      createdAt: outcome?.createdAt ?? new Date().toISOString(),
      severity: input.severity ?? 'debug',
    };
  }

  recordMonsterActionReject(deps, action, reason, details = {}, options = undefined) {
    const phase = action?.kind === 'skill_chant'
      ? CombatActionPhase.ChantStart
      : action?.kind === 'skill'
        ? CombatActionPhase.ChantResolve
        : action?.kind === 'skill_cancel'
          ? CombatActionPhase.Cancel
          : CombatActionPhase.Instant;
    const combatAction = this.createMonsterAction(action, phase);
    return this.recordReject(deps, {
      phase,
      reason: reason ?? CombatRejectReason.Unknown,
      actor: combatAction.actor,
      actionId: combatAction.actionId,
      instanceId: combatAction.instanceId,
      target: combatAction.target,
      details: {
        actionKind: action?.kind ?? 'basic',
        runtimeId: action?.runtimeId,
        skillId: action?.skillId,
        targetPlayerId: action?.targetPlayerId,
        ...details,
      },
    }, options);
  }

  recordMonsterActionOutcome(deps, action, target, result: AnyRecord = {}, options = undefined) {
    const phase = action?.kind === 'skill'
      ? CombatActionPhase.ChantResolve
      : action?.kind === 'skill_chant'
        ? CombatActionPhase.ChantStart
        : CombatActionPhase.Instant;
    const combatAction = this.createMonsterAction(action, phase);
    return this.recordOutcome(deps, {
      phase,
      actor: combatAction.actor,
      actionId: combatAction.actionId,
      instanceId: combatAction.instanceId,
      target: target ?? combatAction.target,
      result: {
        actionKind: action?.kind ?? 'basic',
        runtimeId: action?.runtimeId,
        skillId: action?.skillId,
        ...result,
      },
    }, options);
  }

  formatRejectLog(outcome) {
    const actor = outcome.actor ? `${outcome.actor.kind}:${outcome.actor.id}` : 'unknown';
    const target = outcome.target ? `${outcome.target.kind}:${outcome.target.id ?? ''}` : 'none';
    const targetCount = resolveOutcomeTargetCount(outcome);
    return `combat_action_rejected reason=${outcome.reason} phase=${outcome.phase} actor=${actor} action=${outcome.actionId ?? 'unknown'} instance=${outcome.instanceId ?? 'unknown'} target=${target} target_count=${targetCount}`;
  }

  formatOutcomeLog(outcome) {
    const actor = outcome.actor ? `${outcome.actor.kind}:${outcome.actor.id}` : 'unknown';
    const target = outcome.target ? `${outcome.target.kind}:${outcome.target.id ?? ''}` : 'none';
    const damage = Number.isFinite(Number(outcome.result?.damage)) ? Number(outcome.result.damage) : 0;
    const targetCount = resolveOutcomeTargetCount(outcome);
    return `combat_action_outcome phase=${outcome.phase} actor=${actor} action=${outcome.actionId ?? 'unknown'} instance=${outcome.instanceId ?? 'unknown'} target=${target} target_count=${targetCount} damage=${damage}`;
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

function findSkillDefinition(actor, skillId) {
  if (!actor || !skillId) {
    return null;
  }
  if (Array.isArray(actor.skills)) {
    const directSkill = actor.skills.find((skill) => skill?.id === skillId);
    if (directSkill) {
      return directSkill;
    }
  }
  const techniques = actor.techniques?.techniques ?? actor.techniques ?? [];
  if (Array.isArray(techniques)) {
    for (const technique of techniques) {
      const skill = (technique?.skills ?? []).find((entry) => entry?.id === skillId);
      if (skill) {
        return skill;
      }
    }
  }
  return null;
}

function normalizeSkillGeometry(skill: AnyRecord = {}) {
  const targeting = skill.targeting ?? {};
  const range = Math.max(0, Math.floor(Number(targeting.range ?? skill.range) || 0));
  return {
    range,
    shape: targeting.shape ?? 'single',
    radius: normalizePositiveInteger(targeting.radius),
    innerRadius: normalizePositiveInteger(targeting.innerRadius),
    width: normalizePositiveInteger(targeting.width),
    height: normalizePositiveInteger(targeting.height),
    checkerParity: targeting.checkerParity ?? null,
  };
}

function resolveSkillAllowedTargetKinds(skill: AnyRecord = {}) {
  const explicit = skill.targeting?.allowedTargetKinds ?? skill.allowedTargetKinds;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.filter(Boolean);
  }
  const targetMode = skill.targetMode ?? skill.targeting?.targetMode;
  if (targetMode === 'self' || skill.requiresTarget === false) {
    return [CombatTargetKind.Self];
  }
  if (targetMode === 'tile') {
    return [CombatTargetKind.Tile];
  }
  if (targetMode === 'entity') {
    return [CombatTargetKind.Player, CombatTargetKind.Monster];
  }
  if (targetMode === 'any') {
    return [
      CombatTargetKind.Player,
      CombatTargetKind.Monster,
      CombatTargetKind.Tile,
      CombatTargetKind.Formation,
      CombatTargetKind.Container,
    ];
  }
  return [
    CombatTargetKind.Player,
    CombatTargetKind.Monster,
    CombatTargetKind.Tile,
    CombatTargetKind.Formation,
    CombatTargetKind.Container,
    CombatTargetKind.Self,
  ];
}

function isPlayerSelfOnlySkill(skill: AnyRecord = {}) {
  const effects = Array.isArray(skill.effects) ? skill.effects : [];
  return skill.requiresTarget === false
    && effects.length > 0
    && effects.every((effect) => effect?.type === CombatEffectKind.Buff && effect.target === 'self');
}

function normalizeSkillCost(skill: AnyRecord = {}) {
  if (skill.cost && typeof skill.cost === 'object') {
    return { ...skill.cost };
  }
  const qi = Number(skill.cost ?? skill.qiCost ?? 0);
  return Number.isFinite(qi) && qi > 0 ? { qi: Math.round(qi) } : null;
}

function normalizeCooldownTicks(cooldown) {
  if (cooldown && typeof cooldown === 'object') {
    return Math.max(0, Math.floor(Number(cooldown.ticks ?? cooldown.value ?? 0) || 0));
  }
  return Math.max(0, Math.floor(Number(cooldown) || 0));
}

function normalizeWindupTicks(skill: AnyRecord = {}) {
  return Math.max(0, Math.floor(Number(skill.monsterCast?.windupTicks ?? skill.cast?.windupTicks ?? skill.windupTicks ?? 0) || 0));
}

function resolveSkillMaxTargets(skill: AnyRecord = {}, geometry = normalizeSkillGeometry(skill)) {
  const configured = Number(skill.targeting?.maxTargets ?? skill.maxTargets);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.floor(configured));
  }
  const shape = geometry.shape ?? 'single';
  if (shape === 'single') {
    return 1;
  }
  const width = Math.max(1, Math.round(Number(geometry.width) || 1));
  const height = Math.max(1, Math.round(Number(geometry.height) || 1));
  const range = Math.max(1, Math.round(Number(geometry.range) || 1));
  const radius = Math.max(1, Math.round(Number(geometry.radius) || range || 1));
  if (shape === 'box' || shape === 'checkerboard') {
    return width * height;
  }
  if (shape === 'line') {
    return Math.max(1, range) * width;
  }
  return Math.max(1, (radius * 2 + 1) * (radius * 2 + 1));
}

function normalizePositiveInteger(value) {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
}

function hasDamageResultSignal(result: AnyRecord = {}) {
  return Object.prototype.hasOwnProperty.call(result, 'damage')
    || Object.prototype.hasOwnProperty.call(result, 'totalDamage')
    || Object.prototype.hasOwnProperty.call(result, 'rawDamage')
    || Object.prototype.hasOwnProperty.call(result, 'totalRawDamage')
    || result.dodged === true
    || result.resolved === true
    || result.broken === true
    || result.crit === true;
}

function hasBuffResultSignal(result: AnyRecord = {}) {
  return result.buffApplied === true
    || result.buffRemoved === true
    || (Array.isArray(result.effects) && result.effects.some((effect) => effect?.kind === CombatEffectKind.Buff || effect?.type === CombatEffectKind.Buff));
}

function normalizeCombatResolvedEffect(effect: AnyRecord = {}) {
  if (!effect || typeof effect !== 'object') {
    return null;
  }
  const kind = effect.kind ?? effect.type ?? CombatEffectKind.Custom;
  const normalized = {
    ...effect,
    kind,
    type: effect.type ?? kind,
  };
  if (kind === CombatEffectKind.Damage || effect.type === CombatEffectKind.Damage) {
    return {
      ...normalized,
      kind: CombatEffectKind.Damage,
      type: CombatEffectKind.Damage,
      damage: Math.max(0, Math.round(Number(effect.damage ?? effect.totalDamage) || 0)),
      rawDamage: Number.isFinite(Number(effect.rawDamage ?? effect.totalRawDamage))
        ? Math.max(0, Math.round(Number(effect.rawDamage ?? effect.totalRawDamage)))
        : Math.max(0, Math.round(Number(effect.damage ?? effect.totalDamage) || 0)),
      damageKind: effect.damageKind ?? null,
      element: effect.element ?? effect.damageElement ?? null,
      dodged: effect.dodged === true,
      crit: effect.crit === true,
      resolved: effect.resolved === true,
      broken: effect.broken === true,
    };
  }
  if (kind === CombatEffectKind.Heal || effect.type === CombatEffectKind.Heal) {
    return {
      ...normalized,
      kind: CombatEffectKind.Heal,
      type: CombatEffectKind.Heal,
      amount: Math.max(0, Math.round(Number(effect.amount ?? effect.heal ?? effect.healing) || 0)),
    };
  }
  if (kind === CombatEffectKind.Buff || effect.type === CombatEffectKind.Buff) {
    return {
      ...normalized,
      kind: CombatEffectKind.Buff,
      type: CombatEffectKind.Buff,
      buffId: effect.buffId ?? null,
    };
  }
  if (kind === CombatEffectKind.Cleanse || effect.type === CombatEffectKind.Cleanse) {
    return {
      ...normalized,
      kind: CombatEffectKind.Cleanse,
      type: CombatEffectKind.Cleanse,
      count: Math.max(0, Math.round(Number(effect.count ?? effect.cleanseCount) || 0)),
    };
  }
  if (kind === CombatEffectKind.Immune || effect.type === CombatEffectKind.Immune) {
    return {
      ...normalized,
      kind: CombatEffectKind.Immune,
      type: CombatEffectKind.Immune,
      reason: effect.reason ?? null,
    };
  }
  if (kind === CombatEffectKind.Resist || effect.type === CombatEffectKind.Resist) {
    return {
      ...normalized,
      kind: CombatEffectKind.Resist,
      type: CombatEffectKind.Resist,
      reason: effect.reason ?? null,
    };
  }
  if (kind === CombatEffectKind.Block || effect.type === CombatEffectKind.Block) {
    return {
      ...normalized,
      kind: CombatEffectKind.Block,
      type: CombatEffectKind.Block,
      reason: effect.reason ?? null,
    };
  }
  return normalized;
}

function resolveCombatApplyAdapter(adapters: AnyRecord = {}, targetKind) {
  if (!adapters || typeof adapters !== 'object') {
    return null;
  }
  if (targetKind === CombatTargetKind.Player) {
    return adapters.player ?? adapters[CombatTargetKind.Player] ?? null;
  }
  if (targetKind === CombatTargetKind.Self) {
    return adapters.self ?? adapters.player ?? adapters[CombatTargetKind.Self] ?? null;
  }
  if (targetKind === CombatTargetKind.Monster) {
    return adapters.monster ?? adapters[CombatTargetKind.Monster] ?? null;
  }
  if (targetKind === CombatTargetKind.Tile) {
    return adapters.tile ?? adapters[CombatTargetKind.Tile] ?? null;
  }
  if (targetKind === CombatTargetKind.Formation) {
    return adapters.formation ?? adapters[CombatTargetKind.Formation] ?? null;
  }
  if (targetKind === CombatTargetKind.Container) {
    return adapters.container ?? adapters[CombatTargetKind.Container] ?? null;
  }
  return adapters[targetKind] ?? null;
}

function resolveOutcomeTargetCount(outcome: AnyRecord = {}) {
  const detailsCount = Number(outcome.details?.targetCount ?? outcome.details?.selectedTargetCount);
  if (Number.isFinite(detailsCount) && detailsCount >= 0) {
    return Math.floor(detailsCount);
  }
  const resultCount = Number(outcome.result?.targetCount);
  if (Number.isFinite(resultCount) && resultCount >= 0) {
    return Math.floor(resultCount);
  }
  return outcome.target ? 1 : 0;
}

function resolveCombatAuditEventAction(outcome: AnyRecord = {}, input: AnyRecord = {}) {
  if (typeof input.action === 'string' && input.action.trim().length > 0) {
    return input.action.trim();
  }
  const result = outcome.result ?? {};
  if (result.defeated === true) return 'defeat';
  if (result.destroyed === true || result.broken === true) return 'destroy';
  if (Number(result.damage ?? result.totalDamage ?? 0) > 0) return 'damage';
  if (result.dodged === true) return 'dodge';
  if (result.immune === true) return 'immune';
  return 'resolve';
}

function resolveCombatOutcomeResult(result: AnyRecord = {}) {
  if (result.dodged === true) return 'dodged';
  if (result.immune === true) return 'immune';
  if (result.resisted === true || result.resolved === true) return 'resisted';
  if (result.blocked === true) return 'blocked';
  return Number(result.damage ?? result.totalDamage ?? 0) > 0 ? 'hit' : 'no_damage';
}

function uniqueStrings(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }
    const normalized = value.trim();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function elapsedMs(startedAt) {
  const elapsed = nowMs() - startedAt;
  return Number.isFinite(elapsed) && elapsed >= 0 ? Number(elapsed.toFixed(3)) : 0;
}

function heapUsedBytes() {
  if (typeof process === 'undefined' || typeof process.memoryUsage !== 'function') {
    return null;
  }
  const heapUsed = Number(process.memoryUsage().heapUsed);
  return Number.isFinite(heapUsed) && heapUsed >= 0 ? heapUsed : null;
}

function heapDeltaSince(startedHeapBytes) {
  const current = heapUsedBytes();
  if (!Number.isFinite(startedHeapBytes) || !Number.isFinite(current)) {
    return null;
  }
  return Math.max(0, Math.round(current - startedHeapBytes));
}

function resolvePlayerCommandTarget(input: AnyRecord = {}) {
  if (input.targetPlayerId) {
    return { kind: CombatTargetKind.Player, id: input.targetPlayerId };
  }
  if (input.targetMonsterId) {
    return { kind: CombatTargetKind.Monster, id: input.targetMonsterId };
  }
  if (input.targetFormationId) {
    return { kind: CombatTargetKind.Formation, id: input.targetFormationId };
  }
  if (input.targetContainerId) {
    return { kind: CombatTargetKind.Container, id: input.targetContainerId };
  }
  if (Number.isFinite(Number(input.targetX)) && Number.isFinite(Number(input.targetY))) {
    return {
      kind: CombatTargetKind.Tile,
      x: Math.trunc(Number(input.targetX)),
      y: Math.trunc(Number(input.targetY)),
    };
  }
  if (typeof input.targetRef === 'string' && input.targetRef.trim().length > 0) {
    const targetRef = input.targetRef.trim();
    if (targetRef === 'self') {
      return { kind: CombatTargetKind.Self };
    }
    if (targetRef.startsWith('player:')) {
      return { kind: CombatTargetKind.Player, id: targetRef.slice('player:'.length).trim() };
    }
    if (targetRef.startsWith('tile:')) {
      const [, x, y] = targetRef.split(':');
      return {
        kind: CombatTargetKind.Tile,
        x: Math.trunc(Number(x)),
        y: Math.trunc(Number(y)),
        ref: targetRef,
      };
    }
    if (targetRef.startsWith('formation:')) {
      return { kind: CombatTargetKind.Formation, id: targetRef.slice('formation:'.length).trim() };
    }
    if (targetRef.startsWith('container:')) {
      return { kind: CombatTargetKind.Container, id: targetRef.slice('container:'.length).trim() };
    }
    return { kind: CombatTargetKind.Monster, id: targetRef };
  }
  return null;
}

function resolveMonsterCombatActionKind(action: AnyRecord = {}) {
  if (action?.kind === 'skill_chant') {
    return CombatActionKind.SkillChant;
  }
  if (action?.kind === 'skill_cancel') {
    return CombatActionKind.SkillCancel;
  }
  if (action?.kind === 'skill') {
    return CombatActionKind.Skill;
  }
  return CombatActionKind.BasicAttack;
}

function normalizeCombatCell(input) {
  if (!input) {
    return null;
  }
  const x = Math.trunc(Number(input.x));
  const y = Math.trunc(Number(input.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function normalizeCombatCells(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  const cells = [];
  for (const cell of input) {
    const normalized = normalizeCombatCell(cell);
    if (normalized) {
      cells.push(normalized);
    }
  }
  return cells;
}

function combatChebyshevDistance(ax, ay, bx, by) {
  return Math.max(Math.abs(Math.trunc(Number(ax)) - Math.trunc(Number(bx))), Math.abs(Math.trunc(Number(ay)) - Math.trunc(Number(by))));
}

function buildCombatTargetKey(target: AnyRecord = {}) {
  if (target.kind === CombatTargetKind.Player || target.kind === CombatTargetKind.Monster || target.kind === CombatTargetKind.Container) {
    return `${target.kind}:${target.id ?? ''}`;
  }
  if (target.kind === CombatTargetKind.Formation) {
    return `${target.kind}:${target.id ?? ''}:${target.source ?? ''}:${target.x ?? ''}:${target.y ?? ''}`;
  }
  if (target.kind === CombatTargetKind.Self) {
    return `${target.kind}:${target.id ?? ''}`;
  }
  return `${target.kind ?? 'target'}:${target.x ?? ''}:${target.y ?? ''}`;
}

function isPlayerLocatedInCombatActionInstance(deps, instance, playerId, instanceId) {
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
  const width = Math.max(1, Math.round(Number(skill?.targeting?.width) || 1));
  const height = Math.max(1, Math.round(Number(skill?.targeting?.height) || 1));
  const range = Math.max(1, Math.round(Number(skill?.targeting?.range ?? skill?.range) || 1));
  const radius = Math.max(1, Math.round(Number(skill?.targeting?.radius) || range || 1));
  if (shape === 'box' || shape === 'checkerboard') {
    return width * height;
  }
  if (shape === 'line') {
    return Math.max(1, range) * width;
  }
  return Math.max(1, (radius * 2 + 1) * (radius * 2 + 1));
}
