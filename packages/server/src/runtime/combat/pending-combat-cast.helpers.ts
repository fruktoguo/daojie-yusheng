/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import {
  CombatActionKind,
  CombatActionPhase,
  CombatActionSource,
  CombatActorKind,
  CombatTargetKind,
  createCombatAction,
} from '../world/combat/combat-action.types';

type PendingCombatCastInput = Record<string, any>;

/** 吟唱状态枚举。 */
export const CombatPendingCastStatus = Object.freeze({
  Casting: 'casting',       // 正在吟唱
  Resolving: 'resolving',   // 吟唱完成，等待结算
  Cancelled: 'cancelled',   // 已取消
});

/** 吟唱取消原因枚举。 */
export const CombatPendingCastCancelReason = Object.freeze({
  ActorDead: 'actor_dead',                         // 施法者死亡
  Interrupted: 'interrupted',                       // 被打断（移动、受击等）
  Expired: 'expired',                               // 超时过期
  TargetInvalid: 'target_invalid',                  // 目标无效
  ConfigRevisionMismatch: 'config_revision_mismatch', // 技能配置版本变更
  InstanceTransfer: 'instance_transfer',            // 跨地图传送
  ServerRestart: 'server_restart',                  // 服务器重启
});

/**
 * 创建玩家吟唱状态对象。
 * 包含技能信息、目标锚点、预警区域、资源/冷却快照等。
 */
export function createPlayerPendingCombatCast(input: PendingCombatCastInput = {}) {
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

    // 兼容旧字段（部分消费方直接读这些）
    skillId: normalizeString(input.skillId),
    targetX: anchor?.x,
    targetY: anchor?.y,
    targetRef,
    qiCost: Math.max(0, Math.round(Number(input.qiCost) || 0)),
    skipProgressThisTick: input.skipProgressThisTick === true,
  };
}

/**
 * 创建怪物吟唱状态对象。
 * 与玩家版类似，但 actorKind 为 Monster，目标用 targetPlayerId 标识。
 */
export function createMonsterPendingCombatCast(input: PendingCombatCastInput = {}) {
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

/**
 * 从吟唱状态生成战斗 action（通用基础版本）。
 * 解析目标引用、锚点，组装为标准 CombatAction。
 */
export function createCombatActionFromPendingCast(pendingCast: PendingCombatCastInput = {}, overrides: PendingCombatCastInput = {}) {
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

/** 从怪物吟唱状态生成技能释放 action。 */
export function createMonsterSkillActionFromPendingCast(pendingCast: PendingCombatCastInput = {}, overrides: PendingCombatCastInput = {}) {
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

/** 从怪物吟唱状态生成技能取消 action（含取消原因和 tick）。 */
export function createMonsterSkillCancelActionFromPendingCast(pendingCast: PendingCombatCastInput = {}, overrides: PendingCombatCastInput = {}) {
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

/** 从玩家吟唱状态生成技能释放 action。 */
export function createPlayerSkillActionFromPendingCast(pendingCast: PendingCombatCastInput = {}, overrides: PendingCombatCastInput = {}) {
  return createCombatActionFromPendingCast(pendingCast, {
    ...overrides,
    actorKind: CombatActorKind.Player,
    actionKind: CombatActionKind.Skill,
    source: pendingCast.source ?? CombatActionSource.PlayerInput,
    phase: overrides.phase ?? CombatActionPhase.ChantResolve,
  });
}

/**
 * 执行吟唱取消，生成取消快照。
 * 包含取消原因、取消 tick、资源策略（不退还）和冷却策略（不回滚）。
 */
export function cancelPendingCombatCast(pendingCast: PendingCombatCastInput = {}, input: PendingCombatCastInput = {}) {
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

/**
 * 判定吟唱是否应被取消。
 * 检查顺序：施法者死亡 → 超时过期 → 配置版本不匹配。
 * 返回 null 表示不需要取消，否则返回取消后的快照。
 */
export function resolvePendingCombatCastCancellation(pendingCast: PendingCombatCastInput = {}, input: PendingCombatCastInput = {}) {
  if (!pendingCast || pendingCast.kind !== 'combat_pending_cast') {
    return null;
  }
  // 施法者死亡
  if (input.actorAlive === false) {
    return cancelPendingCombatCast(pendingCast, {
      ...input,
      reason: CombatPendingCastCancelReason.ActorDead,
    });
  }
  // 超时过期：currentTick > resolveTick 且 remainingTicks 还没减完
  const currentTick = normalizeOptionalInteger(input.currentTick);
  const resolveTick = normalizeOptionalInteger(pendingCast.resolveTick);
  if (currentTick !== null && resolveTick !== null && currentTick > resolveTick && Math.max(0, Math.trunc(Number(pendingCast.remainingTicks) || 0)) > 0) {
    return cancelPendingCombatCast(pendingCast, {
      ...input,
      reason: CombatPendingCastCancelReason.Expired,
    });
  }
  // 配置版本不匹配（技能热更后取消旧版吟唱）
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

// ─── 内部工具函数 ───

/** 从 pendingCast 和 overrides 中解析目标引用。 */
function resolvePendingCastTarget(pendingCast: PendingCombatCastInput, overrides: PendingCombatCastInput = {}) {
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

/** 计算 resolveTick：优先使用显式值，否则 startedTick + remainingTicks。 */
function normalizeResolveTick(value: unknown, startedTick: unknown, remainingTicks: unknown) {
  if (Number.isFinite(Number(value))) {
    return normalizeNonNegativeInteger(value);
  }
  return normalizeNonNegativeInteger(startedTick) + normalizeNonNegativeInteger(remainingTicks);
}

/** 规范化取消条件数组，默认包含 actor_dead。 */
function normalizeCancelConditions(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
  }
  return ['actor_dead'];
}

/** 规范化坐标数组为 {x, y}[]。 */
function normalizeCells(cells: unknown) {
  if (!Array.isArray(cells)) {
    return [];
  }
  const normalized: Array<{ x: number; y: number }> = [];
  for (const cell of cells) {
    const anchor = normalizeAnchor(cell);
    if (anchor) {
      normalized.push(anchor);
    }
  }
  return normalized;
}

/** 规范化坐标为 {x, y} 或 null。 */
function normalizeAnchor(value: any) {
  const x = Math.trunc(Number(value?.x));
  const y = Math.trunc(Number(value?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

/** 规范化字符串：空白或非字符串返回 null。 */
function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** 规范化可选整数：无效返回 null。 */
function normalizeOptionalInteger(value: unknown) {
  if (!Number.isFinite(Number(value))) {
    return null;
  }
  return Math.trunc(Number(value));
}

/** 规范化非负整数：无效或负数返回 0。 */
function normalizeNonNegativeInteger(value: unknown) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}
