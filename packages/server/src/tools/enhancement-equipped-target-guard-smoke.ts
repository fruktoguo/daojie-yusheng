import assert from 'node:assert/strict';

import { CraftPanelEnhancementQueryService } from '../runtime/craft/craft-panel-enhancement-query.service';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';

function createRuntime(): { service: CraftPanelRuntimeService; player: any } {
  const player = {
    playerId: 'player:enhancement-rule',
    instanceId: 'instance:enhancement-rule',
    inventory: {
      items: [
        { itemId: 'iron_sword', count: 1, level: 8, type: 'equipment', name: '背包铁剑', enhanceLevel: 0, itemInstanceId: 'inventory-iron-sword' },
      ],
      lockedItems: [],
      revision: 1,
      capacity: 20,
    },
    equipment: {
      slots: [
        {
          slot: 'weapon',
          item: {
            itemId: 'copper_hammer',
            count: 1,
            level: 1,
            type: 'equipment',
            name: '强化锤',
            tags: ['enhancement_hammer'],
            craftEffectStats: {},
          },
        },
        {
          slot: 'body',
          item: { itemId: 'iron_armor', count: 1, level: 8, type: 'equipment', name: '身上铁甲', enhanceLevel: 0 },
        },
      ],
      revision: 1,
    },
    wallet: {
      balances: [{ walletType: 'spirit_stone', balance: 100, frozenBalance: 0, version: 1 }],
    },
    enhancementSkill: {
      level: 4,
      exp: 0,
      expToNext: 100,
    },
    enhancementSkillLevel: 4,
    enhancementJob: null,
    enhancementRecords: [],
    alchemyPresets: [],
    dirtyDomains: new Set<string>(),
    persistentRevision: 1,
    selfRevision: 1,
  };
  const contentTemplateRepository = {
    getItemName(itemId: string) {
      return itemId;
    },
    normalizeItem(item: Record<string, unknown>) {
      if (item.itemId === 'template_light_sword') {
        return {
          ...item,
          type: 'equipment',
          level: 6,
          name: '模板轻量剑',
          equipSlot: 'weapon',
        };
      }
      return { ...item };
    },
  };
  const playerRuntimeService = {
    canAffordWallet() {
      return true;
    },
    debitWallet() {
      return true;
    },
    markPersistenceDirtyDomains(targetPlayer: any, domains: string[]) {
      if (!targetPlayer.dirtyDomains) {
        targetPlayer.dirtyDomains = new Set<string>();
      }
      for (const domain of domains ?? []) {
        targetPlayer.dirtyDomains.add(domain);
      }
    },
    bumpPersistentRevision(targetPlayer: any) {
      targetPlayer.persistentRevision = (targetPlayer.persistentRevision ?? 0) + 1;
      targetPlayer.selfRevision = (targetPlayer.selfRevision ?? 0) + 1;
    },
    playerProgressionService: {
      refreshPreview() {},
    },
    playerAttributesService: {
      recalculate() {},
    },
    rebuildActionState() {},
  };
  const service = new CraftPanelRuntimeService(
    contentTemplateRepository as any,
    playerRuntimeService as any,
    null as any,
    { buildAlchemyPanelPayload() { return {}; }, buildAlchemyPanelPatchPayload() { return {}; } } as any,
    new CraftPanelEnhancementQueryService(contentTemplateRepository as any),
  );
  service.enhancementConfigs = new Map();
  return { service, player };
}

function testEnhancementCandidatesExcludeEquippedItems(): void {
  const { service, player } = createRuntime();
  const candidates = service.collectEnhancementCandidates(player);
  assert.deepEqual(candidates.map((candidate: any) => candidate.ref), [
    { source: 'inventory', itemInstanceId: 'inventory-iron-sword' },
  ]);
}

function testLightweightInventoryEquipmentUsesTemplateForCandidatesAndStart(): void {
  const { service, player } = createRuntime();
  player.inventory.items = [
    { itemId: 'template_light_sword', count: 1, enhanceLevel: 0, itemInstanceId: 'light-sword-instance' },
  ];
  const candidates = service.collectEnhancementCandidates(player);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].item.itemId, 'template_light_sword');
  assert.equal(candidates[0].item.type, 'equipment');
  assert.equal(candidates[0].item.level, 6);
  assert.deepEqual(candidates[0].ref, { source: 'inventory', itemInstanceId: 'light-sword-instance' });

  const result = service.startEnhancement(player, { target: { source: 'inventory', itemInstanceId: 'light-sword-instance' } });
  assert.equal(result.ok, true);
  assert.equal(player.enhancementJob?.targetItemId, 'template_light_sword');
  assert.equal(player.enhancementJob?.targetItemLevel, 6);
  assert.equal(player.inventory.lockedItems.length, 1);
  assert.equal(player.inventory.lockedItems[0].itemInstanceId, 'light-sword-instance');
}

function testStartEnhancementRejectsEquippedItems(): void {
  const { service, player } = createRuntime();
  const result = service.startEnhancement(player, { target: { source: 'equipment', slot: 'body' } });
  assert.equal(result.ok, false);
  assert.match((result as unknown as { error?: string }).error ?? '', /身上装备不能直接强化/);
  assert.equal(player.equipment.slots.find((entry: any) => entry.slot === 'body')?.item?.itemId, 'iron_armor');
  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems.length, 0);
}

function testExistingEquippedEnhancementJobIsCancelled(): void {
  const { service, player } = createRuntime();
  player.inventory.items = [];
  player.inventory.lockedItems = [{
    itemId: 'iron_armor',
    count: 1,
    level: 8,
    type: 'equipment',
    name: '身上铁甲',
    enhanceLevel: 3,
    itemInstanceId: 'equipped-job-item',
    lockedBy: 'enhancement:job:equipped:1',
  }];
  player.equipment.slots = [
    { slot: 'weapon', item: player.equipment.slots[0].item },
    { slot: 'body', item: null },
  ];
  player.enhancementJob = {
    jobRunId: 'job:equipped:1',
    jobType: 'enhancement',
    target: { source: 'equipment', slot: 'body' },
    itemInstanceId: 'equipped-job-item',
    targetItemId: 'iron_armor',
    targetItemName: '身上铁甲',
    targetItemLevel: 8,
    currentLevel: 3,
    targetLevel: 4,
    desiredTargetLevel: 4,
    spiritStoneCost: 1,
    materials: [],
    protectionUsed: false,
    phase: 'enhancing',
    pausedTicks: 0,
    successRate: 1,
    totalTicks: 5,
    remainingTicks: 5,
    startedAt: 100,
    roleEnhancementLevel: 4,
    totalSpeedRate: 1,
    jobVersion: 2,
  };
  player.enhancementRecords = [{
    itemId: 'iron_armor',
    actionStartedAt: 100,
    startLevel: 3,
    initialTargetLevel: 4,
    desiredTargetLevel: 4,
    protectionStartLevel: null,
    status: 'in_progress',
    highestLevel: 3,
    levels: [],
  }];
  service.buildEnhancementPanelState(player);
  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems.length, 0);
  assert.equal(player.inventory.items.length, 1);
  assert.equal(player.inventory.items[0].itemId, 'iron_armor');
  assert.equal(player.inventory.items[0].enhanceLevel, 3);
  assert.equal(player.enhancementRecords[0].status, 'cancelled');
  assert.equal(player.dirtyDomains.has('active_job'), true);
  assert.equal(player.dirtyDomains.has('enhancement_record'), true);
  assert.equal(player.dirtyDomains.has('inventory'), true);
}

testEnhancementCandidatesExcludeEquippedItems();
testLightweightInventoryEquipmentUsesTemplateForCandidatesAndStart();
testStartEnhancementRejectsEquippedItems();
testExistingEquippedEnhancementJobIsCancelled();

console.log(JSON.stringify({ ok: true, case: 'enhancement-equipped-target-guard' }, null, 2));
