import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { WorldRuntimePlayerCombatService } from '../runtime/world/world-runtime-player-combat.service';

async function main(): Promise<void> {
  testMonsterEquipmentDropDefaultsMatchMainTierBuckets();
  testMonsterKillExpSettlementUsesTemplateMultiplier();
  await testMonsterLootDurableGrant();
  await testMonsterLootFallsBackToGroundWithoutDurableContext();
  await testMonsterLootFallsBackToGroundWhenDurableGrantFails();
  await testPvPLootDurableGrant();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-player-combat',
    answers: '怪物掉落直入背包与 PvP 血精奖励现在都会先走 grantInventoryItems durable 主链，成功提交后才补发 loot notice；缺少 durable 上下文或 durable 提交失败时会改为地面掉落，不再打断世界 tick',
    excludes: '不证明地面拾取/容器拿取、库存已满落地拾取物的一致性、也不证明更泛化的 tick 资产 intent 编排',
  }, null, 2));
}

function testMonsterEquipmentDropDefaultsMatchMainTierBuckets() {
  const repository = new ContentTemplateRepository();
  const equipmentDrop = { itemId: 'equip.test', name: '测试装备', type: 'equipment', count: 1 };
  const materialDrop = { itemId: 'mat.test', name: '测试材料', type: 'material', count: 1 };

  assert.equal(repository.computeDefaultMonsterDropChance(equipmentDrop as never, { tier: 'mortal_blood', grade: 'mortal' } as never), 0.05);
  assert.equal(repository.computeDefaultMonsterDropChance(equipmentDrop as never, { tier: 'variant', grade: 'mortal' } as never), 0.2);
  assert.equal(repository.computeDefaultMonsterDropChance(equipmentDrop as never, { tier: 'demon_king', grade: 'mortal' } as never), 0.5);
  assert.equal(repository.computeDefaultMonsterDropChance(materialDrop as never, { tier: 'mortal_blood', grade: 'mortal' } as never), 0.05);
  assert.equal(repository.computeDefaultMonsterDropChance(materialDrop as never, { tier: 'variant', grade: 'mortal' } as never), 0.2);
  assert.equal(repository.computeDefaultMonsterDropChance(materialDrop as never, { tier: 'demon_king', grade: 'mortal' } as never), 0.5);
  assert.equal(repository.getOrdinaryMonsterSpiritStoneDropMultiplier(
    { itemId: 'spirit_stone' } as never,
    { monsterTier: 'mortal_blood', monsterLevel: 3, playerRealmLv: 4 } as never,
  ), 0.7);
  assert.equal(repository.getOrdinaryMonsterSpiritStoneDropMultiplier(
    { itemId: 'spirit_stone' } as never,
    { monsterTier: 'variant', monsterLevel: 3, playerRealmLv: 4 } as never,
  ), 1);
}

function testMonsterKillExpSettlementUsesTemplateMultiplier() {
  const grants: Array<Record<string, unknown>> = [];
  const players = new Map<string, Record<string, unknown>>([
    ['player:killer', { playerId: 'player:killer', instanceId: 'instance:combat:exp', realm: { realmLv: 20 } }],
    ['player:assist', { playerId: 'player:assist', instanceId: 'instance:combat:exp', realm: { realmLv: 5 } }],
  ]);
  const contentTemplateRepository = {
    getMonsterCombatProfile(monsterId: string) {
      assert.equal(monsterId, 'monster:variant');
      return { expMultiplier: 5 };
    },
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      return players.get(playerId) ?? null;
    },
    grantMonsterKillProgress(playerId: string, input: Record<string, unknown>, currentTick: number) {
      grants.push({ playerId, ...input, currentTick });
    },
  };
  const service = new WorldRuntimePlayerCombatService(contentTemplateRepository as never, playerRuntimeService as never);
  const instance = {
    meta: { instanceId: 'instance:combat:exp' },
    getMonsterDamageContributionEntries(runtimeId: string) {
      assert.equal(runtimeId, 'monster:variant:1');
      return [
        { playerId: 'player:killer', damage: 1 },
        { playerId: 'player:assist', damage: 9 },
      ];
    },
  };
  const deps = {
    resolveCurrentTickForPlayerId(playerId: string) {
      return playerId === 'player:killer' ? 101 : 102;
    },
  };

  service.distributeMonsterKillProgress(instance as never, {
    runtimeId: 'monster:variant:1',
    monsterId: 'monster:variant',
    name: '异种测试妖兽',
    level: 30,
    tier: 'variant',
  } as never, 'player:killer', deps as never);

  assert.deepEqual(grants.map((entry) => entry.playerId), ['player:killer', 'player:assist']);
  for (const grant of grants) {
    assert.equal(grant.expMultiplier, 5);
    assert.equal(grant.expAdjustmentRealmLv, 20);
  }
  assert.equal(grants[0]?.contributionRatio, 0.1);
  assert.equal(grants[1]?.contributionRatio, 0.9);
  assert.equal(grants[0]?.currentTick, 101);
  assert.equal(grants[1]?.currentTick, 102);
}

async function testMonsterLootDurableGrant() {
  const log: Array<unknown[]> = [];
  const durableCalls: Array<Record<string, unknown>> = [];
  let resolveDurable = () => {};

  const player = {
    playerId: 'player:combat:loot',
    instanceId: 'instance:combat:1',
    runtimeOwnerId: 'runtime:combat:1',
    sessionEpoch: 9,
    inventory: {
      items: [],
      revision: 0,
      capacity: 20,
    },
    persistentRevision: 0,
    selfRevision: 0,
    dirtyDomains: new Set<string>(),
    suppressImmediateDomainPersistence: false,
  };
  const item = { itemId: 'rat_tail', name: '鼠尾', count: 2, type: 'material' };
  const instance = {
    meta: { instanceId: 'instance:combat:1' },
    dropGroundItem(x: number, y: number, droppedItem: unknown) {
      log.push(['dropGroundItem', x, y, droppedItem]);
      return { ok: true };
    },
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      assert.equal(playerId, player.playerId);
      return player;
    },
    getPlayerOrThrow(playerId: string) {
      assert.equal(playerId, player.playerId);
      return player;
    },
    canReceiveInventoryItem(playerId: string, itemId: string) {
      assert.equal(playerId, player.playerId);
      assert.equal(itemId, item.itemId);
      return true;
    },
    receiveInventoryItem(playerId: string, grantedItem: { itemId: string; count: number }) {
      assert.equal(playerId, player.playerId);
      player.inventory.items.push({ ...grantedItem });
      player.inventory.revision += 1;
      player.persistentRevision += 1;
      player.selfRevision += 1;
      player.dirtyDomains = new Set(['inventory']);
    },
    playerProgressionService: {
      refreshPreview() {},
    },
  };
  const service = new WorldRuntimePlayerCombatService({} as never, playerRuntimeService as never);
  const deps = {
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
            sourceType: 'monster_loot',
          });
        });
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        assert.equal(instanceId, 'instance:combat:1');
        return {
          assigned_node_id: 'node:combat',
          ownership_epoch: 21,
        };
      },
    },
    queuePlayerNotice(playerId: string, text: string, kind: string) {
      log.push(['queuePlayerNotice', playerId, text, kind]);
    },
    spawnGroundItem(runtime: unknown, x: number, y: number, droppedItem: unknown) {
      log.push(['spawnGroundItem', runtime === instance, x, y, droppedItem]);
    },
  };

  service.deliverMonsterLoot(player.playerId, instance as never, 7, 8, item as never, deps as never, 'monster:rat:1');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(log.length, 0);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:combat:1');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 9);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:combat:1');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:combat');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 21);
  assert.equal(durableCalls[0]?.sourceType, 'monster_loot');
  assert.equal(durableCalls[0]?.sourceRefId, 'monster:rat:1');
  assert.equal((durableCalls[0]?.grantedItems as Array<Record<string, unknown>>)?.[0]?.itemId, 'rat_tail');
  resolveDurable();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, [
    ['queuePlayerNotice', 'player:combat:loot', '获得 鼠尾 x2', 'loot'],
  ]);
}

async function testMonsterLootFallsBackToGroundWithoutDurableContext() {
  const log: Array<unknown[]> = [];
  const player = {
    playerId: 'player:combat:no-durable-context',
    instanceId: 'instance:combat:1',
    runtimeOwnerId: null,
    sessionEpoch: 0,
    inventory: {
      items: [],
      revision: 0,
      capacity: 20,
    },
  };
  const item = { itemId: 'rat_tail', name: '鼠尾', count: 1, type: 'material' };
  const instance = {
    meta: { instanceId: 'instance:combat:1' },
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      assert.equal(playerId, player.playerId);
      return player;
    },
    canReceiveInventoryItem(playerId: string, itemId: string) {
      assert.equal(playerId, player.playerId);
      assert.equal(itemId, item.itemId);
      return true;
    },
  };
  const service = new WorldRuntimePlayerCombatService({} as never, playerRuntimeService as never);
  const deps = {
    queuePlayerNotice(playerId: string, text: string, kind: string) {
      log.push(['queuePlayerNotice', playerId, text, kind]);
    },
    spawnGroundItem(runtime: unknown, x: number, y: number, droppedItem: unknown) {
      log.push(['spawnGroundItem', runtime === instance, x, y, droppedItem]);
    },
  };

  await service.deliverMonsterLoot(player.playerId, instance as never, 7, 8, item as never, deps as never, 'monster:rat:no-context');

  assert.deepEqual(log, [
    ['spawnGroundItem', true, 7, 8, item],
    ['queuePlayerNotice', player.playerId, '鼠尾 掉落在 (7, 8) 的地面上，但本次奖励缺少可确认的背包落盘上下文。', 'loot'],
  ]);
  assert.deepEqual(player.inventory.items, []);
}

async function testMonsterLootFallsBackToGroundWhenDurableGrantFails() {
  const log: Array<unknown[]> = [];
  const player = {
    playerId: 'player:combat:durable-failure',
    instanceId: 'instance:combat:1',
    runtimeOwnerId: 'runtime:combat:failure',
    sessionEpoch: 3,
    inventory: {
      items: [],
      revision: 0,
      capacity: 20,
    },
    persistentRevision: 0,
    selfRevision: 0,
    dirtyDomains: new Set<string>(),
    suppressImmediateDomainPersistence: false,
  };
  const item = { itemId: 'rat_tail', name: '鼠尾', count: 1, type: 'material' };
  const instance = {
    meta: { instanceId: 'instance:combat:1' },
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      assert.equal(playerId, player.playerId);
      return player;
    },
    canReceiveInventoryItem(playerId: string, itemId: string) {
      assert.equal(playerId, player.playerId);
      assert.equal(itemId, item.itemId);
      return true;
    },
    receiveInventoryItem(playerId: string, grantedItem: { itemId: string; count: number }) {
      assert.equal(playerId, player.playerId);
      player.inventory.items.push({ ...grantedItem });
      player.inventory.revision += 1;
      player.persistentRevision += 1;
      player.selfRevision += 1;
      player.dirtyDomains = new Set(['inventory']);
    },
    playerProgressionService: {
      refreshPreview() {},
    },
  };
  const service = new WorldRuntimePlayerCombatService({} as never, playerRuntimeService as never);
  const deps = {
    durableOperationService: {
      isEnabled() {
        return true;
      },
      async grantInventoryItems() {
        throw new Error('simulated_durable_failure');
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        assert.equal(instanceId, 'instance:combat:1');
        return {
          assigned_node_id: 'node:combat',
          ownership_epoch: 21,
        };
      },
    },
    queuePlayerNotice(playerId: string, text: string, kind: string) {
      log.push(['queuePlayerNotice', playerId, text, kind]);
    },
    spawnGroundItem(runtime: unknown, x: number, y: number, droppedItem: unknown) {
      log.push(['spawnGroundItem', runtime === instance, x, y, droppedItem]);
    },
  };

  await service.deliverMonsterLoot(player.playerId, instance as never, 7, 8, item as never, deps as never, 'monster:rat:durable-failure');

  assert.deepEqual(log, [
    ['spawnGroundItem', true, 7, 8, item],
    ['queuePlayerNotice', player.playerId, '鼠尾 掉落在 (7, 8) 的地面上，但本次奖励落盘失败。', 'loot'],
  ]);
  assert.deepEqual(player.inventory.items, []);
  assert.equal(player.inventory.revision, 0);
}

async function testPvPLootDurableGrant() {
  const log: Array<unknown[]> = [];
  const durableCalls: Array<Record<string, unknown>> = [];
  let resolveDurable = () => {};

  const killer = {
    playerId: 'player:combat:killer',
    name: '甲',
    instanceId: 'instance:combat:pvp',
    runtimeOwnerId: 'runtime:combat:pvp',
    sessionEpoch: 12,
    inventory: {
      items: [],
      revision: 0,
      capacity: 20,
    },
    combat: {
      allowAoePlayerHit: false,
    },
    persistentRevision: 0,
    selfRevision: 0,
    dirtyDomains: new Set<string>(),
    suppressImmediateDomainPersistence: false,
    isBot: false,
  };
  const victim = {
    playerId: 'player:combat:victim',
    name: '乙',
    realm: { realmLv: 2 },
    isBot: false,
  };
  const reward = { itemId: 'stone.blood_essence', name: '血精', count: 4, type: 'material' };
  const deathSite = {
    x: 3,
    y: 4,
    instance: {
      meta: { instanceId: 'instance:combat:pvp' },
      dropGroundItem(x: number, y: number, droppedItem: unknown) {
        log.push(['dropGroundItem', x, y, droppedItem]);
        return { ok: true };
      },
    },
  };
  const contentTemplateRepository = {
    createItem(itemId: string, count: number) {
      assert.equal(itemId, 'stone.blood_essence');
      return { ...reward, count };
    },
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      return playerId === killer.playerId ? killer : null;
    },
    canReceiveInventoryItem(playerId: string, itemId: string) {
      assert.equal(playerId, killer.playerId);
      assert.equal(itemId, reward.itemId);
      return true;
    },
    receiveInventoryItem(playerId: string, grantedItem: { itemId: string; count: number }) {
      assert.equal(playerId, killer.playerId);
      killer.inventory.items.push({ ...grantedItem });
      killer.inventory.revision += 1;
      killer.persistentRevision += 1;
      killer.selfRevision += 1;
      killer.dirtyDomains = new Set(['inventory']);
    },
    hasActiveBuff() {
      return true;
    },
    addPvPShaInfusionStack() {
      return 1;
    },
    applyPvPSoulInjury() {},
    playerProgressionService: {
      refreshPreview() {},
    },
  };
  const service = new WorldRuntimePlayerCombatService(contentTemplateRepository as never, playerRuntimeService as never);
  const deps = {
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
            grantedCount: 4,
            sourceType: 'pvp_loot',
          });
        });
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        assert.equal(instanceId, 'instance:combat:pvp');
        return {
          assigned_node_id: 'node:combat',
          ownership_epoch: 22,
        };
      },
    },
    queuePlayerNotice(playerId: string, text: string, kind: string) {
      log.push(['queuePlayerNotice', playerId, text, kind]);
    },
    spawnGroundItem(runtime: unknown, x: number, y: number, droppedItem: unknown) {
      log.push(['spawnGroundItem', runtime === deathSite.instance, x, y, droppedItem]);
    },
  };

  service.applyPvPKillRewards(killer as never, victim as never, deathSite as never, deps as never);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(log.length, 0);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:combat:pvp');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 12);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:combat:pvp');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:combat');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 22);
  assert.equal(durableCalls[0]?.sourceType, 'pvp_loot');
  assert.equal(durableCalls[0]?.sourceRefId, 'pvp:player:combat:killer:player:combat:victim:stone.blood_essence');
  resolveDurable();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, [
    ['queuePlayerNotice', 'player:combat:killer', '你从 乙 体内掠得 血精 x4。', 'loot'],
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
