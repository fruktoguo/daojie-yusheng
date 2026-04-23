// @ts-nocheck

/**
 * 用途：验证 destroyed/stopped 实例的子表清理 worker。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { InstanceStatePurgeWorker } = require('../runtime/world/instance-state-purge.worker');

function createService() {
  const purged = [];
  return {
    worker: new InstanceStatePurgeWorker(
      {
        async listInstanceCatalogEntries() {
          return [
            { instance_id: 'instance:dead', status: 'destroyed', runtime_status: 'stopped' },
            { instance_id: 'instance:alive', status: 'active', runtime_status: 'running' },
          ];
        },
      },
      {
        async purgeInstanceState(instanceId) {
          purged.push(instanceId);
          return 8;
        },
      },
      {
        getInstanceRuntime(instanceId) {
          return instanceId === 'instance:dead'
            ? { meta: { status: 'destroyed', runtimeStatus: 'stopped' } }
            : { meta: { status: 'active', runtimeStatus: 'running' } };
        },
      },
    ),
    purged,
  };
}

async function main() {
  const { worker, purged } = createService();
  const processed = await worker.runOnce();
  assert.equal(processed, 1);
  assert.deepEqual(purged, ['instance:dead']);
  console.log(JSON.stringify({
    ok: true,
    case: 'instance-state-purge',
    processed,
    purged,
  }, null, 2));
}

main();
