import assert from 'node:assert/strict';
import {
  computeAdjustedCraftTicks,
  computeBatchesPerTick,
  computeCraftDurationFactor,
  computeRawCraftTicks,
  computeTotalCraftTicks,
  resolveStochasticBatchesPerTick,
  resolveStochasticCraftTicks,
  computeAlchemyRawBrewTicks,
  computeAlchemyAdjustedBrewTicks,
  computeAlchemySpeedRate,
} from '../packages/shared/dist/index.js';

console.log('--- 1. 验证 computeRawCraftTicks 理论浮点耗时 ---');
{
  const baseTicks = 10;
  // 58 级制作 1 级配方：速度 +114% (speedRate = 1.14)
  const speed58 = computeAlchemySpeedRate(1, 58);
  assert.ok(Math.abs(speed58 - 1.14) < 1e-6, `expected 1.14, got ${speed58}`);
  const raw58 = computeRawCraftTicks(baseTicks, speed58);
  assert.ok(Math.abs(raw58 - (10 / 2.14)) < 1e-6, `expected ~4.672897, got ${raw58}`);

  // 70 级制作 1 级配方：速度 +138% (speedRate = 1.38)
  const speed70 = computeAlchemySpeedRate(1, 70);
  assert.ok(Math.abs(speed70 - 1.38) < 1e-6, `expected 1.38, got ${speed70}`);
  const raw70 = computeRawCraftTicks(baseTicks, speed70);
  assert.ok(Math.abs(raw70 - (10 / 2.38)) < 1e-6, `expected ~4.20168, got ${raw70}`);

  console.log(`  58级理论耗时: ${raw58.toFixed(3)}息, 70级理论耗时: ${raw70.toFixed(3)}息`);
}

console.log('--- 2. 验证 resolveStochasticCraftTicks 概率舍入判定 ---');
{
  // rawTicks = 4.2: 80% 概率为 4 (少一息), 20% 概率为 5
  assert.equal(resolveStochasticCraftTicks(4.2, 0.1), 5); // roll < 0.2 -> 5
  assert.equal(resolveStochasticCraftTicks(4.2, 0.199), 5); // roll < 0.2 -> 5
  assert.equal(resolveStochasticCraftTicks(4.2, 0.2), 4); // roll >= 0.2 -> 4 (少了一息)
  assert.equal(resolveStochasticCraftTicks(4.2, 0.9), 4); // roll >= 0.2 -> 4 (少了一息)

  // rawTicks = 4.0: 必定为 4
  assert.equal(resolveStochasticCraftTicks(4.0, 0.1), 4);
  assert.equal(resolveStochasticCraftTicks(4.0, 0.9), 4);

  // rawTicks = 0.5 (小于1息): 保底为 1 息
  assert.equal(resolveStochasticCraftTicks(0.5, 0.1), 1);
  assert.equal(resolveStochasticCraftTicks(0.5, 0.9), 1);

  // 大样本期望值收敛检验
  const N = 10000;
  let sum58 = 0;
  let sum70 = 0;
  const raw58 = 10 / 2.14; // ~4.673
  const raw70 = 10 / 2.38; // ~4.202
  for (let i = 0; i < N; i++) {
    sum58 += resolveStochasticCraftTicks(raw58);
    sum70 += resolveStochasticCraftTicks(raw70);
  }
  const avg58 = sum58 / N;
  const avg70 = sum70 / N;
  console.log(`  58级大样本实测均值: ${avg58.toFixed(3)} (理论 ${raw58.toFixed(3)})`);
  console.log(`  70级大样本实测均值: ${avg70.toFixed(3)} (理论 ${raw70.toFixed(3)})`);
  assert.ok(Math.abs(avg58 - raw58) < 0.05, '58级大样本均值收敛');
  assert.ok(Math.abs(avg70 - raw70) < 0.05, '70级大样本均值收敛');
  assert.ok(avg70 < avg58, '70级耗时真实降低');
}

console.log('--- 3. 验证小于1息时的批量生产机制 (resolveStochasticBatchesPerTick) ---');
{
  // rawTicks = 0.4: 每息 2.5 批 (50% 概率额外完成 1 批，共 3 批；50% 概率 2 批)
  assert.equal(computeBatchesPerTick(0.4), 2.5);
  assert.equal(resolveStochasticBatchesPerTick(0.4, 0.4), 3); // roll < 0.5 -> 3 批 (额外完成)
  assert.equal(resolveStochasticBatchesPerTick(0.4, 0.6), 2); // roll >= 0.5 -> 2 批

  // rawTicks = 0.25: 每息 4.0 批
  assert.equal(computeBatchesPerTick(0.25), 4.0);
  assert.equal(resolveStochasticBatchesPerTick(0.25, 0.1), 4);
  assert.equal(resolveStochasticBatchesPerTick(0.25, 0.9), 4);

  // rawTicks >= 1: 返回 1 批
  assert.equal(resolveStochasticBatchesPerTick(1.0), 1);
  assert.equal(resolveStochasticBatchesPerTick(2.5), 1);

  // 大样本批量生产收敛检验
  const N = 10000;
  let batchSum = 0;
  for (let i = 0; i < N; i++) {
    batchSum += resolveStochasticBatchesPerTick(0.4);
  }
  const avgBatches = batchSum / N;
  console.log(`  rawTicks=0.4 大样本每息生产批数: ${avgBatches.toFixed(3)} (理论 2.500)`);
  assert.ok(Math.abs(avgBatches - 2.5) < 0.05, '批量生产大样本均值收敛');
}

console.log('--- 4. 验证 computeTotalCraftTicks 总耗时折算 ---');
{
  // 批量生产：rawTicks = 0.4 (每息 2.5 批), quantity = 10 -> 10 * 0.4 = 4 息
  const totalTicks = computeTotalCraftTicks(0.4, 10, 0);
  assert.equal(totalTicks, 4);

  // 批量生产：rawTicks = 0.35, quantity = 5 -> ceil(5 * 0.35 = 1.75) = 2 息
  const totalTicks2 = computeTotalCraftTicks(0.35, 5, 0);
  assert.equal(totalTicks2, 2);
  console.log('  总耗时折算校验通过');
}

console.log('所有技艺耗时概率舍入与批量生产机制测试全部 PASS！');
