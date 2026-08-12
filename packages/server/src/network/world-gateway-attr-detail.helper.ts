/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { ATTR_KEYS, ATTR_TO_NUMERIC_WEIGHTS, ATTR_TO_PERCENT_NUMERIC_WEIGHTS, CULTIVATE_EXP_PER_TICK, CULTIVATION_REALM_EXP_PER_TICK, DEFAULT_PLAYER_REALM_STAGE, ELEMENT_KEYS, NUMERIC_SCALAR_STAT_KEYS, PLAYER_REALM_CONFIG, TECHNIQUE_MAX_ATTR_PERCENT_BONUS_SOURCE, TechniqueRealm, addPartialNumericStats, applyEquipmentAttributeEffectivenessToItemStack, calcTechniqueFinalAttrBonus, calcTechniqueFinalSpecialStatBonus, calcTechniqueMaxAttrPercentBonus, calcTechniqueQiProjectionModifiers, cloneNumericStats, compileValueStatsToActualStats, createNumericStats, getRealmAttributeMultiplier, getRealmLinearGrowthMultiplier, percentModifierToMultiplier, resolvePlayerFacingContentName, resolvePlayerRealmAttributeBonus, resolvePlayerRealmNumericTemplate, type AttrBonus, type PartialNumericStats } from '@mud/shared';
import {
    PVP_SHA_INFUSION_ATTACK_CAP_PERCENT,
    PVP_SHA_INFUSION_BUFF_ID,
    PVP_SOUL_INJURY_BUFF_ID,
    resolvePvPSoulInjuryReductionPercent,
} from '../constants/gameplay/pvp';
import {
    HEAVENLY_DAO_SUPPRESSION_BUFF_ID,
    isHeavenlyDaoSuppressionCombatStatKey,
    resolveHeavenlyDaoSuppressionMultiplier,
    resolveHeavenlyDaoSuppressionPercentModifier,
} from '../constants/gameplay/virtual-world';
import { resolvePlayerDailySignInFortuneLuck } from '../runtime/player/player-special-stat.helpers';

type TechniqueEffectFingerprint = {
    techId: unknown;
    name: unknown;
    level: unknown;
    realmLv: unknown;
    realm: unknown;
    skillsEnabled: unknown;
    grade: unknown;
    category: unknown;
    learnTechniqueMaxLevel: unknown;
    skills: unknown;
    layers: unknown;
};

type TechniqueSpecialStats = ReturnType<typeof calcTechniqueFinalSpecialStatBonus>;

type TechniqueEffectCacheEntry = {
    techniquesRef: unknown[];
    sourceRevision: number;
    fingerprints: TechniqueEffectFingerprint[];
    effectRevision: number;
    specialStats: TechniqueSpecialStats;
    bonuses: AttrBonus[];
};

const techniqueEffectCache = new WeakMap<object, TechniqueEffectCacheEntry>();
const EMPTY_TECHNIQUE_SPECIAL_STATS: TechniqueSpecialStats = { comprehension: 0, luck: 0 };
const EMPTY_TECHNIQUE_DETAIL_BONUSES: AttrBonus[] = [];

export function buildAttrDetailBonuses(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const bonuses = [];
    const realmStage = player.realm?.stage ?? player.attrs?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const playerRealmLv = Math.max(1, Math.floor(Number(player.realm?.realmLv ?? 1) || 1));
    const realmConfig = PLAYER_REALM_CONFIG[realmStage];
    const realmAttrBonus = resolvePlayerRealmAttributeBonus(realmStage);
    if (realmConfig && hasNonZeroAttributes(realmAttrBonus)) {
        bonuses.push({
            source: `realm:${realmStage}`,
            label: player.realm?.displayName ?? player.realm?.name ?? '境界',
            attrs: clonePartialAttributes(realmAttrBonus),
        });
    }
    bonuses.push(...resolveTechniqueDetailBonuses(player));
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item ? applyEquipmentAttributeEffectivenessToItemStack(entry.item, playerRealmLv) : null;
        if (!item) {
            continue;
        }
        const progressEffects = resolveActiveEquipmentProgressEffects(item, player);
        if (!hasNonZeroAttributes(item.equipAttrs) && !hasNonZeroPartialNumericStats(resolveItemNumericStats(item))) {
            for (const effect of progressEffects) {
                appendEquipmentProgressEffectBonus(bonuses, entry.slot, item, effect);
            }
            continue;
        }
        bonuses.push({
            source: `equipment:${entry.slot}`,
            label: resolvePlayerFacingContentName(item.itemId, '未知物品', item.name),
            attrs: clonePartialAttributes(item.equipAttrs),
            stats: clonePartialNumericStats(resolveItemNumericStats(item)),
        });
        for (const effect of progressEffects) {
            appendEquipmentProgressEffectBonus(bonuses, entry.slot, item, effect);
        }
    }
    for (const buff of player.buffs?.buffs ?? []) {
        const heavenlyDaoSuppression = buff?.buffId === HEAVENLY_DAO_SUPPRESSION_BUFF_ID
            && Number(buff.remainingTicks) > 0
            && Number(buff.stacks) > 0;
        const pvpSoulInjury = buff?.buffId === PVP_SOUL_INJURY_BUFF_ID
            && Number(buff.remainingTicks) > 0
            && Number(buff.stacks) > 0;
        if (!heavenlyDaoSuppression
            && !pvpSoulInjury
            && !hasNonZeroAttributes(buff.attrs)
            && !hasNonZeroPartialNumericStats(buff.stats)
            && !Array.isArray(buff.qiProjection)) {
            continue;
        }
        const heavenlyDaoSuppressionPercent = heavenlyDaoSuppression
            ? resolveHeavenlyDaoSuppressionPercentModifier(buff.stacks)
            : 0;
        const pvpSoulInjuryPercent = pvpSoulInjury
            ? -resolvePvPSoulInjuryReductionPercent(buff.stacks)
            : 0;
        bonuses.push({
            source: `buff:${buff.buffId}`,
            label: resolvePlayerFacingContentName(buff.buffId, '未知增益', buff.name),
            attrs: heavenlyDaoSuppression
                ? Object.fromEntries(ATTR_KEYS.map((key) => [key, heavenlyDaoSuppressionPercent]))
                : pvpSoulInjury
                    ? Object.fromEntries(ATTR_KEYS.map((key) => [key, pvpSoulInjuryPercent]))
                    : clonePartialAttributes(buff.attrs),
            attrMode: heavenlyDaoSuppression || pvpSoulInjury ? 'percent' : resolveBuffModifierMode(buff.attrMode),
            stats: clonePartialNumericStats(buff.stats),
            qiProjection: cloneQiProjectionModifiers(buff.qiProjection),
            meta: {
                sourceSkillId: typeof buff.sourceSkillId === 'string' ? buff.sourceSkillId : '',
                ...(pvpSoulInjury ? { linearReductionPercent: true } : {}),
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
            label: resolvePlayerFacingContentName(bonus.source, '其他加成', bonus.label),
            attrs: clonePartialAttributes(bonus.attrs),
            stats: clonePartialNumericStats(bonus.stats),
            qiProjection: cloneQiProjectionModifiers(bonus.qiProjection),
            meta: isPlainObject(bonus.meta) ? { ...bonus.meta } : undefined,
        });
    }
    return bonuses;
}

function resolveTechniqueDetailBonuses(player): AttrBonus[] {
    const holder = player?.techniques;
    const sourceTechniques = Array.isArray(holder?.techniques) ? holder.techniques : [];
    if (!holder || typeof holder !== 'object' || sourceTechniques.length === 0) {
        return EMPTY_TECHNIQUE_DETAIL_BONUSES;
    }

    return resolveTechniqueEffectCache(player).bonuses;
}

/** 返回不受经验字段影响的功法效果 revision，供属性投影缓存使用。 */
export function getTechniqueEffectRevision(player): number {
    const holder = player?.techniques;
    const sourceTechniques = Array.isArray(holder?.techniques) ? holder.techniques : [];
    if (!holder || typeof holder !== 'object' || sourceTechniques.length === 0) {
        return 0;
    }
    return resolveTechniqueEffectCache(player).effectRevision;
}

/** 返回按功法效果字段缓存的特殊属性汇总。 */
export function getTechniqueFinalSpecialStatBonusCached(player): TechniqueSpecialStats {
    const holder = player?.techniques;
    const sourceTechniques = Array.isArray(holder?.techniques) ? holder.techniques : [];
    if (!holder || typeof holder !== 'object' || sourceTechniques.length === 0) {
        return EMPTY_TECHNIQUE_SPECIAL_STATS;
    }
    return resolveTechniqueEffectCache(player).specialStats;
}

function resolveTechniqueEffectCache(player): TechniqueEffectCacheEntry {
    const holder = player.techniques;
    const sourceTechniques = holder.techniques;
    const sourceRevision = normalizeTechniqueRevision(holder.revision);
    const cached = techniqueEffectCache.get(holder);
    if (cached && cached.techniquesRef === sourceTechniques) {
        if (cached.sourceRevision === sourceRevision) {
            return cached;
        }
        if (areTechniqueEffectInputsStable(cached.fingerprints, sourceTechniques)) {
            cached.sourceRevision = sourceRevision;
            return cached;
        }
    }
    if (cached && areTechniqueEffectInputsStable(cached.fingerprints, sourceTechniques)) {
        // 运行态重建可能只替换数组容器；只要效果输入顺序和内容不变，可以复用派生结果。
        cached.techniquesRef = sourceTechniques;
        cached.sourceRevision = sourceRevision;
        cached.fingerprints = sourceTechniques.map(buildTechniqueEffectFingerprint);
        return cached;
    }

    const techniqueStates = sourceTechniques.map(toTechniqueState);
    const bonuses: AttrBonus[] = [];
    const techniqueAttrs = calcTechniqueFinalAttrBonus(techniqueStates);
    if (hasNonZeroAttributes(techniqueAttrs)) {
        bonuses.push({
            source: 'technique:aggregate',
            label: '功法总成',
            attrs: clonePartialAttributes(techniqueAttrs),
        });
    }
    const techniqueMaxAttrPercentBonus = calcTechniqueMaxAttrPercentBonus(techniqueStates);
    if (hasNonZeroAttributes(techniqueMaxAttrPercentBonus)) {
        bonuses.push({
            source: TECHNIQUE_MAX_ATTR_PERCENT_BONUS_SOURCE,
            label: '万法归元',
            attrs: clonePartialAttributes(techniqueMaxAttrPercentBonus),
            attrMode: 'percent',
        });
    }
    for (const techniqueState of techniqueStates) {
        const qiProjection = calcTechniqueQiProjectionModifiers(techniqueState.level, techniqueState.layers);
        if (qiProjection.length === 0) {
            continue;
        }
        bonuses.push({
            source: `technique:${techniqueState.techId}`,
            label: resolvePlayerFacingContentName(techniqueState.techId, '未知功法', techniqueState.name),
            attrs: {},
            qiProjection: cloneQiProjectionModifiers(qiProjection),
        });
    }
    const next: TechniqueEffectCacheEntry = {
        techniquesRef: sourceTechniques,
        sourceRevision,
        fingerprints: sourceTechniques.map(buildTechniqueEffectFingerprint),
        effectRevision: (cached?.effectRevision ?? 0) + 1,
        specialStats: calcTechniqueFinalSpecialStatBonus(techniqueStates),
        bonuses,
    };
    techniqueEffectCache.set(holder, next);
    return next;
}

function buildTechniqueEffectFingerprint(entry): TechniqueEffectFingerprint {
    return {
        techId: entry?.techId,
        name: entry?.name,
        level: entry?.level,
        realmLv: entry?.realmLv,
        realm: entry?.realm,
        skillsEnabled: entry?.skillsEnabled,
        grade: entry?.grade,
        category: entry?.category,
        learnTechniqueMaxLevel: entry?.learnTechniqueMaxLevel,
        skills: entry?.skills,
        layers: entry?.layers,
    };
}

function normalizeTechniqueRevision(value: unknown): number {
    return Math.max(0, Math.trunc(Number(value ?? 0) || 0));
}

function areTechniqueEffectInputsStable(
    fingerprints: TechniqueEffectFingerprint[],
    sourceTechniques: unknown[],
): boolean {
    // exp/expToNext 只影响进度展示，不影响属性、特殊属性或气机投影，因此刻意排除。
    if (fingerprints.length !== sourceTechniques.length) {
        return false;
    }
    for (let index = 0; index < sourceTechniques.length; index += 1) {
        const current = sourceTechniques[index] as any;
        const previous = fingerprints[index];
        if (!previous
            || previous.techId !== current?.techId
            || previous.name !== current?.name
            || previous.level !== current?.level
            || previous.realmLv !== current?.realmLv
            || previous.realm !== current?.realm
            || previous.skillsEnabled !== current?.skillsEnabled
            || previous.grade !== current?.grade
            || previous.category !== current?.category
            || previous.learnTechniqueMaxLevel !== current?.learnTechniqueMaxLevel
            || previous.skills !== current?.skills
            || previous.layers !== current?.layers) {
            return false;
        }
    }
    return true;
}
/**
 * buildAttrDetailNumericStatBreakdowns：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Attr详情NumericStatBreakdown相关状态。
 */

export function buildAttrDetailNumericStatBreakdowns(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const stage = player.realm?.stage ?? player.attrs?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const template = resolvePlayerRealmNumericTemplate(stage);
    const realmLv = Math.max(1, Math.floor(Number(player.realm?.realmLv ?? 1) || 1));
    const realmBaseStats = template?.stats ? cloneNumericStats(template.stats) : createNumericStats();
    const baseStats = cloneNumericStats(realmBaseStats);
    const flatBuffStats = createNumericStats();
    const buffMultiplierStats = createNumericStats();
    const pillMultiplierStats = createNumericStats();
    const attrMultipliers = createNumericStats();
    const finalAttrs = player.attrs?.finalAttrs ?? player.attrs?.baseAttrs;
    const heavenlyDaoSuppressionStacks = resolveActiveBuffStacks(
        player.buffs?.buffs,
        HEAVENLY_DAO_SUPPRESSION_BUFF_ID,
    );
    const heavenlyDaoSuppressionMultiplier = resolveHeavenlyDaoSuppressionMultiplier(heavenlyDaoSuppressionStacks);
    if (finalAttrs) {
        for (const key of ATTR_KEYS) {
            const value = Number(finalAttrs[key] ?? 0) / heavenlyDaoSuppressionMultiplier;
            if (value === 0) {
                continue;
            }
            addPartialNumericStats(baseStats, scalePartialNumericStats(ATTR_TO_NUMERIC_WEIGHTS[key], value));
            addPartialNumericStats(attrMultipliers, scalePartialNumericStats(ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key], value));
        }
    }
    applySpecialStatWeights(baseStats, player, resolveTechniqueSpecialStatBonus(player.techniques?.techniques ?? []));
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item ? applyEquipmentAttributeEffectivenessToItemStack(entry.item, realmLv) : null;
        if (!item) {
            continue;
        }
        addPartialNumericStats(baseStats, resolveItemNumericStats(item));
        for (const effect of resolveActiveEquipmentProgressEffects(item, player)) {
            addPartialNumericStats(baseStats, resolveItemNumericStats({ equipStats: effect.stats, equipValueStats: effect.valueStats }));
        }
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (bonus?.stats) {
            addPartialNumericStats(baseStats, bonus.stats);
        }
    }
    const vitalBaselineBonus = resolveVitalBaselineBonus(player.runtimeBonuses);
    if (vitalBaselineBonus?.stats) {
        addPartialNumericStats(baseStats, vitalBaselineBonus.stats);
    }
    for (const buff of getActiveBuffs(player.buffs?.buffs)) {
        if (!buff?.stats) {
            continue;
        }
        const effectFactor = getBuffEffectFactor(buff, realmLv);
        if (effectFactor === 0) {
            continue;
        }
        const scaledStats = scaleBuffNumericStats(buff, effectFactor);
        if (!scaledStats) {
            continue;
        }
        if (resolveBuffModifierMode(buff.statMode) === 'percent') {
            const target = isPillStatBuff(buff) ? pillMultiplierStats : buffMultiplierStats;
            addPartialNumericStats(target, scaledStats);
        }
        else {
            addPartialNumericStats(flatBuffStats, scaledStats);
        }
    }
    flatBuffStats.realmExpPerTick += CULTIVATION_REALM_EXP_PER_TICK;
    flatBuffStats.techniqueExpPerTick += CULTIVATE_EXP_PER_TICK;
    const preMultiplierStats = cloneNumericStats(baseStats);
    addPartialNumericStats(preMultiplierStats, flatBuffStats);
    const finalStats = player.attrs?.numericStats ?? preMultiplierStats;
    const breakdowns = {};
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
        const realmBaseValue = getNumericStatValue(realmBaseStats, key);
        const baseValue = getNumericStatValue(baseStats, key);
        const flatBuffValue = getNumericStatValue(flatBuffStats, key);
        const combatSuppressionMultiplier = isHeavenlyDaoSuppressionCombatStatKey(key)
            ? heavenlyDaoSuppressionMultiplier
            : 1;
        const buffMultiplierPct = getNumericStatValue(buffMultiplierStats, key);
        const combinedBuffMultiplierPct = combatSuppressionMultiplier < 1
            ? multiplierToPercentModifier(
                percentModifierToMultiplier(buffMultiplierPct) * combatSuppressionMultiplier,
            )
            : buffMultiplierPct;
        breakdowns[key] = {
            realmBaseValue,
            bonusBaseValue: baseValue - realmBaseValue,
            baseValue,
            flatBuffValue,
            preMultiplierValue: getNumericStatValue(preMultiplierStats, key),
            attrMultiplierPct: getNumericStatValue(attrMultipliers, key),
            realmMultiplier: getRealmNumericMultiplier(key, realmLv),
            buffMultiplierPct: combinedBuffMultiplierPct,
            pillMultiplierPct: getNumericStatValue(pillMultiplierStats, key),
            finalValue: getNumericStatValue(finalStats, key),
        };
    }
    return breakdowns;
}

function resolveActiveBuffStacks(buffs, buffId) {
    const buff = Array.isArray(buffs)
        ? buffs.find((entry) => entry?.buffId === buffId && Number(entry.remainingTicks) > 0 && Number(entry.stacks) > 0)
        : null;
    return buff ? Math.max(0, Math.trunc(Number(buff.stacks) || 0)) : 0;
}

function multiplierToPercentModifier(multiplierInput) {
    const multiplier = Number(multiplierInput);
    if (!Number.isFinite(multiplier) || multiplier === 1) {
        return 0;
    }
    return multiplier > 1
        ? (multiplier - 1) * 100
        : -(1 / Math.max(Number.EPSILON, multiplier) - 1) * 100;
}

function applySpecialStatWeights(target, player, techniqueSpecialStats) {
    const equipmentSpecialStats = resolveEquipmentSpecialStats(player);
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

function resolveEquipmentSpecialStats(player) {
    const result = { comprehension: 0, luck: 0 };
    const realmLv = Math.max(1, Math.floor(Number(player?.realm?.realmLv ?? 1) || 1));
    for (const entry of player?.equipment?.slots ?? []) {
        const item = entry?.item;
        if (!item) {
            continue;
        }
        const effectiveItem = applyEquipmentAttributeEffectivenessToItemStack(item, realmLv);
        result.comprehension += Math.max(0, Math.trunc(Number(effectiveItem.equipSpecialStats?.comprehension ?? 0) || 0));
        result.luck += Math.max(0, Math.trunc(Number(effectiveItem.equipSpecialStats?.luck ?? 0) || 0));
    }
    return result;
}

function resolveTechniqueSpecialStatBonus(techniques) {
    return calcTechniqueFinalSpecialStatBonus(techniques.map(toTechniqueState));
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
    'qiRegenRate',
    'hpRegenRate',
]);

const REALM_LINEAR_NUMERIC_GROWTH_RATES = {
    critDamage: 0.1,
    realmExpPerTick: 0.1,
    techniqueExpPerTick: 0.1,
};

function getRealmNumericMultiplier(key, realmLv) {
    if (REALM_EXPONENTIAL_NUMERIC_KEY_SET.has(key)) {
        return getRealmAttributeMultiplier(realmLv);
    }
    const linearGrowthRate = REALM_LINEAR_NUMERIC_GROWTH_RATES[key];
    if (typeof linearGrowthRate === 'number') {
        return getRealmLinearGrowthMultiplier(realmLv, linearGrowthRate);
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
    const result: PartialNumericStats = {};
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
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
        const scaledGroup: Record<string, number> = {};
        for (const key of ELEMENT_KEYS) {
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

function isPillStatBuff(buff) {
    const sourceSkillId = typeof buff?.sourceSkillId === 'string' ? buff.sourceSkillId : '';
    const buffId = typeof buff?.buffId === 'string' ? buff.buffId : '';
    return sourceSkillId.startsWith('item:') || sourceSkillId.startsWith('pill.') || buffId.startsWith('item_buff.');
}

function resolveBuffModifierMode(mode) {
    return mode === 'flat' ? 'flat' : 'percent';
}

function getActiveBuffs(buffs) {
    return Array.isArray(buffs)
        ? buffs.filter((buff) => buff && buff.remainingTicks > 0 && buff.stacks > 0)
        : [];
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

function scaleBuffNumericStats(buff, factor) {
    const scaled = scalePartialNumericStats(buff.stats, factor);
    if (!scaled || buff.buffId !== PVP_SHA_INFUSION_BUFF_ID) {
        return scaled;
    }
    if (scaled.physAtk !== undefined) {
        scaled.physAtk = Math.min(scaled.physAtk, PVP_SHA_INFUSION_ATTACK_CAP_PERCENT);
    }
    if (scaled.spellAtk !== undefined) {
        scaled.spellAtk = Math.min(scaled.spellAtk, PVP_SHA_INFUSION_ATTACK_CAP_PERCENT);
    }
    return scaled;
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
    return item?.equipValueStats ? compileValueStatsToActualStats(item.equipValueStats) : item?.equipStats;
}

function appendEquipmentProgressEffectBonus(bonuses, slot, item, effect) {
    const effectStats = resolveItemNumericStats({ equipStats: effect.stats, equipValueStats: effect.valueStats });
    if (!hasNonZeroPartialNumericStats(effectStats)) {
        return;
    }
    bonuses.push({
        source: `equipment:${slot}:effect:${effect.effectId ?? 'progress_boost'}`,
        label: resolvePlayerFacingContentName(item.itemId, '未知物品', item.name),
        attrs: {},
        stats: clonePartialNumericStats(effectStats),
    });
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
    return ATTR_KEYS.some((key) => Number(attrs[key] ?? 0) !== 0);
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
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
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
    for (const key of ATTR_KEYS) {
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
    const clone: PartialNumericStats = {};
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
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
        name: resolvePlayerFacingContentName(entry.techId, '未知功法', entry.name),
        level: entry.level ?? 1,
        exp: entry.exp ?? 0,
        expToNext: entry.expToNext ?? 0,
        realmLv: entry.realmLv ?? 1,
        realm: entry.realm ?? TechniqueRealm.Entry,
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
