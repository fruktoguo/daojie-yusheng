import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { DatabasePoolProvider, resolveDatabasePoolGroup } from '../persistence/database-pool.provider';

async function main(): Promise<void> {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const timeoutEnvKeys = [
    'SERVER_DATABASE_POOL_FLUSH_STATEMENT_TIMEOUT_MS',
    'DATABASE_POOL_FLUSH_STATEMENT_TIMEOUT_MS',
    'SERVER_DATABASE_POOL_FLUSH_QUERY_TIMEOUT_MS',
    'DATABASE_POOL_FLUSH_QUERY_TIMEOUT_MS',
    'SERVER_DATABASE_POOL_FLUSH_LOCK_TIMEOUT_MS',
    'DATABASE_POOL_FLUSH_LOCK_TIMEOUT_MS',
    'SERVER_DATABASE_POOL_GM_DIAGNOSTICS_STATEMENT_TIMEOUT_MS',
    'DATABASE_POOL_GM_DIAGNOSTICS_STATEMENT_TIMEOUT_MS',
    'SERVER_DATABASE_POOL_GM_DIAGNOSTICS_QUERY_TIMEOUT_MS',
    'DATABASE_POOL_GM_DIAGNOSTICS_QUERY_TIMEOUT_MS',
    'SERVER_DATABASE_POOL_GM_DIAGNOSTICS_LOCK_TIMEOUT_MS',
    'DATABASE_POOL_GM_DIAGNOSTICS_LOCK_TIMEOUT_MS',
  ];
  const originalTimeoutEnv = new Map(timeoutEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of timeoutEnvKeys) {
    delete process.env[key];
  }
  if (!process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = 'postgres://127.0.0.1:5432/postgres';
  }

  const provider = new DatabasePoolProvider();
  const criticalPool = provider.getPool('player-session-route');
  const flushPoolFromPlayer = provider.getPool('player-domain');
  const flushPoolFromInstance = provider.getPool('instance-domain');
  const gmAuditPool = provider.getPool('gm-audit-log');
  const combatAuditPool = provider.getPool('combat-audit-outbox');
  const outboxPool = provider.getPool('outbox-dispatcher');
  const gmPool = provider.getPool('gm-diagnostics');

  assert.ok(criticalPool, 'critical pool should exist');
  assert.ok(flushPoolFromPlayer, 'flush pool should exist');
  assert.ok(outboxPool, 'outbox pool should exist');
  assert.ok(gmPool, 'gm diagnostics pool should exist');
  assert.strictEqual(flushPoolFromPlayer, flushPoolFromInstance, 'flush scopes should share the same flush pool');
  assert.strictEqual(gmAuditPool, flushPoolFromPlayer, 'GM audit persistence should share the flush pool');
  assert.strictEqual(combatAuditPool, flushPoolFromPlayer, 'combat audit outbox writes should share the flush pool, not the outbox dispatcher pool');
  assert.notStrictEqual(criticalPool, flushPoolFromPlayer, 'critical pool should differ from flush pool');
  assert.notStrictEqual(outboxPool, flushPoolFromPlayer, 'outbox pool should differ from flush pool');
  assert.notStrictEqual(gmPool, flushPoolFromPlayer, 'gm pool should differ from flush pool');
  for (const pool of [criticalPool, flushPoolFromPlayer, outboxPool, gmPool]) {
    assert.ok(pool.listenerCount('error') > 0, '每个共享连接池都必须监听空闲连接错误，避免数据库重启终止进程');
  }
  assert.doesNotThrow(() => {
    criticalPool.emit('error', new Error('terminating connection due to administrator command'));
  }, '数据库重启导致的空闲连接 error 事件不得升级为未捕获异常');
  assert.deepEqual(
    {
      statementTimeout: (flushPoolFromPlayer as unknown as { options: Record<string, unknown> }).options.statement_timeout,
      queryTimeout: (flushPoolFromPlayer as unknown as { options: Record<string, unknown> }).options.query_timeout,
      lockTimeout: (flushPoolFromPlayer as unknown as { options: Record<string, unknown> }).options.lock_timeout,
    },
    { statementTimeout: 10_000, queryTimeout: 12_000, lockTimeout: 5_000 },
  );
  assert.deepEqual(
    {
      statementTimeout: (gmPool as unknown as { options: Record<string, unknown> }).options.statement_timeout,
      queryTimeout: (gmPool as unknown as { options: Record<string, unknown> }).options.query_timeout,
      lockTimeout: (gmPool as unknown as { options: Record<string, unknown> }).options.lock_timeout,
    },
    { statementTimeout: 30_000, queryTimeout: 35_000, lockTimeout: 10_000 },
  );

  assert.equal(resolveDatabasePoolGroup('player-session-route'), 'runtimeCritical');
  assert.equal(resolveDatabasePoolGroup('player-domain'), 'flush');
  assert.equal(resolveDatabasePoolGroup('instance-domain'), 'flush');
  assert.equal(resolveDatabasePoolGroup('outbox-dispatcher'), 'outbox');
  assert.equal(resolveDatabasePoolGroup('gm-risk'), 'gmDiagnostics');
  assert.equal(resolveDatabasePoolGroup('gm-audit-log'), 'flush');
  assert.equal(resolveDatabasePoolGroup('gm-config'), 'flush');
  assert.equal(resolveDatabasePoolGroup('gm-runtime-flag'), 'flush');
  assert.equal(resolveDatabasePoolGroup('combat-audit-outbox'), 'flush');

  const stats = provider.getAllPoolStats();
  assert.deepEqual(Object.keys(stats).sort(), ['flush', 'gmDiagnostics', 'outbox', 'runtimeCritical']);
  assert.deepEqual(stats.flush, { totalCount: 0, idleCount: 0, waitingCount: 0 });
  assert.deepEqual(stats.runtimeCritical, { totalCount: 0, idleCount: 0, waitingCount: 0 });

  await provider.onModuleDestroy();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  for (const [key, value] of originalTimeoutEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'database-pool-isolation',
        answers: 'DatabasePoolProvider 已按四类负载隔离物理池，为连接、SQL、客户端查询和锁等待配置有界生产默认值，并捕获空闲连接断开以等待连接池自动恢复。',
        excludes: '不证明真实 PG 压力下的上限边界，只证明分组、统计和独立实例化。',
        completionMapping: 'persistence-root-fix.phase5.pool-isolation',
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
