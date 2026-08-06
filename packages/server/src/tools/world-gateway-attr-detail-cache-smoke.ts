/**
 * 验证属性详情投影的功法派生缓存只在影响效果的字段变化时失效，
 * 同时确保依赖生命、真气或修炼状态的装备条件仍然即时重新判断。
 */
import assert from 'node:assert/strict';

import { buildAttrDetailBonuses } from '../network/world-gateway-attr-detail.helper';

const techniques = Array.from({ length: 256 }, (_, index) => ({
    techId: `technique:cache-smoke:${index}`,
    name: `缓存功法${index}`,
    level: 1,
    exp: 0,
    expToNext: 100,
    realmLv: 1,
    realm: 0,
    grade: 'mortal',
    category: 'internal',
    skills: [],
    layers: [{
        level: 1,
        attrs: { constitution: 1 },
        qiProjection: [{ visibility: 'observable', efficiencyBpMultiplier: 10100 }],
    }],
}));

const player = {
    realm: { stage: 0, displayName: '凡胎', realmLv: 1 },
    attrs: { stage: 0 },
    hp: 1000,
    maxHp: 1000,
    qi: 500,
    maxQi: 500,
    combat: { cultivationActive: false },
    techniques: { revision: 1, techniques },
    equipment: { revision: 1, slots: [] as Array<Record<string, unknown>> },
    buffs: { revision: 1, buffs: [] },
    runtimeBonuses: [],
    templateId: 'cache-smoke',
};

const first = buildAttrDetailBonuses(player);
player.hp = 700;
player.qi = 200;
const afterVitalChange = buildAttrDetailBonuses(player);
const firstTechniqueAggregate = first.find((entry) => entry.source === 'technique:aggregate');
const afterVitalTechniqueAggregate = afterVitalChange.find((entry) => entry.source === 'technique:aggregate');

assert.ok(firstTechniqueAggregate);
assert.equal(afterVitalTechniqueAggregate, firstTechniqueAggregate);
assert.deepEqual(afterVitalChange, first);

player.techniques.revision += 1;
player.techniques.techniques[0].exp = 7;
const afterTechniqueExperienceChange = buildAttrDetailBonuses(player);
const afterExperienceTechniqueAggregate = afterTechniqueExperienceChange.find((entry) => entry.source === 'technique:aggregate');
assert.equal(afterExperienceTechniqueAggregate, firstTechniqueAggregate);
assert.deepEqual(afterTechniqueExperienceChange, first);

player.techniques.revision += 1;
player.techniques.techniques = player.techniques.techniques.map((entry) => ({ ...entry, exp: (entry.exp ?? 0) + 1 }));
const afterTechniqueExperienceReplacement = buildAttrDetailBonuses(player);
const afterReplacementTechniqueAggregate = afterTechniqueExperienceReplacement.find((entry) => entry.source === 'technique:aggregate');
assert.equal(afterReplacementTechniqueAggregate, firstTechniqueAggregate);
assert.deepEqual(afterTechniqueExperienceReplacement, first);

player.techniques.revision += 1;
player.techniques.techniques = player.techniques.techniques.slice();
player.techniques.techniques[0] = {
    ...player.techniques.techniques[0],
    level: 2,
    layers: [{
        level: 1,
        attrs: { constitution: 1000 },
        qiProjection: [{ visibility: 'observable', efficiencyBpMultiplier: 10100 }],
    }],
};
const afterTechniqueChange = buildAttrDetailBonuses(player);
const changedTechniqueAggregate = afterTechniqueChange.find((entry) => entry.source === 'technique:aggregate');
assert.ok(changedTechniqueAggregate);
assert.notEqual(changedTechniqueAggregate, firstTechniqueAggregate);
assert.notEqual(changedTechniqueAggregate.attrs.constitution, firstTechniqueAggregate.attrs.constitution);

player.equipment.slots = [{
    slot: 'accessory',
    item: {
        itemId: 'cache-smoke.cultivation-token',
        name: '缓存条件装备',
        type: 'equipment',
        count: 1,
        effects: [{
            effectId: 'cache-smoke-cultivation',
            type: 'progress_boost',
            statMode: 'flat',
            conditions: {
                mode: 'all',
                items: [{ type: 'is_cultivating', value: true }],
            },
            valueStats: { realmExpPerTick: 3 },
        }],
    },
}];
const inactiveBonuses = buildAttrDetailBonuses(player);
player.combat.cultivationActive = true;
const activeBonuses = buildAttrDetailBonuses(player);
assert.equal(inactiveBonuses.some((entry) => entry.source === 'equipment:accessory:effect:cache-smoke-cultivation'), false);
assert.equal(activeBonuses.some((entry) => entry.source === 'equipment:accessory:effect:cache-smoke-cultivation'), true);

console.log(JSON.stringify({
    ok: true,
    case: 'world-gateway-attr-detail-cache',
    techniqueCount: techniques.length,
    cachedOnVitalChange: true,
    cachedOnTechniqueExperienceChange: true,
    cachedOnTechniqueExperienceReplacement: true,
    invalidatedOnTechniqueEffectChange: true,
    equipmentConditionReevaluated: true,
}, null, 2));
