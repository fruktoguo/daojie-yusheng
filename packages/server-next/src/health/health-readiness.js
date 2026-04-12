"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHealthResponse = buildHealthResponse;
const env_alias_1 = require("../config/env-alias");
function buildHealthResponse(dependencies) {
    const database = resolveDatabaseReadiness();
    const maintenance = resolveMaintenanceReadiness(dependencies.maintenanceStateService);
    const persistence = {
        player: resolvePersistenceReadiness(database.configured, dependencies.playerPersistenceService),
        mail: resolvePersistenceReadiness(database.configured, dependencies.mailPersistenceService),
        market: resolvePersistenceReadiness(database.configured, dependencies.marketPersistenceService),
        suggestion: resolvePersistenceReadiness(database.configured, dependencies.suggestionPersistenceService),
    };
    const legacyAuth = resolveLegacyAuthReadiness(database.source, dependencies.authStateService);
    const runtime = resolveRuntimeReadiness(dependencies.worldRuntimeService);
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
function resolveDatabaseReadiness() {
    const source = resolveDatabaseSource();
    return {
        configured: source !== null,
        source,
    };
}
function resolveDatabaseSource() {
    return (0, env_alias_1.resolveServerNextDatabaseEnvSource)();
}
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
function inspectPersistenceServiceEnabled(service) {
    const candidate = service;
    return candidate.enabled === true && candidate.pool != null;
}
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
    const candidate = service;
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
function readNonNegativeInt(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.floor(value));
}
//# sourceMappingURL=health-readiness.js.map
