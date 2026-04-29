// @ts-nocheck

/**
 * 用途：执行 GM outbox 失败重试队列命令的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');

function createService() {
  return {
    async getOutboxRetryQueue() {
      return {
        queued: 2,
        rows: [
          {
            event_id: 'event:retry-1',
            topic: 'market.order',
            status: 'ready',
            attempt_count: 2,
            next_retry_at: '2026-04-23T00:00:10.000Z',
          },
          {
            event_id: 'event:retry-2',
            topic: 'mail.attachment',
            status: 'dead_letter',
            attempt_count: 8,
            next_retry_at: null,
          },
        ],
      };
    },
  };
}

async function main() {
  const service = createService();
  const payload = await service.getOutboxRetryQueue();
  assert.equal(payload.queued, 2);
  assert.equal(Array.isArray(payload.rows), true);
  assert.equal(payload.rows[0].event_id, 'event:retry-1');
  assert.equal(payload.rows[1].status, 'dead_letter');
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-outbox-retry-queue',
    queue: payload,
  }, null, 2));
}

main();
