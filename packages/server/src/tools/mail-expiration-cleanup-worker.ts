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
import { MailExpirationCleanupWorker } from '../runtime/world/worker/mail-expiration-cleanup.worker';

const DEFAULT_IDLE_MS = 1_500;

async function main(): Promise<void> {
  const { once, idleMs } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const worker = app.get(MailExpirationCleanupWorker);

  try {
    const workerId = process.env.SERVER_MAIL_EXPIRATION_WORKER_ID?.trim() || `mail-expiration-worker-${randomUUID()}`;
    if (once) {
      const processedCount = await worker.runOnce(64);
      console.log(
        JSON.stringify(
          {
            ok: true,
            once: true,
            processedCount,
            workerId,
            answers: 'mail expiration worker 可清理过期邮件并更新计数聚合',
            excludes: '不证明附件归档、跨节点竞争或 full vacuum 策略',
            completionMapping: 'release:proof:with-db.mail-expiration-worker',
          },
          null,
          2,
        ),
      );
      return;
    }

    await worker.runLoop(idleMs);
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
