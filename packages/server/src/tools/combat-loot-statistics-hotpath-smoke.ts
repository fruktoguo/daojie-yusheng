import assert from 'node:assert/strict';

import {
  ITEM_INSTANCE_PAYLOAD_KEYS,
  createItemStackSignature,
  findMergeableItemStackIndex,
  mergeItemStackInto,
} from '@mud/shared';

import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

interface SmokeItem {
  itemId: string;
  name?: string;
  count: number;
  enhanceLevel?: number;
  itemInstanceId?: string;
}

async function main(): Promise<void> {
  verifyMergeLookupMatchesSignatureSemantics();
  verifyInventoryOnlyStatisticMatchesFullDiff({ itemId: 'material.iron', name: '玄铁', count: 3 });
  verifyInventoryOnlyStatisticMatchesFullDiff({ itemId: 'spirit_stone', name: '灵石', count: 7 });
  verifyInventoryOnlyStatisticMatchesFullDiff({
    itemId: 'equipment.sword',
    name: '试炼剑',
    count: 1,
    enhanceLevel: 2,
    itemInstanceId: '00000000-0000-4000-8000-000000000002',
  });
  verifyInventoryOnlyStatisticHintUsesCappedReceiptCount();
  verifyInventoryOnlyStatisticSkipsTechniqueTraversal();
  verifyInventoryOnlyStatisticHintSkipsInventoryTraversal();
  verifyProgressionOnlyStatisticHintMatchesFullDiff();
  verifyProgressionOnlyStatisticHintSkipsTechniqueTraversal();
  verifyProgressionOnlyStatisticHintFallsBackForTechniqueSetChanges();

  console.log(JSON.stringify({
    ok: true,
    cases: [
      'merge_lookup_matches_signature_semantics',
      'ordinary_item_matches_full_diff',
      'wallet_item_matches_full_diff',
      'same_item_different_instance_state_matches_full_diff',
      'inventory_hint_uses_capped_receipt_count',
      'inventory_only_path_skips_technique_traversal',
      'inventory_hint_skips_inventory_traversal',
      'progression_hint_matches_full_diff',
      'progression_hint_skips_technique_traversal',
      'progression_hint_falls_back_for_technique_set_changes',
    ],
  }, null, 2));
}

function verifyMergeLookupMatchesSignatureSemantics(): void {
  const payloadValues: unknown[] = [
    undefined,
    null,
    0,
    -0,
    1,
    1.9,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '',
    '0',
    '1',
    'mortal',
    false,
    true,
    { value: 1 },
    [1, 2],
    () => 1,
    Symbol('payload'),
  ];
  for (const key of ITEM_INSTANCE_PAYLOAD_KEYS) {
    for (const leftValue of payloadValues) {
      for (const rightValue of payloadValues) {
        const left = { itemId: 'signature-proof', [key]: leftValue };
        const right = { itemId: 'signature-proof', [key]: rightValue };
        const expected = createItemStackSignature(left) === createItemStackSignature(right);
        const actual = findMergeableItemStackIndex([left], right) === 0;
        assert.equal(actual, expected, `direct merge lookup must match signature key=${key}`);
      }
    }
  }
  assert.equal(findMergeableItemStackIndex([{ itemId: 'signature-proof' }], { itemId: 'other' }), -1);
  assert.equal(findMergeableItemStackIndex(
    [{ itemId: 'book.custom_technique', learnTechniqueId: '' }],
    { itemId: 'book.custom_technique', learnTechniqueId: '' },
  ), -1);
}

function verifyInventoryOnlyStatisticMatchesFullDiff(item: SmokeItem): void {
  const fastService = createService();
  const referenceService = createService();
  const fastPlayer = createPlayer('player:combat-loot-fast');
  const referencePlayer = structuredClone(fastPlayer);
  referencePlayer.playerId = 'player:combat-loot-reference';
  referencePlayer.sessionId = 'session:combat-loot-reference';
  referencePlayer.dirtyDomains = new Set<string>();
  fastService.players.set(fastPlayer.playerId, fastPlayer);
  referenceService.players.set(referencePlayer.playerId, referencePlayer);

  fastService.captureOfflineGainBeforeTick(fastPlayer);
  const referenceBefore = referenceService.captureOfflineGainBeforeTick(referencePlayer);
  fastService.receiveInventoryItem(fastPlayer.playerId, item, { inventoryOnlyStatistics: true });

  mergeItemStackInto(referencePlayer.inventory.items, { ...item });
  referenceService.recordAssetStatisticMutation(referencePlayer, referenceBefore, Date.now());

  assert.deepEqual(
    projectStatisticParts(fastService.getPendingPlayerStatisticRecords(fastPlayer.playerId)[0]),
    projectStatisticParts(referenceService.getPendingPlayerStatisticRecords(referencePlayer.playerId)[0]),
  );
  assert.deepEqual(
    projectSnapshot(fastService.playerStatisticSnapshotsByPlayerId.get(fastPlayer.playerId)),
    projectSnapshot(referenceService.playerStatisticSnapshotsByPlayerId.get(referencePlayer.playerId)),
  );
}

function verifyInventoryOnlyStatisticHintUsesCappedReceiptCount(): void {
  const service = createService();
  const player = createPlayer('player:combat-loot-cap');
  service.players.set(player.playerId, player);
  const maxItemCount = 2_147_483_647;
  player.inventory.items[0].count = maxItemCount - 2;
  service.captureOfflineGainBeforeTick(player);

  const received = service.tryReceiveInventoryItem(
    player.playerId,
    { itemId: 'spirit_stone', name: '灵石', count: 5 },
    { inventoryOnlyStatistics: true },
  );

  assert.equal(received, true);
  assert.equal(player.inventory.items[0].count, maxItemCount);
  assert.equal(service.getPlayerStatisticTotalsSync(player.playerId)?.today.spiritStones.gained, 2);
}

function verifyInventoryOnlyStatisticSkipsTechniqueTraversal(): void {
  const service = createService();
  const player = createPlayer('player:combat-loot-no-technique-scan');
  service.players.set(player.playerId, player);
  service.captureOfflineGainBeforeTick(player);
  player.techniques.techniques = new Proxy(player.techniques.techniques, {
    get(target, property, receiver) {
      if (property === Symbol.iterator || property === 'map') {
        throw new Error('inventory_only_statistics_traversed_techniques');
      }
      return Reflect.get(target, property, receiver);
    },
  });

  service.receiveInventoryItem(
    player.playerId,
    { itemId: 'material.iron', name: '玄铁', count: 1 },
    { inventoryOnlyStatistics: true },
  );
  assert.equal(service.getPendingPlayerStatisticRecords(player.playerId).length, 1);
}

function verifyInventoryOnlyStatisticHintSkipsInventoryTraversal(): void {
  const service = createService();
  const player = createPlayer('player:combat-loot-no-inventory-scan');
  service.players.set(player.playerId, player);
  const before = service.captureOfflineGainBeforeTick(player);
  const spiritStones = player.inventory.items[0];
  spiritStones.count += 5;
  player.inventory.items = new Proxy(player.inventory.items, {
    get(target, property, receiver) {
      if (property === Symbol.iterator || property === 'map' || property === 'forEach') {
        throw new Error('inventory_hint_traversed_inventory');
      }
      return Reflect.get(target, property, receiver);
    },
  });

  service.recordPlayerStatisticMutation(player, before, Date.now(), {
    inventoryOnly: true,
    inventoryItemDeltaHint: {
      itemId: spiritStones.itemId,
      name: spiritStones.name,
      countDelta: 5,
    },
  });

  assert.equal(service.getPlayerStatisticTotalsSync(player.playerId)?.today.spiritStones.gained, 5);
}

function verifyProgressionOnlyStatisticHintMatchesFullDiff(): void {
  const fastService = createService();
  const referenceService = createService();
  const fastPlayer = createPlayer('player:combat-progress-fast');
  const referencePlayer = structuredClone(fastPlayer);
  referencePlayer.playerId = 'player:combat-progress-reference';
  referencePlayer.sessionId = 'session:combat-progress-reference';
  referencePlayer.dirtyDomains = new Set<string>();
  fastService.players.set(fastPlayer.playerId, fastPlayer);
  referenceService.players.set(referencePlayer.playerId, referencePlayer);

  const fastBefore = fastService.captureOfflineGainBeforeTick(fastPlayer);
  const referenceBefore = referenceService.captureOfflineGainBeforeTick(referencePlayer);
  const changedTechniqueId = fastPlayer.techniques.techniques[137].techId;
  fastPlayer.techniques.techniques[137].exp += 17;
  referencePlayer.techniques.techniques[137].exp += 17;

  fastService.recordPlayerStatisticMutation(fastPlayer, fastBefore, Date.now(), {
    progressionOnly: true,
    statisticTechniqueChangedIds: [changedTechniqueId],
  });
  referenceService.recordPlayerStatisticMutation(referencePlayer, referenceBefore, Date.now(), {
    progressionOnly: true,
  });

  assert.deepEqual(
    fastService.getPlayerStatisticTotalsSync(fastPlayer.playerId)?.today,
    referenceService.getPlayerStatisticTotalsSync(referencePlayer.playerId)?.today,
  );
  assert.deepEqual(
    projectSnapshot(fastService.playerStatisticSnapshotsByPlayerId.get(fastPlayer.playerId)),
    projectSnapshot(referenceService.playerStatisticSnapshotsByPlayerId.get(referencePlayer.playerId)),
  );
}

function verifyProgressionOnlyStatisticHintSkipsTechniqueTraversal(): void {
  const service = createService();
  const player = createPlayer('player:combat-progress-no-scan');
  service.players.set(player.playerId, player);
  const before = service.captureOfflineGainBeforeTick(player);
  const changedTechnique = player.techniques.techniques[17];
  changedTechnique.exp += 9;
  const originalTechniques = player.techniques.techniques;
  player.techniques.techniques = new Proxy(originalTechniques, {
    get(target, property, receiver) {
      if (property === Symbol.iterator || property === 'map' || property === 'forEach') {
        throw new Error('progression_hint_traversed_techniques');
      }
      return Reflect.get(target, property, receiver);
    },
  });

  service.accumulateOfflineGainAfterTick(player, before, true, {
    progressionOnly: true,
    statisticTechniqueChangedIds: [changedTechnique.techId],
  });
  assert.equal(service.getPlayerStatisticTotalsSync(player.playerId)?.today.techniques.gained, 9);
}

function verifyProgressionOnlyStatisticHintFallsBackForTechniqueSetChanges(): void {
  const service = createService();
  const player = createPlayer('player:combat-progress-fallback');
  service.players.set(player.playerId, player);
  const before = service.captureOfflineGainBeforeTick(player);
  player.techniques.techniques.push({
    techId: 'technique:new',
    name: '新增功法',
    level: 1,
    exp: 3,
    expToNext: 1_000,
    layers: [{ level: 1, expToNext: 1_000 }],
  });

  service.recordPlayerStatisticMutation(player, before, Date.now(), {
    progressionOnly: true,
    statisticTechniqueChangedIds: ['technique:0'],
  });
  assert.equal(service.getPlayerStatisticTotalsSync(player.playerId)?.today.techniques.gained, 3);
  assert.equal(
    service.playerStatisticSnapshotsByPlayerId.get(player.playerId)?.techniques.some(
      (entry: any) => entry.techniqueId === 'technique:new',
    ),
    true,
  );
}

function createService(): PlayerRuntimeService {
  const contentTemplateRepository = {
    normalizeItem(item: SmokeItem): SmokeItem {
      return { ...item, count: Math.max(1, Math.trunc(Number(item.count) || 1)) };
    },
    getItemName(itemId: string): string {
      return itemId === 'spirit_stone' ? '灵石' : itemId;
    },
  };
  return new PlayerRuntimeService(
    contentTemplateRepository,
    {},
    { recalculate() {} },
    { refreshPreview() {} },
  );
}

function createPlayer(playerId: string): Record<string, any> {
  return {
    playerId,
    sessionId: `session:${playerId}`,
    realm: { realmLv: 19, progress: 10, progressToNext: 100 },
    foundation: 20,
    rootFoundation: 30,
    combatExp: 40,
    bodyTraining: { level: 2, exp: 5, expToNext: 50 },
    inventory: {
      revision: 1,
      capacity: 200,
      items: [
        { itemId: 'spirit_stone', name: '灵石', count: 11 },
        {
          itemId: 'equipment.sword',
          name: '试炼剑',
          count: 1,
          enhanceLevel: 1,
          itemInstanceId: '00000000-0000-4000-8000-000000000001',
        },
      ],
      lockedItems: [{ itemId: 'material.locked', name: '锁定材料', count: 2 }],
    },
    wallet: { balances: [{ walletType: 'spirit_stone', balance: 11, frozenBalance: 0, version: 1 }] },
    techniques: {
      techniques: Array.from({ length: 200 }, (_, index) => ({
        techId: `technique:${index}`,
        name: `功法${index}`,
        level: 1,
        exp: index,
        expToNext: 1_000,
        layers: [{ level: 1, expToNext: 1_000 }],
      })),
    },
    alchemySkill: { level: 1, exp: 1, expToNext: 100 },
    forgingSkill: { level: 1, exp: 2, expToNext: 100 },
    buildingSkill: { level: 1, exp: 3, expToNext: 100 },
    gatherSkill: { level: 1, exp: 4, expToNext: 100 },
    enhancementSkill: { level: 1, exp: 5, expToNext: 100 },
    miningSkill: { level: 1, exp: 6, expToNext: 100 },
    dirtyDomains: new Set<string>(),
    persistentRevision: 1,
    selfRevision: 1,
  };
}

function projectStatisticParts(record: Record<string, any> | undefined): Record<string, unknown> {
  assert.ok(record);
  return {
    source: record.source,
    spiritStones: record.spiritStones,
    items: record.items,
    progress: record.progress,
    techniques: record.techniques,
    professions: record.professions,
  };
}

function projectSnapshot(snapshot: Record<string, any> | undefined): Record<string, unknown> {
  assert.ok(snapshot);
  return {
    inventoryItems: snapshot.inventoryItems,
    realm: snapshot.realm,
    foundation: snapshot.foundation,
    rootFoundation: snapshot.rootFoundation,
    combatExp: snapshot.combatExp,
    bodyTraining: snapshot.bodyTraining,
    techniques: snapshot.techniques,
    professions: snapshot.professions,
  };
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
