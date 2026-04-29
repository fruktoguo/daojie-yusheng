// @ts-nocheck

/**
 * 用途：执行 GM 强制重建某实例命令的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmWorldService } = require('../http/native/native-gm-world.service');

function createService() {
  const rebuilt = [];
  const service = Object.create(NativeGmWorldService.prototype);
  service.playerPersistenceFlushService = { async flushPlayer() {} };
  service.mapPersistenceFlushService = { async flushInstance() {} };
  service.outboxDispatcherService = { async listRetryQueue() { return []; } };
  service.nodeRegistryService = {
    isEnabled() { return true; },
    getNodeId() { return 'node:self'; },
    listNodes() { return Promise.resolve([]); },
  };
  service.worldRuntimeService = {
    getRuntimeSummary() { return {}; },
    getInstanceLeaseStatus() { return Promise.resolve(null); },
    freezeInstanceWriting() {},
    unfreezeInstanceWriting() { return { ok: true }; },
    async rebuildPersistentInstance(instanceId) {
      rebuilt.push(instanceId);
      return { ok: true, snapshot: { instanceId, rebuilt: true } };
    },
    listInstances() { return []; },
    getInstance() { return null; },
    getPlayerLocation() { return null; },
    createInstance() { return { snapshot() { return {}; } }; },
    playerRuntimeService: { getPlayer() { return null; } },
    worldRuntimeGmQueueService: { hasPendingRespawns() { return false; }, hasPendingRespawn() { return false; } },
    worldRuntimeCommandIntakeFacadeService: { enqueueGmUpdatePlayer() { return { queued: false }; } },
  };
  return { service, rebuilt };
}

async function main() {
  const { service, rebuilt } = createService();
  const payload = await service.rebuildPersistentInstance('instance:shadow-town');
  assert.deepEqual(payload, { ok: true, snapshot: { instanceId: 'instance:shadow-town', rebuilt: true } });
  assert.deepEqual(rebuilt, ['instance:shadow-town']);
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-instance-rebuild',
    rebuilt,
    snapshot: payload?.snapshot ?? null,
  }, null, 2));
}

main();
