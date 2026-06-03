// @ts-nocheck

/**
 * 用途：编排执行 server smoke 冒烟验证套件。
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
/**
 * 记录ownkeys。
 */
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
/**
 * 记录ar。
 */
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
/**
 * 累计当前结果。
 */
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const fs = __importStar(require("node:fs"));
const pg = require('pg');
/**
 * 记录net。
 */
const net = __importStar(require("node:net"));
/**
 * 记录path路径。
 */
const path = __importStar(require("node:path"));
const env_alias_1 = require("../config/env-alias");
const stable_dist_1 = require("./stable-dist");
const smoke_player_cleanup_1 = require("./smoke-player-cleanup");
const smoke_live_db_lease_guard_1 = require("./smoke-live-db-lease-guard");
/**
 * 记录包根目录。
 */
const packageRoot = (0, stable_dist_1.resolveToolPackageRoot)(__dirname);
/**
 * 记录构建产物目录。
 */
const distRoot = (0, stable_dist_1.resolveToolDistRoot)(__dirname, packageRoot);
/**
 * 记录仓库根目录。
 */
const repoRoot = path.resolve(packageRoot, '..', '..');
/**
 * 记录服务端入口文件路径。
 */
const serverEntry = path.join(distRoot, 'main.js');
/**
 * 保存命令行参数。
 */
const cliArgs = process.argv.slice(2);
/**
 * 记录include持久化。
 */
const includePersistence = cliArgs.includes('--include-persistence');
/**
 * 记录requirelegacy认证。
 */
/**
 * 记录用户指定的用例名称。
 */
const selectedCaseNames = readOptionValues(cliArgs, '--case');
const selectedGroupNames = readOptionValues(cliArgs, '--group');
/**
 * 汇总可执行的 smoke 用例。
 */
const smokeCases = [
    { name: 'readiness-gate', scriptFile: 'readiness-gate-smoke.js', standalone: true },
    { name: 'gm-database', scriptFile: 'gm-database-smoke.js', standalone: true },
    { name: 'shutdown-drain', scriptFile: 'shutdown-drain-smoke.js' },
    { name: 'session', scriptFile: 'session-smoke.js' },
    { name: 'runtime', scriptFile: 'runtime-smoke.js' },
    { name: 'progression', scriptFile: 'progression-smoke.js' },
    { name: 'runtime-realm-exp-boundary', scriptFile: 'runtime-realm-exp-boundary-smoke.js', standalone: true },
    { name: 'combat', scriptFile: 'combat-smoke.js' },
    { name: 'combat-e2e-outcome-matrix', scriptFile: 'combat-e2e-outcome-matrix-smoke.js', standalone: true },
    { name: 'combat-formula-main-parity', scriptFile: 'combat-formula-main-parity-smoke.js', standalone: true },
    { name: 'world-runtime-combat-action-service', scriptFile: 'world-runtime-combat-action-service-smoke.js', standalone: true },
    { name: 'world-runtime-combat-boundary', scriptFile: 'world-runtime-combat-boundary-smoke.js', standalone: true },
    { name: 'world-runtime-combat-outcome-variants', scriptFile: 'world-runtime-combat-outcome-variants-smoke.js', standalone: true },
  { name: 'world-runtime-auto-combat', scriptFile: 'world-runtime-auto-combat-smoke.js', standalone: true },
  { name: 'world-runtime-damageable-tile', scriptFile: 'world-runtime-damageable-tile-smoke.js', standalone: true },
  { name: 'world-runtime-temporary-tile-skill', scriptFile: 'world-runtime-temporary-tile-skill-smoke.js', standalone: true },
  { name: 'world-runtime-formation', scriptFile: 'world-runtime-formation-smoke.js', standalone: true },
    { name: 'world-runtime-loot-container', scriptFile: 'world-runtime-loot-container-smoke.js', standalone: true },
    { name: 'world-runtime-monster-los', scriptFile: 'world-runtime-monster-los-smoke.js', standalone: true },
    { name: 'pending-combat-cast-redis-recovery', scriptFile: 'pending-combat-cast-redis-recovery-smoke.js', standalone: true },
    { name: 'world-sync-envelope', scriptFile: 'world-sync-envelope-smoke.js', standalone: true },
    { name: 'leaderboard-offline-snapshots', scriptFile: 'leaderboard-offline-snapshots-smoke.js', standalone: true },
    { name: 'market-runtime-ban-cancel-orders', scriptFile: 'market-runtime-ban-cancel-orders-smoke.js', standalone: true },
    { name: 'native-managed-account-ban-market', scriptFile: 'native-managed-account-ban-market-smoke.js', standalone: true },
    { name: 'loot', scriptFile: 'loot-smoke.js' },
    { name: 'auth-bootstrap', scriptFile: 'auth-bootstrap-smoke.js' },
    { name: 'auth-bootstrap-native', scriptFile: 'auth-bootstrap-smoke.js' },
    { name: 'auth-bootstrap-legacy-import', scriptFile: 'auth-bootstrap-smoke.js' },
    { name: 'gm', scriptFile: 'gm-smoke.js' },
    { name: 'redeem-code', scriptFile: 'redeem-code-smoke.js' },
    { name: 'redeem-code-persistence-startup', scriptFile: 'redeem-code-persistence-startup-smoke.js', standalone: true },
    { name: 'redeem-code-persistence-claim-db', scriptFile: 'redeem-code-persistence-claim-db-smoke.js', standalone: true },
    { name: 'monster-runtime', scriptFile: 'monster-runtime-smoke.js' },
    { name: 'monster-combat', scriptFile: 'monster-combat-smoke.js' },
    { name: 'monster-combat-lease-matrix', scriptFile: 'monster-combat-lease-matrix-smoke.js', standalone: true },
    { name: 'monster-ai', scriptFile: 'monster-ai-smoke.js' },
    { name: 'monster-skill', scriptFile: 'monster-skill-smoke.js' },
    { name: 'monster-reset', scriptFile: 'monster-reset-smoke.js' },
    { name: 'monster-loot', scriptFile: 'monster-loot-smoke.js' },
    { name: 'player-recovery', scriptFile: 'player-recovery-smoke.js' },
    { name: 'player-respawn', scriptFile: 'player-respawn-smoke.js' },
  { name: 'persistence', scriptFile: 'persistence-smoke.js', standalone: true },
  { name: 'player-persistence-flush', scriptFile: 'player-persistence-flush-smoke.js', standalone: true },
  { name: 'player-domain-persistence', scriptFile: 'player-domain-persistence-smoke.js', standalone: true },
  { name: 'player-domain-recovery', scriptFile: 'player-domain-recovery-smoke.js', standalone: true },
  { name: 'player-runtime-persistence-roundtrip', scriptFile: 'player-runtime-persistence-roundtrip-smoke.js', standalone: true },
  { name: 'player-domain-empty-overwrite-guard', scriptFile: 'player-domain-empty-overwrite-guard-smoke.js', standalone: true },
  { name: 'player-anchor-checkpoint-flush-worker', scriptFile: 'player-anchor-checkpoint-flush-worker-smoke.js', standalone: true },
  { name: 'player-state-flush-worker', scriptFile: 'player-state-flush-worker-smoke.js', standalone: true },
  { name: 'durable-operation', scriptFile: 'durable-operation-smoke.js', standalone: true },
  { name: 'world-runtime-lifecycle', scriptFile: 'world-runtime-lifecycle-smoke.js', standalone: true },
  { name: 'snapshot-retirement', scriptFile: 'snapshot-retirement-report-smoke.js', standalone: true },
  { name: 'map-snapshot-retirement', scriptFile: 'map-snapshot-retirement-report-smoke.js', standalone: true },
  { name: 'multi-worker-flush-stability', scriptFile: 'multi-worker-flush-stability-report-smoke.js', standalone: true },
  { name: 'strong-persistence-lease', scriptFile: 'strong-persistence-lease-report-smoke.js', standalone: true },
  { name: 'player-columnar-schema', scriptFile: 'player-columnar-schema-report-smoke.js', standalone: true },
  { name: 'player-dirty-domain-coverage', scriptFile: 'player-dirty-domain-coverage-report-smoke.js', standalone: true },
  { name: 'gm-world-instance', scriptFile: 'gm-world-instance-smoke.js', standalone: true },
  { name: 'world-runtime-instance-capability-guard', scriptFile: 'world-runtime-instance-capability-guard-smoke.js', standalone: true },
  { name: 'world-runtime-player-session-no-auto-instance', scriptFile: 'world-runtime-player-session-no-auto-instance-smoke.js', standalone: true },
  { name: 'world-runtime-pending-cast-instance-transfer', scriptFile: 'world-runtime-pending-cast-instance-transfer-smoke.js', standalone: true },
  { name: 'content-monster-spawn', scriptFile: 'content-monster-spawn-smoke.js', standalone: true },
  { name: 'world-sync-delta-order', scriptFile: 'world-sync-delta-order-smoke.js', standalone: true },
  { name: 'world-sync-player-state', scriptFile: 'world-sync-player-state-smoke.js', standalone: true },
  { name: 'world-sync-aux-state', scriptFile: 'world-sync-aux-state-smoke.js', standalone: true },
  { name: 'world-sync-map-static-aux', scriptFile: 'world-sync-map-static-aux-smoke.js', standalone: true },
  { name: 'world-sync-map-snapshot-instance-diff', scriptFile: 'world-sync-map-snapshot-instance-diff-smoke.js', standalone: true },
  { name: 'world-sync-envelope-eventbus-hotpath', scriptFile: 'world-sync-envelope-eventbus-hotpath-smoke.js', standalone: true },
  { name: 'player-runtime-projection-entry', scriptFile: 'player-runtime-projection-entry-smoke.js', standalone: true },
  { name: 'instance-resource-flush-worker', scriptFile: 'instance-resource-flush-worker-smoke.js', standalone: true },
  { name: 'instance-container-flush-worker', scriptFile: 'instance-container-flush-worker-smoke.js', standalone: true },
  { name: 'instance-ground-item-flush-worker', scriptFile: 'instance-ground-item-flush-worker-smoke.js', standalone: true },
  { name: 'instance-overlay-flush-worker', scriptFile: 'instance-overlay-flush-worker-smoke.js', standalone: true },
  { name: 'instance-tile-damage-flush-worker', scriptFile: 'instance-tile-damage-flush-worker-smoke.js', standalone: true },
  { name: 'instance-monster-runtime-flush-worker', scriptFile: 'instance-monster-runtime-flush-worker-smoke.js', standalone: true },
  { name: 'instance-state-purge-worker', scriptFile: 'instance-state-purge-worker-smoke.js', standalone: true },
  { name: 'instance-lease-runtime', scriptFile: 'instance-lease-runtime-smoke.js', standalone: true },
  { name: 'instance-lease-sync-error', scriptFile: 'instance-lease-sync-error-smoke.js', standalone: true },
  { name: 'instance-lease-periodic-force-reclaim', scriptFile: 'instance-lease-periodic-force-reclaim-smoke.js', standalone: true },
  { name: 'gm-world-instance-lease', scriptFile: 'gm-world-instance-lease-smoke.js', standalone: true },
  { name: 'gm-world-instance-flush', scriptFile: 'gm-world-instance-flush-smoke.js', standalone: true },
  { name: 'gm-world-instance-freeze', scriptFile: 'gm-world-instance-freeze-smoke.js', standalone: true },
  { name: 'gm-world-instance-rebuild', scriptFile: 'gm-world-instance-rebuild-smoke.js', standalone: true },
  { name: 'gm-world-instance-migrate', scriptFile: 'gm-world-instance-migrate-smoke.js', standalone: true },
  { name: 'gm-world-player-flush', scriptFile: 'gm-world-player-flush-smoke.js', standalone: true },
  { name: 'gm-world-player-migrate', scriptFile: 'gm-world-player-migrate-smoke.js', standalone: true },
  { name: 'gm-world-operation-replay', scriptFile: 'gm-world-operation-replay-smoke.js', standalone: true },
  { name: 'gm-world-outbox-retry-queue', scriptFile: 'gm-world-outbox-retry-queue-smoke.js', standalone: true },
  { name: 'gm-world-dirty-backlog', scriptFile: 'gm-world-dirty-backlog-smoke.js', standalone: true },
  { name: 'gm-world-nodes', scriptFile: 'gm-world-nodes-smoke.js', standalone: true },
  { name: 'gm-world-abnormal-temporary-tile-cleanup', scriptFile: 'gm-world-abnormal-temporary-tile-cleanup-smoke.js', standalone: true },
  { name: 'mail-expiration-cleanup-worker', scriptFile: 'mail-expiration-cleanup-worker-smoke.js', standalone: true },
  { name: 'mail-expiration-archive-worker', scriptFile: 'mail-expiration-archive-worker-smoke.js', standalone: true },
  { name: 'mail-soft-delete-purge-worker', scriptFile: 'mail-soft-delete-purge-worker-smoke.js', standalone: true },
  { name: 'mail-structured-mutation', scriptFile: 'mail-structured-mutation-smoke.js', standalone: true },
  { name: 'mail-schema-report', scriptFile: 'mail-schema-report-smoke.js', standalone: true },
  { name: 'outbox-dispatcher', scriptFile: 'outbox-dispatcher-smoke.js', standalone: true },
  { name: 'outbox-dispatcher-backoff', scriptFile: 'outbox-dispatcher-backoff-smoke.js', standalone: true },
  { name: 'outbox-dispatcher-worker', scriptFile: 'outbox-dispatcher-worker-smoke.js', standalone: true },
  { name: 'flush-task-runtime', scriptFile: 'flush-task-runtime-smoke.js', standalone: true },
  { name: 'flush-task-noop-retry', scriptFile: 'flush-task-noop-retry-smoke.js', standalone: true },
  { name: 'flush-pool-backpressure', scriptFile: 'flush-pool-backpressure-smoke.js', standalone: true },
  { name: 'flush-independent-persistence', scriptFile: 'flush-independent-persistence-smoke.js', standalone: true },
  { name: 'snapshot-retirement', scriptFile: 'snapshot-retirement-report-smoke.js', standalone: true },
  { name: 'map-snapshot-retirement', scriptFile: 'map-snapshot-retirement-report-smoke.js', standalone: true },
  { name: 'multi-worker-flush-stability', scriptFile: 'multi-worker-flush-stability-report-smoke.js', standalone: true },
  { name: 'strong-persistence-lease', scriptFile: 'strong-persistence-lease-report-smoke.js', standalone: true },
  { name: 'player-columnar-schema', scriptFile: 'player-columnar-schema-report-smoke.js', standalone: true },
  { name: 'player-dirty-domain-coverage', scriptFile: 'player-dirty-domain-coverage-report-smoke.js', standalone: true },
];
const SMOKE_CASE_GROUPS = Object.freeze({
  'auth-session': [
    'auth-bootstrap',
    'auth-bootstrap-native',
    'auth-bootstrap-legacy-import',
    'session',
  ],
  'player-persistence-recovery': [
    'player-persistence-flush',
    'player-domain-persistence',
    'player-domain-recovery',
    'player-runtime-persistence-roundtrip',
    'player-recovery',
    'player-respawn',
    'player-domain-empty-overwrite-guard',
    'player-anchor-checkpoint-flush-worker',
    'player-state-flush-worker',
  ],
  'combat-matrix': [
    'combat',
    'combat-e2e-outcome-matrix',
    'combat-formula-main-parity',
    'world-runtime-combat-action-service',
    'world-runtime-combat-boundary',
    'world-runtime-combat-outcome-variants',
    'world-runtime-auto-combat',
    'pending-combat-cast-redis-recovery',
    'world-runtime-damageable-tile',
    'world-runtime-formation',
    'world-runtime-loot-container',
    'world-runtime-monster-los',
  ],
  'monster-lifecycle': [
    'monster-runtime',
    'monster-combat',
    'monster-combat-lease-matrix',
    'monster-ai',
    'monster-skill',
    'monster-reset',
    'monster-loot',
    'content-monster-spawn',
  ],
  'world-sync': [
    'world-sync-envelope',
    'world-sync-delta-order',
    'world-sync-player-state',
    'world-sync-aux-state',
    'world-sync-map-static-aux',
    'world-sync-map-snapshot-instance-diff',
    'world-sync-envelope-eventbus-hotpath',
    'player-runtime-projection-entry',
  ],
  'instance-maintenance': [
    'instance-resource-flush-worker',
    'instance-container-flush-worker',
    'instance-ground-item-flush-worker',
    'instance-overlay-flush-worker',
    'instance-tile-damage-flush-worker',
    'instance-monster-runtime-flush-worker',
    'instance-state-purge-worker',
    'instance-lease-runtime',
    'instance-lease-sync-error',
    'instance-lease-periodic-force-reclaim',
  ],
  'gm-world-ops': [
    'gm-world-instance',
    'gm-world-instance-lease',
    'gm-world-instance-flush',
    'gm-world-instance-freeze',
    'gm-world-instance-rebuild',
    'gm-world-instance-migrate',
    'gm-world-player-flush',
    'gm-world-player-migrate',
    'gm-world-operation-replay',
    'gm-world-outbox-retry-queue',
    'gm-world-dirty-backlog',
    'gm-world-nodes',
    'gm-world-abnormal-temporary-tile-cleanup',
  ],
  'mail-outbox-flush': [
    'mail-expiration-cleanup-worker',
    'mail-expiration-archive-worker',
    'mail-soft-delete-purge-worker',
    'mail-structured-mutation',
    'mail-schema-report',
    'outbox-dispatcher',
    'outbox-dispatcher-backoff',
    'outbox-dispatcher-worker',
    'flush-task-runtime',
    'flush-task-noop-retry',
    'flush-pool-backpressure',
    'flush-independent-persistence',
    'durable-operation',
  ],
});
const LONG_RUNNING_SMOKE_TIMEOUT_MS = '20000';
const LONG_RUNNING_SMOKE_CASES = new Set([
    'readiness-gate',
    'session',
    'auth-bootstrap',
    'auth-bootstrap-native',
    'auth-bootstrap-legacy-import',
    'monster-runtime',
    'monster-combat',
    'monster-ai',
    'monster-skill',
    'monster-reset',
    'monster-loot',
]);
const DB_SMOKE_CASES = new Set([
    'persistence',
    'player-domain-persistence',
    'player-domain-recovery',
    'player-anchor-checkpoint-flush-worker',
    'player-state-flush-worker',
    'durable-operation',
  'gm-database',
  'shutdown-drain',
]);
const PARALLEL_STANDALONE_CASES = new Set([
    'snapshot-retirement',
    'map-snapshot-retirement',
    'multi-worker-flush-stability',
    'strong-persistence-lease',
    'player-columnar-schema',
    'player-dirty-domain-coverage',
    'runtime-realm-exp-boundary',
    'combat-formula-main-parity',
    'combat-e2e-outcome-matrix',
    'world-runtime-combat-action-service',
    'world-runtime-combat-boundary',
    'world-runtime-combat-outcome-variants',
    'world-runtime-auto-combat',
    'world-runtime-damageable-tile',
    'world-runtime-formation',
    'world-runtime-loot-container',
    'world-runtime-monster-los',
    'pending-combat-cast-redis-recovery',
    'world-sync-envelope',
    'leaderboard-offline-snapshots',
    'world-runtime-instance-capability-guard',
    'world-runtime-player-session-no-auto-instance',
    'world-runtime-pending-cast-instance-transfer',
    'monster-combat-lease-matrix',
]);
const SMOKE_GATE_PROFILES = {
    local: {
        answers: '代码、主证明链和无库 smoke 子集是否可跑通。',
        excludes: '不证明 persistence、shadow、acceptance、full 或 destructive 维护窗口。',
    },
    'with-db': {
        answers: '在提供数据库环境时，local smoke 子集和数据库相关 smoke case 是否可跑通。',
        excludes: '不证明 shadow、acceptance、full 或真实目标环境运维链；本地 destructive gm-database restore 已包含在 with-db 持久化 case 中。',
    },
};
/**
 * resolveSmokeGateLabel：规范化或转换SmokeGateLabel。
 * @returns 无返回值，直接更新SmokeGateLabel相关状态。
 */

function resolveSmokeGateLabel() {
    return hasDatabaseUrl() ? 'with-db' : 'local';
}
/**
 * resolveSmokeGateProfile：规范化或转换SmokeGateProfile。
 * @returns 无返回值，直接更新SmokeGateProfile相关状态。
 */

function resolveSmokeGateProfile() {
    return SMOKE_GATE_PROFILES[resolveSmokeGateLabel()];
}
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录startedat。
 */
    const startedAt = Date.now();
/**
 * 记录cases。
 */
    const cases = resolveSelectedCases();
    const gate = resolveSmokeGateLabel();
    const gateProfile = resolveSmokeGateProfile();
/**
 * 汇总执行结果。
 */
    const results = [];
    process.stdout.write(`[server smoke] gate=${gate}\n`);
    process.stdout.write(`[server smoke] answers=${gateProfile.answers}\n`);
    process.stdout.write(`[server smoke] excludes=${gateProfile.excludes}\n`);
    process.stdout.write(`[server smoke] cases=${cases.map((entry) => entry.name).join(', ')}\n`);
    await autoCleanupSmokeArtifacts('suite-start');
    const serialCases = cases.filter((entry) => !canRunCaseInParallel(entry));
    const parallelCases = cases.filter((entry) => canRunCaseInParallel(entry));
    for (const entry of serialCases) {
        if (DB_SMOKE_CASES.has(entry.name) && !hasDatabaseUrl()) {
            results.push({
                name: entry.name,
                durationMs: 0,
                skipped: true,
            });
            continue;
        }
        try {
            results.push(await runSmokeCase(entry));
            if (results[results.length - 1].failed) {
                process.stderr.write(`[server smoke] failed ${entry.name}: ${results[results.length - 1].error}\n`);
            }
        }
        finally {
            await autoCleanupSmokeArtifacts(`case:${entry.name}`);
        }
    }
    if (parallelCases.length > 0) {
        process.stdout.write(`\n[server smoke] running parallel standalone cases=${parallelCases.map((entry) => entry.name).join(', ')}\n`);
        const parallelResults = await Promise.all(parallelCases.map((entry) => runSmokeCase(entry)));
        for (const result of parallelResults) {
            results.push(result);
            if (result.failed) {
                process.stderr.write(`[server smoke] failed ${result.name}: ${result.error}\n`);
            }
        }
        await autoCleanupSmokeArtifacts('parallel-standalone');
    }
    process.stdout.write(`\n[server smoke] summary\n`);
    for (const result of results) {
        if (result.skipped) {
            process.stdout.write(`- ${result.name}: skipped\n`);
        }
        else if (result.failed) {
            process.stdout.write(`- ${result.name}: failed ${result.durationMs}ms ${result.error}\n`);
        }
        else {
            process.stdout.write(`- ${result.name}: passed ${result.durationMs}ms\n`);
        }
    }
    const failedResults = results.filter((result) => result.failed);
    if (failedResults.length > 0) {
        process.stderr.write(`[server smoke] failed_cases=${failedResults.map((result) => result.name).join(', ')}\n`);
        process.exitCode = 1;
    }
    process.stdout.write(`[server smoke] boundary=${gateProfile.answers}\n`);
    process.stdout.write(`[server smoke] not_proved=${gateProfile.excludes}\n`);
    process.stdout.write(`[server smoke] total ${Date.now() - startedAt}ms\n`);
    writeSmokeTiming(gate, results, startedAt);
}
async function runSmokeCase(entry) {
/**
 * 记录casestartedat。
 */
    const caseStartedAt = Date.now();
    process.stdout.write(`\n[server smoke] running ${entry.name}\n`);
    try {
        if (entry.standalone) {
            await runStandaloneSmoke(entry);
        }
        else {
            await runIsolatedSmoke(entry);
        }
        return {
            name: entry.name,
            durationMs: Date.now() - caseStartedAt,
        };
    }
    catch (error) {
        return {
            name: entry.name,
            durationMs: Date.now() - caseStartedAt,
            failed: true,
            error: formatSmokeError(error),
        };
    }
}
function canRunCaseInParallel(entry) {
    if (selectedCaseNames.length > 0) {
        return false;
    }
    if (hasDatabaseUrl()) {
        return false;
    }
    return entry.standalone && PARALLEL_STANDALONE_CASES.has(entry.name) && !DB_SMOKE_CASES.has(entry.name);
}
/**
 * 运行isolatedsmoke 校验。
 */
async function runIsolatedSmoke(entry) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录端口。
 */
    const port = await allocateFreePort();
/**
 * 记录base地址。
 */
    const baseUrl = `http://127.0.0.1:${port}`;
/**
 * 记录extra环境变量。
 */
    const extraEnv = await resolveCaseExtraEnv(entry);
/**
 * 记录服务端。
 */
    const server = await startServer(port, extraEnv, entry.name);
    try {
        const requireReady = hasDatabaseUrl() && entry.name !== 'readiness-gate';
        await waitForHealth(baseUrl, 60_000, {
            requireReady,
        });
        await runNodeScript(path.join(distRoot, 'tools', entry.scriptFile), {
            SERVER_URL: baseUrl,
            ...extraEnv,
        });
    }
    catch (error) {
        dumpServerLogTail(server, entry.name);
        throw error;
    }
    finally {
        await stopServer(server);
        cleanupCaseExtraEnv(extraEnv);
    }
}
/**
 * 运行standalonesmoke 校验。
 */
async function runStandaloneSmoke(entry) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录端口。
 */
    const port = await allocateFreePort();
/**
 * 记录extra环境变量。
 */
    const extraEnv = await resolveCaseExtraEnv(entry);
    try {
        await runNodeScript(path.join(distRoot, 'tools', entry.scriptFile), {
            SERVER_SMOKE_PORT: String(port),
            ...extraEnv,
        });
    }
    finally {
        cleanupCaseExtraEnv(extraEnv);
    }
}
/**
 * 启动服务端。
 */
async function startServer(port, extraEnv = {}, caseName = 'unknown') {
/**
 * 记录allowunreadytraffic。
 */
    const allowUnreadyTraffic = !hasDatabaseUrl();
    const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
    await (0, smoke_live_db_lease_guard_1.assertNoActiveInstanceLeasesForSmoke)({
        databaseUrl,
        context: `server smoke case ${caseName}`,
    });
    const serverNodeEnv = (0, smoke_live_db_lease_guard_1.resolveSmokeServerNodeEnv)(
        databaseUrl,
        extraEnv.SERVER_NODE_ID,
    );
/**
 * 记录子进程。
 */
    const child = (0, node_child_process_1.spawn)('node', [serverEntry], {
        cwd: repoRoot,
        env: {
            ...process.env,
            ...extraEnv,
            SERVER_RUNTIME_ENV: process.env.SERVER_RUNTIME_ENV || 'test',
            ...serverNodeEnv,
            SERVER_PORT: String(port),
            SERVER_RUNTIME_HTTP: '1',
            SERVER_FORCE_RECLAIM_STALE_LEASES: (0, smoke_live_db_lease_guard_1.resolveSmokeForceReclaimEnv)(databaseUrl),
            ...(allowUnreadyTraffic
                ? {
                    SERVER_ALLOW_UNREADY_TRAFFIC: '1',
                    SERVER_SMOKE_ALLOW_UNREADY: '1',
                }
                : {}),
        },
        stdio: process.env.SERVER_SMOKE_SERVER_LOG === '1' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    if (process.env.SERVER_SMOKE_SERVER_LOG !== '1') {
        attachServerLogTail(child);
    }
    child.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
            process.stderr.write(`[server smoke] server exited unexpectedly: code=${code} signal=${signal ?? 'none'}\n`);
        }
    });
    return child;
}
/**
 * 停止服务端。
 */
async function stopServer(child) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    child.kill('SIGINT');
    await Promise.race([
        waitForExit(child),
        new Promise((resolve) => {
            setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) {
                    child.kill('SIGKILL');
                }
                resolve();
            }, 4_000);
        }),
    ]);
}
/**
 * 等待forexit。
 */
async function waitForExit(child) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    await new Promise((resolve) => {
        child.once('exit', () => resolve());
    });
}
/**
 * 运行节点script。
 */
async function runNodeScript(scriptPath, extraEnv) {
    await new Promise((resolve, reject) => {
/**
 * 记录子进程。
 */
        const child = (0, node_child_process_1.spawn)('node', [scriptPath], {
            cwd: repoRoot,
            env: {
                ...process.env,
                ...extraEnv,
                SERVER_RUNTIME_ENV: process.env.SERVER_RUNTIME_ENV || 'test',
            },
            stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`script ${path.basename(scriptPath)} failed: code=${code ?? 'null'} signal=${signal ?? 'none'}`));
        });
    });
}

async function autoCleanupSmokeArtifacts(stage) {
  if (!hasDatabaseUrl()) {
    return;
  }
  if (process.env.SERVER_SMOKE_AUTO_CLEANUP === '0') {
    return;
  }
  const summary = await (0, smoke_player_cleanup_1.purgeSmokeTestArtifacts)({
    dryRun: false,
  });
  if (!summary || summary.skipped) {
    return;
  }
  const deleted = summary.deleted ?? {};
  const deletedTotal = Number(deleted.authRows ?? 0)
    + Number(deleted.identityRows ?? 0)
    + Number(deleted.snapshotRows ?? 0)
    + Number(deleted.legacyUserRows ?? 0)
    + Number(deleted.legacyPlayerRows ?? 0)
    + Number(deleted.instanceRows ?? 0);
  if (deletedTotal <= 0) {
    return;
  }
  process.stdout.write(
    `[server smoke] auto-cleanup ${stage}: `
    + `auth=${deleted.authRows ?? 0} `
    + `identity=${deleted.identityRows ?? 0} `
    + `snapshot=${deleted.snapshotRows ?? 0} `
    + `legacyUser=${deleted.legacyUserRows ?? 0} `
    + `legacyPlayer=${deleted.legacyPlayerRows ?? 0} `
    + `instance=${deleted.instanceRows ?? 0}\n`,
  );
}
/**
 * 解析已选值cases。
 */
function resolveSelectedCases() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录cases。
 */
    const cases = smokeCases.filter((entry) => {
        if (entry.name === 'persistence'
            || entry.name === 'player-domain-persistence'
            || entry.name === 'player-domain-recovery'
      || entry.name === 'durable-operation'
      || entry.name === 'gm-database') {
      return includePersistence || isSelectedSmokeCase(entry.name);
        }
        return true;
    });
    if (selectedCaseNames.length === 0 && selectedGroupNames.length === 0) {
        return cases;
    }
/**
 * 记录已选值。
 */
    const selected = new Set(selectedCaseNames);
    for (const groupName of selectedGroupNames) {
        const groupCases = SMOKE_CASE_GROUPS[groupName];
        if (!Array.isArray(groupCases)) {
            throw new Error(`unknown smoke group: ${groupName}`);
        }
        for (const caseName of groupCases) {
            selected.add(caseName);
        }
    }
/**
 * 记录resolved。
 */
    const resolved = cases.filter((entry) => selected.has(entry.name));
    if (resolved.length !== selected.size) {
/**
 * 记录known。
 */
        const known = new Set(cases.map((entry) => entry.name));
/**
 * 记录unknown。
 */
        const unknown = [...selected].filter((name) => !known.has(name));
        throw new Error(`unknown smoke case: ${unknown.join(', ')}`);
    }
    return resolved;
}
function isSelectedSmokeCase(caseName) {
    if (selectedCaseNames.includes(caseName)) {
        return true;
    }
    return selectedGroupNames.some((groupName) => {
        const groupCases = SMOKE_CASE_GROUPS[groupName];
        return Array.isArray(groupCases) && groupCases.includes(caseName);
    });
}
const CASE_NODE_ID_INSTANCE_IDS = new Map([
    ['auth-bootstrap', ['public:yunlai_town']],
    ['auth-bootstrap-native', ['public:yunlai_town']],
    ['auth-bootstrap-legacy-import', ['public:yunlai_town']],
    ['combat', ['public:yunlai_town']],
    ['gm', ['public:yunlai_town']],
    ['loot', ['public:yunlai_town']],
    ['progression', ['public:yunlai_town']],
    ['player-recovery', ['public:yunlai_town']],
    ['player-respawn', ['public:yunlai_town']],
    ['runtime', ['public:yunlai_town']],
    ['monster-combat', ['real:wildlands', 'public:wildlands']],
    ['monster-ai', ['real:wildlands', 'public:wildlands']],
    ['monster-loot', ['public:yunlai_town']],
    ['monster-runtime', ['real:wildlands', 'public:wildlands']],
    ['monster-skill', ['real:wildlands', 'public:wildlands']],
    ['monster-reset', ['real:wildlands', 'public:wildlands']],
]);
const MONSTER_WILDLANDS_SMOKE_CASES = new Set([
    'monster-runtime',
    'monster-combat',
    'monster-ai',
    'monster-skill',
    'monster-reset',
]);
/**
 * 规范化 nodeId 字符串。
 */
function normalizeSmokeNodeId(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/**
 * 按 case 从数据库恢复当前节点归属。
 */
async function resolveCaseNodeId(entry, databaseUrl) {
    if (!databaseUrl) {
        return '';
    }
    const candidateInstanceIds = CASE_NODE_ID_INSTANCE_IDS.get(entry.name) ?? [];
    if (candidateInstanceIds.length === 0) {
        return '';
    }
    const pool = new pg.Pool({
        connectionString: databaseUrl,
        max: 1,
        idleTimeoutMillis: 1000,
        connectionTimeoutMillis: 3000,
    });
    try {
        for (const instanceId of candidateInstanceIds) {
            const result = await pool.query('SELECT assigned_node_id FROM instance_catalog WHERE instance_id = $1 LIMIT 1', [instanceId]);
            const assignedNodeId = normalizeSmokeNodeId(result.rows[0]?.assigned_node_id);
            if (assignedNodeId) {
                return assignedNodeId;
            }
        }
        return '';
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 解析caseextra环境变量。
 */
async function resolveCaseExtraEnv(entry) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录extra环境变量。
 */
    const extraEnv = {};
    if (MONSTER_WILDLANDS_SMOKE_CASES.has(entry.name)
        && !(typeof process.env.SERVER_SMOKE_INSTANCE_ID === 'string' && process.env.SERVER_SMOKE_INSTANCE_ID.trim())) {
        extraEnv.SERVER_SMOKE_INSTANCE_ID = 'real:wildlands';
    }
/**
 * 记录数据库地址。
 */
    const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
    if (databaseUrl) {
        extraEnv.SERVER_DATABASE_URL = databaseUrl;
        const externalNodeId = normalizeSmokeNodeId(process.env.SERVER_NODE_ID);
        if (externalNodeId) {
            extraEnv.SERVER_NODE_ID = externalNodeId;
        }
        else {
            const resolvedNodeId = await resolveCaseNodeId(entry, databaseUrl);
            if (resolvedNodeId) {
                extraEnv.SERVER_NODE_ID = resolvedNodeId;
            }
        }
    } else {
        extraEnv.DATABASE_URL = '';
        extraEnv.SERVER_DATABASE_URL = '';
        extraEnv.DATABASE_POOLER_URL = '';
        extraEnv.SERVER_DATABASE_POOLER_URL = '';
        extraEnv.SERVER_SKIP_LOCAL_ENV_AUTOLOAD = '1';
    }
    if (entry.name === 'gm'
        || entry.name === 'redeem-code'
        || entry.name === 'persistence'
        || entry.name === 'gm-database'
        || entry.name === 'auth-bootstrap'
        || entry.name === 'auth-bootstrap-native'
        || entry.name === 'auth-bootstrap-legacy-import') {
        extraEnv.SERVER_ALLOW_LEGACY_HTTP_COMPAT = '1';
    }
    if (entry.name === 'session') {
        extraEnv.SERVER_SESSION_DETACH_EXPIRE_MS = '4000';
    }
    if (entry.name === 'auth-bootstrap'
        || entry.name === 'auth-bootstrap-native'
        || entry.name === 'auth-bootstrap-legacy-import') {
        extraEnv.SERVER_SESSION_DETACH_EXPIRE_MS = '4000';
        extraEnv.SERVER_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL = '0';
        if (entry.name === 'auth-bootstrap-native') {
            extraEnv.SERVER_AUTH_BOOTSTRAP_PROFILE = 'mainline';
        }
        else if (entry.name === 'auth-bootstrap-legacy-import') {
            extraEnv.SERVER_AUTH_BOOTSTRAP_PROFILE = 'migration';
        }
/**
 * 记录tracesuffix。
 */
        const traceSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        extraEnv.SERVER_AUTH_TRACE_ENABLED = '1';
        extraEnv.SERVER_AUTH_TRACE_FILE = path.join(packageRoot, '.runtime', `auth-bootstrap-trace-${traceSuffix}.jsonl`);
    }
    if (LONG_RUNNING_SMOKE_CASES.has(entry.name)) {
        extraEnv.SERVER_SMOKE_TIMEOUT_MS = LONG_RUNNING_SMOKE_TIMEOUT_MS;
    }
    return extraEnv;
}
/**
 * 清理caseextra环境变量。
 */
function cleanupCaseExtraEnv(extraEnv) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录trace文件。
 */
    const traceFile = typeof extraEnv.SERVER_AUTH_TRACE_FILE === 'string' ? extraEnv.SERVER_AUTH_TRACE_FILE.trim() : '';
    if (!traceFile) {
        return;
    }
    try {
        path.isAbsolute(traceFile) && require('node:fs').rmSync(traceFile, { force: true });
    }
    catch {
        // ignore trace cleanup failures
    }
}
/**
 * 格式化 smoke 用例错误，保留首行原因用于最终汇总。
 */
function formatSmokeError(error) {
    if (error instanceof Error) {
        const message = error.message || error.stack || String(error);
        return message.split('\n')[0];
    }
    return String(error);
}
/**
 * attachServerLogTail：缓存服务端启动日志尾部，避免正常 CI 输出被 Nest 路由日志刷屏。
 */
function attachServerLogTail(child) {
    const lines = [];
    child.__serverSmokeLogTail = lines;
    const capture = (chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        for (const line of text.split(/\r?\n/)) {
            if (!line.trim()) {
                continue;
            }
            lines.push(line);
            if (lines.length > 160) {
                lines.splice(0, lines.length - 160);
            }
        }
    };
    child.stdout?.on?.('data', capture);
    child.stderr?.on?.('data', capture);
}
/**
 * dumpServerLogTail：仅在 case 失败时输出服务端日志尾部，保留定位线索。
 */
function dumpServerLogTail(child, caseName) {
    const lines = Array.isArray(child.__serverSmokeLogTail) ? child.__serverSmokeLogTail : [];
    if (lines.length === 0) {
        return;
    }
    process.stderr.write(`[server smoke] ${caseName} server log tail (${lines.length} lines)\n`);
    for (const line of lines) {
        process.stderr.write(`${line}\n`);
    }
}
function writeSmokeTiming(gate, results, startedAt) {
    const finishedAtMs = Date.now();
    const timingDir = path.join(repoRoot, '.runtime', 'verification-timings');
    const payload = {
        command: 'server smoke-suite',
        gate,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAtMs).toISOString(),
        durationMs: finishedAtMs - startedAt,
        caseDurations: results.map((result) => ({
            name: result.name,
            durationMs: result.durationMs,
            skipped: result.skipped === true,
            failed: result.failed === true,
            error: result.error ?? null,
        })),
        failedCase: results.find((result) => result.failed)?.name ?? null,
        environment: {
            dbEnabled: hasDatabaseUrl(),
            shadowEnabled: Boolean(process.env.SERVER_SHADOW_URL || process.env.SERVER_URL),
        },
    };
    try {
        fs.mkdirSync(timingDir, { recursive: true });
        fs.writeFileSync(path.join(timingDir, 'server-smoke-latest.json'), `${JSON.stringify(payload, null, 2)}\n`);
        fs.appendFileSync(path.join(timingDir, 'server-smoke-history.jsonl'), `${JSON.stringify(payload)}\n`);
        process.stdout.write(`[server smoke] timing=${path.relative(repoRoot, path.join(timingDir, 'server-smoke-latest.json'))}\n`);
    }
    catch (error) {
        process.stderr.write(`[server smoke] timing write failed: ${formatSmokeError(error)}\n`);
    }
}
/**
 * 等待for健康状态。
 */
async function waitForHealth(baseUrl, timeoutMs, options = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录require就绪状态。
 */
    const requireReady = options.requireReady === true;
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
        try {
/**
 * 记录response。
 */
            const response = await fetch(`${baseUrl}/health`);
            if (response.ok) {
                return;
            }
            if (!requireReady && response.status === 503) {
                return;
            }
        }
        catch {
            // ignore startup race
        }
        await delay(100);
    }
    throw new Error(`server health timeout: ${baseUrl}`);
}
/**
 * 判断是否已数据库URL。
 */
function hasDatabaseUrl() {
    return Boolean((0, env_alias_1.resolveServerDatabaseUrl)());
}
/**
 * 读取optionvalues。
 */
function readOptionValues(args, name) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录values。
 */
    const values = [];
    for (let index = 0; index < args.length; index += 1) {
/**
 * 记录当前值。
 */
        const current = args[index];
        if (current === name) {
/**
 * 记录next。
 */
            const next = args[index + 1];
            if (typeof next === 'string' && next.length > 0) {
                values.push(next);
                index += 1;
            }
            continue;
        }
        if (current.startsWith(`${name}=`)) {
/**
 * 记录价值。
 */
            const value = current.slice(name.length + 1).trim();
            if (value) {
                values.push(value);
            }
        }
    }
    return values;
}
/**
 * 分配free端口。
 */
async function allocateFreePort() {
    return new Promise((resolve, reject) => {
/**
 * 记录服务端。
 */
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
/**
 * 记录address。
 */
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('failed to allocate free port')));
                return;
            }
            const { port } = address;
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
}
/**
 * 处理delay。
 */
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
