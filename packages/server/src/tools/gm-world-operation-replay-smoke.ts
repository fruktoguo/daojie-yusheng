// @ts-nocheck

/**
 * 用途：执行 GM 重放单个 operation_id 命令的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmWorldService } = require('../http/native/native-gm-world.service');

function createService() {
  const replayed = [];
  const service = Object.create(NativeGmWorldService.prototype);
  service.playerPersistenceFlushService = { async flushPlayer() {} };
  service.mapPersistenceFlushService = { async flushInstance() {} };
  service.outboxDispatcherService = { async listRetryQueue() { return []; } };
  service.nodeRegistryService = {
    isEnabled() { return true; },
    getNodeId() { return 'node:self'; },
    listNodes() { return Promise.resolve([]); },
  };
  service.durableOperationService = {
    async getOperationReplay(operationId) {
      replayed.push(operationId);
      return {
        operation: { operation_id: operationId, status: 'committed' },
        outboxEvents: [
          { event_id: 'event:1', operation_id: operationId, status: 'delivered' },
        ],
        assetAuditLogs: [
          { log_id: 'log:1', operation_id: operationId, action: 'credit' },
        ],
      };
    },
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
  return { service, replayed };
}

async function main() {
  const { service, replayed } = createService();
  const payload = await service.replayOperation('op:gm-replay');
  assert.equal(replayed[0], 'op:gm-replay');
  assert.equal(payload.operation.operation_id, 'op:gm-replay');
  assert.equal(payload.outboxEvents[0].status, 'delivered');
  assert.equal(payload.assetAuditLogs[0].action, 'credit');
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-operation-replay',
    replay: payload,
  }, null, 2));
}

main();
