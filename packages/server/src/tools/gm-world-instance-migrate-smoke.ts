// @ts-nocheck

/**
 * 用途：执行 GM 手动迁移实例到指定节点命令的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmWorldService } = require('../http/native/native-gm-world.service');

function createService() {
  const migrated = [];
  const service = Object.create(NativeGmWorldService.prototype);
  service.playerPersistenceFlushService = { async flushPlayer() {} };
  service.mapPersistenceFlushService = { async flushInstance() {} };
  service.outboxDispatcherService = { async listRetryQueue() { return []; } };
  service.nodeRegistryService = {
    isEnabled() { return true; },
    getNodeId() { return 'node:self'; },
    listNodes() { return Promise.resolve([]); },
  };
  service.instanceCatalogService = {
    isEnabled() { return true; },
    async upsertInstanceCatalog(input) {
      migrated.push(input);
    },
  };
  service.worldRuntimeService = {
    getRuntimeSummary() { return {}; },
    getInstanceLeaseStatus() { return Promise.resolve(null); },
    freezeInstanceWriting() {},
    unfreezeInstanceWriting() { return { ok: true }; },
    async rebuildPersistentInstance() { return { ok: true }; },
    async migrateInstanceToNode(instanceId, targetNodeId) {
      migrated.push({ instanceId, targetNodeId, routed: true });
      return { ok: true };
    },
    async migratePlayerToNode() { return { ok: true }; },
    listInstances() { return []; },
    getInstance() {
      return { instanceId: 'instance:shadow-town' };
    },
    getPlayerLocation() { return null; },
    createInstance() { return { snapshot() { return {}; } }; },
    playerRuntimeService: { getPlayer() { return null; } },
    worldRuntimeGmQueueService: { hasPendingRespawns() { return false; }, hasPendingRespawn() { return false; } },
    worldRuntimeCommandIntakeFacadeService: { enqueueGmUpdatePlayer() { return { queued: false }; } },
  };
  return { service, migrated };
}

async function main() {
  const { service, migrated } = createService();
  const payload = await service.migrateInstanceToNode('instance:shadow-town', 'node:remote');
  assert.deepEqual(payload, { ok: true });
  assert.equal(migrated.length >= 1, true);
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-instance-migrate',
    migrated,
    result: payload,
  }, null, 2));
}

main();
