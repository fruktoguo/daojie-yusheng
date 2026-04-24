// @ts-nocheck

const assert = require("node:assert/strict");

const { DEFAULT_BASE_ATTRS, applyEnhancementToItemStack, calcTechniqueFinalAttrBonus, calcTechniqueFinalQiProjection, getRealmAttributeMultiplier, getRealmLinearGrowthMultiplier } = require("@mud/shared");
const { PlayerAttributesService } = require("../runtime/player/player-attributes.service");
const { buildAttrDetailBonuses, buildAttrDetailNumericStatBreakdowns } = require("../network/world-gateway-attr-detail.helper");
const { projectPlayerQiResourceValue, resolvePlayerQiResourceProjection } = require("../runtime/world/world-runtime-qi-projection.helpers");
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

function testTechniqueQiProjectionAppearsInAttrDetail() {
    const player = {
        realm: {
            stage: 0,
        },
        attrs: {
            stage: 0,
            baseAttrs: DEFAULT_BASE_ATTRS,
            finalAttrs: DEFAULT_BASE_ATTRS,
            numericStats: {},
        },
        techniques: {
            techniques: [{
                    techId: 'xuesha_huanling_jue',
                    name: '血煞唤灵决',
                    level: 1,
                    exp: 0,
                    expToNext: 0,
                    realmLv: 31,
                    realm: 0,
                    grade: 'heaven',
                    category: 'internal',
                    skills: [],
                    layers: [{
                            level: 1,
                            expToNext: 0,
                            qiProjection: [{
                                    selector: { families: ['aura'], elements: ['neutral'] },
                                    visibility: 'absorbable',
                                    efficiencyBpMultiplier: 9000,
                                }, {
                                    selector: { families: ['sha'], elements: ['neutral'] },
                                    visibility: 'absorbable',
                                    efficiencyBpMultiplier: 12000,
                                }],
                        }],
                }],
        },
        equipment: { slots: [] },
        buffs: { buffs: [] },
        runtimeBonuses: [],
    };
    const projected = calcTechniqueFinalQiProjection(player.techniques.techniques);
    assert.equal(projected.length, 2);
    const bonuses = buildAttrDetailBonuses(player);
    const techniqueBonus = bonuses.find((entry) => entry.source === 'technique:xuesha_huanling_jue');
    assert.equal(techniqueBonus?.label, '血煞唤灵决');
    assert.equal(Array.isArray(techniqueBonus?.qiProjection), true);
    assert.equal(techniqueBonus.qiProjection.length, 2);
    assert.equal(techniqueBonus.qiProjection.find((entry) => entry.selector?.families?.includes('aura'))?.efficiencyBpMultiplier, 9000);
    assert.equal(techniqueBonus.qiProjection.find((entry) => entry.selector?.families?.includes('sha'))?.efficiencyBpMultiplier, 12000);
}

function testXueshaLevelNineQiProjectionUsesHiddenResourceZeroBaseline() {
    const layerProjection = [{
            selector: { families: ['aura'], elements: ['neutral'] },
            visibility: 'absorbable',
            efficiencyBpMultiplier: 9000,
        }, {
            selector: { families: ['sha'], elements: ['neutral'] },
            visibility: 'absorbable',
            efficiencyBpMultiplier: 12000,
        }];
    const player = {
        techniques: {
            techniques: [{
                    techId: 'xuesha_huanling_jue',
                    name: '血煞唤灵决',
                    level: 9,
                    exp: 0,
                    expToNext: 0,
                    realmLv: 42,
                    realm: 0,
                    grade: 'heaven',
                    category: 'secret',
                    skills: [],
                    layers: Array.from({ length: 9 }, (_, index) => ({
                        level: index + 1,
                        expToNext: 0,
                        qiProjection: layerProjection,
                    })),
                }],
        },
        buffs: { buffs: [] },
        attrBonuses: [],
        runtimeBonuses: [],
    };
    const auraProjection = resolvePlayerQiResourceProjection(player, 'aura.refined.neutral');
    const shaProjection = resolvePlayerQiResourceProjection(player, 'sha.refined.neutral');
    assert.equal(auraProjection?.visibility, 'absorbable');
    assert.equal(auraProjection?.efficiencyBp, 1000);
    assert.equal(shaProjection?.visibility, 'absorbable');
    assert.equal(shaProjection?.efficiencyBp, 18000);
    assert.equal(projectPlayerQiResourceValue(player, 'aura.refined.neutral', 1000), 100);
    assert.equal(projectPlayerQiResourceValue(player, 'sha.refined.neutral', 1000), 1800);
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

function testEnhancedEquipmentScalesLiveAndDetailStats() {
    const service = new PlayerAttributesService();
    const createPlayer = (enhanceLevel) => ({
        realm: {
            stage: 0,
            realmLv: 1,
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
        equipment: {
            slots: [{
                    slot: 'weapon',
                    item: {
                        itemId: 'smoke.sword',
                        name: '测试剑',
                        type: 'equipment',
                        count: 1,
                        equipSlot: 'weapon',
                        enhanceLevel,
                        equipAttrs: {
                            constitution: 10,
                            spirit: 5,
                        },
                        equipStats: {
                            physAtk: 100,
                            spellAtk: 20,
                        },
                    },
                }],
        },
        buffs: { buffs: [] },
        spiritualRoots: null,
    });
    const plus0Player = createPlayer(0);
    const plus2Player = createPlayer(2);
    service.recalculate(plus0Player);
    service.recalculate(plus2Player);
    const enhancedItem = applyEnhancementToItemStack(plus2Player.equipment.slots[0].item);
    assert.equal(plus2Player.attrs.finalAttrs.constitution, DEFAULT_BASE_ATTRS.constitution + enhancedItem.equipAttrs.constitution);
    assert.equal(plus2Player.attrs.finalAttrs.spirit, DEFAULT_BASE_ATTRS.spirit + enhancedItem.equipAttrs.spirit);
    assert.ok(plus2Player.attrs.finalAttrs.constitution > plus0Player.attrs.finalAttrs.constitution);
    assert.ok(plus2Player.attrs.numericStats.physAtk > plus0Player.attrs.numericStats.physAtk);
    const equipmentBonus = buildAttrDetailBonuses(plus2Player).find((entry) => entry.source === 'equipment:weapon');
    assert.equal(equipmentBonus?.attrs?.constitution, enhancedItem.equipAttrs.constitution);
    assert.equal(equipmentBonus?.stats?.physAtk, enhancedItem.equipStats.physAtk);
    const breakdowns = buildAttrDetailNumericStatBreakdowns(plus2Player);
    assert.equal(breakdowns.physAtk?.finalValue, plus2Player.attrs.numericStats.physAtk);
    assert.ok(breakdowns.physAtk?.bonusBaseValue > buildAttrDetailNumericStatBreakdowns(plus0Player).physAtk.bonusBaseValue);
}

testAttrDetailBuilders();
testTechniqueAttrCalculationIgnoresStaleRuntimeAggregate();
testTechniqueQiProjectionAppearsInAttrDetail();
testXueshaLevelNineQiProjectionUsesHiddenResourceZeroBaseline();
testRealmLevelScalesNumericStats();
testEnhancedEquipmentScalesLiveAndDetailStats();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-attr-detail-helper' }, null, 2));
