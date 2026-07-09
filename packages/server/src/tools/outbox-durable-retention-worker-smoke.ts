import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { OutboxDurableRetentionWorker } from '../runtime/world/worker/outbox-durable-retention.worker';

async function main(): Promise<void> {
  const calls: Array<{ port: string; retentionDays?: number; limit?: number }> = [];
  const worker = new OutboxDurableRetentionWorker(
    {
      isEnabled: () => true,
      retainDeliveredOutbox: async (input) => {
        calls.push({ port: 'outbox', ...input });
        return { deliveredEventsDeleted: 2, consumerDedupeDeleted: 3 };
      },
    },
    {
      isEnabled: () => true,
      retainCommittedOperationLogs: async (input) => {
        calls.push({ port: 'durable', ...input });
        return { operationLogsDeleted: 5 };
      },
    },
  );

  const processed = await worker.runOnce({ retentionDays: 7, limit: 64, maxBatches: 1 });
  assert.equal(processed, 10);
  assert.deepEqual(calls, [
    { port: 'outbox', retentionDays: 7, limit: 64 },
    { port: 'durable', retentionDays: 7, limit: 64 },
  ]);

  console.log(JSON.stringify({
    ok: true,
    case: 'outbox-durable-retention',
    processed,
    calls,
    answers: 'Outbox/durable retention worker 会按同一保留期清理 delivered outbox、delivered dedupe 与 committed durable 操作日志。',
    excludes: '不证明真实 PostgreSQL 物理空间回收；物理释放仍需 VACUUM FULL/REINDEX 或受控维护窗口。',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
