#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

const {
  computeCraftAdjustedSuccessRate,
  computeEnhancementAdjustedSuccessRate,
} = require('../packages/shared/dist');

function assertClose(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) < 1e-12,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

const tenLevelPenaltyFactor = 0.9 ** 10;

assertClose(
  computeCraftAdjustedSuccessRate(1, 20, 10, 0),
  tenLevelPenaltyFactor,
  'full base alchemy/forging success is reduced by low craft level',
);

assertClose(
  computeCraftAdjustedSuccessRate(1, 20, 10, -1),
  tenLevelPenaltyFactor,
  'negative external modifiers are ignored instead of amplifying penalties',
);

assert.equal(
  computeCraftAdjustedSuccessRate(1, 20, 10, 2),
  1,
  'positive external modifiers can offset the low-level penalty up to the cap',
);

const weakenedEnhancementRate = computeEnhancementAdjustedSuccessRate(1, 10, 20, 0, 0);
assertClose(
  weakenedEnhancementRate,
  0.5 * tenLevelPenaltyFactor,
  'enhancement already applies the same low-level factor to level-20 equipment',
);

console.log('[proof:craft-success-level-penalty] ok');
