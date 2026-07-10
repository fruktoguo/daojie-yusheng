import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { AssetAuditLogRetentionWorker } from '../runtime/world/worker/asset-audit-log-retention.worker';

interface RetentionCall {
  port: 'archive' | 'purge';
  retentionDays?: number;
  combatRetentionDays?: number;
  limit?: number;
}

function createWorker(): { worker: AssetAuditLogRetentionWorker; calls: RetentionCall[] } {
  const calls: RetentionCall[] = [];
  return {
    worker: new AssetAuditLogRetentionWorker({
      async archiveOldAssetAuditLogs(input): Promise<number> {
        calls.push({ port: 'archive', ...input });
        return 3;
      },
      async purgeArchivedAssetAuditLogs(input): Promise<number> {
        calls.push({ port: 'purge', ...input });
        return 4;
      },
    }),
    calls,
  };
}

async function main(): Promise<void> {
  const { worker, calls } = createWorker();
  const defaultProcessed = await worker.runOnce();
  assert.equal(defaultProcessed, 7);
  assert.deepEqual(calls, [
    { port: 'archive', retentionDays: 30, limit: 500 },
    { port: 'purge', retentionDays: 365, combatRetentionDays: 90, limit: 500 },
  ]);

  calls.length = 0;
  const customProcessed = await worker.runOnce({
    liveRetentionDays: 14,
    archiveRetentionDays: 180,
    combatArchiveRetentionDays: 45,
    archiveBatchLimit: 48,
    purgeBatchLimit: 64,
  });
  assert.equal(customProcessed, 7);
  assert.deepEqual(calls, [
    { port: 'archive', retentionDays: 14, limit: 48 },
    { port: 'purge', retentionDays: 180, combatRetentionDays: 45, limit: 64 },
  ]);

  calls.length = 0;
  await worker.runOnce({ archiveRetentionDays: 60, combatArchiveRetentionDays: 90 });
  assert.equal(calls[1]?.combatRetentionDays, 60);

  console.log(JSON.stringify({
    ok: true,
    case: 'asset-audit-log-retention',
    defaultProcessed,
    customProcessed,
    calls,
    answers: '热表审计按 30 天迁入 archive；archive 从事件创建时间起保留普通资产 365 天、战斗审计 90 天，并分批物理删除超期行。',
    excludes: '不证明 PostgreSQL 关系文件立即缩小；DELETE 释放的是可复用空间，物理缩容仍需受控维护。',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
