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
const shared_1 = require("@mud/shared-next");
let PlayerAttributesService = class PlayerAttributesService {
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
    recalculate(player) {
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
    markPanelDirty(player) {
        player.attrs.revision += 1;
        player.selfRevision += 1;
    }
    buildState(player) {
        const stage = player.realm?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
        const template = shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[stage];
        const runtimeBonuses = Array.isArray(player.runtimeBonuses) ? player.runtimeBonuses : [];
        const compatibleRuntimeBonuses = collectCompatibleRuntimeBonuses(runtimeBonuses);
        const vitalBaselineBonus = resolveVitalBaselineBonus(runtimeBonuses);
        const baseAttrs = createBaseAttributes();
        const techniqueAttrBonus = resolveTechniqueAttrBonus(player.techniques.techniques, runtimeBonuses);
        addAttributes(baseAttrs, shared_1.PLAYER_REALM_CONFIG[stage].attrBonus);
        addAttributes(baseAttrs, techniqueAttrBonus);
        for (const bonus of compatibleRuntimeBonuses) {
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
        for (const bonus of compatibleRuntimeBonuses) {
            (0, shared_1.addPartialNumericStats)(numericStats, bonus.stats);
        }
        applyPercentBonuses(numericStats, percentBonuses);
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
function applySpiritualRoots(target, roots) {
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
function createPercentBonusAccumulator() {
    return {
        maxHp: 0,
        maxQi: 0,
        physAtk: 0,
        spellAtk: 0,
    };
}
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
function addAttributes(target, patch) {
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
function clampAttributes(target) {
    for (const key of shared_1.ATTR_KEYS) {
        target[key] = Math.max(0, target[key]);
    }
}
function applyAttrWeight(target, key, value) {
    const weight = shared_1.ATTR_TO_NUMERIC_WEIGHTS[key];
    if (!weight) {
        return;
    }
    (0, shared_1.addPartialNumericStats)(target, scalePartialNumericStats(weight, value));
}
function accumulateAttrPercentBonus(target, key, value) {
    const weight = shared_1.ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key];
    if (!weight) {
        return;
    }
    if (weight.maxHp !== undefined)
        target.maxHp += weight.maxHp * value;
    if (weight.maxQi !== undefined)
        target.maxQi += weight.maxQi * value;
    if (weight.physAtk !== undefined)
        target.physAtk += weight.physAtk * value;
    if (weight.spellAtk !== undefined)
        target.spellAtk += weight.spellAtk * value;
}
function applyPercentBonuses(target, bonuses) {
    if (bonuses.maxHp !== 0)
        target.maxHp *= 1 + bonuses.maxHp / 100;
    if (bonuses.maxQi !== 0)
        target.maxQi *= 1 + bonuses.maxQi / 100;
    if (bonuses.physAtk !== 0)
        target.physAtk *= 1 + bonuses.physAtk / 100;
    if (bonuses.spellAtk !== 0)
        target.spellAtk *= 1 + bonuses.spellAtk / 100;
}
function resolveItemStats(equipStats, equipValueStats) {
    return equipValueStats ? (0, shared_1.compileValueStatsToActualStats)(equipValueStats) : equipStats;
}
function scalePartialNumericStats(source, multiplier) {
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
function collectCompatibleRuntimeBonuses(bonuses) {
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
function resolveTechniqueAttrBonus(techniques, runtimeBonuses) {
    const aggregateBonus = Array.isArray(runtimeBonuses)
        ? runtimeBonuses.find((entry) => entry?.source === 'runtime:technique_aggregate' && entry.attrs && typeof entry.attrs === 'object')
        : null;
    if (aggregateBonus?.attrs) {
        return aggregateBonus.attrs;
    }
    return (0, shared_1.calcTechniqueFinalAttrBonus)(techniques.map(toTechniqueState));
}
function resolveVitalBaselineBonus(runtimeBonuses) {
    return Array.isArray(runtimeBonuses)
        ? runtimeBonuses.find((entry) => entry?.source === 'runtime:vitals_baseline' && entry.stats && typeof entry.stats === 'object')
        : null;
}
function isDerivedRuntimeBonusSource(source) {
    return source === 'runtime:realm_stage'
        || source === 'runtime:realm_state'
        || source === 'runtime:heaven_gate_roots'
        || source === 'runtime:vitals_baseline'
        || source === 'runtime:technique_aggregate'
        || source.startsWith('technique:')
        || source.startsWith('equip:')
        || source.startsWith('equipment:')
        || source.startsWith('buff:');
}
function hasAttrStateChanged(previous, next) {
    return previous.stage !== next.stage
        || !isSameAttributes(previous.baseAttrs, next.baseAttrs)
        || !isSameAttributes(previous.finalAttrs, next.finalAttrs)
        || !isSameNumericStats(previous.numericStats, next.numericStats)
        || !isSameRatioDivisors(previous.ratioDivisors, next.ratioDivisors);
}
function isSameAttributes(left, right) {
    for (const key of shared_1.ATTR_KEYS) {
        if (left[key] !== right[key]) {
            return false;
        }
    }
    return true;
}
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
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=player-attributes.service.js.map
