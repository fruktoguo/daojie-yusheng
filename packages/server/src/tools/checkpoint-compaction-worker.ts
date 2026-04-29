import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { CheckpointCompactionWorker } from '../runtime/world/checkpoint-compaction.worker';

const DEFAULT_IDLE_MS = 30_000;

async function main(): Promise<void> {
  const { once, idleMs } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const worker = app.get(CheckpointCompactionWorker);

  try {
    const workerId = process.env.SERVER_CHECKPOINT_COMPACTION_WORKER_ID?.trim() || `checkpoint-compaction-worker-${randomUUID()}`;
    if (once) {
      const processedCount = await worker.runOnce(workerId);
      console.log(
        JSON.stringify(
          {
            ok: true,
            once: true,
            processedCount,
            workerId,
            answers: 'checkpoint compaction worker 可独立认领 snapshot_checkpoint ledger，并驱动现有 flush 服务完成一次 checkpoint 刷盘',
            excludes: '不证明多节点 worker 竞争、Redis 唤醒或 dead-letter',
            completionMapping: 'replace-ready:proof:with-db.checkpoint-compaction-worker',
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
        idleMs = Math.max(1_000, Math.trunc(parsed));
      }
    }
  }
  return { once, idleMs };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
