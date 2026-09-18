import assert from 'node:assert/strict';
import { PLANTED_HERB_DURATION_TICKS, SPIRIT_FARMLAND_BUILDING_ID, computeHerbGrowthRate, computePlantSeedDropChance, getAuraLevelThreshold } from '@mud/shared';
import { WorldRuntimeLootContainerService } from '../runtime/world/world-runtime-loot-container.service';
import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';
import { advanceHerbGrowthProgress } from '../runtime/world/herb-growth.helpers';
import { repairStaleHerbSchedule } from '../runtime/world/world-runtime-loot-container.helpers';
import { assertPlantSeedPlacement } from '../runtime/world/plant-seed-use.helpers';
import { rollGatherSeed } from '../runtime/craft/gather-seed.helpers';
import { parseContainerSourceId } from '../runtime/world/world-runtime.normalization.helpers';
import { createPlantingContent, createPlantingInstance, withPlantingRandom } from './planting-smoke-fixtures';

const content = createPlantingContent();
const noViewers = { listConnectedPlayerIds: () => [] };

function testSeeds(): void {
  assert.equal(content.plantingContent.bySeedItemId.size, 29);
  assert.equal(computePlantSeedDropChance(), 0.00001);
  assert.ok(Math.abs(computePlantSeedDropChance(0.1) - 0.000011) < 1e-15);
  const player = { luck: 5, gatherSkill: { level: 999 }, attrs: { craftEffectStats: { gather: { outputRate: 999 } } } };
  for (const definition of content.plantingContent.bySeedItemId.values()) {
    const dropId = definition.container.drops[0].itemId;
    const seed = withPlantingRandom(0.0000102, () => rollGatherSeed(player, definition.container, dropId, content));
    assert.equal(seed?.itemId, definition.seedItemId);
    assert.equal(seed.count, 1);
    assert.equal(withPlantingRandom(0.0000106, () => rollGatherSeed(player, definition.container, dropId, content)), null);
    assert.equal(withPlantingRandom(0, () => rollGatherSeed(player, { ...definition.container, variant: undefined }, dropId, content)), null);
  }
}

function testGrowth(): void {
  assert.equal(computeHerbGrowthRate(0), 1);
  assert.equal(computeHerbGrowthRate(1), 1.1);
  assert.equal(computeHerbGrowthRate(10), 1.1 ** 10);
  const state: any = { generatedAtTick: 0, refreshAtTick: 100 };
  let count = 0;
  const advance = (tick: number, rate: number) => advanceHerbGrowthProgress(state, tick, rate, () => count++, () => 100);
  advance(0, 1.1);
  assert.equal(state.refreshAtTick, 91);
  advance(50, 2);
  assert.ok(Math.abs(state.herbGrowth.remainingWork - 45) < 1e-10);
  assert.equal(state.refreshAtTick, 73);
  advance(73, 2);
  assert.equal(count, 1);
  const saved = structuredClone(state);
  advance(100, 2);
  let restoredCount = 0;
  advanceHerbGrowthProgress(saved, 100, 2, () => restoredCount++, () => 100);
  assert.deepEqual(state, saved, '重启不重置已累计的小数工作量');
  assert.equal(restoredCount, 0);
  advance(100, 1_000);
  advance(101, 1_000);
  assert.equal(count, 11, '高灵气允许每息恢复多份');
}

function testGrowthAfterClockRollback(): void {
  // 实例 tick 从旧 checkpoint 恢复时会回退到 herbGrowth.lastTick 之前；
  // 进度基准必须压回当前 tick 继续生长，而不是永久停摆。
  const state: any = {
    generatedAtTick: 1_000,
    refreshAtTick: 40,
    herbGrowth: { lastTick: 5_000, remainingWork: 60, rate: 1 },
    entries: [],
  };
  let count = 0;
  const advance = (tick: number) => advanceHerbGrowthProgress(state, tick, 1, () => count++, () => 100);
  advance(50);
  assert.equal(state.herbGrowth.lastTick, 50, '时钟回退必须压回进度基准');
  assert.equal(count, 0);
  advance(110);
  assert.equal(count, 1, '回退后剩余工作量继续结算，不再停摆');
  assert.equal(state.herbGrowth.lastTick, 110);
  // 同一息内重复推进仍必须去重，不能因为基准修正而多产。
  advance(110);
  assert.equal(count, 1);
  // 排程被判定为陈旧未来时，重建必须同时清除失效生长进度，
  // 否则残留的 herbGrowth.lastTick 仍会把推进卡死在原时钟上。
  const stale: any = {
    generatedAtTick: 1_000,
    refreshAtTick: 999_999,
    herbGrowth: { lastTick: 999_999, remainingWork: 5, rate: 1 },
    entries: [],
  };
  const repaired = repairStaleHerbSchedule({ variant: 'herb', refreshTicks: 100 }, stale, 50);
  assert.equal(repaired, true);
  assert.equal(stale.herbGrowth, undefined, '排程重建必须清除失效生长进度');
}

async function testPlantingAndLifetime(): Promise<void> {
  const instance = createPlantingInstance();
  const player: any = { playerId: 'player:planting', instanceId: instance.meta.instanceId, x: 2, y: 2,
    realm: { realmLv: 1 }, runtimeOwnerId: 'node:planting', sessionEpoch: 1, inventory: { items: [] } };
  assert.throws(() => assertPlantSeedPlacement(instance, player, {}), /灵田/);
  const placed = instance.placeBuildingInstance({ defId: SPIRIT_FARMLAND_BUILDING_ID, x: 2, y: 2, buildingId: 'farmland:1' });
  assert.equal(placed.ok, true);
  assert.equal(assertPlantSeedPlacement(instance, player, {}), 'farmland:1');
  placed.building.state = 'building';
  assert.throws(() => assertPlantSeedPlacement(instance, player, {}));
  placed.building.state = 'active';
  instance.template.playerOverlapMask[instance.toTileIndex(2, 2)] = 1;
  assert.throws(() => assertPlantSeedPlacement(instance, player, {}));
  instance.template.playerOverlapMask[instance.toTileIndex(2, 2)] = 0;
  instance.addTileAura(2, 2, getAuraLevelThreshold(10));
  const seed = content.createItem('seed.moondew_grass', 1);
  player.inventory.items.push(seed);
  const playerService: any = {
    peekInventoryItemByInstanceId: (_id: string, itemId: string) => player.inventory.items.find((entry: any) => entry.itemInstanceId === itemId),
    getPlayerOrThrow: () => player, getPlayer: () => player,
    replaceInventoryItems: (_id: string, items: any[]) => { player.inventory.items = items; },
    getLootWindowTarget: () => ({ tileX: 2, tileY: 2 }),
    receiveInventoryItem: (_id: string, item: any) => player.inventory.items.push(item),
  };
  const loot = new WorldRuntimeLootContainerService(content, playerService);
  const use = new WorldRuntimeUseItemService(content, {}, playerService);
  use.syncCurrentPlayerPresence = async () => true;
  Object.assign(instance.meta, { assignedNodeId: 'node:planting', leaseToken: 'lease:planting', ownershipEpoch: 1 });
  let fail = true;
  const deps: any = {
    getPlayerLocationOrThrow: () => ({ instanceId: instance.meta.instanceId }), getInstanceRuntimeOrThrow: () => instance,
    worldRuntimeLootContainerService: loot, contentTemplateRepository: content, queuePlayerNotice: () => undefined,
    refreshQuestStates: () => undefined,
    durableOperationService: { isEnabled: () => true, grantInventoryItems: async (request: any) => {
      assert.equal(player.inventory.items.length, 1);
      assert.equal(instance.getContainerAtTile(2, 2), null, '事务提交前不能生成植物');
      assert.equal(request.sourceMutation.statePayload.plantedHerb.seedItemId, seed.itemId);
      if (fail) throw new Error('模拟种植事务失败');
    } },
  };
  await assert.rejects(use.dispatchUseItem(player.playerId, seed.itemInstanceId, deps), /模拟种植事务失败/);
  assert.equal(player.inventory.items.length, 1);
  assert.equal(loot.buildContainerPersistenceStates(instance.meta.instanceId).length, 0);
  fail = false;
  await use.dispatchUseItem(player.playerId, seed.itemInstanceId, deps);
  assert.equal(player.inventory.items.length, 0);
  assert.throws(() => assertPlantSeedPlacement(instance, player, {}), /灵田/);
  const container = instance.getContainerAtTile(2, 2);
  assert.equal(container?.name, '月露草');
  assert.equal(instance.template.containers.length, 0, '不得污染共享模板');
  assert.equal(instance.collectLocalContainers(2, 2, 2).length, 1);
  const state: any = loot.ensureContainerState(instance.meta.instanceId, container, instance.tick);
  assert.deepEqual(parseContainerSourceId(state.sourceId), { instanceId: instance.meta.instanceId, containerId: container.id });
  assert.ok(state.herbGrowth.rate > 2.59);
  const originalCount = state.entries.reduce((sum: number, row: any) => sum + row.item.count, 0);
  const prepared = loot.getPreparedContainerLootSource(instance.meta.instanceId, container, player, instance.tick);
  const itemKey = prepared.items[0].itemKey;
  state.activeSearch = { playerId: player.playerId, jobRunId: 'gather:seed-proof', itemKey, totalTicks: 1, remainingTicks: 1 };
  player.gatherJob = { resourceNodeId: container.id, sourceId: state.sourceId, jobRunId: 'gather:seed-proof',
    itemKey, totalTicks: 1, remainingTicks: 1 };
  const previousRandom = Math.random;
  try {
    Math.random = () => 0;
    const gathered = await loot.tickGather(player.playerId, deps);
    assert.equal(gathered.inventoryChanged, true);
    assert.ok(player.inventory.items.some((entry: any) => entry.itemId === 'seed.moondew_grass'));
    assert.ok(player.inventory.items.some((entry: any) => entry.itemId === 'mat.moondew_grass'));
    const itemsAfterSuccess = player.inventory.items.length;
    await loot.tickGather(player.playerId, deps);
    assert.equal(player.inventory.items.length, itemsAfterSuccess, '没有成功采集不能抽种子');
  } finally {
    Math.random = previousRandom;
  }
  instance.tick = 100;
  loot.advanceContainerSearchesForInstance(instance.meta.instanceId, { getInstanceRuntime: () => instance }, noViewers, instance.tick);
  assert.ok(state.entries.reduce((sum: number, row: any) => sum + row.item.count, 0) > originalCount);
  const snapshot = loot.buildContainerPersistenceStates(instance.meta.instanceId);
  const restored = createPlantingInstance();
  restored.placeBuildingInstance({ defId: SPIRIT_FARMLAND_BUILDING_ID, x: 2, y: 2, buildingId: 'farmland:1' });
  const restoredLoot = new WorldRuntimeLootContainerService(content, playerService);
  restoredLoot.hydrateContainerStates(restored.meta.instanceId, snapshot, restored);
  assert.equal(restored.getContainerAtTile(2, 2)?.name, '月露草');
  assert.deepEqual(restoredLoot.buildContainerPersistenceStates(restored.meta.instanceId), snapshot);
  restoredLoot.hydrateContainerStates(restored.meta.instanceId, [], restored);
  assert.equal(restored.getContainerAtTile(2, 2), null, '空快照重同步必须移除旧植物索引');
  restoredLoot.hydrateContainerStates(restored.meta.instanceId, snapshot, restored);
  assert.equal(restored.containersById.size, 1, '重复水合不新增副本');
  restored.tick = PLANTED_HERB_DURATION_TICKS;
  assert.equal(restored.getContainerAtTile(2, 2), null, '截止息即不能再采集');
  restoredLoot.advanceContainerSearchesForInstance(restored.meta.instanceId, { getInstanceRuntime: () => restored }, noViewers, restored.tick);
  assert.equal(restored.containersById.size, 0);
  assert.equal(restoredLoot.buildContainerPersistenceStates(restored.meta.instanceId).length, 0);
  assert.equal(restored.buildingById.size, 1, '到期不移除灵田');
  instance.buildingById.delete('farmland:1');
  loot.advanceContainerSearchesForInstance(instance.meta.instanceId, { getInstanceRuntime: () => instance }, noViewers, instance.tick);
  assert.equal(instance.containersById.size, 0, '灵田移除后植物不悬空');
  assert.equal(PLANTED_HERB_DURATION_TICKS / 10 / 3600, 16.8);
}

async function main(): Promise<void> {
  testSeeds();
  testGrowth();
  testGrowthAfterClockRollback();
  await testPlantingAndLifetime();
  console.log('种植验证通过：29种种子、幸运独立概率、灵气指数恢复、灵田准入、事务失败保留、重启与七天到期。');
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
