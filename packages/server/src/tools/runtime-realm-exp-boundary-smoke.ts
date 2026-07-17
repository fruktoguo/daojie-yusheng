import assert from 'node:assert/strict';
import { computeCraftSkillExpGain } from '@mud/shared';

import { resolveRuntimeRealmExpToNext } from '../runtime/player/realm-runtime-exp.helpers';
import {
  resolveCraftSkillExpToNextByLevel,
  resolveInitialCraftSkillExpToNext,
} from '../runtime/craft/craft-skill-exp.helpers';

const levelOneRuntimeExp = resolveRuntimeRealmExpToNext(10, 1000);

assert.equal(levelOneRuntimeExp, 10000, 'realm level 1 runtime exp must expand raw 10 by multiplier 1000');

const progressionService = {
  getRealmRuntimeExpToNext(level: number) {
    return level === 1 ? levelOneRuntimeExp : 0;
  },
};

assert.equal(resolveInitialCraftSkillExpToNext(progressionService), 10000, 'initial craft skill exp must use runtime realm exp');
assert.equal(resolveCraftSkillExpToNextByLevel(progressionService, 1), 10000, 'craft skill exp resolver must not read raw realm entry expToNext');

const resolveCraftExpToNext = (level: number): number => level * 10000;
const realmCappedGain = computeCraftSkillExpGain({
  playerRealmLevel: 5,
  skillLevel: 20,
  targetLevel: 30,
  baseActionTicks: 3600,
  getExpToNextByLevel: resolveCraftExpToNext,
  successCount: 1,
});
const skillCappedGain = computeCraftSkillExpGain({
  playerRealmLevel: 30,
  skillLevel: 20,
  targetLevel: 30,
  baseActionTicks: 3600,
  getExpToNextByLevel: resolveCraftExpToNext,
  successCount: 1,
});
const targetCappedGain = computeCraftSkillExpGain({
  playerRealmLevel: 30,
  skillLevel: 20,
  targetLevel: 10,
  baseActionTicks: 3600,
  getExpToNextByLevel: resolveCraftExpToNext,
  successCount: 1,
});

assert.equal(realmCappedGain.referenceLevel, 5, 'craft exp reference level must be capped by player realm');
assert.equal(skillCappedGain.referenceLevel, 20, 'craft exp reference level must be capped by skill level');
assert.equal(targetCappedGain.referenceLevel, 10, 'craft exp reference level must be capped by target level');

console.log(JSON.stringify({ ok: true, case: 'runtime-realm-exp-boundary' }, null, 2));
