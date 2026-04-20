// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSyncPlayerStateService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
/** player sync state 服务：承接 bootstrap self 状态与相关只读转换。 */
let WorldSyncPlayerStateService = class WorldSyncPlayerStateService {
/**
 * buildPlayerSyncState：构建并返回目标对象。
 * @param player 玩家对象。
 * @param view 参数说明。
 * @param unlockedMinimapIds unlockedMinimap ID 集合。
 * @returns 无返回值，直接更新玩家Sync状态相关状态。
 */

    buildPlayerSyncState(player, view, unlockedMinimapIds) {
        return buildPlayerSyncState(player, view, unlockedMinimapIds);
    }
};
exports.WorldSyncPlayerStateService = WorldSyncPlayerStateService;
exports.WorldSyncPlayerStateService = WorldSyncPlayerStateService = __decorate([
    (0, common_1.Injectable)()
], WorldSyncPlayerStateService);
/**
 * buildPlayerSyncState：构建并返回目标对象。
 * @param player 玩家对象。
 * @param view 参数说明。
 * @param unlockedMinimapIds unlockedMinimap ID 集合。
 * @returns 无返回值，直接更新玩家Sync状态相关状态。
 */

function buildPlayerSyncState(player, view, unlockedMinimapIds) {
    return {
        id: player.playerId,
        name: player.name,
        displayName: player.displayName,
        online: true,
        inWorld: true,
        senseQiActive: player.combat.senseQiActive,
        autoRetaliate: player.combat.autoRetaliate,
        autoBattleStationary: player.combat.autoBattleStationary,
        allowAoePlayerHit: player.combat.allowAoePlayerHit,
        autoIdleCultivation: player.combat.autoIdleCultivation,
        autoSwitchCultivation: player.combat.autoSwitchCultivation,
        cultivationActive: player.combat.cultivationActive,
        mapId: view.instance.templateId,
        x: player.x,
        y: player.y,
        facing: player.facing,
        viewRange: Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
        hp: player.hp,
        maxHp: player.maxHp,
        qi: player.qi,
        dead: player.hp <= 0,
        foundation: player.foundation,
        combatExp: player.combatExp,
        boneAgeBaseYears: player.boneAgeBaseYears,
        lifeElapsedTicks: player.lifeElapsedTicks,
        lifespanYears: player.lifespanYears,
        baseAttrs: cloneAttributes(player.attrs.baseAttrs),
        bonuses: buildAttrBonuses(player),
        temporaryBuffs: player.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
        finalAttrs: cloneAttributes(player.attrs.finalAttrs),
        numericStats: (0, shared_1.cloneNumericStats)(player.attrs.numericStats),
        ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(player.attrs.ratioDivisors),
        inventory: {
            capacity: player.inventory.capacity,
            items: player.inventory.items.map((entry) => toItemStackState(entry)),
        },
        marketStorage: {
            items: [],
        },
        equipment: buildEquipmentRecord(player.equipment.slots),
        techniques: player.techniques.techniques.map((entry) => toTechniqueState(entry)),
        bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : undefined,
        alchemySkill: player.alchemySkill ? { ...player.alchemySkill } : undefined,
        gatherSkill: player.gatherSkill ? { ...player.gatherSkill } : undefined,
        enhancementSkill: player.enhancementSkill ? { ...player.enhancementSkill } : undefined,
        enhancementSkillLevel: player.enhancementSkillLevel,
        actions: player.actions.actions.map((entry) => toActionDefinition(entry)),
        quests: player.quests.quests.map((entry) => cloneQuestState(entry)),
        realm: cloneRealmState(player.realm) ?? undefined,
        realmLv: player.realm?.realmLv,
        realmName: player.realm?.name,
        realmStage: player.realm?.shortName || undefined,
        realmReview: player.realm?.review,
        breakthroughReady: player.realm?.breakthroughReady,
        heavenGate: cloneHeavenGateState(player.heavenGate) ?? undefined,
        spiritualRoots: cloneHeavenGateRoots(player.spiritualRoots) ?? undefined,
        autoBattle: player.combat.autoBattle,
        autoBattleSkills: player.combat.autoBattleSkills.map((entry) => ({ ...entry })),
        autoUsePills: player.combat.autoUsePills.map((entry) => ({
            ...entry,
            conditions: Array.isArray(entry.conditions) ? entry.conditions.map((condition) => ({ ...condition })) : [],
        })),
        combatTargetingRules: player.combat.combatTargetingRules ? { ...player.combat.combatTargetingRules } : undefined,
        autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
        combatTargetId: player.combat.combatTargetId ?? undefined,
        combatTargetLocked: player.combat.combatTargetLocked,
        cultivatingTechId: player.techniques.cultivatingTechId ?? undefined,
        unlockedMinimapIds,
    };
}
/**
 * normalizeActionEntry：规范化或转换Action条目。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新Action条目相关状态。
 */

function normalizeActionEntry(entry) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedId = entry.id.startsWith('npc_quests:')
        ? `npc:${entry.id.slice('npc_quests:'.length)}`
        : entry.id;
    if (normalizedId === entry.id) {
        return cloneActionEntry(entry);
    }
    return {
        ...cloneActionEntry(entry),
        id: normalizedId,
    };
}
/**
 * buildEquipmentRecord：构建并返回目标对象。
 * @param entries 参数说明。
 * @returns 无返回值，直接更新装备Record相关状态。
 */

function buildEquipmentRecord(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const record = {
        weapon: null,
        head: null,
        body: null,
        legs: null,
        accessory: null,
    };
    for (const slot of shared_1.EQUIP_SLOTS) {
        const entry = entries.find((candidate) => candidate.slot === slot);
        record[slot] = entry?.item ? toItemStackState(entry.item) : null;
    }
    return record;
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
        })),
        attrCurves: entry.attrCurves ? { ...entry.attrCurves } : undefined,
    };
}
/**
 * toActionDefinition：执行toActionDefinition相关逻辑。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新toActionDefinition相关状态。
 */

function toActionDefinition(entry) {
    const normalizedEntry = normalizeActionEntry(entry);
    return {
        id: normalizedEntry.id,
        name: normalizedEntry.name ?? normalizedEntry.id,
        type: normalizedEntry.type ?? 'interact',
        desc: normalizedEntry.desc ?? '',
        cooldownLeft: normalizedEntry.cooldownLeft ?? 0,
        range: normalizedEntry.range ?? undefined,
        requiresTarget: normalizedEntry.requiresTarget ?? undefined,
        targetMode: normalizedEntry.targetMode ?? undefined,
        autoBattleEnabled: normalizedEntry.autoBattleEnabled ?? undefined,
        autoBattleOrder: normalizedEntry.autoBattleOrder ?? undefined,
        skillEnabled: normalizedEntry.skillEnabled ?? undefined,
    };
}
/**
 * toItemStackState：执行to道具Stack状态相关逻辑。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新to道具Stack状态相关状态。
 */

function toItemStackState(entry) {
    return {
        itemId: entry.itemId,
        name: entry.name ?? entry.itemId,
        type: entry.type ?? 'material',
        count: entry.count,
        desc: entry.desc ?? '',
        groundLabel: entry.groundLabel,
        grade: entry.grade,
        level: entry.level,
        equipSlot: entry.equipSlot,
        equipAttrs: entry.equipAttrs ? { ...entry.equipAttrs } : undefined,
        equipStats: entry.equipStats ? { ...entry.equipStats } : undefined,
        equipValueStats: entry.equipValueStats ? { ...entry.equipValueStats } : undefined,
        effects: entry.effects?.map((effect) => ({ ...effect })),
        healAmount: entry.healAmount,
        healPercent: entry.healPercent,
        qiPercent: entry.qiPercent,
        consumeBuffs: entry.consumeBuffs?.map((buff) => ({ ...buff })),
        tags: entry.tags?.slice(),
        mapUnlockId: entry.mapUnlockId,
        mapUnlockIds: entry.mapUnlockIds?.slice(),
        tileAuraGainAmount: entry.tileAuraGainAmount,
        allowBatchUse: entry.allowBatchUse,
    };
}
/**
 * cloneActionEntry：构建Action条目。
 * @param source 来源对象。
 * @returns 无返回值，直接更新Action条目相关状态。
 */

function cloneActionEntry(source) {
    return { ...source };
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
 * buildAttrBonuses：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新AttrBonuse相关状态。
 */

function buildAttrBonuses(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const bonuses = [];
    const realmStage = player.realm?.stage ?? player.attrs.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const realmConfig = shared_1.PLAYER_REALM_CONFIG[realmStage];
    if (realmConfig && hasNonZeroAttributes(realmConfig.attrBonus)) {
        bonuses.push({
            source: `realm:${realmStage}`,
            label: player.realm?.displayName ?? player.realm?.name ?? '境界',
            attrs: clonePartialAttributes(realmConfig.attrBonus),
        });
    }
    for (const technique of player.techniques.techniques) {
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
    for (const slot of player.equipment.slots) {
        const item = slot.item;
        if (!item || (!hasNonZeroAttributes(item.equipAttrs) && !hasNonZeroPartialNumericStats(item.equipStats))) {
            continue;
        }
        bonuses.push({
            source: `equipment:${slot.slot}`,
            label: item.name ?? item.itemId ?? slot.slot,
            attrs: clonePartialAttributes(item.equipAttrs),
            stats: item.equipStats ? { ...item.equipStats } : undefined,
        });
    }
    for (const buff of player.buffs.buffs) {
        if (!hasNonZeroAttributes(buff.attrs) && !hasNonZeroPartialNumericStats(buff.stats) && !Array.isArray(buff.qiProjection)) {
            continue;
        }
        bonuses.push({
            source: `buff:${buff.buffId}`,
            label: buff.name ?? buff.buffId,
            attrs: clonePartialAttributes(buff.attrs),
            stats: buff.stats ? { ...buff.stats } : undefined,
            qiProjection: buff.qiProjection?.map((entry) => ({ ...entry })),
        });
    }
    for (const bonus of player.attrBonuses ?? []) {
        if (!hasNonZeroAttributes(bonus.attrs)
            && !hasNonZeroPartialNumericStats(bonus.stats)
            && !hasNonZeroPartialNumericStats(bonus.meta)
            && !Array.isArray(bonus.qiProjection)) {
            continue;
        }
        bonuses.push({
            source: bonus.source,
            label: bonus.label,
            attrs: clonePartialAttributes(bonus.attrs),
            stats: bonus.stats ? { ...bonus.stats } : undefined,
            meta: bonus.meta ? { ...bonus.meta } : undefined,
            qiProjection: bonus.qiProjection?.map((entry) => ({ ...entry })),
        });
    }
    return bonuses;
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
    return Object.values(attrs).some((value) => Number(value ?? 0) !== 0);
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
    return Object.values(stats).some((value) => Number(value ?? 0) !== 0);
}
/**
 * clonePartialAttributes：构建PartialAttribute。
 * @param attrs 参数说明。
 * @returns 无返回值，直接更新PartialAttribute相关状态。
 */

function clonePartialAttributes(attrs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!attrs) {
        return undefined;
    }
    const clone = {};
    for (const [key, value] of Object.entries(attrs)) {
        if (typeof value === 'number') {
            clone[key] = value;
        }
    }
    return Object.keys(clone).length > 0 ? clone : undefined;
}
/**
 * cloneTemporaryBuff：构建TemporaryBuff。
 * @param source 来源对象。
 * @returns 无返回值，直接更新TemporaryBuff相关状态。
 */

function cloneTemporaryBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection?.map((entry) => ({ ...entry })),
    };
}
/**
 * cloneQuestState：构建任务状态。
 * @param source 来源对象。
 * @returns 无返回值，直接更新任务状态相关状态。
 */

function cloneQuestState(source) {
    return {
        ...source,
        rewardItemIds: source.rewardItemIds.slice(),
        rewards: source.rewards.map((entry) => ({ ...entry })),
    };
}
/**
 * cloneRealmState：构建Realm状态。
 * @param source 来源对象。
 * @returns 无返回值，直接更新Realm状态相关状态。
 */

function cloneRealmState(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!source) {
        return null;
    }
    return {
        ...source,
        breakthroughItems: source.breakthroughItems.map((entry) => ({ ...entry })),
        breakthrough: source.breakthrough
            ? {
                ...source.breakthrough,
                requirements: source.breakthrough.requirements.map((entry) => ({ ...entry })),
            }
            : undefined,
        heavenGate: cloneHeavenGateState(source.heavenGate),
    };
}
/**
 * cloneHeavenGateState：构建HeavenGate状态。
 * @param source 来源对象。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

function cloneHeavenGateState(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!source) {
        return null;
    }
    return {
        unlocked: source.unlocked,
        severed: source.severed.slice(),
        roots: cloneHeavenGateRoots(source.roots),
        entered: source.entered,
        averageBonus: source.averageBonus,
    };
}
/**
 * cloneHeavenGateRoots：构建HeavenGate根容器。
 * @param source 来源对象。
 * @returns 无返回值，直接更新HeavenGate根容器相关状态。
 */

function cloneHeavenGateRoots(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!source) {
        return null;
    }
    return {
        metal: source.metal,
        wood: source.wood,
        water: source.water,
        fire: source.fire,
        earth: source.earth,
    };
}
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

export { WorldSyncPlayerStateService };
