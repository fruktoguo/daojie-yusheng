import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { OutboxDispatcherService } from '../persistence/outbox-dispatcher.service';
import { buildBacklogAlerts } from './worker-backlog-alert.helpers';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const flushLedger = app.get(FlushLedgerService);
  const outbox = app.get(OutboxDispatcherService);
  try {
    const playerRows = await flushLedger.listPlayerBacklogSummary();
    const instanceRows = await flushLedger.listInstanceBacklogSummary();
    const retryRows = await outbox.listRetryQueue({ limit: 20 });
    const alerts = buildBacklogAlerts({ playerRows, instanceRows, retryRows });
    console.log(
      JSON.stringify(
        {
          ok: true,
          playerRows,
          instanceRows,
          retryRows,
          alerts,
          answers: '单 worker 积压会被标成告警，但不会阻塞其它 worker；当前报告可直接看出哪个域/哪个队列 backlog 最高',
          excludes: '不证明 500/1000 真实压测、跨节点竞争或故障注入',
          completionMapping: 'release:proof:stage7.worker-backlog-alert',
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
