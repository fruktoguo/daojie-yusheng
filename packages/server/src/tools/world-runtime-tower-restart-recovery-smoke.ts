import assert from 'node:assert/strict';

import { WorldRuntimeLifecycleService } from '../runtime/world/world-runtime-lifecycle.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

interface SmokeInstance {
  meta: {
    instanceId: string;
    assignedNodeId: string | null;
    leaseToken: string | null;
    leaseExpireAt: string | null;
    runtimeStatus: string;
    status: string;
  };
  template: { id: string };
}

async function main(): Promise<void> {
  const service = new WorldRuntimeLifecycleService();
  const log: unknown[] = [];
  const instances = new Map<string, SmokeInstance>();
  const writableInstanceIds = new Set<string>();
  const attachableInstanceIds = new Set<string>();
  const towerInstanceId = 'tower:tongtian:layer:47';
  const ordinaryMissingInstanceId = 'dungeon:missing:ordinary';
  const towerInstance: SmokeInstance = {
    meta: {
      instanceId: towerInstanceId,
      assignedNodeId: null,
      leaseToken: null,
      leaseExpireAt: null,
      runtimeStatus: 'running',
      status: 'active',
    },
    template: { id: 'tongtian_tower_layer_47' },
  };

  const result = await service.restoreOfflineHangingPlayers({
    playerRuntimeService: {
      playerDomainPersistenceService: {
        isEnabled() {
          return true;
        },
        async expireOfflineHangingPlayers() {
          log.push('expire');
          return 0;
        },
        async listOfflineHangingPlayerPositions() {
          log.push('positions');
          return [
            { playerId: 'player:tower', instanceId: towerInstanceId, x: 3, y: 16 },
            { playerId: 'player:ordinary', instanceId: ordinaryMissingInstanceId, x: 1, y: 2 },
          ];
        },
      },
      async restoreOfflineHangingPlayer(playerId: string) {
        log.push(['restorePlayer', playerId]);
        return {
          playerId,
          instanceId: towerInstanceId,
          templateId: 'tongtian_tower_layer_47',
        };
      },
      async ensureRuntimeOwnershipClaimed(playerId: string) {
        log.push(['claimPlayer', playerId]);
        return { runtimeOwnerId: `owner:${playerId}`, sessionEpoch: 2 };
      },
      removePlayerRuntime(playerId: string) {
        log.push(['removePlayer', playerId]);
      },
    },
    worldRuntimeTongtianTowerService: {
      activateCachedLayerInstanceForRestore(input: { instanceId?: string | null }) {
        log.push(['activateTower', input.instanceId]);
        assert.equal(input.instanceId, towerInstanceId);
        instances.set(towerInstanceId, towerInstance);
        return towerInstance;
      },
    },
    getInstanceRuntime(instanceId: string) {
      return instances.get(instanceId) ?? null;
    },
    async syncInstanceLease(instanceId: string, options: { allowForceReclaim?: boolean }) {
      log.push(['syncLease', instanceId, options]);
      assert.equal(instanceId, towerInstanceId);
      towerInstance.meta.assignedNodeId = 'node:local';
      towerInstance.meta.leaseToken = 'lease:local';
      towerInstance.meta.leaseExpireAt = new Date(Date.now() + 60_000).toISOString();
      towerInstance.meta.runtimeStatus = 'leased';
    },
    instanceReadyForPlayerAttach(instanceId: string) {
      const instance = instances.get(instanceId) ?? null;
      if (!instance) {
        return { ok: false, reason: 'instance_missing', instance: null };
      }
      if (instance.meta.assignedNodeId !== 'node:local' || !instance.meta.leaseToken) {
        return { ok: false, reason: 'lease_not_local', instance };
      }
      if (!attachableInstanceIds.has(instanceId)) {
        return { ok: false, reason: 'attach_gate_closed', instance };
      }
      return { ok: true, reason: 'ready', instance };
    },
    startupBarrierService: {
      getSnapshot() {
        return { instanceWriteOpen: true, instanceAttachOpen: true };
      },
      openInstanceWrites(instanceIds: Iterable<string>) {
        for (const instanceId of instanceIds) writableInstanceIds.add(instanceId);
        log.push(['openWrites', ...instanceIds]);
      },
      openInstanceAttach(instanceIds: Iterable<string>) {
        for (const instanceId of instanceIds) attachableInstanceIds.add(instanceId);
        log.push(['openAttach', ...instanceIds]);
      },
    },
    worldRuntimePlayerSessionService: {
      connectPlayer(input: {
        playerId: string;
        sessionId: null;
        instanceId: string;
        mapId?: string;
        preferredX?: number;
        preferredY?: number;
        allowCreateFallback?: boolean;
      }) {
        log.push(['connectPlayer', input]);
        assert.equal(input.instanceId, towerInstanceId);
        assert.equal(input.mapId, 'tongtian_tower_layer_47');
        assert.equal(input.preferredX, 3);
        assert.equal(input.preferredY, 16);
        assert.equal(input.allowCreateFallback, false);
        return { playerId: input.playerId };
      },
      async assignPlayerRoute(input: { playerId: string; nodeId: string; sessionEpoch: number; routeStatus: string }) {
        log.push(['assignRoute', input]);
      },
    },
    nodeRegistryService: {
      getNodeId() {
        return 'node:local';
      },
    },
    logger: {
      log(message: string) {
        log.push(['log', message]);
      },
      warn(message: string) {
        log.push(['warn', message]);
      },
    },
  } as any);

  assert.equal(writableInstanceIds.has(towerInstanceId), true, '恢复的塔层必须加入启动写入白名单');
  assert.equal(attachableInstanceIds.has(towerInstanceId), true, '恢复的塔层必须加入启动附着白名单');
  assert.equal(result.restored, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.skippedByReason, { instance_missing: 1 });
  assert.equal(
    log.findIndex((entry) => Array.isArray(entry) && entry[0] === 'syncLease')
      < log.findIndex((entry) => Array.isArray(entry) && entry[0] === 'restorePlayer'),
    true,
    '必须先完成塔层 lease 裁定，再加载并认领玩家运行态',
  );
  assert.equal(
    log.some((entry) => Array.isArray(entry) && entry[0] === 'restorePlayer' && entry[1] === 'player:ordinary'),
    false,
    '普通缺失实例仍应在玩家加载前被拒绝',
  );
  console.log(JSON.stringify({ ok: true, case: 'world-runtime-tower-restart-recovery' }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
