import assert from 'node:assert/strict';

import {
  createNumericRatioDivisors,
  createNumericStats,
  DEFAULT_INVENTORY_CAPACITY,
} from '@mud/shared';

import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

function createPlayerRuntimeService() {
  return new PlayerRuntimeService(
    {
      createStarterInventory() {
        return {
          capacity: DEFAULT_INVENTORY_CAPACITY,
          items: [],
        };
      },
      createDefaultEquipment() {
        return {};
      },
      normalizeItem(item: unknown) {
        return item;
      },
      hydrateTechniqueState(entry: unknown) {
        return entry;
      },
    } as never,
    {
      has(mapId: string) {
        return mapId === 'yunlai_town';
      },
      getOrThrow(mapId: string) {
        return {
          id: mapId,
          spawnX: 32,
          spawnY: 5,
        };
      },
      list() {
        return [
          {
            id: 'yunlai_town',
            spawnX: 32,
            spawnY: 5,
          },
        ];
      },
    } as never,
    {
      createInitialState() {
        return {
          stage: '炼气',
          baseAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          finalAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          numericStats: createNumericStats(),
          ratioDivisors: createNumericRatioDivisors(),
        };
      },
      recalculate() {
        return undefined;
      },
    } as never,
    {
      initializePlayer() {
        return undefined;
      },
      refreshPreview() {
        return undefined;
      },
    } as never,
    undefined,
  );
}

async function main() {
  const service = createPlayerRuntimeService();
  const playerId = 'session:fence:player';

  const first = service.ensurePlayer(playerId, 'sid:first');
  const firstFence = service.getSessionFence(playerId);
  const firstDirtyDomains = service.listDirtyPlayerDomains().get(playerId);
  const firstPresence = service.describePersistencePresence(playerId);
  assert.equal(first.sessionId, 'sid:first');
  assert.equal(firstFence?.sessionEpoch, 1);
  assert.equal(firstPresence?.sessionEpoch, 1);
  assert.equal(firstPresence?.runtimeOwnerId, firstFence?.runtimeOwnerId);
  assert.equal(firstPresence?.online, true);
  assert.equal(firstPresence?.inWorld, false);
  assert.ok(firstFence?.runtimeOwnerId?.includes('sid:first'));
  assert.ok(firstDirtyDomains?.has('presence'));

  const firstOwner = firstFence?.runtimeOwnerId ?? '';
  const firstHeartbeat = Number(first.lastHeartbeatAt ?? 0);

  const refreshed = service.ensurePlayer(playerId, 'sid:first');
  const refreshedFence = service.getSessionFence(playerId);
  const refreshedDirtyDomains = service.listDirtyPlayerDomains().get(playerId);
  assert.equal(refreshed, first);
  assert.equal(refreshedFence?.sessionEpoch, 1);
  assert.equal(refreshedFence?.runtimeOwnerId, firstOwner);
  assert.ok(Number(refreshed.lastHeartbeatAt ?? 0) >= firstHeartbeat);
  assert.ok(refreshedDirtyDomains?.has('presence'));

  const seededPlayerId = 'session:fence:seeded';
  const seeded = await service.loadOrCreatePlayer(seededPlayerId, 'sid:seeded', async () => null, {
    sessionEpochFloor: 7,
  });
  const seededFence = service.getSessionFence(seededPlayerId);
  assert.equal(seeded.sessionId, 'sid:seeded');
  assert.equal(seededFence?.sessionEpoch, 8);
  assert.ok(seededFence?.runtimeOwnerId?.includes('sid:seeded'));

  const healedFence = service.ensureRuntimeSessionFenceAtLeast(seededPlayerId, 9);
  const healedPresence = service.describePersistencePresence(seededPlayerId);
  assert.equal(healedFence?.sessionEpoch, 10);
  assert.equal(healedPresence?.sessionEpoch, 10);
  assert.equal(healedPresence?.runtimeOwnerId, healedFence?.runtimeOwnerId);

  const replaced = service.ensurePlayer(playerId, 'sid:second');
  const replacedFence = service.getSessionFence(playerId);
  const replacedDirtyDomains = service.listDirtyPlayerDomains().get(playerId);
  const runtimeSnapshot = service.snapshot(playerId);
  assert.equal(replaced, first);
  assert.equal(replaced.sessionId, 'sid:second');
  assert.equal(replacedFence?.sessionEpoch, 2);
  assert.notEqual(replacedFence?.runtimeOwnerId, firstOwner);
  assert.ok(replacedFence?.runtimeOwnerId?.includes('sid:second'));
  assert.equal(runtimeSnapshot?.runtimeOwnerId, replacedFence?.runtimeOwnerId);
  assert.equal(runtimeSnapshot?.sessionEpoch, 2);
  assert.ok(replacedDirtyDomains?.has('presence'));

  let loaderCalled = false;
  const loaded = await service.loadOrCreatePlayer(playerId, 'sid:third', async () => {
    loaderCalled = true;
    return null;
  });
  const loadedFence = service.getSessionFence(playerId);
  service.beginTransfer(loaded, 'node:transfer-target');
  const transferFence = service.getSessionFence(playerId);
  const transferPresence = service.describePersistencePresence(playerId);
  service.enqueueNotice(playerId, { kind: 'system', text: 'transfer-buffered-notice' });
  const bufferedDuringTransfer = service.drainNotices(playerId);
  service.completeTransfer(loaded);
  const completedFence = service.getSessionFence(playerId);
  const completedPresence = service.describePersistencePresence(playerId);
  const drainedAfterTransfer = service.drainNotices(playerId);
  service.beginTransfer(loaded, 'node:expired-target');
  const expiredTransferFence = service.getSessionFence(playerId);
  loaded.transferStartedAt = Date.now() - 200_000;
  loaded.transferDeadlineAt = Date.now() - 100_000;
  const rolledBackPresence = service.describePersistencePresence(playerId);
  const logbookBefore = service.getPendingLogbookMessages(playerId);
  service.queuePendingLogbookMessage(playerId, { id: 'log:transfer', kind: 'system', text: 'transfer-logbook-buffer' });
  service.acknowledgePendingLogbookMessages(playerId, ['log:transfer']);
  const logbookAfter = service.getPendingLogbookMessages(playerId);
  assert.equal(loaded, first);
  assert.equal(loaderCalled, false);
  assert.equal(loadedFence?.sessionEpoch, 3);
  assert.ok(loadedFence?.runtimeOwnerId?.includes('sid:third'));
  assert.equal(transferFence?.sessionEpoch, 4);
  assert.notEqual(transferFence?.runtimeOwnerId, loadedFence?.runtimeOwnerId);
  assert.ok(transferFence?.runtimeOwnerId?.includes('sid:third'));
  assert.equal(transferPresence?.transferState, 'in_transfer');
  assert.equal(transferPresence?.transferTargetNodeId, 'node:transfer-target');
  assert.equal(transferPresence?.sessionEpoch, 4);
  assert.equal(transferPresence?.runtimeOwnerId, transferFence?.runtimeOwnerId);
  assert.equal(bufferedDuringTransfer.length, 0);
  assert.equal(completedFence?.sessionEpoch, 4);
  assert.equal(completedFence?.runtimeOwnerId, transferFence?.runtimeOwnerId);
  assert.equal(completedPresence?.transferState, null);
  assert.equal(completedPresence?.transferTargetNodeId, null);
  assert.equal(drainedAfterTransfer.length, 1);
  assert.equal(drainedAfterTransfer[0]?.text, 'transfer-buffered-notice');
  assert.equal(expiredTransferFence?.sessionEpoch, 5);
  assert.notEqual(expiredTransferFence?.runtimeOwnerId, transferFence?.runtimeOwnerId);
  assert.equal(rolledBackPresence?.transferState, null);
  assert.equal(rolledBackPresence?.transferTargetNodeId, null);
  assert.equal(rolledBackPresence?.transferStartedAt, null);
  assert.equal(rolledBackPresence?.transferDeadlineAt, null);
  assert.equal(rolledBackPresence?.sessionEpoch, 5);
  assert.equal(rolledBackPresence?.runtimeOwnerId, expiredTransferFence?.runtimeOwnerId);
  assert.equal(logbookBefore.length, 0);
  assert.equal(logbookAfter.length, 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        playerId,
        answers: 'PlayerRuntimeService 现已直接证明 bindRuntimeSession/refreshRuntimeSession 在同 sid 下只刷新 heartbeat，不增加 session_epoch；首次 loadOrCreatePlayer 现在还能吃入 sessionEpochFloor，把新 runtime fencing 直接抬到持久化 presence 之上；ensureRuntimeSessionFenceAtLeast() 可在运行中把当前 session_epoch/runtime_owner_id 自愈到指定下界之上；换 sid 的 takeover/rebind 会递增 session_epoch、轮换 runtime_owner_id，并把 presence 打入 dirtyDomains；beginTransfer() 也会在保留原 sessionId 的前提下递增 session_epoch、轮换 runtime_owner_id，把 transfer fencing 写入 presence 投影；transfer 期间的 in_transfer / transfer_target_node_id 会进入 presence 投影，notice 会被缓冲并在完成转移后再放行，转移超时后会自动回滚清理，logbook 相关写入口在过期后会停止推进可持久化内存态',
        excludes: '不证明跨节点 transfer 的分布式接管、bootstrap socket 合同、数据库 presence 回写时序或 durable transaction fencing，也不证明无外部触发时的独立定时器调度或完整的多频道消息复用',
        completionMapping: 'replace-ready:proof:player-runtime.session-fence',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
