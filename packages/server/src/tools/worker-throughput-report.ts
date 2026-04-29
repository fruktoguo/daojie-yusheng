import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { OutboxDispatcherService } from '../persistence/outbox-dispatcher.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const flushLedger = app.get(FlushLedgerService);
  const outbox = app.get(OutboxDispatcherService);
  try {
    const playerRows = await flushLedger.listPlayerRecentThroughputSummary({ windowSeconds: 60 });
    const instanceRows = await flushLedger.listInstanceRecentThroughputSummary({ windowSeconds: 60 });
    const outboxSummary = await outbox.listRecentThroughputSummary({ windowSeconds: 60 });
    console.log(JSON.stringify({
      ok: true,
      windowSeconds: 60,
      playerRows,
      instanceRows,
      outboxSummary,
      answers: '最近一分钟内的 worker 吞吐可直接读取 player / instance / outbox 三条路径的 writes/sec 视图',
      excludes: '不证明真实多 worker 集群压测或故障注入',
      completionMapping: 'replace-ready:proof:stage6.worker-throughput',
    }, null, 2));
  } finally {
    await app.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
