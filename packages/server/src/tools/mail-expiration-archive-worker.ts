import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { MailExpirationCleanupWorker } from '../runtime/world/mail-expiration-cleanup.worker';

const DEFAULT_IDLE_MS = 5_000;

async function main(): Promise<void> {
  const { once, idleMs } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const worker = app.get(MailExpirationCleanupWorker);

  try {
    const workerId = process.env.SERVER_MAIL_EXPIRATION_ARCHIVE_WORKER_ID?.trim() || `mail-expiration-archive-worker-${randomUUID()}`;
    if (once) {
      const processedCount = await worker.runOnce(64);
      console.log(
        JSON.stringify(
          {
            ok: true,
            once: true,
            processedCount,
            workerId,
            answers: 'mail expiration archive worker 可稳定归档过期邮件到 archive 表并删除热表附件',
            excludes: '不证明多节点竞争、完整 vacuum 窗口或分区策略',
            completionMapping: 'release:proof:with-db.mail-expiration-archive-worker',
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
