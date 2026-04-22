import { resolveServerDatabaseEnvSource } from '../config/env-alias';
/**
 * PersistenceServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PersistenceServiceLike {
/**
 * enabled：启用开关或状态标识。
 */

  enabled?: boolean;  
  /**
 * pool：缓存或索引容器。
 */

  pool?: unknown;
}
/**
 * RuntimeSummaryLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeSummaryLike {
/**
 * tick：tick相关字段。
 */

  tick?: number;  
  /**
 * instanceCount：数量或计量字段。
 */

  instanceCount?: number;  
  /**
 * playerCount：数量或计量字段。
 */

  playerCount?: number;  
  /**
 * pendingCommandCount：数量或计量字段。
 */

  pendingCommandCount?: number;
}
/**
 * RuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeServiceLike {
/**
 * getRuntimeSummary：get运行态摘要状态或数据块。
 */

  getRuntimeSummary?: () => RuntimeSummaryLike;
}
/**
 * MaintenanceStateServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface MaintenanceStateServiceLike {
/**
 * isRuntimeMaintenanceActive：启用开关或状态标识。
 */

  isRuntimeMaintenanceActive?: () => boolean;
}
/**
 * HealthReadinessDependencies：定义接口结构约束，明确可交付字段含义。
 */


export interface HealthReadinessDependencies {
/**
 * playerPersistenceService：玩家Persistence服务引用。
 */

  playerPersistenceService?: PersistenceServiceLike | null;  
  /**
 * mailPersistenceService：邮件Persistence服务引用。
 */

  mailPersistenceService?: PersistenceServiceLike | null;  
  /**
 * marketPersistenceService：坊市Persistence服务引用。
 */

  marketPersistenceService?: PersistenceServiceLike | null;  
  /**
 * suggestionPersistenceService：suggestionPersistence服务引用。
 */

  suggestionPersistenceService?: PersistenceServiceLike | null;  
  /**
 * maintenanceStateService：maintenance状态服务引用。
 */

  maintenanceStateService?: MaintenanceStateServiceLike | null;  
  /**
 * worldRuntimeService：世界运行态服务引用。
 */

  worldRuntimeService?: RuntimeServiceLike | null;
}
/**
 * PersistenceReadiness：定义接口结构约束，明确可交付字段含义。
 */


interface PersistenceReadiness {
/**
 * enabled：启用开关或状态标识。
 */

  enabled: boolean;  
  /**
 * reason：reason相关字段。
 */

  reason: string;
}
/**
 * RuntimeReadiness：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeReadiness {
/**
 * ready：ready相关字段。
 */

  ready: boolean;  
  /**
 * reason：reason相关字段。
 */

  reason: string;  
  /**
 * tick：tick相关字段。
 */

  tick: number;  
  /**
 * instanceCount：数量或计量字段。
 */

  instanceCount: number;  
  /**
 * playerCount：数量或计量字段。
 */

  playerCount: number;  
  /**
 * pendingCommandCount：数量或计量字段。
 */

  pendingCommandCount: number;
}
/**
 * HealthResponse：定义接口结构约束，明确可交付字段含义。
 */


interface HealthResponse {
/**
 * ok：ok相关字段。
 */

  ok: boolean;  
  /**
 * service：服务引用。
 */

  service: string;  
  /**
 * alive：alive相关字段。
 */

  alive: {  
  /**
 * ok：ok相关字段。
 */

    ok: boolean;    
    /**
 * service：服务引用。
 */

    service: string;
  };  
  /**
 * readiness：readiness相关字段。
 */

  readiness: {  
  /**
 * ok：ok相关字段。
 */

    ok: boolean;    
    /**
 * maintenance：maintenance相关字段。
 */

    maintenance: {    
    /**
 * active：启用开关或状态标识。
 */

      active: boolean;      
      /**
 * source：来源相关字段。
 */

      source: string | null;      
      /**
 * reason：reason相关字段。
 */

      reason: string;
    };    
    /**
 * database：database相关字段。
 */

    database: {    
    /**
 * configured：configured相关字段。
 */

      configured: boolean;      
      /**
 * source：来源相关字段。
 */

      source: string | null;
    };    
    /**
 * persistence：persistence相关字段。
 */

    persistence: {    
    /**
 * player：玩家引用。
 */

      player: PersistenceReadiness;      
      /**
 * mail：邮件相关字段。
 */

      mail: PersistenceReadiness;      
      /**
 * market：坊市相关字段。
 */

      market: PersistenceReadiness;      
      /**
 * suggestion：suggestion相关字段。
 */

      suggestion: PersistenceReadiness;
    };    
    /**
 * auth：认证相关字段。
 */

    auth: {    
    /**
 * ready：ready相关字段。
 */

      ready: boolean;      
      /**
 * mode：mode相关字段。
 */

      mode: 'native_only';      
      /**
 * source：来源相关字段。
 */

      source: null;      
      /**
 * reason：reason相关字段。
 */

      reason: 'native_auth_only';
    };    
    /**
 * runtime：运行态引用。
 */

    runtime: RuntimeReadiness;
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
  const runtime = resolveRuntimeReadiness(dependencies.worldRuntimeService);

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  return resolveServerDatabaseEnvSource();
}

/** 读取服务级持久化开关，用于 readiness 中快速降级。 */
function resolvePersistenceReadiness(
  databaseConfigured: boolean,
  service?: PersistenceServiceLike | null,
): PersistenceReadiness {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
function resolveRuntimeReadiness(service?: RuntimeServiceLike | null): RuntimeReadiness {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!service) {
    return {
      ready: false,
      reason: 'service_unavailable',
      tick: 0,
      instanceCount: 0,
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
      playerCount: 0,
      pendingCommandCount: 0,
    };
  }

  try {
    const summary = getRuntimeSummary.call(service);
    const tick = readNonNegativeInt(summary.tick);
    const instanceCount = readNonNegativeInt(summary.instanceCount);
    const playerCount = readNonNegativeInt(summary.playerCount);
    const pendingCommandCount = readNonNegativeInt(summary.pendingCommandCount);
    const ready = instanceCount > 0;

    return {
      ready,
      reason: ready ? 'ready' : 'no_instances',
      tick,
      instanceCount,
      playerCount,
      pendingCommandCount,
    };
  } catch {
    return {
      ready: false,
      reason: 'summary_unavailable',
      tick: 0,
      instanceCount: 0,
      playerCount: 0,
      pendingCommandCount: 0,
    };
  }
}

/** 将运行时上报值转为非负整数，避免 NaN/负数污染 readiness。 */
function readNonNegativeInt(value: number | undefined): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
