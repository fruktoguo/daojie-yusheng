/**
 * 背包网关路由与分页投影 smoke。
 */
import assert from 'node:assert/strict';
import { S2C, type S2C_InventoryPage } from '@mud/shared';
import { WorldGatewayInventoryHelper } from '../network/world-gateway-inventory.helper';
import type { WorldGatewayHelperContext } from '../network/world-gateway-context.types';

type SmokeLogEntry = unknown[];

function createGateway(log: SmokeLogEntry[] = [], playerId = 'player:1'): WorldGatewayHelperContext {
  const runtime = {
    worldRuntimeCommandIntakeFacadeService: {
      enqueueTakeGround(inputPlayerId: string, sourceId: string, itemKey: string, deps: unknown) {
        log.push(['enqueueTakeGround', inputPlayerId, sourceId, itemKey, deps === runtime]);
      },
      enqueueTakeGroundAll(inputPlayerId: string, sourceId: string, deps: unknown) {
        log.push(['enqueueTakeGroundAll', inputPlayerId, sourceId, deps === runtime]);
      },
      enqueueStartTechniqueActivity(inputPlayerId: string, kind: string, payload: unknown, deps: unknown) {
        log.push(['enqueueStartTechniqueActivity', inputPlayerId, kind, payload, deps === runtime]);
      },
      enqueueCancelTechniqueActivity(inputPlayerId: string, kind: string, deps: unknown) {
        log.push(['enqueueCancelTechniqueActivity', inputPlayerId, kind, deps === runtime]);
      },
    },
  };
  return {
    gatewayGuardHelper: {
      requirePlayerId() {
        return playerId;
      },
    },
    playerRuntimeService: {
      clearLootWindow(inputPlayerId: string) {
        log.push(['clearLootWindow', inputPlayerId]);
      },
    },
    worldClientEventService: {
      markProtocol(client: { id: string }, protocol: string) {
        log.push(['markProtocol', client.id, protocol]);
      },
      emitGatewayError(client: { id: string }, code: string, error: unknown) {
        log.push(['emitGatewayError', client.id, code, error instanceof Error ? error.message : String(error)]);
      },
    },
    worldRuntimeService: runtime,
  } as unknown as WorldGatewayHelperContext;
}

function createClient(log: SmokeLogEntry[] = [], id = 'socket:1') {
  return {
    id,
    emit(event: string, payload: unknown) {
      log.push(['emit', event, payload]);
    },
  };
}

function testInventoryGatherRouting(): void {
  const log: SmokeLogEntry[] = [];
  const gateway = createGateway(log);
  const helper = new WorldGatewayInventoryHelper(gateway);
  const client = createClient(log);

  helper.handleTakeGround(client, { sourceId: 'ground:1', itemKey: 'item:1', takeAll: false });
  helper.handleTakeGround(client, { sourceId: 'container:1', takeAll: true });
  helper.handleStartGather(client, { sourceId: 'container:inst:herb', itemKey: 'item:herb' });
  helper.handleCancelGather(client, {});
  helper.handleStopLootHarvest(client, {});

  assert.deepEqual(log, [
    ['enqueueTakeGround', 'player:1', 'ground:1', 'item:1', true],
    ['enqueueTakeGroundAll', 'player:1', 'container:1', true],
    ['markProtocol', 'socket:1', 'mainline'],
    ['enqueueStartTechniqueActivity', 'player:1', 'gather', { sourceId: 'container:inst:herb', itemKey: 'item:herb' }, true],
    ['markProtocol', 'socket:1', 'mainline'],
    ['enqueueCancelTechniqueActivity', 'player:1', 'gather', true],
    ['clearLootWindow', 'player:1'],
    ['emit', S2C.LootWindowUpdate, { window: null }],
  ]);
}

function testInventoryGatewayErrors(): void {
  const log: SmokeLogEntry[] = [];
  const gateway = createGateway(log);
  const commandIntake = gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService as unknown as {
    enqueueStartTechniqueActivity(): void;
    enqueueCancelTechniqueActivity(): void;
  };
  commandIntake.enqueueStartTechniqueActivity = () => {
    throw new Error('start gather failed');
  };
  commandIntake.enqueueCancelTechniqueActivity = () => {
    throw new Error('cancel gather failed');
  };
  const helper = new WorldGatewayInventoryHelper(gateway);
  const client = createClient(log);

  helper.handleStartGather(client, { sourceId: 'container:inst:herb' });
  helper.handleCancelGather(client, {});

  assert.deepEqual(log, [
    ['markProtocol', 'socket:1', 'mainline'],
    ['emitGatewayError', 'socket:1', 'START_GATHER_FAILED', 'start gather failed'],
    ['markProtocol', 'socket:1', 'mainline'],
    ['emitGatewayError', 'socket:1', 'CANCEL_GATHER_FAILED', 'cancel gather failed'],
  ]);
}

function testInventoryPagePreservesInstanceProjection(): void {
  const log: SmokeLogEntry[] = [];
  const gateway = createGateway(log);
  const sourceItem = {
    itemId: 'equip.copper_luopan',
    itemInstanceId: ' instance:luopan ',
    count: 1,
    name: '铜罗盘',
    type: 'equipment',
    desc: '实例描述',
    grade: 'yellow',
    level: 1,
    equipSpecialStats: { luck: 7 },
    consumeBuffs: [{ buffId: 'buff.instance', name: '实例增益', durationTicks: 12 }],
    contextActions: [{ id: 'fengshui:inspect', name: '望气', type: 'interact', desc: '', cooldownLeft: 0 }],
    craftEffectStats: { formation: { speedRate: 0.2 } },
    internalSecret: '不得进入协议',
  };
  (gateway.playerRuntimeService as unknown as { getPlayer(playerId: string): unknown }).getPlayer = () => ({
    inventory: {
      capacity: 200,
      revision: 9,
      serverTick: 123,
      cooldowns: [{ itemId: 'pill.test', cooldown: 60, startedAtTick: 120 }],
      items: [
        { itemId: 'material.wood', itemInstanceId: 'instance:wood', count: 2, name: '木材', type: 'material', desc: '' },
        sourceItem,
        { itemId: 'pill.test', itemInstanceId: 'instance:pill', count: 3, name: '回气丹', type: 'consumable', desc: '' },
      ],
    },
  });
  const helper = new WorldGatewayInventoryHelper(gateway);
  const client = createClient(log);

  helper.handleRequestInventoryPage(client, {
    filter: 'equipment',
    search: ' 铜  罗盘 ',
    offset: 0,
    limit: 999,
    requestId: ' request:inventory:1 ',
  });

  assert.equal(log.length, 1);
  const [kind, event, rawPage] = log[0];
  assert.equal(kind, 'emit');
  assert.equal(event, S2C.InventoryPage);
  const page = rawPage as S2C_InventoryPage;
  assert.equal(page.requestId, 'request:inventory:1');
  assert.equal(page.filter, 'equipment');
  assert.equal(page.search, '铜 罗盘');
  assert.equal(page.limit, 30);
  assert.equal(page.total, 1);
  assert.equal(page.totalItems, 3);
  assert.equal(page.capacity, 200);
  assert.equal(page.revision, 9);
  assert.equal(page.serverTick, 123);
  assert.equal(page.items[0]?.slotIndex, 1);
  const projectedItem = page.items[0]?.item;
  assert.equal(projectedItem?.itemInstanceId, 'instance:luopan');
  assert.deepEqual(projectedItem?.equipSpecialStats, { luck: 7 });
  assert.deepEqual(projectedItem?.consumeBuffs, sourceItem.consumeBuffs);
  assert.deepEqual(projectedItem?.contextActions, sourceItem.contextActions);
  assert.deepEqual(projectedItem?.craftEffectStats, sourceItem.craftEffectStats);
  assert.equal('internalSecret' in (projectedItem as object), false, '运行时内部字段不得泄露到分页协议');

  sourceItem.equipSpecialStats.luck = 99;
  sourceItem.consumeBuffs[0].name = '已污染';
  assert.equal(projectedItem?.equipSpecialStats?.luck, 7, '分页回包不得共享运行时物品引用');
  assert.equal(projectedItem?.consumeBuffs?.[0]?.name, '实例增益', '分页回包嵌套数组必须独立克隆');

  helper.handleRequestInventoryPage(client, { filter: 'all', offset: 0, limit: 30, requestId: '' });
  assert.deepEqual(log[1], [
    'emitGatewayError',
    'socket:1',
    'REQUEST_INVENTORY_PAGE_FAILED',
    '背包分页请求 ID 无效',
  ], '缺少 requestId 的请求必须 fail-closed，不能生成无法关联的回包');

  helper.handleRequestInventoryPage(client, {
    filter: 'all',
    offset: 0,
    limit: 30,
    requestId: 'request:inventory:ahead',
    knownRevision: 10,
  });
  assert.deepEqual(log[2], [
    'emitGatewayError',
    'socket:1',
    'REQUEST_INVENTORY_PAGE_FAILED',
    '客户端背包版本领先于当前运行态，请重新同步',
  ], '服务端不得用旧 revision 覆盖客户端已知的新背包');
}

testInventoryGatherRouting();
testInventoryGatewayErrors();
testInventoryPagePreservesInstanceProjection();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-inventory-helper' }, null, 2));
