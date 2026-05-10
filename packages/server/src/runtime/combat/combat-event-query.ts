// 战斗事件查询与聚合：用于运营分析、热力图、诊断
type CombatEventRecord = Record<string, any>;
type CombatEventQueryOptions = Record<string, any>;

export function queryRecentCombatAuditEvents(events: any[] = [], options: CombatEventQueryOptions = {}) {
  const limit = normalizeLimit(options.limit, 100);
  return flattenCombatEvents(events, 'auditEvent')
    .filter((event) => matchesInstance(event, options.instanceId))
    .filter((event) => matchesTimeRange(event, options))
    .filter((event) => matchesParticipant(event, options))
    .sort(compareCreatedAtDesc)
    .slice(0, limit);
}

export function aggregateCombatDiagnostics(events: any[] = [], options: CombatEventQueryOptions = {}) {
  const diagnostics = flattenCombatEvents(events, 'diagnosticEvent')
    .filter((event) => matchesInstance(event, options.instanceId))
    .filter((event) => matchesReason(event, options.reason))
    .filter((event) => matchesTimeRange(event, options));
  const buckets = new Map();
  for (const event of diagnostics) {
    const reason = normalizeString(event.reason) ?? 'unknown';
    const instanceId = normalizeString(event.instanceId) ?? 'unknown';
    const key = `${reason}\u0000${instanceId}`;
    const bucket = buckets.get(key) ?? {
      reason,
      instanceId,
      count: 0,
      firstAt: event.createdAt ?? null,
      lastAt: event.createdAt ?? null,
      severityCounts: {},
    };
    bucket.count += 1;
    if (compareCreatedAtAsc({ createdAt: event.createdAt }, { createdAt: bucket.firstAt }) < 0) {
      bucket.firstAt = event.createdAt ?? bucket.firstAt;
    }
    if (compareCreatedAtDesc({ createdAt: event.createdAt }, { createdAt: bucket.lastAt }) < 0) {
      bucket.lastAt = event.createdAt ?? bucket.lastAt;
    }
    const severity = normalizeString(event.severity) ?? 'debug';
    bucket.severityCounts[severity] = (bucket.severityCounts[severity] ?? 0) + 1;
    buckets.set(key, bucket);
  }
  return {
    total: diagnostics.length,
    buckets: Array.from(buckets.values()).sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
  };
}

export function queryMonsterSkillFailureReasons(events: any[] = [], options: CombatEventQueryOptions = {}) {
  return flattenCombatEvents(events, 'diagnosticEvent')
    .filter((event) => matchesInstance(event, options.instanceId))
    .filter((event) => matchesTimeRange(event, options))
    .filter((event) => {
      const actionId = normalizeString(options.actionId);
      if (actionId && event.actionId !== actionId) return false;
      const monsterRuntimeId = normalizeString(options.monsterRuntimeId);
      if (!monsterRuntimeId) return true;
      return readActorId(event.actor) === monsterRuntimeId;
    })
    .sort(compareCreatedAtDesc);
}

export function buildCombatAuditHeatmap(events: any[] = [], options: CombatEventQueryOptions = {}) {
  const buckets = new Map();
  for (const event of flattenCombatEvents(events, 'auditEvent')) {
    if (!matchesInstance(event, options.instanceId) || !matchesTimeRange(event, options)) continue;
    const point = readCombatEventPoint(event);
    if (!point) continue;
    const key = `${point.x},${point.y}`;
    const bucket = buckets.get(key) ?? {
      x: point.x,
      y: point.y,
      count: 0,
      totalDamage: 0,
      lastAt: event.createdAt ?? null,
    };
    bucket.count += 1;
    bucket.totalDamage += Math.max(0, Math.round(Number(event.result?.damage) || 0));
    if (compareCreatedAtDesc({ createdAt: event.createdAt }, { createdAt: bucket.lastAt }) < 0) {
      bucket.lastAt = event.createdAt ?? bucket.lastAt;
    }
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values()).sort((left, right) => right.count - left.count || left.x - right.x || left.y - right.y);
}

export function flattenCombatEvents(events: any[] = [], preferredKey: string | null = null) {
  const flattened: CombatEventRecord[] = [];
  for (const entry of Array.isArray(events) ? events : []) {
    if (!entry) continue;
    if (preferredKey && entry[preferredKey]) {
      flattened.push(entry[preferredKey]);
      continue;
    }
    if (preferredKey === 'auditEvent') {
      if (entry.type === 'combat_audit') flattened.push(entry);
      continue;
    }
    if (preferredKey === 'diagnosticEvent') {
      if (entry.type === 'combat_diagnostic') flattened.push(entry);
      continue;
    }
    if (entry.auditEvent) flattened.push(entry.auditEvent);
    if (entry.diagnosticEvent) flattened.push(entry.diagnosticEvent);
    if (entry.type === 'combat_audit' || entry.type === 'combat_diagnostic') {
      flattened.push(entry);
    }
  }
  return flattened;
}

function matchesInstance(event: CombatEventRecord, instanceId: unknown) {
  const expected = normalizeString(instanceId);
  return !expected || event.instanceId === expected;
}

function matchesReason(event: CombatEventRecord, reason: unknown) {
  const expected = normalizeString(reason);
  return !expected || event.reason === expected;
}

function matchesTimeRange(event: CombatEventRecord, options: CombatEventQueryOptions = {}) {
  const createdAt = normalizeTime(event.createdAt);
  const since = normalizeTime(options.since ?? options.sinceAt);
  const until = normalizeTime(options.until ?? options.untilAt);
  if (since !== null && (createdAt === null || createdAt < since)) return false;
  if (until !== null && (createdAt === null || createdAt > until)) return false;
  return true;
}

function matchesParticipant(event: CombatEventRecord, options: CombatEventQueryOptions = {}) {
  const playerId = normalizeString(options.playerId);
  const monsterRuntimeId = normalizeString(options.monsterRuntimeId);
  if (!playerId && !monsterRuntimeId) return true;
  const actor = event.actor ?? {};
  const target = event.target ?? {};
  if (playerId && (matchesEntityRef(actor, 'player', playerId) || matchesEntityRef(target, 'player', playerId))) {
    return true;
  }
  if (monsterRuntimeId && (matchesEntityRef(actor, 'monster', monsterRuntimeId) || matchesEntityRef(target, 'monster', monsterRuntimeId))) {
    return true;
  }
  return false;
}

function matchesEntityRef(value: any, kind: string, id: string) {
  return value?.kind === kind && value?.id === id;
}

function readActorId(actor: any) {
  return normalizeString(actor?.id ?? actor?.runtimeId ?? actor?.playerId);
}

function readCombatEventPoint(event: CombatEventRecord) {
  const target = event.target ?? {};
  const result = event.result ?? {};
  const x = normalizeCoordinate(target.x ?? result.x ?? result.targetX);
  const y = normalizeCoordinate(target.y ?? result.y ?? result.targetY);
  return x === null || y === null ? null : { x, y };
}

function normalizeLimit(value: unknown, fallback: number) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? Math.min(normalized, 1000) : fallback;
}

function normalizeCoordinate(value: unknown) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTime(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : null;
}

function compareCreatedAtDesc(left: CombatEventRecord, right: CombatEventRecord) {
  return (normalizeTime(right.createdAt) ?? 0) - (normalizeTime(left.createdAt) ?? 0);
}

function compareCreatedAtAsc(left: CombatEventRecord, right: CombatEventRecord) {
  return (normalizeTime(left.createdAt) ?? 0) - (normalizeTime(right.createdAt) ?? 0);
}
