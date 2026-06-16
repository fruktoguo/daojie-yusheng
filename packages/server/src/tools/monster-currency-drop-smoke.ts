import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';

function main(): void {
  const repository = new ContentTemplateRepository();
  repository.onModuleInit();

  assertApproxEqual(repository.computeMeritDropChance('mortal_blood'), repository.computeSpiritStoneDropChance('mortal_blood') / 10);
  assertApproxEqual(repository.computeMeritDropChance('variant'), repository.computeSpiritStoneDropChance('variant') / 10);
  assertApproxEqual(repository.computeMeritDropChance('demon_king'), repository.computeSpiritStoneDropChance('demon_king') / 10);
  assertApproxEqual(repository.computeMeritDropChance('mortal_blood'), 0.001);
  assertApproxEqual(repository.computeMeritDropChance('variant'), 0.003);
  assertApproxEqual(repository.computeMeritDropChance('demon_king'), 0.01);

  const monsterIds = Array.from(repository.monsterRuntimeTemplates.keys());
  assert.ok(monsterIds.length > 0);
  for (const monsterId of monsterIds) {
    const drops = repository.monsterDropsByMonsterId.get(monsterId) ?? [];
    const meritDrop = drops.find((drop) => drop.itemId === 'merit');
    assert.ok(meritDrop, `missing merit drop for ${monsterId}`);
    assert.equal(meritDrop.count, 1, `unexpected merit count for ${monsterId}`);
    assert.equal(typeof meritDrop.chance, 'number', `missing merit chance for ${monsterId}`);
  }

  const tongtianShadowDrops = repository.monsterDropsByMonsterId.get('m_tongtian_shadow') ?? [];
  assert.equal(tongtianShadowDrops.some((drop) => drop.itemId === 'spirit_stone'), false);
  assert.ok(tongtianShadowDrops.some((drop) => drop.itemId === 'merit'));
  assert.equal(repository.getOrdinaryMonsterCurrencyDropMultiplier(
    { itemId: 'merit' } as never,
    { monsterTier: 'mortal_blood', monsterLevel: 3, playerRealmLv: 4 } as never,
  ), 0.7);

  console.log(JSON.stringify({
    ok: true,
    case: 'monster-currency-drop',
    monsterCount: monsterIds.length,
    meritChance: {
      mortal_blood: roundChance(repository.computeMeritDropChance('mortal_blood')),
      variant: roundChance(repository.computeMeritDropChance('variant')),
      demon_king: roundChance(repository.computeMeritDropChance('demon_king')),
    },
    answers: '所有已加载怪物都会获得自动功德掉落；功德基础概率为同层次灵石基础概率的 1/10；通天塔只禁自动灵石，不禁自动功德；普通怪越级货币衰减同时作用于功德。',
    excludes: '不证明随机数分布收敛、地面拾取、背包持久化或客户端完整面板渲染。',
  }, null, 2));
}

function assertApproxEqual(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) <= 1e-12, `expected ${actual} ~= ${expected}`);
}

function roundChance(chance: number): number {
  return Number(chance.toFixed(12));
}

main();
