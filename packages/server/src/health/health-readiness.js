"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHealthResponse = buildHealthResponse;

const env_alias_1 = require("../config/env-alias");
// TODO(next:T24): 随着 legacy 外部入口退役，继续清理 readiness 中的 legacy/compat 兼容分支，避免健康检查口径长期混流。

/** 构建统一的 readiness 响应体，汇总数据库、持久化、运行时与维护状态。 */
function buildHealthResponse(dependencies) {

    const database = resolveDatabaseReadiness();

    const maintenance = resolveMaintenanceReadiness(dependencies.maintenanceStateService);

    const persistence = {
        player: resolvePersistenceReadiness(database.configured, dependencies.playerPersistenceService),
        mail: resolvePersistenceReadiness(database.configured, dependencies.mailPersistenceService),
        market: resolvePersistenceReadiness(database.configured, dependencies.marketPersistenceService),
        suggestion: resolvePersistenceReadiness(database.configured, dependencies.suggestionPersistenceService),
    };

    const legacyAuth = resolveLegacyAuthReadiness();

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
        service: 'server-next',
        alive: {
            ok: true,
            service: 'server-next',
        },
        readiness: {
            ok: readinessOk,
            maintenance,
            database,
            persistence,
            legacyAuth,
            runtime,
        },
    };
}

/** 解析维护态来源与开关，决定 readiness 是否受运行时维护影响。 */
function resolveMaintenanceReadiness(service) {
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
function resolveDatabaseSource() {
    return (0, env_alias_1.resolveServerNextDatabaseEnvSource)();
}

/** 读取服务级持久化开关，用于 readiness 中快速降级。 */
function resolvePersistenceReadiness(databaseConfigured, service) {
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
function inspectPersistenceServiceEnabled(service) {

    const candidate = service;
    return candidate.enabled === true && candidate.pool != null;
}

/** 兼容鉴权当前固定为 next-only，保留可扩展的 readiness 结构。 */
function resolveLegacyAuthReadiness() {
    return {
        ready: true,
        mode: 'unused',
        source: null,
        reason: 'next_auth_only',
    };
}

/** 读取 world runtime 运行摘要并汇总 readiness 的运行指标。 */
function resolveRuntimeReadiness(service) {
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

    const candidate = service;

    const getRuntimeSummary = candidate.getRuntimeSummary;
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
    }
    catch {
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
function readNonNegativeInt(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.floor(value));
}
//# sourceMappingURL=health-readiness.js.map

