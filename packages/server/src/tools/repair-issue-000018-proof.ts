import assert from 'node:assert/strict';

import { TileType } from '@mud/shared';
import { applyMiningExpForTileDamage } from '../runtime/world/combat/tile-drop.helpers';

function main(): void {
  const attacker = {
    realm: { realmLv: 20, progress: 0 },
    miningSkill: { level: 20, exp: 0, expToNext: 10_000 },
  };
  const dirtyDomains = new Set<string>();
  const playerRuntimeService = {
    resolveCraftSkillExpToNextByLevel() {
      return 10_000;
    },
    playerProgressionService: {
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

  const result = applyMiningExpForTileDamage({
    attacker,
    tileType: TileType.BlackIronOre,
    appliedDamage: 1,
    playerRuntimeService,
  });

  assert.ok(result.gained > 0);
  assert.equal(attacker.miningSkill.exp, result.gained);
  assert.equal(attacker.realm.progress, Math.round(result.gained / 2));
  assert.equal(dirtyDomains.has('progression'), true);

  const realmProgress = attacker.realm.progress;
  assert.deepEqual(applyMiningExpForTileDamage({
    attacker,
    tileType: TileType.Wall,
    appliedDamage: 100,
    playerRuntimeService,
  }), { gained: 0, changed: false });
  assert.equal(attacker.realm.progress, realmProgress);

  console.log('REPAIR_PROOF:ISSUE-000018:PASS');
}

main();
