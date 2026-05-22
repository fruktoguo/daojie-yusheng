/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import {
  cancelPendingCombatCast,
  CombatPendingCastCancelReason,
  CombatPendingCastStatus,
} from './pending-combat-cast.helpers';

type PendingCastRecord = Record<string, any>;
type PendingCastContext = Record<string, any>;

/** Redis 存储的 schema 版本号，升级时递增以拒绝旧版本记录。 */
const PENDING_CAST_REDIS_SCHEMA_VERSION = 1;
/** 默认 TTL（秒），用于 resolveTick 无法推算时的兜底。 */
const DEFAULT_PENDING_CAST_TTL_SECONDS = 30;
/** TTL 上限（秒），防止异常值导致 Redis key 长期残留。 */
const MAX_PENDING_CAST_TTL_SECONDS = 120;

/** 恢复拒绝原因枚举。 */
export const PendingCombatCastRestoreRejectReason = Object.freeze({
  EmptyRecord: 'empty_record',                     // Redis 中无记录
  InvalidRecord: 'invalid_record',                 // 记录格式无效
  SchemaVersionMismatch: 'schema_version_mismatch', // schema 版本不匹配
  ActorMismatch: 'actor_mismatch',                 // 施法者不匹配
  InstanceMismatch: 'instance_mismatch',           // 地图实例不匹配
  FencingMismatch: 'fencing_mismatch',             // 节点/租约 fencing 不匹配
  NotCasting: 'not_casting',                       // 状态不是 casting
  Expired: 'expired',                               // 已过期
  ActorDead: 'actor_dead',                         // 施法者已死亡
  ConfigRevisionMismatch: 'config_revision_mismatch', // 技能配置版本变更
});

/**
 * 构建 Redis key。
 * 格式：combat:pending-cast:{actorKind}:{actorId}
 */
export function buildPendingCombatCastRedisKey(input: PendingCastContext = {}) {
  const actorKind = normalizeString(input.actorKind ?? input.pendingCast?.actorKind);
  const actorId = normalizeString(input.actorId ?? input.pendingCast?.actorId);
  if (!actorKind || !actorId) {
    return null;
  }
  return `combat:pending-cast:${actorKind}:${actorId}`;
}

/**
 * 将吟唱状态序列化为 Redis 存储格式。
 * 返回 JSON 字符串、key、TTL 和字节长度，供调用方写入 Redis。
 * 不可恢复的 pending cast 会返回 ok: false。
 */
export function serializePendingCombatCastForRedis(pendingCast: PendingCastRecord = {}, context: PendingCastContext = {}) {
  if (!isRestorablePendingCast(pendingCast)) {
    return {
      ok: false,
      reason: PendingCombatCastRestoreRejectReason.InvalidRecord,
      record: null,
      json: null,
      key: null,
      ttlSeconds: 0,
      byteLength: 0,
    };
  }
  const currentTick = normalizeNonNegativeInteger(context.currentTick ?? pendingCast.startedTick);
  const resolveTick = normalizeNonNegativeInteger(pendingCast.resolveTick);
  const ttlSeconds = normalizePendingCastTtlSeconds(context.ttlSeconds, currentTick, resolveTick);
  const record = {
    schemaVersion: PENDING_CAST_REDIS_SCHEMA_VERSION,
    savedAtTick: currentTick,
    expiresAtTick: resolveTick,
    ttlSeconds,
    fencing: {
      ownerNodeId: normalizeString(context.ownerNodeId),
      leaseToken: normalizeString(context.leaseToken),
      instanceId: normalizeString(context.instanceId ?? pendingCast.instanceId),
      actorKind: normalizeString(pendingCast.actorKind),
      actorId: normalizeString(pendingCast.actorId),
    },
    pendingCast: normalizePendingCastSnapshot(pendingCast),
  };
  const json = JSON.stringify(record);
  return {
    ok: true,
    record,
    json,
    key: buildPendingCombatCastRedisKey({ pendingCast }),
    ttlSeconds,
    byteLength: Buffer.byteLength(json, 'utf8'),
  };
}

/**
 * 从 Redis 记录恢复吟唱状态。
 * 依次校验：schema 版本 → 记录有效性 → 状态 → actor → instance → fencing → 过期 → 死亡 → 配置版本。
 * 返回 ok: true 时包含可用的 pendingCast，否则包含拒绝原因和可能的 cancelAction。
 */
export function restorePendingCombatCastFromRedis(recordOrJson: unknown, context: PendingCastContext = {}) {
  const record = parsePendingCastRecord(recordOrJson);
  if (!record) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.EmptyRecord, null);
  }
  if (record.schemaVersion !== PENDING_CAST_REDIS_SCHEMA_VERSION) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.SchemaVersionMismatch, record);
  }
  const pendingCast = record.pendingCast;
  if (!isRestorablePendingCast(pendingCast)) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.InvalidRecord, record);
  }
  if (pendingCast.status !== CombatPendingCastStatus.Casting) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.NotCasting, record);
  }
  // actor 匹配校验
  const expectedActorKind = normalizeString(context.actorKind);
  const expectedActorId = normalizeString(context.actorId);
  if ((expectedActorKind && expectedActorKind !== pendingCast.actorKind)
    || (expectedActorId && expectedActorId !== pendingCast.actorId)) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.ActorMismatch, record);
  }
  // 地图实例匹配校验
  const expectedInstanceId = normalizeString(context.instanceId);
  if (expectedInstanceId && expectedInstanceId !== pendingCast.instanceId) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.InstanceMismatch, record);
  }
  // fencing 校验（防止跨节点误恢复）
  const fencing = record.fencing ?? {};
  const expectedOwnerNodeId = normalizeString(context.ownerNodeId);
  const expectedLeaseToken = normalizeString(context.leaseToken);
  if ((expectedOwnerNodeId && normalizeString(fencing.ownerNodeId) !== expectedOwnerNodeId)
    || (expectedLeaseToken && normalizeString(fencing.leaseToken) !== expectedLeaseToken)) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.FencingMismatch, record, { deleteRedisKey: false });
  }
  // 过期校验
  const currentTick = normalizeOptionalInteger(context.currentTick);
  const resolveTick = normalizeOptionalInteger(pendingCast.resolveTick);
  if (currentTick !== null && resolveTick !== null && currentTick > resolveTick) {
    return createRestoreCancellation(record, pendingCast, PendingCombatCastRestoreRejectReason.Expired, {
      reason: CombatPendingCastCancelReason.Expired,
      cancelledTick: currentTick,
      message: 'redis_pending_cast_expired',
    });
  }
  // 施法者死亡校验
  if (context.actorAlive === false) {
    return createRestoreCancellation(record, pendingCast, PendingCombatCastRestoreRejectReason.ActorDead, {
      reason: CombatPendingCastCancelReason.ActorDead,
      cancelledTick: currentTick,
      message: 'redis_pending_cast_actor_dead',
    });
  }
  // 配置版本校验
  const expectedConfigRevision = normalizeOptionalInteger(context.configRevision);
  const pendingConfigRevision = normalizeOptionalInteger(pendingCast.configRevision);
  if (expectedConfigRevision !== null && pendingConfigRevision !== null && expectedConfigRevision !== pendingConfigRevision) {
    return createRestoreCancellation(record, pendingCast, PendingCombatCastRestoreRejectReason.ConfigRevisionMismatch, {
      reason: CombatPendingCastCancelReason.ConfigRevisionMismatch,
      cancelledTick: currentTick,
      message: 'redis_pending_cast_config_revision_mismatch',
    });
  }
  // 恢复成功
  return {
    ok: true,
    pendingCast,
    record,
    key: buildPendingCombatCastRedisKey({ pendingCast }),
    reason: null,
    cancelAction: null,
    deleteRedisKey: false,
  };
}

// ─── 内部工具函数 ───

/** 创建恢复拒绝结果（无 cancelAction）。 */
function createRestoreReject(reason: string, record: PendingCastRecord | null, options: PendingCastContext = {}) {
  return {
    ok: false,
    reason,
    record,
    pendingCast: null,
    cancelAction: null,
    deleteRedisKey: options.deleteRedisKey === false ? false : true,
  };
}

/** 创建恢复拒绝结果（带 cancelAction，用于需要产出取消 action 的场景）。 */
function createRestoreCancellation(record: PendingCastRecord, pendingCast: PendingCastRecord, reason: string, cancelInput: PendingCastContext) {
  return {
    ok: false,
    reason,
    record,
    pendingCast: null,
    cancelAction: cancelPendingCombatCast(pendingCast, cancelInput),
    deleteRedisKey: true,
  };
}

/** 解析 Redis 记录（支持 JSON 字符串或对象）。 */
function parsePendingCastRecord(recordOrJson: unknown): PendingCastRecord | null {
  if (!recordOrJson) {
    return null;
  }
  if (typeof recordOrJson === 'string') {
    try {
      const parsed = JSON.parse(recordOrJson);
      return parsed && typeof parsed === 'object' ? parsed : null;
    }
    catch {
      return null;
    }
  }
  return typeof recordOrJson === 'object' ? recordOrJson : null;
}

/** 规范化 pending cast 快照，确保所有字段有安全默认值。 */
function normalizePendingCastSnapshot(pendingCast: PendingCastRecord = {}) {
  return {
    kind: 'combat_pending_cast',
    status: CombatPendingCastStatus.Casting,
    actorKind: normalizeString(pendingCast.actorKind),
    actorId: normalizeString(pendingCast.actorId),
    source: normalizeString(pendingCast.source),
    actionKind: normalizeString(pendingCast.actionKind),
    actionId: normalizeString(pendingCast.actionId ?? pendingCast.skillId),
    instanceId: normalizeString(pendingCast.instanceId),
    anchor: normalizeAnchor(pendingCast.anchor ?? { x: pendingCast.targetX, y: pendingCast.targetY }),
    targetRef: normalizeString(pendingCast.targetRef),
    targetPlayerId: normalizeString(pendingCast.targetPlayerId),
    warningCells: normalizeCells(pendingCast.warningCells),
    warningColor: normalizeString(pendingCast.warningColor),
    warningOrigin: normalizeAnchor(pendingCast.warningOrigin),
    startedTick: normalizeNonNegativeInteger(pendingCast.startedTick),
    resolveTick: normalizeNonNegativeInteger(pendingCast.resolveTick),
    remainingTicks: normalizeNonNegativeInteger(pendingCast.remainingTicks),
    cancelConditions: Array.isArray(pendingCast.cancelConditions) ? [...pendingCast.cancelConditions] : ['actor_dead'],
    committedResourceSnapshot: pendingCast.committedResourceSnapshot ?? null,
    committedCooldownSnapshot: pendingCast.committedCooldownSnapshot ?? null,
    configRevision: normalizeOptionalInteger(pendingCast.configRevision),
    legacy: pendingCast.legacy ?? null,
    skillId: normalizeString(pendingCast.skillId ?? pendingCast.actionId),
    targetX: normalizeOptionalInteger(pendingCast.targetX ?? pendingCast.anchor?.x),
    targetY: normalizeOptionalInteger(pendingCast.targetY ?? pendingCast.anchor?.y),
    qiCost: Math.max(0, Math.round(Number(pendingCast.qiCost) || 0)),
    skipProgressThisTick: pendingCast.skipProgressThisTick === true,
  };
}

/** 判断 pending cast 是否具备恢复所需的最小字段。 */
function isRestorablePendingCast(pendingCast: any) {
  return pendingCast
    && pendingCast.kind === 'combat_pending_cast'
    && normalizeString(pendingCast.actorKind)
    && normalizeString(pendingCast.actorId)
    && normalizeString(pendingCast.instanceId)
    && normalizeString(pendingCast.actionId ?? pendingCast.skillId);
}

/**
 * 计算 Redis TTL。
 * 优先使用显式传入值，否则基于剩余 tick 数 + 安全余量计算。
 * 上限 MAX_PENDING_CAST_TTL_SECONDS，下限 DEFAULT_PENDING_CAST_TTL_SECONDS。
 */
function normalizePendingCastTtlSeconds(inputTtlSeconds: unknown, currentTick: unknown, resolveTick: unknown) {
  if (Number.isFinite(Number(inputTtlSeconds)) && Number(inputTtlSeconds) > 0) {
    return Math.min(MAX_PENDING_CAST_TTL_SECONDS, Math.max(1, Math.ceil(Number(inputTtlSeconds))));
  }
  const remainingTicks = Math.max(0, normalizeNonNegativeInteger(resolveTick) - normalizeNonNegativeInteger(currentTick));
  return Math.min(
    MAX_PENDING_CAST_TTL_SECONDS,
    Math.max(DEFAULT_PENDING_CAST_TTL_SECONDS, remainingTicks + DEFAULT_PENDING_CAST_TTL_SECONDS),
  );
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
