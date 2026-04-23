import assert from 'node:assert/strict';

import { WorldRuntimeLootContainerService } from '../runtime/world/world-runtime-loot-container.service';

async function main(): Promise<void> {
  await testGroundTakeDurableGrant();
  await testGroundTakeAllDurableGrant();
  await testContainerTakeDurableGrant();
  await testContainerTakeAllDurableGrant();
  await testStartGatherSupportsColonInstanceId();
  await testHerbRefreshRegeneratesEntries();
  await testGatherCompletionDurableGrant();
  await testGatherCompletionDurableRollback();
  await testGatherCompletionDirtyDomains();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-loot-container',
    answers: '地面 pile 与容器 source 的单个拿取/全部拿取现在都会先走 grantInventoryItems durable 主链，成功提交后才刷新任务状态并补发 loot notice，同时透传 runtimeOwnerId/sessionEpoch/instanceId/assignedNodeId/ownershipEpoch；草药采集完成现在也会在 durable 提交成功后才返回 loot 结果，并在失败时回滚玩家运行态与容器状态',
    excludes: '不证明草药采集的 profession 变更已经并入同一资产事务，也不证明更泛化的 tick 资产 intent 编排',
  }, null, 2));
}

async function testGroundTakeDurableGrant() {
  const log: Array<unknown[]> = [];
  const durableCalls: Array<Record<string, unknown>> = [];
  let resolveDurable = () => {};
  const takenItems: Array<string> = [];
  const restoredItems: Array<string> = [];
  const player = buildPlayer('player:ground:one', 'instance:ground:1', 'runtime:ground:1', 15);
  const service = new WorldRuntimeLootContainerService({} as never, buildPlayerRuntimeService(player) as never);
  const instance = {
    getGroundPileBySourceId(sourceId: string) {
      assert.equal(sourceId, 'ground:1');
      return {
        x: 3,
        y: 4,
        items: [
          { itemKey: 'pile:item:1', item: { itemId: 'rat_tail', name: '鼠尾', count: 2, type: 'material' } },
        ],
      };
    },
    takeGroundItem(sourceId: string, itemKey: string) {
      assert.equal(sourceId, 'ground:1');
      assert.equal(itemKey, 'pile:item:1');
      takenItems.push(itemKey);
      return { itemId: 'rat_tail', name: '鼠尾', count: 2, type: 'material' };
    },
    dropGroundItem(x: number, y: number, item: { itemId: string; count: number }) {
      restoredItems.push(`${x}:${y}:${item.itemId}:x${item.count}`);
      return { sourceId: 'ground:restored:1' };
    },
  };
  const deps = {
    tick: 100,
    getPlayerLocationOrThrow() {
      return { instanceId: 'instance:ground:1' };
    },
    getInstanceRuntimeOrThrow() {
      return instance;
    },
    refreshQuestStates(playerId: string) {
      log.push(['refreshQuestStates', playerId]);
    },
    queuePlayerNotice(playerId: string, message: string, tone: string) {
      log.push(['queuePlayerNotice', playerId, message, tone]);
    },
    durableOperationService: {
      isEnabled() {
        return true;
      },
      grantInventoryItems(input: Record<string, unknown>) {
        durableCalls.push(input);
        return new Promise((resolve) => {
          resolveDurable = () => resolve({
            ok: true,
            alreadyCommitted: false,
            grantedCount: 2,
            sourceType: 'ground_take',
          });
        });
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        assert.equal(instanceId, 'instance:ground:1');
        return {
          assigned_node_id: 'node:ground',
          ownership_epoch: 31,
        };
      },
    },
  };

  const pendingTakeGround = service.dispatchTakeGround(player.playerId, 'ground:1', 'pile:item:1', deps as never);
  await nextTick();
  assert.deepEqual(takenItems, ['pile:item:1']);
  assert.equal(log.length, 0);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:ground:1');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 15);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:ground:1');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:ground');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 31);
  assert.equal(durableCalls[0]?.sourceType, 'ground_take');
  assert.equal(durableCalls[0]?.sourceRefId, 'ground:1:pile:item:1');
  assert.equal((durableCalls[0]?.grantedItems as Array<Record<string, unknown>>)?.[0]?.itemId, 'rat_tail');
  resolveDurable();
  await pendingTakeGround;
  assert.deepEqual(restoredItems, []);
  assert.deepEqual(log, [
    ['refreshQuestStates', 'player:ground:one'],
    ['queuePlayerNotice', 'player:ground:one', '获得 鼠尾 x2', 'loot'],
  ]);
}

async function testGroundTakeAllDurableGrant() {
  const log: Array<unknown[]> = [];
  const durableCalls: Array<Record<string, unknown>> = [];
  let resolveDurable = () => {};
  const player = buildPlayer('player:ground:all', 'instance:ground:2', 'runtime:ground:2', 16);
  const service = new WorldRuntimeLootContainerService({} as never, buildPlayerRuntimeService(player) as never);
  const pileItems = [
    { itemKey: 'pile:item:1', item: { itemId: 'rat_tail', name: '鼠尾', count: 2, type: 'material' } },
    { itemKey: 'pile:item:2', item: { itemId: 'wolf_fang', name: '狼牙', count: 1, type: 'material' } },
  ];
  const instance = {
    getGroundPileBySourceId(sourceId: string) {
      assert.equal(sourceId, 'ground:2');
      return {
        x: 6,
        y: 7,
        items: pileItems,
      };
    },
    takeGroundItem(_sourceId: string, itemKey: string) {
      const entry = pileItems.find((item) => item.itemKey === itemKey);
      assert.ok(entry);
      return { ...entry!.item };
    },
    dropGroundItem() {
      return { sourceId: 'ground:restored:2' };
    },
  };
  const deps = {
    tick: 200,
    getPlayerLocationOrThrow() {
      return { instanceId: 'instance:ground:2' };
    },
    getInstanceRuntimeOrThrow() {
      return instance;
    },
    refreshQuestStates(playerId: string) {
      log.push(['refreshQuestStates', playerId]);
    },
    queuePlayerNotice(playerId: string, message: string, tone: string) {
      log.push(['queuePlayerNotice', playerId, message, tone]);
    },
    durableOperationService: {
      isEnabled() {
        return true;
      },
      grantInventoryItems(input: Record<string, unknown>) {
        durableCalls.push(input);
        return new Promise((resolve) => {
          resolveDurable = () => resolve({
            ok: true,
            alreadyCommitted: false,
            grantedCount: 3,
            sourceType: 'ground_take_all',
          });
        });
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        assert.equal(instanceId, 'instance:ground:2');
        return {
          assigned_node_id: 'node:ground',
          ownership_epoch: 32,
        };
      },
    },
  };

  const pendingTakeGroundAll = service.dispatchTakeGroundAll(player.playerId, 'ground:2', deps as never);
  await nextTick();
  assert.equal(log.length, 0);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:ground:2');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 16);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:ground:2');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:ground');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 32);
  assert.equal(durableCalls[0]?.sourceType, 'ground_take_all');
  assert.equal(durableCalls[0]?.sourceRefId, 'ground:2');
  assert.equal((durableCalls[0]?.grantedItems as Array<Record<string, unknown>>)?.length, 2);
  resolveDurable();
  await pendingTakeGroundAll;
  assert.deepEqual(log, [
    ['refreshQuestStates', 'player:ground:all'],
    ['queuePlayerNotice', 'player:ground:all', '获得 鼠尾 x2、狼牙', 'loot'],
  ]);
}

async function testContainerTakeDurableGrant() {
  const log: Array<unknown[]> = [];
  const durableCalls: Array<Record<string, unknown>> = [];
  let resolveDurable = () => {};
  const player = buildPlayer('player:container:one', 'inst1', 'runtime:container:1', 21);
  player.x = 9;
  player.y = 10;
  const service = new WorldRuntimeLootContainerService({} as never, buildPlayerRuntimeService(player, {
    lootWindowTarget: { tileX: 9, tileY: 10 },
  }) as never);
  const container = {
    id: 'chest1',
    variant: 'chest',
    grade: 'mortal',
    x: 9,
    y: 10,
    lootPools: [],
    drops: [],
    name: '旧木箱',
  };
  service.hydrateContainerStates('inst1', [{
    sourceId: 'container:inst1:chest1',
    containerId: 'chest1',
    generatedAtTick: 5,
    refreshAtTick: undefined,
    entries: [
      {
        item: { itemId: 'rat_tail', name: '鼠尾', count: 2, type: 'material' },
        createdTick: 5,
        visible: true,
      },
    ],
  }]);
  const deps = {
    tick: 6,
    getPlayerLocationOrThrow() {
      return { instanceId: 'inst1' };
    },
    getInstanceRuntimeOrThrow() {
      return {
        getContainerById(containerId: string) {
          assert.equal(containerId, 'chest1');
          return container;
        },
      };
    },
    refreshQuestStates(playerId: string) {
      log.push(['refreshQuestStates', playerId]);
    },
    queuePlayerNotice(playerId: string, message: string, tone: string) {
      log.push(['queuePlayerNotice', playerId, message, tone]);
    },
    durableOperationService: {
      isEnabled() {
        return true;
      },
      grantInventoryItems(input: Record<string, unknown>) {
        durableCalls.push(input);
        return new Promise((resolve) => {
          resolveDurable = () => resolve({
            ok: true,
            alreadyCommitted: false,
            grantedCount: 2,
            sourceType: 'container_take',
          });
        });
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        assert.equal(instanceId, 'inst1');
        return {
          assigned_node_id: 'node:container',
          ownership_epoch: 41,
        };
      },
    },
  };

  const prepared = service.getPreparedContainerLootSource('inst1', container as never);
  const itemKey = Array.isArray(prepared?.items) ? prepared.items[0]?.itemKey : '';
  assert.equal(typeof itemKey, 'string');
  assert.ok(itemKey);
  const pendingContainerTake = service.dispatchTakeGround(player.playerId, 'container:inst1:chest1', itemKey, deps as never);
  await nextTick();
  assert.equal(log.length, 0);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:container:1');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 21);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'inst1');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:container');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 41);
  assert.equal(durableCalls[0]?.sourceType, 'container_take');
  assert.equal(durableCalls[0]?.sourceRefId, `container:inst1:chest1:${itemKey}`);
  resolveDurable();
  await pendingContainerTake;
  assert.deepEqual(log, [
    ['refreshQuestStates', 'player:container:one'],
    ['queuePlayerNotice', 'player:container:one', '获得 鼠尾 x2', 'loot'],
  ]);
}

async function testContainerTakeAllDurableGrant() {
  const log: Array<unknown[]> = [];
  const durableCalls: Array<Record<string, unknown>> = [];
  let resolveDurable = () => {};
  const player = buildPlayer('player:container:all', 'inst2', 'runtime:container:2', 22);
  player.x = 11;
  player.y = 12;
  const service = new WorldRuntimeLootContainerService({} as never, buildPlayerRuntimeService(player, {
    lootWindowTarget: { tileX: 11, tileY: 12 },
  }) as never);
  const container = {
    id: 'chest2',
    variant: 'chest',
    grade: 'mortal',
    x: 11,
    y: 12,
    lootPools: [],
    drops: [],
    name: '旧木箱',
  };
  service.hydrateContainerStates('inst2', [{
    sourceId: 'container:inst2:chest2',
    containerId: 'chest2',
    generatedAtTick: 5,
    refreshAtTick: undefined,
    entries: [
      {
        item: { itemId: 'rat_tail', name: '鼠尾', count: 2, type: 'material' },
        createdTick: 5,
        visible: true,
      },
      {
        item: { itemId: 'wolf_fang', name: '狼牙', count: 1, type: 'material' },
        createdTick: 5,
        visible: true,
      },
    ],
  }]);
  const deps = {
    tick: 6,
    getPlayerLocationOrThrow() {
      return { instanceId: 'inst2' };
    },
    getInstanceRuntimeOrThrow() {
      return {
        getContainerById(containerId: string) {
          assert.equal(containerId, 'chest2');
          return container;
        },
      };
    },
    refreshQuestStates(playerId: string) {
      log.push(['refreshQuestStates', playerId]);
    },
    queuePlayerNotice(playerId: string, message: string, tone: string) {
      log.push(['queuePlayerNotice', playerId, message, tone]);
    },
    durableOperationService: {
      isEnabled() {
        return true;
      },
      grantInventoryItems(input: Record<string, unknown>) {
        durableCalls.push(input);
        return new Promise((resolve) => {
          resolveDurable = () => resolve({
            ok: true,
            alreadyCommitted: false,
            grantedCount: 3,
            sourceType: 'container_take_all',
          });
        });
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        assert.equal(instanceId, 'inst2');
        return {
          assigned_node_id: 'node:container',
          ownership_epoch: 42,
        };
      },
    },
  };

  const pendingContainerTakeAll = service.dispatchTakeGroundAll(player.playerId, 'container:inst2:chest2', deps as never);
  await nextTick();
  assert.equal(log.length, 0);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:container:2');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 22);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'inst2');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:container');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 42);
  assert.equal(durableCalls[0]?.sourceType, 'container_take_all');
  assert.equal(durableCalls[0]?.sourceRefId, 'container:inst2:chest2');
  assert.equal((durableCalls[0]?.grantedItems as Array<Record<string, unknown>>)?.length, 2);
  resolveDurable();
  await pendingContainerTakeAll;
  assert.deepEqual(log, [
    ['refreshQuestStates', 'player:container:all'],
    ['queuePlayerNotice', 'player:container:all', '获得 鼠尾 x2、狼牙', 'loot'],
  ]);
}

async function testStartGatherSupportsColonInstanceId() {
  const instanceId = 'public:yunlai_town';
  const player = buildPlayer('player:gather:start', instanceId, 'runtime:gather:start', 23);
  player.x = 5;
  player.y = 6;
  const service = new WorldRuntimeLootContainerService({
    createItem(itemId: string, count: number) {
      return { itemId, count, name: '月露草', type: 'material', level: 10, grade: 'earth' };
    },
  } as never, buildPlayerRuntimeService(player, {
    lootWindowTarget: { tileX: 5, tileY: 6 },
  }) as never);
  player.gatherSkill = {
    level: 20,
    exp: 0,
    expToNext: 60,
  };
  const container = {
    id: 'lm_yunlai_moondew_5_6',
    name: '月露草',
    x: 5,
    y: 6,
    variant: 'herb',
    grade: 'earth',
    desc: '可采集草药',
    drops: [{ itemId: 'mat.moondew_grass', name: '月露草', count: 1, type: 'material' }],
    lootPools: [],
  };
  service.prepareContainerLootSource(instanceId, container as never, 10);
  const prepared = service.getPreparedContainerLootSource(instanceId, container as never, player as never);
  const itemKey = Array.isArray(prepared?.items) ? prepared.items[0]?.itemKey : '';
  assert.equal(typeof itemKey, 'string');
  assert.ok(itemKey);
  assert.equal(prepared?.sourceId, `container:${instanceId}:${container.id}`);
  assert.equal(prepared?.herb?.nativeGatherTicks, 7);
  assert.equal(prepared?.herb?.gatherTicks, 5);
  const deps = {
    tick: 10,
    getPlayerLocationOrThrow() {
      return { instanceId };
    },
    getInstanceRuntimeOrThrow() {
      return {
        getContainerById(containerId: string) {
          assert.equal(containerId, container.id);
          return container;
        },
      };
    },
  };

  const result = service.dispatchStartGather(player.playerId, { sourceId: prepared?.sourceId, itemKey }, deps as never);
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages, [{ kind: 'info', text: '你开始采集 月露草。' }]);
  assert.equal(player.gatherJob?.resourceNodeId, container.id);
  assert.equal(player.gatherJob?.remainingTicks, 5);
}

async function testHerbRefreshRegeneratesEntries() {
  const instanceId = 'public:yunlai_town';
  const service = new WorldRuntimeLootContainerService({
    createItem(itemId: string, count: number) {
      return { itemId, count, name: '月露草', type: 'material', level: 1 };
    },
  } as never, buildPlayerRuntimeService(buildPlayer('player:gather:refresh', instanceId, 'runtime:gather:refresh', 24)) as never);
  const container = {
    id: 'lm_yunlai_moondew_5_6',
    name: '月露草',
    x: 5,
    y: 6,
    variant: 'herb',
    grade: 'mortal',
    desc: '可采集草药',
    refreshTicksMin: 5,
    refreshTicksMax: 5,
    drops: [{ itemId: 'mat.moondew_grass', name: '月露草', count: 1, type: 'material' }],
    lootPools: [],
  };
  service.hydrateContainerStates(instanceId, [{
    sourceId: `container:${instanceId}:${container.id}`,
    containerId: container.id,
    generatedAtTick: 1,
    refreshAtTick: 5,
    entries: [],
    activeSearch: undefined,
  }]);

  service.prepareContainerLootSource(instanceId, container as never, 5);
  const refreshed = service.getPreparedContainerLootSource(instanceId, container as never);
  assert.ok(refreshed);
  assert.equal(refreshed?.items.length, 1);
  assert.equal(refreshed?.items[0]?.item.itemId, 'mat.moondew_grass');
}

async function testGatherCompletionDurableGrant() {
  const durableCalls: Array<Record<string, unknown>> = [];
  let resolveDurable = () => {};
  const player = buildPlayer('player:gather:durable', 'inst-gather-durable', 'runtime:gather:durable', 24);
  player.x = 5;
  player.y = 6;
  player.gatherSkill = {
    level: 1,
    exp: 0,
    expToNext: 60,
  };
  player.gatherJob = {
    resourceNodeId: 'herb1',
    resourceNodeName: '凝露草',
    startedAt: Date.now(),
    totalTicks: 720,
    remainingTicks: 1,
    pausedTicks: 0,
    successRate: 1,
    spiritStoneCost: 0,
    phase: 'gathering',
  };
  const service = new WorldRuntimeLootContainerService({} as never, buildPlayerRuntimeService(player, {
    lootWindowTarget: { tileX: 5, tileY: 6 },
  }) as never);
  const container = {
    id: 'herb1',
    variant: 'herb',
    grade: 'mortal',
    x: 5,
    y: 6,
    lootPools: [],
    drops: [],
    name: '凝露草',
  };
  const baseState = {
    sourceId: 'container:inst-gather-durable:herb1',
    containerId: 'herb1',
    generatedAtTick: 1,
    refreshAtTick: undefined,
    entries: [
      {
        item: { itemId: 'herb.lingdew_grass', name: '凝露草', count: 1, level: 5, type: 'material' },
        createdTick: 1,
        visible: true,
      },
    ],
    activeSearch: undefined,
  };
  service.hydrateContainerStates('inst-gather-durable', [baseState]);
  const prepared = service.getPreparedContainerLootSource('inst-gather-durable', container as never);
  const itemKey = Array.isArray(prepared?.items) ? prepared.items[0]?.itemKey : '';
  assert.equal(typeof itemKey, 'string');
  assert.ok(itemKey);
  service.hydrateContainerStates('inst-gather-durable', [{
    ...baseState,
    activeSearch: {
      itemKey,
      totalTicks: 720,
      remainingTicks: 1,
    },
  }]);
  const deps = {
    tick: 2,
    getPlayerLocationOrThrow() {
      return { instanceId: 'inst-gather-durable' };
    },
    getInstanceRuntimeOrThrow() {
      return {
        getContainerById(containerId: string) {
          assert.equal(containerId, 'herb1');
          return container;
        },
      };
    },
    refreshQuestStates() {},
    durableOperationService: {
      isEnabled() {
        return true;
      },
      grantInventoryItems(input: Record<string, unknown>) {
        durableCalls.push(input);
        return new Promise((resolve) => {
          resolveDurable = () => resolve({
            ok: true,
            alreadyCommitted: false,
            grantedCount: 1,
            sourceType: 'gather_completion',
          });
        });
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        assert.equal(instanceId, 'inst-gather-durable');
        return {
          assigned_node_id: 'node:gather',
          ownership_epoch: 51,
        };
      },
    },
  };

  const pending = service.tickGather(player.playerId, deps as never);
  await nextTick();
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:gather:durable');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 24);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'inst-gather-durable');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:gather');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 51);
  assert.equal(durableCalls[0]?.sourceType, 'gather_completion');
  assert.equal(durableCalls[0]?.sourceRefId, `container:inst-gather-durable:herb1:${itemKey}`);
  resolveDurable();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages, [{ kind: 'loot', text: '获得 凝露草' }]);
  assert.equal(result.inventoryChanged, true);
  assert.equal(result.attrChanged, true);
}

async function testGatherCompletionDurableRollback() {
  const player = buildPlayer('player:gather:rollback', 'inst-gather-rollback', 'runtime:gather:rollback', 25);
  player.x = 7;
  player.y = 8;
  player.gatherSkill = {
    level: 1,
    exp: 0,
    expToNext: 60,
  };
  player.gatherJob = {
    resourceNodeId: 'herb2',
    resourceNodeName: '凝露草',
    startedAt: Date.now(),
    totalTicks: 720,
    remainingTicks: 1,
    pausedTicks: 0,
    successRate: 1,
    spiritStoneCost: 0,
    phase: 'gathering',
  };
  const service = new WorldRuntimeLootContainerService({} as never, buildPlayerRuntimeService(player, {
    lootWindowTarget: { tileX: 7, tileY: 8 },
  }) as never);
  const container = {
    id: 'herb2',
    variant: 'herb',
    grade: 'mortal',
    x: 7,
    y: 8,
    lootPools: [],
    drops: [],
    name: '凝露草',
  };
  const baseState = {
    sourceId: 'container:inst-gather-rollback:herb2',
    containerId: 'herb2',
    generatedAtTick: 1,
    refreshAtTick: undefined,
    entries: [
      {
        item: { itemId: 'herb.lingdew_grass', name: '凝露草', count: 1, level: 5, type: 'material' },
        createdTick: 1,
        visible: true,
      },
    ],
    activeSearch: undefined,
  };
  service.hydrateContainerStates('inst-gather-rollback', [baseState]);
  const prepared = service.getPreparedContainerLootSource('inst-gather-rollback', container as never);
  const itemKey = Array.isArray(prepared?.items) ? prepared.items[0]?.itemKey : '';
  assert.equal(typeof itemKey, 'string');
  assert.ok(itemKey);
  service.hydrateContainerStates('inst-gather-rollback', [{
    ...baseState,
    activeSearch: {
      itemKey,
      totalTicks: 720,
      remainingTicks: 1,
    },
  }]);
  const deps = {
    tick: 2,
    getPlayerLocationOrThrow() {
      return { instanceId: 'inst-gather-rollback' };
    },
    getInstanceRuntimeOrThrow() {
      return {
        getContainerById(containerId: string) {
          assert.equal(containerId, 'herb2');
          return container;
        },
      };
    },
    refreshQuestStates() {},
    durableOperationService: {
      isEnabled() {
        return true;
      },
      async grantInventoryItems() {
        throw new Error('durable_gather_failed');
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog() {
        return {
          assigned_node_id: 'node:gather',
          ownership_epoch: 52,
        };
      },
    },
  };

  const result = await service.tickGather(player.playerId, deps as never);
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages, [{ kind: 'warn', text: '采集失败，草药仍保留在原处。' }]);
  assert.deepEqual(player.inventory.items, []);
  assert.equal(player.gatherSkill?.exp, 0);
  assert.equal(Number(player.gatherJob?.remainingTicks), 1);
  const restored = service.getPreparedContainerLootSource('inst-gather-rollback', container as never);
  assert.equal(Array.isArray(restored?.items) ? restored.items.length : 0, 1);
}

async function testGatherCompletionDirtyDomains() {
  const player = buildPlayer('player:gather', 'inst:gather', 'runtime:gather', 23);
  player.x = 5;
  player.y = 6;
  const container = {
    id: 'herb1',
    variant: 'herb',
    grade: 'mortal',
    x: 5,
    y: 6,
    lootPools: [],
    drops: [],
    name: '凝露草',
  };
  player.gatherSkill = {
    level: 1,
    exp: 0,
    expToNext: 60,
  };
  player.gatherJob = {
    resourceNodeId: 'herb1',
    resourceNodeName: '凝露草',
    startedAt: Date.now(),
    totalTicks: 720,
    remainingTicks: 1,
    pausedTicks: 0,
    successRate: 1,
    spiritStoneCost: 0,
    phase: 'gathering',
  };
  const markedDomains: Array<string[]> = [];
  const service = new WorldRuntimeLootContainerService({} as never, buildPlayerRuntimeService(player, {
    lootWindowTarget: { tileX: 5, tileY: 6 },
    onMarkPersistenceDirtyDomains(_targetPlayer, domains) {
      markedDomains.push([...domains]);
    },
  }) as never);
  const state = {
    sourceId: 'container:inst:gather:herb1',
    containerId: 'herb1',
    generatedAtTick: 1,
    refreshAtTick: undefined,
    entries: [
      {
        item: { itemId: 'herb.lingdew_grass', name: '凝露草', count: 1, level: 5, type: 'material' },
        createdTick: 1,
        visible: true,
      },
    ],
    activeSearch: undefined,
  };
  service.hydrateContainerStates('inst:gather', [state]);
  const prepared = service.getPreparedContainerLootSource('inst:gather', container as never);
  const itemKey = Array.isArray(prepared?.items) ? prepared.items[0]?.itemKey : '';
  assert.equal(typeof itemKey, 'string');
  assert.ok(itemKey);
  service.hydrateContainerStates('inst:gather', [{
    ...state,
    activeSearch: {
      itemKey,
      totalTicks: 720,
      remainingTicks: 1,
    },
  }]);
  const deps = {
    tick: 2,
    getPlayerLocationOrThrow() {
      return { instanceId: 'inst:gather' };
    },
    getInstanceRuntimeOrThrow() {
      return {
        getContainerById(containerId: string) {
          assert.equal(containerId, 'herb1');
          return container;
        },
      };
    },
    refreshQuestStates() {},
  };

  const result = await service.tickGather(player.playerId, deps as never);
  assert.equal(result.ok, true);
  assert.deepEqual(markedDomains, [['inventory', 'profession']]);
  assert.equal(player.dirtyDomains.has('inventory'), true);
  assert.equal(player.dirtyDomains.has('profession'), true);
}

function buildPlayer(playerId: string, instanceId: string, runtimeOwnerId: string, sessionEpoch: number) {
  return {
    playerId,
    instanceId,
    runtimeOwnerId,
    sessionEpoch,
    x: 1,
    y: 2,
    inventory: {
      items: [],
      revision: 0,
      capacity: 20,
    },
    persistentRevision: 0,
    selfRevision: 0,
    dirtyDomains: new Set<string>(),
    suppressImmediateDomainPersistence: false,
    gatherSkill: null as null | {
      level: number;
      exp: number;
      expToNext: number;
    },
    gatherJob: null as null | Record<string, unknown>,
  };
}

function buildPlayerRuntimeService(
  player: ReturnType<typeof buildPlayer>,
  options: {
    lootWindowTarget?: { tileX: number; tileY: number } | null;
    onMarkPersistenceDirtyDomains?: (player: ReturnType<typeof buildPlayer>, domains: string[]) => void;
  } = {},
) {
  return {
    getPlayer(playerId: string) {
      assert.equal(playerId, player.playerId);
      return player;
    },
    getPlayerOrThrow(playerId: string) {
      assert.equal(playerId, player.playerId);
      return player;
    },
    getLootWindowTarget() {
      return options.lootWindowTarget ?? null;
    },
    clearLootWindow() {},
    receiveInventoryItem(playerId: string, item: { itemId: string; count: number }) {
      assert.equal(playerId, player.playerId);
      player.inventory.items.push({ ...item });
      player.inventory.revision += 1;
      player.persistentRevision += 1;
      player.selfRevision += 1;
      player.dirtyDomains = new Set(['inventory']);
    },
    markPersistenceDirtyDomains(targetPlayer: ReturnType<typeof buildPlayer>, domains: string[]) {
      options.onMarkPersistenceDirtyDomains?.(targetPlayer, domains);
      for (const domain of domains) {
        targetPlayer.dirtyDomains.add(domain);
      }
    },
    bumpPersistentRevision(targetPlayer: ReturnType<typeof buildPlayer>) {
      targetPlayer.persistentRevision += 1;
      targetPlayer.selfRevision += 1;
    },
    playerProgressionService: {
      refreshPreview() {},
    },
  };
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
