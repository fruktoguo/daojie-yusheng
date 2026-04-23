// @ts-nocheck

/**
 * 用途：验证资产审计日志归档 worker。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { AssetAuditLogRetentionWorker } = require('../runtime/world/asset-audit-log-retention.worker');

function createWorker() {
  const calls = [];
  return {
    worker: new AssetAuditLogRetentionWorker({
      async archiveOldAssetAuditLogs(input) {
        calls.push(input);
        return 3;
      },
    }),
    calls,
  };
}

async function main() {
  const { worker, calls } = createWorker();
  const processed = await worker.runOnce(48, 14);
  assert.equal(processed, 3);
  assert.deepEqual(calls, [{ retentionDays: 14, limit: 48 }]);
  console.log(JSON.stringify({
    ok: true,
    case: 'asset-audit-log-retention',
    processed,
    calls,
  }, null, 2));
}

main();
