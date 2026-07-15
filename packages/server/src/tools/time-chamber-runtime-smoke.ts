import assert from 'node:assert/strict';
import {
  calculateTimeChamberBaseOperatingCost,
  calculateTimeChamberOperatingCostPerHour,
} from '@mud/shared';

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
  assert.deepEqual(
    Array.from({ length: 9 }, (_, index) => calculateTimeChamberBaseOperatingCost(index + 2)),
    [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800],
    '2 至 10 倍的每小时基础成本必须逐倍翻倍',
  );
  assert.equal(calculateTimeChamberOperatingCostPerHour(2, 1), 50);
  assert.equal(calculateTimeChamberOperatingCostPerHour(2, 2), 90);
  assert.equal(calculateTimeChamberOperatingCostPerHour(2, 4), 170, '额外位置按 80% 线性叠加，不能复利');

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
    hourlyFee: 20,
    revenueSpiritStones: 0,
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
  assert.equal(service.authorizeScheduledSteps(state.chamberInstanceId, chamberInstance, 4, 3, runtime), 1);
  assert.equal(chamberInstance.tickSpeed, 1, '没有有效使用时段时必须固定一倍');
  serviceInternal.storeUsage({
    sourceInstanceId: state.sourceInstanceId,
    buildingId: state.buildingId,
    chamberInstanceId: state.chamberInstanceId,
    playerId: 'player:one',
    startedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    quotedHourlyFee: 20,
    paidSpiritStones: 20,
    operatingFuelUnits: 3_600_000,
  });
  serviceInternal.applyEffectiveSpeed(state, chamberInstance, runtime);
  assert.equal(chamberInstance.tickSpeed, 3, '存在有效使用时段时应用管理端设定倍率');
  assert.equal(service.authorizeScheduledSteps(state.chamberInstanceId, chamberInstance, 4, 3, runtime), 4);
  const fuelBeforeTick = state.databaseFuelUnits;
  for (let index = 0; index < 4; index += 1) {
    assert.equal(service.consumeScheduledStep(state.chamberInstanceId, chamberInstance, 3, runtime), true);
  }
  assert.equal(state.databaseFuelUnits, fuelBeforeTick, '运行成本已在购买时段时预扣，tick 热路径不得再次扣燃料');

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
  serviceInternal.usageByChamberInstanceId.clear();
  assert.deepEqual(
    await service.enter('player:one', state.sourceInstanceId, state.buildingId, transferRuntime),
    { ok: false, reason: 'time_chamber_activation_required' },
    '没有有效使用时段不能直接进入密室',
  );
  serviceInternal.storeUsage({
    sourceInstanceId: state.sourceInstanceId,
    buildingId: state.buildingId,
    chamberInstanceId: state.chamberInstanceId,
    playerId: 'player:one',
    startedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    quotedHourlyFee: 20,
    paidSpiritStones: 20,
    operatingFuelUnits: 3_600_000,
  });
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
  const queuedCommands: any[] = [];
  (transferRuntime as any).enqueuePendingCommand = (_playerId: string, command: any) => queuedCommands.push(command);
  assert.deepEqual(
    await service.queueEnter('player:one', {
      sourceInstanceId: state.sourceInstanceId,
      buildingId: state.buildingId,
      requestId: 'reenter:one',
    }, transferRuntime),
    {
      ok: true,
      operation: 'enter',
      requestId: 'reenter:one',
      entryQueued: true,
      usageDetail: serviceInternal.buildUsageDetailView('player:one', state, chamberInstance),
    },
    '有效使用时段内应允许不重复付费地重新排队进入',
  );
  assert.deepEqual(queuedCommands, [{
    kind: 'timeChamberTransfer',
    direction: 'enter',
    sourceInstanceId: state.sourceInstanceId,
    buildingId: state.buildingId,
  }]);

  await testUsageExpiryRelocation();
  await testDeconstructLeaseFence();
  service.onModuleDestroy();

  console.log(JSON.stringify({
    ok: true,
    answers: '密室三档空间为 9/15/21；2 至 10 倍成本从每小时 50 灵石起逐倍翻倍，额外容量按 80% 线性增加；无有效使用时段固定 1 倍且禁止进入，有效时段才应用设定倍率，tick 热路径不重复扣燃料；使用时段到期会迁出玩家并修正持久化位置；拆除仍受实例 lease/epoch 围栏保护。',
    excludes: '不连接数据库，不证明真实事务、实例目录恢复和客户端控制台。',
    completionMapping: 'time-chamber-domain-runtime',
  }, null, 2));
}

async function testUsageExpiryRelocation(): Promise<void> {
  const state = {
    sourceInstanceId: 'source:expiry',
    buildingId: 'building:expiry',
    chamberInstanceId: 'chamber:expiry',
    templateId: 'template:expiry',
    ownerPlayerId: 'player:owner',
    displayName: '到期迁出密室',
    sizeTier: 'small' as const,
    capacity: 1,
    configuredSpeed: 4,
    databaseFuelUnits: 0,
    hourlyFee: 10,
    revenueSpiritStones: 10,
    fuelUnitsPerSpiritStone: 36_000,
    maxSpeed: 10,
    allowedSizeTiers: ['small', 'medium', 'large'],
    revision: 2,
  };
  const savedCheckpoints: any[] = [];
  const queryLog: string[] = [];
  const service = new TimeChamberRuntimeService(
    {} as any,
    {} as any,
    {
      playerDomainPersistenceService: {
        isEnabled: () => true,
        savePlayerPositionCheckpoint: async (_playerId: string, checkpoint: any) => {
          savedCheckpoints.push(checkpoint);
        },
      },
    } as any,
    {} as any,
    { registerOrUpdate(): void {}, unregister(): void {} } as any,
    new TimeChamberAdmissionPolicy(),
  );
  const internals = service as any;
  internals.pool = {
    query: async (sql: string) => {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      queryLog.push(normalizedSql);
      if (normalizedSql.startsWith('SELECT usage.player_id')) {
        return {
          rows: [{
            player_id: 'player:expired',
            checkpoint_instance_id: state.chamberInstanceId,
            checkpoint_facing: 6,
          }],
          rowCount: 1,
        };
      }
      if (normalizedSql.startsWith('DELETE FROM instance_time_chamber_usage')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  internals.storeState(state);
  internals.storeUsage({
    sourceInstanceId: state.sourceInstanceId,
    buildingId: state.buildingId,
    chamberInstanceId: state.chamberInstanceId,
    playerId: 'player:expired',
    startedAt: Date.now() - 7_200_000,
    expiresAt: Date.now() - 1,
    quotedHourlyFee: 10,
    paidSpiritStones: 10,
    operatingFuelUnits: 1,
  });

  const sourceInstance = {
    template: { id: 'map:source' },
    buildingById: new Map([[state.buildingId, { id: state.buildingId, x: 7, y: 8 }]]),
  };
  const chamberInstance = {
    tickSpeed: 4,
    paused: false,
    markPersistenceDirtyDomainsHighPriority(): void {},
  };
  let location = { instanceId: state.chamberInstanceId, sessionId: 'session:expired' };
  const runtime = {
    getInstanceRuntime: (instanceId: string) => instanceId === state.sourceInstanceId ? sourceInstance : chamberInstance,
    getPlayerLocation: () => location,
    instanceReadyForPlayerAttach: () => ({ ok: true }),
    applyTransfer: (transfer: any) => {
      location = { instanceId: transfer.targetInstanceId, sessionId: transfer.sessionId };
    },
  };
  const remainingExpiredUsage = await internals.expirePersistedUsagesForState(state, runtime);
  assert.equal(remainingExpiredUsage, false);
  assert.equal(location.instanceId, state.sourceInstanceId, '到期玩家必须迁回密室入口所在实例');
  assert.deepEqual(savedCheckpoints, [{
    instanceId: state.sourceInstanceId,
    x: 7,
    y: 8,
    facing: 6,
    checkpointKind: 'time_chamber_usage_expired',
  }], '到期迁出必须同步修正离线恢复位置');
  assert.equal(
    queryLog.some((sql) => sql.startsWith('DELETE FROM instance_time_chamber_usage')),
    true,
    '玩家迁出并修正 checkpoint 后才删除已到期使用时段',
  );
  internals.applyEffectiveSpeed(state, chamberInstance, runtime);
  assert.equal(chamberInstance.tickSpeed, 1, '最后一个时段到期后必须恢复一倍速');
  service.onModuleDestroy();
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
    hourlyFee: 0,
    revenueSpiritStones: 0,
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
