// @ts-nocheck

import { CombatTargetKind } from '../world/combat-action.types';

export function createCombatOutcomeApplyAdapters(handlers = {}) {
  return {
    player: createPlayerOutcomeApplyAdapter(handlers),
    self: createPlayerOutcomeApplyAdapter(handlers),
    monster: createMonsterOutcomeApplyAdapter(handlers),
    tile: createTileOutcomeApplyAdapter(handlers),
    formation: createFormationOutcomeApplyAdapter(handlers),
    container: createContainerOutcomeApplyAdapter(handlers),
  };
}

export function createPlayerOutcomeApplyAdapter(handlers = {}) {
  return ({ outcome, target, result, application, deps }) => {
    const targetPlayerId = target?.id ?? result?.targetPlayerId ?? null;
    const damage = normalizeDamage(result);
    if (targetPlayerId && result?.retaliatePlayerTargetId) {
      callFirstDefined([
        () => handlers.setRetaliatePlayerTarget?.({ playerId: targetPlayerId, targetPlayerId: result.retaliatePlayerTargetId, outcome, result, application, deps }),
        () => deps?.playerRuntimeService?.setRetaliatePlayerTarget?.(targetPlayerId, result.retaliatePlayerTargetId, deps?.currentTick ?? deps?.tick ?? 0),
      ]);
    }
    const appliedDamageResult = targetPlayerId && damage > 0
      ? callFirstDefined([
        () => handlers.applyPlayerDamage?.({ playerId: targetPlayerId, damage, outcome, result, application, deps }),
        () => deps?.playerRuntimeService?.applyDamage?.(targetPlayerId, damage, outcome?.actor?.id),
        () => deps?.applyPlayerDamage?.(targetPlayerId, damage, outcome, result),
      ])
      : 0;
    const appliedDamage = damage > 0
      ? normalizeAppliedDamage(appliedDamageResult, damage)
      : 0;
    if (targetPlayerId && result?.buff) {
      callFirstDefined([
        () => handlers.applyPlayerBuff?.({ playerId: targetPlayerId, buff: result.buff, outcome, result, application, deps }),
        () => deps?.playerRuntimeService?.applyTemporaryBuff?.(targetPlayerId, result.buff),
      ]);
    }
    if (targetPlayerId && result?.recordActivity !== false) {
      callFirstDefined([
        () => handlers.recordPlayerActivity?.({ playerId: targetPlayerId, outcome, result, application, deps }),
        () => deps?.playerRuntimeService?.recordActivity?.(targetPlayerId, deps?.currentTick, { interruptCultivation: true }),
      ]);
    }
    if (targetPlayerId && result?.autoRetaliate === true) {
      callFirstDefined([
        () => handlers.activateAutoRetaliate?.({ playerId: targetPlayerId, outcome, result, application, deps }),
        () => deps?.playerRuntimeService?.activateAutoRetaliate?.(targetPlayerId, deps?.currentTick),
      ]);
    }
    let handledDefeat = false;
    if (targetPlayerId && result?.defeated === true && result?.applyDefeat !== false) {
      const defeatResult = callFirstDefined([
        () => handlers.handlePlayerDefeat?.({ playerId: targetPlayerId, attackerId: outcome?.actor?.id, outcome, result, application, deps }),
        () => deps?.handlePlayerDefeat?.(targetPlayerId, result.attackerPlayerId ?? outcome?.actor?.id),
      ]);
      handledDefeat = defeatResult !== null && defeatResult !== undefined;
    }
    return {
      ok: true,
      targetKind: target?.kind ?? CombatTargetKind.Player,
      targetPlayerId,
      appliedDamage,
      handledDefeat,
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

export function createMonsterOutcomeApplyAdapter(handlers = {}) {
  return ({ outcome, target, result, application, deps }) => {
    const targetMonsterId = target?.id ?? result?.targetMonsterId ?? null;
    const damage = normalizeDamage(result);
    const instance = resolveInstance(deps, outcome?.instanceId);
    const applied = targetMonsterId && damage >= 0
      ? callFirstDefined([
        () => handlers.applyMonsterDamage?.({ runtimeId: targetMonsterId, damage, attackerId: outcome?.actor?.id, outcome, result, application, deps, instance }),
        () => instance?.applyDamageToMonster?.(targetMonsterId, damage, outcome?.actor?.id),
      ])
      : null;
    if (targetMonsterId && result?.buff) {
      callFirstDefined([
        () => handlers.applyMonsterBuff?.({ runtimeId: targetMonsterId, buff: result.buff, outcome, result, application, deps, instance }),
        () => instance?.applyTemporaryBuffToMonster?.(targetMonsterId, result.buff),
      ]);
    }
    const defeated = result?.defeated === true || applied?.defeated === true;
    if (targetMonsterId && defeated) {
      callFirstDefined([
        () => handlers.handleMonsterDefeat?.({ runtimeId: targetMonsterId, attackerId: outcome?.actor?.id, outcome, result, application, deps, instance, applied }),
        () => deps?.handlePlayerMonsterKill?.(instance, applied?.monster, outcome?.actor?.id),
      ]);
    }
    return {
      ok: true,
      targetKind: CombatTargetKind.Monster,
      targetMonsterId,
      monster: applied?.monster ?? null,
      appliedDamage: normalizeAppliedDamage(applied?.appliedDamage, damage),
      defeated,
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

export function createTileOutcomeApplyAdapter(handlers = {}) {
  return ({ outcome, target, result, application, deps }) => {
    const x = normalizeCoordinate(target?.x ?? result?.targetX);
    const y = normalizeCoordinate(target?.y ?? result?.targetY);
    const damage = normalizeDamage(result);
    const instance = resolveInstance(deps, outcome?.instanceId);
    const applied = x !== null && y !== null && damage > 0
      ? callFirstDefined([
        () => handlers.applyTileDamage?.({ x, y, damage, outcome, result, application, deps, instance }),
        () => instance?.damageTile?.(x, y, damage),
      ])
      : null;
    if (applied?.destroyed === true) {
      callFirstDefined([
        () => handlers.handleTileDestroyed?.({ x, y, outcome, result, application, deps, instance, applied }),
        () => deps?.worldRuntimeSectService?.expandSectForDestroyedTile?.(outcome?.instanceId, x, y, deps),
      ]);
    }
    return {
      ok: true,
      targetKind: CombatTargetKind.Tile,
      x,
      y,
      appliedDamage: normalizeAppliedDamage(applied?.appliedDamage, damage),
      destroyed: applied?.destroyed === true || result?.destroyed === true,
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

export function createFormationOutcomeApplyAdapter(handlers = {}) {
  return ({ outcome, target, result, application, deps }) => {
    const targetId = target?.id ?? result?.targetId ?? null;
    const x = normalizeCoordinate(target?.x ?? result?.targetX);
    const y = normalizeCoordinate(target?.y ?? result?.targetY);
    const damage = normalizeDamage(result);
    const formationService = deps?.worldRuntimeFormationService;
    const applied = damage > 0
      ? (result?.targetType === 'formation_boundary' || result?.formationBoundary === true
        ? callFirstDefined([
          () => handlers.applyFormationBoundaryDamage?.({ formationId: targetId, x, y, damage, outcome, result, application, deps }),
          () => formationService?.applyDamageToBoundaryBarrier?.(outcome?.instanceId, x, y, damage, outcome?.actor?.id, deps),
        ])
        : callFirstDefined([
          () => handlers.applyFormationDamage?.({ formationId: targetId, damage, outcome, result, application, deps }),
          () => formationService?.applyDamageToFormation?.(outcome?.instanceId, targetId, damage, outcome?.actor?.id, deps),
        ]))
      : null;
    return {
      ok: true,
      targetKind: CombatTargetKind.Formation,
      targetId,
      x,
      y,
      appliedDamage: normalizeAppliedDamage(applied?.appliedDamage, damage),
      auraDamage: normalizeNumber(applied?.auraDamage ?? result?.auraDamage),
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

export function createContainerOutcomeApplyAdapter(handlers = {}) {
  return ({ outcome, target, result, application, deps }) => {
    const targetId = target?.id ?? result?.targetId ?? null;
    const x = normalizeCoordinate(target?.x ?? result?.targetX);
    const y = normalizeCoordinate(target?.y ?? result?.targetY);
    const damage = normalizeDamage(result);
    const instance = resolveInstance(deps, outcome?.instanceId);
    const container = result?.container ?? target?.runtime ?? (x !== null && y !== null ? instance?.getContainerAtTile?.(x, y) : null);
    const currentTick = result?.currentTick ?? deps?.currentTick ?? deps?.tick ?? 0;
    const applied = callFirstDefined([
      () => handlers.applyContainerDamage?.({ targetId, x, y, damage, container, currentTick, outcome, result, application, deps, instance }),
      () => container ? deps?.worldRuntimeLootContainerService?.damageAttackableContainerAtTile?.(outcome?.instanceId, container, currentTick) : null,
      () => container ? deps?.worldRuntimeLootContainerService?.damageHerbContainerAtTile?.(outcome?.instanceId, container, currentTick) : null,
      () => deps?.damageContainerAtTile?.(outcome?.instanceId, x, y, damage, outcome?.actor?.id, currentTick),
    ]);
    if (!applied) {
      return {
        ok: false,
        targetKind: CombatTargetKind.Container,
        targetId,
        x,
        y,
        dirtyDomains: application?.dirtyDomains ?? [],
      };
    }
    return {
      ok: true,
      targetKind: CombatTargetKind.Container,
      targetId,
      x,
      y,
      title: applied?.title ?? result?.title ?? targetId,
      appliedDamage: normalizeAppliedDamage(applied?.appliedDamage, damage),
      remainingCount: normalizeNumber(applied?.remainingCount ?? result?.remainingCount),
      respawnRemainingTicks: applied?.respawnRemainingTicks ?? result?.respawnRemainingTicks,
      consumed: applied?.consumed === true || applied?.depleted === true || result?.consumed === true,
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

function resolveInstance(deps, instanceId) {
  if (deps?.instance) {
    return deps.instance;
  }
  if (typeof deps?.getInstanceRuntime === 'function') {
    return deps.getInstanceRuntime(instanceId);
  }
  if (typeof deps?.getInstanceRuntimeOrThrow === 'function') {
    return deps.getInstanceRuntimeOrThrow(instanceId);
  }
  return null;
}

function callFirstDefined(calls) {
  for (const call of calls) {
    const value = call?.();
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function normalizeDamage(result = {}) {
  return Math.max(0, Math.round(Number(result.damage ?? result.totalDamage ?? result.appliedDamage) || 0));
}

function normalizeAppliedDamage(value, fallback) {
  if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
    return Math.max(0, Math.round(Number(value)));
  }
  return Math.max(0, Math.round(Number(fallback) || 0));
}

function normalizeCoordinate(value) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
