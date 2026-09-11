import assert from 'node:assert/strict';
import { MINERAL_CRYSTALS, MINERAL_CRYSTAL_DURATION_TICKS, TileType, calculateTerrainDurability, computeMineralCrystalDropChance } from '@mud/shared';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { getDefaultBuildingRuntime } from '../runtime/building/building-default-content';
import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';
import { resolveMiningDropRollOptions } from '../runtime/world/combat/tile-drop.helpers';
import { findBuildingProtectedPlacementConflict } from '../runtime/world/building-protected-placement.helpers';
import { assertMineralCrystalPlacement } from '../runtime/world/mineral-crystal-use.helpers';
import { normalizeDurableMineralCrystalSourceMutation, persistDurableMineralCrystalSourceMutation } from '../persistence/mineral-crystal-durable-persistence';
import type { PoolClient } from 'pg';

function createInstance(): MapInstanceRuntime {
  const repository = new MapTemplateRepository();
  repository.registerRuntimeMapTemplate({
    id: 'mineral_crystal_smoke', name: '晶精验证', width: 9, height: 9, routeDomain: 'system',
    tiles: Array.from({ length: 9 }, () => '.........'), spawnPoint: { x: 8, y: 8 },
    portals: [], npcs: [], monsters: [], safeZones: [], landmarks: [], containers: [], auras: [], mapLv: 2,
  });
  const instance = new MapInstanceRuntime({
    instanceId: 'real:mineral_crystal_smoke', template: repository.getOrThrow('mineral_crystal_smoke'),
    monsterSpawns: [], kind: 'public', persistent: true, createdAt: Date.now(), displayName: '晶精验证',
    linePreset: 'real', lineIndex: 1, instanceOrigin: 'smoke', defaultEntry: true, canDamageTile: true,
  });
  const building = getDefaultBuildingRuntime();
  instance.configureBuildingRuntime(building.catalog, building.rules);
  return instance;
}

function withRandom<T>(value: number, run: () => T): T {
  const previous = Math.random;
  Math.random = () => value;
  try { return run(); } finally { Math.random = previous; }
}

function testProbability(): void {
  const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-15);
  close(computeMineralCrystalDropChance(0, 1_000_000), 0);
  close(computeMineralCrystalDropChance(500, 1_000_000), 5e-8);
  close(computeMineralCrystalDropChance(1_000, 1_000_000), 1e-7);
  close(computeMineralCrystalDropChance(100_000, 1_000_000), 1e-6);
  close(computeMineralCrystalDropChance(100_000, 1_000_000, 0.5), 1.5e-6);
  close(computeMineralCrystalDropChance(2_000_000, 1_000_000), Math.sqrt(1_000) * 1e-7);
  const options = resolveMiningDropRollOptions({ luck: 5, realm: { realmLv: 100 }, miningSkill: { level: 100 }, attrs: { craftEffectStats: { mining: { outputRate: 100 } } } });
  close(options.miningCrystalLuckBonus, 0.05);
  const instance = createInstance();
  for (const crystal of MINERAL_CRYSTALS) {
    const state = { tileType: crystal.tileType, structureType: crystal.tileType, maxHp: 1_000_000 };
    const drops = withRandom(1.02e-6, () => instance.rollTileDrops(state, 100_000, false, { ...options, miningAoeHitCount: 100 }));
    assert.equal(drops.filter((drop) => drop.itemId === crystal.itemId).length, 1);
    const missed = withRandom(1.06e-6, () => instance.rollTileDrops(state, 100_000, false, options));
    assert.equal(missed.some((drop) => drop.itemId === crystal.itemId), false);
  }
  const nonMineral = withRandom(0, () => instance.rollTileDrops({ tileType: TileType.Cloud, maxHp: 1_000 }, 100, true, options));
  assert.equal(nonMineral.some((drop) => MINERAL_CRYSTALS.some((entry) => entry.itemId === drop.itemId)), false);
}

function testLifetimeAndRecovery(): void {
  const instance = createInstance();
  const create = (x: number, sourceItemId?: string) => instance.createTemporaryTile(x, 2, TileType.SpiritOre,
    1_000_000, MINERAL_CRYSTAL_DURATION_TICKS, 100, { sourceItemId, mineralLevel: 20, ownerPlayerId: 'player:crystal' });
  create(2, 'spirit_vein_crystal');
  const state = instance.getTileCombatState(2, 2);
  assert.equal(state.mineralLevel, 20);
  assert.equal(instance.getTileLayerState(2, 2)?.structure, 'spirit_ore', '地图静态同步必须投影矿脉结构');
  const hit = withRandom(0, () => instance.damageTilesBatch([{ x: 2, y: 2, damage: 100_000 }], { miningCrystalLuckBonus: 0 }));
  assert.equal(hit.fallbackCount, 1);
  assert.ok(hit.results[0]?.tileDrops?.some((drop: any) => drop.itemId === 'spirit_stone'));
  instance.advanceTileRecovery(() => false, null);
  assert.equal(instance.getTileCombatState(2, 2).hp, 900_000);
  instance.advanceTemporaryTileHpRecoveryByTerrainStabilizer(() => true);
  assert.equal(instance.getTileCombatState(2, 2).hp, 910_000);
  const entries = instance.buildTemporaryTilePersistenceEntries();
  assert.equal(instance.createTemporaryTile(2, 2, TileType.Stone, 100, 999_999, 100).created, false,
    '技能不能覆盖人工矿并改写固定寿命');
  const restored = createInstance();
  restored.hydrateTemporaryTiles(entries);
  assert.equal(restored.getTileCombatState(2, 2).mineralLevel, 20);
  assert.equal(restored.buildTemporaryTilePersistenceEntries()[0].sourceItemId, 'spirit_vein_crystal');
  assert.equal(restored.advanceTemporaryTiles(86_499, () => true), false);
  assert.equal(restored.advanceTemporaryTiles(86_500, () => true), true);
  assert.equal(restored.getTileCombatState(2, 2), null);
  assert.equal(restored.getTileLayerState(2, 2)?.structure, null);
  instance.damageTile(2, 2, Number.MAX_SAFE_INTEGER);
  instance.advanceTileRecovery(() => true, () => true);
  assert.equal(instance.getTileCombatState(2, 2), null);
  assert.equal(instance.tileDamageByTile.has(instance.toTileIndex(2, 2)), false);
  create(3);
  assert.equal(instance.advanceTemporaryTiles(86_500, () => true), false, '技能地块仍保留固脉规则');
  assert.equal(MINERAL_CRYSTAL_DURATION_TICKS / 10 / 3600, 2.4);
}

function testPlacement(): void {
  const instance = createInstance();
  instance.getPortalAtTile = (x: number, y: number) => x === 2 && y === 2 ? { sectId: 'sect:test', x, y } : null;
  for (const kind of ['public', 'time_chamber']) {
    instance.meta.kind = kind;
    for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) {
      assert.equal(findBuildingProtectedPlacementConflict(instance, [{ x, y }]).ok, false);
      assert.equal(instance.placeBuildingInstance({ defId: 'stone_wall', x, y }).ok, false);
    }
  }
  instance.template.playerOverlapMask[instance.toTileIndex(4, 4)] = 1;
  assert.equal(instance.placeBuildingInstance({ defId: 'stone_wall', x: 4, y: 4 }).ok, false);
  instance.npcIdByTile.set(instance.toTileIndex(5, 1), 'npc:test');
  assert.equal(findBuildingProtectedPlacementConflict(instance, [{ x: 6, y: 2 }]).ok, false);
  const player = { playerId: 'player:test', x: 5, y: 5 };
  assert.doesNotThrow(() => assertMineralCrystalPlacement(instance, player, {}));
  assert.equal(instance.placeBuildingInstance({ defId: 'stone_wall', x: 5, y: 5 }).ok, true);
  assert.throws(() => assertMineralCrystalPlacement(instance, player, {}));
}

async function testUse(): Promise<void> {
  const cases = MINERAL_CRYSTALS.flatMap((crystal) => [[2, 8], [20, 1]]
    .map(([mapLevel, playerLevel]) => ({ crystal, mapLevel, playerLevel })));
  for (const { crystal, mapLevel, playerLevel } of cases) {
    const instance = createInstance();
    instance.template.source.mapLv = mapLevel;
    const item = { ...crystal, itemInstanceId: 'item:crystal', count: 1, type: 'consumable', name: '矿脉晶精', useBehavior: 'create_mineral_vein' };
    const player = { playerId: 'player:crystal', instanceId: instance.meta.instanceId, x: 2, y: 2,
      realm: { realmLv: playerLevel }, runtimeOwnerId: 'node:smoke', sessionEpoch: 1, inventory: { items: [item] } };
    let consumed = 0;
    const service = new WorldRuntimeUseItemService({}, {}, {
      peekInventoryItemByInstanceId: () => player.inventory.items[0], getPlayerOrThrow: () => player,
      replaceInventoryItems: (_id: string, items: any[]) => { player.inventory.items = items; consumed++; },
    });
    service.syncCurrentPlayerPresence = async () => true;
    instance.meta.assignedNodeId = 'node:smoke';
    instance.meta.leaseToken = 'lease:smoke';
    instance.meta.ownershipEpoch = 1;
    const requests: any[] = [];
    let shouldFail = true;
    const deps = {
      getPlayerLocationOrThrow: () => ({ instanceId: instance.meta.instanceId }), getInstanceRuntimeOrThrow: () => instance,
      queuePlayerNotice: () => undefined, durableOperationService: { isEnabled: () => true,
        grantInventoryItems: async (request: any) => {
          requests.push(request);
          assert.equal(consumed, 0, '事务提交前不扣晶精');
          assert.equal(instance.temporaryTileByTile.size, 0, '事务提交前不创建矿脉');
          if (shouldFail) throw new Error('模拟事务失败');
        },
      },
    };
    await assert.rejects(service.dispatchUseItem(player.playerId, item.itemInstanceId, deps), /模拟事务失败/);
    assert.equal(player.inventory.items.length, 1);
    assert.equal(instance.temporaryTileByTile.size, 0);
    shouldFail = false;
    await service.dispatchUseItem(player.playerId, item.itemInstanceId, deps);
    assert.equal(player.inventory.items.length, 0);
    const tile = instance.getTileCombatState(2, 2);
    assert.equal(tile.tileType, crystal.tileType);
    assert.equal(tile.mineralLevel, Math.max(mapLevel, playerLevel));
    assert.equal(tile.maxHp, calculateTerrainDurability(Math.max(mapLevel, playerLevel), crystal.tileType === TileType.SpiritOre ? 10_000 : 2_000));
    const mutation = requests.at(-1).sourceMutation;
    assert.ok(normalizeDurableMineralCrystalSourceMutation(mutation, instance.meta.instanceId));
    const sql: string[] = [];
    await persistDurableMineralCrystalSourceMutation({ query: async (statement: string) => {
      sql.push(statement); return { rows: [], rowCount: 1 };
    } } as unknown as PoolClient, mutation);
    assert.ok(sql.some((statement) => statement.includes('source_item_id')));
    assert.ok(sql.some((statement) => statement.includes('instance_flush_ledger')));
    await assert.rejects(service.dispatchUseItem(player.playerId, item.itemInstanceId, deps));
  }
}

async function main(): Promise<void> {
  testProbability(); testLifetimeAndRecovery(); testPlacement(); await testUse();
  console.log('矿脉晶精验证通过：独立概率、人工矿掉落、等级、寿命、恢复、禁建、事务失败不扣物品。');
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
