// @ts-nocheck

import {
  CombatActionKind,
  CombatActionPhase,
  CombatActionSource,
  CombatActorKind,
  CombatTargetKind,
  createCombatAction,
} from '../world/combat-action.types';

export const CombatPendingCastStatus = Object.freeze({
  Casting: 'casting',
  Resolving: 'resolving',
  Cancelled: 'cancelled',
});

export const CombatPendingCastCancelReason = Object.freeze({
  ActorDead: 'actor_dead',
  Interrupted: 'interrupted',
  Expired: 'expired',
  TargetInvalid: 'target_invalid',
  ConfigRevisionMismatch: 'config_revision_mismatch',
  InstanceTransfer: 'instance_transfer',
  ServerRestart: 'server_restart',
});

export function createPlayerPendingCombatCast(input = {}) {
  const anchor = normalizeAnchor(input.anchor ?? { x: input.targetX, y: input.targetY });
  const targetRef = normalizeString(input.targetRef);
  const remainingTicks = normalizeNonNegativeInteger(input.remainingTicks);
  const startedTick = normalizeNonNegativeInteger(input.startedTick);
  return {
    kind: 'combat_pending_cast',
    status: CombatPendingCastStatus.Casting,
    actorKind: CombatActorKind.Player,
    actorId: normalizeString(input.playerId),
    source: input.source ?? CombatActionSource.PlayerInput,
    actionKind: CombatActionKind.Skill,
    actionId: normalizeString(input.skillId),
    instanceId: normalizeString(input.instanceId),
    anchor,
    targetRef,
    warningCells: normalizeCells(input.warningCells),
    warningColor: input.warningColor,
    warningOrigin: normalizeAnchor(input.warningOrigin),
    startedTick,
    resolveTick: normalizeResolveTick(input.resolveTick, startedTick, remainingTicks),
    remainingTicks,
    cancelConditions: normalizeCancelConditions(input.cancelConditions),
    committedResourceSnapshot: input.committedResourceSnapshot ?? (
      Number.isFinite(Number(input.qiCost))
        ? { kind: 'qi', spent: Math.max(0, Math.round(Number(input.qiCost) || 0)) }
        : null
    ),
    committedCooldownSnapshot: input.committedCooldownSnapshot ?? null,
    configRevision: normalizeOptionalInteger(input.configRevision),
    legacy: input.legacy ?? null,

    skillId: normalizeString(input.skillId),
    targetX: anchor?.x,
    targetY: anchor?.y,
    targetRef,
    qiCost: Math.max(0, Math.round(Number(input.qiCost) || 0)),
    warningColor: input.warningColor,
    skipProgressThisTick: input.skipProgressThisTick === true,
  };
}

export function createMonsterPendingCombatCast(input = {}) {
  const anchor = normalizeAnchor(input.anchor ?? { x: input.targetX, y: input.targetY });
  const targetPlayerId = normalizeString(input.targetPlayerId);
  const remainingTicks = normalizeNonNegativeInteger(input.remainingTicks);
  const startedTick = normalizeNonNegativeInteger(input.startedTick);
  return {
    kind: 'combat_pending_cast',
    status: CombatPendingCastStatus.Casting,
    actorKind: CombatActorKind.Monster,
    actorId: normalizeString(input.runtimeId),
    source: input.source ?? CombatActionSource.MonsterAi,
    actionKind: CombatActionKind.Skill,
    actionId: normalizeString(input.skillId),
    instanceId: normalizeString(input.instanceId),
    anchor,
    targetRef: targetPlayerId ? (targetPlayerId.startsWith('player:') ? targetPlayerId : `player:${targetPlayerId}`) : null,
    targetPlayerId,
    warningCells: normalizeCells(input.warningCells),
    warningColor: input.warningColor,
    warningOrigin: normalizeAnchor(input.warningOrigin),
    startedTick,
    resolveTick: normalizeResolveTick(input.resolveTick, startedTick, remainingTicks),
    remainingTicks,
    cancelConditions: normalizeCancelConditions(input.cancelConditions),
    committedResourceSnapshot: input.committedResourceSnapshot ?? null,
    committedCooldownSnapshot: input.committedCooldownSnapshot ?? null,
    configRevision: normalizeOptionalInteger(input.configRevision),
    legacy: input.legacy ?? null,

    skillId: normalizeString(input.skillId),
    targetX: anchor?.x,
    targetY: anchor?.y,
  };
}

export function createCombatActionFromPendingCast(pendingCast = {}, overrides = {}) {
  const target = resolvePendingCastTarget(pendingCast, overrides);
  const anchor = normalizeAnchor(overrides.anchor ?? pendingCast.anchor ?? {
    x: pendingCast.targetX,
    y: pendingCast.targetY,
  });
  return createCombatAction({
    actor: {
      kind: overrides.actorKind ?? pendingCast.actorKind ?? null,
      id: overrides.actorId ?? pendingCast.actorId ?? null,
    },
    actionId: overrides.actionId ?? pendingCast.actionId ?? pendingCast.skillId ?? null,
    kind: overrides.actionKind ?? pendingCast.actionKind ?? CombatActionKind.Skill,
    source: overrides.source ?? pendingCast.source ?? CombatActionSource.System,
    phase: overrides.phase ?? CombatActionPhase.ChantResolve,
    instanceId: overrides.instanceId ?? pendingCast.instanceId ?? null,
    target,
    anchor,
    warningCells: overrides.warningCells ?? pendingCast.warningCells,
    raw: pendingCast,
  });
}

export function createMonsterSkillActionFromPendingCast(pendingCast = {}, overrides = {}) {
  const combatAction = createCombatActionFromPendingCast(pendingCast, {
    ...overrides,
    actorKind: CombatActorKind.Monster,
    actionKind: CombatActionKind.Skill,
    source: CombatActionSource.MonsterAi,
    phase: overrides.phase ?? CombatActionPhase.ChantResolve,
  });
  return {
    instanceId: overrides.instanceId ?? pendingCast.instanceId ?? null,
    runtimeId: overrides.runtimeId ?? pendingCast.actorId ?? null,
    targetPlayerId: overrides.targetPlayerId ?? pendingCast.targetPlayerId ?? null,
    kind: 'skill',
    skillId: overrides.skillId ?? pendingCast.actionId ?? pendingCast.skillId ?? null,
    targetX: combatAction.anchor?.x,
    targetY: combatAction.anchor?.y,
    warningCells: normalizeCells(overrides.warningCells ?? pendingCast.warningCells),
    combatAction,
  };
}

export function createMonsterSkillCancelActionFromPendingCast(pendingCast = {}, overrides = {}) {
  const combatAction = createCombatActionFromPendingCast(pendingCast, {
    ...overrides,
    actorKind: CombatActorKind.Monster,
    actionKind: CombatActionKind.SkillCancel,
    source: CombatActionSource.MonsterAi,
    phase: CombatActionPhase.Cancel,
  });
  return {
    instanceId: overrides.instanceId ?? pendingCast.instanceId ?? null,
    runtimeId: overrides.runtimeId ?? pendingCast.actorId ?? null,
    targetPlayerId: overrides.targetPlayerId ?? pendingCast.targetPlayerId ?? null,
    kind: 'skill_cancel',
    skillId: overrides.skillId ?? pendingCast.actionId ?? pendingCast.skillId ?? null,
    targetX: combatAction.anchor?.x,
    targetY: combatAction.anchor?.y,
    warningCells: normalizeCells(overrides.warningCells ?? pendingCast.warningCells),
    cancelReason: overrides.cancelReason ?? pendingCast.cancelReason ?? pendingCast.cancellation?.reason ?? null,
    cancelMessage: overrides.cancelMessage ?? pendingCast.cancelMessage ?? pendingCast.cancellation?.message ?? null,
    cancelledTick: overrides.cancelledTick ?? pendingCast.cancelledTick ?? pendingCast.cancellation?.cancelledTick ?? null,
    combatAction,
  };
}

export function createPlayerSkillActionFromPendingCast(pendingCast = {}, overrides = {}) {
  return createCombatActionFromPendingCast(pendingCast, {
    ...overrides,
    actorKind: CombatActorKind.Player,
    actionKind: CombatActionKind.Skill,
    source: pendingCast.source ?? CombatActionSource.PlayerInput,
    phase: overrides.phase ?? CombatActionPhase.ChantResolve,
  });
}

export function cancelPendingCombatCast(pendingCast = {}, input = {}) {
  const reason = normalizeString(input.reason) ?? CombatPendingCastCancelReason.Interrupted;
  const cancelledTick = normalizeOptionalInteger(input.cancelledTick);
  return {
    ...pendingCast,
    status: CombatPendingCastStatus.Cancelled,
    remainingTicks: 0,
    cancelReason: reason,
    cancelledTick,
    cancelMessage: normalizeString(input.message),
    cancellation: {
      reason,
      cancelledTick,
      message: normalizeString(input.message),
      resourcePolicy: normalizeString(input.resourcePolicy) ?? 'committed_no_refund',
      cooldownPolicy: normalizeString(input.cooldownPolicy) ?? 'committed_no_rollback',
    },
  };
}

export function resolvePendingCombatCastCancellation(pendingCast = {}, input = {}) {
  if (!pendingCast || pendingCast.kind !== 'combat_pending_cast') {
    return null;
  }
  if (input.actorAlive === false) {
    return cancelPendingCombatCast(pendingCast, {
      ...input,
      reason: CombatPendingCastCancelReason.ActorDead,
    });
  }
  const currentTick = normalizeOptionalInteger(input.currentTick);
  const resolveTick = normalizeOptionalInteger(pendingCast.resolveTick);
  if (currentTick !== null && resolveTick !== null && currentTick > resolveTick && Math.max(0, Math.trunc(Number(pendingCast.remainingTicks) || 0)) > 0) {
    return cancelPendingCombatCast(pendingCast, {
      ...input,
      reason: CombatPendingCastCancelReason.Expired,
    });
  }
  const expectedConfigRevision = normalizeOptionalInteger(input.configRevision);
  const pendingConfigRevision = normalizeOptionalInteger(pendingCast.configRevision);
  if (expectedConfigRevision !== null && pendingConfigRevision !== null && expectedConfigRevision !== pendingConfigRevision) {
    return cancelPendingCombatCast(pendingCast, {
      ...input,
      reason: CombatPendingCastCancelReason.ConfigRevisionMismatch,
    });
  }
  return null;
}

function resolvePendingCastTarget(pendingCast, overrides = {}) {
  if (overrides.target) {
    return overrides.target;
  }
  const targetRef = normalizeString(overrides.targetRef ?? pendingCast.targetRef);
  const targetPlayerId = normalizeString(overrides.targetPlayerId ?? pendingCast.targetPlayerId);
  if (targetPlayerId) {
    return { kind: CombatTargetKind.Player, id: targetPlayerId };
  }
  if (targetRef?.startsWith('player:')) {
    return { kind: CombatTargetKind.Player, id: targetRef.slice('player:'.length) };
  }
  if (targetRef?.startsWith('monster:')) {
    return { kind: CombatTargetKind.Monster, id: targetRef.slice('monster:'.length) };
  }
  if (targetRef === 'self') {
    return { kind: CombatTargetKind.Self, id: pendingCast.actorId ?? null };
  }
  return null;
}

function normalizeResolveTick(value, startedTick, remainingTicks) {
  if (Number.isFinite(Number(value))) {
    return normalizeNonNegativeInteger(value);
  }
  return normalizeNonNegativeInteger(startedTick) + normalizeNonNegativeInteger(remainingTicks);
}

function normalizeCancelConditions(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
  }
  return ['actor_dead'];
}

function normalizeCells(cells) {
  if (!Array.isArray(cells)) {
    return [];
  }
  const normalized = [];
  for (const cell of cells) {
    const anchor = normalizeAnchor(cell);
    if (anchor) {
      normalized.push(anchor);
    }
  }
  return normalized;
}

function normalizeAnchor(value) {
  const x = Math.trunc(Number(value?.x));
  const y = Math.trunc(Number(value?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalInteger(value) {
  if (!Number.isFinite(Number(value))) {
    return null;
  }
  return Math.trunc(Number(value));
}

function normalizeNonNegativeInteger(value) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}
