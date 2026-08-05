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
  verifyInventoryOnlyStatisticSkipsTechniqueTraversal();

  console.log(JSON.stringify({
    ok: true,
    cases: [
      'merge_lookup_matches_signature_semantics',
      'ordinary_item_matches_full_diff',
      'wallet_item_matches_full_diff',
      'same_item_different_instance_state_matches_full_diff',
      'inventory_only_path_skips_technique_traversal',
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
