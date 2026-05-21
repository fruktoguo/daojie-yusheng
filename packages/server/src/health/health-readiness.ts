/**
 * 健康就绪检测核心逻辑：汇总数据库、持久化服务、运行时和维护态，
 * 输出统一的 readiness 响应体。供 HealthController 和内部网关使用。
 */
import { resolveServerDatabaseEnvSource, resolveServerDatabasePoolerEnvSource } from '../config/env-alias';

/** 持久化服务最小接口，用于 readiness 检测 */
interface PersistenceServiceLike {
  /** 服务是否已完成初始化 */
  enabled?: boolean;
  /** 数据库连接池引用（非 null 表示连接可用） */
  pool?: unknown;
}

/** 运行时摘要最小接口 */
interface RuntimeSummaryLike {
  tick?: number;
  instanceCount?: number;
  leaseDegradedInstanceCount?: number;
  fencedInstanceCount?: number;
  quarantineInstanceCount?: number;
  quarantineInstances?: RuntimeQuarantineInstance[];
  playerCount?: number;
  pendingCommandCount?: number;
}

interface RuntimeQuarantineInstance {
  startupRunId?: string | null;
  instanceId: string;
  templateId?: string | null;
  kind?: string | null;
  status?: string | null;
  runtimeStatus: string;
  reason: string;
  playerCount?: number;
}

/** 世界运行时服务最小接口 */
interface RuntimeServiceLike {
  getRuntimeSummary?: () => RuntimeSummaryLike;
}

/** 维护态服务最小接口 */
interface MaintenanceStateServiceLike {
  isRuntimeMaintenanceActive?: () => boolean;
}

/** readiness 检测所需的全部依赖注入 */
export interface HealthReadinessDependencies {
  playerPersistenceService?: PersistenceServiceLike | null;
  mailPersistenceService?: PersistenceServiceLike | null;
  marketPersistenceService?: PersistenceServiceLike | null;
  suggestionPersistenceService?: PersistenceServiceLike | null;
  maintenanceStateService?: MaintenanceStateServiceLike | null;
  worldRuntimeService?: RuntimeServiceLike | null;
  startupRunId?: string | null;
}

interface StartupReadiness {
  startupRunId: string;
  phase: string;
  ready: boolean;
  degraded: boolean;
  failed: boolean;
  blocking: boolean;
  reason: string;
  startedAt: string;
  updatedAt: string;
  phases: unknown[];
  barrier?: unknown;
}
/** 单个持久化服务的就绪状态 */
interface PersistenceReadiness {
  enabled: boolean;
  reason: string;
}

/** 运行时就绪状态及关键指标 */
interface RuntimeReadiness {
  ready: boolean;
  reason: string;
  tick: number;
  instanceCount: number;
  leaseDegradedInstanceCount: number;
  fencedInstanceCount: number;
  quarantineInstanceCount: number;
  quarantineInstances: RuntimeQuarantineInstance[];
  playerCount: number;
  pendingCommandCount: number;
}

/** 完整健康检查响应体 */
interface HealthResponse {
  ok: boolean;
  service: string;
  alive: {
    ok: boolean;
    service: string;
  };
  readiness: {
    ok: boolean;
    maintenance: {
      active: boolean;
      source: string | null;
      reason: string;
    };
    database: {
      configured: boolean;
      source: string | null;
    };
    persistence: {
      player: PersistenceReadiness;
      mail: PersistenceReadiness;
      market: PersistenceReadiness;
      suggestion: PersistenceReadiness;
    };
    auth: {
      ready: boolean;
      mode: 'native_only';
      source: null;
      reason: 'native_auth_only';
    };
    runtime: RuntimeReadiness;
    startup?: StartupReadiness;
  };
}

/** 构建统一的 readiness 响应体，汇总数据库、持久化、运行时与维护状态。 */
export function buildHealthResponse(dependencies: HealthReadinessDependencies): HealthResponse {
  const database = resolveDatabaseReadiness();
  const maintenance = resolveMaintenanceReadiness(dependencies.maintenanceStateService);
  const persistence = {
    player: resolvePersistenceReadiness(database.configured, dependencies.playerPersistenceService),
    mail: resolvePersistenceReadiness(database.configured, dependencies.mailPersistenceService),
    market: resolvePersistenceReadiness(database.configured, dependencies.marketPersistenceService),
    suggestion: resolvePersistenceReadiness(database.configured, dependencies.suggestionPersistenceService),
  };
  const auth = resolveAuthReadiness();
  const runtime = resolveRuntimeReadiness(dependencies.worldRuntimeService, dependencies.startupRunId);

  const readinessOk = !maintenance.active
    && database.configured
    && persistence.player.enabled
    && persistence.mail.enabled
    && persistence.market.enabled
    && persistence.suggestion.enabled
    && runtime.ready;

  return {
    ok: readinessOk,
    service: 'server',
    alive: {
      ok: true,
      service: 'server',
    },
    readiness: {
      ok: readinessOk,
      maintenance,
      database,
      persistence,
      auth,
      runtime,
    },
  };
}

/** 解析维护态来源与开关，决定 readiness 是否受运行时维护影响。 */
function resolveMaintenanceReadiness(service?: MaintenanceStateServiceLike | null) {

  if (!service || typeof service.isRuntimeMaintenanceActive !== 'function') {
    return {
      active: false,
      source: null,
      reason: 'inactive',
    };
  }

  const active = service.isRuntimeMaintenanceActive();
  return {
    active,
    source: active ? 'runtime_maintenance_service' : null,
    reason: active ? 'runtime_maintenance_active' : 'inactive',
  };
}

/** 检查数据库配置是否可用，返回配置来源。 */
function resolveDatabaseReadiness() {
  const source = resolveDatabaseSource();
  return {
    configured: source !== null,
    source,
  };
}

/** 读取数据库配置来源，统一从 env alias 解析。 */
function resolveDatabaseSource(): string | null {
  return resolveServerDatabasePoolerEnvSource() ?? resolveServerDatabaseEnvSource();
}

/** 读取服务级持久化开关，用于 readiness 中快速降级。 */
function resolvePersistenceReadiness(
  databaseConfigured: boolean,
  service?: PersistenceServiceLike | null,
): PersistenceReadiness {

  if (!databaseConfigured) {
    return {
      enabled: false,
      reason: 'database_unconfigured',
    };
  }
  if (!service) {
    return {
      enabled: false,
      reason: 'service_unavailable',
    };
  }

  const enabled = inspectPersistenceServiceEnabled(service);
  return {
    enabled,
    reason: enabled ? 'ready' : 'init_incomplete_or_failed',
  };
}

/** 校验持久化服务是否可用（至少要有 enabled 与有效连接池）。 */
function inspectPersistenceServiceEnabled(service: PersistenceServiceLike): boolean {
  return service.enabled === true && service.pool != null;
}

/** 鉴权 readiness 当前固定为原生主线。 */
function resolveAuthReadiness() {
  return {
    ready: true,
    mode: 'native_only' as const,
    source: null,
    reason: 'native_auth_only' as const,
  };
}

/** 读取 world runtime 运行摘要并汇总 readiness 的运行指标。 */
function resolveRuntimeReadiness(service?: RuntimeServiceLike | null, startupRunId?: string | null): RuntimeReadiness {

  if (!service) {
    return {
      ready: false,
      reason: 'service_unavailable',
      tick: 0,
      instanceCount: 0,
      leaseDegradedInstanceCount: 0,
      fencedInstanceCount: 0,
      quarantineInstanceCount: 0,
      quarantineInstances: [],
      playerCount: 0,
      pendingCommandCount: 0,
    };
  }

  const { getRuntimeSummary } = service;
  if (typeof getRuntimeSummary !== 'function') {
    return {
      ready: false,
      reason: 'summary_unavailable',
      tick: 0,
      instanceCount: 0,
      leaseDegradedInstanceCount: 0,
      fencedInstanceCount: 0,
      quarantineInstanceCount: 0,
      quarantineInstances: [],
      playerCount: 0,
      pendingCommandCount: 0,
    };
  }

  try {
    const summary = getRuntimeSummary.call(service);
    const tick = readNonNegativeInt(summary.tick);
    const instanceCount = readNonNegativeInt(summary.instanceCount);
    const leaseDegradedInstanceCount = readNonNegativeInt(summary.leaseDegradedInstanceCount);
    const fencedInstanceCount = readNonNegativeInt(summary.fencedInstanceCount);
    const quarantineInstanceCount = readNonNegativeInt(summary.quarantineInstanceCount);
    const quarantineInstances = normalizeQuarantineInstances(summary.quarantineInstances, startupRunId);
    const playerCount = readNonNegativeInt(summary.playerCount);
    const pendingCommandCount = readNonNegativeInt(summary.pendingCommandCount);
    const ready = instanceCount > 0 && leaseDegradedInstanceCount === 0 && fencedInstanceCount === 0;

    return {
      ready,
      reason: ready ? 'ready' : instanceCount <= 0 ? 'no_instances' : leaseDegradedInstanceCount > 0 ? 'lease_degraded' : 'lease_fenced',
      tick,
      instanceCount,
      leaseDegradedInstanceCount,
      fencedInstanceCount,
      quarantineInstanceCount,
      quarantineInstances,
      playerCount,
      pendingCommandCount,
    };
  } catch {
    return {
      ready: false,
      reason: 'summary_unavailable',
      tick: 0,
      instanceCount: 0,
      leaseDegradedInstanceCount: 0,
      fencedInstanceCount: 0,
      quarantineInstanceCount: 0,
      quarantineInstances: [],
      playerCount: 0,
      pendingCommandCount: 0,
    };
  }
}

function normalizeQuarantineInstances(value: RuntimeQuarantineInstance[] | undefined, startupRunId?: string | null): RuntimeQuarantineInstance[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalizedStartupRunId = typeof startupRunId === 'string' && startupRunId.trim() ? startupRunId.trim() : null;
  return value.slice(0, 25).filter((entry) => typeof entry?.instanceId === 'string' && entry.instanceId.trim()).map((entry) => ({
    startupRunId: normalizedStartupRunId ?? (typeof entry.startupRunId === 'string' && entry.startupRunId.trim() ? entry.startupRunId.trim() : null),
    instanceId: entry.instanceId.trim(),
    templateId: typeof entry.templateId === 'string' && entry.templateId.trim() ? entry.templateId.trim() : null,
    kind: typeof entry.kind === 'string' && entry.kind.trim() ? entry.kind.trim() : null,
    status: typeof entry.status === 'string' && entry.status.trim() ? entry.status.trim() : null,
    runtimeStatus: typeof entry.runtimeStatus === 'string' && entry.runtimeStatus.trim() ? entry.runtimeStatus.trim() : 'unknown',
    reason: typeof entry.reason === 'string' && entry.reason.trim() ? entry.reason.trim() : 'unknown',
    playerCount: readNonNegativeInt(entry.playerCount),
  }));
}

/** 将运行时上报值转为非负整数，避免 NaN/负数污染 readiness。 */
function readNonNegativeInt(value: number | undefined): number {

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
