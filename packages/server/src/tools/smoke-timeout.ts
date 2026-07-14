/**
 * 用途：为单个烟测脚本安装统一超时，避免开发时被卡死用例长期阻塞。
 */
import { basename } from 'node:path';

import { flushRegisteredSmokePlayers } from './smoke-player-auth';

/**
 * 指定单个烟测默认超时时间。
 */
const DEFAULT_SMOKE_TIMEOUT_MS = 10_000;
const ENTRY_TIMEOUT_OVERRIDES_MS = new Map<string, number>([
  ['auth-bootstrap-smoke.js', 45_000],
  ['combat-smoke.js', 45_000],
  ['gm-smoke.js', 45_000],
  ['loot-smoke.js', 45_000],
  ['progression-smoke.js', 120_000],
  ['persistence-smoke.js', 90_000],
  ['player-recovery-smoke.js', 30_000],
  ['player-respawn-smoke.js', 30_000],
  ['player-domain-persistence-smoke.js', 30_000],
  ['player-domain-recovery-smoke.js', 30_000],
  ['player-domain-empty-overwrite-guard-smoke.js', 30_000],
  ['player-inventory-incremental-smoke.js', 30_000],
  ['player-columnar-schema-report.js', 60_000],
  ['snapshot-retirement-report-smoke.js', 30_000],
  ['durable-operation-smoke.js', 30_000],
  ['outbox-dispatcher-worker-smoke.js', 90_000],
  ['flush-task-worker-db-smoke.js', 30_000],
  ['map-snapshot-retirement-report-smoke.js', 30_000],
  ['player-session-route-handoff-smoke.js', 30_000],
  ['world-runtime-player-migrate-route-db-smoke.js', 30_000],
  ['world-runtime-player-migrate-handoff-db-smoke.js', 30_000],
  ['world-runtime-player-migrate-gateway-redirect-smoke.js', 30_000],
  ['instance-lease-runtime-smoke.js', 60_000],
  ['readiness-gate-smoke.js', 90_000],
  ['monster-skill-smoke.js', 60_000],
  ['gm-database-smoke.js', 900_000],
  ['shutdown-drain-smoke.js', 180_000],
  ['shutdown-signal-path-smoke.js', 180_000],
  ['gm-database-backup-persistence-smoke.js', 60_000],
  ['shadow-gm-database-proof.js', 240_000],
  ['multi-worker-flush-stability-report.js', 120_000],
  ['multi-worker-flush-stability-report-smoke.js', 120_000],
  ['map-snapshot-retirement-report-smoke.js', 30_000],
]);
/**
 * 解析是否关闭统一烟测超时。
 */
function isSmokeTimeoutDisabled(): boolean {
  const raw = process.env.SERVER_DISABLE_SMOKE_TIMEOUT;
  return raw === '1' || raw === 'true';
}

/**
 * 解析统一烟测超时时间，非法值回退到默认值。
 */
function resolveSmokeTimeoutMs(): number {
  const raw = process.env.SERVER_SMOKE_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_SMOKE_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SMOKE_TIMEOUT_MS;
  }
  return Math.trunc(parsed);
}

/**
 * 为当前烟测进程安装硬超时保护。
 */
function installSmokeTimeout(entryPath?: string): void {
  if (isSmokeTimeoutDisabled()) {
    return;
  }
  const entryLabel = basename(entryPath ?? process.argv[1] ?? 'smoke');
  const timeoutMs = ENTRY_TIMEOUT_OVERRIDES_MS.get(entryLabel) ?? resolveSmokeTimeoutMs();
  const timer = setTimeout(async () => {
    process.stderr.write(`[smoke-timeout] ${entryLabel} exceeded ${timeoutMs}ms and will exit\n`);
    try {
      await flushRegisteredSmokePlayers();
    } catch (error) {
      process.stderr.write(
        `[smoke-timeout] cleanup failed before exit: ${error instanceof Error ? (error.stack || error.message) : String(error)}\n`,
      );
    }
    process.exit(124);
  }, timeoutMs);
  timer.unref();
  process.once('exit', () => {
    clearTimeout(timer);
  });
}

export { installSmokeTimeout };
