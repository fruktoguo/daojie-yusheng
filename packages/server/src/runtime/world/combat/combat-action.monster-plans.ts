/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 从 world-runtime-combat-action.service.ts 抽取的怪物战斗方案相关方法（模式 B 委托）。
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import type { WorldRuntimeCombatActionService } from './world-runtime-combat-action.service';
import { resolveSkillRequiresTarget } from '@mud/shared';
import { CombatActionPhase, CombatActorKind, CombatRejectReason, CombatTargetKind } from './combat-action.types';
import {
  combatChebyshevDistance,
  isCombatSelfOnlySkill,
  isPlayerLocatedInCombatActionInstance,
  normalizeCombatCell,
  normalizeCombatCells,
} from './world-runtime-combat-action.helpers';

type AnyRecord = Record<string, any>;


export function resolveMonsterSkillActionPlanImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
    const action = input.action ?? {};
    const instance = input.instance ?? null;
    const monster = input.monster ?? null;
    const skill = input.skill ?? null;
    const playerRuntimeService = input.playerRuntimeService;
    const combatAction = self.createMonsterAction(action, CombatActionPhase.ChantResolve);
    const definition = skill
      ? self.createSkillDefinition(combatAction, skill, {
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
        severity: 'debug',
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
        severity: 'debug',
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
    const runtimeTargetPosition = typeof instance?.getPlayerPosition === 'function'
      ? instance.getPlayerPosition(action.targetPlayerId)
      : null;
    const targetRuntimeState = playerRuntimeService?.getPlayer?.(action.targetPlayerId) ?? null;
    const playerStatePosition = targetRuntimeState
      && targetRuntimeState.instanceId === action.instanceId
      && Number.isFinite(Number(targetRuntimeState.x))
      && Number.isFinite(Number(targetRuntimeState.y))
      ? { x: Math.trunc(Number(targetRuntimeState.x)), y: Math.trunc(Number(targetRuntimeState.y)) }
      : null;
    const needsLocationFallback = !runtimeTargetPosition && !playerStatePosition;
    const location = needsLocationFallback && typeof input.deps?.getPlayerLocation === 'function'
      ? input.deps.getPlayerLocation(action.targetPlayerId)
      : null;
    const locationPosition = location
      && location.instanceId === action.instanceId
      && Number.isFinite(Number(location.x))
      && Number.isFinite(Number(location.y))
      ? { x: Math.trunc(Number(location.x)), y: Math.trunc(Number(location.y)) }
      : null;
    const fallbackTargetPosition = normalizeCombatCell(runtimeTargetPosition ?? locationPosition ?? playerStatePosition);
    const requiresTarget = resolveSkillRequiresTarget(skill);
    if (!fallbackTargetPosition && warningCells.length === 0 && requiresTarget) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: location ? CombatRejectReason.TargetLocationMismatch : CombatRejectReason.MissingRuntimeTargetPosition,
        severity: 'debug',
        details: {
          locationInstanceId: location?.instanceId,
          playerInstanceId: targetRuntimeState?.instanceId,
        },
        warningCells,
        targetCollection: { targets: [], rejected: [] },
      };
    }
    const selfAnchoredPosition = !requiresTarget && monster
      ? { x: Math.trunc(Number(monster.x)), y: Math.trunc(Number(monster.y)) }
      : null;
    const distanceAnchor = hasAnchoredCast
      ? { x: Math.trunc(Number(action.targetX)), y: Math.trunc(Number(action.targetY)) }
      : selfAnchoredPosition ?? fallbackTargetPosition ?? warningCells[0] ?? null;
    if (requiresTarget && !distanceAnchor) {
      return {
        ok: false,
        action: combatAction,
        definition,
        reason: CombatRejectReason.MissingTargetLocation,
        severity: 'debug',
        details: {},
        warningCells,
        targetCollection: { targets: [], rejected: [] },
      };
    }
    const distance = requiresTarget
      ? combatChebyshevDistance(monster.x, monster.y, distanceAnchor.x, distanceAnchor.y)
      : 0;
    if (!requiresTarget && isCombatSelfOnlySkill(skill)) {
      const selfBuffTarget = playerRuntimeService?.getPlayer?.(action.targetPlayerId) ?? null;
      if (!selfBuffTarget || selfBuffTarget.hp <= 0) {
        return {
          ok: false,
          action: combatAction,
          definition,
          reason: selfBuffTarget ? CombatRejectReason.TargetDead : CombatRejectReason.MissingSelfBuffTarget,
          severity: 'debug',
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
    const targetCollection = self.collectMonsterSkillPlayerTargets({
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
    const validation = self.validateCombatTargets({
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

export function resolveMonsterSkillChantStartPlanImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
    const action = input.action ?? {};
    const instance = input.instance ?? null;
    const monster = input.monster ?? null;
    const skill = input.skill ?? null;
    const combatAction = self.createMonsterAction(action, CombatActionPhase.ChantStart);
    const definition = skill
      ? self.createSkillDefinition(combatAction, skill, {
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
        severity: 'debug',
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
        severity: 'debug',
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

export function revalidateMonsterSkillTargetForApplyImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
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

export function explainMonsterBasicAttackImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
    const action = input.action ?? {};
    const combatAction = self.createMonsterAction(action, CombatActionPhase.Instant);
    const targetResolution = self.resolveMonsterBasicAttackPlayerTarget(input);
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

export function recordMonsterActionRejectImpl(self: WorldRuntimeCombatActionService, deps, action, reason, details = {}, options = undefined) {
    const phase = action?.kind === 'skill_chant'
      ? CombatActionPhase.ChantStart
      : action?.kind === 'skill'
        ? CombatActionPhase.ChantResolve
        : action?.kind === 'skill_cancel'
          ? CombatActionPhase.Cancel
          : CombatActionPhase.Instant;
    const combatAction = self.createMonsterAction(action, phase);
    return self.recordReject(deps, {
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

export function recordMonsterActionOutcomeImpl(self: WorldRuntimeCombatActionService, deps, action, target, result: AnyRecord = {}, options = undefined) {
    const phase = action?.kind === 'skill'
      ? CombatActionPhase.ChantResolve
      : action?.kind === 'skill_chant'
        ? CombatActionPhase.ChantStart
        : CombatActionPhase.Instant;
    const combatAction = self.createMonsterAction(action, phase);
    return self.recordOutcome(deps, {
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
