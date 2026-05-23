import assert from 'node:assert/strict';

import type { ItemStack } from '@mud/shared';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { CraftPanelEnhancementQueryService } from '../runtime/craft/craft-panel-enhancement-query.service';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { WorldRuntimeEquipmentService } from '../runtime/world/world-runtime-equipment.service';
import { WorldRuntimeFormationService } from '../runtime/world/world-runtime-formation.service';
import { WorldRuntimeItemGroundService } from '../runtime/world/world-runtime-item-ground.service';
import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';

interface SmokePlayer {
  playerId: string;
  inventory: {
    revision: number;
    capacity: number;
    items: ItemStack[];
    lockedItems: Array<Record<string, unknown>>;
  };
  equipment: {
    revision: number;
    slots: Array<{ slot: string; item: ItemStack | null }>;
  };
  wallet: { balances: Array<{ walletType: string; balance: number; frozenBalance: number; version: number }> };
  [key: string]: unknown;
}

const playerId = 'player:inventory-item-instance-ref-smoke';
const instanceId = 'instance:inventory-item-instance-ref-smoke';

function createRepository(): ContentTemplateRepository {
  const repository = new ContentTemplateRepository();
  repository.onModuleInit();
  return repository;
}

function createPlayerRuntimeService(repository: ContentTemplateRepository): PlayerRuntimeService {
  return new PlayerRuntimeService(
    repository,
    { has() { return false; }, list() { return []; }, getOrThrow() { return { spawnX: 0, spawnY: 0 }; } },
    { recalculate() {} },
    { refreshPreview() {}, initializePlayer() {}, createInitialState() { return {}; } },
  );
}

function createItem(repository: ContentTemplateRepository, itemId: string, count: number, itemInstanceId: string, overrides: Partial<ItemStack> = {}): ItemStack {
  return {
    ...repository.createItem(itemId, count),
    itemInstanceId,
    ...overrides,
  } as ItemStack;
}

function createPlayer(repository: ContentTemplateRepository): SmokePlayer {
  return {
    playerId,
    name: '实例引用测试',
    displayName: '实例引用测试',
    persistentRevision: 1,
    persistedRevision: 0,
    selfRevision: 1,
    sessionId: 'session:inventory-ref',
    runtimeOwnerId: 'runtime:inventory-ref',
    sessionEpoch: 1,
    instanceId,
    templateId: 'inventory-ref-template',
    lastHeartbeatAt: null,
    offlineSinceAt: null,
    worldPreference: { linePreset: 'real' },
    x: 2,
    y: 3,
    hp: 50,
    maxHp: 100,
    qi: 10000,
    maxQi: 10000,
    lifeElapsedTicks: 100,
    realm: { realmLv: 1, realmStage: 0, realmExp: 0, breakthroughReady: false },
    heavenGate: null,
    spiritualRoots: null,
    bodyTraining: null,
    unlockedMapIds: [],
    inventory: {
      revision: 1,
      capacity: 40,
      lockedItems: [],
      items: [
        createItem(repository, 'pill.minor_heal', 1, 'inst-minor-heal', { type: 'consumable', healAmount: 22 }),
        createItem(repository, 'minor_qi_pill', 1, 'inst-minor-qi', { type: 'consumable', qiPercent: 0.22 }),
        createItem(repository, 'equip.orebreak_hammer', 1, 'inst-equip-target', {
          type: 'equipment',
          name: '矿卫破岩锤',
          level: 3,
          equipSlot: 'weapon',
          enhanceLevel: 0,
        }),
        createItem(repository, 'formation_disk.mystic', 1, 'inst-formation-disk', {
          type: 'consumable',
          name: '玄阶阵盘',
          formationDiskTier: 'mystic',
          formationDiskMultiplier: 4,
        }),
        createItem(repository, 'spirit_stone', 1000, 'inst-spirit-stone'),
      ],
    },
    wallet: { balances: [{ walletType: 'spirit_stone', balance: 1000, frozenBalance: 0, version: 1 }] },
    marketStorage: { items: [] },
    equipment: {
      revision: 1,
      slots: [
        { slot: 'weapon', item: null },
        { slot: 'head', item: null },
        { slot: 'body', item: null },
        { slot: 'legs', item: null },
        { slot: 'accessory', item: null },
      ],
    },
    attrs: { revision: 1, baseAttrs: {}, finalAttrs: {}, bonuses: [], numericStats: {}, ratioDivisors: {} },
    buffs: { revision: 1, buffs: [] },
    techniques: { revision: 1, techniques: [], cultivatingTechId: null },
    actions: { revision: 1, contextActions: [], actions: [] },
    quests: { revision: 1, quests: [] },
    combat: {
      cooldownReadyTickBySkillId: {},
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      autoUsePills: [],
      combatTargetingRules: undefined,
      autoBattleTargetingMode: 'auto',
      retaliatePlayerTargetId: null,
      retaliatePlayerTargetLastAttackTick: null,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: false,
      autoSwitchCultivation: false,
      autoRootFoundation: false,
      senseQiActive: false,
      wangQiActive: false,
      autoBattleSkills: [],
      cultivationActive: false,
      lastActiveTick: 0,
      combatActionTick: 0,
      combatActionsUsedThisTick: 0,
    },
    notices: { nextId: 1, queue: [] },
    pendingLogbookMessages: [],
    vitalRecoveryDeferredUntilTick: -1,
    runtimeBonuses: [],
    dirtyDomains: new Set<string>(),
    alchemySkill: { level: 1, exp: 0, expToNext: 100 },
    forgingSkill: { level: 1, exp: 0, expToNext: 100 },
    gatherSkill: { level: 1, exp: 0, expToNext: 100 },
    buildingSkill: { level: 1, exp: 0, expToNext: 100 },
    miningSkill: { level: 1, exp: 0, expToNext: 100 },
    gatherJob: null,
    buildingJob: null,
    enhancementSkill: { level: 8, exp: 0, expToNext: 100 },
    enhancementSkillLevel: 8,
    enhancementJob: null,
    enhancementRecords: [],
    alchemyPresets: [],
    alchemyJob: null,
    forgingJob: null,
  };
}

function installPlayer(service: PlayerRuntimeService, player: SmokePlayer): void {
  service.players.set(player.playerId, player);
}

function reorderInventory(player: SmokePlayer): void {
  const original = player.inventory.items.slice();
  player.inventory.items = [
    original[3],
    original[4],
    original[1],
    original[2],
    original[0],
  ].filter((entry): entry is ItemStack => Boolean(entry));
}

function itemIds(player: SmokePlayer): string[] {
  return player.inventory.items.map((item) => item.itemId);
}

function createGroundDeps(dropped: ItemStack[]): Record<string, unknown> {
  return {
    getPlayerLocationOrThrow(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      return { instanceId };
    },
    getInstanceRuntimeOrThrow(targetInstanceId: string) {
      assert.equal(targetInstanceId, instanceId);
      return {
        dropGroundItem(x: number, y: number, item: ItemStack) {
          assert.equal(x, 2);
          assert.equal(y, 3);
          dropped.push({ ...item });
          return { id: 'pile:inventory-ref' };
        },
      };
    },
    refreshQuestStates() {},
    queuePlayerNotice() {},
  };
}

function testUseItemAfterReorder(repository: ContentTemplateRepository): void {
  const service = createPlayerRuntimeService(repository);
  const player = createPlayer(repository);
  installPlayer(service, player);
  const targetId = 'inst-minor-heal';
  reorderInventory(player);

  const useItemService = new WorldRuntimeUseItemService(repository, {}, service);
  useItemService.dispatchUseItem(playerId, targetId, {
    refreshQuestStates() {},
    advanceLearnTechniqueQuest() {},
    queuePlayerNotice() {},
  });

  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === targetId), false);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === 'inst-minor-qi'), true);
  assert.equal(player.hp, 72);
}

function testDropItemAfterReorder(repository: ContentTemplateRepository): void {
  const service = createPlayerRuntimeService(repository);
  const player = createPlayer(repository);
  installPlayer(service, player);
  const targetId = 'inst-minor-qi';
  reorderInventory(player);
  const dropped: ItemStack[] = [];

  new WorldRuntimeItemGroundService(service).dispatchDropItem(playerId, targetId, 1, createGroundDeps(dropped));

  assert.equal(dropped.length, 1);
  assert.equal(dropped[0]?.itemInstanceId, targetId);
  assert.equal(dropped[0]?.itemId, 'minor_qi_pill');
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === targetId), false);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === 'inst-minor-heal'), true);
}

async function testEquipItemAfterReorder(repository: ContentTemplateRepository): Promise<void> {
  const service = createPlayerRuntimeService(repository);
  const player = createPlayer(repository);
  installPlayer(service, player);
  const targetId = 'inst-equip-target';
  reorderInventory(player);

  await new WorldRuntimeEquipmentService(service).dispatchEquipItem(playerId, targetId, {
    contentTemplateRepository: repository,
    craftPanelRuntimeService: { getLockedSlotReason() { return null; } },
    queuePlayerNotice() {},
    worldRuntimeCraftMutationService: { emitAllTechniqueActivityPanelUpdates() {} },
  });

  assert.equal(player.equipment.slots.find((slot) => slot.slot === 'weapon')?.item?.itemInstanceId, targetId);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === targetId), false);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === 'inst-minor-heal'), true);
}

function createCraftRuntime(repository: ContentTemplateRepository, playerRuntimeService: PlayerRuntimeService): CraftPanelRuntimeService {
  const query = new CraftPanelEnhancementQueryService(repository);
  const service = new CraftPanelRuntimeService(
    repository,
    playerRuntimeService,
    null as never,
    { buildAlchemyPanelPayload() { return {}; }, buildAlchemyPanelPatchPayload() { return {}; } } as never,
    query,
  );
  service.enhancementConfigs = new Map();
  return service;
}

function testEnhancementStartAfterReorder(repository: ContentTemplateRepository): void {
  const playerRuntimeService = createPlayerRuntimeService(repository);
  const player = createPlayer(repository);
  installPlayer(playerRuntimeService, player);
  const targetId = 'inst-equip-target';
  reorderInventory(player);

  const service = createCraftRuntime(repository, playerRuntimeService);
  const result = service.startEnhancement(player, { target: { source: 'inventory', itemInstanceId: targetId } });

  assert.equal(result.ok, true, JSON.stringify(result));
  const enhancementJob = player.enhancementJob as { itemInstanceId?: string } | null;
  assert.equal(enhancementJob?.itemInstanceId, targetId);
  assert.equal(player.inventory.lockedItems[0]?.itemInstanceId, targetId);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === targetId), false);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === 'inst-minor-heal'), true);
}

function testEnhancementFinishAfterQueuedReorder(repository: ContentTemplateRepository): void {
  const playerRuntimeService = createPlayerRuntimeService(repository);
  const player = createPlayer(repository);
  installPlayer(playerRuntimeService, player);
  const targetId = 'inst-equip-target';
  reorderInventory(player);

  const service = createCraftRuntime(repository, playerRuntimeService);
  const startResult = service.startEnhancement(player, { target: { source: 'inventory', itemInstanceId: targetId } });
  assert.equal(startResult.ok, true, JSON.stringify(startResult));

  player.inventory.items.reverse();
  const finishResult = service.finishEnhancementJob(player, 1, 'completed');

  assert.equal(finishResult.inventoryChanged, true);
  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems.some((item) => item.itemInstanceId === targetId), false);
  const returned = player.inventory.items.find((item) => item.itemInstanceId === targetId);
  assert.ok(returned);
  assert.equal(returned.itemId, 'equip.orebreak_hammer');
  assert.equal(returned.enhanceLevel, 1);
}

async function testMarketSellOrderAfterReorder(repository: ContentTemplateRepository): Promise<void> {
  const player = createPlayer(repository);
  const targetId = 'inst-minor-qi';
  reorderInventory(player);
  const splitCalls: Array<{ playerId: string; itemInstanceId: string; quantity: number }> = [];
  const playerRuntimeService = {
    getPlayer(requestedPlayerId: string) {
      return requestedPlayerId === playerId ? player : null;
    },
    snapshot(requestedPlayerId: string) {
      return requestedPlayerId === playerId ? { playerId: requestedPlayerId, inventory: { items: player.inventory.items.map((item) => ({ ...item })) } } : null;
    },
    restoreSnapshot() {},
    peekInventoryItemByInstanceId(requestedPlayerId: string, itemInstanceId: string) {
      assert.equal(requestedPlayerId, playerId);
      return player.inventory.items.find((item) => item.itemInstanceId === itemInstanceId) ?? null;
    },
    splitInventoryItemByInstanceId(requestedPlayerId: string, itemInstanceId: string, quantity: number) {
      assert.equal(requestedPlayerId, playerId);
      splitCalls.push({ playerId: requestedPlayerId, itemInstanceId, quantity });
      const index = player.inventory.items.findIndex((item) => item.itemInstanceId === itemInstanceId);
      assert.notEqual(index, -1);
      const item = player.inventory.items[index];
      assert.ok(item);
      player.inventory.items.splice(index, 1);
      return { ...item, count: quantity };
    },
  };

  const marketService = new MarketRuntimeService(
    repository,
    playerRuntimeService as never,
    {
      async loadOpenOrders() { return []; },
      async loadTradeHistory() { return []; },
      async loadStorageForPlayer() { return { items: [] }; },
      async persistMutation() { return undefined; },
    } as never,
    { isEnabled() { return false; } } as never,
    { isEnabled() { return false; } } as never,
  );

  const result = await marketService.createSellOrder(playerId, {
    itemRef: { itemInstanceId: targetId },
    quantity: 1,
    unitPrice: 1,
  });

  assert.equal(result.notices.some((notice: { kind?: string }) => notice.kind === 'success'), true);
  assert.deepEqual(splitCalls, [{ playerId, itemInstanceId: targetId, quantity: 1 }]);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === targetId), false);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === 'inst-minor-heal'), true);
  assert.equal(marketService.openOrders.length, 1);
  assert.equal(marketService.openOrders[0]?.item.itemId, 'minor_qi_pill');
}

function testFormationCreateAfterReorder(repository: ContentTemplateRepository): void {
  const playerRuntimeService = createPlayerRuntimeService(repository);
  const player = createPlayer(repository);
  installPlayer(playerRuntimeService, player);
  const targetId = 'inst-formation-disk';
  reorderInventory(player);
  const service = new WorldRuntimeFormationService(repository, playerRuntimeService);
  service.ensurePersistencePool = async () => null;
  const instance = {
    meta: { instanceId, kind: 'sect', linePreset: 'real' },
    template: { width: 16, height: 16 },
    worldRevision: 1,
    getPlayerPosition() {
      return { x: 2, y: 3 };
    },
  };

  const formation = service.dispatchCreateFormation(playerId, {
    itemRef: { itemInstanceId: targetId },
    formationId: 'spirit_gathering',
    setup: { radius: 2, durationHours: 2, effectValue: 1000 },
  }, {
    getPlayerLocationOrThrow(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      return { instanceId, sessionId: 'session:inventory-ref' };
    },
    getInstanceRuntime(targetInstanceId: string) {
      return targetInstanceId === instanceId ? instance : null;
    },
    refreshPlayerContextActions() {},
  });

  assert.equal(formation.diskItemId, 'formation_disk.mystic');
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === targetId), false);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === 'inst-minor-heal'), true);
  assert.deepEqual(itemIds(player).includes('minor_qi_pill'), true);
}

async function main(): Promise<void> {
  const repository = createRepository();
  testUseItemAfterReorder(repository);
  testDropItemAfterReorder(repository);
  await testEquipItemAfterReorder(repository);
  testEnhancementStartAfterReorder(repository);
  testEnhancementFinishAfterQueuedReorder(repository);
  await testMarketSellOrderAfterReorder(repository);
  testFormationCreateAfterReorder(repository);
  console.log('inventory-item-instance-ref-smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
