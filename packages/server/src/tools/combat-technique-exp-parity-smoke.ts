import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { getMonsterKillExpLevelAdjustment, getMonsterLevelExpDecayMultiplier } from '@mud/shared';
import { PlayerProgressionService } from '../runtime/player/player-progression.service';

function createService(): PlayerProgressionService {
  const service = new PlayerProgressionService(
    {
      getItemName(itemId: string) {
        return itemId;
      },
    } as never,
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

function main(): void {
  const service = createService();
  const realmExp = service.getRealmCombatExp(12, 10, 'normal', 1.5, 0.75);
  const techniqueExp = service.getTechniqueCombatExp(12, 10, 'normal', 1.5, 0.75);
  assert.equal(techniqueExp, realmExp);

  const tiers = ['mortal_blood', 'variant', 'demon_king'] as const;
  for (let monsterLevel = 1; monsterLevel <= 127; monsterLevel += 1) {
    const expToNext = service.getRealmRuntimeExpToNext(monsterLevel);
    for (let playerRealmLv = 1; playerRealmLv <= 127; playerRealmLv += 1) {
      for (const tier of tiers) {
        const expected = expToNext <= 0
          ? 0
          : expToNext
            * 1.5
            * getMonsterKillExpLevelAdjustment(playerRealmLv, monsterLevel, tier)
            * getMonsterLevelExpDecayMultiplier(monsterLevel)
            * 0.75
            / 1000;
        assert.equal(
          service.getRealmCombatExp(monsterLevel, playerRealmLv, tier, 1.5, 0.75),
          expected,
          `击杀经验缓存不得改变 ${monsterLevel}/${playerRealmLv}/${tier} 的公式结果`,
        );
      }
    }
  }

  const cacheState = service as unknown as {
    realmCombatExpToNextByMonsterLevel: Array<number | undefined>;
    monsterLevelExpDecayByMonsterLevel: Array<number | undefined>;
    monsterKillOverlevelExpAdjustmentByDelta: Float64Array;
    monsterKillUnderlevelExpAdjustmentByTierAndDelta: Float64Array[];
  };
  assert.equal(cacheState.realmCombatExpToNextByMonsterLevel[12], service.getRealmRuntimeExpToNext(12));
  assert.equal(cacheState.monsterLevelExpDecayByMonsterLevel[12], getMonsterLevelExpDecayMultiplier(12));
  assert.equal(cacheState.monsterKillOverlevelExpAdjustmentByDelta[8], getMonsterKillExpLevelAdjustment(20, 12, 'mortal_blood'));
  assert.equal(cacheState.monsterKillUnderlevelExpAdjustmentByTierAndDelta[2][10], getMonsterKillExpLevelAdjustment(1, 12, 'demon_king'));

  service.loadRealmLevels();
  assert.equal(cacheState.realmCombatExpToNextByMonsterLevel[12], undefined, '境界配置重载后必须清空配置查表缓存');
  assert.equal(cacheState.monsterLevelExpDecayByMonsterLevel[12], getMonsterLevelExpDecayMultiplier(12), '静态衰减缓存不依赖境界配置');
  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'combat-technique-exp-parity',
        realmExp,
        techniqueExp,
      },
      null,
      2,
    ),
  );
}

main();
