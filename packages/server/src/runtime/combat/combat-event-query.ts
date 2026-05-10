/**
 * 战斗事件查询与聚合工具。
 *
 * 职责：
 * - 查询最近的战斗审计事件（按实例、时间范围、参与者过滤）
 * - 聚合战斗诊断事件（按原因 × 实例分桶统计）
 * - 查询怪物技能失败原因（用于 AI 调试）
 * - 生成战斗热力图（按坐标聚合战斗频次和伤害）
 *
 * 使用场景：
 * - GM 运维面板查看战斗日志
 * - 运营分析战斗热点区域
 * - 诊断怪物 AI 技能释放失败原因
 * - 战斗系统健康度监控
 */

type CombatEventRecord = Record<string, any>;
type CombatEventQueryOptions = Record<string, any>;

/**
 * 查询最近的战斗审计事件。
 * 支持按实例、时间范围、参与者（玩家/怪物）过滤，按时间倒序返回。
 */
export function queryRecentCombatAuditEvents(events: any[] = [], options: CombatEventQueryOptions = {}) {
  const limit = normalizeLimit(options.limit, 100);
  return flattenCombatEvents(events, 'auditEvent')
    .filter((event) => matchesInstance(event, options.instanceId))
    .filter((event) => matchesTimeRange(event, options))
    .filter((event) => matchesParticipant(event, options))
    .sort(compareCreatedAtDesc)
    .slice(0, limit);
}

/**
 * 聚合战斗诊断事件，按 reason × instanceId 分桶。
 * 返回总数和按频次降序排列的桶列表（含首次/末次时间和严重度分布）。
 */
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

/**
 * 查询怪物技能释放失败的诊断事件。
 * 可按 actionId 和 monsterRuntimeId 过滤，用于调试怪物 AI。
 */
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

/**
 * 生成战斗热力图数据。
 * 按坐标聚合战斗次数和总伤害，按频次降序排列。
 */
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

/**
 * 展平战斗事件数组。
 * 支持嵌套格式（entry.auditEvent / entry.diagnosticEvent）和扁平格式（entry.type）。
 */
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

// ─── 内部过滤与工具函数 ───

/** 按地图实例 ID 过滤。 */
function matchesInstance(event: CombatEventRecord, instanceId: unknown) {
  const expected = normalizeString(instanceId);
  return !expected || event.instanceId === expected;
}

/** 按诊断原因过滤。 */
function matchesReason(event: CombatEventRecord, reason: unknown) {
  const expected = normalizeString(reason);
  return !expected || event.reason === expected;
}

/** 按时间范围过滤（支持 since/until 或 sinceAt/untilAt）。 */
function matchesTimeRange(event: CombatEventRecord, options: CombatEventQueryOptions = {}) {
  const createdAt = normalizeTime(event.createdAt);
  const since = normalizeTime(options.since ?? options.sinceAt);
  const until = normalizeTime(options.until ?? options.untilAt);
  if (since !== null && (createdAt === null || createdAt < since)) return false;
  if (until !== null && (createdAt === null || createdAt > until)) return false;
  return true;
}

/** 按参与者（玩家或怪物）过滤，匹配 actor 或 target。 */
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

/** 匹配实体引用（kind + id）。 */
function matchesEntityRef(value: any, kind: string, id: string) {
  return value?.kind === kind && value?.id === id;
}

/** 从 actor 对象中提取 ID。 */
function readActorId(actor: any) {
  return normalizeString(actor?.id ?? actor?.runtimeId ?? actor?.playerId);
}

/** 从战斗事件中提取坐标点。 */
function readCombatEventPoint(event: CombatEventRecord) {
  const target = event.target ?? {};
  const result = event.result ?? {};
  const x = normalizeCoordinate(target.x ?? result.x ?? result.targetX);
  const y = normalizeCoordinate(target.y ?? result.y ?? result.targetY);
  return x === null || y === null ? null : { x, y };
}

/** 规范化 limit 值，上限 1000。 */
function normalizeLimit(value: unknown, fallback: number) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? Math.min(normalized, 1000) : fallback;
}

/** 规范化坐标值。 */
function normalizeCoordinate(value: unknown) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) ? normalized : null;
}

/** 规范化字符串。 */
function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** 规范化时间值为毫秒时间戳。 */
function normalizeTime(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : null;
}

/** 按创建时间降序比较。 */
function compareCreatedAtDesc(left: CombatEventRecord, right: CombatEventRecord) {
  return (normalizeTime(right.createdAt) ?? 0) - (normalizeTime(left.createdAt) ?? 0);
}

/** 按创建时间升序比较。 */
function compareCreatedAtAsc(left: CombatEventRecord, right: CombatEventRecord) {
  return (normalizeTime(left.createdAt) ?? 0) - (normalizeTime(right.createdAt) ?? 0);
}
