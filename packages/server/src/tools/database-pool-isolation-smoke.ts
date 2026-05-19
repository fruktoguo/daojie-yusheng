import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { DatabasePoolProvider, resolveDatabasePoolGroup } from '../persistence/database-pool.provider';

async function main(): Promise<void> {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  if (!process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = 'postgres://127.0.0.1:5432/postgres';
  }

  const provider = new DatabasePoolProvider();
  const criticalPool = provider.getPool('player-session-route');
  const flushPoolFromPlayer = provider.getPool('player-domain');
  const flushPoolFromInstance = provider.getPool('instance-domain');
  const outboxPool = provider.getPool('outbox-dispatcher');
  const gmPool = provider.getPool('gm-diagnostics');

  assert.ok(criticalPool, 'critical pool should exist');
  assert.ok(flushPoolFromPlayer, 'flush pool should exist');
  assert.ok(outboxPool, 'outbox pool should exist');
  assert.ok(gmPool, 'gm diagnostics pool should exist');
  assert.strictEqual(flushPoolFromPlayer, flushPoolFromInstance, 'flush scopes should share the same flush pool');
  assert.notStrictEqual(criticalPool, flushPoolFromPlayer, 'critical pool should differ from flush pool');
  assert.notStrictEqual(outboxPool, flushPoolFromPlayer, 'outbox pool should differ from flush pool');
  assert.notStrictEqual(gmPool, flushPoolFromPlayer, 'gm pool should differ from flush pool');

  assert.equal(resolveDatabasePoolGroup('player-session-route'), 'runtimeCritical');
  assert.equal(resolveDatabasePoolGroup('player-domain'), 'flush');
  assert.equal(resolveDatabasePoolGroup('instance-domain'), 'flush');
  assert.equal(resolveDatabasePoolGroup('outbox-dispatcher'), 'outbox');
  assert.equal(resolveDatabasePoolGroup('gm-risk'), 'gmDiagnostics');

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

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'database-pool-isolation',
        answers: 'DatabasePoolProvider 已按 runtimeCritical / flush / outbox / gmDiagnostics 分组创建物理池，同组 scope 共享同一 pool，不同组池彼此独立。',
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
