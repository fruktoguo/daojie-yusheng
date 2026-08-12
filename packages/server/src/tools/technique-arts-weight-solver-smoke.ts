import assert from 'node:assert/strict';

import type { GmCustomArtsTechniqueInput } from '@mud/shared';

import { solveTechniqueArtsWeights } from './lib/technique-arts-weight-solver';

const technique: GmCustomArtsTechniqueInput = {
  name: '反推器烟测功法',
  desc: '验证术法权重反推器只调用正式展开器并返回可复用权重方案。',
  grade: 'spirit',
  category: 'arts',
  realmLv: 48,
  maxLayer: 9,
  expDifficulty: 1.8,
  budgetPercent: 1.2,
  skills: [{
    name: '反推器烟测技能',
    desc: '用于验证冷却、半径与伤害权重的联合反推。',
    unlockLevel: 9,
    damageKind: 'spell',
    target: { type: 'area' },
    structureStrength: {
      damage: -100,
      cost: 0,
      cooldown: 100,
      chant: 0,
      castRange: -100,
      area: 75,
    },
    formulaStrength: {
      attributeBases: { spellAtk: 100 },
      percentBonuses: {
        moveSpeed: 23,
        realmLevel: 23,
        transmissionLevel: 23,
      },
    },
  }],
};

const originalSnapshot = JSON.stringify(technique);
const exactResult = solveTechniqueArtsWeights({
  technique,
  targets: [
    { metric: 'cooldown', value: 2 },
    { metric: 'radius', value: 8 },
  ],
  variables: [
    { id: 'damage', keys: ['structure.damage'], min: 0, max: 10, step: 1 },
    { id: 'area', keys: ['structure.area'], min: 45, max: 55, step: 1 },
    {
      id: 'three_percent_sources',
      keys: ['percent.moveSpeed', 'percent.realmLevel', 'percent.transmissionLevel'],
      min: 1,
      max: 5,
      step: 1,
    },
  ],
  objective: 'maxSpellAtkScale',
  search: { mode: 'exhaustive', maxEvaluations: 10_000, top: 3 },
});

if (exactResult.ok === false) throw new Error(exactResult.errors.join('; '));
assert.equal(exactResult.ok, true);
assert.equal(exactResult.exactMatchFound, true);
assert.equal(exactResult.search.exhaustive, true);
assert.equal(exactResult.search.totalCombinations, 605);
assert.equal(exactResult.search.evaluatedCandidates, 605);
assert.ok(exactResult.solutions.length > 0);
assert.equal(exactResult.solutions[0].metrics.cooldown, 2);
assert.equal(exactResult.solutions[0].metrics.radius, 8);
assert.ok(exactResult.solutions[0].metrics.spellAtkScale > 0.01);
assert.equal(exactResult.recommendedTechnique.skills[0].structureStrength.cost, 0);
assert.equal(exactResult.recommendedTechnique.skills[0].structureStrength.chant, 0);
assert.equal(JSON.stringify(technique), originalSnapshot, '求解器不得修改输入对象');

const adaptiveResult = solveTechniqueArtsWeights({
  technique,
  targets: [
    { metric: 'cooldown', value: 2 },
    { metric: 'radius', value: 8 },
  ],
  variables: [
    { id: 'damage', keys: ['structure.damage'], min: -100, max: 100, step: 1 },
    { id: 'area', keys: ['structure.area'], min: 0, max: 100, step: 1 },
    {
      id: 'three_percent_sources',
      keys: ['percent.moveSpeed', 'percent.realmLevel', 'percent.transmissionLevel'],
      min: 0,
      max: 100,
      step: 1,
    },
  ],
  objective: 'maxReferenceFormulaValue',
  referenceFormulaVars: {
    'caster.stat.spellAtk': 1,
    techLevel: 9,
    'caster.stat.moveSpeed': 100,
    'caster.realmLv': 48,
    'caster.craft.transmission.level': 48,
  },
  search: {
    mode: 'adaptive',
    maxEvaluations: 20_000,
    sampleCount: 512,
    beamWidth: 32,
    top: 3,
  },
});
if (adaptiveResult.ok === false) throw new Error(adaptiveResult.errors.join('; '));
assert.equal(adaptiveResult.exactMatchFound, true);
assert.equal(adaptiveResult.search.exhaustive, false);
assert.equal(adaptiveResult.solutions[0].groupValues.damage, 5);
assert.equal(adaptiveResult.solutions[0].groupValues.area, 49);
assert.equal(adaptiveResult.solutions[0].groupValues.three_percent_sources, 1);
assert.ok((adaptiveResult.solutions[0].metrics.referenceFormulaValue ?? 0) > 300);

const invalidResult = solveTechniqueArtsWeights({
  technique,
  targets: [{ metric: 'cooldown', value: 2 }],
  variables: [{ id: 'invalid', keys: ['structure.damage'], min: -101, max: 0, step: 1 }],
});
assert.equal(invalidResult.ok, false);

console.log(JSON.stringify({
  ok: true,
  exactSolutions: exactResult.solutions.length,
  recommended: exactResult.solutions[0],
  search: exactResult.search,
  adaptiveSearch: adaptiveResult.search,
}, null, 2));
