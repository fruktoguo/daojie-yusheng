import assert from 'node:assert/strict';

import { WorldRuntimePlayerCombatService } from '../runtime/world/world-runtime-player-combat.service';

async function main(): Promise<void> {
  await testMonsterLootDurableGrant();
  await testPvPLootDurableGrant();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-player-combat',
    answers: '怪物掉落直入背包与 PvP 血精奖励现在都会先走 grantInventoryItems durable 主链，成功提交后才补发 loot notice，并把 runtimeOwnerId/sessionEpoch/instanceId/assignedNodeId/ownershipEpoch 一并透传',
    excludes: '不证明地面拾取/容器拿取、库存已满落地拾取物的一致性、也不证明更泛化的 tick 资产 intent 编排',
  }, null, 2));
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
