import assert from 'node:assert/strict';

import {
  countEnabledSkillEntries,
  createNumericRatioDivisors,
  createNumericStats,
  DEFAULT_BONE_AGE_YEARS,
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
} from '@mud/shared';

import { PlayerProgressionService } from '../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

function createPlayerRuntimeService() {
  const mapUnlockWrites: Array<{ playerId: string; mapIds: string[]; versionSeed?: number | null }> = [];
  const autoBattleSkillWrites: Array<{ playerId: string; skills: unknown[]; versionSeed?: number | null }> = [];
  const autoUseRuleWrites: Array<{ playerId: string; rules: unknown[]; versionSeed?: number | null }> = [];
  const walletWrites: Array<{ playerId: string; balances: unknown[]; versionSeed?: number | null }> = [];
  const logbookWrites: Array<{ playerId: string; messages: unknown[]; versionSeed?: number | null }> = [];
  const service = new PlayerRuntimeService(
    {
      createStarterInventory() {
        return {
          capacity: DEFAULT_INVENTORY_CAPACITY,
          items: [],
        };
      },
      createItem(itemId: string, count = 1) {
        return {
          itemId,
          count,
        };
      },
      createDefaultEquipment() {
        return {};
      },
      getLearnTechniqueId(itemId: string) {
        return itemId === 'manual.tech_book' ? 'manual.tech' : null;
      },
      createTechniqueState(techId: string) {
        const skills = techId === 'manual.tech'
          ? [
              { id: 'manual.tech.skill.1', unlockLevel: 1 },
              { id: 'manual.tech.skill.2', unlockLevel: 1 },
            ]
          : [];
        return {
          techId,
          level: 1,
          exp: 0,
          expToNext: 10,
          realmLv: 1,
          skillsEnabled: true,
          skills,
        };
      },
      normalizeItem(item: unknown) {
        return item;
      },
      hydrateTechniqueState(entry: unknown) {
        return entry;
      },
    } as never,
    {
      has(mapId: string) {
        return mapId === 'yunlai_town';
      },
      getOrThrow(mapId: string) {
        return {
          id: mapId,
          spawnX: 32,
          spawnY: 5,
        };
      },
      list() {
        return [
          {
            id: 'yunlai_town',
            spawnX: 32,
            spawnY: 5,
          },
        ];
      },
    } as never,
    {
      createInitialState() {
        return {
          stage: '炼气',
          baseAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          finalAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          numericStats: createNumericStats(),
          ratioDivisors: createNumericRatioDivisors(),
        };
      },
      recalculate() {
        return undefined;
      },
    } as never,
    {
      initializePlayer() {
        return undefined;
      },
      refreshPreview() {
        return undefined;
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async savePlayerAutoBattleSkills(playerId: string, skills: unknown[], options: { versionSeed?: number | null } = {}) {
        autoBattleSkillWrites.push({ playerId, skills: [...skills], versionSeed: options.versionSeed ?? null });
      },
      async savePlayerAutoUseItemRules(playerId: string, rules: unknown[], options: { versionSeed?: number | null } = {}) {
        autoUseRuleWrites.push({ playerId, rules: [...rules], versionSeed: options.versionSeed ?? null });
      },
      async savePlayerWallet(playerId: string, balances: unknown[], options: { versionSeed?: number | null } = {}) {
        walletWrites.push({ playerId, balances: [...balances], versionSeed: options.versionSeed ?? null });
      },
      async savePlayerMapUnlocks(playerId: string, mapIds: readonly string[], options: { versionSeed?: number | null } = {}) {
        mapUnlockWrites.push({ playerId, mapIds: [...mapIds], versionSeed: options.versionSeed ?? null });
      },
      async savePlayerLogbookMessages(playerId: string, messages: unknown[], options: { versionSeed?: number | null } = {}) {
        logbookWrites.push({ playerId, messages: [...messages], versionSeed: options.versionSeed ?? null });
      },
    } as never,
  );
  (service as unknown as {
    mapUnlockWrites?: typeof mapUnlockWrites;
    autoBattleSkillWrites?: typeof autoBattleSkillWrites;
    autoUseRuleWrites?: typeof autoUseRuleWrites;
    walletWrites?: typeof walletWrites;
    logbookWrites?: typeof logbookWrites;
  }).mapUnlockWrites = mapUnlockWrites;
  (service as unknown as { autoBattleSkillWrites?: typeof autoBattleSkillWrites }).autoBattleSkillWrites = autoBattleSkillWrites;
  (service as unknown as { autoUseRuleWrites?: typeof autoUseRuleWrites }).autoUseRuleWrites = autoUseRuleWrites;
  (service as unknown as { walletWrites?: typeof walletWrites }).walletWrites = walletWrites;
  (service as unknown as { logbookWrites?: typeof logbookWrites }).logbookWrites = logbookWrites;
  return service;
}

function createPlayerProgressionService() {
  return new PlayerProgressionService(
    {
      getItemName(itemId: string) {
        return itemId;
      },
    } as never,
    {
      recalculate() {
        return undefined;
      },
      markPanelDirty() {
        return undefined;
      },
    } as never,
  );
}

function createSnapshot() {
  return {
    version: 1 as const,
    savedAt: 1000,
    placement: {
      instanceId: 'public:yunlai_town',
      templateId: 'yunlai_town',
      x: 32,
      y: 5,
      facing: Direction.South,
    },
    worldPreference: {
      linePreset: 'real' as const,
    },
    vitals: {
      hp: 100,
      maxHp: 100,
      qi: 10,
      maxQi: 100,
    },
    progression: {
      foundation: 0,
      combatExp: 0,
      bodyTraining: null,
      alchemySkill: null,
      gatherSkill: null,
      gatherJob: null,
      alchemyPresets: [],
      alchemyJob: null,
      enhancementSkill: null,
      enhancementSkillLevel: 1,
      enhancementJob: null,
      enhancementRecords: [],
      boneAgeBaseYears: DEFAULT_BONE_AGE_YEARS,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: null,
      heavenGate: null,
      spiritualRoots: null,
    },
    unlockedMapIds: ['yunlai_town'],
    inventory: {
      revision: 1,
      capacity: DEFAULT_INVENTORY_CAPACITY,
      items: [],
    },
    equipment: {
      revision: 1,
      slots: [],
    },
    techniques: {
      revision: 1,
      techniques: [],
      cultivatingTechId: null,
    },
    buffs: {
      revision: 1,
      buffs: [],
    },
    quests: {
      revision: 1,
      entries: [],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      autoUsePills: [],
      combatTargetingRules: undefined,
      autoBattleTargetingMode: 'auto' as const,
      retaliatePlayerTargetId: null,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      senseQiActive: false,
      autoBattleSkills: [],
    },
    pendingLogbookMessages: [],
    runtimeBonuses: [],
  };
}

function createHydratedService(playerId: string) {
  const service = createPlayerRuntimeService();
  const player = service.hydrateFromSnapshot(playerId, `${playerId}:session`, createSnapshot());
  service.players.set(playerId, player);
  service.markPersisted(playerId);
  return service;
}

function assertDirtyDomains(service: ReturnType<typeof createPlayerRuntimeService>, playerId: string, expected: string[], absent: string[] = []) {
  const dirtyDomains = service.listDirtyPlayerDomains().get(playerId);
  assert.ok(dirtyDomains, `expected dirty domains for ${playerId}`);
  for (const domain of expected) {
    assert.ok(dirtyDomains.has(domain), `expected dirty domain ${domain}, got ${Array.from(dirtyDomains).join(',')}`);
  }
  for (const domain of absent) {
    assert.ok(!dirtyDomains.has(domain), `did not expect dirty domain ${domain}, got ${Array.from(dirtyDomains).join(',')}`);
  }
}

function testAutoUsePillsDirtyDomain(): void {
  const playerId = 'player:auto-use';
  const service = createHydratedService(playerId);
  service.updateAutoUsePills(playerId, [
    {
      itemId: 'pill.minor_heal',
      conditions: [{ type: 'hp_below_ratio', value: 0.5 }],
    },
  ]);
  assertDirtyDomains(service, playerId, ['auto_use_item_rule'], ['snapshot', 'combat_pref']);
  const writes = (service as unknown as { autoUseRuleWrites?: Array<{ playerId: string; rules: unknown[]; versionSeed?: number | null }> }).autoUseRuleWrites ?? [];
  assert.equal(writes.length, 1);
  assert.equal(writes[0].playerId, playerId);
  assert.equal(writes[0].versionSeed, 2);
  assert.equal(Array.isArray(writes[0].rules), true);
  assert.equal(writes[0].rules.length, 1);
}

function testMapUnlockDirtyDomain(): void {
  const playerId = 'player:map-unlock';
  const service = createPlayerRuntimeService();
  const hydrated = service.hydrateFromSnapshot(playerId, `${playerId}:session`, createSnapshot());
  service.players.set(playerId, hydrated);
  service.markPersisted(playerId);
  service.unlockMap(playerId, 'bamboo_forest');
  assertDirtyDomains(service, playerId, ['map_unlock'], ['snapshot']);
  const mapUnlockWrites = (service as unknown as { mapUnlockWrites?: Array<{ playerId: string; mapIds: string[]; versionSeed?: number | null }> }).mapUnlockWrites ?? [];
  assert.equal(mapUnlockWrites.length, 1);
  assert.equal(mapUnlockWrites[0].playerId, playerId);
  assert.deepEqual(mapUnlockWrites[0].mapIds, ['bamboo_forest', 'yunlai_town']);
}

function testAutoBattleSkillDirtyDomain(): void {
  const playerId = 'player:auto-battle-skill';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.techniques.techniques.push({
    techId: 'manual.tech',
    level: 1,
    exp: 0,
    expToNext: 10,
    realmLv: 1,
    skillsEnabled: true,
    skills: [{ id: 'manual.tech.skill', unlockLevel: 1 }],
  } as never);
  service.markPersisted(playerId);

  service.updateAutoBattleSkills(playerId, [{ skillId: 'manual.tech.skill', enabled: true, skillEnabled: true }]);

  assertDirtyDomains(service, playerId, ['technique', 'auto_battle_skill'], ['snapshot']);
  const writes = (service as unknown as { autoBattleSkillWrites?: Array<{ playerId: string; skills: unknown[]; versionSeed?: number | null }> }).autoBattleSkillWrites ?? [];
  assert.equal(writes.length, 1);
  assert.equal(writes[0].playerId, playerId);
  assert.equal(writes[0].versionSeed, 2);
  assert.equal(Array.isArray(writes[0].skills), true);
  assert.equal(writes[0].skills.length, 1);
}

function testPlayerRetaliateOpensLockedAutoBattle(): void {
  const playerId = 'player:retaliate:pvp';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);

  service.setRetaliatePlayerTarget(playerId, 'player:attacker', 17);

  assert.equal(player.combat.retaliatePlayerTargetId, 'player:attacker');
  assert.equal(player.combat.autoBattle, true);
  assert.equal(player.combat.combatTargetId, 'player:player:attacker');
  assert.equal(player.combat.combatTargetLocked, true);
  assertDirtyDomains(service, playerId, ['combat_pref'], ['snapshot']);
}

function testMonsterRetaliateOpensAutoBattleWithoutPlayerLock(): void {
  const playerId = 'player:retaliate:monster';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.combat.retaliatePlayerTargetId = 'player:old';
  service.markPersisted(playerId);

  service.activateAutoRetaliate(playerId, 23);

  assert.equal(player.combat.retaliatePlayerTargetId, null);
  assert.equal(player.combat.autoBattle, true);
  assert.equal(player.combat.combatTargetId, null);
  assert.equal(player.combat.combatTargetLocked, false);
  assertDirtyDomains(service, playerId, ['combat_pref'], ['snapshot']);
}

function testClearMainTechniquePreservesCultivationActive(): void {
  const playerId = 'player:clear-main-technique';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.techniques.techniques.push({
    techId: 'manual.tech',
    level: 1,
    exp: 0,
    expToNext: 10,
    realmLv: 1,
    skillsEnabled: true,
    skills: [],
  } as never);
  player.techniques.cultivatingTechId = 'manual.tech';
  player.combat.cultivationActive = true;
  service.markPersisted(playerId);

  service.cultivateTechnique(playerId, null);

  assert.equal(player.techniques.cultivatingTechId, null);
  assert.equal(player.combat.cultivationActive, true);
  assertDirtyDomains(service, playerId, ['technique'], ['combat_pref', 'snapshot']);
}

function testCultivationActiveWithoutMainTechnique(): void {
  const playerId = 'player:cultivation-no-main';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.techniques.cultivatingTechId = null;
  player.combat.cultivationActive = false;
  service.markPersisted(playerId);

  service.updateCombatSettings(playerId, { cultivationActive: true } as never, 0);

  assert.equal(player.techniques.cultivatingTechId, null);
  assert.equal(player.combat.cultivationActive, true);
  assertDirtyDomains(service, playerId, ['combat_pref', 'attr'], ['technique', 'snapshot']);
}

function testLogbookDirtyDomain(): void {
  const playerId = 'player:logbook';
  const service = createHydratedService(playerId);
  service.queuePendingLogbookMessage(playerId, {
    id: 'log:1',
    kind: 'system',
    text: 'dirty-domain smoke',
    at: 123,
  });
  assertDirtyDomains(service, playerId, ['logbook'], ['snapshot']);
  const writes = (service as unknown as { logbookWrites?: Array<{ playerId: string; messages: unknown[]; versionSeed?: number | null }> }).logbookWrites ?? [];
  assert.equal(writes.length, 1);
  assert.equal(writes[0].playerId, playerId);
  assert.equal(writes[0].versionSeed, 2);
  assert.equal(Array.isArray(writes[0].messages), true);
  assert.equal(writes[0].messages.length, 1);
}

function testWorldPreferenceDirtyDomain(): void {
  const playerId = 'player:world-pref';
  const service = createHydratedService(playerId);
  service.updateWorldPreference(playerId, 'peaceful');
  assertDirtyDomains(service, playerId, ['world_anchor'], ['snapshot']);
}

function testGrantWalletItemDirtyDomain(): void {
  const playerId = 'player:grant-wallet';
  const service = createHydratedService(playerId);

  service.grantItem(playerId, 'spirit_stone', 3);

  assertDirtyDomains(service, playerId, ['inventory'], ['snapshot', 'wallet']);
  assert.equal(service.getInventoryCountByItemId(playerId, 'spirit_stone'), 3);
  assert.equal(service.getWalletBalanceByType(playerId, 'spirit_stone'), 3);
}

function testCreditWalletUsesInventoryCache(): void {
  const playerId = 'player:wallet-credit';
  const service = createHydratedService(playerId);

  service.creditWallet(playerId, 'spirit_stone', 3);

  const walletWrites = (service as unknown as { walletWrites?: Array<{ playerId: string; balances: unknown[]; versionSeed?: number | null }> }).walletWrites ?? [];
  assert.equal(walletWrites.length, 0);
  assertDirtyDomains(service, playerId, ['inventory'], ['snapshot', 'wallet']);
  assert.equal(service.getInventoryCountByItemId(playerId, 'spirit_stone'), 3);
  assert.equal(service.getWalletBalanceByType(playerId, 'spirit_stone'), 3);
}

function testReceiveInventoryItemDirtyDomain(): void {
  const playerId = 'player:receive-item';
  const service = createHydratedService(playerId);
  service.receiveInventoryItem(playerId, {
    itemId: 'rat_tail',
    count: 3,
  });
  assertDirtyDomains(service, playerId, ['inventory'], ['snapshot', 'wallet']);
}

function testReceiveWalletItemDirtyDomain(): void {
  const playerId = 'player:receive-wallet';
  const service = createHydratedService(playerId);
  service.receiveInventoryItem(playerId, {
    itemId: 'spirit_stone',
    count: 3,
  });
  assertDirtyDomains(service, playerId, ['inventory'], ['snapshot', 'wallet']);
  assert.equal(service.getInventoryCountByItemId(playerId, 'spirit_stone'), 3);
  assert.equal(service.getWalletBalanceByType(playerId, 'spirit_stone'), 3);
}

function testDebitWalletFallsBackToInventory(): void {
  const playerId = 'player:wallet-fallback';
  const service = createHydratedService(playerId);
  service.receiveInventoryItem(playerId, {
    itemId: 'spirit_stone',
    count: 5,
  });
  service.markPersisted(playerId);

  service.debitWallet(playerId, 'spirit_stone', 3);

  assertDirtyDomains(service, playerId, ['inventory'], ['snapshot']);
  assert.equal(service.getInventoryCountByItemId(playerId, 'spirit_stone'), 2);
  assert.equal(service.getWalletBalanceByType(playerId, 'spirit_stone'), 2);
}

function testSplitInventoryItemDirtyDomain(): void {
  const playerId = 'player:split-item';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.inventory.items.push({
    itemId: 'spirit_stone',
    count: 5,
  });
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.splitInventoryItem(playerId, 0, 2);

  assertDirtyDomains(service, playerId, ['inventory'], ['snapshot']);
}

function testSetVitalsDirtyDomain(): void {
  const playerId = 'player:set-vitals';
  const service = createHydratedService(playerId);
  service.setVitals(playerId, {
    hp: 88,
    qi: 22,
  });
  assertDirtyDomains(service, playerId, ['vitals'], ['snapshot']);
}

function testUseTechniqueBookDirtyDomain(): void {
  const playerId = 'player:use-technique-book';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.inventory.items.push({
    itemId: 'manual.tech_book',
    count: 1,
  });
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.useItem(playerId, 0);

  assertDirtyDomains(service, playerId, ['inventory', 'technique', 'auto_battle_skill'], ['snapshot']);
}

function testUseTechniqueBookRespectsSkillLimit(): void {
  const playerId = 'player:use-technique-book-skill-limit';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.techniques.techniques.push(
    {
      techId: 'starter.tech.1',
      level: 1,
      exp: 0,
      expToNext: 10,
      realmLv: 1,
      skillsEnabled: true,
      skills: [
        { id: 'starter.skill.1', unlockLevel: 1 },
        { id: 'starter.skill.2', unlockLevel: 1 },
      ],
    } as never,
    {
      techId: 'starter.tech.2',
      level: 1,
      exp: 0,
      expToNext: 10,
      realmLv: 1,
      skillsEnabled: true,
      skills: [
        { id: 'starter.skill.3', unlockLevel: 1 },
        { id: 'starter.skill.4', unlockLevel: 1 },
      ],
    } as never,
  );
  player.techniques.revision += 1;
  player.combat.autoBattleSkills = [
    { skillId: 'starter.skill.1', enabled: true, skillEnabled: true, autoBattleOrder: 0 },
    { skillId: 'starter.skill.2', enabled: true, skillEnabled: true, autoBattleOrder: 1 },
    { skillId: 'starter.skill.3', enabled: true, skillEnabled: true, autoBattleOrder: 2 },
    { skillId: 'starter.skill.4', enabled: true, skillEnabled: true, autoBattleOrder: 3 },
  ];
  player.inventory.items.push({
    itemId: 'manual.tech_book',
    count: 1,
  });
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.useItem(playerId, 0);

  assert.equal(countEnabledSkillEntries(player.combat.autoBattleSkills), 4);
  assert.deepEqual(
    player.combat.autoBattleSkills.map((entry) => [entry.skillId, entry.skillEnabled !== false]),
    [
      ['starter.skill.1', true],
      ['starter.skill.2', true],
      ['starter.skill.3', true],
      ['starter.skill.4', true],
      ['manual.tech.skill.1', false],
      ['manual.tech.skill.2', false],
    ],
  );
}

function testUseConsumableItemDirtyDomain(): void {
  const playerId = 'player:use-consumable';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.hp = 50;
  player.qi = 10;
  player.inventory.items.push({
    itemId: 'pill.heal_minor',
    count: 1,
    healAmount: 20,
    qiPercent: 0.1,
  });
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.useItem(playerId, 0);

  assertDirtyDomains(service, playerId, ['inventory', 'vitals'], ['snapshot']);
}

function createRealProgressionServiceForSmoke() {
  const service = new PlayerProgressionService(
    {} as never,
    {
      recalculate() {
        return true;
      },
      markPanelDirty() {
        return undefined;
      },
    } as never,
  );
  service.onModuleInit();
  return service;
}

function testUseDivineRootSeedConsumable(): void {
  const playerId = 'player:use-divine-root-seed';
  const service = createHydratedService(playerId);
  const progressionService = createRealProgressionServiceForSmoke();
  (service as unknown as { playerProgressionService: ReturnType<typeof createRealProgressionServiceForSmoke> }).playerProgressionService = progressionService;
  const player = service.getPlayerOrThrow(playerId);
  player.realm = {
    stage: 'kou_xianmen',
    name: '叩仙门',
    displayName: '叩仙门',
    realmLv: 18,
    progress: 100,
    progressToNext: 1000,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  const normalizedRealm = progressionService.normalizeRealmState(player.realm);
  const expectedFoundationCost = progressionService.getHeavenGateRerollCost(normalizedRealm) * 100;
  player.foundation = expectedFoundationCost;
  player.inventory.items.push({
    itemId: 'root_seed.divine',
    name: '神品灵根幼苗',
    type: 'consumable',
    count: 1,
  } as never);
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.useItem(playerId, 0);

  assert.equal(player.inventory.items.length, 0);
  assert.deepEqual(player.heavenGate?.roots, {
    metal: 100,
    wood: 100,
    water: 100,
    fire: 100,
    earth: 100,
  });
  assert.equal(player.heavenGate?.entered, false);
  assert.equal(player.heavenGate?.averageBonus, 200);
  assert.equal(player.foundation, 0);
  assert.equal(player.notices.queue.some((notice) => notice.text.includes('神品灵根幼苗')), true);
  assertDirtyDomains(service, playerId, ['inventory', 'progression', 'attr'], ['snapshot']);
}

function testUseShatterSpiritPillConsumable(): void {
  const playerId = 'player:use-shatter-spirit-pill';
  const service = createHydratedService(playerId);
  const progressionService = createRealProgressionServiceForSmoke();
  (service as unknown as { playerProgressionService: ReturnType<typeof createRealProgressionServiceForSmoke> }).playerProgressionService = progressionService;
  const player = service.getPlayerOrThrow(playerId);
  player.realm = {
    stage: 'kou_xianmen',
    name: '叩仙门',
    displayName: '叩仙门',
    realmLv: 18,
    progress: 800,
    progressToNext: 1000,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  player.heavenGate = {
    unlocked: true,
    severed: ['wood'],
    roots: { metal: 80, wood: 0, water: 12, fire: 6, earth: 2 },
    entered: false,
    averageBonus: 4,
  };
  player.inventory.items.push({
    itemId: 'pill.shatter_spirit',
    name: '碎灵丹',
    type: 'consumable',
    count: 1,
  } as never);
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.useItem(playerId, 0);

  assert.equal(player.inventory.items.length, 0);
  assert.equal(player.realm?.progress, 600);
  assert.deepEqual(player.heavenGate?.roots, null);
  assert.deepEqual(player.heavenGate?.severed, []);
  assert.equal(player.heavenGate?.entered, false);
  assert.equal(player.heavenGate?.averageBonus, 6);
  assert.equal(player.spiritualRoots, null);
  assert.equal(player.notices.queue.some((notice) => notice.text.includes('碎灵丹')), true);
  assertDirtyDomains(service, playerId, ['inventory', 'progression', 'attr', 'vitals'], ['snapshot']);
}

function testUseWangshengPillConsumable(): void {
  const playerId = 'player:use-wangsheng-pill';
  const service = createHydratedService(playerId);
  const progressionService = createRealProgressionServiceForSmoke();
  (service as unknown as { playerProgressionService: ReturnType<typeof createRealProgressionServiceForSmoke> }).playerProgressionService = progressionService;
  const player = service.getPlayerOrThrow(playerId);
  player.realm = {
    stage: 'qi_refining',
    name: '练气',
    displayName: '练气',
    realmLv: 19,
    progress: 456,
    progressToNext: 1000,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  player.foundation = 999;
  player.heavenGate = {
    unlocked: true,
    severed: [],
    roots: { metal: 100, wood: 100, water: 100, fire: 100, earth: 100 },
    entered: true,
    averageBonus: 200,
  };
  player.spiritualRoots = { metal: 100, wood: 100, water: 100, fire: 100, earth: 100 };
  player.dead = true;
  player.hp = 0;
  player.qi = 9999;
  player.inventory.items.push({
    itemId: 'pill.wangsheng',
    name: '往生丹',
    type: 'consumable',
    count: 1,
  } as never);
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.useItem(playerId, 0);

  assert.equal(player.inventory.items.length, 0);
  assert.equal(player.realm?.realmLv, 1);
  assert.equal(player.realm?.progress, 0);
  assert.equal(player.foundation, 0);
  assert.deepEqual(player.spiritualRoots, { metal: 100, wood: 100, water: 100, fire: 100, earth: 100 });
  assert.deepEqual(player.heavenGate?.roots, { metal: 100, wood: 100, water: 100, fire: 100, earth: 100 });
  assert.equal(player.heavenGate?.entered, true);
  assert.equal(player.heavenGate?.averageBonus, 200);
  assert.equal(player.dead, false);
  assert.equal(player.hp, 1);
  assert.equal(player.notices.queue.some((notice) => notice.text.includes('往生丹')), true);
  assertDirtyDomains(service, playerId, ['inventory', 'progression', 'attr', 'vitals'], ['snapshot']);
}

function testUseWangshengPillKeepsRerollCountWithoutRoots(): void {
  const playerId = 'player:use-wangsheng-pill-keeps-reroll-without-roots';
  const service = createHydratedService(playerId);
  const progressionService = createRealProgressionServiceForSmoke();
  (service as unknown as { playerProgressionService: ReturnType<typeof createRealProgressionServiceForSmoke> }).playerProgressionService = progressionService;
  const player = service.getPlayerOrThrow(playerId);
  player.realm = {
    stage: 'kou_xianmen',
    name: '叩仙门',
    displayName: '叩仙门',
    realmLv: 18,
    progress: 456,
    progressToNext: 1000,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  player.foundation = 999;
  player.heavenGate = {
    unlocked: true,
    severed: [],
    roots: null,
    entered: false,
    averageBonus: 6,
  };
  player.spiritualRoots = null;
  player.inventory.items.push({
    itemId: 'pill.wangsheng',
    name: '往生丹',
    type: 'consumable',
    count: 1,
  } as never);
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.useItem(playerId, 0);

  assert.equal(player.realm?.realmLv, 1);
  assert.equal(player.foundation, 0);
  assert.equal(player.spiritualRoots, null);
  assert.equal(player.heavenGate?.roots, null);
  assert.equal(player.heavenGate?.entered, false);
  assert.equal(player.heavenGate?.averageBonus, 6);
  assertDirtyDomains(service, playerId, ['inventory', 'progression', 'attr', 'vitals'], ['snapshot']);
}

function testEquipItemDirtyDomain(): void {
  const playerId = 'player:equip-item';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.equipment.slots = [{ slot: 'weapon', item: null }] as never;
  player.inventory.items.push({
    itemId: 'iron_sword',
    count: 1,
    equipSlot: 'weapon',
  });
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.equipItem(playerId, 0);

  assertDirtyDomains(service, playerId, ['inventory', 'equipment', 'attr'], ['snapshot']);
}

function testEquipItemSplitsStackedEquipment(): void {
  const playerId = 'player:equip-stacked-item';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.equipment.slots = [{ slot: 'weapon', item: null }] as never;
  player.inventory.items.push({
    itemId: 'iron_sword',
    count: 3,
    equipSlot: 'weapon',
  });
  player.inventory.revision += 1;
  service.markPersisted(playerId);

  service.equipItem(playerId, 0);

  assert.equal(player.equipment.slots[0]?.item?.itemId, 'iron_sword');
  assert.equal(player.equipment.slots[0]?.item?.count, 1);
  assert.equal(player.inventory.items[0]?.itemId, 'iron_sword');
  assert.equal(player.inventory.items[0]?.count, 2);
  assertDirtyDomains(service, playerId, ['inventory', 'equipment', 'attr'], ['snapshot']);
}

function testBodyTrainingRecalculateDirtyDomain(): void {
  const playerId = 'player:body-training';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.foundation = 1_000_000;
  service.markPersisted(playerId);

  service.setManagedBodyTrainingLevel(playerId, 2);

  assertDirtyDomains(service, playerId, ['body_training', 'progression', 'attr'], ['snapshot']);
}

function testInfuseBodyTrainingDirtyDomain(): void {
  const playerId = 'player:infuse-body-training';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.foundation = 1_000_000;
  service.markPersisted(playerId);

  service.infuseBodyTraining(playerId, 1_000_000);

  assertDirtyDomains(service, playerId, ['body_training', 'progression', 'attr'], ['snapshot']);
}

function testApplyTemporaryBuffDirtyDomain(): void {
  const playerId = 'player:apply-buff';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  const persistedRevision = player.persistedRevision;

  service.applyPvPSoulInjury(playerId);

  assertDirtyDomains(service, playerId, ['buff', 'attr'], ['snapshot']);
  assert.ok(player.persistentRevision > persistedRevision, 'expected applyTemporaryBuff to bump persistentRevision');
}

function testProgressionServiceDirtyDomains(): void {
  const playerId = 'player:progression-service';
  const runtime = createPlayerRuntimeService();
  const player = runtime.createFreshPlayer(playerId, null);
  const service = createPlayerProgressionService();
  service.onModuleInit();
  player.realm = {
    stage: '炼气',
    realmLv: 1,
    progress: 0,
    progressToNext: 100,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  player.foundation = 10;
  player.combatExp = 0;

  const foundation = service.gainFoundation(player, 5);
  assert.ok(foundation.dirtyDomains.includes('progression'), `expected progression dirty domain, got ${foundation.dirtyDomains.join(',')}`);

  const realm = service.gainRealmProgress(player, 5);
  assert.ok(realm.dirtyDomains.includes('progression'), `expected progression dirty domain, got ${realm.dirtyDomains.join(',')}`);

  const noMainCultivator = runtime.createFreshPlayer(`${playerId}:no-main`, null);
  noMainCultivator.realm = {
    stage: '炼气',
    realmLv: 1,
    progress: 0,
    progressToNext: 100,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  noMainCultivator.techniques.cultivatingTechId = null;
  noMainCultivator.combat.cultivationActive = true;
  noMainCultivator.attrs.numericStats.realmExpPerTick = 1;
  noMainCultivator.attrs.numericStats.techniqueExpPerTick = 5;
  noMainCultivator.techniques.techniques.push({
    techId: 'manual.no_main',
    name: '无主修测试功法',
    level: 1,
    exp: 0,
    expToNext: 100,
    realmLv: 1,
    skills: [],
    layers: [
      { level: 1, expToNext: 100 },
      { level: 2, expToNext: 0 },
    ],
  } as never);

  const cultivation = service.advanceCultivation(noMainCultivator, 1, { auraMultiplier: 3 });

  assert.equal(noMainCultivator.realm.progress, 3);
  assert.equal(noMainCultivator.techniques.cultivatingTechId, null);
  assert.equal(noMainCultivator.bodyTraining.exp, 15);
  assert.ok(cultivation.dirtyDomains.includes('progression'), `expected progression dirty domain, got ${cultivation.dirtyDomains.join(',')}`);
  assert.ok(cultivation.dirtyDomains.includes('body_training'), `expected body_training dirty domain, got ${cultivation.dirtyDomains.join(',')}`);

  const techniqueCultivator = runtime.createFreshPlayer(`${playerId}:technique`, null);
  techniqueCultivator.realm = {
    stage: '炼气',
    realmLv: 1,
    progress: 0,
    progressToNext: 100,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  techniqueCultivator.attrs.numericStats.realmExpPerTick = 1;
  techniqueCultivator.attrs.numericStats.techniqueExpPerTick = 5;
  techniqueCultivator.techniques.cultivatingTechId = 'manual.technique';
  techniqueCultivator.combat.cultivationActive = true;
  techniqueCultivator.techniques.techniques.push({
    techId: 'manual.technique',
    name: '测试功法',
    level: 1,
    exp: 0,
    expToNext: 100,
    realmLv: 1,
    skills: [],
    layers: [
      { level: 1, expToNext: 100 },
      { level: 2, expToNext: 0 },
    ],
  } as never);

  service.advanceCultivation(techniqueCultivator, 1, { auraMultiplier: 3 });

  assert.equal(techniqueCultivator.realm.progress, 3);
  assert.equal(techniqueCultivator.techniques.techniques[0]?.exp, 15);

  const maxedCultivator = runtime.createFreshPlayer(`${playerId}:all-maxed`, null);
  maxedCultivator.realm = {
    stage: '炼气',
    realmLv: 1,
    progress: 0,
    progressToNext: 100,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  maxedCultivator.attrs.numericStats.realmExpPerTick = 1;
  maxedCultivator.attrs.numericStats.techniqueExpPerTick = 5;
  maxedCultivator.combat.cultivationActive = true;
  maxedCultivator.techniques.cultivatingTechId = 'manual.maxed';
  maxedCultivator.techniques.techniques.push({
    techId: 'manual.maxed',
    name: '圆满测试功法',
    level: 2,
    exp: 0,
    expToNext: 0,
    realmLv: 1,
    skills: [],
    layers: [
      { level: 1, expToNext: 100 },
      { level: 2, expToNext: 0 },
    ],
  } as never);

  const maxedCultivation = service.advanceCultivation(maxedCultivator, 1, { auraMultiplier: 3 });

  assert.equal(maxedCultivator.bodyTraining.exp, 15);
  assert.ok(maxedCultivation.dirtyDomains.includes('body_training'), `expected all-maxed technique exp to enter body_training, got ${maxedCultivation.dirtyDomains.join(',')}`);

  const craftCultivator = runtime.createFreshPlayer(`${playerId}:craft`, null);
  craftCultivator.realm = {
    stage: '炼气',
    realmLv: 1,
    progress: 0,
    progressToNext: 100,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  const craftGain = service.grantCraftRealmExp(craftCultivator, 0.5);

  assert.equal(craftCultivator.realm.progress, 1);
  assert.ok(craftGain.dirtyDomains.includes('progression'), `expected craft realm exp to mark progression, got ${craftGain.dirtyDomains.join(',')}`);

  const cappedCombatCultivator = runtime.createFreshPlayer(`${playerId}:combat-cap`, null);
  cappedCombatCultivator.realm = {
    stage: '炼气',
    realmLv: 1,
    progress: 0,
    progressToNext: 10,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  service.gainRealmProgress(cappedCombatCultivator, 1_000_000, {
    trackCombatExp: true,
    overflowToFoundation: true,
  });

  assert.equal(cappedCombatCultivator.combatExp, (cappedCombatCultivator.realm?.progressToNext ?? 0) * 5);
}

function testHeavenGateEnterRecalculatesAttributes(): void {
  const playerId = 'player:heaven-gate-enter';
  const runtime = createPlayerRuntimeService();
  const player = runtime.createFreshPlayer(playerId, null);
  let recalculated = 0;
  const service = new PlayerProgressionService(
    {} as never,
    {
      recalculate(target: typeof player) {
        recalculated += 1;
        target.attrs.revision += 1;
        target.selfRevision += 1;
        return true;
      },
      markPanelDirty() {
        return undefined;
      },
    } as never,
  );
  service.onModuleInit();
  player.realm = {
    stage: 'kou_xianmen',
    name: '叩仙门',
    displayName: '叩仙门',
    realmLv: 18,
    progress: 100,
    progressToNext: 1000,
    breakthroughReady: false,
    nextStage: undefined,
    breakthroughItems: [],
    minTechniqueLevel: 1,
    minTechniqueRealm: 1,
  } as never;
  player.heavenGate = {
    unlocked: true,
    severed: ['wood'],
    roots: { metal: 80, wood: 0, water: 12, fire: 6, earth: 2 },
    entered: false,
    averageBonus: 0,
  };
  player.spiritualRoots = null;

  const result = service.handleHeavenGateAction(player, 'enter', undefined);

  assert.equal(result.changed, true);
  assert.equal(recalculated, 1, 'expected entering heaven gate to recalculate attributes immediately');
  assert.deepEqual(player.spiritualRoots, { metal: 80, wood: 0, water: 12, fire: 6, earth: 2 });
  assert.equal(player.heavenGate?.entered, true);
  assert.ok(result.dirtyDomains.includes('progression'), `expected progression dirty domain, got ${result.dirtyDomains.join(',')}`);
  assert.ok(result.dirtyDomains.includes('attr'), `expected attr dirty domain, got ${result.dirtyDomains.join(',')}`);
}

function testAdvanceSinglePlayerTickDirtyDomain(): void {
  const playerId = 'player:tick-buff';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.buffs.buffs.push({
    buffId: 'buff:tick-test',
    name: 'tick-test',
    desc: '',
    baseDesc: '',
    shortMark: '',
    category: 'temporary',
    visibility: 'public',
    duration: 2,
    remainingTicks: 2,
    stacks: 1,
    maxStacks: 1,
    sourceSkillId: null,
    sourceSkillName: null,
    realmLv: 0,
    color: null,
  });
  player.buffs.revision += 1;
  service.markPersisted(playerId);
  const previousLifeElapsedTicks = player.lifeElapsedTicks;

  service.advanceSinglePlayerTick(player, 1, {});

  assert.equal(player.lifeElapsedTicks, previousLifeElapsedTicks + 1);
  assertDirtyDomains(service, playerId, ['progression', 'buff', 'attr'], ['snapshot']);
  assert.ok(player.persistentRevision > player.persistedRevision, 'expected chronology and buff tick to bump persistentRevision');
}

function testRespawnDirtyDomains(): void {
  const playerId = 'player:respawn';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.x = 10;
  player.y = 10;
  player.hp = 1;
  player.qi = 2;
  player.combat.autoBattle = true;
  service.markPersisted(playerId);

  service.respawnPlayer(playerId, {
    instanceId: 'public:yunlai_town',
    templateId: 'yunlai_town',
    x: 32,
    y: 5,
    facing: Direction.South,
    currentTick: 200,
  });

  assertDirtyDomains(service, playerId, ['position_checkpoint', 'vitals', 'buff', 'combat_pref'], ['snapshot']);
}

function testRespawnPreservesActiveSkillCooldown(): void {
  const playerId = 'player:respawn-cooldown';
  const skillId = 'skill.respawn.cooldown';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);
  player.techniques.techniques = [
    {
      techId: 'tech.respawn.cooldown',
      level: 1,
      exp: 0,
      expToNext: 10,
      realmLv: 1,
      skillsEnabled: true,
      name: '复生冷却测试',
      grade: null,
      category: 'arts',
      skills: [
        {
          id: skillId,
          name: '复生冷却术',
          desc: '',
          cooldown: 30,
          range: 1,
          requiresTarget: true,
        },
      ],
    },
  ] as never;
  service.rebuildActionState(player, 100);
  service.setSkillCooldownReadyTick(playerId, skillId, 130, 100);
  player.hp = 0;
  player.qi = 1;
  service.markPersisted(playerId);

  service.respawnPlayer(playerId, {
    instanceId: 'public:yunlai_town',
    templateId: 'yunlai_town',
    x: 32,
    y: 5,
    facing: Direction.South,
    currentTick: 110,
  });

  assert.equal(player.combat.cooldownReadyTickBySkillId[skillId], 130);
  assert.equal(player.actions.actions.find((entry) => entry.id === skillId)?.cooldownLeft, 20);
}

function testApplyProgressionResultDirtyDomains(): void {
  const playerId = 'player:progression-result';
  const service = createHydratedService(playerId);
  const player = service.getPlayerOrThrow(playerId);

  service.applyProgressionResult(player, {
    changed: true,
    notices: [],
    actionsDirty: false,
    dirtyDomains: ['progression', 'attr', 'technique'],
  });

  assertDirtyDomains(service, playerId, ['progression', 'attr', 'technique'], ['snapshot']);
}

function main(): void {
testAutoUsePillsDirtyDomain();
testMapUnlockDirtyDomain();
testAutoBattleSkillDirtyDomain();
testPlayerRetaliateOpensLockedAutoBattle();
testMonsterRetaliateOpensAutoBattleWithoutPlayerLock();
testLogbookDirtyDomain();
  testWorldPreferenceDirtyDomain();
  testGrantWalletItemDirtyDomain();
  testReceiveInventoryItemDirtyDomain();
  testReceiveWalletItemDirtyDomain();
  testCreditWalletUsesInventoryCache();
  testDebitWalletFallsBackToInventory();
  testSplitInventoryItemDirtyDomain();
  testSetVitalsDirtyDomain();
  testUseTechniqueBookDirtyDomain();
  testUseTechniqueBookRespectsSkillLimit();
  testClearMainTechniquePreservesCultivationActive();
  testCultivationActiveWithoutMainTechnique();
  testUseConsumableItemDirtyDomain();
  testUseDivineRootSeedConsumable();
  testUseShatterSpiritPillConsumable();
  testUseWangshengPillConsumable();
  testUseWangshengPillKeepsRerollCountWithoutRoots();
  testEquipItemDirtyDomain();
  testEquipItemSplitsStackedEquipment();
  testBodyTrainingRecalculateDirtyDomain();
  testInfuseBodyTrainingDirtyDomain();
  testApplyTemporaryBuffDirtyDomain();
  testProgressionServiceDirtyDomains();
  testHeavenGateEnterRecalculatesAttributes();
  testAdvanceSinglePlayerTickDirtyDomain();
  testRespawnDirtyDomains();
  testRespawnPreservesActiveSkillCooldown();
  testApplyProgressionResultDirtyDomains();
  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'PlayerRuntimeService 的显式脏域标记现已不会再被 bumpPersistentRevision 强制打回 snapshot；灵石 wallet 入口只读写背包真源并同步运行态 wallet 缓存，不再触发 wallet 小事务写入；auto_battle_skill/auto_use_item_rule/map_unlock/logbook/world_anchor/inventory/vitals/technique/combat_pref/position_checkpoint/buff 仍按入口打对应 dirty domain',
        completionMapping: 'release:proof:with-db.player-runtime-dirty-domains',
      },
      null,
      2,
    ),
  );
}

main();
