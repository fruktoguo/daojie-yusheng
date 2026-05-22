/**
 * 本文件实现后台 worker 或对应冷路径入口，负责把运行态变更异步落库、清理或压缩。
 *
 * 维护时要关注批量大小、重试幂等和中断恢复，不能让后台任务破坏服务端权威状态。
 */
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { InstanceResourceFlushWorker } from '../runtime/world/worker/instance-resource-flush.worker';
import { assertFullAppFlushWorkerAllowed } from './runtime-flush-worker-guard';

const DEFAULT_IDLE_MS = 2_000;

async function main(): Promise<void> {
  assertFullAppFlushWorkerAllowed('instance-resource-flush-worker');
  const { once, idleMs } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const worker = app.get(InstanceResourceFlushWorker);

  try {
    const workerId = process.env.SERVER_INSTANCE_FLUSH_WORKER_ID?.trim() || `instance-resource-worker-${randomUUID()}`;
    if (once) {
      const processedCount = await worker.runOnce(workerId);
      console.log(
        JSON.stringify(
          {
            ok: true,
            once: true,
            processedCount,
            workerId,
            answers: 'instance resource worker 可独立认领 instance_flush_ledger，并驱动 instance_tile_resource_state 分域刷盘',
            excludes: '不证明多节点 worker 竞争、完整 dead-letter 或 Redis 唤醒',
            completionMapping: 'release:proof:with-db.instance-resource-flush-worker',
          },
          null,
          2,
        ),
      );
      return;
    }

    await worker.runLoop(workerId, idleMs);
  } finally {
    await app.close();
  }
}

function parseArgs(argv: string[]): { once: boolean; idleMs: number } {
  let once = false;
  let idleMs = DEFAULT_IDLE_MS;
  for (const arg of argv) {
    if (arg === '--once') {
      once = true;
      continue;
    }
    if (arg.startsWith('--idle-ms=')) {
      const parsed = Number(arg.slice('--idle-ms='.length));
      if (Number.isFinite(parsed)) {
        idleMs = Math.max(250, Math.trunc(parsed));
      }
    }
  }
  return { once, idleMs };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
