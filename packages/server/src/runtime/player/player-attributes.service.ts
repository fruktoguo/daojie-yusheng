// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerAttributesService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared");

/** 玩家属性结算器：把境界、装备、buff 和根骨折算成最终面板。 */
let PlayerAttributesService = class PlayerAttributesService {
    /** 创建默认属性快照，供新角色和重建场景使用。 */
    createInitialState() {

        const template = shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE];
        return {
            revision: 1,
            stage: shared_1.DEFAULT_PLAYER_REALM_STAGE,
            baseAttrs: createBaseAttributes(),
            finalAttrs: createBaseAttributes(),
            numericStats: (0, shared_1.cloneNumericStats)(template.stats),
            ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(template.ratioDivisors),
        };
    }
    /** 重新计算玩家的最终属性和数值面板。 */
    recalculate(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const previousMaxHp = Math.max(1, Math.round(player.maxHp));

        const previousMaxQi = Math.max(0, Math.round(player.maxQi));

        const next = this.buildState(player);
        if (!hasAttrStateChanged(player.attrs, next)) {
            return false;
        }
        player.attrs.stage = next.stage;
        player.attrs.baseAttrs = next.baseAttrs;
        player.attrs.finalAttrs = next.finalAttrs;
        player.attrs.numericStats = next.numericStats;
        player.attrs.ratioDivisors = next.ratioDivisors;
        player.attrs.revision += 1;

        const nextMaxHp = Math.max(1, Math.round(next.numericStats.maxHp));

        const nextMaxQi = Math.max(0, Math.round(next.numericStats.maxQi));
        player.maxHp = nextMaxHp;
        player.maxQi = nextMaxQi;
        player.hp = previousMaxHp > 0
            ? clamp(Math.round(player.hp / previousMaxHp * nextMaxHp), 0, nextMaxHp)
            : nextMaxHp;
        player.qi = previousMaxQi > 0
            ? clamp(Math.round(player.qi / previousMaxQi * nextMaxQi), 0, nextMaxQi)
            : nextMaxQi;
        player.selfRevision += 1;
        return true;
    }
    /** 只让属性面板标脏，不重新结算具体数值。 */
    markPanelDirty(player) {
        player.attrs.revision += 1;
        player.selfRevision += 1;
    }
    /** 汇总基础属性、装备、buff 与临时修正，生成新的属性快照。 */
    buildState(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const stage = player.realm?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;

        const realmLv = Math.max(1, Math.floor(Number(player.realm?.realmLv ?? 1) || 1));

        const template = shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[stage];

        const runtimeBonuses = Array.isArray(player.runtimeBonuses) ? player.runtimeBonuses : [];

        const projectedRuntimeBonuses = collectProjectedRuntimeBonuses(runtimeBonuses);

        const vitalBaselineBonus = resolveVitalBaselineBonus(runtimeBonuses);

        const baseAttrs = createBaseAttributes();

        const techniqueAttrBonus = resolveTechniqueAttrBonus(player.techniques.techniques, runtimeBonuses);

        const bodyTrainingAttrBonus = (0, shared_1.calcBodyTrainingAttrBonus)(player.bodyTraining?.level ?? 0);
        addAttributes(baseAttrs, shared_1.PLAYER_REALM_CONFIG[stage].attrBonus);
        addAttributes(baseAttrs, techniqueAttrBonus);
        addAttributes(baseAttrs, bodyTrainingAttrBonus);
        for (const bonus of projectedRuntimeBonuses) {
            addAttributes(baseAttrs, bonus.attrs);
        }
        clampAttributes(baseAttrs);

        const finalAttrs = cloneAttributes(baseAttrs);
        for (const entry of player.equipment.slots) {
            const item = entry.item;
            if (!item) {
                continue;
            }
            addAttributes(finalAttrs, item.equipAttrs);
        }
        for (const buff of player.buffs.buffs) {
            addAttributes(finalAttrs, buff.attrs);
        }
        clampAttributes(finalAttrs);

        const numericStats = (0, shared_1.cloneNumericStats)(template.stats);

        const percentBonuses = createPercentBonusAccumulator();
        for (const key of shared_1.ATTR_KEYS) {
            const value = finalAttrs[key];
            if (value === 0) {
                continue;
            }
            applyAttrWeight(numericStats, key, value);
            accumulateAttrPercentBonus(percentBonuses, key, value);
        }
        for (const entry of player.equipment.slots) {
            const item = entry.item;
            if (!item) {
                continue;
            }
            (0, shared_1.addPartialNumericStats)(numericStats, resolveItemStats(item.equipStats, item.equipValueStats));
        }
        for (const buff of player.buffs.buffs) {
            (0, shared_1.addPartialNumericStats)(numericStats, buff.stats);
        }
        for (const bonus of projectedRuntimeBonuses) {
            (0, shared_1.addPartialNumericStats)(numericStats, bonus.stats);
        }
        applyPercentBonuses(numericStats, percentBonuses);
        applyRealmNumericScaling(numericStats, realmLv);
        applySpiritualRoots(numericStats, player.spiritualRoots);
        if (vitalBaselineBonus?.stats) {
            (0, shared_1.addPartialNumericStats)(numericStats, vitalBaselineBonus.stats);
        }
        return {
            stage,
            baseAttrs,
            finalAttrs,
            numericStats,
            ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(template.ratioDivisors),
        };
    }
};
exports.PlayerAttributesService = PlayerAttributesService;
exports.PlayerAttributesService = PlayerAttributesService = __decorate([
    (0, common_1.Injectable)()
], PlayerAttributesService);
export { PlayerAttributesService };
/**
 * applySpiritualRoots：处理Spiritual根容器并更新相关状态。
 * @param target 目标对象。
 * @param roots 参数说明。
 * @returns 无返回值，直接更新Spiritual根容器相关状态。
 */

function applySpiritualRoots(target, roots) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!roots) {
        return;
    }
    target.elementDamageBonus.metal += roots.metal;
    target.elementDamageBonus.wood += roots.wood;
    target.elementDamageBonus.water += roots.water;
    target.elementDamageBonus.fire += roots.fire;
    target.elementDamageBonus.earth += roots.earth;
    target.elementDamageReduce.metal += roots.metal;
    target.elementDamageReduce.wood += roots.wood;
    target.elementDamageReduce.water += roots.water;
    target.elementDamageReduce.fire += roots.fire;
    target.elementDamageReduce.earth += roots.earth;
}
/**
 * createBaseAttributes：构建并返回目标对象。
 * @returns 无返回值，直接更新BaseAttribute相关状态。
 */

function createBaseAttributes() {
    return {
        constitution: shared_1.DEFAULT_BASE_ATTRS.constitution,
        spirit: shared_1.DEFAULT_BASE_ATTRS.spirit,
        perception: shared_1.DEFAULT_BASE_ATTRS.perception,
        talent: shared_1.DEFAULT_BASE_ATTRS.talent,
        comprehension: shared_1.DEFAULT_BASE_ATTRS.comprehension,
        luck: shared_1.DEFAULT_BASE_ATTRS.luck,
    };
}
/**
 * createPercentBonusAccumulator：构建并返回目标对象。
 * @returns 无返回值，直接更新PercentBonuAccumulator相关状态。
 */

function createPercentBonusAccumulator() {
    return (0, shared_1.createNumericStats)();
}

const REALM_EXPONENTIAL_NUMERIC_KEYS = [
    'maxHp',
    'maxQi',
    'physAtk',
    'spellAtk',
    'physDef',
    'spellDef',
    'hit',
    'dodge',
    'crit',
    'antiCrit',
    'breakPower',
    'resolvePower',
];

const REALM_LINEAR_NUMERIC_GROWTH_RATES = {
    critDamage: 0.1,
    maxQiOutputPerTick: 0.1,
    qiRegenRate: 0.02,
    hpRegenRate: 0.02,
    realmExpPerTick: 0.1,
    techniqueExpPerTick: 0.1,
};

const REALM_LINEAR_NUMERIC_KEYS = Object.keys(REALM_LINEAR_NUMERIC_GROWTH_RATES);
/**
 * cloneAttributes：构建Attribute。
 * @param source 来源对象。
 * @returns 无返回值，直接更新Attribute相关状态。
 */

function cloneAttributes(source) {
    return {
        constitution: source.constitution,
        spirit: source.spirit,
        perception: source.perception,
        talent: source.talent,
        comprehension: source.comprehension,
        luck: source.luck,
    };
}
/**
 * addAttributes：处理Attribute并更新相关状态。
 * @param target 目标对象。
 * @param patch 参数说明。
 * @returns 无返回值，直接更新Attribute相关状态。
 */

function addAttributes(target, patch) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!patch) {
        return;
    }
    for (const key of shared_1.ATTR_KEYS) {
        const value = patch[key];
        if (value !== undefined) {
            target[key] += value;
        }
    }
}
/**
 * clampAttributes：执行clampAttribute相关逻辑。
 * @param target 目标对象。
 * @returns 无返回值，直接更新clampAttribute相关状态。
 */

function clampAttributes(target) {
    for (const key of shared_1.ATTR_KEYS) {
        target[key] = Math.max(0, target[key]);
    }
}
/**
 * applyAttrWeight：处理AttrWeight并更新相关状态。
 * @param target 目标对象。
 * @param key 参数说明。
 * @param value 参数说明。
 * @returns 无返回值，直接更新AttrWeight相关状态。
 */

function applyAttrWeight(target, key, value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const weight = shared_1.ATTR_TO_NUMERIC_WEIGHTS[key];
    if (!weight) {
        return;
    }
    (0, shared_1.addPartialNumericStats)(target, scalePartialNumericStats(weight, value));
}
/**
 * accumulateAttrPercentBonus：执行accumulateAttrPercentBonu相关逻辑。
 * @param target 目标对象。
 * @param key 参数说明。
 * @param value 参数说明。
 * @returns 无返回值，直接更新accumulateAttrPercentBonu相关状态。
 */

function accumulateAttrPercentBonus(target, key, value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const weight = shared_1.ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key];
    if (!weight) {
        return;
    }
    (0, shared_1.addPartialNumericStats)(target, scalePartialNumericStats(weight, value));
}
/**
 * applyPercentBonuses：处理PercentBonuse并更新相关状态。
 * @param target 目标对象。
 * @param bonuses 参数说明。
 * @returns 无返回值，直接更新PercentBonuse相关状态。
 */

function applyPercentBonuses(target, bonuses) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
        const bonus = bonuses[key];
        if (!Number.isFinite(bonus) || bonus === 0) {
            continue;
        }
        const floor = shared_1.NUMERIC_STAT_MULTIPLIER_FLOORS[key] ?? 0;
        const base = Math.max(target[key], floor);
        target[key] = Math.round(base * (1 + bonus / 100));
    }
    for (const element of shared_1.ELEMENT_KEYS) {
        const damageBonus = bonuses.elementDamageBonus?.[element] ?? 0;
        if (damageBonus !== 0) {
            const floor = shared_1.NUMERIC_STAT_MULTIPLIER_FLOORS.elementDamageBonus[element] ?? 0;
            target.elementDamageBonus[element] = Math.round(Math.max(target.elementDamageBonus[element], floor) * (1 + damageBonus / 100));
        }
        const damageReduce = bonuses.elementDamageReduce?.[element] ?? 0;
        if (damageReduce !== 0) {
            const floor = shared_1.NUMERIC_STAT_MULTIPLIER_FLOORS.elementDamageReduce[element] ?? 0;
            target.elementDamageReduce[element] = Math.round(Math.max(target.elementDamageReduce[element], floor) * (1 + damageReduce / 100));
        }
    }
}

function applyRealmNumericScaling(target, realmLv) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const exponentialMultiplier = (0, shared_1.getRealmAttributeMultiplier)(realmLv);
    if (exponentialMultiplier !== 1) {
        for (const key of REALM_EXPONENTIAL_NUMERIC_KEYS) {
            target[key] = Math.max(0, Math.round(target[key] * exponentialMultiplier));
        }
    }
    for (const key of REALM_LINEAR_NUMERIC_KEYS) {
        const linearMultiplier = (0, shared_1.getRealmLinearGrowthMultiplier)(realmLv, REALM_LINEAR_NUMERIC_GROWTH_RATES[key]);
        if (linearMultiplier === 1) {
            continue;
        }
        target[key] = Math.max(0, Math.round(target[key] * linearMultiplier));
    }
}
/**
 * resolveItemStats：规范化或转换道具Stat。
 * @param equipStats 参数说明。
 * @param equipValueStats 参数说明。
 * @returns 无返回值，直接更新道具Stat相关状态。
 */

function resolveItemStats(equipStats, equipValueStats) {
    return equipValueStats ? (0, shared_1.compileValueStatsToActualStats)(equipValueStats) : equipStats;
}
/**
 * scalePartialNumericStats：执行scalePartialNumericStat相关逻辑。
 * @param source 来源对象。
 * @param multiplier 参数说明。
 * @returns 无返回值，直接更新scalePartialNumericStat相关状态。
 */

function scalePartialNumericStats(source, multiplier) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const scaled = {};
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) {
            continue;
        }
        if (typeof value === 'number') {
            scaled[key] = value * multiplier;
            continue;
        }
        if (typeof value === 'object' && value) {

            const group = {};
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
                if (typeof nestedValue === 'number') {
                    group[nestedKey] = nestedValue * multiplier;
                }
            }
            if (Object.keys(group).length > 0) {
                scaled[key] = group;
            }
        }
    }
    return scaled;
}
/**
 * toTechniqueState：执行to功法状态相关逻辑。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新to功法状态相关状态。
 */

function toTechniqueState(entry) {
    return {
        techId: entry.techId,
        name: entry.name ?? entry.techId,
        level: entry.level ?? 1,
        exp: entry.exp ?? 0,
        expToNext: entry.expToNext ?? 0,
        realmLv: entry.realmLv ?? 1,
        realm: entry.realm ?? 0,
        skills: entry.skills ?? [],
        grade: entry.grade ?? undefined,
        category: entry.category ?? undefined,
        layers: entry.layers ?? undefined,
        attrCurves: entry.attrCurves ?? undefined,
    };
}
/**
 * collectProjectedRuntimeBonuses：执行Projected运行态Bonuse相关逻辑。
 * @param bonuses 参数说明。
 * @returns 无返回值，直接更新Projected运行态Bonuse相关状态。
 */

function collectProjectedRuntimeBonuses(bonuses) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(bonuses) || bonuses.length === 0) {
        return [];
    }
    return bonuses.filter((entry) => {

        const source = typeof entry?.source === 'string' ? entry.source : '';
        if (!source) {
            return false;
        }
        if (isDerivedRuntimeBonusSource(source)) {
            return false;
        }
        return Boolean(entry.attrs || entry.stats);
    });
}
/**
 * resolveTechniqueAttrBonus：规范化或转换功法AttrBonu。
 * @param techniques 参数说明。
 * @param runtimeBonuses 参数说明。
 * @returns 无返回值，直接更新功法AttrBonu相关状态。
 */

function resolveTechniqueAttrBonus(techniques, runtimeBonuses) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return (0, shared_1.calcTechniqueFinalAttrBonus)(techniques.map(toTechniqueState));
}
/**
 * resolveVitalBaselineBonus：规范化或转换VitalBaselineBonu。
 * @param runtimeBonuses 参数说明。
 * @returns 无返回值，直接更新VitalBaselineBonu相关状态。
 */

function resolveVitalBaselineBonus(runtimeBonuses) {
    return Array.isArray(runtimeBonuses)
        ? runtimeBonuses.find((entry) => entry?.source === 'runtime:vitals_baseline' && entry.stats && typeof entry.stats === 'object')
        : null;
}
/**
 * isDerivedRuntimeBonusSource：判断Derived运行态Bonu来源是否满足条件。
 * @param source 来源对象。
 * @returns 无返回值，完成Derived运行态Bonu来源的条件判断。
 */

function isDerivedRuntimeBonusSource(source) {
    return source === 'runtime:realm_stage'
        || source === 'runtime:realm_state'
        || source === 'runtime:heaven_gate_roots'
        || source === 'runtime:vitals_baseline'
        || source === 'runtime:technique_aggregate'
        || source.startsWith('technique:')
        || source.startsWith('equipment:')
        || source.startsWith('buff:');
}
/**
 * hasAttrStateChanged：判断Attr状态Changed是否满足条件。
 * @param previous 参数说明。
 * @param next 参数说明。
 * @returns 无返回值，完成Attr状态Changed的条件判断。
 */

function hasAttrStateChanged(previous, next) {
    return previous.stage !== next.stage
        || !isSameAttributes(previous.baseAttrs, next.baseAttrs)
        || !isSameAttributes(previous.finalAttrs, next.finalAttrs)
        || !isSameNumericStats(previous.numericStats, next.numericStats)
        || !isSameRatioDivisors(previous.ratioDivisors, next.ratioDivisors);
}
/**
 * isSameAttributes：判断SameAttribute是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameAttribute的条件判断。
 */

function isSameAttributes(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const key of shared_1.ATTR_KEYS) {
        if (left[key] !== right[key]) {
            return false;
        }
    }
    return true;
}
/**
 * isSameNumericStats：判断SameNumericStat是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameNumericStat的条件判断。
 */

function isSameNumericStats(left, right) {
    return left.maxHp === right.maxHp
        && left.maxQi === right.maxQi
        && left.physAtk === right.physAtk
        && left.spellAtk === right.spellAtk
        && left.physDef === right.physDef
        && left.spellDef === right.spellDef
        && left.hit === right.hit
        && left.dodge === right.dodge
        && left.crit === right.crit
        && left.critDamage === right.critDamage
        && left.breakPower === right.breakPower
        && left.resolvePower === right.resolvePower
        && left.maxQiOutputPerTick === right.maxQiOutputPerTick
        && left.qiRegenRate === right.qiRegenRate
        && left.hpRegenRate === right.hpRegenRate
        && left.cooldownSpeed === right.cooldownSpeed
        && left.auraCostReduce === right.auraCostReduce
        && left.auraPowerRate === right.auraPowerRate
        && left.playerExpRate === right.playerExpRate
        && left.techniqueExpRate === right.techniqueExpRate
        && left.realmExpPerTick === right.realmExpPerTick
        && left.techniqueExpPerTick === right.techniqueExpPerTick
        && left.lootRate === right.lootRate
        && left.rareLootRate === right.rareLootRate
        && left.viewRange === right.viewRange
        && left.moveSpeed === right.moveSpeed
        && left.extraAggroRate === right.extraAggroRate
        && left.elementDamageBonus.metal === right.elementDamageBonus.metal
        && left.elementDamageBonus.wood === right.elementDamageBonus.wood
        && left.elementDamageBonus.water === right.elementDamageBonus.water
        && left.elementDamageBonus.fire === right.elementDamageBonus.fire
        && left.elementDamageBonus.earth === right.elementDamageBonus.earth
        && left.elementDamageReduce.metal === right.elementDamageReduce.metal
        && left.elementDamageReduce.wood === right.elementDamageReduce.wood
        && left.elementDamageReduce.water === right.elementDamageReduce.water
        && left.elementDamageReduce.fire === right.elementDamageReduce.fire
        && left.elementDamageReduce.earth === right.elementDamageReduce.earth;
}
/**
 * isSameRatioDivisors：判断SameRatioDivisor是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameRatioDivisor的条件判断。
 */

function isSameRatioDivisors(left, right) {
    return left.dodge === right.dodge
        && left.crit === right.crit
        && left.breakPower === right.breakPower
        && left.resolvePower === right.resolvePower
        && left.cooldownSpeed === right.cooldownSpeed
        && left.moveSpeed === right.moveSpeed
        && left.elementDamageReduce.metal === right.elementDamageReduce.metal
        && left.elementDamageReduce.wood === right.elementDamageReduce.wood
        && left.elementDamageReduce.water === right.elementDamageReduce.water
        && left.elementDamageReduce.fire === right.elementDamageReduce.fire
        && left.elementDamageReduce.earth === right.elementDamageReduce.earth;
}
/**
 * clamp：执行clamp相关逻辑。
 * @param value 参数说明。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新clamp相关状态。
 */

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
