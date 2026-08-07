import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { PersistenceWorkerPoolService } from '../concurrency/persistence-worker-pool.service';
import { WorkerPoolMetricsService } from '../concurrency/worker-pool-metrics.service';
import {
  buildPlayerSnapshotProjectionWritePlan,
  type PlayerDomainWritePlan,
} from '../persistence/player-domain-write-plan';

class RecoverablePersistenceWorkerPoolService extends PersistenceWorkerPoolService {
  private workerAvailable = false;

  setWorkerAvailable(available: boolean): void {
    this.workerAvailable = available;
  }

  protected override resolveWorkerPath(): string {
    return resolve(__dirname, '..', 'concurrency', 'workers', 'persistence-build.worker.js');
  }

  protected override workerFileExists(): boolean {
    return this.workerAvailable;
  }
}

async function main(): Promise<void> {
  const metrics = new WorkerPoolMetricsService();
  const pool = new RecoverablePersistenceWorkerPoolService(metrics);
  const snapshot = {
    savedAt: 1_720_000_000_000,
    placement: {
      templateId: 'yunlai_town',
      instanceId: 'public:yunlai_town',
      x: 12,
      y: 8,
      facing: 2,
    },
    inventory: {
      revision: 1,
      capacity: 24,
      items: [{ itemId: 'spirit_stone', count: 5 }],
    },
  };
  const payload = {
    playerId: 'missing-persistence-worker-smoke',
    snapshot,
    domains: ['inventory'],
    options: {},
  };
  const expected = await buildPlayerSnapshotProjectionWritePlan(
    payload.playerId,
    snapshot as never,
    payload.domains,
    payload.options,
  );

  pool.initialize();
  try {
    assert.equal(pool.isEnabled(), false);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const fallbackResult = await pool.submit<typeof payload, PlayerDomainWritePlan>(
        'persistence-build',
        payload,
        () => expected,
        100,
      );
      assert.equal(fallbackResult.ok, true);
      assert.deepEqual(fallbackResult.result, expected);
    }
    const degradedMetrics = metrics.getMetrics('persistence');
    assert.equal(degradedMetrics.activeWorkers, 0);
    assert.equal(degradedMetrics.totalFallback, 20);

    pool.setWorkerAvailable(true);
    await waitUntil(() => pool.isEnabled(), 3_000);
    const recoveredResult = await pool.submit<typeof payload, PlayerDomainWritePlan>(
      'persistence-build',
      payload,
      null,
      1_000,
    );
    assert.equal(recoveredResult.ok, true);
    assert.deepEqual(recoveredResult.result, expected);
    assert.ok(metrics.getMetrics('persistence').activeWorkers > 0);
  } finally {
    pool.shutdown();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'PersistenceWorkerPoolService 在编译产物暂缺时只进入同步 fallback，不循环拉起；文件恢复后自动重新启用线程池',
        excludes: '不证明 encoding/leaderboard worker 池的缺文件降级，也不覆盖数据库写入',
        completionMapping: 'release:proof:persistence-worker-missing-fallback',
      },
      null,
      2,
    ),
  );
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`等待持久化 worker 恢复超时：${timeoutMs}ms`);
    }
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 25));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
