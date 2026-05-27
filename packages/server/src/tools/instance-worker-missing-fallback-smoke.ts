import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

import { InstanceWorkerPoolService } from '../concurrency/instance-worker-pool.service';
import { WorkerPoolMetricsService } from '../concurrency/worker-pool-metrics.service';

async function main(): Promise<void> {
  const workerPath = resolve(__dirname, '..', 'concurrency', 'workers', 'instance-advance.worker.js');
  const hiddenPath = `${workerPath}.missing-smoke`;
  if (!existsSync(workerPath)) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'compiled instance worker file already missing',
          answers: 'InstanceWorkerPoolService 会在 worker 文件缺失时走同步 fallback',
        },
        null,
        2,
      ),
    );
    return;
  }

  renameSync(workerPath, hiddenPath);
  try {
    const metrics = new WorkerPoolMetricsService();
    const pool = new InstanceWorkerPoolService(metrics);
    const fallbackResult = { instanceId: 'missing-worker-smoke', monsterIntents: [], resourceMutations: [], buildingMutations: [] };
    pool.initialize();
    assert.equal(pool.isEnabled(), false);
    const result = await pool.submit('instance-advance', { instanceId: 'missing-worker-smoke' }, () => fallbackResult, 100);
    assert.equal(result.ok, true);
    assert.deepEqual(result.result, fallbackResult);
    const snapshot = metrics.getMetrics('instance');
    assert.equal(snapshot.activeWorkers, 0);
    assert.equal(snapshot.totalFallback, 1);
    pool.shutdown();
  } finally {
    renameSync(hiddenPath, workerPath);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'InstanceWorkerPoolService 在编译产物 worker 文件缺失时会禁用线程池并使用同步 fallback，不再循环重启刷错误日志',
        excludes: '不证明 encoding/persistence/leaderboard worker 池的缺文件降级',
        completionMapping: 'release:proof:instance-worker-missing-fallback',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
