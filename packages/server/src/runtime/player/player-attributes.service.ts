/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 玩家属性结算服务。
 * 把境界、装备、buff、根骨、功法和临时修正折算成最终六维属性和数值面板，
 * 并在属性变化时同步更新生命/灵力上限和当前值比例。
 */
import { Injectable } from '@nestjs/common';
import { ATTR_KEYS, ATTR_TO_NUMERIC_WEIGHTS, ATTR_TO_PERCENT_NUMERIC_WEIGHTS, CRAFT_EFFECT_KINDS, CRAFT_EFFECT_SKILL_KINDS, CULTIVATE_EXP_PER_TICK, CULTIVATION_REALM_EXP_PER_TICK, DEFAULT_BASE_ATTRS, DEFAULT_PLAYER_REALM_STAGE, ELEMENT_KEYS, NUMERIC_SCALAR_STAT_KEYS, NUMERIC_STAT_MULTIPLIER_FLOORS, addCraftEffectStatsFromItem, addPartialNumericStats, applyEquipmentAttributeEffectivenessToItemStack, calcBodyTrainingAttrPercentBonus, calcTechniqueFinalAttrBonus, calcTechniqueFinalSpecialStatBonus, calcTechniqueMaxAttrPercentBonus, cloneCraftEffectStats, cloneNumericRatioDivisors, cloneNumericStats, compileValueStatsToActualStats, createEmptyCraftEffectStats, createNumericStats, getEffectiveMoveSpeed, getRealmAttributeMultiplier, getRealmLinearGrowthMultiplier, percentModifierToMultiplier, resolvePlayerRealmAttributeBonus, resolvePlayerRealmNumericTemplate } from '@mud/shared';
import { PVP_SHA_INFUSION_ATTACK_CAP_PERCENT, PVP_SHA_INFUSION_BUFF_ID } from '../../constants/gameplay/pvp';
import { resolvePlayerDailySignInFortuneLuck } from './player-special-stat.helpers';

/** 玩家属性结算器：把境界、装备、buff 和根骨折算成最终面板。 */
@Injectable()
export class PlayerAttributesService {
    percentBonusAccumulatorScratch = createPercentBonusAccumulator();
    buffStatPercentBonusAccumulatorScratch = createNumericStatPercentBonusAccumulator();
    attrPercentBonusAccumulatorScratch = createAttributePercentBonusAccumulator();
    flatBuffAttrsScratch = createEmptyAttributes();
    techniqueStatesScratch = [];
    enhancedEquipmentScratch = [];
    techniqueBonusCache = new WeakMap();
    deferredRecalculationStates = new WeakMap();

    /** 创建默认属性快照，供新角色和重建场景使用。 */
    createInitialState() {

        const template = resolvePlayerRealmNumericTemplate(DEFAULT_PLAYER_REALM_STAGE);
        const numericStats = cloneNumericStats(template.stats);
        applyCultivationBaselineStats(numericStats);
        return {
            revision: 1,
            stage: DEFAULT_PLAYER_REALM_STAGE,
            rawBaseAttrs: createBaseAttributes(),
            baseAttrs: createBaseAttributes(),
            finalAttrs: createBaseAttributes(),
            numericStats,
            ratioDivisors: cloneNumericRatioDivisors(template.ratioDivisors),
            craftEffectStats: createEmptyCraftEffectStats(),
        };
    }
    /** 重新计算玩家的最终属性和数值面板。 */
    recalculate(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const deferred = this.deferredRecalculationStates.get(player);
        if (deferred && deferred.depth > 0) {
            deferred.recalculateRequested = true;
            return true;
        }
        return this.recalculateNow(player);
    }
    /** 在受控区间内合并同一玩家的多次属性重算请求，区间结束后最多实际结算一次。 */
    withDeferredRecalculation(player, callback) {
        let state = this.deferredRecalculationStates.get(player);
        const isOuter = !state;
        if (!state) {
            state = {
                depth: 0,
                recalculateRequested: false,
                panelDirtyRequested: false,
            };
            this.deferredRecalculationStates.set(player, state);
        }
        state.depth += 1;
        let value;
        let thrown;
        try {
            value = callback();
        }
        catch (error) {
            thrown = error;
        }
        state.depth -= 1;
        let flushResult = {
            requested: state.recalculateRequested,
            changed: false,
            panelDirtyChanged: false,
        };
        if (isOuter && state.depth <= 0) {
            this.deferredRecalculationStates.delete(player);
            flushResult = this.flushDeferredRecalculation(player, state);
        }
        if (thrown) {
            throw thrown;
        }
        return { value, ...flushResult };
    }
    flushDeferredRecalculation(player, state) {
        const requested = state.recalculateRequested === true;
        const panelDirtyRequested = state.panelDirtyRequested === true;
        const changed = requested ? this.recalculateNow(player) : false;
        let panelDirtyChanged = false;
        if (panelDirtyRequested && !changed) {
            this.markPanelDirtyNow(player);
            panelDirtyChanged = true;
        }
        return { requested, changed, panelDirtyChanged };
    }
    recalculateNow(player) {
        const previousMaxHp = Math.max(1, Math.round(player.maxHp));

        const previousMaxQi = Math.max(0, Math.round(player.maxQi));

        const next = this.buildState(player);
        if (!hasAttrStateChanged(player.attrs, next)) {
            return false;
        }
        player.attrs.stage = next.stage;
        player.attrs.rawBaseAttrs = next.rawBaseAttrs;
        player.attrs.baseAttrs = next.baseAttrs;
        player.attrs.finalAttrs = next.finalAttrs;
        player.attrs.numericStats = next.numericStats;
        player.attrs.ratioDivisors = next.ratioDivisors;
        player.attrs.craftEffectStats = next.craftEffectStats;
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
        const deferred = this.deferredRecalculationStates.get(player);
        if (deferred && deferred.depth > 0) {
            deferred.panelDirtyRequested = true;
            return;
        }
        this.markPanelDirtyNow(player);
    }
    markPanelDirtyNow(player) {
        player.attrs.revision += 1;
        player.selfRevision += 1;
    }
    /** 汇总基础属性、装备、buff 与临时修正，生成新的属性快照。 */
    buildState(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const stage = player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;

        const realmLv = Math.max(1, Math.floor(Number(player.realm?.realmLv ?? 1) || 1));

        const template = resolvePlayerRealmNumericTemplate(stage);

        const runtimeBonuses = Array.isArray(player.runtimeBonuses) ? player.runtimeBonuses : [];

        const projectedRuntimeBonuses = collectProjectedRuntimeBonuses(runtimeBonuses);

        const vitalBaselineBonus = resolveVitalBaselineBonus(runtimeBonuses);

        const rawBaseAttrs = normalizeRawBaseAttributes(player.attrs?.rawBaseAttrs);

        const techniqueBonuses = resolveTechniqueBonusesForCalculation(
            player.techniques,
            this.techniqueStatesScratch,
            this.techniqueBonusCache,
        );
        const techniqueAttrBonus = techniqueBonuses.attrBonus;
        const techniqueMaxAttrPercentBonus = techniqueBonuses.maxAttrPercentBonus;

        const bodyTrainingLevel = Math.max(0, Math.trunc(Number(player.bodyTraining?.level ?? 0) || 0));

        const baseAttrs = cloneAttributes(rawBaseAttrs);
        addAttributes(baseAttrs, resolvePlayerRealmAttributeBonus(stage));
        addAttributes(baseAttrs, techniqueAttrBonus);
        for (const bonus of projectedRuntimeBonuses) {
            addAttributes(baseAttrs, bonus.attrs);
        }
        clampAttributes(baseAttrs);

        const finalAttrs = cloneAttributes(baseAttrs);
        const enhancedEquipment = this.enhancedEquipmentScratch;
        enhancedEquipment.length = 0;
        const craftEffectStats = createEmptyCraftEffectStats();
        for (const entry of player.equipment.slots) {
            const item = entry?.item;
            if (!item || typeof item !== 'object') {
                continue;
            }
            const enhancedItem = applyEquipmentAttributeEffectivenessToItemStack(item, realmLv);
            if (!enhancedItem) {
                continue;
            }
            enhancedEquipment.push(enhancedItem);
            addAttributes(finalAttrs, enhancedItem.equipAttrs);
            addCraftEffectStatsFromItem(craftEffectStats, enhancedItem);
        }
        const attrPercentBonuses = resetAttributePercentBonusAccumulator(this.attrPercentBonusAccumulatorScratch);
        const rootFoundation = Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0));
        if (rootFoundation > 0) {
            accumulateUniformAttributePercentBonus(attrPercentBonuses.realm, rootFoundation);
        }
        if (bodyTrainingLevel > 0) {
            accumulateAttributePercentBonus(attrPercentBonuses.bodyTraining, calcBodyTrainingAttrPercentBonus(bodyTrainingLevel));
        }
        accumulateAttributePercentBonus(attrPercentBonuses.techniqueMax, techniqueMaxAttrPercentBonus);
        const flatBuffAttrs = resetAttributes(this.flatBuffAttrsScratch);
        const activeBuffs = Array.isArray(player.buffs?.buffs) ? player.buffs.buffs : [];
        for (const buff of activeBuffs) {
            if (!isActiveRuntimeBuff(buff)) {
                continue;
            }
            const effectFactor = getBuffEffectFactor(buff, realmLv);
            if (effectFactor === 0 || !buff.attrs) {
                continue;
            }
            if (resolveBuffModifierMode(buff.attrMode) === 'flat') {
                addScaledAttributes(flatBuffAttrs, buff.attrs, effectFactor);
            }
            else {
                const target = isPillAttributeBuff(buff) ? attrPercentBonuses.pill : attrPercentBonuses.buff;
                accumulateAttributePercentBonus(target, buff.attrs, effectFactor);
            }
        }
        clampAttributes(finalAttrs);
        applySingleAttributePercentBonuses(finalAttrs, attrPercentBonuses.bodyTraining);
        applySingleAttributePercentBonuses(finalAttrs, attrPercentBonuses.techniqueMax);
        applySingleAttributePercentBonuses(finalAttrs, attrPercentBonuses.realm);
        addAttributes(finalAttrs, flatBuffAttrs);
        applySingleAttributePercentBonuses(finalAttrs, attrPercentBonuses.buff);
        applySingleAttributePercentBonuses(finalAttrs, attrPercentBonuses.pill);
        clampAttributes(finalAttrs);

        const numericStats = cloneNumericStats(template.stats);

        const percentBonuses = resetNumericStats(this.percentBonusAccumulatorScratch);
        const buffStatPercentBonuses = resetNumericStatPercentBonusAccumulator(this.buffStatPercentBonusAccumulatorScratch);
        for (const key of ATTR_KEYS) {
            const value = finalAttrs[key];
            if (value === 0) {
                continue;
            }
            applyAttrWeight(numericStats, key, value);
            accumulateAttrPercentBonus(percentBonuses, key, value);
        }
        applySpecialStatWeights(numericStats, player, techniqueBonuses.specialStatBonus, enhancedEquipment);
        for (const enhancedItem of enhancedEquipment) {
            addPartialNumericStats(numericStats, resolveItemStats(enhancedItem.equipStats, enhancedItem.equipValueStats));
            for (const effect of resolveActiveEquipmentProgressEffects(enhancedItem, player)) {
                const effectStats = resolveItemStats(effect.stats, effect.valueStats);
                if (!effectStats) {
                    continue;
                }
                if (resolveBuffModifierMode(effect.statMode) === 'percent') {
                    addPartialNumericStats(percentBonuses, effectStats);
                }
                else {
                    addPartialNumericStats(numericStats, effectStats);
                }
            }
        }
        for (const buff of activeBuffs) {
            if (!isActiveRuntimeBuff(buff)) {
                continue;
            }
            if (!buff.stats) {
                continue;
            }
            const effectFactor = getBuffEffectFactor(buff, realmLv);
            if (effectFactor === 0) {
                continue;
            }
            if (resolveBuffModifierMode(buff.statMode) === 'percent') {
                const target = isPillAttributeBuff(buff) ? buffStatPercentBonuses.pill : buffStatPercentBonuses.buff;
                addBuffNumericStats(target, buff, effectFactor);
            }
            else {
                addBuffNumericStats(numericStats, buff, effectFactor);
            }
        }
        for (const bonus of projectedRuntimeBonuses) {
            addPartialNumericStats(numericStats, bonus.stats);
        }
        applyCultivationBaselineStats(numericStats);
        applyPercentBonuses(numericStats, percentBonuses);
        applyRealmNumericScaling(numericStats, realmLv);
        applySpiritualRoots(numericStats, player.spiritualRoots);
        if (vitalBaselineBonus?.stats) {
            addPartialNumericStats(numericStats, vitalBaselineBonus.stats);
        }
        applyPercentBonuses(numericStats, buffStatPercentBonuses.buff);
        applyPercentBonuses(numericStats, buffStatPercentBonuses.pill);
        applyWorldTimeVisionModifier(numericStats, player);
        roundNumericStats(numericStats);
        return {
            stage,
            rawBaseAttrs,
            baseAttrs,
            finalAttrs,
            numericStats,
            ratioDivisors: cloneNumericRatioDivisors(template.ratioDivisors),
            craftEffectStats,
        };
    }
};
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

function applyCultivationBaselineStats(target) {
    target.realmExpPerTick += CULTIVATION_REALM_EXP_PER_TICK;
    target.techniqueExpPerTick += CULTIVATE_EXP_PER_TICK;
}
/**
 * createBaseAttributes：构建并返回目标对象。
 * @returns 无返回值，直接更新BaseAttribute相关状态。
 */

function createBaseAttributes(): Record<string, number> {
    return {
        constitution: DEFAULT_BASE_ATTRS.constitution,
        spirit: DEFAULT_BASE_ATTRS.spirit,
        perception: DEFAULT_BASE_ATTRS.perception,
        talent: DEFAULT_BASE_ATTRS.talent,
        strength: DEFAULT_BASE_ATTRS.strength,
        meridians: DEFAULT_BASE_ATTRS.meridians,
    };
}

function normalizeRawBaseAttributes(source) {
    const attrs = createBaseAttributes();
    if (!source || typeof source !== 'object') {
        return attrs;
    }
    for (const key of ATTR_KEYS) {
        const value = Number(source[key]);
        if (Number.isFinite(value)) {
            attrs[key] = Math.max(0, Math.trunc(value));
        }
    }
    const legacyStrength = Number(source.comprehension);
    if (!Number.isFinite(Number(source.strength)) && Number.isFinite(legacyStrength)) {
        attrs.strength = Math.max(0, Math.trunc(legacyStrength));
    }
    const legacyMeridians = Number(source.luck);
    if (!Number.isFinite(Number(source.meridians)) && Number.isFinite(legacyMeridians)) {
        attrs.meridians = Math.max(0, Math.trunc(legacyMeridians));
    }
    return attrs;
}
/**
 * createPercentBonusAccumulator：构建并返回目标对象。
 * @returns 无返回值，直接更新PercentBonuAccumulator相关状态。
 */

function createPercentBonusAccumulator() {
    return createNumericStats();
}

function createNumericStatPercentBonusAccumulator() {
    return {
        buff: createNumericStats(),
        pill: createNumericStats(),
    };
}

function createAttributePercentBonusAccumulator() {
    return {
        bodyTraining: createEmptyAttributes(),
        techniqueMax: createEmptyAttributes(),
        realm: createEmptyAttributes(),
        pill: createEmptyAttributes(),
        buff: createEmptyAttributes(),
    };
}

function resetAttributePercentBonusAccumulator(target) {
    resetAttributes(target.bodyTraining);
    resetAttributes(target.techniqueMax);
    resetAttributes(target.realm);
    resetAttributes(target.pill);
    resetAttributes(target.buff);
    return target;
}

function resetNumericStatPercentBonusAccumulator(target) {
    resetNumericStats(target.buff);
    resetNumericStats(target.pill);
    return target;
}

function createEmptyAttributes() {
    return {
        constitution: 0,
        spirit: 0,
        perception: 0,
        talent: 0,
        strength: 0,
        meridians: 0,
    };
}

function resetAttributes(target) {
    for (const key of ATTR_KEYS) {
        target[key] = 0;
    }
    return target;
}

function resetNumericStats(target) {
    for (const key of Object.keys(target)) {
        const value = target[key];
        if (typeof value === 'number') {
            target[key] = 0;
            continue;
        }
        if (value && typeof value === 'object') {
            for (const element of ELEMENT_KEYS) {
                if (typeof value[element] === 'number') {
                    value[element] = 0;
                }
            }
        }
    }
    return target;
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
    'maxQiOutputPerTick',
    'qiRegenRate',
    'hpRegenRate',
];

const REALM_LINEAR_NUMERIC_GROWTH_RATES = {
    critDamage: 0.1,
    realmExpPerTick: 0.1,
    techniqueExpPerTick: 0.1,
};

const REALM_LINEAR_NUMERIC_KEYS = Object.keys(REALM_LINEAR_NUMERIC_GROWTH_RATES);
const SIGNED_NUMERIC_STAT_KEYS = new Set([
    'moveSpeed',
    'cooldownSpeed',
    'auraCostReduce',
    'auraPowerRate',
    'playerExpRate',
    'techniqueExpRate',
    'lootRate',
    'rareLootRate',
    'extraAggroRate',
]);
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
        strength: source.strength ?? source.comprehension ?? 0,
        meridians: source.meridians ?? source.luck ?? 0,
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
    for (const key of ATTR_KEYS) {
        const value = patch[key];
        if (value !== undefined) {
            target[key] += value;
        }
    }
}

function addScaledAttributes(target, source, multiplier = 1) {
    if (!source) {
        return;
    }
    const normalizedMultiplier = Number.isFinite(multiplier) ? multiplier : 1;
    for (const key of ATTR_KEYS) {
        const value = Number(source[key]);
        if (Number.isFinite(value) && value !== 0) {
            target[key] += value * normalizedMultiplier;
        }
    }
}

function accumulateUniformAttributePercentBonus(target, amount) {
    const normalized = Number(amount);
    if (!Number.isFinite(normalized) || normalized === 0) {
        return;
    }
    for (const key of ATTR_KEYS) {
        target[key] += normalized;
    }
}

function accumulateAttributePercentBonus(target, attrs, factor = 1) {
    if (!attrs) {
        return;
    }
    const normalizedFactor = Number.isFinite(Number(factor)) ? Number(factor) : 1;
    for (const key of ATTR_KEYS) {
        const value = Number(attrs[key]);
        if (Number.isFinite(value) && value !== 0) {
            target[key] += value * normalizedFactor;
        }
    }
}

function applySingleAttributePercentBonuses(target, bonuses) {
    for (const key of ATTR_KEYS) {
        target[key] = Math.max(0, target[key] * attributePercentToMultiplier(bonuses[key]));
    }
}

function attributePercentToMultiplier(percent) {
    return percentModifierToMultiplier(Number(percent));
}

function isPillAttributeBuff(buff) {
    const sourceSkillId = typeof buff?.sourceSkillId === 'string' ? buff.sourceSkillId : '';
    const buffId = typeof buff?.buffId === 'string' ? buff.buffId : '';
    return sourceSkillId.startsWith('item:') || sourceSkillId.startsWith('pill.') || buffId.startsWith('item_buff.');
}
/**
 * clampAttributes：执行clampAttribute相关逻辑。
 * @param target 目标对象。
 * @returns 无返回值，直接更新clampAttribute相关状态。
 */

function clampAttributes(target) {
    for (const key of ATTR_KEYS) {
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

    const weight = ATTR_TO_NUMERIC_WEIGHTS[key];
    if (!weight) {
        return;
    }
    addScaledPartialNumericStats(target, weight, value);
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

    const weight = ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key];
    if (!weight) {
        return;
    }
    addScaledPartialNumericStats(target, weight, value);
}

function applySpecialStatWeights(target, player, techniqueSpecialStats, enhancedEquipment = undefined) {
    const equipmentSpecialStats = resolveEquipmentSpecialStats(player, enhancedEquipment);
    const comprehension = Math.max(0, Math.trunc(Number(player.comprehension ?? 0) || 0))
        + Math.max(0, Math.trunc(Number(techniqueSpecialStats?.comprehension ?? 0) || 0))
        + Math.max(0, Math.trunc(Number(equipmentSpecialStats.comprehension ?? 0) || 0));
    const baseLuck = Math.max(0, Math.trunc(Number(player.luck ?? 0) || 0));
    const luck = Math.max(0, baseLuck
        + Math.max(0, Math.trunc(Number(techniqueSpecialStats?.luck ?? 0) || 0))
        + Math.max(0, Math.trunc(Number(equipmentSpecialStats.luck ?? 0) || 0))
        + Math.trunc(Number(player.fengShuiLuck ?? 0) || 0)
        + resolvePlayerDailySignInFortuneLuck(player));
    if (comprehension > 0) {
        target.playerExpRate += comprehension * 100;
        target.techniqueExpRate += comprehension * 100;
    }
    if (luck !== 0) {
        target.lootRate += luck * 100;
        target.rareLootRate += luck * 100;
    }
}

function resolveEquipmentSpecialStats(player, enhancedEquipment = undefined) {
    const result = { comprehension: 0, luck: 0 };
    if (Array.isArray(enhancedEquipment)) {
        for (const enhancedItem of enhancedEquipment) {
            result.comprehension += Math.max(0, Math.trunc(Number(enhancedItem?.equipSpecialStats?.comprehension ?? 0) || 0));
            result.luck += Math.max(0, Math.trunc(Number(enhancedItem?.equipSpecialStats?.luck ?? 0) || 0));
        }
        return result;
    }
    const realmLv = Math.max(1, Math.floor(Number(player?.realm?.realmLv ?? 1) || 1));
    for (const entry of player?.equipment?.slots ?? []) {
        const item = entry?.item;
        if (!item) {
            continue;
        }
        const enhancedItem = applyEquipmentAttributeEffectivenessToItemStack(item, realmLv);
        result.comprehension += Math.max(0, Math.trunc(Number(enhancedItem.equipSpecialStats?.comprehension ?? 0) || 0));
        result.luck += Math.max(0, Math.trunc(Number(enhancedItem.equipSpecialStats?.luck ?? 0) || 0));
    }
    return result;
}
/**
 * applyPercentBonuses：处理PercentBonuse并更新相关状态。
 * @param target 目标对象。
 * @param bonuses 参数说明。
 * @returns 无返回值，直接更新PercentBonuse相关状态。
 */

function applyPercentBonuses(target, bonuses) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
        const bonus = bonuses[key];
        if (!Number.isFinite(bonus) || bonus === 0) {
            continue;
        }
        const floor = getNumericStatMultiplierFloor(key);
        const current = key === 'moveSpeed' ? target[key] + floor : target[key];
        const multiplier = percentModifierToMultiplier(bonus);
        const nextValue = current > 0 ? Math.max(0, current * multiplier) : floor * multiplier - floor;
        target[key] = key === 'moveSpeed' ? nextValue - floor : nextValue;
    }
    for (const element of ELEMENT_KEYS) {
        const damageBonus = bonuses.elementDamageBonus?.[element] ?? 0;
        if (damageBonus !== 0) {
            const floor = NUMERIC_STAT_MULTIPLIER_FLOORS.elementDamageBonus[element] ?? 0;
            const current = target.elementDamageBonus[element];
            const multiplier = percentModifierToMultiplier(damageBonus);
            target.elementDamageBonus[element] = current > 0 ? Math.max(0, current * multiplier) : floor * multiplier - floor;
        }
        const damageReduce = bonuses.elementDamageReduce?.[element] ?? 0;
        if (damageReduce !== 0) {
            const floor = NUMERIC_STAT_MULTIPLIER_FLOORS.elementDamageReduce[element] ?? 0;
            const current = target.elementDamageReduce[element];
            const multiplier = percentModifierToMultiplier(damageReduce);
            target.elementDamageReduce[element] = current > 0 ? Math.max(0, current * multiplier) : floor * multiplier - floor;
        }
    }
}

function getNumericStatMultiplierFloor(key) {
    return NUMERIC_STAT_MULTIPLIER_FLOORS[key] ?? 0;
}

function resolveBuffModifierMode(mode) {
    return mode === 'flat' ? 'flat' : 'percent';
}

function isActiveRuntimeBuff(buff) {
    return Boolean(buff && buff.remainingTicks > 0 && buff.stacks > 0);
}

function getBuffEffectFactor(buff, targetRealmLv) {
    const stackFactor = Math.max(1, Number(buff.stacks ?? 1) || 1);
    return stackFactor * getBuffRealmEffectivenessMultiplier(buff.realmLv, targetRealmLv);
}

function getBuffRealmEffectivenessMultiplier(buffRealmLv, targetRealmLv) {
    const normalizedBuffRealmLv = Math.max(1, Math.floor(Number(buffRealmLv ?? targetRealmLv) || 1));
    const normalizedTargetRealmLv = Math.max(1, Math.floor(Number(targetRealmLv ?? 1) || 1));
    if (normalizedBuffRealmLv >= normalizedTargetRealmLv) {
        return 1;
    }
    return Math.pow(0.9, normalizedTargetRealmLv - normalizedBuffRealmLv);
}

function roundNumericStats(target) {
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
        const sourceValue = key === 'moveSpeed' ? getEffectiveMoveSpeed(target[key]) : target[key];
        const rounded = Math.round(sourceValue);
        target[key] = SIGNED_NUMERIC_STAT_KEYS.has(key) ? rounded : Math.max(0, rounded);
    }
    for (const key of ELEMENT_KEYS) {
        target.elementDamageBonus[key] = Math.round(target.elementDamageBonus[key]);
        target.elementDamageReduce[key] = Math.max(0, Math.round(target.elementDamageReduce[key]));
    }
}

function applyRealmNumericScaling(target, realmLv) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const exponentialMultiplier = getRealmAttributeMultiplier(realmLv);
    if (exponentialMultiplier !== 1) {
        for (const key of REALM_EXPONENTIAL_NUMERIC_KEYS) {
            target[key] = Math.max(0, Math.round(target[key] * exponentialMultiplier));
        }
    }
    for (const key of REALM_LINEAR_NUMERIC_KEYS) {
        const linearMultiplier = getRealmLinearGrowthMultiplier(realmLv, REALM_LINEAR_NUMERIC_GROWTH_RATES[key]);
        if (linearMultiplier === 1) {
            continue;
        }
        target[key] = Math.max(0, Math.round(target[key] * linearMultiplier));
    }
}

function applyWorldTimeVisionModifier(target, player) {
    const baseViewRange = Math.max(1, Math.round(Number(target.viewRange) || 1));
    player.worldTimeBaseViewRange = baseViewRange;
    const multiplier = Number(player?.worldTime?.visionMultiplier);
    if (!Number.isFinite(multiplier) || multiplier >= 1) {
        if (player.worldTime) {
            player.worldTime = {
                ...player.worldTime,
                effectiveViewRange: baseViewRange,
            };
        }
        return;
    }
    target.viewRange = Math.max(1, Math.ceil(baseViewRange * Math.max(0, multiplier)));
    player.worldTime = {
        ...player.worldTime,
        effectiveViewRange: target.viewRange,
    };
}
/**
 * resolveItemStats：规范化或转换道具Stat。
 * @param equipStats 参数说明。
 * @param equipValueStats 参数说明。
 * @returns 无返回值，直接更新道具Stat相关状态。
 */

function resolveItemStats(equipStats, equipValueStats) {
    return equipValueStats ? compileValueStatsToActualStats(equipValueStats) : equipStats;
}

function resolveActiveEquipmentProgressEffects(item, player) {
    if (!Array.isArray(item?.effects) || item.effects.length === 0) {
        return [];
    }
    return item.effects.filter((effect) => effect?.type === 'progress_boost' && matchesEquipmentConditions(player, effect.conditions));
}

function matchesEquipmentConditions(player, conditions) {
    const items = Array.isArray(conditions?.items) ? conditions.items : [];
    if (items.length === 0) {
        return true;
    }
    const matches = (condition) => matchesEquipmentCondition(player, condition);
    return conditions?.mode === 'any' ? items.some(matches) : items.every(matches);
}

function matchesEquipmentCondition(player, condition) {
    switch (condition?.type) {
        case 'is_cultivating':
            return (player?.combat?.cultivationActive === true) === condition.value;
        case 'hp_ratio': {
            const maxHp = Math.max(1, Math.round(Number(player?.maxHp) || 1));
            const hp = Math.max(0, Math.round(Number(player?.hp) || 0));
            const ratio = hp / maxHp;
            return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
        }
        case 'qi_ratio': {
            const maxQi = Math.max(0, Math.round(Number(player?.maxQi) || 0));
            const qi = Math.max(0, Math.round(Number(player?.qi) || 0));
            const ratio = maxQi > 0 ? qi / maxQi : 0;
            return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
        }
        case 'has_buff':
            return Array.isArray(player?.buffs?.buffs)
                && player.buffs.buffs.some((buff) => buff?.buffId === condition.buffId
                    && Number(buff.remainingTicks) > 0
                    && Number(buff.stacks ?? 0) >= (condition.minStacks ?? 1));
        case 'map': {
            const currentMapId = typeof player?.templateId === 'string' ? player.templateId : '';
            return Array.isArray(condition.mapIds) && condition.mapIds.includes(currentMapId);
        }
        case 'time_segment':
            return true;
        default:
            return true;
    }
}
function addScaledPartialNumericStats(target, source, multiplier) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!source) {
        return;
    }
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) {
            continue;
        }
        if (typeof value === 'number' && typeof target[key] === 'number') {
            target[key] += value * multiplier;
            continue;
        }
        if (typeof value === 'object' && value) {
            const targetGroup = target[key];
            if (!targetGroup || typeof targetGroup !== 'object') {
                continue;
            }
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
                if (typeof nestedValue === 'number') {
                    targetGroup[nestedKey] += nestedValue * multiplier;
                }
            }
        }
    }
}

function addBuffNumericStats(target, buff, factor) {
    if (!buff.stats) {
        return;
    }
    const attackCap = buff.buffId === PVP_SHA_INFUSION_BUFF_ID ? PVP_SHA_INFUSION_ATTACK_CAP_PERCENT : null;
    for (const [key, value] of Object.entries(buff.stats)) {
        if (value === undefined) {
            continue;
        }
        if (typeof value === 'number' && typeof target[key] === 'number') {
            let scaled = value * factor;
            if ((key === 'physAtk' || key === 'spellAtk') && attackCap !== null) {
                scaled = Math.min(scaled, attackCap);
            }
            target[key] += scaled;
            continue;
        }
        if (typeof value === 'object' && value) {
            const targetGroup = target[key];
            if (!targetGroup || typeof targetGroup !== 'object') {
                continue;
            }
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
                if (typeof nestedValue === 'number') {
                    targetGroup[nestedKey] += nestedValue * factor;
                }
            }
        }
    }
}

function resolveTechniqueStatesForCalculation(techniques, scratch) {
    let needsNormalization = false;
    for (const entry of techniques) {
        if (!entry || typeof entry !== 'object' || !Number.isFinite(Number(entry.level))) {
            needsNormalization = true;
            break;
        }
    }
    if (!needsNormalization) {
        return techniques;
    }
    scratch.length = 0;
    for (const entry of techniques) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        scratch.push({
            ...entry,
            name: entry.name ?? entry.techId,
            level: Number.isFinite(Number(entry.level)) ? entry.level : 1,
            exp: entry.exp ?? 0,
            expToNext: entry.expToNext ?? 0,
            realmLv: entry.realmLv ?? 1,
            realm: entry.realm ?? 0,
            skills: entry.skills ?? [],
        });
    }
    return scratch;
}

function resolveTechniqueBonusesForCalculation(techniqueState, scratch, cache) {
    const holder = techniqueState && typeof techniqueState === 'object' ? techniqueState : null;
    const revision = Math.max(0, Math.trunc(Number(holder?.revision ?? 0) || 0));
    if (holder) {
        const cached = cache.get(holder);
        if (cached?.revision === revision) {
            return cached;
        }
    }
    const techniques = resolveTechniqueStatesForCalculation(
        Array.isArray(holder?.techniques) ? holder.techniques : [],
        scratch,
    );
    const next = {
        revision,
        attrBonus: calcTechniqueFinalAttrBonus(techniques),
        maxAttrPercentBonus: calcTechniqueMaxAttrPercentBonus(techniques),
        specialStatBonus: calcTechniqueFinalSpecialStatBonus(techniques),
    };
    if (holder) {
        cache.set(holder, next);
    }
    return next;
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
        || source.startsWith('equip-effect:')
        || source.startsWith('body_training:')
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
        || !isSameAttributes(previous.rawBaseAttrs ?? createBaseAttributes(), next.rawBaseAttrs)
        || !isSameAttributes(previous.baseAttrs, next.baseAttrs)
        || !isSameAttributes(previous.finalAttrs, next.finalAttrs)
        || !isSameNumericStats(previous.numericStats, next.numericStats)
        || !isSameRatioDivisors(previous.ratioDivisors, next.ratioDivisors)
        || !isSameCraftEffectStats(previous.craftEffectStats, next.craftEffectStats);
}
/**
 * isSameAttributes：判断SameAttribute是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameAttribute的条件判断。
 */

function isSameAttributes(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const key of ATTR_KEYS) {
        if (left[key] !== right[key]) {
            return false;
        }
    }
    return true;
}

function isSameCraftEffectStats(left, right) {
    const normalizedLeft = cloneCraftEffectStats(left);
    const normalizedRight = cloneCraftEffectStats(right);
    for (const skillKind of CRAFT_EFFECT_SKILL_KINDS) {
        for (const effectKind of CRAFT_EFFECT_KINDS) {
            if (normalizedLeft[skillKind][effectKind] !== normalizedRight[skillKind][effectKind]) {
                return false;
            }
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
        && left.extraRange === right.extraRange
        && left.extraArea === right.extraArea
        && left.actionsPerTurn === right.actionsPerTurn
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
