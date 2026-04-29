// @ts-nocheck

/**
 * 用途：验证邮件软删周期清理 worker。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { MailSoftDeletePurgeWorker } = require('../runtime/world/mail-soft-delete-purge.worker');

function createWorker() {
  const calls = [];
  return {
    worker: new MailSoftDeletePurgeWorker({
      async purgeSoftDeletedMails(input) {
        calls.push(input);
        return 5;
      },
    }),
    calls,
  };
}

async function main() {
  const { worker, calls } = createWorker();
  const processed = await worker.runOnce(40, 21);
  assert.equal(processed, 5);
  assert.deepEqual(calls, [{ retentionDays: 21, limit: 40 }]);
  console.log(JSON.stringify({
    ok: true,
    case: 'mail-soft-delete-purge',
    processed,
    calls,
  }, null, 2));
}

main();
