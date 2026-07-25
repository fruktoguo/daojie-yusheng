import assert from 'node:assert/strict';
import {
  getSpiritualRootAuraEfficiencyBp,
} from '@mud/shared';
import {
  projectPlayerQiResourceValue,
  resolvePlayerQiResourceProjection,
} from '../runtime/world/world-runtime-qi-projection.helpers';

const player = {
  spiritualRoots: {
    metal: 50,
    wood: 100,
    water: 0,
    fire: 0,
    earth: 0,
  },
  techniques: { techniques: [] },
  buffs: { buffs: [] },
  attrBonuses: [],
  runtimeBonuses: [],
};

assert.equal(getSpiritualRootAuraEfficiencyBp(50), 2500);
assert.equal(getSpiritualRootAuraEfficiencyBp(100), 10000);
assert.equal(getSpiritualRootAuraEfficiencyBp(-1), 0);
assert.equal(getSpiritualRootAuraEfficiencyBp(120), 10000);

const neutralRefined = resolvePlayerQiResourceProjection(player, 'aura.refined.neutral');
const metalRefined = resolvePlayerQiResourceProjection(player, 'aura.refined.metal');
const metalDispersed = resolvePlayerQiResourceProjection(player, 'aura.dispersed.metal');
const woodRefined = resolvePlayerQiResourceProjection(player, 'aura.refined.wood');
const fireRefined = resolvePlayerQiResourceProjection(player, 'aura.refined.fire');

assert.equal(neutralRefined?.visibility, 'absorbable');
assert.equal(neutralRefined?.efficiencyBp, 10000);
assert.equal(metalRefined?.visibility, 'absorbable');
assert.equal(metalRefined?.efficiencyBp, 2500);
assert.equal(metalDispersed?.visibility, 'absorbable');
assert.equal(metalDispersed?.efficiencyBp, 2500);
assert.equal(woodRefined?.efficiencyBp, 10000);
assert.equal(fireRefined?.visibility, 'hidden');
assert.equal(fireRefined?.efficiencyBp, 0);
assert.equal(projectPlayerQiResourceValue(player, 'aura.refined.metal', 1000), 250);

player.spiritualRoots = {
  ...player.spiritualRoots,
  metal: 100,
};
assert.equal(resolvePlayerQiResourceProjection(player, 'aura.refined.metal')?.efficiencyBp, 10000);

console.log(JSON.stringify({ ok: true, case: 'world-runtime-qi-projection' }, null, 2));
