// @ts-nocheck

const assert = require("node:assert/strict");

const { DEFAULT_BASE_ATTRS, calcTechniqueFinalAttrBonus, getRealmAttributeMultiplier, getRealmLinearGrowthMultiplier } = require("@mud/shared");
const { PlayerAttributesService } = require("../runtime/player/player-attributes.service");
const { buildAttrDetailBonuses, buildAttrDetailNumericStatBreakdowns } = require("../network/world-gateway-attr-detail.helper");
/**
 * testAttrDetailBuilders：构建testAttr详情Builder。
 * @returns 无返回值，直接更新testAttr详情Builder相关状态。
 */


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

function testTechniqueAttrCalculationIgnoresStaleRuntimeAggregate() {
    const service = new PlayerAttributesService();
    const player = {
        realm: {
            stage: 0,
        },
        attrs: service.createInitialState(),
        maxHp: 10,
        maxQi: 0,
        hp: 10,
        qi: 0,
        selfRevision: 1,
        runtimeBonuses: [{
                source: 'runtime:technique_aggregate',
                label: '过期功法总池',
                attrs: {
                    constitution: 2,
                    spirit: 1,
                    perception: 0,
                    talent: 0,
                    comprehension: 0,
                    luck: 0,
                },
            }],
        techniques: {
            techniques: [{
                    techId: 'technique:test',
                    name: '测试功法',
                    level: 1,
                    exp: 0,
                    expToNext: 0,
                    realmLv: 1,
                    realm: 0,
                    grade: 'mortal',
                    category: 'internal',
                    skills: [],
                    layers: [{
                            level: 1,
                            expToNext: 0,
                            attrs: {
                                constitution: 50,
                                spirit: 20,
                            },
                        }],
                }],
        },
        bodyTraining: { level: 0 },
        equipment: { slots: [] },
        buffs: { buffs: [] },
        spiritualRoots: null,
    };
    service.recalculate(player);
    const techniqueBonus = calcTechniqueFinalAttrBonus(player.techniques.techniques);
    assert.equal(player.attrs.baseAttrs.constitution, DEFAULT_BASE_ATTRS.constitution + techniqueBonus.constitution);
    assert.equal(player.attrs.baseAttrs.spirit, DEFAULT_BASE_ATTRS.spirit + techniqueBonus.spirit);
    assert.equal(player.attrs.finalAttrs.constitution, DEFAULT_BASE_ATTRS.constitution + techniqueBonus.constitution);
    assert.equal(player.attrs.finalAttrs.spirit, DEFAULT_BASE_ATTRS.spirit + techniqueBonus.spirit);
}

function testRealmLevelScalesNumericStats() {
    const service = new PlayerAttributesService();
    const createPlayer = (realmLv) => ({
        realm: {
            stage: 0,
            realmLv,
        },
        attrs: service.createInitialState(),
        maxHp: 10,
        maxQi: 10,
        hp: 10,
        qi: 10,
        selfRevision: 1,
        runtimeBonuses: [],
        techniques: { techniques: [] },
        bodyTraining: { level: 0 },
        equipment: { slots: [] },
        buffs: { buffs: [] },
        spiritualRoots: null,
    });
    const realmLv1Player = createPlayer(1);
    const realmLv3Player = createPlayer(3);
    service.recalculate(realmLv1Player);
    service.recalculate(realmLv3Player);
    assert.equal(realmLv3Player.attrs.numericStats.maxHp, Math.round(realmLv1Player.attrs.numericStats.maxHp * getRealmAttributeMultiplier(3)));
    assert.equal(realmLv3Player.attrs.numericStats.physAtk, Math.round(realmLv1Player.attrs.numericStats.physAtk * getRealmAttributeMultiplier(3)));
    assert.equal(realmLv3Player.attrs.numericStats.physDef, Math.round(realmLv1Player.attrs.numericStats.physDef * getRealmAttributeMultiplier(3)));
    assert.equal(realmLv3Player.attrs.numericStats.maxQiOutputPerTick, Math.round(realmLv1Player.attrs.numericStats.maxQiOutputPerTick * getRealmLinearGrowthMultiplier(3, 0.1)));
    const breakdowns = buildAttrDetailNumericStatBreakdowns(realmLv3Player);
    assert.equal(breakdowns.maxHp?.realmMultiplier, getRealmAttributeMultiplier(3));
    assert.equal(breakdowns.maxQiOutputPerTick?.realmMultiplier, getRealmLinearGrowthMultiplier(3, 0.1));
    assert.equal(breakdowns.maxHp?.finalValue, realmLv3Player.attrs.numericStats.maxHp);
}

testAttrDetailBuilders();
testTechniqueAttrCalculationIgnoresStaleRuntimeAggregate();
testRealmLevelScalesNumericStats();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-attr-detail-helper' }, null, 2));
