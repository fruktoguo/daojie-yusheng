import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { MailSoftDeletePurgeWorker } from '../runtime/world/mail-soft-delete-purge.worker';

const DEFAULT_IDLE_MS = 30_000;

async function main(): Promise<void> {
  const { once, idleMs } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const worker = app.get(MailSoftDeletePurgeWorker);

  try {
    const workerId = process.env.SERVER_MAIL_SOFT_DELETE_PURGE_WORKER_ID?.trim() || `mail-soft-delete-purge-worker-${randomUUID()}`;
    if (once) {
      const processedCount = await worker.runOnce();
      console.log(
        JSON.stringify(
          {
            ok: true,
            once: true,
            processedCount,
            workerId,
            answers: 'mail soft-delete purge worker 可独立清理热表里已经软删的邮件与附件',
            excludes: '不证明分区策略、vacuum 窗口或跨节点竞争',
            completionMapping: 'replace-ready:proof:with-db.mail-soft-delete-purge-worker',
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
