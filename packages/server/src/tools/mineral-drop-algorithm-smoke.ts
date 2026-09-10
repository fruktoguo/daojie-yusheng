import assert from 'node:assert/strict';

import {
  TileType,
  computeMiningDamageDropExpectedCount,
  getMiningAoeDropMultiplier,
  getMiningDamageDropMultiplier,
  getMiningMapLevelDropMultiplier,
  getMiningMapLevelLinearMultiplier,
  getMiningRealmGapDropMultiplier,
  resolveMiningExpectedDropRollPlan,
  rollMiningExpectedDropCount,
} from '@mud/shared';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { resolveMiningDropRollOptions, spawnTileDrops } from '../runtime/world/combat/tile-drop.helpers';

function assertClose(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) <= 1e-12, `${message}: actual=${actual} expected=${expected}`);
}

function withRandomSequence<T>(values: readonly number[], run: () => T): T {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => values[Math.min(index++, values.length - 1)] ?? 0;
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

function createSpiritOreInstance(mapLv: number): MapInstanceRuntime {
  return new MapInstanceRuntime({
    instanceId: `instance:mineral-drop:${mapLv}`,
    template: {
      id: `mineral_drop_${mapLv}`,
      name: '矿物爆率验证',
      width: 3,
      height: 3,
      terrainRows: ['.L.', '...', '...'],
      walkableMask: Uint8Array.from([1, 0, 1, 1, 1, 1, 1, 1, 1]),
      blocksSightMask: Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0]),
      portalIndexByTile: Int32Array.from({ length: 9 }, () => -1),
      safeZoneMask: Uint8Array.from({ length: 9 }, () => 0),
      baseAuraByTile: Int32Array.from({ length: 9 }, () => 0),
      baseTileResourceEntries: [],
      npcs: [],
      landmarks: [],
      containers: [],
      safeZones: [],
      portals: [],
      spawnX: 0,
      spawnY: 0,
      source: { mapLv },
    },
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: '矿物爆率验证',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: true,
  });
}

function testDamageBaselineIsLinear(): void {
  const maxHp = 10_000_000;
  assertClose(getMiningDamageDropMultiplier(5_000, maxHp), 0.5, '低于基准一半必须保留一半爆率');
  assertClose(getMiningDamageDropMultiplier(10_000, maxHp), 1, '最大生命 0.1% 必须为一倍');
  assertClose(getMiningDamageDropMultiplier(20_000, maxHp), Math.sqrt(2), '超过基准两倍伤害按平方根增长');
  assertClose(getMiningDamageDropMultiplier(1_000_000, maxHp), 10, '一击 10% 伤害超过基准 100 倍开根号后必须为 10 倍');
  assertClose(getMiningDamageDropMultiplier(20_000_000, maxHp), Math.sqrt(1_000), '过量伤害最多只能按矿脉最大生命开根号计算');

  const halfDamageExpected = computeMiningDamageDropExpectedCount({
    baseChanceBps: 20,
    appliedDamage: 5_000,
    maxHp,
    mineralLevel: 1,
    attackerRealmLevel: 1,
  });
  const fullDamageExpected = computeMiningDamageDropExpectedCount({
    baseChanceBps: 20,
    appliedDamage: 10_000,
    maxHp,
    mineralLevel: 1,
    attackerRealmLevel: 1,
  });
  assertClose(halfDamageExpected * 2, fullDamageExpected, '相同总伤害拆分前后的总期望必须一致');
}

function testMapLevelAndRealmGapMultipliers(): void {
  // 线性倍率分段平滑断言：旧线性增幅减少 10 倍，指数复利不变
  assert.equal(getMiningMapLevelLinearMultiplier(1), 1);
  assertClose(getMiningMapLevelLinearMultiplier(2), 1.1, '2级线性倍率必须为 1.1');
  assertClose(getMiningMapLevelLinearMultiplier(10), 1.9, '10级线性倍率必须为 1.9');
  assertClose(getMiningMapLevelLinearMultiplier(11), 2.1, '11级线性倍率必须为 2.1');
  assertClose(getMiningMapLevelLinearMultiplier(20), 3.9, '20级线性倍率必须为 3.9');
  assertClose(getMiningMapLevelLinearMultiplier(21), 4.2, '21级线性倍率必须为 4.2');
  assertClose(getMiningMapLevelLinearMultiplier(30), 6.9, '30级线性倍率必须为 6.9');
  assertClose(getMiningMapLevelLinearMultiplier(39), 10.5, '39级线性倍率必须为 10.5');

  // 地图等级矿物总倍率（指数 + 线性 - 1）
  assertClose(getMiningMapLevelDropMultiplier(1), 1, '一级矿物必须为一倍');
  assertClose(getMiningMapLevelDropMultiplier(10), (1.1 ** 9) + 1.9 - 1, '10级矿物必须为指数与降档线性相加叠加');
  assertClose(getMiningMapLevelDropMultiplier(11), (1.1 ** 10) + 2.1 - 1, '11级矿物必须为指数与降档线性相加叠加');
  assertClose(getMiningMapLevelDropMultiplier(20), (1.1 ** 19) + 3.9 - 1, '20级矿物必须为指数与降档线性相加叠加');

  assertClose(getMiningRealmGapDropMultiplier(12, 10), 0.8 ** 2, '高于矿物两级必须按 80% 复利');
  assertClose(getMiningRealmGapDropMultiplier(8, 10), 0.9 ** 2, '低于矿物两级必须按 90% 复利');
  assertClose(getMiningRealmGapDropMultiplier(10, 10), 1, '同级不得削减爆率');
}

function testCappedChanceQuantityConversion(): void {
  const twentyPercent = resolveMiningExpectedDropRollPlan(0.2);
  assertClose(twentyPercent.triggerChance, 0.1, '20% 期望必须转换为 10% 触发');
  assert.equal(twentyPercent.averageCountOnTrigger, 2);
  assert.equal(twentyPercent.maxCountOnTrigger, 3);

  const sixtyFivePercent = resolveMiningExpectedDropRollPlan(0.65);
  assertClose(sixtyFivePercent.triggerChance, 0.65 / 7, '65% 期望必须降低触发率以严格保持期望');
  assert.equal(sixtyFivePercent.averageCountOnTrigger, 7);
  assert.equal(sixtyFivePercent.maxCountOnTrigger, 13);

  assert.equal(rollMiningExpectedDropCount(0.2, (() => {
    const values = [0.05, 0];
    return () => values.shift() ?? 0;
  })()), 1);
  assert.equal(rollMiningExpectedDropCount(0.2, (() => {
    const values = [0.05, 0.999999];
    return () => values.shift() ?? 0;
  })()), 3);
}

function testMiningAoeDropMultiplier(): void {
  assert.equal(getMiningAoeDropMultiplier(undefined), 1);
  assert.equal(getMiningAoeDropMultiplier(1), 1);
  assertClose(getMiningAoeDropMultiplier(5), 1 / 1.4, '同时命中 5 个矿时单矿期望必须衰减到 1/1.4');

  let previousTotalMultiplier = getMiningAoeDropMultiplier(1);
  for (let hitCount = 2; hitCount <= 40; hitCount += 1) {
    const totalMultiplier = hitCount * getMiningAoeDropMultiplier(hitCount);
    assert.ok(totalMultiplier > previousTotalMultiplier, `总产出必须严格递增: hitCount=${hitCount}`);
    previousTotalMultiplier = totalMultiplier;
  }

  const singleExpected = computeMiningDamageDropExpectedCount({
    baseChanceBps: 10000,
    appliedDamage: 1_000,
    maxHp: 1_000_000,
    mineralLevel: 1,
    attackerRealmLevel: 1,
    aoeHitCount: 1,
  });
  const fiveExpected = computeMiningDamageDropExpectedCount({
    baseChanceBps: 10000,
    appliedDamage: 1_000,
    maxHp: 1_000_000,
    mineralLevel: 1,
    attackerRealmLevel: 1,
    aoeHitCount: 5,
  });
  assertClose(fiveExpected, singleExpected / 1.4, 'AOE 衰减只能作用于矿物受击期望数量');
}

function testPlayerOtherMultiplierComposition(): void {
  const options = resolveMiningDropRollOptions({
    realm: { realmLv: 10 },
    luck: 5,
    miningSkill: { level: 7 },
    attrs: { craftEffectStats: { mining: { outputRate: 0.15 } } },
  });
  assert.equal(options.miningAttackerRealmLevel, 10);
  assertClose(options.miningOtherDropMultiplier, (1 + 0.07 + 0.05) * 1.15, '挖矿等级、幸运和产出率必须组成独立其他乘区');
}

function testRuntimeMineralRollAndFixedDestroyDrop(): void {
  const instance = createSpiritOreInstance(1);
  const tileState = instance.getTileCombatState(1, 0);
  assert.ok(tileState);
  assert.equal(tileState.maxHp, 1_000_000);

  const damageDrops = withRandomSequence([0.05, 0.999999], () => instance.rollTileDrops(tileState, 1_000, false, {
    miningAttackerRealmLevel: 1,
    miningOtherDropMultiplier: 100,
  }));
  assert.deepEqual(damageDrops, [{ itemId: 'spirit_stone', count: 3, reason: 'damage' }]);

  const destroyDrops = withRandomSequence([0.99], () => instance.rollTileDrops(tileState, tileState.maxHp, true, {
    miningAttackerRealmLevel: 1,
    miningOtherDropMultiplier: 1,
  }));
  assert.deepEqual(destroyDrops, [{ itemId: 'spirit_stone', count: 1, reason: 'destroy' }]);


  const cloudDrops = withRandomSequence([0.01], () => instance.rollTileDrops({
    tileType: TileType.Cloud,
    hp: 3_000,
    maxHp: 3_000,
  }, 100, false, {
    miningAttackerRealmLevel: 1,
    miningOtherDropMultiplier: 0,
    miningAoeHitCount: 50,
  }));
  assert.deepEqual(cloudDrops, [{ itemId: 'cloud_puff', count: 1, reason: 'damage' }], '非矿地块不得受矿物 AOE 衰减或矿物其他乘区影响');
}

function testSpawnUsesResolvedCountWithoutSecondOutputScaling(): void {
  let receivedCount = 0;
  spawnTileDrops({
    playerId: 'player:mineral-drop',
    tileDrops: [{ itemId: 'spirit_stone', count: 3, reason: 'damage' }],
    deps: {
      contentTemplateRepository: {
        createItem(itemId: string, count: number) {
          return { itemId, count, name: '灵石' };
        },
      },
      playerRuntimeService: {
        getPlayer() {
          return { attrs: { craftEffectStats: { mining: { outputRate: 10 } } } };
        },
        receiveInventoryItem(_playerId: string, item: unknown) {
          if (item && typeof item === 'object' && 'count' in item) {
            receivedCount = Math.max(0, Math.trunc(Number(item.count) || 0));
          }
        },
      },
      queuePlayerNotice() { },
    },
  });
  assert.equal(receivedCount, 3, '矿物数量已在爆率期望中结算，入包时不得重复应用 outputRate');
}

function main(): void {
  testDamageBaselineIsLinear();
  testMapLevelAndRealmGapMultipliers();
  testCappedChanceQuantityConversion();
  testMiningAoeDropMultiplier();
  testPlayerOtherMultiplierComposition();
  testRuntimeMineralRollAndFixedDestroyDrop();
  testSpawnUsesResolvedCountWithoutSecondOutputScaling();
  console.log(JSON.stringify({ ok: true, case: 'mineral-drop-algorithm' }));
}

main();
