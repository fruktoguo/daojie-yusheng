// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldProjectorService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");
const player_combat_config_helpers_1 = require("../runtime/player/player-combat-config.helpers");

/** 属性差量阈值，超过后用绝对值而不是 patch 发送。 */
const ATTR_DELTA_PATCH_THRESHOLD = 10;

/** 角色属性键，用于比较与构造投影数据。 */
const ATTRIBUTE_KEYS = ['constitution', 'spirit', 'perception', 'talent', 'comprehension', 'luck'];

/** 数值属性键，决定 self/world 面板里的基础数值投影。 */
const NUMERIC_STAT_KEYS = [
    'maxHp',
    'maxQi',
    'physAtk',
    'spellAtk',
    'physDef',
    'spellDef',
    'hit',
    'dodge',
    'crit',
    'critDamage',
    'breakPower',
    'resolvePower',
    'maxQiOutputPerTick',
    'qiRegenRate',
    'hpRegenRate',
    'cooldownSpeed',
    'auraCostReduce',
    'auraPowerRate',
    'playerExpRate',
    'techniqueExpRate',
    'realmExpPerTick',
    'techniqueExpPerTick',
    'lootRate',
    'rareLootRate',
    'viewRange',
    'moveSpeed',
    'extraAggroRate',
    'extraRange',
    'extraArea',
];

/** 比率分母相关的属性键。 */
const RATIO_DIVISOR_KEYS = [
    'dodge',
    'crit',
    'breakPower',
    'resolvePower',
    'cooldownSpeed',
    'moveSpeed',
];

/** 元素属性组键。 */
const ELEMENT_GROUP_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'];
/** 世界投影服务：把 runtime 视图压缩成 next 协议的初始包和增量包。 */
let WorldProjectorService = class WorldProjectorService {
    /** 记录每个玩家上一次投影快照，用于生成增量。 */
    cacheByPlayerId = new Map();
    /** 生成玩家首次进入时的完整投影包。 */
    createInitialEnvelope(binding, view, player) {
        this.cacheByPlayerId.set(binding.playerId, captureProjectorState(view, player));
        return {
            initSession: {
                sid: binding.sessionId,
                pid: binding.playerId,
                t: view.tick,
                resumed: binding.resumed || undefined,
            },
            mapEnter: buildMapEnter(view),
            worldDelta: buildFullWorldDelta(view),
            selfDelta: buildFullSelfDelta(player),
            panelDelta: buildFullPanelDelta(player),
        };
    }
    /** 生成常规增量投影；首次或换图时回退为完整包。 */
    createDeltaEnvelope(view, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const previous = this.cacheByPlayerId.get(view.playerId);
        if (!previous) {
            this.cacheByPlayerId.set(view.playerId, captureProjectorState(view, player));
            return {
                mapEnter: buildMapEnter(view),
                worldDelta: buildFullWorldDelta(view),
                selfDelta: buildFullSelfDelta(player),
                panelDelta: buildFullPanelDelta(player),
            };
        }
        if (previous.instanceId !== view.instance.instanceId) {
            this.cacheByPlayerId.set(view.playerId, captureProjectorState(view, player));
            return {
                mapEnter: buildMapEnter(view),
                worldDelta: buildFullWorldDelta(view),
                selfDelta: buildFullSelfDelta(player),
                panelDelta: buildFullPanelDelta(player),
            };
        }

        const currentWorld = previous.worldRevision === view.worldRevision
            ? previous
            : captureWorldState(view);

        const current = combineProjectorState(currentWorld, capturePlayerState(player));
        this.cacheByPlayerId.set(view.playerId, current);

        const worldChanged = previous.worldRevision !== current.worldRevision;

        const playerPatch = worldChanged ? diffPlayerEntries(previous.players, current.players) : [];

        const monsterPatch = worldChanged ? diffMonsterEntries(previous.monsters, current.monsters) : [];

        const npcPatch = worldChanged ? diffNpcEntries(previous.npcs, current.npcs) : [];

        const portalPatch = worldChanged ? diffPortalEntries(previous.portals, current.portals) : [];

        const groundPatch = worldChanged ? diffGroundPiles(previous.groundPiles, current.groundPiles) : [];

        const containerPatch = worldChanged ? diffContainerEntries(previous.containers, current.containers) : [];

        const selfDelta = buildSelfDelta(previous, player);

        const panelDelta = buildPanelDelta(previous, player);
        if (playerPatch.length === 0
            && monsterPatch.length === 0
            && npcPatch.length === 0
            && portalPatch.length === 0
            && groundPatch.length === 0
            && containerPatch.length === 0
            && !selfDelta
            && !panelDelta) {
            return null;
        }
        return {
            worldDelta: playerPatch.length > 0 || monsterPatch.length > 0 || npcPatch.length > 0 || portalPatch.length > 0 || groundPatch.length > 0 || containerPatch.length > 0
                ? {
                    t: view.tick,
                    wr: view.worldRevision,
                    sr: view.selfRevision,
                    p: playerPatch.length > 0 ? playerPatch : undefined,
                    m: monsterPatch.length > 0 ? monsterPatch : undefined,
                    n: npcPatch.length > 0 ? npcPatch : undefined,
                    o: portalPatch.length > 0 ? portalPatch : undefined,
                    g: groundPatch.length > 0 ? groundPatch : undefined,
                    c: containerPatch.length > 0 ? containerPatch : undefined,
                }
                : undefined,
            selfDelta: selfDelta ?? undefined,
            panelDelta: panelDelta ?? undefined,
        };
    }
    /** 清理玩家投影缓存。 */
    clear(playerId) {
        this.cacheByPlayerId.delete(playerId);
    }
    /** 暴露当前使用的事件枚举，供上层统一下发。 */
    getEventNames() {
        return shared_1.NEXT_S2C;
    }
};
exports.WorldProjectorService = WorldProjectorService;
exports.WorldProjectorService = WorldProjectorService = __decorate([
    (0, common_1.Injectable)()
], WorldProjectorService);
/**
 * buildMapEnter：构建并返回目标对象。
 * @param view 参数说明。
 * @returns 函数返回值。
 */

function buildMapEnter(view) {
    return {
        iid: view.instance.instanceId,
        mid: view.instance.templateId,
        n: view.instance.name,
        k: view.instance.kind,
        w: view.instance.width,
        h: view.instance.height,
        x: view.self.x,
        y: view.self.y,
    };
}
/**
 * buildFullWorldDelta：构建并返回目标对象。
 * @param view 参数说明。
 * @returns 函数返回值。
 */

function buildFullWorldDelta(view) {

    const players = [{
            id: view.playerId,
            x: view.self.x,
            y: view.self.y,
        }, ...Array.from(view.visiblePlayers, (entry) => ({
            id: entry.playerId,
            x: entry.x,
            y: entry.y,
        }))];

    const monsters = Array.from(view.localMonsters, (entry) => ({
        id: entry.runtimeId,
        mid: entry.monsterId,
        x: entry.x,
        y: entry.y,
        hp: entry.hp,
        maxHp: entry.maxHp,
        n: entry.name,
        c: entry.color,
        tr: entry.tier,
    }));

    const npcs = Array.from(view.localNpcs, (entry) => ({
        id: entry.npcId,
        x: entry.x,
        y: entry.y,
        n: entry.name,
        ch: entry.char,
        c: entry.color,
        sh: entry.hasShop ? 1 : undefined,
        qm: entry.questMarker ?? null,
    }));

    const portals = Array.from(view.localPortals, (entry) => ({
        id: buildPortalId(entry.x, entry.y),
        x: entry.x,
        y: entry.y,
        tm: entry.targetMapId,

        tr: entry.trigger === 'auto' ? 1 : 0,
    }));

    const ground = Array.from(view.localGroundPiles, (entry) => ({
        sourceId: entry.sourceId,
        x: entry.x,
        y: entry.y,
        items: entry.items.map((item) => ({ ...item })),
    }));

    const containers = Array.from(view.localContainers, (entry) => ({
        id: `container:${entry.id}`,
        x: entry.x,
        y: entry.y,
        n: entry.name,
        ch: entry.char,
        c: entry.color,
    }));
    return {
        t: view.tick,
        wr: view.worldRevision,
        sr: view.selfRevision,
        p: players.length > 0 ? players : undefined,
        m: monsters.length > 0 ? monsters : undefined,
        n: npcs.length > 0 ? npcs : undefined,
        o: portals.length > 0 ? portals : undefined,
        g: ground.length > 0 ? ground : undefined,
        c: containers.length > 0 ? containers : undefined,
    };
}
/**
 * buildFullSelfDelta：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function buildFullSelfDelta(player) {
    return {
        sr: player.selfRevision,
        iid: player.instanceId,
        mid: player.templateId,
        x: player.x,
        y: player.y,
        f: player.facing,
        hp: player.hp,
        maxHp: player.maxHp,
        qi: player.qi,
        maxQi: player.maxQi,
    };
}
/**
 * buildFullPanelDelta：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function buildFullPanelDelta(player) {
    return {
        inv: {
            r: player.inventory.revision,
            full: 1,
            capacity: player.inventory.capacity,
            size: player.inventory.items.length,
            slots: player.inventory.items.map((entry, slotIndex) => ({
                slotIndex,
                item: { ...entry },
            })),
        },
        eq: {
            r: player.equipment.revision,
            full: 1,
            slots: player.equipment.slots.map((entry) => ({
                slot: entry.slot,
                item: entry.item ? { ...entry.item } : null,
            })),
        },
        tech: {
            r: player.techniques.revision,
            full: 1,
            techniques: player.techniques.techniques.map((entry) => cloneTechniqueEntry(entry)),
            cultivatingTechId: player.techniques.cultivatingTechId,
            bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
        },
        attr: buildFullAttrDelta(player),
        act: buildFullActionDelta(player),
        buff: buildFullBuffDelta(player),
    };
}
/**
 * captureWorldState：执行核心业务逻辑。
 * @param view 参数说明。
 * @returns 函数返回值。
 */

function captureWorldState(view) {
    return {
        instanceId: view.instance.instanceId,
        worldRevision: view.worldRevision,
        players: new Map([[view.playerId, {
                x: view.self.x,
                y: view.self.y,
            }], ...view.visiblePlayers.map((entry) => [entry.playerId, {
                x: entry.x,
                y: entry.y,
            }])]),
        npcs: new Map(view.localNpcs.map((entry) => [entry.npcId, {
                x: entry.x,
                y: entry.y,
                n: entry.name,
                ch: entry.char,
                c: entry.color,
                sh: entry.hasShop ? 1 : 0,
                qm: entry.questMarker ?? null,
            }])),
        monsters: new Map(view.localMonsters.map((entry) => [entry.runtimeId, {
                mid: entry.monsterId,
                x: entry.x,
                y: entry.y,
                hp: entry.hp,
                maxHp: entry.maxHp,
                n: entry.name,
                c: entry.color,
                tr: entry.tier,
            }])),
        portals: new Map(view.localPortals.map((entry) => [buildPortalId(entry.x, entry.y), {
                x: entry.x,
                y: entry.y,
                tm: entry.targetMapId,

                tr: entry.trigger === 'auto' ? 1 : 0,
            }])),
        groundPiles: new Map(view.localGroundPiles.map((entry) => [entry.sourceId, {
                x: entry.x,
                y: entry.y,
                items: entry.items.map((item) => ({ ...item })),
            }])),
        containers: new Map(view.localContainers.map((entry) => [`container:${entry.id}`, {
                x: entry.x,
                y: entry.y,
                n: entry.name,
                ch: entry.char,
                c: entry.color,
            }])),
    };
}
/**
 * capturePlayerState：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function capturePlayerState(player) {
    return {
        selfRevision: player.selfRevision,
        self: {
            instanceId: player.instanceId,
            templateId: player.templateId,
            x: player.x,
            y: player.y,
            f: player.facing,
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            maxQi: player.maxQi,
        },
        panel: {
            inventory: captureInventoryPanelSlice(player),
            equipment: captureEquipmentPanelSlice(player),
            technique: captureTechniquePanelSlice(player),
            attr: captureAttrPanelSlice(player),
            action: captureActionPanelSlice(player),
            buff: captureBuffPanelSlice(player),
        },
    };
}
/**
 * captureInventoryPanelSlice：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function captureInventoryPanelSlice(player) {
    return {
        revision: player.inventory.revision,
        capacity: player.inventory.capacity,
        items: player.inventory.items.map((entry) => ({ ...entry })),
    };
}
/**
 * captureEquipmentPanelSlice：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function captureEquipmentPanelSlice(player) {
    return {
        revision: player.equipment.revision,
        slots: player.equipment.slots.map((entry) => ({
            slot: entry.slot,
            item: entry.item ? { ...entry.item } : null,
        })),
    };
}
/**
 * captureTechniquePanelSlice：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function captureTechniquePanelSlice(player) {
    return {
        revision: player.techniques.revision,
        techniques: player.techniques.techniques.map((entry) => cloneTechniqueEntry(entry)),
        cultivatingTechId: player.techniques.cultivatingTechId,
        bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
    };
}
/**
 * captureAttrPanelSlice：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function captureAttrPanelSlice(player) {
    return {
        revision: player.attrs.revision,
        stage: player.attrs.stage,
        baseAttrs: cloneAttributes(player.attrs.baseAttrs),
        bonuses: buildAttrBonuses(player),
        finalAttrs: cloneAttributes(player.attrs.finalAttrs),
        numericStats: cloneNumericStats(player.attrs.numericStats),
        ratioDivisors: cloneNumericRatioDivisors(player.attrs.ratioDivisors),
        specialStats: cloneSpecialStats({
            foundation: player.foundation,
            combatExp: player.combatExp,
        }),
        boneAgeBaseYears: player.boneAgeBaseYears,
        lifeElapsedTicks: player.lifeElapsedTicks,
        lifespanYears: player.lifespanYears,
        realmProgress: player.realm?.progress,
        realmProgressToNext: player.realm?.progressToNext,
        realmBreakthroughReady: player.realm?.breakthroughReady,
    };
}
/**
 * captureActionPanelSlice：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function captureActionPanelSlice(player) {
    return {
        revision: player.actions.revision,
        actions: player.actions.actions.map((entry) => ({ ...entry })),
        autoBattle: player.combat.autoBattle,
        autoUsePills: (0, player_combat_config_helpers_1.cloneAutoUsePillList)(player.combat.autoUsePills),
        combatTargetingRules: (0, player_combat_config_helpers_1.cloneCombatTargetingRules)(player.combat.combatTargetingRules),
        autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
        combatTargetId: player.combat.combatTargetId,
        combatTargetLocked: player.combat.combatTargetLocked,
        autoRetaliate: player.combat.autoRetaliate,
        autoBattleStationary: player.combat.autoBattleStationary,
        allowAoePlayerHit: player.combat.allowAoePlayerHit,
        autoIdleCultivation: player.combat.autoIdleCultivation,
        autoSwitchCultivation: player.combat.autoSwitchCultivation,
        cultivationActive: player.combat.cultivationActive,
        senseQiActive: player.combat.senseQiActive,
    };
}
/**
 * captureBuffPanelSlice：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function captureBuffPanelSlice(player) {
    return {
        revision: player.buffs.revision,
        buffs: player.buffs.buffs.map((entry) => cloneVisibleBuff(entry)),
    };
}
/**
 * combineProjectorState：执行核心业务逻辑。
 * @param worldState 参数说明。
 * @param playerState 参数说明。
 * @returns 函数返回值。
 */

function combineProjectorState(worldState, playerState) {
    return {
        instanceId: worldState.instanceId,
        worldRevision: worldState.worldRevision,
        players: worldState.players,
        npcs: worldState.npcs,
        monsters: worldState.monsters,
        portals: worldState.portals,
        groundPiles: worldState.groundPiles,
        containers: worldState.containers,
        selfRevision: playerState.selfRevision,
        self: playerState.self,
        panel: playerState.panel,
    };
}
/**
 * captureProjectorState：执行核心业务逻辑。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function captureProjectorState(view, player) {
    return combineProjectorState(captureWorldState(view), capturePlayerState(player));
}
/**
 * buildFullAttrDelta：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function buildFullAttrDelta(player) {
    return {
        r: player.attrs.revision,
        full: 1,
        stage: player.attrs.stage,
        baseAttrs: cloneAttributes(player.attrs.baseAttrs),
        bonuses: buildAttrBonuses(player),
        finalAttrs: cloneAttributes(player.attrs.finalAttrs),
        numericStats: cloneNumericStats(player.attrs.numericStats),
        ratioDivisors: cloneNumericRatioDivisors(player.attrs.ratioDivisors),
        specialStats: cloneSpecialStats({
            foundation: player.foundation,
            combatExp: player.combatExp,
        }),
        boneAgeBaseYears: player.boneAgeBaseYears,
        lifeElapsedTicks: player.lifeElapsedTicks,
        lifespanYears: player.lifespanYears,
        realmProgress: player.realm?.progress,
        realmProgressToNext: player.realm?.progressToNext,
        realmBreakthroughReady: player.realm?.breakthroughReady,
    };
}
/**
 * buildFullActionDelta：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function buildFullActionDelta(player) {
    return {
        r: player.actions.revision,
        full: 1,
        actions: player.actions.actions.map((entry) => ({ ...entry })),
        actionOrder: player.actions.actions.map((entry) => entry.id),
        autoBattle: player.combat.autoBattle,
        autoUsePills: (0, player_combat_config_helpers_1.cloneAutoUsePillList)(player.combat.autoUsePills),
        combatTargetingRules: (0, player_combat_config_helpers_1.cloneCombatTargetingRules)(player.combat.combatTargetingRules),
        autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
        combatTargetId: player.combat.combatTargetId,
        combatTargetLocked: player.combat.combatTargetLocked,
        autoRetaliate: player.combat.autoRetaliate,
        autoBattleStationary: player.combat.autoBattleStationary,
        allowAoePlayerHit: player.combat.allowAoePlayerHit,
        autoIdleCultivation: player.combat.autoIdleCultivation,
        autoSwitchCultivation: player.combat.autoSwitchCultivation,
        cultivationActive: player.combat.cultivationActive,
        senseQiActive: player.combat.senseQiActive,
    };
}
/**
 * buildFullBuffDelta：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function buildFullBuffDelta(player) {
    return {
        r: player.buffs.revision,
        full: 1,
        buffs: player.buffs.buffs.map((entry) => cloneVisibleBuff(entry)),
    };
}
/**
 * buildAttrDelta：构建并返回目标对象。
 * @param previousAttr 参数说明。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function buildAttrDelta(previousAttr, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const stageChanged = previousAttr.stage !== player.attrs.stage;

    const baseAttrsPatch = diffAttributes(previousAttr.baseAttrs, player.attrs.baseAttrs);

    const nextBonuses = buildAttrBonuses(player);

    const bonusesChanged = !isSameAttrBonuses(previousAttr.bonuses, nextBonuses);

    const finalAttrsPatch = diffAttributes(previousAttr.finalAttrs, player.attrs.finalAttrs);

    const numericStatsPatch = diffNumericStats(previousAttr.numericStats, player.attrs.numericStats);

    const ratioDivisorsPatch = diffRatioDivisors(previousAttr.ratioDivisors, player.attrs.ratioDivisors);

    const nextSpecialStats = {
        foundation: player.foundation,
        combatExp: player.combatExp,
    };

    const specialStatsChanged = !isSameSpecialStats(previousAttr.specialStats, nextSpecialStats);

    const boneAgeBaseYearsChanged = previousAttr.boneAgeBaseYears !== player.boneAgeBaseYears;

    const lifeElapsedTicksChanged = previousAttr.lifeElapsedTicks !== player.lifeElapsedTicks;

    const lifespanYearsChanged = previousAttr.lifespanYears !== player.lifespanYears;

    const realmProgressChanged = previousAttr.realmProgress !== player.realm?.progress;

    const realmProgressToNextChanged = previousAttr.realmProgressToNext !== player.realm?.progressToNext;

    const realmBreakthroughReadyChanged = previousAttr.realmBreakthroughReady !== player.realm?.breakthroughReady;

    const totalChanges = (stageChanged ? 1 : 0)
        + baseAttrsPatch.changes
        + (bonusesChanged ? 1 : 0)
        + finalAttrsPatch.changes
        + numericStatsPatch.changes
        + ratioDivisorsPatch.changes
        + (specialStatsChanged ? 1 : 0)
        + (boneAgeBaseYearsChanged ? 1 : 0)
        + (lifeElapsedTicksChanged ? 1 : 0)
        + (lifespanYearsChanged ? 1 : 0)
        + (realmProgressChanged ? 1 : 0)
        + (realmProgressToNextChanged ? 1 : 0)
        + (realmBreakthroughReadyChanged ? 1 : 0);
    if (totalChanges > ATTR_DELTA_PATCH_THRESHOLD) {
        return buildFullAttrDelta(player);
    }
    return {
        r: player.attrs.revision,
        stage: stageChanged ? player.attrs.stage : undefined,
        baseAttrs: baseAttrsPatch.patch,
        bonuses: bonusesChanged ? nextBonuses : undefined,
        finalAttrs: finalAttrsPatch.patch,
        numericStats: numericStatsPatch.patch,
        ratioDivisors: ratioDivisorsPatch.patch,
        specialStats: specialStatsChanged ? cloneSpecialStats(nextSpecialStats) : undefined,
        boneAgeBaseYears: boneAgeBaseYearsChanged ? player.boneAgeBaseYears : undefined,
        lifeElapsedTicks: lifeElapsedTicksChanged ? player.lifeElapsedTicks : undefined,
        lifespanYears: lifespanYearsChanged ? player.lifespanYears : undefined,
        realmProgress: realmProgressChanged ? player.realm?.progress : undefined,
        realmProgressToNext: realmProgressToNextChanged ? player.realm?.progressToNext : undefined,
        realmBreakthroughReady: realmBreakthroughReadyChanged ? player.realm?.breakthroughReady : undefined,
    };
}
/**
 * buildSelfDelta：构建并返回目标对象。
 * @param previous 参数说明。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function buildSelfDelta(previous, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (previous.selfRevision === player.selfRevision) {
        return null;
    }

    const delta = { sr: player.selfRevision };
    if (previous.self.instanceId !== player.instanceId) {
        delta.iid = player.instanceId;
    }
    if (previous.self.templateId !== player.templateId) {
        delta.mid = player.templateId;
    }
    if (previous.self.f !== player.facing) {
        delta.f = player.facing;
    }
    if (previous.self.hp !== player.hp) {
        delta.hp = player.hp;
    }
    if (previous.self.maxHp !== player.maxHp) {
        delta.maxHp = player.maxHp;
    }
    if (previous.self.qi !== player.qi) {
        delta.qi = player.qi;
    }
    if (previous.self.maxQi !== player.maxQi) {
        delta.maxQi = player.maxQi;
    }
    return delta;
}
/**
 * buildPanelDelta：构建并返回目标对象。
 * @param previous 参数说明。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function buildPanelDelta(previous, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const delta = {};
    const previousInventory = previous.panel.inventory;
    const previousEquipment = previous.panel.equipment;
    const previousTechnique = previous.panel.technique;
    const previousAttr = previous.panel.attr;
    const previousAction = previous.panel.action;
    const previousBuff = previous.panel.buff;
    if (previousInventory.revision !== player.inventory.revision) {

        const slotPatch = diffInventorySlots(previousInventory.items, player.inventory.items);
        delta.inv = {
            r: player.inventory.revision,

            capacity: previousInventory.capacity !== player.inventory.capacity ? player.inventory.capacity : undefined,

            size: previousInventory.items.length !== player.inventory.items.length ? player.inventory.items.length : undefined,
            slots: slotPatch.length > 0 ? slotPatch : undefined,
        };
    }
    if (previousEquipment.revision !== player.equipment.revision) {

        const slotPatch = diffEquipmentSlots(previousEquipment.slots, player.equipment.slots);
        delta.eq = {
            r: player.equipment.revision,
            slots: slotPatch,
        };
    }
    if (previousTechnique.revision !== player.techniques.revision) {

        const techniquePatch = diffTechniqueEntries(previousTechnique.techniques, player.techniques.techniques);

        const removed = diffRemovedTechniqueIds(previousTechnique.techniques, player.techniques.techniques);
        delta.tech = {
            r: player.techniques.revision,
            techniques: techniquePatch,
            removeTechniqueIds: removed.length > 0 ? removed : undefined,

            cultivatingTechId: previousTechnique.cultivatingTechId !== player.techniques.cultivatingTechId
                ? player.techniques.cultivatingTechId
                : undefined,

            bodyTraining: previousTechnique.bodyTraining !== player.bodyTraining
                ? (player.bodyTraining ? { ...player.bodyTraining } : null)
                : undefined,
        };
    }

    const attrMetaChanged = previousAttr.boneAgeBaseYears !== player.boneAgeBaseYears
        || previousAttr.lifeElapsedTicks !== player.lifeElapsedTicks
        || previousAttr.lifespanYears !== player.lifespanYears
        || previousAttr.realmProgress !== player.realm?.progress
        || previousAttr.realmProgressToNext !== player.realm?.progressToNext
        || previousAttr.realmBreakthroughReady !== player.realm?.breakthroughReady
        || !isSameSpecialStats(previousAttr.specialStats, {
            foundation: player.foundation,
            combatExp: player.combatExp,
        })
        || !isSameAttrBonuses(previousAttr.bonuses, buildAttrBonuses(player));
    if (previousAttr.revision !== player.attrs.revision || attrMetaChanged) {
        delta.attr = buildAttrDelta(previousAttr, player);
    }
    if (previousAction.revision !== player.actions.revision) {

        const actionPatch = diffActionEntries(previousAction.actions, player.actions.actions);

        const removedActionIds = diffRemovedActionIds(previousAction.actions, player.actions.actions);
        delta.act = {
            r: player.actions.revision,
            actions: actionPatch,
            removeActionIds: removedActionIds.length > 0 ? removedActionIds : undefined,
        };
    }

    const actionTopLevelChanged = previousAction.autoBattle !== player.combat.autoBattle
        || !(0, player_combat_config_helpers_1.isSameAutoUsePillList)(previousAction.autoUsePills ?? [], player.combat.autoUsePills ?? [])
        || !(0, player_combat_config_helpers_1.isSameCombatTargetingRules)(previousAction.combatTargetingRules ?? null, player.combat.combatTargetingRules ?? null)
        || previousAction.autoBattleTargetingMode !== player.combat.autoBattleTargetingMode
        || previousAction.combatTargetId !== player.combat.combatTargetId
        || previousAction.combatTargetLocked !== player.combat.combatTargetLocked
        || previousAction.autoRetaliate !== player.combat.autoRetaliate
        || previousAction.autoBattleStationary !== player.combat.autoBattleStationary
        || previousAction.allowAoePlayerHit !== player.combat.allowAoePlayerHit
        || previousAction.autoIdleCultivation !== player.combat.autoIdleCultivation
        || previousAction.autoSwitchCultivation !== player.combat.autoSwitchCultivation
        || previousAction.cultivationActive !== player.combat.cultivationActive
        || previousAction.senseQiActive !== player.combat.senseQiActive;
    if (actionTopLevelChanged) {
        delta.act = {
            ...(delta.act ?? { r: player.actions.revision }),
            actionOrder: player.actions.actions.map((entry) => entry.id),
            autoBattle: player.combat.autoBattle,
            autoUsePills: (0, player_combat_config_helpers_1.cloneAutoUsePillList)(player.combat.autoUsePills),
            combatTargetingRules: (0, player_combat_config_helpers_1.cloneCombatTargetingRules)(player.combat.combatTargetingRules),
            autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
            combatTargetId: player.combat.combatTargetId,
            combatTargetLocked: player.combat.combatTargetLocked,
            autoRetaliate: player.combat.autoRetaliate,
            autoBattleStationary: player.combat.autoBattleStationary,
            allowAoePlayerHit: player.combat.allowAoePlayerHit,
            autoIdleCultivation: player.combat.autoIdleCultivation,
            autoSwitchCultivation: player.combat.autoSwitchCultivation,
            cultivationActive: player.combat.cultivationActive,
            senseQiActive: player.combat.senseQiActive,
        };
    }
    if (previousBuff.revision !== player.buffs.revision) {

        const buffPatch = diffBuffEntries(previousBuff.buffs, player.buffs.buffs);

        const removedBuffIds = diffRemovedBuffIds(previousBuff.buffs, player.buffs.buffs);
        delta.buff = {
            r: player.buffs.revision,
            buffs: buffPatch,
            removeBuffIds: removedBuffIds.length > 0 ? removedBuffIds : undefined,
        };
    }
    return delta.inv || delta.eq || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
}
/**
 * diffPlayerEntries：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffPlayerEntries(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const result = [];
    for (const [playerId, entry] of current) {
        const prev = previous.get(playerId);
        if (!prev || prev.x !== entry.x || prev.y !== entry.y) {
            result.push({ id: playerId, x: entry.x, y: entry.y });
        }
    }
    for (const playerId of previous.keys()) {
        if (!current.has(playerId)) {
            result.push({ id: playerId, rm: 1 });
        }
    }
    return result;
}
/**
 * diffNpcEntries：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffNpcEntries(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const result = [];
    for (const [npcId, entry] of current) {
        const prev = previous.get(npcId);
        if (!prev) {
            result.push({
                id: npcId,
                x: entry.x,
                y: entry.y,
                n: entry.n,
                ch: entry.ch,
                c: entry.c,

                sh: entry.sh === 1 ? 1 : undefined,
                qm: entry.qm,
            });
            continue;
        }

        const delta = { id: npcId };

        let changed = false;
        if (prev.x !== entry.x) {
            delta.x = entry.x;
            changed = true;
        }
        if (prev.y !== entry.y) {
            delta.y = entry.y;
            changed = true;
        }
        if (prev.n !== entry.n) {
            delta.n = entry.n;
            changed = true;
        }
        if (prev.ch !== entry.ch) {
            delta.ch = entry.ch;
            changed = true;
        }
        if (prev.c !== entry.c) {
            delta.c = entry.c;
            changed = true;
        }
        if (prev.sh !== entry.sh) {
            delta.sh = entry.sh === 1 ? 1 : undefined;
            changed = true;
        }
        if (!isSameNpcQuestMarker(prev.qm, entry.qm)) {
            delta.qm = entry.qm;
            changed = true;
        }
        if (changed) {
            result.push(delta);
        }
    }
    for (const npcId of previous.keys()) {
        if (!current.has(npcId)) {
            result.push({ id: npcId, rm: 1 });
        }
    }
    return result;
}
/**
 * isSameNpcQuestMarker：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameNpcQuestMarker(left, right) {
    return left?.line === right?.line && left?.state === right?.state;
}
/**
 * diffPortalEntries：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffPortalEntries(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const result = [];
    for (const [portalId, entry] of current) {
        const prev = previous.get(portalId);
        if (!prev || prev.x !== entry.x || prev.y !== entry.y || prev.tm !== entry.tm || prev.tr !== entry.tr) {
            result.push({ id: portalId, x: entry.x, y: entry.y, tm: entry.tm, tr: entry.tr });
        }
    }
    for (const portalId of previous.keys()) {
        if (!current.has(portalId)) {
            result.push({ id: portalId, rm: 1 });
        }
    }
    return result;
}
/**
 * diffMonsterEntries：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffMonsterEntries(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const result = [];
    for (const [runtimeId, entry] of current) {
        const prev = previous.get(runtimeId);
        if (!prev) {
            result.push({
                id: runtimeId,
                mid: entry.mid,
                x: entry.x,
                y: entry.y,
                hp: entry.hp,
                maxHp: entry.maxHp,
                n: entry.n,
                c: entry.c,
                tr: entry.tr,
            });
            continue;
        }

        const delta = { id: runtimeId };

        let changed = false;
        if (prev.mid !== entry.mid) {
            delta.mid = entry.mid;
            changed = true;
        }
        if (prev.x !== entry.x) {
            delta.x = entry.x;
            changed = true;
        }
        if (prev.y !== entry.y) {
            delta.y = entry.y;
            changed = true;
        }
        if (prev.hp !== entry.hp) {
            delta.hp = entry.hp;
            changed = true;
        }
        if (prev.maxHp !== entry.maxHp) {
            delta.maxHp = entry.maxHp;
            changed = true;
        }
        if (prev.n !== entry.n) {
            delta.n = entry.n;
            changed = true;
        }
        if (prev.c !== entry.c) {
            delta.c = entry.c;
            changed = true;
        }
        if (prev.tr !== entry.tr) {
            delta.tr = entry.tr;
            changed = true;
        }
        if (changed) {
            result.push(delta);
        }
    }
    for (const runtimeId of previous.keys()) {
        if (!current.has(runtimeId)) {
            result.push({ id: runtimeId, rm: 1 });
        }
    }
    return result;
}
/**
 * diffGroundPiles：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffGroundPiles(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const result = [];
    for (const [sourceId, entry] of current) {
        const prev = previous.get(sourceId);
        if (!isSameGroundPile(prev ?? null, entry)) {
            result.push({
                sourceId,
                x: entry.x,
                y: entry.y,
                items: entry.items.map((item) => ({ ...item })),
            });
        }
    }
    for (const [sourceId, entry] of previous) {
        if (!current.has(sourceId)) {
            result.push({
                sourceId,
                x: entry.x,
                y: entry.y,
                items: null,
            });
        }
    }
    return result;
}
/**
 * diffContainerEntries：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffContainerEntries(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const result = [];
    for (const [containerId, entry] of current) {
        const prev = previous.get(containerId);
        if (!prev) {
            result.push({
                id: containerId,
                x: entry.x,
                y: entry.y,
                n: entry.n,
                ch: entry.ch,
                c: entry.c,
            });
            continue;
        }

        const delta = { id: containerId };

        let changed = false;
        if (prev.x !== entry.x) {
            delta.x = entry.x;
            changed = true;
        }
        if (prev.y !== entry.y) {
            delta.y = entry.y;
            changed = true;
        }
        if (prev.n !== entry.n) {
            delta.n = entry.n;
            changed = true;
        }
        if (prev.ch !== entry.ch) {
            delta.ch = entry.ch;
            changed = true;
        }
        if (prev.c !== entry.c) {
            delta.c = entry.c;
            changed = true;
        }
        if (changed) {
            result.push(delta);
        }
    }
    for (const containerId of previous.keys()) {
        if (!current.has(containerId)) {
            result.push({ id: containerId, rm: 1 });
        }
    }
    return result;
}
/**
 * diffInventorySlots：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffInventorySlots(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const patch = [];

    const maxLength = Math.max(previous.length, current.length);
    for (let index = 0; index < maxLength; index += 1) {
        const prev = previous[index] ?? null;
        const next = current[index] ?? null;
        if (!isSameItem(prev, next)) {
            patch.push({
                slotIndex: index,
                item: next ? { ...next } : null,
            });
        }
    }
    return patch;
}
/**
 * diffEquipmentSlots：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffEquipmentSlots(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const patch = [];

    const previousBySlot = new Map(previous.map((entry) => [entry.slot, entry]));
    for (const entry of current) {
        const prev = previousBySlot.get(entry.slot);
        if (!prev || !isSameItem(prev.item ?? null, entry.item ?? null)) {
            patch.push({
                slot: entry.slot,
                item: entry.item ? { ...entry.item } : null,
            });
        }
    }
    return patch;
}
/**
 * diffTechniqueEntries：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffTechniqueEntries(previous, current) {

    const previousById = new Map(previous.map((entry) => [entry.techId, entry]));
    return current
        .filter((entry) => !isSameTechniqueEntry(previousById.get(entry.techId) ?? null, entry))
        .map((entry) => cloneTechniqueEntry(entry));
}
/**
 * diffRemovedTechniqueIds：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffRemovedTechniqueIds(previous, current) {

    const currentIds = new Set(current.map((entry) => entry.techId));
    return previous
        .map((entry) => entry.techId)
        .filter((techId) => !currentIds.has(techId));
}
/**
 * diffActionEntries：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffActionEntries(previous, current) {

    const previousById = new Map(previous.map((entry) => [entry.id, entry]));
    return current
        .filter((entry) => !isSameActionEntry(previousById.get(entry.id) ?? null, entry))
        .map((entry) => ({ ...entry }));
}
/**
 * diffRemovedActionIds：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffRemovedActionIds(previous, current) {

    const currentIds = new Set(current.map((entry) => entry.id));
    return previous
        .map((entry) => entry.id)
        .filter((actionId) => !currentIds.has(actionId));
}
/**
 * diffBuffEntries：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffBuffEntries(previous, current) {

    const previousById = new Map(previous.map((entry) => [entry.buffId, entry]));
    return current
        .filter((entry) => !isSameBuffEntry(previousById.get(entry.buffId) ?? null, entry))
        .map((entry) => cloneVisibleBuff(entry));
}
/**
 * diffRemovedBuffIds：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffRemovedBuffIds(previous, current) {

    const currentIds = new Set(current.map((entry) => entry.buffId));
    return previous
        .map((entry) => entry.buffId)
        .filter((buffId) => !currentIds.has(buffId));
}
/**
 * diffAttributes：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffAttributes(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const patch = {};

    let changes = 0;
    for (const key of ATTRIBUTE_KEYS) {
        if (previous[key] === current[key]) {
            continue;
        }
        patch[key] = current[key];
        changes += 1;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}
/**
 * diffNumericStats：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffNumericStats(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const patch = {};

    let changes = 0;
    for (const key of NUMERIC_STAT_KEYS) {
        if (previous[key] === current[key]) {
            continue;
        }
        patch[key] = current[key];
        changes += 1;
    }

    const elementDamageBonusPatch = diffElementGroup(previous.elementDamageBonus, current.elementDamageBonus);
    if (elementDamageBonusPatch.changes > 0) {
        patch.elementDamageBonus = elementDamageBonusPatch.patch;
        changes += elementDamageBonusPatch.changes;
    }

    const elementDamageReducePatch = diffElementGroup(previous.elementDamageReduce, current.elementDamageReduce);
    if (elementDamageReducePatch.changes > 0) {
        patch.elementDamageReduce = elementDamageReducePatch.patch;
        changes += elementDamageReducePatch.changes;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}
/**
 * diffRatioDivisors：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffRatioDivisors(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const patch = {};

    let changes = 0;
    for (const key of RATIO_DIVISOR_KEYS) {
        if (previous[key] === current[key]) {
            continue;
        }
        patch[key] = current[key];
        changes += 1;
    }

    const elementDamageReducePatch = diffElementGroup(previous.elementDamageReduce, current.elementDamageReduce);
    if (elementDamageReducePatch.changes > 0) {
        patch.elementDamageReduce = elementDamageReducePatch.patch;
        changes += elementDamageReducePatch.changes;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}
/**
 * diffElementGroup：执行核心业务逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
 */

function diffElementGroup(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const patch = {};

    let changes = 0;
    for (const key of ELEMENT_GROUP_KEYS) {
        if (previous[key] === current[key]) {
            continue;
        }
        patch[key] = current[key];
        changes += 1;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}
/**
 * isSameItem：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameItem(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.itemId === right.itemId
        && left.count === right.count
        && left.name === right.name
        && left.type === right.type
        && left.desc === right.desc
        && left.groundLabel === right.groundLabel
        && left.grade === right.grade
        && left.level === right.level
        && left.equipSlot === right.equipSlot
        && shallowEqualRecord(left.equipAttrs, right.equipAttrs)
        && shallowEqualRecord(left.equipStats, right.equipStats)
        && shallowEqualRecord(left.equipValueStats, right.equipValueStats)
        && shallowEqualArray(left.effects, right.effects)
        && left.healAmount === right.healAmount
        && left.healPercent === right.healPercent
        && left.qiPercent === right.qiPercent
        && shallowEqualArray(left.consumeBuffs, right.consumeBuffs)
        && shallowEqualArray(left.tags, right.tags)
        && left.mapUnlockId === right.mapUnlockId
        && shallowEqualArray(left.mapUnlockIds, right.mapUnlockIds)
        && left.tileAuraGainAmount === right.tileAuraGainAmount
        && left.allowBatchUse === right.allowBatchUse;
}
/**
 * cloneTechniqueEntry：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function cloneTechniqueEntry(source) {
    return {
        ...source,

        skillsEnabled: source.skillsEnabled !== false,
        skills: source.skills?.map((entry) => ({ ...entry })),
        layers: source.layers?.map((entry) => ({
            level: entry.level,
            expToNext: entry.expToNext,
            attrs: entry.attrs ? { ...entry.attrs } : undefined,
        })),
        attrCurves: source.attrCurves ? { ...source.attrCurves } : undefined,
    };
}
/**
 * isSameTechniqueEntry：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameTechniqueEntry(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.techId === right.techId
        && left.level === right.level
        && left.exp === right.exp
        && left.expToNext === right.expToNext
        && left.realmLv === right.realmLv
        && left.realm === right.realm
        && (left.skillsEnabled !== false) === (right.skillsEnabled !== false)
        && left.name === right.name
        && left.grade === right.grade
        && left.category === right.category
        && shallowEqualArray(left.skills, right.skills)
        && shallowEqualArray(left.layers, right.layers)
        && shallowEqualRecord(left.attrCurves, right.attrCurves);
}
/**
 * isSameActionEntry：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameActionEntry(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.id === right.id
        && left.name === right.name
        && left.type === right.type
        && left.desc === right.desc
        && left.cooldownLeft === right.cooldownLeft
        && left.range === right.range
        && left.requiresTarget === right.requiresTarget
        && left.targetMode === right.targetMode
        && left.autoBattleEnabled === right.autoBattleEnabled
        && left.autoBattleOrder === right.autoBattleOrder
        && left.skillEnabled === right.skillEnabled;
}
/**
 * isSameBuffEntry：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameBuffEntry(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.buffId === right.buffId
        && left.name === right.name
        && left.desc === right.desc
        && left.shortMark === right.shortMark
        && left.category === right.category
        && left.visibility === right.visibility
        && left.remainingTicks === right.remainingTicks
        && left.duration === right.duration
        && left.stacks === right.stacks
        && left.maxStacks === right.maxStacks
        && left.sourceSkillId === right.sourceSkillId
        && left.sourceSkillName === right.sourceSkillName
        && left.color === right.color
        && shallowEqualRecord(left.attrs, right.attrs)
        && shallowEqualRecord(left.stats, right.stats)
        && shallowEqualArray(left.qiProjection, right.qiProjection);
}
/**
 * isSameGroundPile：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameGroundPile(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    if (left.x !== right.x || left.y !== right.y || left.items.length !== right.items.length) {
        return false;
    }
    for (let index = 0; index < left.items.length; index += 1) {
        if (!isSameGroundItemEntry(left.items[index] ?? null, right.items[index] ?? null)) {
            return false;
        }
    }
    return true;
}
/**
 * isSameGroundItemEntry：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameGroundItemEntry(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.itemKey === right.itemKey
        && left.itemId === right.itemId
        && left.name === right.name
        && left.type === right.type
        && left.count === right.count
        && left.grade === right.grade
        && left.groundLabel === right.groundLabel;
}
/**
 * shallowEqualArray：执行核心业务逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function shallowEqualArray(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!shallowEqualValue(left[index], right[index])) {
            return false;
        }
    }
    return true;
}
/**
 * shallowEqualRecord：执行核心业务逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function shallowEqualRecord(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }

    const leftRecord = left;

    const rightRecord = right;

    const leftKeys = Object.keys(leftRecord);

    const rightKeys = Object.keys(rightRecord);
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (const key of leftKeys) {
        if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) {
            return false;
        }
        if (!shallowEqualValue(leftRecord[key], rightRecord[key])) {
            return false;
        }
    }
    return true;
}
/**
 * shallowEqualValue：执行核心业务逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function shallowEqualValue(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return shallowEqualArray(left, right);
    }
    if (isPlainObject(left) && isPlainObject(right)) {
        return shallowEqualRecord(left, right);
    }
    return false;
}
/**
 * isPlainObject：执行状态校验并返回判断结果。
 * @param value 参数说明。
 * @returns 函数返回值。
 */

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
/**
 * cloneAttributes：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
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
 * buildAttrBonuses：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

function buildAttrBonuses(player) {
    return Array.isArray(player.bonuses)
        ? player.bonuses.map((entry) => cloneAttrBonus(entry))
        : [];
}
/**
 * cloneSpecialStats：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function cloneSpecialStats(source) {
    return {
        foundation: source.foundation,
        combatExp: source.combatExp,
    };
}
/**
 * isSameAttrBonuses：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameAttrBonuses(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const leftEntry = left[index];
        const rightEntry = right[index];
        if (leftEntry.source !== rightEntry.source
            || leftEntry.label !== rightEntry.label
            || !isSameAttributes(leftEntry.attrs, rightEntry.attrs)
            || !shallowEqualRecord(leftEntry.stats, rightEntry.stats)
            || !shallowEqualArray(leftEntry.qiProjection, rightEntry.qiProjection)
            || !shallowEqualRecord(leftEntry.meta, rightEntry.meta)) {
            return false;
        }
    }
    return true;
}
/**
 * cloneAttrBonus：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function cloneAttrBonus(source) {
    return {
        source: source.source,
        label: source.label,
        attrs: cloneAttributes(source.attrs),
        stats: clonePartialNumericStats(source.stats),
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => cloneQiProjectionModifier(entry)) : undefined,

        meta: source.meta && typeof source.meta === 'object' ? { ...source.meta } : undefined,
    };
}
/**
 * isSameSpecialStats：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function isSameSpecialStats(left, right) {
    return left.foundation === right.foundation
        && left.combatExp === right.combatExp;
}
/**
 * cloneNumericStats：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function cloneNumericStats(source) {
    return {
        maxHp: source.maxHp,
        maxQi: source.maxQi,
        physAtk: source.physAtk,
        spellAtk: source.spellAtk,
        physDef: source.physDef,
        spellDef: source.spellDef,
        hit: source.hit,
        dodge: source.dodge,
        crit: source.crit,
        critDamage: source.critDamage,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        maxQiOutputPerTick: source.maxQiOutputPerTick,
        qiRegenRate: source.qiRegenRate,
        hpRegenRate: source.hpRegenRate,
        cooldownSpeed: source.cooldownSpeed,
        auraCostReduce: source.auraCostReduce,
        auraPowerRate: source.auraPowerRate,
        playerExpRate: source.playerExpRate,
        techniqueExpRate: source.techniqueExpRate,
        realmExpPerTick: source.realmExpPerTick,
        techniqueExpPerTick: source.techniqueExpPerTick,
        lootRate: source.lootRate,
        rareLootRate: source.rareLootRate,
        viewRange: source.viewRange,
        moveSpeed: source.moveSpeed,
        extraAggroRate: source.extraAggroRate,
        extraRange: source.extraRange,
        extraArea: source.extraArea,
        elementDamageBonus: {
            metal: source.elementDamageBonus.metal,
            wood: source.elementDamageBonus.wood,
            water: source.elementDamageBonus.water,
            fire: source.elementDamageBonus.fire,
            earth: source.elementDamageBonus.earth,
        },
        elementDamageReduce: {
            metal: source.elementDamageReduce.metal,
            wood: source.elementDamageReduce.wood,
            water: source.elementDamageReduce.water,
            fire: source.elementDamageReduce.fire,
            earth: source.elementDamageReduce.earth,
        },
    };
}
/**
 * clonePartialNumericStats：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function clonePartialNumericStats(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!source) {
        return undefined;
    }

    const clone = {};
    for (const key of NUMERIC_STAT_KEYS) {
        if (source[key] !== undefined) {
            clone[key] = source[key];
        }
    }
    if (source.elementDamageBonus) {
        clone.elementDamageBonus = { ...source.elementDamageBonus };
    }
    if (source.elementDamageReduce) {
        clone.elementDamageReduce = { ...source.elementDamageReduce };
    }
    return Object.keys(clone).length > 0 ? clone : undefined;
}
/**
 * cloneNumericRatioDivisors：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function cloneNumericRatioDivisors(source) {
    return {
        dodge: source.dodge,
        crit: source.crit,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        cooldownSpeed: source.cooldownSpeed,
        moveSpeed: source.moveSpeed,
        elementDamageReduce: {
            metal: source.elementDamageReduce.metal,
            wood: source.elementDamageReduce.wood,
            water: source.elementDamageReduce.water,
            fire: source.elementDamageReduce.fire,
            earth: source.elementDamageReduce.earth,
        },
    };
}
/**
 * cloneQiProjectionModifier：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function cloneQiProjectionModifier(source) {
    return {
        ...source,
        selector: source.selector
            ? {
                ...source.selector,
                resourceKeys: source.selector.resourceKeys ? source.selector.resourceKeys.slice() : undefined,
                families: source.selector.families ? source.selector.families.slice() : undefined,
                forms: source.selector.forms ? source.selector.forms.slice() : undefined,
                elements: source.selector.elements ? source.selector.elements.slice() : undefined,
            }
            : undefined,
    };
}
/**
 * cloneVisibleBuff：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function cloneVisibleBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}
/**
 * buildPortalId：构建并返回目标对象。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 函数返回值。
 */

function buildPortalId(x, y) {
    return `${x}:${y}`;
}

export { WorldProjectorService };
