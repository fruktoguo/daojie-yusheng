import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';

const DEFAULT_IDLE_MS = 1_500;

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'flush worker 需要数据库 ledger；缺少数据库连接时跳过。',
      excludes: '不证明独立 worker 认领、写入或多副本竞争。',
      completionMapping: 'release:proof:flush-task-worker',
    }, null, 2));
    return;
  }

  process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'worker';
  const { once, idleMs } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const runtime = app.get(FlushTaskRuntimeService);
  const workerId = process.env.SERVER_FLUSH_TASK_WORKER_ID?.trim() || `flush-task-worker:${process.pid}:${randomUUID()}`;

  try {
    if (once) {
      const processedCount = await runtime.runOnce(workerId);
      console.log(JSON.stringify({
        ok: true,
        once: true,
        workerId,
        processedCount,
        answers: 'flush worker once 模式已通过统一账本按优先级认领玩家/实例 dirty task，并调用正式 persistence flush 服务处理。',
        excludes: '不证明真实生产压测、跨节点故障注入或 5000/10000 容量上限。',
        completionMapping: 'release:proof:flush-task-worker',
      }, null, 2));
      return;
    }

    let processedCountTotal = 0;
    while (true) {
      processedCountTotal += await runtime.runOnce(workerId);
      await sleep(idleMs);
    }
  } finally {
    await app.close().catch(() => undefined);
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
        idleMs = Math.max(250, Math.min(60_000, Math.trunc(parsed)));
      }
    }
  }
  return { once, idleMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
