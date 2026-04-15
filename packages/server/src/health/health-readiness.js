"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHealthResponse = buildHealthResponse;
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** buildHealthResponse：执行对应的业务逻辑。 */
function buildHealthResponse(dependencies) {
/** database：定义该变量以承载业务值。 */
    const database = resolveDatabaseReadiness();
/** maintenance：定义该变量以承载业务值。 */
    const maintenance = resolveMaintenanceReadiness(dependencies.maintenanceStateService);
/** persistence：定义该变量以承载业务值。 */
    const persistence = {
        player: resolvePersistenceReadiness(database.configured, dependencies.playerPersistenceService),
        mail: resolvePersistenceReadiness(database.configured, dependencies.mailPersistenceService),
        market: resolvePersistenceReadiness(database.configured, dependencies.marketPersistenceService),
        suggestion: resolvePersistenceReadiness(database.configured, dependencies.suggestionPersistenceService),
    };
/** legacyAuth：定义该变量以承载业务值。 */
    const legacyAuth = resolveLegacyAuthReadiness(database.source, dependencies.authStateService);
/** runtime：定义该变量以承载业务值。 */
    const runtime = resolveRuntimeReadiness(dependencies.worldRuntimeService);
/** readinessOk：定义该变量以承载业务值。 */
    const readinessOk = !maintenance.active
        && database.configured
        && persistence.player.enabled
        && persistence.mail.enabled
        && persistence.market.enabled
        && persistence.suggestion.enabled
        && legacyAuth.ready
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
/** resolveMaintenanceReadiness：执行对应的业务逻辑。 */
function resolveMaintenanceReadiness(service) {
    if (!service || typeof service.isRuntimeMaintenanceActive !== 'function') {
        return {
            active: false,
            source: null,
            reason: 'inactive',
        };
    }
/** active：定义该变量以承载业务值。 */
    const active = service.isRuntimeMaintenanceActive();
    return {
        active,
        source: active ? 'runtime_maintenance_service' : null,
        reason: active ? 'runtime_maintenance_active' : 'inactive',
    };
}
/** resolveDatabaseReadiness：执行对应的业务逻辑。 */
function resolveDatabaseReadiness() {
/** source：定义该变量以承载业务值。 */
    const source = resolveDatabaseSource();
    return {
/** configured：定义该变量以承载业务值。 */
        configured: source !== null,
        source,
    };
}
/** resolveDatabaseSource：执行对应的业务逻辑。 */
function resolveDatabaseSource() {
    return (0, env_alias_1.resolveServerNextDatabaseEnvSource)();
}
/** resolvePersistenceReadiness：执行对应的业务逻辑。 */
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
/** enabled：定义该变量以承载业务值。 */
    const enabled = inspectPersistenceServiceEnabled(service);
    return {
        enabled,
        reason: enabled ? 'ready' : 'init_incomplete_or_failed',
    };
}
/** inspectPersistenceServiceEnabled：执行对应的业务逻辑。 */
function inspectPersistenceServiceEnabled(service) {
/** candidate：定义该变量以承载业务值。 */
    const candidate = service;
    return candidate.enabled === true && candidate.pool != null;
}
/** resolveLegacyAuthReadiness：执行对应的业务逻辑。 */
function resolveLegacyAuthReadiness(databaseSource, service) {
    if (!databaseSource) {
        return {
            ready: false,
            mode: 'token_fallback',
            source: null,
            reason: 'database_unconfigured',
        };
    }
    if (!service) {
        return {
            ready: false,
            mode: 'token_fallback',
            source: databaseSource,
            reason: 'service_unavailable',
        };
    }
/** candidate：定义该变量以承载业务值。 */
    const candidate = service;
/** poolAvailable：定义该变量以承载业务值。 */
    const poolAvailable = candidate.pool != null;
    if (poolAvailable) {
        return {
            ready: true,
            mode: 'database',
            source: databaseSource,
            reason: 'ready',
        };
    }
    if (candidate.poolUnavailable === true) {
        return {
            ready: false,
            mode: 'token_fallback',
            source: databaseSource,
            reason: 'database_init_failed_or_unavailable',
        };
    }
    return {
        ready: false,
        mode: 'database',
        source: databaseSource,
        reason: 'database_init_pending',
    };
}
/** resolveRuntimeReadiness：执行对应的业务逻辑。 */
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
/** candidate：定义该变量以承载业务值。 */
    const candidate = service;
/** getRuntimeSummary：定义该变量以承载业务值。 */
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
/** summary：定义该变量以承载业务值。 */
        const summary = getRuntimeSummary.call(service);
/** tick：定义该变量以承载业务值。 */
        const tick = readNonNegativeInt(summary.tick);
/** instanceCount：定义该变量以承载业务值。 */
        const instanceCount = readNonNegativeInt(summary.instanceCount);
/** playerCount：定义该变量以承载业务值。 */
        const playerCount = readNonNegativeInt(summary.playerCount);
/** pendingCommandCount：定义该变量以承载业务值。 */
        const pendingCommandCount = readNonNegativeInt(summary.pendingCommandCount);
/** ready：定义该变量以承载业务值。 */
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
/** readNonNegativeInt：执行对应的业务逻辑。 */
function readNonNegativeInt(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.floor(value));
}
//# sourceMappingURL=health-readiness.js.map
