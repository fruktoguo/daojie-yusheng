import assert from 'node:assert/strict';
import {
  calculateTimeChamberActivationCost,
  calculateTimeChamberBaseOperatingCost,
  calculateTimeChamberOperatingCostPerHour,
  requiresTimeChamberActivation,
  resolveTimeChamberCapacityLimit,
} from '@mud/shared';

import { TimeChamberAdmissionPolicy } from '../runtime/building/time-chamber-admission.policy';
import { TimeChamberRuntimeService } from '../runtime/building/time-chamber-runtime.service';
import { findBuildingProtectedPlacementConflict } from '../runtime/world/building-protected-placement.helpers';
import { registerManagedInstanceCatalog } from '../runtime/world/world-runtime-instance-lease.helpers';
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
  assert.deepEqual(
    (['small', 'medium', 'large'] as const).map(resolveTimeChamberCapacityLimit),
    [25, 49, 81],
    '三档密室的可配置人数上限必须等于总格数',
  );
  assert.equal(requiresTimeChamberActivation(1), false, '一倍速不应要求开启时段');
  assert.equal(requiresTimeChamberActivation(2), true, '二倍及以上必须要求开启时段');
  assert.equal(calculateTimeChamberOperatingCostPerHour(2, 1), 50);
  assert.equal(calculateTimeChamberOperatingCostPerHour(2, 2), 90);
  assert.equal(calculateTimeChamberOperatingCostPerHour(2, 4), 170, '额外配置位置按 80% 线性叠加，不能复利');
  assert.equal(calculateTimeChamberActivationCost(2, 4, 3), 510, '开启总价必须由倍率、实际容量和整小时数决定');
  assert.equal(calculateTimeChamberOperatingCostPerHour(2, 1, 'medium'), 75, '扩大一圈后每小时成本提升 50%');
  assert.equal(calculateTimeChamberOperatingCostPerHour(2, 1, 'large'), 113, '连续扩大两圈按乘算并向上取整');

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
  for (const [sizeTier, width] of [['small', 5], ['medium', 7], ['large', 9]] as const) {
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
    assert.equal(template.safeZones.length, 0);
    assert.equal(template.tiles.every((row: string) => row === '.'.repeat(width)), true);
  }
  assert.equal(registeredDocuments.length, 3);
  const placementInstance = {
    meta: { kind: 'time_chamber' },
    template: { id: 'time-chamber-template:test', spawnX: 2, spawnY: 2, portals: [] },
    isInBounds: (x: number, y: number) => x >= 0 && x < 5 && y >= 0 && y < 5,
    getSafeZoneAtTile: () => ({ id: 'legacy-whole-room-safe-zone' }),
  };
  assert.deepEqual(
    findBuildingProtectedPlacementConflict(placementInstance, [{ x: 2, y: 2 }]),
    { ok: false, reason: 'protected_placement_spawn', x: 2, y: 2 },
    '密室只保留中心出生格为禁建点',
  );
  assert.deepEqual(
    findBuildingProtectedPlacementConflict(placementInstance, [{ x: 0, y: 0 }, { x: 4, y: 4 }]),
    { ok: true },
    '密室中心以外不能再被安全区或出生点邻域误判为禁建点',
  );
  let registeredCatalogInput: any = null;
  await registerManagedInstanceCatalog({
    instanceCatalogService: {
      isEnabled: () => true,
      upsertInstanceCatalog: async (input: any) => { registeredCatalogInput = input; },
    },
  }, 'time-chamber:catalog-test', {
    template: { id: 'time-chamber-template:catalog-test' },
    meta: { kind: 'time_chamber', persistent: true },
  });
  assert.equal(registeredCatalogInput?.instanceType, 'time_chamber', '实例目录必须读取 meta.kind，不能把密室误登记为 public');

  const chamberInstance = {
    tickSpeed: 3,
    paused: false,
    template: { spawnX: 4, spawnY: 4 },
    buildingById: new Map<string, any>(),
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
    activeStartedAt: null as number | null,
    activeExpiresAt: null as number | null,
    activationPlayerId: null as string | null,
    activationSpiritStones: 0,
    maxSpeed: 10,
    allowedSizeTiers: ['small', 'medium', 'large'],
    revision: 1,
  };
  assert.equal(
    serviceInternal.buildSummaryView('player:owner', state, chamberInstance).capacity,
    1,
    '密室详情必须投影实际配置容量，而不是空间上限',
  );
  assert.equal(
    serviceInternal.buildManagementDetailView('player:owner', state, chamberInstance).maxCapacity,
    25,
    '小型密室管理详情必须限制最多 25 人',
  );
  serviceInternal.stateByChamberInstanceId.set(state.chamberInstanceId, state);
  const runtime = {
    refreshInstanceSchedule(): void {},
    queuePlayerNotice(): void {},
    getInstanceRuntime: () => chamberInstance,
  };
  assert.equal(service.authorizeScheduledSteps(state.chamberInstanceId, chamberInstance, 4, 3, runtime), 1);
  assert.equal(chamberInstance.tickSpeed, 1, '密室未开启时必须固定一倍');
  state.activeStartedAt = Date.now();
  state.activeExpiresAt = Date.now() + 60_000;
  state.activationPlayerId = 'player:one';
  state.activationSpiritStones = 100;
  serviceInternal.applyEffectiveSpeed(state, chamberInstance, runtime);
  assert.equal(chamberInstance.tickSpeed, 3, '全室开启期间应用管理端设定倍率');
  assert.equal(service.authorizeScheduledSteps(state.chamberInstanceId, chamberInstance, 4, 3, runtime), 4);
  for (let index = 0; index < 4; index += 1) {
    assert.equal(service.consumeScheduledStep(state.chamberInstanceId, chamberInstance, 3, runtime), true);
  }

  serviceInternal.resolveManagedChamber = async () => ({
    ok: true,
    state,
    chamberInstance,
    sourceInstance: { meta: { instanceId: state.sourceInstanceId } },
    building: { id: state.buildingId },
  });
  assert.deepEqual(
    await service.updateSettings('player:owner', {
      sourceInstanceId: state.sourceInstanceId,
      buildingId: state.buildingId,
      requestId: 'settings:capacity-limit',
      name: state.displayName,
      speed: state.configuredSpeed,
      capacity: 26,
      expectedRevision: state.revision,
    }, runtime),
    {
      ok: false,
      operation: 'settings',
      requestId: 'settings:capacity-limit',
      reason: 'invalid_time_chamber_capacity',
    },
    '5×5 密室必须拒绝超过 25 人的实际容量配置',
  );
  assert.deepEqual(
    await service.updateSettings('player:owner', {
      sourceInstanceId: state.sourceInstanceId,
      buildingId: state.buildingId,
      requestId: 'settings:active',
      name: state.displayName,
      speed: state.configuredSpeed + 1,
      capacity: state.capacity,
      expectedRevision: state.revision,
    }, runtime),
    {
      ok: false,
      operation: 'settings',
      requestId: 'settings:active',
      reason: 'time_chamber_settings_locked',
    },
    '全室开启期间不能修改倍率或容量',
  );
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
  state.activeStartedAt = null;
  state.activeExpiresAt = null;
  state.activationPlayerId = null;
  state.activationSpiritStones = 0;
  chamberInstance.listPlayerIds = () => [];
  chamberInstance.buildingById.set('building:inside', { id: 'building:inside' });
  serviceInternal.playerRuntimeService = {
    playerDomainPersistenceService: {
      isEnabled: () => true,
      hasRetainedPlayersInInstance: async () => false,
    },
  };
  assert.deepEqual(
    await service.resize('player:owner', {
      sourceInstanceId: state.sourceInstanceId,
      buildingId: state.buildingId,
      requestId: 'resize:building-lock',
      sizeTier: 'small',
      expectedRevision: state.revision,
    }, runtime),
    {
      ok: false,
      operation: 'resize',
      requestId: 'resize:building-lock',
      reason: 'time_chamber_has_buildings',
    },
    '密室内存在任意建筑时必须锁定空间大小',
  );
  chamberInstance.buildingById.clear();
  assert.deepEqual(
    await service.enter('player:one', state.sourceInstanceId, state.buildingId, transferRuntime),
    { ok: false, reason: 'time_chamber_activation_required' },
    '高倍速密室未开启时不能直接进入',
  );
  state.configuredSpeed = 1;
  serviceInternal.playerRuntimeService.playerDomainPersistenceService = {
    isEnabled: () => true,
    listRetainedPlayerIdsInInstance: async () => [],
  };
  assert.deepEqual(
    await service.activate('player:one', {
      sourceInstanceId: state.sourceInstanceId,
      buildingId: state.buildingId,
      requestId: 'activate:base-speed',
      durationHours: 1,
      expectedRevision: state.revision,
    }, transferRuntime),
    {
      ok: false,
      operation: 'activate',
      requestId: 'activate:base-speed',
      reason: 'time_chamber_activation_not_required',
    },
    '一倍速不能创建无意义的计时开启状态',
  );
  const freeQueuedCommands: any[] = [];
  (transferRuntime as any).enqueuePendingCommand = (_playerId: string, command: any) => freeQueuedCommands.push(command);
  assert.deepEqual(
    await service.queueEnter('player:one', {
      sourceInstanceId: state.sourceInstanceId,
      buildingId: state.buildingId,
      requestId: 'enter:base-speed',
    }, transferRuntime),
    {
      ok: true,
      operation: 'enter',
      requestId: 'enter:base-speed',
      entryQueued: true,
      usageDetail: serviceInternal.buildUsageDetailView('player:one', state, chamberInstance),
    },
    '一倍速使用面板必须无需开启时段即可排队进入',
  );
  assert.equal(freeQueuedCommands.length, 1);
  assert.deepEqual(
    await service.enter('player:one', state.sourceInstanceId, state.buildingId, transferRuntime),
    { ok: true },
    '一倍速权威传送入口必须无需开启时段即可进入',
  );
  assert.equal(currentLocation.instanceId, state.chamberInstanceId);
  currentLocation = { instanceId: state.sourceInstanceId, sessionId: 'session:one' };
  transferCount = 0;
  state.configuredSpeed = 3;
  state.activeStartedAt = Date.now();
  state.activeExpiresAt = Date.now() + 60_000;
  state.activationPlayerId = 'player:other';
  state.activationSpiritStones = 100;
  serviceInternal.playerRuntimeService.playerDomainPersistenceService = {
    isEnabled: () => false,
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
    '全室开启期间应允许其他玩家不重复付费地排队进入',
  );
  assert.deepEqual(queuedCommands, [{
    kind: 'timeChamberTransfer',
    direction: 'enter',
    sourceInstanceId: state.sourceInstanceId,
    buildingId: state.buildingId,
  }]);

  await testRecoveredMissingRuntimeHydration();
  await testActivationExpiryRelocation();
  await testDeconstructLeaseFence();
  service.onModuleDestroy();

  console.log(JSON.stringify({
    ok: true,
    answers: '密室三档空间为 5/7/9，可配置人数上限为 25/49/81；运行成本按实际配置容量和空间系数计算；一倍速常驻开放且拒绝计时开启，高倍速必须付费开启后进入；中心格为唯一密室保护禁建点；到期会迁出玩家、修正持久化位置并恢复 1 倍；拆除仍受实例 lease/epoch 围栏保护。',
    excludes: '不连接数据库，不证明真实事务、实例目录恢复和客户端控制台。',
    completionMapping: 'time-chamber-domain-runtime',
  }, null, 2));
}

async function testRecoveredMissingRuntimeHydration(): Promise<void> {
  const state = {
    sourceInstanceId: 'source:recovery',
    buildingId: 'building:recovery',
    chamberInstanceId: 'chamber:recovery',
    templateId: 'template:recovery',
    ownerPlayerId: 'player:owner',
    displayName: '恢复密室',
    sizeTier: 'small' as const,
    capacity: 1,
    configuredSpeed: 1,
    activeStartedAt: null,
    activeExpiresAt: null,
    activationPlayerId: null,
    activationSpiritStones: 0,
    maxSpeed: 10,
    allowedSizeTiers: ['small', 'medium', 'large'],
    revision: 1,
  };
  const sourceBuilding = {
    id: state.buildingId,
    defId: 'time_chamber',
    state: 'active',
    ownerPlayerId: state.ownerPlayerId,
    name: state.displayName,
  };
  const sourceInstance = {
    meta: { instanceId: state.sourceInstanceId, runtimeStatus: 'leased', status: 'active' },
    buildingById: new Map([[sourceBuilding.id, sourceBuilding]]),
    buildingCatalog: {
      defById: new Map([['time_chamber', {
        id: 'time_chamber',
        timeChamberEnabled: true,
        timeChamberDefaultCapacity: 1,
        timeChamberMaxSpeed: 10,
        timeChamberAllowedSizeTiers: ['small', 'medium', 'large'],
      }]]),
      defByHandle: [],
    },
  };
  const service = new TimeChamberRuntimeService(
    {} as any,
    {
      registerRuntimeMapTemplate(document: any) {
        return {
          ...document,
          spawnX: document.spawnPoint.x,
          spawnY: document.spawnPoint.y,
        };
      },
    } as any,
    {} as any,
    {} as any,
    { registerOrUpdate(): void {}, unregister(): void {} } as any,
    new TimeChamberAdmissionPolicy(),
  );
  const internals = service as any;
  internals.storeState(state);

  let chamberInstance: any = null;
  const recoveryOrder: string[] = [];
  let sourceWritable = true;
  const runtime = {
    getInstanceRuntime(instanceId: string) {
      if (instanceId === state.sourceInstanceId) return sourceInstance;
      if (instanceId === state.chamberInstanceId) return chamberInstance;
      return null;
    },
    createInstance(input: any) {
      recoveryOrder.push('create');
      chamberInstance = {
        meta: { ...input },
        template: { spawnX: 2, spawnY: 2 },
        tickSpeed: 1,
        paused: false,
        buildingById: new Map<string, any>(),
        listPlayerIds: () => [],
      };
      return chamberInstance;
    },
    async waitForInstanceLeaseReady(instanceId: string) {
      assert.ok(
        instanceId === state.sourceInstanceId || instanceId === state.chamberInstanceId,
        `unexpected lease target: ${instanceId}`,
      );
      recoveryOrder.push(`lease:${instanceId}`);
    },
    isInstanceLeaseWritable: (instance: any) => instance !== sourceInstance || sourceWritable,
    async hydratePersistentInstanceSnapshot(instanceId: string, instance: any) {
      recoveryOrder.push(`hydrate:${instanceId}`);
      if (instanceId === state.sourceInstanceId) {
        assert.equal(instance, sourceInstance);
        sourceInstance.buildingById.set(sourceBuilding.id, sourceBuilding);
        return;
      }
      assert.equal(instanceId, state.chamberInstanceId);
      assert.equal(instance, chamberInstance);
      instance.buildingById.set('building:inside', { id: 'building:inside' });
    },
    listInstanceEntries: () => [],
  };

  await service.applyRecoveredRuntimeState(runtime);
  assert.deepEqual(
    recoveryOrder,
    ['create', `lease:${state.chamberInstanceId}`, `hydrate:${state.chamberInstanceId}`],
    '补建密室必须在 lease 就绪后恢复分域持久化状态',
  );
  assert.equal(chamberInstance.buildingById.size, 1, '重启后补建的密室不能以空运行态覆盖已有内部建筑');

  recoveryOrder.length = 0;
  sourceInstance.buildingById.clear();
  chamberInstance.buildingById.clear();
  await service.applyRecoveredRuntimeState(runtime, { instanceDomainRestoreMode: 'lazy' });
  assert.deepEqual(recoveryOrder, [
    `lease:${state.sourceInstanceId}`,
    `hydrate:${state.sourceInstanceId}`,
    `lease:${state.chamberInstanceId}`,
    `hydrate:${state.chamberInstanceId}`,
  ], 'lazy 启动必须先恢复入口建筑分域，再恢复已有密室 catalog 空壳');
  assert.equal(sourceInstance.buildingById.has(sourceBuilding.id), true, '入口空壳水合后才能执行孤儿判定');
  assert.equal(chamberInstance.buildingById.size, 1, 'lazy 启动不能把未水合的密室空壳开放给玩家');

  recoveryOrder.length = 0;
  sourceWritable = false;
  chamberInstance.buildingById.clear();
  await service.applyRecoveredRuntimeState(runtime, { instanceDomainRestoreMode: 'lazy' });
  assert.deepEqual(recoveryOrder, [
    `lease:${state.chamberInstanceId}`,
    `hydrate:${state.chamberInstanceId}`,
  ], '入口属于其他节点时，本节点可写密室仍必须在开放前恢复分域');
  assert.equal(chamberInstance.buildingById.size, 1, '跨节点入口不能导致本地密室以空壳运行');

  recoveryOrder.length = 0;
  sourceWritable = true;
  await service.applyRecoveredRuntimeState(runtime, { instanceDomainRestoreMode: 'eager' });
  assert.deepEqual(
    recoveryOrder,
    [`lease:${state.chamberInstanceId}`],
    'eager 启动已恢复的密室不能重复读取分域真源',
  );
  service.onModuleDestroy();
}

async function testActivationExpiryRelocation(): Promise<void> {
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
    activeStartedAt: (Date.now() - 7_200_000) as number | null,
    activeExpiresAt: (Date.now() - 1) as number | null,
    activationPlayerId: 'player:expired' as string | null,
    activationSpiritStones: 200,
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
        hasRetainedPlayersInInstance: async () => false,
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
      if (normalizedSql.startsWith('SELECT player_id, facing')) {
        return {
          rows: [{
            player_id: 'player:expired',
            checkpoint_facing: 6,
          }],
          rowCount: 1,
        };
      }
      if (normalizedSql.startsWith('UPDATE instance_time_chamber_state')) {
        state.activeStartedAt = null;
        state.activeExpiresAt = null;
        state.activationPlayerId = null;
        state.activationSpiritStones = 0;
        state.revision += 1;
        return { rows: [], rowCount: 1 };
      }
      if (normalizedSql.startsWith('SELECT * FROM instance_time_chamber_state')) {
        return {
          rows: [{
            capacity: 1,
            configured_speed: state.configuredSpeed,
            display_name: state.displayName,
            active_started_at_ms: null,
            active_expires_at_ms: null,
            activation_player_id: null,
            activation_spirit_stones: 0,
            revision: state.revision,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  internals.storeState(state);

  const sourceInstance = {
    template: { id: 'map:source' },
    buildingById: new Map([[state.buildingId, { id: state.buildingId, x: 7, y: 8 }]]),
  };
  const chamberInstance = {
    tickSpeed: 4,
    paused: false,
    markPersistenceDirtyDomainsHighPriority(): void {},
    listPlayerIds: () => ['player:expired'],
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
  const remainingPlayers = await internals.expirePersistedActivationForState(state, runtime);
  assert.equal(remainingPlayers, false);
  assert.equal(location.instanceId, state.sourceInstanceId, '到期玩家必须迁回密室入口所在实例');
  assert.deepEqual(savedCheckpoints, [{
    instanceId: state.sourceInstanceId,
    x: 7,
    y: 8,
    facing: 6,
    checkpointKind: 'time_chamber_activation_expired',
  }], '到期迁出必须同步修正离线恢复位置');
  assert.equal(
    queryLog.some((sql) => sql.startsWith('UPDATE instance_time_chamber_state')),
    true,
    '玩家迁出并修正 checkpoint 后才清除全室开启记录',
  );
  assert.equal(chamberInstance.tickSpeed, 1, '全室开启到期后必须恢复一倍速');
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
    activeStartedAt: null,
    activeExpiresAt: null,
    activationPlayerId: null,
    activationSpiritStones: 0,
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
