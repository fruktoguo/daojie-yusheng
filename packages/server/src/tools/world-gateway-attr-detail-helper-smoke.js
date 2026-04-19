"use strict";

const assert = require("node:assert/strict");

const { buildAttrDetailBonuses, buildAttrDetailNumericStatBreakdowns } = require("../network/world-gateway-attr-detail.helper");

function testAttrDetailBuilders() {
    const player = {
        realm: {
            stage: 0,
            displayName: '凡胎',
        },
        attrs: {
            stage: 0,
            baseAttrs: {
                constitution: 10,
                spirit: 10,
                perception: 10,
                talent: 10,
                comprehension: 0,
                luck: 0,
            },
            finalAttrs: {
                constitution: 12,
                spirit: 10,
                perception: 10,
                talent: 10,
                comprehension: 0,
                luck: 0,
            },
            numericStats: {
                maxHp: 120,
                maxQi: 60,
                physAtk: 11,
                spellAtk: 5,
                physDef: 10,
                spellDef: 10,
                hit: 10,
                dodge: 10,
                crit: 0,
                critDamage: 0,
                breakPower: 0,
                resolvePower: 10,
                maxQiOutputPerTick: 10,
                qiRegenRate: 50,
                hpRegenRate: 50,
                cooldownSpeed: 0,
                auraCostReduce: 0,
                auraPowerRate: 0,
                playerExpRate: 0,
                techniqueExpRate: 0,
                realmExpPerTick: 0,
                techniqueExpPerTick: 0,
                lootRate: 0,
                rareLootRate: 0,
                viewRange: 10,
                moveSpeed: 10,
                extraAggroRate: 0,
                elementDamageBonus: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
                elementDamageReduce: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
            },
        },
        techniques: { techniques: [] },
        equipment: { slots: [] },
        buffs: { buffs: [] },
        runtimeBonuses: [],
    };
    const bonuses = buildAttrDetailBonuses(player);
    const breakdowns = buildAttrDetailNumericStatBreakdowns(player);
    assert.equal(Array.isArray(bonuses), true);
    assert.equal(typeof breakdowns.maxHp.finalValue, 'number');
    assert.equal(breakdowns.maxHp.finalValue, 120);
}

testAttrDetailBuilders();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-attr-detail-helper' }, null, 2));
