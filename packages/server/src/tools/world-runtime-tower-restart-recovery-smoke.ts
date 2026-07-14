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
  const failedTowerInstanceId = 'tower:tongtian:layer:48';
  const ordinaryMissingInstanceId = 'dungeon:missing:ordinary';
  const onlineRacePlayerId = 'player:tower-online-race';
  const runtimePlayers = new Map<string, { playerId: string; templateId: string; sessionId: string | null }>();
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
            { playerId: onlineRacePlayerId, instanceId: towerInstanceId, x: 5, y: 18 },
            { playerId: 'player:tower-failed', instanceId: failedTowerInstanceId, x: 4, y: 17 },
            { playerId: 'player:ordinary', instanceId: ordinaryMissingInstanceId, x: 1, y: 2 },
          ];
        },
      },
      async restoreOfflineHangingPlayer(playerId: string) {
        log.push(['restorePlayer', playerId]);
        const player = {
          playerId,
          templateId: 'tongtian_tower_layer_47',
          sessionId: null,
          respawnTemplateId: 'yunlai_town',
          respawnInstanceId: 'public:yunlai_town',
          respawnX: 10,
          respawnY: 10,
        };
        runtimePlayers.set(playerId, player);
        return player;
      },
      async ensureRuntimeOwnershipClaimed(playerId: string) {
        log.push(['claimPlayer', playerId]);
        if (playerId === onlineRacePlayerId) {
          const player = runtimePlayers.get(playerId);
          assert.ok(player);
          player.sessionId = 'session:online';
        }
        return { runtimeOwnerId: `owner:${playerId}`, sessionEpoch: 2 };
      },
      getPlayer(playerId: string) {
        return runtimePlayers.get(playerId) ?? null;
      },
      removePlayerRuntime(playerId: string) {
        log.push(['removePlayer', playerId]);
      },
    },
    worldRuntimeTongtianTowerService: {
      async materializeLayerInstanceForRestore(
        input: { instanceId?: string | null },
        _deps: unknown,
        options: { allowCreateIfMissing?: boolean },
      ) {
        log.push(['materializeTower', input.instanceId, options]);
        assert.equal(options.allowCreateIfMissing, false, '离线恢复只能物化 catalog 已存在的塔层');
        if (input.instanceId === failedTowerInstanceId) {
          throw new Error('simulated_tower_materialization_failure');
        }
        assert.equal(input.instanceId, towerInstanceId);
        instances.set(towerInstanceId, towerInstance);
        log.push(['hydrateTower', input.instanceId]);
        towerInstance.meta.assignedNodeId = 'node:local';
        towerInstance.meta.leaseToken = 'lease:local';
        towerInstance.meta.leaseExpireAt = new Date(Date.now() + 60_000).toISOString();
        towerInstance.meta.runtimeStatus = 'leased';
        writableInstanceIds.add(towerInstanceId);
        attachableInstanceIds.add(towerInstanceId);
        return towerInstance;
      },
    },
    getInstanceRuntime(instanceId: string) {
      return instances.get(instanceId) ?? null;
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
      async connectPlayerWhenReady(input: {
        playerId: string;
        sessionId: null;
        instanceId: string;
        allowCreateFallback?: boolean;
        allowUnavailableTowerRespawnFallback?: boolean;
      }) {
        log.push(['connectPlayerWhenReady', input]);
        assert.equal(input.playerId, 'player:tower-failed');
        assert.equal(input.instanceId, failedTowerInstanceId);
        assert.equal(input.allowCreateFallback, false);
        assert.equal(input.allowUnavailableTowerRespawnFallback, true);
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
  assert.equal(result.restored, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.candidates, 4);
  assert.deepEqual(result.skippedByReason, { player_became_online: 1, instance_missing: 1 });
  assert.equal(
    log.findIndex((entry) => Array.isArray(entry) && entry[0] === 'hydrateTower')
      < log.findIndex((entry) => Array.isArray(entry) && entry[0] === 'restorePlayer'),
    true,
    '必须先完成塔层 catalog lease 裁定与 hydrate，再加载并认领玩家运行态',
  );
  assert.equal(
    log.some((entry) => Array.isArray(entry) && entry[0] === 'restorePlayer' && entry[1] === 'player:ordinary'),
    false,
    '普通缺失实例仍应在玩家加载前被拒绝',
  );
  assert.equal(
    log.some((entry) => Array.isArray(entry) && entry[0] === 'restorePlayer' && entry[1] === 'player:tower-failed'),
    true,
    '物化失败的塔层必须加载玩家运行态，才能按绑定复活点安全撤离',
  );
  assert.equal(
    log.some((entry) => Array.isArray(entry)
      && entry[0] === 'connectPlayerWhenReady'
      && (entry[1] as { playerId?: string })?.playerId === 'player:tower-failed'),
    true,
    '物化失败的塔层玩家必须进入通天塔专用复活点撤离链路',
  );
  assert.equal(
    log.some((entry) => Array.isArray(entry)
      && entry[0] === 'connectPlayer'
      && (entry[1] as { playerId?: string })?.playerId === onlineRacePlayerId),
    false,
    'ownership claim 等待期间上线的玩家不得被离线恢复重新附着',
  );
  assert.equal(
    log.some((entry) => Array.isArray(entry)
      && entry[0] === 'assignRoute'
      && (entry[1] as { playerId?: string })?.playerId === onlineRacePlayerId),
    false,
    'ownership claim 等待期间上线的玩家不得被写回 offline route',
  );
  assert.equal(
    log.some((entry) => Array.isArray(entry)
      && entry[0] === 'warn'
      && String(entry[1]).includes(`离线挂机通天塔实例按需物化异常：${failedTowerInstanceId}`)),
    true,
    '单层物化异常必须被批次内隔离并记录，不能中断其他塔层恢复',
  );
  console.log(JSON.stringify({ ok: true, case: 'world-runtime-tower-restart-recovery' }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
