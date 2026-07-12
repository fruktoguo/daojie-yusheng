import assert from 'node:assert/strict';

import { TimeChamberAdmissionPolicy } from '../runtime/building/time-chamber-admission.policy';
import { TimeChamberRuntimeService } from '../runtime/building/time-chamber-runtime.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const admission = new TimeChamberAdmissionPolicy();
  const occupantInstance = { listPlayerIds: () => ['player:one'] };
  assert.deepEqual(admission.canEnter(occupantInstance, 'player:two', 1), { ok: false, reason: 'time_chamber_full' });
  assert.deepEqual(admission.canEnter(occupantInstance, 'player:one', 1), { ok: true });
  assert.deepEqual(admission.canEnter({ listPlayerIds: () => [] }, 'player:two', 1), { ok: true });
  assert.deepEqual(admission.canEnter({ listPlayerIds: () => [] }, 'player:two', 1, ['player:offline']), { ok: false, reason: 'time_chamber_full' });

  const registeredDocuments: any[] = [];
  const service = new TimeChamberRuntimeService(
    {} as any,
    { registerRuntimeMapTemplate(document: any) { registeredDocuments.push(document); return document; } } as any,
    {} as any,
    {} as any,
    { registerOrUpdate(): void {}, unregister(): void {} } as any,
    admission,
  );
  const serviceInternal = service as any;
  for (const [sizeTier, width] of [['small', 9], ['medium', 15], ['large', 21]] as const) {
    const template = serviceInternal.registerTemplate({
      templateId: `template:${sizeTier}`,
      displayName: `密室-${sizeTier}`,
      sizeTier,
      chamberInstanceId: `instance:${sizeTier}`,
    });
    assert.equal(template.width, width);
    assert.equal(template.height, width);
    assert.equal(template.spawnPoint.x, Math.floor(width / 2));
    assert.equal(template.monsters.length, 0);
  }
  assert.equal(registeredDocuments.length, 3);

  const chamberInstance = {
    tickSpeed: 3,
    paused: false,
    template: { spawnX: 4, spawnY: 4 },
    markPersistenceDirtyDomainsHighPriority(): void {},
    listPlayerIds: () => ['player:one'],
  };
  const state = {
    sourceInstanceId: 'source:one',
    buildingId: 'building:one',
    chamberInstanceId: 'chamber:one',
    templateId: 'template:one',
    ownerPlayerId: 'player:owner',
    displayName: '试炼密室',
    sizeTier: 'small',
    capacity: 1,
    configuredSpeed: 3,
    databaseFuelUnits: 0,
    reservedFuelUnits: 1000,
    fuelUnitsPerSpiritStone: 36000,
    maxSpeed: 10,
    allowedSizeTiers: ['small', 'medium', 'large'],
    revision: 1,
  };
  serviceInternal.stateByChamberInstanceId.set(state.chamberInstanceId, state);
  const runtime = {
    refreshInstanceSchedule(): void {},
    queuePlayerNotice(): void {},
    getInstanceRuntime: () => chamberInstance,
  };
  assert.equal(service.authorizeScheduledSteps(state.chamberInstanceId, chamberInstance, 4, 3, runtime), 4);
  assert.equal(state.reservedFuelUnits, 1000, '批次授权不能提前扣除尚未执行的逻辑息');
  for (let index = 0; index < 4; index += 1) {
    assert.equal(service.consumeScheduledStep(state.chamberInstanceId, chamberInstance, 3, runtime), true);
  }
  assert.equal(state.reservedFuelUnits, 992, '3 倍每个成功逻辑息消耗 2 单位，4 息共扣 8 单位');

  state.reservedFuelUnits = 1;
  assert.equal(service.authorizeScheduledSteps(state.chamberInstanceId, chamberInstance, 1, 3, runtime), 0);
  assert.equal(chamberInstance.tickSpeed, 1, '燃料不足必须回落一倍');

  await new Promise((resolve) => setImmediate(resolve));
  state.reservedFuelUnits = 100;
  chamberInstance.tickSpeed = 3;
  serviceInternal.pool = {
    async query(): Promise<never> {
      throw new Error('simulated_reserve_failure');
    },
  };
  assert.equal(service.consumeScheduledStep(state.chamberInstanceId, chamberInstance, 3, runtime), true);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(chamberInstance.tickSpeed, 1, '运行缓冲补充失败必须立即回落一倍');
  serviceInternal.pool = null;

  serviceInternal.resolveManagedChamber = async () => ({
    ok: true,
    state,
    chamberInstance,
    sourceInstance: { meta: { instanceId: state.sourceInstanceId } },
    building: { id: state.buildingId },
  });
  let currentLocation = { instanceId: state.sourceInstanceId, sessionId: 'session:one' };
  let transferCount = 0;
  const transferRuntime = {
    getPlayerLocation: () => currentLocation,
    getInstanceRuntime: (instanceId: string) => instanceId === state.chamberInstanceId ? chamberInstance : null,
    instanceReadyForPlayerAttach: () => ({ ok: true }),
    applyTransfer: (transfer: any) => {
      transferCount += 1;
      currentLocation = { instanceId: transfer.targetInstanceId, sessionId: transfer.sessionId };
    },
  };
  serviceInternal.playerRuntimeService = {
    playerDomainPersistenceService: { isEnabled: () => false },
  };
  assert.deepEqual(
    await service.enter('player:one', state.sourceInstanceId, state.buildingId, transferRuntime),
    { ok: false, reason: 'time_chamber_persistence_disabled' },
    '离线占用真源不可读时准入必须失败关闭',
  );
  assert.equal(transferCount, 0);

  serviceInternal.playerRuntimeService.playerDomainPersistenceService = {
    isEnabled: () => true,
    listRetainedPlayerIdsInInstance: async () => [],
  };
  assert.deepEqual(
    await service.enter('player:one', state.sourceInstanceId, state.buildingId, transferRuntime),
    { ok: true },
    '通用传送完成且位置索引指向目标后才能确认进入成功',
  );
  assert.equal(currentLocation.instanceId, state.chamberInstanceId);

  currentLocation = { instanceId: state.sourceInstanceId, sessionId: 'session:one' };
  transferRuntime.instanceReadyForPlayerAttach = () => ({ ok: false });
  assert.deepEqual(
    await service.enter('player:one', state.sourceInstanceId, state.buildingId, transferRuntime),
    { ok: false, reason: 'time_chamber_unavailable' },
    '目标实例不可挂接时不能误报传送成功',
  );

  await testDeconstructLeaseFence();

  console.log(JSON.stringify({
    ok: true,
    answers: '密室首版容量为 1 且准入策略可独立替换，三档空间为 9/15/21，燃料按高倍逻辑息扣除并在不足时回落 1 倍；拆除只能命中本地完全匹配的活跃 lease，并递增 ownership epoch 隔离旧 writer。',
    excludes: '不连接数据库，不证明真实事务、实例目录恢复和客户端控制台。',
    completionMapping: 'time-chamber-domain-runtime',
  }, null, 2));
}

async function testDeconstructLeaseFence(): Promise<void> {
  const state = {
    sourceInstanceId: 'source:deconstruct',
    buildingId: 'building:deconstruct',
    chamberInstanceId: 'chamber:deconstruct',
    templateId: 'template:deconstruct',
    ownerPlayerId: 'player:owner',
    displayName: '拆除围栏密室',
    sizeTier: 'small' as const,
    capacity: 1,
    configuredSpeed: 1,
    databaseFuelUnits: 0,
    reservedFuelUnits: 0,
    fuelUnitsPerSpiritStone: 36_000,
    maxSpeed: 10,
    allowedSizeTiers: ['small', 'medium', 'large'],
    revision: 3,
  };
  const queryLog: Array<{ sql: string; params: unknown[] }> = [];
  let catalogRow = {
    assigned_node_id: 'node:remote',
    lease_token: 'lease:remote',
    ownership_epoch: 8,
    lease_active: true,
  };
  const client = {
    async query(sql: string, params: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      queryLog.push({ sql: normalizedSql, params });
      if (normalizedSql.startsWith('SELECT assigned_node_id')) {
        return { rows: [catalogRow], rowCount: 1 };
      }
      if (normalizedSql.startsWith('UPDATE instance_catalog')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalizedSql.startsWith('DELETE FROM instance_time_chamber_state')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release(): void {},
  };
  const service = new TimeChamberRuntimeService(
    {} as any,
    { unregisterRuntimeMapTemplate(): boolean { return true; } } as any,
    {
      playerDomainPersistenceService: {
        isEnabled: () => true,
        hasRetainedPlayersInInstance: async () => false,
      },
    } as any,
    {} as any,
    { registerOrUpdate(): void {}, unregister(): void {} } as any,
    new TimeChamberAdmissionPolicy(),
  );
  const serviceInternal = service as any;
  serviceInternal.enabled = true;
  serviceInternal.pool = {
    connect: async () => client,
    query: async () => ({ rows: [], rowCount: 0 }),
  };
  serviceInternal.storeState(state);

  const chamberInstance = {
    meta: {
      assignedNodeId: 'node:local',
      leaseToken: 'lease:local',
      ownershipEpoch: 7,
      runtimeStatus: 'leased',
      status: 'active',
    },
    listPlayerIds: () => [],
    canReplaceEmptyRuntimeTemplate: () => true,
  };
  const runtime = {
    getInstanceRuntime: (instanceId: string) => instanceId === state.chamberInstanceId ? chamberInstance : null,
    isInstanceLeaseWritable: () => true,
    worldRuntimeInstanceStateService: { deleteInstanceRuntime(): void {} },
    worldRuntimeTickProgressService: { clearInstance(): void {} },
    worldRuntimeLootContainerService: { removeInstanceState(): void {} },
    runtimeEventBusService: { discardInstance(): void {} },
    worldRuntimeFormationService: {
      listRuntimeFormations: () => [],
      releaseInstance(): void {},
    },
  };

  assert.deepEqual(
    await service.prepareDeconstruct(state.sourceInstanceId, state.buildingId, runtime),
    { ok: false, reason: 'time_chamber_unavailable' },
    '数据库活跃 lease 已转移到远端时，旧本地运行态不得删除密室',
  );
  assert.equal(serviceInternal.stateByBuildingKey.size, 1, 'lease 冲突后必须保留密室状态');
  assert.equal(
    queryLog.some((entry) => entry.sql.startsWith('UPDATE instance_catalog') || entry.sql.startsWith('DELETE FROM instance_time_chamber_state')),
    false,
    'lease 冲突必须在任何销毁写入前失败关闭',
  );

  queryLog.length = 0;
  catalogRow = {
    assigned_node_id: 'node:local',
    lease_token: 'lease:local',
    ownership_epoch: 7,
    lease_active: true,
  };
  assert.deepEqual(
    await service.prepareDeconstruct(state.sourceInstanceId, state.buildingId, runtime),
    { ok: true },
    '本地运行态与数据库活跃 lease/epoch 完全匹配时允许原子拆除',
  );
  const catalogUpdate = queryLog.find((entry) => entry.sql.startsWith('UPDATE instance_catalog'));
  const stateDelete = queryLog.find((entry) => entry.sql.startsWith('DELETE FROM instance_time_chamber_state'));
  assert.ok(catalogUpdate, '拆除必须更新实例目录');
  assert.match(catalogUpdate.sql, /ownership_epoch = ownership_epoch \+ 1/);
  assert.match(catalogUpdate.sql, /metadata_version = GREATEST\(metadata_version, ownership_epoch \+ 1\)/);
  assert.deepEqual(catalogUpdate.params, [state.chamberInstanceId, 7]);
  assert.ok(stateDelete, '拆除必须删除密室领域状态');
  assert.deepEqual(stateDelete.params, [state.sourceInstanceId, state.buildingId, state.revision]);
  assert.equal(serviceInternal.stateByBuildingKey.size, 0, '事务提交后才可清理本地密室状态');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
