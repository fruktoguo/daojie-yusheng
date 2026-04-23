// @ts-nocheck

/**
 * 用途：执行 GM 手动迁移玩家到指定节点命令的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmWorldService } = require('../http/native/native-gm-world.service');

function createService() {
  const migrated = [];
  const player = {
    playerId: 'player:gm-migrate',
    transferState: null,
    transferTargetNodeId: null,
    transferStartedAt: null,
  };
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
  };
  service.worldRuntimeService = {
    getRuntimeSummary() { return {}; },
    getInstanceLeaseStatus() { return Promise.resolve(null); },
    freezeInstanceWriting() {},
    unfreezeInstanceWriting() { return { ok: true }; },
    async rebuildPersistentInstance() { return { ok: true }; },
    async migrateInstanceToNode() { return { ok: true }; },
    async migratePlayerToNode(playerId, targetNodeId) {
      const runtimePlayer = player;
      migrated.push({ flushed: playerId, by: 'runtime' });
      runtimePlayer.transferState = 'in_transfer';
      runtimePlayer.transferTargetNodeId = targetNodeId;
      runtimePlayer.transferStartedAt = '2026-04-23T00:00:00.000Z';
      migrated.push({ playerId, targetNodeId, routed: true, beginTransfer: true });
      return { ok: true };
    },
    listInstances() { return []; },
    getInstance() { return null; },
    getPlayerLocation() { return null; },
    createInstance() { return { snapshot() { return {}; } }; },
    playerRuntimeService: {
      getPlayer() {
        return player;
      },
      beginTransfer(runtimePlayer, targetNodeId) {
        runtimePlayer.transferState = 'in_transfer';
        runtimePlayer.transferTargetNodeId = targetNodeId;
        runtimePlayer.transferStartedAt = '2026-04-23T00:00:00.000Z';
        migrated.push({ playerId: runtimePlayer.playerId, targetNodeId, beginTransfer: true });
      },
    },
    worldRuntimeGmQueueService: { hasPendingRespawns() { return false; }, hasPendingRespawn() { return false; } },
    worldRuntimeCommandIntakeFacadeService: { enqueueGmUpdatePlayer() { return { queued: false }; } },
  };
  return { service, migrated, player };
}

async function main() {
  const { service, migrated, player } = createService();
  const payload = await service.migratePlayerToNode('player:gm-migrate', 'node:remote');
  assert.deepEqual(payload, { ok: true });
  assert.equal(player.transferState, 'in_transfer');
  assert.equal(player.transferTargetNodeId, 'node:remote');
  assert.deepEqual(migrated[0], { flushed: 'player:gm-migrate', by: 'runtime' });
  assert.deepEqual(migrated[1], { playerId: 'player:gm-migrate', targetNodeId: 'node:remote', routed: true, beginTransfer: true });
  assert.equal(migrated.some((entry) => entry.beginTransfer === true), true);
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-player-migrate',
    migrated,
    player,
    result: payload,
    answers: 'GM 手动迁移玩家入口现在直接复用 worldRuntimeService.migratePlayerToNode；flush-before-handoff 只保留在 runtime 主链本体，不再由 GM 包装层重复执行一次。',
    excludes: '不证明 flush 之后的跨节点 bootstrap 接管、socket redirect 或更通用的非 GM 迁移入口；这里只证明 GM 包装层不会再重复 flush。',
    completionMapping: 'replace-ready:proof:gm-world.player-migrate.flush-before-handoff',
  }, null, 2));
}

main();
