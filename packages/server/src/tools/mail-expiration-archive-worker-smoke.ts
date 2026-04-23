// @ts-nocheck

/**
 * 用途：验证邮件过期归档 worker。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { MailExpirationCleanupWorker } = require('../runtime/world/mail-expiration-cleanup.worker');

function createWorker() {
  const calls = [];
  return {
    worker: new MailExpirationCleanupWorker({
      async cleanupExpiredMails(limit) {
        calls.push(limit);
        return 4;
      },
    }),
    calls,
  };
}

async function main() {
  const { worker, calls } = createWorker();
  const processed = await worker.runOnce(32);
  assert.equal(processed, 4);
  assert.deepEqual(calls, [32]);
  console.log(JSON.stringify({
    ok: true,
    case: 'mail-expiration-archive',
    processed,
    calls,
  }, null, 2));
}

main();
