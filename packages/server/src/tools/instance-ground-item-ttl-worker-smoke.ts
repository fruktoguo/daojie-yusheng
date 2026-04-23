// @ts-nocheck

/**
 * 用途：验证地面掉落物 TTL 清理 worker。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { InstanceGroundItemTtlCleanupWorker } = require('../runtime/world/instance-ground-item-ttl.worker');

function createService() {
  const removed = [];
  return {
    worker: new InstanceGroundItemTtlCleanupWorker(
      {
        listInstanceRuntimes() {
          return [
            { meta: { instanceId: 'instance:ttl', persistent: true } },
            { meta: { instanceId: 'instance:ignored', persistent: false } },
          ];
        },
      },
      {
        async loadGroundItems(instanceId) {
          return instanceId === 'instance:ttl'
            ? [
                { groundItemId: 'ground:expired', instanceId, tileIndex: 1, itemPayload: {}, expireAt: '2026-04-23T00:00:00.000Z' },
                { groundItemId: 'ground:alive', instanceId, tileIndex: 2, itemPayload: {}, expireAt: '2999-04-23T00:00:00.000Z' },
              ]
            : [];
        },
        async removeGroundItem(groundItemId) {
          removed.push(groundItemId);
          return true;
        },
      },
    ),
    removed,
  };
}

async function main() {
  const { worker, removed } = createService();
  const processed = await worker.runOnce();
  assert.equal(processed, 1);
  assert.deepEqual(removed, ['ground:expired']);
  console.log(JSON.stringify({
    ok: true,
    case: 'instance-ground-item-ttl-cleanup',
    processed,
    removed,
  }, null, 2));
}

main();
