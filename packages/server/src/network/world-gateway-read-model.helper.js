"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayReadModelHelper = void 0;

const shared_1 = require("@mud/shared-next");

/** 世界 socket 读模型 helper：只收敛请求详情/排行/摘要入口。 */
class WorldGatewayReadModelHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleNextRequestAttrDetail(client, _payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const player = this.gateway.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            const bonuses = buildAttrDetailBonuses(player);
            const numericStatBreakdowns = buildAttrDetailNumericStatBreakdowns(player);
            client.emit(shared_1.NEXT_S2C.AttrDetail, {
                baseAttrs: { ...player.attrs.baseAttrs },
                bonuses,
                finalAttrs: { ...player.attrs.finalAttrs },
                numericStats: (0, shared_1.cloneNumericStats)(player.attrs.numericStats),
                ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(player.attrs.ratioDivisors),
                numericStatBreakdowns,
                alchemySkill: player.alchemySkill,
                gatherSkill: player.gatherSkill,
                enhancementSkill: player.enhancementSkill,
            });
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_ATTR_DETAIL_FAILED', error);
        }
    }
    handleNextRequestLeaderboard(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.Leaderboard, this.gateway.leaderboardRuntimeService.buildLeaderboard(payload?.limit));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_LEADERBOARD_FAILED', error);
        }
    }
    handleNextRequestWorldSummary(client, _payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.WorldSummary, this.gateway.leaderboardRuntimeService.buildWorldSummary());
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_WORLD_SUMMARY_FAILED', error);
        }
    }
    handleRequestDetail(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.Detail, this.gateway.worldRuntimeService.buildDetail(playerId, {
                kind: payload?.kind,
                id: payload?.id ?? '',
            }));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_DETAIL_FAILED', error);
        }
    }
    handleRequestTileDetail(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.TileDetail, this.gateway.worldRuntimeService.buildTileDetail(playerId, {
                x: payload?.x,
                y: payload?.y,
            }));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_TILE_DETAIL_FAILED', error);
        }
    }
}
exports.WorldGatewayReadModelHelper = WorldGatewayReadModelHelper;

function buildAttrDetailBonuses(player) {
    const bonuses = [];
    const realmStage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const realmConfig = shared_1.PLAYER_REALM_CONFIG[realmStage];
    if (realmConfig && hasNonZeroAttributes(realmConfig.attrBonus)) {
        bonuses.push({
            source: `realm:${realmStage}`,
            label: player.realm?.displayName ?? player.realm?.name ?? '境界',
            attrs: clonePartialAttributes(realmConfig.attrBonus),
        });
    }
    for (const technique of player.techniques?.techniques ?? []) {
        const techniqueAttrs = (0, shared_1.calcTechniqueFinalAttrBonus)([toTechniqueState(technique)]);
        if (!hasNonZeroAttributes(techniqueAttrs)) {
            continue;
        }
        bonuses.push({
            source: `technique:${technique.techId}`,
            label: technique.techId,
            attrs: clonePartialAttributes(techniqueAttrs),
        });
    }
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item;
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
            stats: clonePartialNumericStats(buff.stats),
            qiProjection: cloneQiProjectionModifiers(buff.qiProjection),
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
function buildAttrDetailNumericStatBreakdowns(player) {
    const stage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const template = shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[stage] ?? shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE];
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
    for (const entry of player.equipment?.slots ?? []) {
        const item = entry.item;
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
            realmMultiplier: 1,
            buffMultiplierPct: 0,
            pillMultiplierPct: 0,
            finalValue: getNumericStatValue(finalStats, key),
        };
    }
    return breakdowns;
}
function getNumericStatValue(stats, key) {

    const value = stats?.[key];
    return typeof value === 'number' ? value : 0;
}
function scalePartialNumericStats(stats, factor) {
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
function collectProjectedRuntimeBonuses(runtimeBonuses) {
    if (!Array.isArray(runtimeBonuses) || runtimeBonuses.length === 0) {
        return [];
    }
    return runtimeBonuses.filter((entry) => {
        const source = typeof entry?.source === 'string' ? entry.source : '';
        return Boolean(source && !isDerivedRuntimeBonusSource(source) && (entry.attrs || entry.stats));
    });
}
function resolveVitalBaselineBonus(runtimeBonuses) {
    return Array.isArray(runtimeBonuses)
        ? runtimeBonuses.find((entry) => entry?.source === 'runtime:vitals_baseline' && entry.stats && typeof entry.stats === 'object')
        : null;
}
function isDerivedRuntimeBonusSource(source) {
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
function resolveItemNumericStats(item) {
    return item?.equipValueStats ? (0, shared_1.compileValueStatsToActualStats)(item.equipValueStats) : item?.equipStats;
}
function hasNonZeroAttributes(attrs) {
    if (!attrs) {
        return false;
    }
    return shared_1.ATTR_KEYS.some((key) => Number(attrs[key] ?? 0) !== 0);
}
function hasNonZeroPartialNumericStats(stats) {
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
function clonePartialAttributes(attrs) {
    const result = {};
    for (const key of shared_1.ATTR_KEYS) {
        const value = Number(attrs?.[key] ?? 0);
        if (value !== 0) {
            result[key] = value;
        }
    }
    return result;
}
function clonePartialNumericStats(stats) {
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
function cloneQiProjectionModifiers(source) {
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
        })),
        attrCurves: entry.attrCurves ? { ...entry.attrCurves } : undefined,
    };
}
function cloneTechniqueSkill(source) {
    return {
        ...source,
        name: '',
        desc: '',
    };
}
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
