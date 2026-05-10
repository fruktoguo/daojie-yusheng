import {
  cancelPendingCombatCast,
  CombatPendingCastCancelReason,
  CombatPendingCastStatus,
} from './pending-combat-cast.helpers';

type PendingCastRecord = Record<string, any>;
type PendingCastContext = Record<string, any>;

const PENDING_CAST_REDIS_SCHEMA_VERSION = 1;
const DEFAULT_PENDING_CAST_TTL_SECONDS = 30;
const MAX_PENDING_CAST_TTL_SECONDS = 120;

export const PendingCombatCastRestoreRejectReason = Object.freeze({
  EmptyRecord: 'empty_record',
  InvalidRecord: 'invalid_record',
  SchemaVersionMismatch: 'schema_version_mismatch',
  ActorMismatch: 'actor_mismatch',
  InstanceMismatch: 'instance_mismatch',
  FencingMismatch: 'fencing_mismatch',
  NotCasting: 'not_casting',
  Expired: 'expired',
  ActorDead: 'actor_dead',
  ConfigRevisionMismatch: 'config_revision_mismatch',
});

export function buildPendingCombatCastRedisKey(input: PendingCastContext = {}) {
  const actorKind = normalizeString(input.actorKind ?? input.pendingCast?.actorKind);
  const actorId = normalizeString(input.actorId ?? input.pendingCast?.actorId);
  if (!actorKind || !actorId) {
    return null;
  }
  return `combat:pending-cast:${actorKind}:${actorId}`;
}

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
  const expectedActorKind = normalizeString(context.actorKind);
  const expectedActorId = normalizeString(context.actorId);
  if ((expectedActorKind && expectedActorKind !== pendingCast.actorKind)
    || (expectedActorId && expectedActorId !== pendingCast.actorId)) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.ActorMismatch, record);
  }
  const expectedInstanceId = normalizeString(context.instanceId);
  if (expectedInstanceId && expectedInstanceId !== pendingCast.instanceId) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.InstanceMismatch, record);
  }
  const fencing = record.fencing ?? {};
  const expectedOwnerNodeId = normalizeString(context.ownerNodeId);
  const expectedLeaseToken = normalizeString(context.leaseToken);
  if ((expectedOwnerNodeId && normalizeString(fencing.ownerNodeId) !== expectedOwnerNodeId)
    || (expectedLeaseToken && normalizeString(fencing.leaseToken) !== expectedLeaseToken)) {
    return createRestoreReject(PendingCombatCastRestoreRejectReason.FencingMismatch, record, { deleteRedisKey: false });
  }
  const currentTick = normalizeOptionalInteger(context.currentTick);
  const resolveTick = normalizeOptionalInteger(pendingCast.resolveTick);
  if (currentTick !== null && resolveTick !== null && currentTick > resolveTick) {
    return createRestoreCancellation(record, pendingCast, PendingCombatCastRestoreRejectReason.Expired, {
      reason: CombatPendingCastCancelReason.Expired,
      cancelledTick: currentTick,
      message: 'redis_pending_cast_expired',
    });
  }
  if (context.actorAlive === false) {
    return createRestoreCancellation(record, pendingCast, PendingCombatCastRestoreRejectReason.ActorDead, {
      reason: CombatPendingCastCancelReason.ActorDead,
      cancelledTick: currentTick,
      message: 'redis_pending_cast_actor_dead',
    });
  }
  const expectedConfigRevision = normalizeOptionalInteger(context.configRevision);
  const pendingConfigRevision = normalizeOptionalInteger(pendingCast.configRevision);
  if (expectedConfigRevision !== null && pendingConfigRevision !== null && expectedConfigRevision !== pendingConfigRevision) {
    return createRestoreCancellation(record, pendingCast, PendingCombatCastRestoreRejectReason.ConfigRevisionMismatch, {
      reason: CombatPendingCastCancelReason.ConfigRevisionMismatch,
      cancelledTick: currentTick,
      message: 'redis_pending_cast_config_revision_mismatch',
    });
  }
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

function isRestorablePendingCast(pendingCast: any) {
  return pendingCast
    && pendingCast.kind === 'combat_pending_cast'
    && normalizeString(pendingCast.actorKind)
    && normalizeString(pendingCast.actorId)
    && normalizeString(pendingCast.instanceId)
    && normalizeString(pendingCast.actionId ?? pendingCast.skillId);
}

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

function normalizeAnchor(value: any) {
  const x = Math.trunc(Number(value?.x));
  const y = Math.trunc(Number(value?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalInteger(value: unknown) {
  if (!Number.isFinite(Number(value))) {
    return null;
  }
  return Math.trunc(Number(value));
}

function normalizeNonNegativeInteger(value: unknown) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}
