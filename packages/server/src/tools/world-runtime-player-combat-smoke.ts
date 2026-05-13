import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { WorldRuntimePlayerCombatService } from '../runtime/world/combat/world-runtime-player-combat.service';

async function main(): Promise<void> {
  testMonsterEquipmentDropDefaultsMatchMainTierBuckets();
  testMonsterKillExpSettlementUsesTemplateMultiplier();
  await testMonsterKillCountersUseTierBuckets();
  await testMonsterLootDurableGrant();
  await testMonsterLootRequiresDurableContext();
  await testMonsterLootFallsBackToGroundWhenDurableGrantFails();
  await testPvPLootDurableGrant();
  await testPvPLootRequiresDurableContext();
  await testPvPKillClearsMatchedRetaliateTarget();
  await testCombatSemanticAuditEvents();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-player-combat',
    answers: '怪物掉落直入背包与 PvP 血精奖励现在都会走 grantInventoryItems durable 主链；缺少 durable 上下文时 fail closed，不再回退到运行态背包；只有 durable 提交失败或背包满才落地；PvP 击杀时若击杀者当前仇敌正是死者，会立即清掉该仇敌 ID；真实怪物击杀、经验、掉落和玩家死亡副作用点会产出语义化 combat audit action',
    excludes: '不证明地面拾取/容器拿取、库存已满落地拾取物的一致性、也不证明更泛化的 tick 资产 intent 编排',
  }, null, 2));
}

async function testMonsterKillCountersUseTierBuckets() {
  const increments: Array<[string, string]> = [];
  const killer = {
    playerId: 'player:combat:counter:killer',
    instanceId: 'instance:combat:counter',
    realm: { realmLv: 3 },
    attrs: {
      numericStats: {
        lootRate: 0,
        rareLootRate: 0,
      },
    },
  };
  const contentTemplateRepository = {
    rollMonsterDrops() {
      return [];
    },
    getMonsterCombatProfile() {
      return { expMultiplier: 1 };
    },
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      return playerId === killer.playerId ? killer : null;
    },
    grantMonsterKillProgress() {
      return { changed: false };
    },
  };
  const service = new WorldRuntimePlayerCombatService(
    contentTemplateRepository as never,
    playerRuntimeService as never,
    {
      increment(playerId: string, key: string) {
        increments.push([playerId, key]);
      },
    } as never,
  );
  const instance = {
    meta: { instanceId: 'instance:combat:counter' },
    getMonsterDamageContributionEntries() {
      return [{ playerId: killer.playerId, damage: 1 }];
    },
  };
  const deps = {
    queuePlayerNotice() {},
    advanceKillQuestProgress() {},
    resolveCurrentTickForPlayerId() {
      return 1;
    },
  };

  for (const [runtimeId, tier] of [
    ['monster:normal:1', 'mortal_blood'],
    ['monster:elite:1', 'variant'],
    ['monster:boss:1', 'demon_king'],
  ] as const) {
    await service.handlePlayerMonsterKill(instance as never, {
      runtimeId,
      monsterId: runtimeId,
      name: runtimeId,
      level: 1,
      tier,
      x: 1,
      y: 1,
    } as never, killer.playerId, deps as never);
  }

  assert.deepEqual(increments, [
    [killer.playerId, 'monsterKillCount'],
    [killer.playerId, 'monsterKillCount'],
    [killer.playerId, 'eliteMonsterKillCount'],
    [killer.playerId, 'monsterKillCount'],
    [killer.playerId, 'bossMonsterKillCount'],
  ]);
}

async function testCombatSemanticAuditEvents() {
  const auditEvents: Array<Record<string, unknown>> = [];
  const notices: Array<unknown[]> = [];
  const killer = {
    playerId: 'player:combat:audit:killer',
    name: '甲',
    instanceId: 'instance:combat:audit',
    x: 1,
    y: 2,
    realm: { realmLv: 3, progress: 10 },
    foundation: 0,
    combatExp: 0,
    attrs: {
      numericStats: {
        lootRate: 0,
        rareLootRate: 0,
      },
    },
  };
  const victim = {
    playerId: 'player:combat:audit:victim',
    name: '乙',
    instanceId: 'instance:combat:audit',
    hp: 0,
    x: 4,
    y: 5,
  };
  const players = new Map<string, Record<string, unknown>>([
    [killer.playerId, killer],
    [victim.playerId, victim],
  ]);
  const item = { itemId: 'rat_tail', name: '鼠尾', count: 1, type: 'material' };
  const monster = {
    runtimeId: 'monster:audit:1',
    monsterId: 'monster:audit',
    name: '审计妖兽',
    level: 2,
    tier: 'mortal_blood',
    x: 7,
    y: 8,
  };
  const instance = {
    meta: { instanceId: 'instance:combat:audit' },
    getMonsterDamageContributionEntries(runtimeId: string) {
      assert.equal(runtimeId, monster.runtimeId);
      return [{ playerId: killer.playerId, damage: 3 }];
    },
  };
  const contentTemplateRepository = {
    rollMonsterDrops(monsterId: string) {
      assert.equal(monsterId, monster.monsterId);
      return [item];
    },
    getMonsterCombatProfile() {
      return { expMultiplier: 1 };
    },
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      return players.get(playerId) ?? null;
    },
    canReceiveInventoryItem(playerId: string, itemId: string) {
      assert.equal(playerId, killer.playerId);
      assert.equal(itemId, item.itemId);
      return false;
    },
    grantMonsterKillProgress(playerId: string) {
      assert.equal(playerId, killer.playerId);
      killer.combatExp += 12;
      killer.realm.progress += 2;
      return {
        changed: true,
        dirtyDomains: ['progression'],
        notices: [{ text: '战斗经验 +12', kind: 'info' }],
      };
    },
    applyShaInfusionDeathPenalty(playerId: string) {
      assert.equal(playerId, victim.playerId);
      return {
        consumedProgress: 1,
        consumedFoundation: 0,
        backlashAddedStacks: 0,
        backlashTotalStacks: 0,
        remainingInfusionStacks: 0,
      };
    },
  };
  const service = new WorldRuntimePlayerCombatService(
    contentTemplateRepository as never,
    playerRuntimeService as never,
    { enqueue(event: Record<string, unknown>) { auditEvents.push(event); return true; } } as never,
  );
  const deps = {
    queuePlayerNotice(playerId: string, text: string, kind: string) {
      notices.push(['queuePlayerNotice', playerId, text, kind]);
    },
    advanceKillQuestProgress(playerId: string, monsterId: string) {
      notices.push(['advanceKillQuestProgress', playerId, monsterId]);
    },
    resolveCurrentTickForPlayerId(playerId: string) {
      assert.equal(playerId, killer.playerId);
      return 123;
    },
    spawnGroundItem(runtime: unknown, x: number, y: number, droppedItem: unknown) {
      notices.push(['spawnGroundItem', runtime === instance, x, y, droppedItem]);
    },
    getInstanceRuntime(instanceId: string) {
      assert.equal(instanceId, victim.instanceId);
      return instance;
    },
    clearPendingCommand(playerId: string) {
      notices.push(['clearPendingCommand', playerId]);
    },
    worldRuntimeGmQueueService: {
      markPendingRespawn(playerId: string) {
        notices.push(['markPendingRespawn', playerId]);
      },
    },
  };

  await service.handlePlayerMonsterKill(instance as never, monster as never, killer.playerId, deps as never);
  await service.handlePlayerDefeat(victim.playerId, deps as never, monster.runtimeId);

  const actions = auditEvents.map((event) => event.action);
  assert.deepEqual(actions, ['kill', 'exp_gain', 'loot_drop', 'death']);
  assert.equal((auditEvents.find((event) => event.action === 'exp_gain')?.result as Record<string, unknown>)?.delta?.['combatExp'], 12);
  assert.equal((auditEvents.find((event) => event.action === 'loot_drop')?.result as Record<string, unknown>)?.reason, 'inventory_full');
  assert.equal((auditEvents.find((event) => event.action === 'death')?.actor as Record<string, unknown>)?.kind, 'monster');
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

async function testMonsterLootRequiresDurableContext() {
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
    receiveInventoryItem(playerId: string, grantedItem: { itemId: string; count: number }) {
      assert.equal(playerId, player.playerId);
      player.inventory.items.push({ ...grantedItem });
      player.inventory.revision += 1;
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

  await assert.rejects(
    () => service.deliverMonsterLoot(player.playerId, instance as never, 7, 8, item as never, deps as never, 'monster:rat:no-context'),
    /durable_inventory_grant_required:monster_loot:player:combat:no-durable-context:rat_tail/,
  );

  assert.deepEqual(log, []);
  assert.deepEqual(player.inventory.items, []);
  assert.equal(player.inventory.revision, 0);
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

async function testPvPLootRequiresDurableContext() {
  const log: Array<unknown[]> = [];
  const killer = {
    playerId: 'player:combat:killer:no-durable',
    name: '甲',
    instanceId: 'instance:combat:pvp',
    runtimeOwnerId: null,
    sessionEpoch: 0,
    inventory: {
      items: [],
      revision: 0,
      capacity: 20,
    },
    combat: {
      allowAoePlayerHit: false,
    },
    isBot: false,
  };
  const victim = {
    playerId: 'player:combat:victim:no-durable',
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
    },
  };
  const contentTemplateRepository = {
    createItem(itemId: string, count: number) {
      assert.equal(itemId, 'stone.blood_essence');
      return { ...reward, count };
    },
  };
  const playerRuntimeService = {
    canReceiveInventoryItem(playerId: string, itemId: string) {
      assert.equal(playerId, killer.playerId);
      assert.equal(itemId, reward.itemId);
      return true;
    },
    receiveInventoryItem() {
      throw new Error('pvp reward without durable context must not mutate runtime inventory');
    },
    hasActiveBuff() {
      return true;
    },
    addPvPShaInfusionStack() {
      return 1;
    },
    applyPvPSoulInjury() {},
  };
  const service = new WorldRuntimePlayerCombatService(contentTemplateRepository as never, playerRuntimeService as never);
  const deps = {
    queuePlayerNotice(playerId: string, text: string, kind: string) {
      log.push(['queuePlayerNotice', playerId, text, kind]);
    },
    spawnGroundItem(runtime: unknown, x: number, y: number, droppedItem: unknown) {
      log.push(['spawnGroundItem', runtime === deathSite.instance, x, y, droppedItem]);
    },
  };

  await assert.rejects(
    () => service.applyPvPKillRewards(killer as never, victim as never, deathSite as never, deps as never),
    /durable_inventory_grant_required:pvp_loot:player:combat:killer:no-durable:stone\.blood_essence/,
  );

  assert.deepEqual(log, []);
  assert.deepEqual(killer.inventory.items, []);
  assert.equal(killer.inventory.revision, 0);
}

async function testPvPKillClearsMatchedRetaliateTarget() {
  const log: Array<unknown[]> = [];
  const victim = {
    playerId: 'player:combat:victim',
    name: '乙',
    hp: 0,
    x: 4,
    y: 5,
    instanceId: 'instance:combat:pvp',
  };
  const killer = {
    playerId: 'player:combat:killer',
    name: '甲',
    combat: {
      retaliatePlayerTargetId: 'player:combat:victim',
    },
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      if (playerId === victim.playerId) {
        return victim;
      }
      if (playerId === killer.playerId) {
        return killer;
      }
      return null;
    },
    applyShaInfusionDeathPenalty() {
      return {
        consumedProgress: 0,
        consumedFoundation: 0,
        backlashAddedStacks: 0,
        backlashTotalStacks: 0,
        remainingInfusionStacks: 0,
      };
    },
    clearRetaliatePlayerTargetIfMatches(playerId: string, targetPlayerId: string, currentTick: number) {
      log.push(['clearRetaliatePlayerTargetIfMatches', playerId, targetPlayerId, currentTick]);
    },
  };
  const service = new WorldRuntimePlayerCombatService({} as never, playerRuntimeService as never);
  service.applyPvPKillRewards = async (nextKiller, nextVictim) => {
    log.push(['applyPvPKillRewards', nextKiller.playerId, nextVictim.playerId]);
  };
  const deps = {
    getInstanceRuntime() {
      return null;
    },
    resolveCurrentTickForPlayerId(playerId: string) {
      assert.equal(playerId, killer.playerId);
      return 77;
    },
    clearPendingCommand(playerId: string) {
      log.push(['clearPendingCommand', playerId]);
    },
    worldRuntimeGmQueueService: {
      markPendingRespawn(playerId: string) {
        log.push(['markPendingRespawn', playerId]);
      },
    },
    queuePlayerNotice() {},
  };

  await service.handlePlayerDefeat(victim.playerId, deps as never, killer.playerId);

  assert.deepEqual(log, [
    ['clearRetaliatePlayerTargetIfMatches', killer.playerId, victim.playerId, 77],
    ['applyPvPKillRewards', killer.playerId, victim.playerId],
    ['clearPendingCommand', victim.playerId],
    ['markPendingRespawn', victim.playerId],
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
