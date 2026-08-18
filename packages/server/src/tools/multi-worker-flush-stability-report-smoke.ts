import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { cleanupBenchmarkRows, main as runMultiWorkerFlushStabilityReport } from './multi-worker-flush-stability-report';

async function main(): Promise<void> {
  process.env.MULTI_WORKER_FLUSH_PLAYER_COUNT ??= '16';
  process.env.MULTI_WORKER_FLUSH_INSTANCE_COUNT ??= '16';
  process.env.MULTI_WORKER_FLUSH_PLAYER_WORKERS ??= '4';
  process.env.MULTI_WORKER_FLUSH_INSTANCE_WORKERS ??= '4';
  process.env.MULTI_WORKER_FLUSH_CONCURRENCY ??= '4';
  process.env.MULTI_WORKER_FLUSH_DELAY_MS ??= '4';
  await assertCleanupOnlyTouchesCurrentBenchmarkIds(cleanupBenchmarkRows);
  await runMultiWorkerFlushStabilityReport();
}

async function assertCleanupOnlyTouchesCurrentBenchmarkIds(
  cleanupBenchmarkRows: (pool: { query(sql: string, params?: unknown[]): Promise<unknown> }, playerIds: string[], instanceIds: string[]) => Promise<void>,
): Promise<void> {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    async query(sql: string, params?: unknown[]): Promise<unknown> {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  await cleanupBenchmarkRows(pool, ['bench_multi_player_a'], ['public:bench_multi_instance_a']);
  if (queries.length !== 2) {
    throw new Error(`cleanup should issue exactly scoped player/instance deletes, got ${queries.length}`);
  }
  if (queries.some((entry) => /WHERE\s+domain\s*=\s*'snapshot'|WHERE\s+domain\s*=\s*'tile_resource'/iu.test(entry.sql))) {
    throw new Error(`cleanup must not delete all ledger rows by domain: ${JSON.stringify(queries)}`);
  }
  if (!queries.every((entry) => /ANY\(\$1::varchar\[\]\)/iu.test(entry.sql))) {
    throw new Error(`cleanup must scope deletes to current benchmark ids: ${JSON.stringify(queries)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
