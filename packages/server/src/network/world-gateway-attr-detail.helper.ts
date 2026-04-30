// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAttrDetailNumericStatBreakdowns = exports.buildAttrDetailBonuses = void 0;

const shared_1 = require("@mud/shared");
/**
 * buildAttrDetailBonuses：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Attr详情Bonuse相关状态。
 */


function buildAttrDetailBonuses(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const bonuses = [];
    const realmStage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const realmConfig = shared_1.PLAYER_REALM_CONFIG[realmStage];
    const realmAttrBonus = (0, shared_1.resolvePlayerRealmAttributeBonus)(realmStage);
    if (realmConfig && hasNonZeroAttributes(realmAttrBonus)) {
        bonuses.push({
            source: `realm:${realmStage}`,
            label: player.realm?.displayName ?? player.realm?.name ?? '境界',
            attrs: clonePartialAttributes(realmAttrBonus),
        });
    }
    for (const technique of player.techniques?.techniques ?? []) {
        const techniqueState = toTechniqueState(technique);
        const techniqueAttrs = (0, shared_1.calcTechniqueFinalAttrBonus)([techniqueState]);
        const qiProjection = (0, shared_1.calcTechniqueQiProjectionModifiers)(techniqueState.level, techniqueState.layers);
        if (!hasNonZeroAttributes(techniqueAttrs) && qiProjection.length === 0) {
            continue;
        }
        bonuses.push({
            source: `technique:${technique.techId}`,
            label: technique.name ?? technique.techId,
            attrs: clonePartialAttributes(techniqueAttrs) ?? {},
            qiProjection: cloneQiProjectionModifiers(qiProjection),
        });
    }
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item ? (0, shared_1.applyEnhancementToItemStack)(entry.item) : null;
        if (!item || (!hasNonZeroAttributes(item.equipAttrs) && !hasNonZeroPartialNumericStats(resolveItemNumericStats(item)))) {
            continue;
        }
        bonuses.push({
            source: `equipment:${entry.slot}`,
            label: item.itemId,
            attrs: clonePartialAttributes(item.equipAttrs),
            stats: clonePartialNumericStats(resolveItemNumericStats(item)),
        });
    }
    for (const buff of player.buffs?.buffs ?? []) {
        if (!hasNonZeroAttributes(buff.attrs) && !hasNonZeroPartialNumericStats(buff.stats) && !Array.isArray(buff.qiProjection)) {
            continue;
        }
        bonuses.push({
            source: `buff:${buff.buffId}`,
            label: buff.name || buff.buffId,
            attrs: clonePartialAttributes(buff.attrs),
            attrMode: buff.attrMode === 'percent' ? 'percent' : 'flat',
            stats: clonePartialNumericStats(buff.stats),
            qiProjection: cloneQiProjectionModifiers(buff.qiProjection),
            meta: {
                sourceSkillId: typeof buff.sourceSkillId === 'string' ? buff.sourceSkillId : '',
            },
        });
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (!hasNonZeroAttributes(bonus.attrs)
            && !hasNonZeroPartialNumericStats(bonus.stats)
            && !Array.isArray(bonus.qiProjection)
            && !isPlainObject(bonus.meta)) {
            continue;
        }
        bonuses.push({
            source: bonus.source,
            label: bonus.label ?? bonus.source,
            attrs: clonePartialAttributes(bonus.attrs),
            stats: clonePartialNumericStats(bonus.stats),
            qiProjection: cloneQiProjectionModifiers(bonus.qiProjection),
            meta: isPlainObject(bonus.meta) ? { ...bonus.meta } : undefined,
        });
    }
    return bonuses;
}
exports.buildAttrDetailBonuses = buildAttrDetailBonuses;
/**
 * buildAttrDetailNumericStatBreakdowns：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Attr详情NumericStatBreakdown相关状态。
 */


function buildAttrDetailNumericStatBreakdowns(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const stage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const template = (0, shared_1.resolvePlayerRealmNumericTemplate)(stage);
    const realmLv = Math.max(1, Math.floor(Number(player.realm?.realmLv ?? 1) || 1));
    const realmBaseStats = template?.stats ? (0, shared_1.cloneNumericStats)(template.stats) : (0, shared_1.createNumericStats)();
    const baseStats = (0, shared_1.cloneNumericStats)(realmBaseStats);
    const flatBuffStats = (0, shared_1.createNumericStats)();
    const attrMultipliers = (0, shared_1.createNumericStats)();
    const finalAttrs = player.attrs?.finalAttrs ?? player.attrs?.baseAttrs;
    if (finalAttrs) {
        for (const key of shared_1.ATTR_KEYS) {
            const value = Number(finalAttrs[key] ?? 0);
            if (value === 0) {
                continue;
            }
            (0, shared_1.addPartialNumericStats)(baseStats, scalePartialNumericStats(shared_1.ATTR_TO_NUMERIC_WEIGHTS[key], value));
            (0, shared_1.addPartialNumericStats)(attrMultipliers, scalePartialNumericStats(shared_1.ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key], value));
        }
    }
    applySpecialStatWeights(baseStats, player, resolveTechniqueSpecialStatBonus(player.techniques?.techniques ?? []));
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item ? (0, shared_1.applyEnhancementToItemStack)(entry.item) : null;
        if (!item) {
            continue;
        }
        (0, shared_1.addPartialNumericStats)(baseStats, resolveItemNumericStats(item));
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (bonus?.stats) {
            (0, shared_1.addPartialNumericStats)(baseStats, bonus.stats);
        }
    }
    const vitalBaselineBonus = resolveVitalBaselineBonus(player.runtimeBonuses);
    if (vitalBaselineBonus?.stats) {
        (0, shared_1.addPartialNumericStats)(baseStats, vitalBaselineBonus.stats);
    }
    for (const buff of player.buffs?.buffs ?? []) {
        if (buff?.stats) {
            (0, shared_1.addPartialNumericStats)(flatBuffStats, buff.stats);
        }
    }
    if (player.combat?.cultivationActive === true) {
        flatBuffStats.realmExpPerTick += shared_1.CULTIVATION_REALM_EXP_PER_TICK;
        flatBuffStats.techniqueExpPerTick += shared_1.CULTIVATE_EXP_PER_TICK;
    }
    const preMultiplierStats = (0, shared_1.cloneNumericStats)(baseStats);
    (0, shared_1.addPartialNumericStats)(preMultiplierStats, flatBuffStats);
    const finalStats = player.attrs?.numericStats ?? preMultiplierStats;
    const breakdowns = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
        const realmBaseValue = getNumericStatValue(realmBaseStats, key);
        const baseValue = getNumericStatValue(baseStats, key);
        const flatBuffValue = getNumericStatValue(flatBuffStats, key);
        breakdowns[key] = {
            realmBaseValue,
            bonusBaseValue: baseValue - realmBaseValue,
            baseValue,
            flatBuffValue,
            preMultiplierValue: getNumericStatValue(preMultiplierStats, key),
            attrMultiplierPct: getNumericStatValue(attrMultipliers, key),
            realmMultiplier: getRealmNumericMultiplier(key, realmLv),
            buffMultiplierPct: 0,
            pillMultiplierPct: 0,
            finalValue: getNumericStatValue(finalStats, key),
        };
    }
    return breakdowns;
}
exports.buildAttrDetailNumericStatBreakdowns = buildAttrDetailNumericStatBreakdowns;

function applySpecialStatWeights(target, player, techniqueSpecialStats) {
    const comprehension = Math.max(0, Math.trunc(Number(player.comprehension ?? 0) || 0))
        + Math.max(0, Math.trunc(Number(techniqueSpecialStats?.comprehension ?? 0) || 0));
    const luck = Math.max(0, Math.trunc(Number(player.luck ?? 0) || 0))
        + Math.max(0, Math.trunc(Number(techniqueSpecialStats?.luck ?? 0) || 0));
    if (comprehension > 0) {
        target.playerExpRate += comprehension * 100;
        target.techniqueExpRate += comprehension * 100;
    }
    if (luck > 0) {
        target.lootRate += luck * 100;
        target.rareLootRate += luck * 100;
    }
}

function resolveTechniqueSpecialStatBonus(techniques) {
    return (0, shared_1.calcTechniqueFinalSpecialStatBonus)(techniques.map(toTechniqueState));
}
/**
 * getNumericStatValue：读取NumericStat值。
 * @param stats 参数说明。
 * @param key 参数说明。
 * @returns 无返回值，完成NumericStat值的读取/组装。
 */


function getNumericStatValue(stats, key) {
    const value = stats?.[key];
    return typeof value === 'number' ? value : 0;
}

const REALM_EXPONENTIAL_NUMERIC_KEY_SET = new Set([
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
    'maxQiOutputPerTick',
]);

const REALM_LINEAR_NUMERIC_GROWTH_RATES = {
    critDamage: 0.1,
    qiRegenRate: 0.02,
    hpRegenRate: 0.02,
    realmExpPerTick: 0.1,
    techniqueExpPerTick: 0.1,
};

function getRealmNumericMultiplier(key, realmLv) {
    if (REALM_EXPONENTIAL_NUMERIC_KEY_SET.has(key)) {
        return (0, shared_1.getRealmAttributeMultiplier)(realmLv);
    }
    const linearGrowthRate = REALM_LINEAR_NUMERIC_GROWTH_RATES[key];
    if (typeof linearGrowthRate === 'number') {
        return (0, shared_1.getRealmLinearGrowthMultiplier)(realmLv, linearGrowthRate);
    }
    return 1;
}
/**
 * scalePartialNumericStats：执行scalePartialNumericStat相关逻辑。
 * @param stats 参数说明。
 * @param factor 参数说明。
 * @returns 无返回值，直接更新scalePartialNumericStat相关状态。
 */

function scalePartialNumericStats(stats, factor) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats || factor === 0) {
        return undefined;
    }
    const result = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
        const value = stats[key];
        if (value !== undefined) {
            result[key] = value * factor;
        }
    }
    for (const groupKey of ['elementDamageBonus', 'elementDamageReduce']) {
        const group = stats[groupKey];
        if (!isPlainObject(group)) {
            continue;
        }
        const scaledGroup = {};
        for (const key of shared_1.ELEMENT_KEYS) {
            const value = group[key];
            if (value !== undefined) {
                scaledGroup[key] = value * factor;
            }
        }
        if (Object.keys(scaledGroup).length > 0) {
            result[groupKey] = scaledGroup;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
/**
 * collectProjectedRuntimeBonuses：执行Projected运行态Bonuse相关逻辑。
 * @param runtimeBonuses 参数说明。
 * @returns 无返回值，直接更新Projected运行态Bonuse相关状态。
 */

function collectProjectedRuntimeBonuses(runtimeBonuses) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(runtimeBonuses) || runtimeBonuses.length === 0) {
        return [];
    }
    return runtimeBonuses.filter((entry) => {
        const source = typeof entry?.source === 'string' ? entry.source : '';
        return Boolean(source && !isDerivedRuntimeBonusSource(source) && (entry.attrs || entry.stats));
    });
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof source !== 'string' || source.length === 0) {
        return true;
    }
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
 * resolveItemNumericStats：规范化或转换道具NumericStat。
 * @param item 道具。
 * @returns 无返回值，直接更新道具NumericStat相关状态。
 */

function resolveItemNumericStats(item) {
    return item?.equipValueStats ? (0, shared_1.compileValueStatsToActualStats)(item.equipValueStats) : item?.equipStats;
}
/**
 * hasNonZeroAttributes：判断NonZeroAttribute是否满足条件。
 * @param attrs 参数说明。
 * @returns 无返回值，完成NonZeroAttribute的条件判断。
 */

function hasNonZeroAttributes(attrs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!attrs) {
        return false;
    }
    return shared_1.ATTR_KEYS.some((key) => Number(attrs[key] ?? 0) !== 0);
}
/**
 * hasNonZeroPartialNumericStats：判断NonZeroPartialNumericStat是否满足条件。
 * @param stats 参数说明。
 * @returns 无返回值，完成NonZeroPartialNumericStat的条件判断。
 */

function hasNonZeroPartialNumericStats(stats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats) {
        return false;
    }
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
        if (Number(stats[key] ?? 0) !== 0) {
            return true;
        }
    }
    return ['elementDamageBonus', 'elementDamageReduce'].some((groupKey) => {
        const group = stats[groupKey];
        return isPlainObject(group) && Object.values(group).some((value) => Number(value ?? 0) !== 0);
    });
}
/**
 * clonePartialAttributes：构建PartialAttribute。
 * @param attrs 参数说明。
 * @returns 无返回值，直接更新PartialAttribute相关状态。
 */

function clonePartialAttributes(attrs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const result = {};
    for (const key of shared_1.ATTR_KEYS) {
        const value = Number(attrs?.[key] ?? 0);
        if (value !== 0) {
            result[key] = value;
        }
    }
    return result;
}
/**
 * clonePartialNumericStats：构建PartialNumericStat。
 * @param stats 参数说明。
 * @returns 无返回值，直接更新PartialNumericStat相关状态。
 */

function clonePartialNumericStats(stats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats) {
        return undefined;
    }
    const clone = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
        if (stats[key] !== undefined) {
            clone[key] = stats[key];
        }
    }
    if (isPlainObject(stats.elementDamageBonus)) {
        clone.elementDamageBonus = { ...stats.elementDamageBonus };
    }
    if (isPlainObject(stats.elementDamageReduce)) {
        clone.elementDamageReduce = { ...stats.elementDamageReduce };
    }
    return Object.keys(clone).length > 0 ? clone : undefined;
}
/**
 * cloneQiProjectionModifiers：构建QiProjectionModifier。
 * @param source 来源对象。
 * @returns 无返回值，直接更新QiProjectionModifier相关状态。
 */

function cloneQiProjectionModifiers(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(source) || source.length === 0) {
        return undefined;
    }
    return source.map((entry) => ({
        ...entry,
        selector: entry.selector
            ? {
                ...entry.selector,
                resourceKeys: entry.selector.resourceKeys ? entry.selector.resourceKeys.slice() : undefined,
                families: entry.selector.families ? entry.selector.families.slice() : undefined,
                forms: entry.selector.forms ? entry.selector.forms.slice() : undefined,
                elements: entry.selector.elements ? entry.selector.elements.slice() : undefined,
            }
            : undefined,
    }));
}
/**
 * toTechniqueState：执行to功法状态相关逻辑。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新to功法状态相关状态。
 */

function toTechniqueState(entry) {
    const skills = entry.skills?.map((skill) => cloneTechniqueSkill(skill)) ?? [];
    return {
        techId: entry.techId,
        name: '',
        level: entry.level ?? 1,
        exp: entry.exp ?? 0,
        expToNext: entry.expToNext ?? 0,
        realmLv: entry.realmLv ?? 1,
        realm: entry.realm ?? shared_1.TechniqueRealm.Entry,
        skillsEnabled: entry.skillsEnabled !== false,
        skills,
        grade: entry.grade ?? undefined,
        category: entry.category ?? undefined,
        layers: entry.layers?.map((layer) => ({
            level: layer.level,
            expToNext: layer.expToNext,
            attrs: layer.attrs ? { ...layer.attrs } : undefined,
            specialStats: layer.specialStats ? { ...layer.specialStats } : undefined,
            qiProjection: cloneQiProjectionModifiers(layer.qiProjection),
        })),
        attrCurves: entry.attrCurves ? { ...entry.attrCurves } : undefined,
    };
}
/**
 * cloneTechniqueSkill：构建功法技能。
 * @param source 来源对象。
 * @returns 无返回值，直接更新功法技能相关状态。
 */

function cloneTechniqueSkill(source) {
    return {
        ...source,
        name: '',
        desc: '',
    };
}
/**
 * isPlainObject：判断PlainObject是否满足条件。
 * @param value 参数说明。
 * @returns 无返回值，完成PlainObject的条件判断。
 */

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export { buildAttrDetailBonuses, buildAttrDetailNumericStatBreakdowns };
