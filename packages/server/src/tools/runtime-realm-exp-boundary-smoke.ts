import assert from 'node:assert/strict';

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

console.log(JSON.stringify({ ok: true, case: 'runtime-realm-exp-boundary' }, null, 2));
