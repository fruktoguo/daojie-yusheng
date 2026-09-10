#!/usr/bin/env node
/**
 * 验证冷却速度按技能原始冷却对抗折算，防止退回固定分母或百分比乘区。
 */
const assert = require('node:assert/strict');
const { resolveCooldownTicks } = require('../dist/numeric.js');

const lowBaseCooldown = 5;
const highBaseCooldown = 30;
const cooldownSpeed = 100;
const lowCooldownReductionRate = cooldownSpeed / (cooldownSpeed + lowBaseCooldown + 100);
const highCooldownReductionRate = cooldownSpeed / (cooldownSpeed + highBaseCooldown + 100);
const lowActualCooldown = resolveCooldownTicks(lowBaseCooldown, cooldownSpeed);
const highActualCooldown = resolveCooldownTicks(highBaseCooldown, cooldownSpeed);

assert.equal(lowActualCooldown, 3, '5 息技能在 100 冷却速度下应缩短为 3 息');
assert.equal(highActualCooldown, 17, '30 息技能在 100 冷却速度下应缩短为 17 息');
assert.ok(lowCooldownReductionRate > highCooldownReductionRate, '低冷却技能必须获得更高缩减比例');
assert.ok(
 highBaseCooldown - highActualCooldown > lowBaseCooldown - lowActualCooldown,
 '高冷却技能减少的实际息数必须更多',
);
assert.equal(resolveCooldownTicks(30, 0), 30, '零冷却速度不得改变技能冷却');
assert.equal(resolveCooldownTicks(30, -100), 44, '负冷却速度必须按同一对抗公式延长冷却');
assert.equal(resolveCooldownTicks(1, 100), 1, '最终冷却不得低于 1 息');

console.log(JSON.stringify({
 ok: true,
 lowCooldownReductionRate,
 lowActualCooldown,
 highCooldownReductionRate,
 highActualCooldown,
}));
