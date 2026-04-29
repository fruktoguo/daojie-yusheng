// @ts-nocheck

/**
 * 用途：执行 GM 强制刷单实例命令的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmWorldService } = require('../http/native/native-gm-world.service');

function createService() {
  const flushed = [];
  const service = Object.create(NativeGmWorldService.prototype);
  service.playerPersistenceFlushService = { async flushPlayer() {} };
  service.mapPersistenceFlushService = {
    async flushInstance(instanceId) {
      flushed.push(instanceId);
    },
  };
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
    async rebuildPersistentInstance() { return { ok: true }; },
    listInstances() { return []; },
    getInstance() { return null; },
    getPlayerLocation() { return null; },
    createInstance() { return { snapshot() { return {}; } }; },
    playerRuntimeService: { getPlayer() { return null; } },
    worldRuntimeGmQueueService: { hasPendingRespawns() { return false; }, hasPendingRespawn() { return false; } },
    worldRuntimeCommandIntakeFacadeService: { enqueueGmUpdatePlayer() { return { queued: false }; } },
  };
  return { service, flushed };
}

async function main() {
  const { service, flushed } = createService();
  const payload = await service.flushInstancePersistence('instance:shadow-town');
  assert.deepEqual(payload, { ok: true });
  assert.deepEqual(flushed, ['instance:shadow-town']);
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-instance-flush',
    flushed,
  }, null, 2));
}

main();
