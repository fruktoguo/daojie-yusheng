import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { TongtianTowerCatalogInstanceTypeConversion } from '../gm/compat-conversions/conversions/world/tongtian-tower-catalog-instance-type';
import { TongtianTowerPersistenceService } from '../persistence/tongtian-tower-persistence.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { destroyManagedInstance } from '../runtime/world/world-runtime-instance-lease.helpers';
import { WorldRuntimePlayerSessionService } from '../runtime/world/world-runtime-player-session.service';
import { WorldRuntimeTongtianTowerService } from '../runtime/world/world-runtime-tongtian-tower.service';
import { WorldRuntimeWorldAccessService } from '../runtime/world/world-runtime-world-access.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

type CatalogRow = {
  instance_id: string;
  template_id: string;
  instance_type: 'tower';
  persistent_policy: 'persistent';
  status: 'active' | 'destroyed';
  runtime_status: 'running' | 'leased' | 'stopped';
  assigned_node_id: string | null;
  lease_token: string | null;
  lease_expire_at: string | null;
  ownership_epoch: number;
  metadata_version: number;
  shard_key: string;
  route_domain: 'system';
  destroy_at: string | null;
  last_active_at: string;
  last_persisted_at: string | null;
};

type HarnessMetrics = {
  catalogLoads: number;
  reviveCalls: number;
  claimCalls: number;
  renewCalls: number;
  releaseCalls: number;
  destroyCalls: number;
  hydrateCalls: number;
  reviveInputs: any[];
  replayEpochs: number[];
  mountedInstances: any[];
  clearedInstanceIds: string[];
  writableInstanceIds: Set<string>;
  attachableInstanceIds: Set<string>;
  order: string[];
};

async function main(): Promise<void> {
  const content = new ContentTemplateRepository();
  content.onModuleInit();
  const templates = new MapTemplateRepository();
  templates.onModuleInit();

  const legacyCatalogIdentity = await verifyLegacyCatalogIdentityConversion();
  const concurrent = await verifyConcurrentMaterialization(content, templates);
  const expiredDestroyAt = await verifyExpiredDestroyAtRevival(content, templates);
  const sameNodeFutureDestroyAt = await verifySameNodeFutureDestroyAtRenewal(content, templates);
  const otherNodeLease = await verifyOtherNodeValidLeaseFailsClosed(content, templates);
  const sameProcessReentry = await verifySameProcessDestroyAndReentry(content, templates);
  const hydrateRetry = await verifyHydrateFailureCleanupAndRetry(content, templates);
  const onlineConnect = await verifyOnlineConnectMaterializesBeforeResolve(content, templates);
  const catalogMissingSuccess = await verifyCatalogMissingCreateOpensGatesInOrder(content, templates);
  const createFailure = await verifyCatalogMissingCreateFailureIsContained(content, templates);
  const createUnready = await verifyCatalogMissingCreateUnreadyIsCleaned(content, templates);
  const degradedRuntime = await verifyPreexistingDegradedRuntimeIsPreserved(content, templates);
  const resetBarrier = await verifyResetBlocksNewMaterialization(content, templates);
  const publicFallbackGuard = verifyTowerTemplateCannotFallThroughToPublicInstance();
  const unavailableTowerRespawnFallback = await verifyUnavailableTowerFallsBackToBoundRespawn();

  console.log(JSON.stringify({
    ok: true,
    case: 'tongtian-tower-catalog-materialization',
    legacyCatalogIdentity,
    concurrent,
    expiredDestroyAt,
    sameNodeFutureDestroyAt,
    otherNodeLease,
    sameProcessReentry,
    hydrateRetry,
    onlineConnect,
    catalogMissingSuccess,
    createFailure,
    createUnready,
    degradedRuntime,
    resetBarrier,
    publicFallbackGuard,
    unavailableTowerRespawnFallback,
    answers: '旧 public 塔层只通过显式 GM 兼容转换修正 catalog identity 并推进 epoch/version；通天塔 catalog-backed 物化按 instanceId 单飞、每次从 catalog fresh load epoch；已到期 destroyAt 即使 status/runtimeStatus 尚未收敛也会按精确 identity + epoch 复活；hydrate 失败释放 lease 并丢弃本任务半水合 runtime；catalog 缺失的首次创建在 readiness 前登记 write gate、成功后才登记 attach gate；预先存在的 degraded runtime 与玩家保持不动；在线重连先物化再解析和附着。',
    excludes: '不证明真实 PostgreSQL 跨节点竞争；数据库 revival CAS 仍由 with-db 实例租约 smoke 负责。',
  }, null, 2));
}

async function verifyLegacyCatalogIdentityConversion(): Promise<{
  previewConvertible: number;
  applied: number;
  verified: number;
  preservedSkippedRows: number;
}> {
  const expiredAt = new Date(Date.now() - 60_000).toISOString();
  const futureLeaseAt = new Date(Date.now() + 60_000).toISOString();
  const rows = [
    createLegacyCatalogRow(28, { ownershipEpoch: 3, metadataVersion: 6 }),
    createLegacyCatalogRow(40, {
      status: 'active',
      runtimeStatus: 'running',
      ownershipEpoch: 5,
      metadataVersion: 7,
    }),
    createLegacyCatalogRow(41, { templateId: 'tongtian_tower_layer_wrong' }),
    createLegacyCatalogRow(50, {
      assignedNodeId: 'node:remote',
      leaseToken: 'lease:remote',
      leaseExpireAt: futureLeaseAt,
    }),
    {
      ...createLegacyCatalogRow(55),
      instance_type: 'tower',
    },
  ];
  for (const row of rows) {
    row.destroy_at = expiredAt;
  }

  const query = async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes('WHERE instance_id = ANY($1::varchar[])')) {
      const instanceIds = new Set(Array.isArray(params[0]) ? params[0] as string[] : []);
      const selected = rows.filter((row) => instanceIds.has(row.instance_id)).map((row) => ({ ...row }));
      return { rows: selected, rowCount: selected.length };
    }
    if (normalized.startsWith('SELECT instance_id') && normalized.includes("instance_type = 'public'")) {
      const selected = rows
        .filter((row) => row.instance_id.startsWith('tower:tongtian:layer:') && row.instance_type === 'public')
        .map((row) => ({ ...row }));
      return { rows: selected, rowCount: selected.length };
    }
    if (normalized.startsWith('UPDATE instance_catalog')) {
      const [instanceId, templateId, ownershipEpoch, metadataVersion, status, runtimeStatus] = params;
      const row = rows.find((entry) => entry.instance_id === instanceId);
      const eligible = row
        && row.template_id === templateId
        && row.instance_type === 'public'
        && row.persistent_policy === 'persistent'
        && row.owner_player_id === null
        && row.owner_sect_id === null
        && row.party_id === null
        && row.line_id === null
        && row.status === status
        && row.runtime_status === runtimeStatus
        && row.assigned_node_id === null
        && row.lease_token === null
        && row.lease_expire_at === null
        && row.ownership_epoch === ownershipEpoch
        && row.metadata_version === metadataVersion
        && row.shard_key === row.instance_id
        && row.route_domain === 'system'
        && new Date(row.destroy_at).getTime() <= Date.now();
      if (!row || !eligible) {
        return { rows: [], rowCount: 0 };
      }
      row.instance_type = 'tower';
      row.ownership_epoch += 1;
      row.metadata_version = Math.max(row.metadata_version + 1, row.ownership_epoch);
      return {
        rows: [{
          instance_id: row.instance_id,
          ownership_epoch: row.ownership_epoch,
          metadata_version: row.metadata_version,
        }],
        rowCount: 1,
      };
    }
    throw new Error(`未覆盖的通天塔 catalog 转换 SQL：${normalized}`);
  };
  const pool = {
    query,
    async connect() {
      return {
        query,
        release() {},
      };
    },
  };
  const conversion = new TongtianTowerCatalogInstanceTypeConversion({
    getPool() {
      return pool;
    },
  } as never, null);

  const preview = await conversion.run({ mode: 'dry-run' });
  assert.equal(preview.matchedRows, 4);
  assert.equal(preview.convertedRows, 2);
  assert.equal(preview.skippedRows, 2);

  const applied = await conversion.run({ mode: 'apply' });
  assert.equal(applied.matchedRows, 4);
  assert.equal(applied.convertedRows, 2);
  assert.equal(applied.skippedRows, 2);
  assert.equal(applied.failedRows, 0);
  assert.equal(applied.verifiedRows, 2);
  const layer28 = rows.find((row) => row.instance_id === 'tower:tongtian:layer:28');
  const layer40 = rows.find((row) => row.instance_id === 'tower:tongtian:layer:40');
  assert.equal(layer28?.instance_type, 'tower');
  assert.equal(layer28?.ownership_epoch, 4);
  assert.equal(layer28?.metadata_version, 7);
  assert.equal(layer40?.instance_type, 'tower');
  assert.equal(layer40?.ownership_epoch, 6);
  assert.equal(layer40?.metadata_version, 8);

  const repeated = await conversion.run({ mode: 'dry-run' });
  assert.equal(repeated.matchedRows, 2);
  assert.equal(repeated.convertedRows, 0);
  assert.equal(repeated.skippedRows, 2);

  return {
    previewConvertible: preview.convertedRows,
    applied: applied.convertedRows,
    verified: applied.verifiedRows,
    preservedSkippedRows: repeated.skippedRows,
  };
}

function createLegacyCatalogRow(layer: number, input: {
  templateId?: string;
  status?: 'active' | 'destroyed';
  runtimeStatus?: 'running' | 'stopped';
  assignedNodeId?: string | null;
  leaseToken?: string | null;
  leaseExpireAt?: string | null;
  ownershipEpoch?: number;
  metadataVersion?: number;
} = {}) {
  const instanceId = `tower:tongtian:layer:${layer}`;
  return {
    instance_id: instanceId,
    template_id: input.templateId ?? `tongtian_tower_layer_${layer}`,
    instance_type: 'public',
    persistent_policy: 'persistent',
    owner_player_id: null,
    owner_sect_id: null,
    party_id: null,
    line_id: null,
    status: input.status ?? 'destroyed',
    runtime_status: input.runtimeStatus ?? 'stopped',
    assigned_node_id: input.assignedNodeId ?? null,
    lease_token: input.leaseToken ?? null,
    lease_expire_at: input.leaseExpireAt ?? null,
    ownership_epoch: input.ownershipEpoch ?? 1,
    metadata_version: input.metadataVersion ?? 1,
    shard_key: instanceId,
    route_domain: 'system',
    destroy_at: new Date(Date.now() - 60_000).toISOString(),
  };
}

async function verifyExpiredDestroyAtRevival(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ ownershipEpoch: number; destroyAtCleared: true }> {
  const harness = createHarness(content, templates, {
    layer: 46,
    ownershipEpoch: 50,
  });
  harness.catalog.status = 'active';
  harness.catalog.runtime_status = 'running';
  harness.catalog.assigned_node_id = null;
  harness.catalog.lease_token = null;
  harness.catalog.lease_expire_at = null;
  harness.catalog.destroy_at = new Date(Date.now() - 60_000).toISOString();

  const instance = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps);

  assert.ok(instance, '已到期 destroyAt 必须足以复活尚未收敛为 destroyed/stopped 的稳定塔层');
  assert.equal(harness.metrics.reviveCalls, 1);
  assert.equal(harness.metrics.claimCalls, 0, '已到期 destroyAt 不能误走普通 claim');
  assert.equal(harness.metrics.hydrateCalls, 1);
  assert.equal(harness.catalog.status, 'active');
  assert.equal(harness.catalog.runtime_status, 'leased');
  assert.equal(harness.catalog.destroy_at, null);
  assert.equal(instance.meta.ownershipEpoch, 51);

  return { ownershipEpoch: instance.meta.ownershipEpoch, destroyAtCleared: true };
}

async function verifyUnavailableTowerFallsBackToBoundRespawn(): Promise<{ instanceId: string; explicitRequestRejected: true }> {
  const towerInstanceId = 'tower:tongtian:layer:55';
  const respawnInstanceId = 'real:darksoil_abyss';
  const locations = new Map<string, { instanceId: string; sessionId: string | null }>();
  const player = {
    playerId: 'player:stale-tower',
    sessionId: 'session:stale-tower',
    hp: 100,
    attrs: { numericStats: { moveSpeed: 12 } },
    respawnTemplateId: 'darksoil_abyss',
    respawnInstanceId,
    respawnX: 43,
    respawnY: 7,
  };
  const respawnInstance = {
    meta: { instanceId: respawnInstanceId, status: 'active', runtimeStatus: 'running' },
    template: { id: 'darksoil_abyss' },
    connectPlayer(input: { sessionId: string | null; preferredX?: number; preferredY?: number }) {
      assert.equal(input.preferredX, 43);
      assert.equal(input.preferredY, 7);
      return { sessionId: input.sessionId };
    },
    disconnectPlayer() { return true; },
    setPlayerMoveSpeed() {},
  };
  const session = new WorldRuntimePlayerSessionService({
    resolveDefaultRespawnMapId() { return 'yunlai_town'; },
    getOrCreatePublicInstance() { throw new Error('bound_respawn_must_be_used'); },
    getOrCreateDefaultLineInstance() { throw new Error('existing_bound_respawn_must_be_used'); },
    getPlayerViewOrThrow(playerId: string) {
      return { playerId, instance: { instanceId: locations.get(playerId)?.instanceId } };
    },
  } as any, null);
  const deps = {
    logger: { debug() {}, warn() {} },
    templateRepository: { has() { return true; } },
    worldRuntimeTongtianTowerService: {
      async materializeLayerInstanceForRestore() { return null; },
      ensureLayerInstanceForRestore() { return null; },
    },
    worldRuntimeGmQueueService: { clearPendingRespawn() {} },
    worldRuntimeNavigationService: { clearNavigationIntent() {} },
    worldSessionService: { purgePlayerSession() {} },
    playerRuntimeService: {
      ensurePlayer() { return player; },
      getPlayer() { return player; },
      removePlayerRuntime() {},
      syncFromWorldView(_playerId: string, _sessionId: string, view: unknown) { return view; },
    },
    getPlayerLocation(playerId: string) { return locations.get(playerId) ?? null; },
    setPlayerLocation(playerId: string, location: { instanceId: string; sessionId: string | null }) {
      locations.set(playerId, location);
    },
    clearPlayerLocation(playerId: string) { locations.delete(playerId); },
    clearPendingCommand() {},
    getInstanceRuntime(instanceId: string) {
      return instanceId === respawnInstanceId ? respawnInstance : null;
    },
  };

  const view = await session.connectPlayerWhenReady({
    playerId: player.playerId,
    sessionId: player.sessionId,
    instanceId: towerInstanceId,
    mapId: 'tongtian_tower_layer_55',
    allowCreateFallback: false,
    allowUnavailableTowerRespawnFallback: true,
  }, deps as any) as { instance: { instanceId: string } };
  assert.equal(view.instance.instanceId, respawnInstanceId);

  await assert.rejects(
    session.connectPlayerWhenReady({
      playerId: player.playerId,
      sessionId: player.sessionId,
      instanceId: towerInstanceId,
      mapId: 'tongtian_tower_layer_55',
      allowCreateFallback: false,
    }, deps as any),
    ServiceUnavailableException,
    '显式指定的通天塔目标仍必须失败关闭，不得暗中换图',
  );
  return { instanceId: view.instance.instanceId, explicitRequestRejected: true };
}

async function verifyConcurrentMaterialization(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ reviveCalls: number; hydrateCalls: number; ownershipEpoch: number }> {
  const harness = createHarness(content, templates, {
    layer: 41,
    ownershipEpoch: 13,
  });
  const request = {
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  };

  const [first, second] = await Promise.all([
    harness.tower.materializeLayerInstanceForRestore(request, harness.deps),
    harness.tower.materializeLayerInstanceForRestore(request, harness.deps),
  ]);

  assert.ok(first, '并发物化应返回已取得本地 lease 的塔层');
  assert.equal(second, first, '同一塔层的并发调用必须共享同一物化结果');
  assert.equal(harness.metrics.reviveCalls, 1, '并发物化只能执行一次 revival CAS');
  assert.equal(harness.metrics.hydrateCalls, 1, '并发物化只能执行一次 hydrate');
  assert.equal(first.meta.ownershipEpoch, 14);
  assert.equal(harness.catalog.ownership_epoch, 14);
  assert.equal(harness.catalog.destroy_at, null);
  assert.equal(harness.metrics.writableInstanceIds.has(harness.instanceId), true);
  assert.equal(harness.metrics.attachableInstanceIds.has(harness.instanceId), true);

  return {
    reviveCalls: harness.metrics.reviveCalls,
    hydrateCalls: harness.metrics.hydrateCalls,
    ownershipEpoch: first.meta.ownershipEpoch,
  };
}

async function verifySameNodeFutureDestroyAtRenewal(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ ownershipEpoch: number; destroyAtPreserved: true }> {
  const harness = createHarness(content, templates, {
    layer: 47,
    ownershipEpoch: 60,
  });
  const previousLeaseToken = 'lease:same-node-before-explicit-revival';
  harness.catalog.status = 'active';
  harness.catalog.runtime_status = 'leased';
  harness.catalog.assigned_node_id = harness.nodeId;
  harness.catalog.lease_token = previousLeaseToken;
  harness.catalog.lease_expire_at = new Date(Date.now() + 60_000).toISOString();
  harness.catalog.destroy_at = new Date(Date.now() + 120_000).toISOString();

  const instance = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps);

  const futureDestroyAt = harness.catalog.destroy_at;
  assert.ok(instance, '同节点有效 lease 在计划销毁到期前仍应正常物化');
  assert.equal(harness.metrics.reviveCalls, 0, 'future destroyAt 不是 tombstone，禁止显式 revival');
  assert.equal(harness.metrics.claimCalls, 0);
  assert.equal(harness.metrics.renewCalls, 1, 'future destroyAt 应沿用同节点 lease 正常续租');
  assert.equal(harness.metrics.hydrateCalls, 1);
  assert.deepEqual(harness.metrics.reviveInputs, []);
  assert.equal(harness.catalog.ownership_epoch, 60);
  assert.equal(harness.catalog.destroy_at, futureDestroyAt, '物化不得隐式取消计划销毁');
  assert.equal(harness.catalog.status, 'active');
  assert.equal(harness.catalog.runtime_status, 'leased');
  assert.equal(harness.catalog.lease_token, previousLeaseToken, '同节点续租必须沿用原 lease token');
  assert.equal(instance.meta.leaseToken, harness.catalog.lease_token);
  assert.equal(instance.meta.destroyAt, futureDestroyAt, '运行态必须保留 future destroyAt 供到期扫描执行');
  assert.equal(
    harness.tower.activateCachedLayerInstanceForRestore({
      instanceId: harness.instanceId,
      templateId: harness.templateId,
    }, harness.deps),
    instance,
    'future destroyAt 到期前的塔层必须仍可登录和重入',
  );

  return { ownershipEpoch: instance.meta.ownershipEpoch, destroyAtPreserved: true };
}

async function verifyOtherNodeValidLeaseFailsClosed(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ returnedNull: true; runtimeCleared: true }> {
  const harness = createHarness(content, templates, {
    layer: 48,
    ownershipEpoch: 70,
  });
  const otherNodeLeaseToken = 'lease:other-node';
  harness.catalog.status = 'active';
  harness.catalog.runtime_status = 'leased';
  harness.catalog.assigned_node_id = 'node:other';
  harness.catalog.lease_token = otherNodeLeaseToken;
  harness.catalog.lease_expire_at = new Date(Date.now() + 60_000).toISOString();
  harness.catalog.destroy_at = new Date(Date.now() + 120_000).toISOString();

  const instance = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps);

  assert.equal(instance, null, '异节点仍持有有效 lease 时必须 fail closed');
  assert.equal(harness.metrics.reviveCalls, 0);
  assert.equal(harness.metrics.claimCalls, 0);
  assert.equal(harness.metrics.renewCalls, 0);
  assert.equal(harness.metrics.hydrateCalls, 0);
  assert.equal(harness.deps.getInstanceRuntime(harness.instanceId), null);
  assert.equal(harness.catalog.ownership_epoch, 70);
  assert.equal(harness.catalog.assigned_node_id, 'node:other');
  assert.equal(harness.catalog.lease_token, otherNodeLeaseToken);
  assert.equal(harness.metrics.writableInstanceIds.has(harness.instanceId), false);
  assert.equal(harness.metrics.attachableInstanceIds.has(harness.instanceId), false);

  return { returnedNull: true, runtimeCleared: true };
}

async function verifySameProcessDestroyAndReentry(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ replayEpochs: number[]; ownershipEpoch: number }> {
  const harness = createHarness(content, templates, {
    layer: 42,
    ownershipEpoch: 20,
  });
  const staleStartupRow = {
    ...cloneCatalog(harness.catalog),
    ownership_epoch: 1,
    metadata_version: 1,
  };
  assert.equal(harness.tower.restoreCatalogTowerTemplate(staleStartupRow), true);

  const first = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps);
  assert.ok(first);
  assert.equal(first.meta.ownershipEpoch, 21, '首次物化必须采用 fresh catalog epoch 20，而非启动快照 epoch 1');

  const destroyed = await destroyManagedInstance(harness.deps, harness.instanceId, 'catalog_materialization_smoke');
  assert.deepEqual(destroyed, { ok: true });
  assert.equal(harness.catalog.ownership_epoch, 22, '同进程销毁必须先推进 catalog epoch');
  assert.equal(harness.deps.getInstanceRuntime(harness.instanceId), null);

  // 再次灌入旧启动快照，证明重入路径不会消费进程内陈旧 epoch。
  assert.equal(harness.tower.restoreCatalogTowerTemplate(staleStartupRow), true);
  const second = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps);
  assert.ok(second);
  assert.notEqual(second, first, '销毁后的再次物化必须使用全新的 runtime');
  assert.equal(second.meta.ownershipEpoch, 23, '再次物化必须 fresh load 销毁后的 catalog epoch 22');
  assert.equal(harness.metrics.reviveCalls, 2);
  assert.equal(harness.metrics.hydrateCalls, 2);
  assert.deepEqual(harness.metrics.replayEpochs, [20, 22]);

  return {
    replayEpochs: [...harness.metrics.replayEpochs],
    ownershipEpoch: second.meta.ownershipEpoch,
  };
}

async function verifyHydrateFailureCleanupAndRetry(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ releaseCalls: number; hydrateCalls: number; ownershipEpoch: number }> {
  const harness = createHarness(content, templates, {
    layer: 43,
    ownershipEpoch: 30,
    hydrateFailures: 1,
  });
  const request = {
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  };

  const failed = await harness.tower.materializeLayerInstanceForRestore(request, harness.deps);
  assert.equal(failed, null, 'hydrate 失败时不能返回可进入实例');
  assert.equal(harness.metrics.reviveCalls, 1);
  assert.equal(harness.metrics.hydrateCalls, 1);
  assert.equal(harness.metrics.releaseCalls, 1, 'hydrate 失败必须释放本次精确 lease');
  assert.equal(harness.deps.getInstanceRuntime(harness.instanceId), null, 'hydrate 失败必须删除半水合 runtime');
  assert.equal(harness.catalog.ownership_epoch, 31, 'revival 已完成时 epoch 不应回滚');
  assert.equal(harness.catalog.assigned_node_id, null);
  assert.equal(harness.catalog.lease_token, null);
  assert.equal(harness.catalog.runtime_status, 'running');
  assert.equal(harness.catalog.destroy_at, null);
  assert.equal(harness.metrics.attachableInstanceIds.has(harness.instanceId), false, '失败实例不得开放附着 gate');
  const failedInstance = harness.metrics.mountedInstances[0];
  assert.equal(failedInstance?.meta?.assignedNodeId, null);
  assert.equal(failedInstance?.meta?.leaseToken, null);
  assert.equal(failedInstance?.meta?.runtimeStatus, 'stopped');

  const recovered = await harness.tower.materializeLayerInstanceForRestore(request, harness.deps);
  assert.ok(recovered, '下一次物化应从 fresh catalog epoch 重新 claim 并完成 hydrate');
  assert.notEqual(recovered, failedInstance, '重试不能复用已经部分水合的对象');
  assert.equal(harness.metrics.reviveCalls, 1, 'tombstone 已清除后重试应走普通 exact claim');
  assert.equal(harness.metrics.claimCalls, 1);
  assert.equal(harness.metrics.hydrateCalls, 2);
  assert.equal(harness.metrics.releaseCalls, 1);
  assert.equal(recovered.meta.ownershipEpoch, 32);
  assert.equal(recovered.__catalogHydrated, true);
  assert.equal(harness.metrics.attachableInstanceIds.has(harness.instanceId), true);

  return {
    releaseCalls: harness.metrics.releaseCalls,
    hydrateCalls: harness.metrics.hydrateCalls,
    ownershipEpoch: recovered.meta.ownershipEpoch,
  };
}

async function verifyOnlineConnectMaterializesBeforeResolve(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ order: string[]; ownershipEpoch: number }> {
  const harness = createHarness(content, templates, {
    layer: 44,
    ownershipEpoch: 40,
  });
  const originalEnsure = harness.tower.ensureLayerInstanceForRestore.bind(harness.tower);
  (harness.tower as any).ensureLayerInstanceForRestore = (...args: unknown[]) => {
    harness.metrics.order.push('resolve-tower-instance');
    return (originalEnsure as (...input: unknown[]) => unknown)(...args);
  };

  const players = new Map<string, any>();
  const playerLocations = new Map<string, { instanceId: string; sessionId: string | null }>();
  harness.deps.worldRuntimeTongtianTowerService = harness.tower;
  harness.deps.worldRuntimeGmQueueService = {
    clearPendingRespawn() {},
  };
  harness.deps.worldRuntimeNavigationService = {
    clearNavigationIntent() {},
  };
  harness.deps.worldSessionService = {
    purgePlayerSession() {},
  };
  harness.deps.playerRuntimeService = {
    ensurePlayer(playerId: string, sessionId: string) {
      harness.metrics.order.push('ensure-player-runtime');
      const player = {
        playerId,
        sessionId,
        hp: 100,
        attrs: { numericStats: { moveSpeed: 100 } },
        movementCapabilities: null,
      };
      players.set(playerId, player);
      return player;
    },
    getPlayer(playerId: string) {
      return players.get(playerId) ?? null;
    },
    removePlayerRuntime(playerId: string) {
      players.delete(playerId);
    },
    syncFromWorldView(_playerId: string, _sessionId: string, view: unknown) {
      return view;
    },
  };
  harness.deps.getPlayerLocation = (playerId: string) => playerLocations.get(playerId) ?? null;
  harness.deps.setPlayerLocation = (
    playerId: string,
    location: { instanceId: string; sessionId: string | null },
  ) => {
    playerLocations.set(playerId, location);
  };
  harness.deps.clearPlayerLocation = (playerId: string) => playerLocations.delete(playerId);
  harness.deps.clearPendingCommand = () => undefined;

  const session = new WorldRuntimePlayerSessionService({
    resolveDefaultRespawnMapId() {
      throw new Error('tower_connect_must_not_fallback_to_respawn');
    },
    getOrCreatePublicInstance() {
      throw new Error('tower_connect_must_not_create_public_instance');
    },
    getOrCreateDefaultLineInstance() {
      throw new Error('tower_connect_must_not_create_default_line');
    },
    getPlayerViewOrThrow(playerId: string) {
      const location = playerLocations.get(playerId);
      return {
        playerId,
        instance: {
          instanceId: location?.instanceId ?? '',
          templateId: harness.templateId,
        },
        self: { playerId, x: 10, y: 10 },
      };
    },
  } as any, null);

  const view = await session.connectPlayerWhenReady({
    playerId: 'player:catalog-online-connect',
    sessionId: 'session:catalog-online-connect',
    instanceId: harness.instanceId,
    mapId: harness.templateId,
    preferredX: 10,
    preferredY: 10,
    allowCreateFallback: false,
  }, harness.deps) as any;

  const hydrateIndex = harness.metrics.order.indexOf('hydrate');
  const resolveIndex = harness.metrics.order.indexOf('resolve-tower-instance');
  const attachIndex = harness.metrics.order.indexOf('attach-ready-check');
  assert.equal(hydrateIndex >= 0 && hydrateIndex < resolveIndex && resolveIndex < attachIndex, true,
    '在线 connect 必须先异步物化/hydrate，再同步 resolve，最后检查附着 gate');
  assert.equal(view.instance.instanceId, harness.instanceId);
  assert.equal(playerLocations.get('player:catalog-online-connect')?.instanceId, harness.instanceId);
  assert.equal(harness.metrics.reviveCalls, 1);
  assert.equal(harness.metrics.hydrateCalls, 1);
  const runtime = harness.deps.getInstanceRuntime(harness.instanceId);
  assert.ok(runtime);
  assert.equal(runtime.meta.ownershipEpoch, 41);
  assert.equal(session.detachPlayerSession('player:catalog-online-connect', harness.deps), true);
  assert.equal(
    playerLocations.get('player:catalog-online-connect')?.sessionId,
    null,
    '断线必须保留通天塔地图占位，同时清理位置索引中的 sessionId',
  );

  return {
    order: [...harness.metrics.order],
    ownershipEpoch: runtime.meta.ownershipEpoch,
  };
}

async function verifyCatalogMissingCreateOpensGatesInOrder(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ order: string[]; writeOpenedBeforeReadiness: true; attachOpenedAfterReadiness: true }> {
  const harness = createHarness(content, templates, {
    layer: 50,
    ownershipEpoch: 90,
  });
  harness.deps.instanceCatalogService.loadInstanceCatalog = async () => {
    harness.metrics.catalogLoads += 1;
    return null;
  };
  const originalCreateInstance = harness.deps.createInstance.bind(harness.deps);
  harness.deps.createInstance = (request: any) => {
    harness.metrics.order.push('create');
    return originalCreateInstance(request);
  };
  const originalOpenWrites = harness.deps.startupBarrierService.openInstanceWrites.bind(
    harness.deps.startupBarrierService,
  );
  harness.deps.startupBarrierService.openInstanceWrites = (instanceIds: Iterable<string>) => {
    harness.metrics.order.push('open-write');
    originalOpenWrites(instanceIds);
  };
  const originalOpenAttach = harness.deps.startupBarrierService.openInstanceAttach.bind(
    harness.deps.startupBarrierService,
  );
  harness.deps.startupBarrierService.openInstanceAttach = (instanceIds: Iterable<string>) => {
    harness.metrics.order.push('open-attach');
    originalOpenAttach(instanceIds);
  };
  harness.deps.waitForInstanceLeaseReady = async (instanceId: string) => {
    harness.metrics.order.push('readiness');
    assert.equal(harness.metrics.writableInstanceIds.has(instanceId), true,
      'readiness 注册开始前必须已开放本实例 write gate');
    assert.equal(harness.metrics.attachableInstanceIds.has(instanceId), false,
      'readiness 完成前不得开放 attach gate');
    const created = harness.deps.getInstanceRuntime(instanceId);
    assert.ok(created);
    created.meta.status = 'active';
    created.meta.runtimeStatus = 'leased';
    created.meta.assignedNodeId = harness.nodeId;
    created.meta.leaseToken = 'lease:catalog-missing-success';
    created.meta.leaseExpireAt = new Date(Date.now() + 60_000).toISOString();
    created.meta.ownershipEpoch = 1;
    created.meta.destroyAt = null;
    harness.deps.startupBarrierService.openInstanceAttach([instanceId]);
  };

  const result = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps, { allowCreateIfMissing: true });

  assert.ok(result, 'catalog 缺失的首次塔层应在 readiness 成功后返回');
  assert.equal(harness.deps.getInstanceRuntime(harness.instanceId), result);
  assert.equal(harness.metrics.writableInstanceIds.has(harness.instanceId), true);
  assert.equal(harness.metrics.attachableInstanceIds.has(harness.instanceId), true);
  assert.deepEqual(harness.metrics.order, ['create', 'open-write', 'readiness', 'open-attach']);

  return {
    order: [...harness.metrics.order],
    writeOpenedBeforeReadiness: true,
    attachOpenedAfterReadiness: true,
  };
}

async function verifyCatalogMissingCreateFailureIsContained(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ returnedNull: true; runtimeCleared: true }> {
  const harness = createHarness(content, templates, {
    layer: 45,
    ownershipEpoch: 50,
  });
  harness.deps.instanceCatalogService.loadInstanceCatalog = async () => {
    harness.metrics.catalogLoads += 1;
    return null;
  };
  harness.deps.waitForInstanceLeaseReady = async () => {
    throw new Error('simulated_new_tower_readiness_failure');
  };

  let result: any = Symbol('unresolved');
  await assert.doesNotReject(async () => {
    result = await harness.tower.materializeLayerInstanceForRestore({
      instanceId: harness.instanceId,
      templateId: harness.templateId,
    }, harness.deps, { allowCreateIfMissing: true });
  }, 'catalog 缺失的新建/readiness 异常必须被物化边界收敛，不能向登录链抛出');

  assert.equal(result, null);
  assert.equal(harness.metrics.mountedInstances.length, 1, '异常前应确实创建过一个未就绪 runtime');
  assert.equal(harness.deps.getInstanceRuntime(harness.instanceId), null, 'readiness 异常后必须清理未就绪 runtime');
  assert.equal(harness.metrics.clearedInstanceIds.includes(harness.instanceId), true);
  assert.equal(harness.metrics.writableInstanceIds.has(harness.instanceId), true,
    '首次创建必须在 readiness 注册前开放 write gate');
  assert.equal(harness.metrics.attachableInstanceIds.has(harness.instanceId), false);

  return { returnedNull: true, runtimeCleared: true };
}

async function verifyCatalogMissingCreateUnreadyIsCleaned(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ returnedNull: true; releasedCurrentLease: true; runtimeCleared: true }> {
  const harness = createHarness(content, templates, {
    layer: 49,
    ownershipEpoch: 80,
  });
  const leaseToken = 'lease:catalog-missing-unready';
  harness.deps.instanceCatalogService.loadInstanceCatalog = async () => {
    harness.metrics.catalogLoads += 1;
    return null;
  };
  harness.deps.waitForInstanceLeaseReady = async (instanceId: string) => {
    const current = harness.deps.getInstanceRuntime(instanceId);
    assert.ok(current, 'readiness 返回前应存在本次 create 的 runtime');
    current.meta.assignedNodeId = harness.nodeId;
    current.meta.leaseToken = leaseToken;
    current.meta.leaseExpireAt = new Date(Date.now() + 60_000).toISOString();
    current.meta.runtimeStatus = 'stopped';
    harness.catalog.assigned_node_id = harness.nodeId;
    harness.catalog.lease_token = leaseToken;
    harness.catalog.lease_expire_at = current.meta.leaseExpireAt;
  };

  const result = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps, { allowCreateIfMissing: true });

  assert.equal(result, null, 'readiness 已 resolve 但 runtime 仍 stopped 时不能返回实例');
  assert.equal(harness.metrics.releaseCalls, 1, '必须释放 expected current runtime 上的本地 lease');
  assert.equal(harness.metrics.clearedInstanceIds.includes(harness.instanceId), true);
  assert.equal(harness.deps.getInstanceRuntime(harness.instanceId), null, '必须丢弃本次未就绪 runtime');
  assert.equal(harness.metrics.writableInstanceIds.has(harness.instanceId), true,
    '首次创建必须在 readiness 注册前开放 write gate');
  assert.equal(harness.metrics.attachableInstanceIds.has(harness.instanceId), false);

  return { returnedNull: true, releasedCurrentLease: true, runtimeCleared: true };
}

async function verifyPreexistingDegradedRuntimeIsPreserved(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ returnedNull: true; playerPreserved: true; runtimePreserved: true }> {
  const harness = createHarness(content, templates, {
    layer: 51,
    ownershipEpoch: 100,
  });
  harness.tower.restoreCatalogTowerTemplate(harness.catalog);
  const degraded = harness.deps.createInstance({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
    kind: 'tower',
    persistent: true,
    linePreset: 'peaceful',
    lineIndex: 51,
    displayName: '通天塔 第 51 层',
    instanceOrigin: 'gm_manual',
    routeDomain: 'system',
    supportsPvp: false,
    canDamageTile: false,
  });
  degraded.meta.status = 'active';
  degraded.meta.runtimeStatus = 'leased';
  degraded.meta.assignedNodeId = harness.nodeId;
  degraded.meta.leaseToken = 'lease:preexisting-degraded';
  degraded.meta.leaseExpireAt = new Date(Date.now() + 60_000).toISOString();
  degraded.meta.ownershipEpoch = 100;
  degraded.connectPlayer({
    playerId: 'player:preexisting-degraded',
    sessionId: 'session:preexisting-degraded',
    preferredX: 10,
    preferredY: 10,
  });
  degraded.meta.runtimeStatus = 'lease_degraded';

  const result = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps);

  assert.equal(result, null, '既有 degraded runtime 必须 fail closed');
  assert.equal(harness.deps.getInstanceRuntime(harness.instanceId), degraded,
    '物化任务不得删除预先存在的 degraded runtime');
  assert.deepEqual(degraded.listPlayerIds(), ['player:preexisting-degraded']);
  assert.equal(harness.metrics.releaseCalls, 0, '不得释放既有 runtime 的 lease');
  assert.equal(harness.metrics.clearedInstanceIds.includes(harness.instanceId), false,
    '不得清理既有 runtime 的关联状态');
  assert.equal(harness.metrics.catalogLoads, 0,
    '发现既有不就绪 runtime 后应直接拒绝，不能继续发起 catalog 物化');

  return { returnedNull: true, playerPreserved: true, runtimePreserved: true };
}

async function verifyResetBlocksNewMaterialization(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
): Promise<{ blockedDuringReset: true; restoredAfterReset: true }> {
  const harness = createHarness(content, templates, {
    layer: 52,
    ownershipEpoch: 110,
  });
  await harness.tower.resetLayerInstanceCache(harness.deps);
  const blocked = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps);
  assert.equal(blocked, null, '持久化恢复窗口内必须拒绝新塔层物化');
  assert.equal(harness.metrics.catalogLoads, 0, '恢复屏障内不得开始新的 catalog 读取');

  harness.tower.completeLayerInstanceCacheReset();
  const restored = await harness.tower.materializeLayerInstanceForRestore({
    instanceId: harness.instanceId,
    templateId: harness.templateId,
  }, harness.deps);
  assert.ok(restored, '持久化恢复完成后应重新开放塔层物化');
  return { blockedDuringReset: true, restoredAfterReset: true };
}

function verifyTowerTemplateCannotFallThroughToPublicInstance(): { rejectedCalls: number; created: number } {
  const service = new WorldRuntimeWorldAccessService({} as any);
  const createInputs: unknown[] = [];
  let rejectedCalls = 0;
  const deps = {
    templateRepository: {
      has() {
        return true;
      },
    },
    worldRuntimeTongtianTowerService: {
      ensureLayerInstanceForRestore() {
        rejectedCalls += 1;
        return null;
      },
    },
    createInstance(input: unknown) {
      createInputs.push(input);
      return input;
    },
  };
  const templateId = 'tongtian_tower_layer_46';
  const assertUnavailable = (operation: () => unknown): void => {
    assert.throws(operation, (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException, '必须用 503 ServiceUnavailable 拒绝塔层降级创建');
      assert.match(error.message, /通天塔实例暂不可用/);
      return true;
    });
  };

  assertUnavailable(() => service.getOrCreatePublicInstance(templateId, deps as any));
  assertUnavailable(() => service.getOrCreateDefaultLineInstance(templateId, 'peaceful', deps as any));
  assertUnavailable(() => service.getOrCreateDefaultLineInstance(templateId, 'real', deps as any));
  assert.equal(rejectedCalls, 3);
  assert.deepEqual(createInputs, [], '通天塔解析失败时禁止生成 public:/real: 通天塔实例');

  return { rejectedCalls, created: createInputs.length };
}

function createHarness(
  content: ContentTemplateRepository,
  templates: MapTemplateRepository,
  input: { layer: number; ownershipEpoch: number; hydrateFailures?: number },
) {
  const instanceId = `tower:tongtian:layer:${input.layer}`;
  const templateId = `tongtian_tower_layer_${input.layer}`;
  const now = new Date().toISOString();
  const catalog: CatalogRow = {
    instance_id: instanceId,
    template_id: templateId,
    instance_type: 'tower',
    persistent_policy: 'persistent',
    status: 'destroyed',
    runtime_status: 'stopped',
    assigned_node_id: null,
    lease_token: null,
    lease_expire_at: null,
    ownership_epoch: input.ownershipEpoch,
    metadata_version: input.ownershipEpoch,
    shard_key: instanceId,
    route_domain: 'system',
    destroy_at: new Date(Date.now() - 60_000).toISOString(),
    last_active_at: now,
    last_persisted_at: now,
  };
  const metrics: HarnessMetrics = {
    catalogLoads: 0,
    reviveCalls: 0,
    claimCalls: 0,
    renewCalls: 0,
    releaseCalls: 0,
    destroyCalls: 0,
    hydrateCalls: 0,
    reviveInputs: [],
    replayEpochs: [],
    mountedInstances: [],
    clearedInstanceIds: [],
    writableInstanceIds: new Set<string>(),
    attachableInstanceIds: new Set<string>(),
    order: [],
  };
  const instances = new Map<string, any>();
  let hydrateFailuresRemaining = Math.max(0, Math.trunc(input.hydrateFailures ?? 0));
  const tower = new WorldRuntimeTongtianTowerService(
    content,
    templates,
    new TongtianTowerPersistenceService(null as any),
  );
  const nodeId = `node:catalog-materialization:${input.layer}`;

  const deps: any = {
    tick: 0,
    contentTemplateRepository: content,
    templateRepository: templates,
    logger: {
      debug() {},
      log() {},
      warn() {},
      error() {},
    },
    nodeRegistryService: {
      getNodeId() {
        return nodeId;
      },
    },
    getInstanceRuntime(candidateInstanceId: string) {
      return instances.get(candidateInstanceId) ?? null;
    },
    listInstanceEntries() {
      return instances.entries();
    },
    createInstance(request: any) {
      const existing = instances.get(request.instanceId);
      if (existing) {
        return existing;
      }
      const template = templates.getOrThrow(request.templateId);
      const instance = new MapInstanceRuntime({
        instanceId: request.instanceId,
        template,
        buffRegistry: content.buffRegistry,
        monsterSpawns: content.createRuntimeMonstersForMap(template.id),
        kind: request.kind,
        persistent: request.persistent,
        createdAt: Date.now(),
        displayName: request.displayName,
        linePreset: request.linePreset,
        lineIndex: request.lineIndex,
        instanceOrigin: request.instanceOrigin,
        routeDomain: request.routeDomain,
        supportsPvp: request.supportsPvp,
        canDamageTile: request.canDamageTile,
      });
      instances.set(request.instanceId, instance);
      metrics.mountedInstances.push(instance);
      const barrierSnapshot = deps.startupBarrierService?.getSnapshot?.();
      if (barrierSnapshot?.instanceWriteOpen === true) {
        deps.startupBarrierService.openInstanceWrites?.([request.instanceId]);
      }
      return instance;
    },
    worldRuntimeInstanceStateService: {
      setInstanceRuntime(candidateInstanceId: string, instance: any) {
        instances.set(candidateInstanceId, instance);
        metrics.mountedInstances.push(instance);
      },
      deleteInstanceRuntime(candidateInstanceId: string) {
        instances.delete(candidateInstanceId);
        metrics.clearedInstanceIds.push(candidateInstanceId);
      },
    },
    worldRuntimeTickProgressService: {
      initializeInstance() {},
      clearInstance() {},
    },
    worldRuntimeLootContainerService: {
      removeInstanceState() {},
      hydrateContainerStates() {},
    },
    runtimeEventBusService: {
      discardInstance() {},
    },
    worldRuntimeFormationService: {
      releaseInstance() {},
    },
    startupBarrierService: {
      getSnapshot() {
        return { instanceWriteOpen: true, instanceAttachOpen: true };
      },
      openInstanceWrites(instanceIds: Iterable<string>) {
        for (const candidateInstanceId of instanceIds) {
          metrics.writableInstanceIds.add(candidateInstanceId);
        }
      },
      openInstanceAttach(instanceIds: Iterable<string>) {
        for (const candidateInstanceId of instanceIds) {
          metrics.attachableInstanceIds.add(candidateInstanceId);
        }
      },
    },
    async replayInstanceFlushPayloadsBeforeOwnershipChange(candidateInstanceId: string, ownershipEpoch: number) {
      assert.equal(candidateInstanceId, instanceId);
      metrics.replayEpochs.push(ownershipEpoch);
    },
    async hydratePersistentInstanceSnapshot(candidateInstanceId: string, instance: any) {
      assert.equal(candidateInstanceId, instanceId);
      metrics.hydrateCalls += 1;
      metrics.order.push('hydrate');
      instance.__partialCatalogHydrate = true;
      if (hydrateFailuresRemaining > 0) {
        hydrateFailuresRemaining -= 1;
        throw new Error(`simulated_catalog_hydrate_failure:${candidateInstanceId}`);
      }
      instance.__catalogHydrated = true;
    },
    async waitForInstanceLeaseReady() {},
    instanceReadyForPlayerAttach(candidateInstanceId: string) {
      metrics.order.push('attach-ready-check');
      const instance = instances.get(candidateInstanceId) ?? null;
      if (!instance) {
        return { ok: false, reason: 'instance_missing', instance: null };
      }
      const leaseExpireAt = instance.meta.leaseExpireAt
        ? new Date(instance.meta.leaseExpireAt).getTime()
        : 0;
      const leaseReady = instance.meta.status === 'active'
        && instance.meta.runtimeStatus === 'leased'
        && instance.meta.assignedNodeId === nodeId
        && Boolean(instance.meta.leaseToken)
        && leaseExpireAt > Date.now();
      if (!leaseReady) {
        return { ok: false, reason: 'lease_not_local', instance };
      }
      if (!metrics.attachableInstanceIds.has(candidateInstanceId)) {
        return { ok: false, reason: 'attach_gate_closed', instance };
      }
      return { ok: true, reason: 'ready', instance };
    },
  };

  deps.instanceCatalogService = {
    isEnabled() {
      return true;
    },
    async loadInstanceCatalog(candidateInstanceId: string) {
      metrics.catalogLoads += 1;
      return candidateInstanceId === instanceId ? cloneCatalog(catalog) : null;
    },
    async reviveInstanceLeaseWithFence(claim: any) {
      metrics.reviveCalls += 1;
      metrics.reviveInputs.push({ ...claim });
      assertCatalogClaimIdentity(claim, catalog);
      if (catalog.ownership_epoch !== claim.expectedOwnershipEpoch
        || !isTerminalCatalogRow(catalog)
        || (hasValidLease(catalog)
          && (catalog.assigned_node_id !== claim.expectedCurrentNodeId
            || catalog.lease_token !== claim.expectedCurrentLeaseToken))) {
        return { ok: false, ownershipEpoch: null };
      }
      assignClaimedLease(catalog, claim);
      catalog.ownership_epoch += 1;
      catalog.metadata_version = Math.max(catalog.metadata_version, catalog.ownership_epoch);
      catalog.destroy_at = null;
      return { ok: true, ownershipEpoch: catalog.ownership_epoch };
    },
    async claimInstanceLease(claim: any) {
      metrics.claimCalls += 1;
      assertCatalogClaimIdentity(claim, catalog);
      if (catalog.ownership_epoch !== claim.expectedOwnershipEpoch
        || catalog.status === 'destroyed'
        || catalog.runtime_status === 'stopped'
        || isDestroyAtReached(catalog.destroy_at)
        || hasValidLease(catalog)) {
        return { ok: false, ownershipEpoch: null };
      }
      assignClaimedLease(catalog, claim);
      catalog.ownership_epoch += 1;
      catalog.metadata_version = Math.max(catalog.metadata_version, catalog.ownership_epoch);
      return { ok: true, ownershipEpoch: catalog.ownership_epoch };
    },
    async renewInstanceLease(claim: any) {
      metrics.renewCalls += 1;
      assertCatalogClaimIdentity(claim, catalog);
      if (catalog.assigned_node_id !== claim.nodeId
        || catalog.lease_token !== claim.leaseToken
        || catalog.ownership_epoch !== claim.expectedOwnershipEpoch) {
        return false;
      }
      catalog.lease_expire_at = claim.leaseExpireAt.toISOString();
      return true;
    },
    async releaseInstanceLease(claim: any) {
      if (catalog.assigned_node_id !== claim.nodeId || catalog.lease_token !== claim.leaseToken) {
        return false;
      }
      metrics.releaseCalls += 1;
      catalog.assigned_node_id = null;
      catalog.lease_token = null;
      catalog.lease_expire_at = null;
      catalog.runtime_status = 'running';
      return true;
    },
    async destroyInstanceCatalogWithFence(claim: any) {
      metrics.destroyCalls += 1;
      if (catalog.ownership_epoch !== claim.expectedOwnershipEpoch
        || catalog.assigned_node_id !== claim.assignedNodeId
        || catalog.lease_token !== claim.leaseToken) {
        return { ok: false, ownershipEpoch: null };
      }
      catalog.status = 'destroyed';
      catalog.runtime_status = 'stopped';
      catalog.assigned_node_id = null;
      catalog.lease_token = null;
      catalog.lease_expire_at = null;
      catalog.ownership_epoch += 1;
      catalog.metadata_version = Math.max(catalog.metadata_version, catalog.ownership_epoch);
      catalog.destroy_at = new Date(claim.destroyAt ?? Date.now()).toISOString();
      return { ok: true, ownershipEpoch: catalog.ownership_epoch };
    },
  };

  return {
    tower,
    deps,
    catalog,
    metrics,
    instanceId,
    templateId,
    nodeId,
  };
}

function assignClaimedLease(catalog: CatalogRow, claim: any): void {
  catalog.status = 'active';
  catalog.runtime_status = 'leased';
  catalog.assigned_node_id = claim.nodeId;
  catalog.lease_token = claim.leaseToken;
  catalog.lease_expire_at = claim.leaseExpireAt.toISOString();
  catalog.last_active_at = new Date().toISOString();
}

function assertCatalogClaimIdentity(claim: any, catalog: CatalogRow): void {
  assert.equal(claim.instanceId, catalog.instance_id);
  assert.equal(claim.expectedTemplateId, catalog.template_id);
  assert.equal(claim.expectedInstanceType, catalog.instance_type);
}

function hasValidLease(catalog: CatalogRow): boolean {
  return Boolean(
    catalog.assigned_node_id
    && catalog.lease_token
    && catalog.lease_expire_at
    && new Date(catalog.lease_expire_at).getTime() > Date.now(),
  );
}

function isTerminalCatalogRow(catalog: CatalogRow): boolean {
  return catalog.status === 'destroyed'
    || catalog.runtime_status === 'stopped'
    || isDestroyAtReached(catalog.destroy_at);
}

function isDestroyAtReached(destroyAt: string | null): boolean {
  if (!destroyAt) {
    return false;
  }
  const destroyAtMs = new Date(destroyAt).getTime();
  return Number.isFinite(destroyAtMs) && destroyAtMs <= Date.now();
}

function cloneCatalog(catalog: CatalogRow): CatalogRow {
  return { ...catalog };
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
