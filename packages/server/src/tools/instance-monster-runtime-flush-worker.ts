import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { InstanceMonsterRuntimeFlushWorker } from '../runtime/world/instance-monster-runtime-flush.worker';

const DEFAULT_IDLE_MS = 2_000;

async function main(): Promise<void> {
  const { once, idleMs } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const worker = app.get(InstanceMonsterRuntimeFlushWorker);

  try {
    const workerId = process.env.SERVER_INSTANCE_MONSTER_RUNTIME_FLUSH_WORKER_ID?.trim()
      || `instance-monster-runtime-worker-${randomUUID()}`;
    if (once) {
      const processedCount = await worker.runOnce(workerId);
      console.log(
        JSON.stringify(
          {
            ok: true,
            once: true,
            processedCount,
            workerId,
            answers: 'instance monster runtime worker 可独立认领 instance_flush_ledger，并驱动 instance_monster_runtime_state 分域刷盘',
            excludes: '不证明多节点 worker 竞争、完整 dead-letter 或 Redis 唤醒',
            completionMapping: 'replace-ready:proof:with-db.instance-monster-runtime-flush-worker',
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
