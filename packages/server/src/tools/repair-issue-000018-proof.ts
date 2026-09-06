import assert from 'node:assert/strict';

import { TileType } from '@mud/shared';
import { applyMiningExpForTileDamage } from '../runtime/world/combat/tile-drop.helpers';

function main(): void {
  const attacker = {
    playerId: 'player:mining-map-level-proof',
    realm: { realmLv: 50, progress: 0 },
    miningSkill: { level: 50, exp: 0, expToNext: 10_000 },
  };
  const dirtyDomains = new Set<string>();
  const receivedItems: Array<Record<string, unknown>> = [];
  const contentTemplateRepository = {
    listTechniqueTemplates() {
      return [
        { id: 'passive_craft_mortal_mortal_mining', name: '凡阶挖矿功法', grade: 'mortal' },
        { id: 'passive_craft_qi_yellow_mining', name: '黄阶挖矿功法', grade: 'yellow' },
        { id: 'passive_craft_foundation_mystic_mining', name: '玄阶挖矿功法', grade: 'mystic' },
      ].map((template) => ({
        ...template,
        skills: [{
          active: false,
          passiveEffects: [{ craftEffectStats: { mining: { speedRate: 0.1 } } }],
        }],
      }));
    },
    createItem(itemId: string, count = 1) {
      return { itemId, count };
    },
    normalizeItem(item: Record<string, unknown>) {
      return item;
    },
  };
  const playerRuntimeService = {
    contentTemplateRepository,
    receiveInventoryItem(_playerId: string, item: Record<string, unknown>) {
      receivedItems.push(item);
    },
    playerProgressionService: {
      getRealmRuntimeExpToNext(level: number) {
        return level === 31 ? 3_600_000 : 0;
      },
      grantCraftRealmExp(player: typeof attacker, amount: number) {
        const gain = Math.max(0, Math.round(Number(amount) || 0));
        player.realm.progress += gain;
        return {
          changed: gain > 0,
          notices: [],
          actionsDirty: false,
          dirtyDomains: gain > 0 ? ['progression'] : [],
        };
      },
    },
    applyProgressionResult(
      _player: typeof attacker,
      result: { changed: boolean; dirtyDomains: string[] },
    ) {
      if (result.changed) {
        for (const domain of result.dirtyDomains) dirtyDomains.add(domain);
      }
    },
  };

  const originalRandom = Math.random;
  Math.random = () => 0;
  let result: { gained: number; changed: boolean };
  try {
    result = applyMiningExpForTileDamage({
      attacker,
      tileType: TileType.BlackIronOre,
      mapLevel: 31,
      appliedDamage: 1,
      playerRuntimeService,
    });
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(result.gained, 64);
  assert.equal(attacker.miningSkill.exp, result.gained);
  assert.equal(attacker.realm.progress, Math.round(result.gained / 2));
  assert.equal(dirtyDomains.has('progression'), true);
  assert.deepEqual(receivedItems.map((item) => item.itemId), ['book.passive_craft_foundation_mystic_mining']);

  const realmProgress = attacker.realm.progress;
  assert.deepEqual(applyMiningExpForTileDamage({
    attacker,
    tileType: TileType.Wall,
    mapLevel: 31,
    appliedDamage: 100,
    playerRuntimeService,
  }), { gained: 0, changed: false });
  assert.equal(attacker.realm.progress, realmProgress);

  console.log('REPAIR_PROOF:ISSUE-000018:PASS');
}

main();
