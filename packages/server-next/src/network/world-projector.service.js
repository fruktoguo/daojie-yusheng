"use strict";
/**
 * 世界投影服务
 * 
 * 负责将游戏世界的运行时状态投影为客户端视图，包括：
 * - 创建初始同步数据包（完整状态）
 * - 创建增量同步数据包（仅包含变化）
 * - 管理玩家视图缓存
 * - 计算状态差异（diff）
 * - 构建各种同步数据结构（地图、玩家、怪物、NPC等）
 */
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

// ==================== 常量定义 ====================

/** 属性增量补丁阈值：当属性变化超过此值时才发送增量 */
const ATTR_DELTA_PATCH_THRESHOLD = 10;

/** 基础属性键名列表 */
const ATTRIBUTE_KEYS = ['constitution', 'spirit', 'perception', 'talent', 'comprehension', 'luck'];

/** 数值属性键名列表 */
const NUMERIC_STAT_KEYS = [
    'maxHp',                  // 最大生命值
    'maxQi',                  // 最大灵气值
    'physAtk',                // 物理攻击
    'spellAtk',               // 法术攻击
    'physDef',                // 物理防御
    'spellDef',               // 法术防御
    'hit',                    // 命中率
    'dodge',                  // 闪避率
    'crit',                   // 暴击率
    'critDamage',             // 暴击伤害
    'breakPower',             // 破防力
    'resolvePower',           // 镇压力
    'maxQiOutputPerTick',     // 每tick最大灵气输出
    'qiRegenRate',            // 灵气回复率
    'hpRegenRate',            // 生命回复率
    'cooldownSpeed',           // 冷却速度
    'auraCostReduce',         // 灵气消耗减少
    'auraPowerRate',          // 灵气威力加成
    'playerExpRate',          // 玩家经验加成
    'techniqueExpRate',       // 功法经验加成
    'realmExpPerTick',        // 每tick境界经验
    'techniqueExpPerTick',    // 每tick功法经验
    'lootRate',               // 掉落加成
    'rareLootRate',           // 稀有掉落加成
    'viewRange',              // 视野范围
    'moveSpeed',              // 移动速度
    'extraAggroRate',         // 额外仇恨率

];

/** 需要除以100的比率属性键名列表 */
const RATIO_DIVISOR_KEYS = [
    'dodge',          // 闪避率
    'crit',           // 暴击率
    'breakPower',     // 破防力
    'resolvePower',   // 镇压力
    'cooldownSpeed',  // 冷却速度
    'moveSpeed',     // 移动速度
];

/** 五行元素键名列表 */
const ELEMENT_GROUP_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'];
/**
 * 世界投影服务类
 * 
 * 负责管理游戏世界到客户端视图的投影
 */
let WorldProjectorService = class WorldProjectorService {
    /** 玩家视图缓存：playerId -> ViewSnapshot */
    cacheByPlayerId = new Map();
    
    /**
     * 创建初始同步数据包
     * 
     * 为新连接的玩家创建完整的初始同步数据包，包含所有必要的状态信息
     * 
     * @param binding 会话绑定信息
     * @param view 玩家视图
     * @param player 玩家状态
     * @returns 初始同步数据包
     */
    createInitialEnvelope(binding, view, player) {
        this.cacheByPlayerId.set(binding.playerId, captureProjectorState(view, player));
        return {
            initSession: {
                sid: binding.sessionId,           // 会话ID
                pid: binding.playerId,           // 玩家ID
                t: view.tick,                   // 当前tick
                resumed: binding.resumed || undefined, // 是否恢复会话
            },
            mapEnter: buildMapEnter(view),      // 地图进入信息
            worldDelta: buildFullWorldDelta(view), // 完整世界状态
            selfDelta: buildFullSelfDelta(player), // 完整玩家状态
            panelDelta: buildFullPanelDelta(player), // 完整面板状态
        };
    }
    
    /**
     * 创建增量同步数据包
     * 
     * 基于缓存的视图和当前视图，计算差异并创建增量同步数据包
     * 
     * @param view 当前玩家视图
     * @param player 当前玩家状态
     * @returns 增量同步数据包，如果没有变化则返回null
     */
    createDeltaEnvelope(view, player) {
        // 获取缓存的视图
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
        
        // 如果没有任何变化，返回null
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
        
        // 返回增量同步数据包
        return {
            worldDelta: playerPatch.length > 0 || monsterPatch.length > 0 || npcPatch.length > 0 || portalPatch.length > 0 || groundPatch.length > 0 || containerPatch.length > 0
                ? {
                    t: view.tick,                              // 当前tick
                    wr: view.worldRevision,                    // 世界版本号
                    sr: view.selfRevision,                     // 玩家版本号
                    p: playerPatch.length > 0 ? playerPatch : undefined,      // 玩家差异
                    m: monsterPatch.length > 0 ? monsterPatch : undefined,    // 怪物差异
                    n: npcPatch.length > 0 ? npcPatch : undefined,          // NPC差异
                    o: portalPatch.length > 0 ? portalPatch : undefined,    // 传送门差异
                    g: groundPatch.length > 0 ? groundPatch : undefined,    // 地面物品差异
                    c: containerPatch.length > 0 ? containerPatch : undefined, // 容器差异
                }
                : undefined,
            selfDelta: selfDelta ?? undefined,      // 玩家状态差异
            panelDelta: panelDelta ?? undefined,    // 面板状态差异
        };
    }
    
    /**
     * 清除指定玩家的视图缓存
     * 
     * @param playerId 玩家ID
     */
    clear(playerId) {
        this.cacheByPlayerId.delete(playerId);
    }
    
    /**
     * 获取事件名称列表
     * 
     * @returns Next协议的服务器到客户端事件名称列表
     */
    getEventNames() {
        return shared_1.NEXT_S2C;
    }
};
exports.WorldProjectorService = WorldProjectorService;
exports.WorldProjectorService = WorldProjectorService = __decorate([
    (0, common_1.Injectable)()
], WorldProjectorService);
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
function buildFullWorldDelta(view) {
    const players = Array.from(view.visiblePlayers, (entry) => ({
        id: entry.playerId,
        x: entry.x,
        y: entry.y,
    }));
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
function captureWorldState(view) {
    return {
        instanceId: view.instance.instanceId,
        worldRevision: view.worldRevision,
        players: new Map(view.visiblePlayers.map((entry) => [entry.playerId, {
                x: entry.x,
                y: entry.y,
            }])),
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
            inventoryRevision: player.inventory.revision,
            inventoryCapacity: player.inventory.capacity,
            inventoryItems: player.inventory.items.map((entry) => ({ ...entry })),
            equipmentRevision: player.equipment.revision,
            equipmentSlots: player.equipment.slots.map((entry) => ({
                slot: entry.slot,
                item: entry.item ? { ...entry.item } : null,
            })),
            techniqueRevision: player.techniques.revision,
            techniques: player.techniques.techniques.map((entry) => cloneTechniqueEntry(entry)),
            cultivatingTechId: player.techniques.cultivatingTechId,
            bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
            attrRevision: player.attrs.revision,
            attrStage: player.attrs.stage,
            baseAttrs: cloneAttributes(player.attrs.baseAttrs),
            attrBonuses: buildAttrBonuses(player),
            finalAttrs: cloneAttributes(player.attrs.finalAttrs),
            numericStats: cloneNumericStats(player.attrs.numericStats),
            ratioDivisors: cloneNumericRatioDivisors(player.attrs.ratioDivisors),
            attrSpecialStats: cloneSpecialStats({
                foundation: player.foundation,
                combatExp: player.combatExp,
            }),
            attrBoneAgeBaseYears: player.boneAgeBaseYears,
            attrLifeElapsedTicks: player.lifeElapsedTicks,
            attrLifespanYears: player.lifespanYears,
            attrRealmProgress: player.realm?.progress,
            attrRealmProgressToNext: player.realm?.progressToNext,
            attrRealmBreakthroughReady: player.realm?.breakthroughReady,
            actionRevision: player.actions.revision,
            actions: player.actions.actions.map((entry) => ({ ...entry })),
            actionAutoBattle: player.combat.autoBattle,
            actionCombatTargetId: player.combat.combatTargetId,
            actionCombatTargetLocked: player.combat.combatTargetLocked,
            actionAutoRetaliate: player.combat.autoRetaliate,
            actionAutoBattleStationary: player.combat.autoBattleStationary,
            actionAllowAoePlayerHit: player.combat.allowAoePlayerHit,
            actionAutoIdleCultivation: player.combat.autoIdleCultivation,
            actionAutoSwitchCultivation: player.combat.autoSwitchCultivation,
            actionCultivationActive: player.combat.cultivationActive,
            actionSenseQiActive: player.combat.senseQiActive,
            buffRevision: player.buffs.revision,
            buffs: player.buffs.buffs.map((entry) => cloneVisibleBuff(entry)),
        },
    };
}
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
function captureProjectorState(view, player) {
    return combineProjectorState(captureWorldState(view), capturePlayerState(player));
}
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
function buildFullActionDelta(player) {
    return {
        r: player.actions.revision,
        full: 1,
        actions: player.actions.actions.map((entry) => ({ ...entry })),
        actionOrder: player.actions.actions.map((entry) => entry.id),
        autoBattle: player.combat.autoBattle,
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
function buildFullBuffDelta(player) {
    return {
        r: player.buffs.revision,
        full: 1,
        buffs: player.buffs.buffs.map((entry) => cloneVisibleBuff(entry)),
    };
}
function buildAttrDelta(previous, player) {
    const stageChanged = previous.panel.attrStage !== player.attrs.stage;
    const baseAttrsPatch = diffAttributes(previous.panel.baseAttrs, player.attrs.baseAttrs);
    const nextBonuses = buildAttrBonuses(player);
    const bonusesChanged = !isSameAttrBonuses(previous.panel.attrBonuses, nextBonuses);
    const finalAttrsPatch = diffAttributes(previous.panel.finalAttrs, player.attrs.finalAttrs);
    const numericStatsPatch = diffNumericStats(previous.panel.numericStats, player.attrs.numericStats);
    const ratioDivisorsPatch = diffRatioDivisors(previous.panel.ratioDivisors, player.attrs.ratioDivisors);
    const nextSpecialStats = {
        foundation: player.foundation,
        combatExp: player.combatExp,
    };
    const specialStatsChanged = !isSameSpecialStats(previous.panel.attrSpecialStats, nextSpecialStats);
    const boneAgeBaseYearsChanged = previous.panel.attrBoneAgeBaseYears !== player.boneAgeBaseYears;
    const lifeElapsedTicksChanged = previous.panel.attrLifeElapsedTicks !== player.lifeElapsedTicks;
    const lifespanYearsChanged = previous.panel.attrLifespanYears !== player.lifespanYears;
    const realmProgressChanged = previous.panel.attrRealmProgress !== player.realm?.progress;
    const realmProgressToNextChanged = previous.panel.attrRealmProgressToNext !== player.realm?.progressToNext;
    const realmBreakthroughReadyChanged = previous.panel.attrRealmBreakthroughReady !== player.realm?.breakthroughReady;
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
function buildSelfDelta(previous, player) {
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
    if (previous.self.x !== player.x) {
        delta.x = player.x;
    }
    if (previous.self.y !== player.y) {
        delta.y = player.y;
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
function buildPanelDelta(previous, player) {
    const delta = {};
    if (previous.panel.inventoryRevision !== player.inventory.revision) {
        const slotPatch = diffInventorySlots(previous.panel.inventoryItems, player.inventory.items);
        delta.inv = {
            r: player.inventory.revision,
            capacity: previous.panel.inventoryCapacity !== player.inventory.capacity ? player.inventory.capacity : undefined,
            size: previous.panel.inventoryItems.length !== player.inventory.items.length ? player.inventory.items.length : undefined,
            slots: slotPatch.length > 0 ? slotPatch : undefined,
        };
    }
    if (previous.panel.equipmentRevision !== player.equipment.revision) {
        const slotPatch = diffEquipmentSlots(previous.panel.equipmentSlots, player.equipment.slots);
        delta.eq = {
            r: player.equipment.revision,
            slots: slotPatch,
        };
    }
    if (previous.panel.techniqueRevision !== player.techniques.revision) {
        const techniquePatch = diffTechniqueEntries(previous.panel.techniques, player.techniques.techniques);
        const removed = diffRemovedTechniqueIds(previous.panel.techniques, player.techniques.techniques);
        delta.tech = {
            r: player.techniques.revision,
            techniques: techniquePatch,
            removeTechniqueIds: removed.length > 0 ? removed : undefined,
            cultivatingTechId: previous.panel.cultivatingTechId !== player.techniques.cultivatingTechId
                ? player.techniques.cultivatingTechId
                : undefined,
            bodyTraining: previous.panel.bodyTraining !== player.bodyTraining
                ? (player.bodyTraining ? { ...player.bodyTraining } : null)
                : undefined,
        };
    }
    const attrMetaChanged = previous.panel.attrBoneAgeBaseYears !== player.boneAgeBaseYears
        || previous.panel.attrLifeElapsedTicks !== player.lifeElapsedTicks
        || previous.panel.attrLifespanYears !== player.lifespanYears
        || previous.panel.attrRealmProgress !== player.realm?.progress
        || previous.panel.attrRealmProgressToNext !== player.realm?.progressToNext
        || previous.panel.attrRealmBreakthroughReady !== player.realm?.breakthroughReady
        || !isSameSpecialStats(previous.panel.attrSpecialStats, {
            foundation: player.foundation,
            combatExp: player.combatExp,
        })
        || !isSameAttrBonuses(previous.panel.attrBonuses, buildAttrBonuses(player));
    if (previous.panel.attrRevision !== player.attrs.revision || attrMetaChanged) {
        delta.attr = buildAttrDelta(previous, player);
    }
    if (previous.panel.actionRevision !== player.actions.revision) {
        const actionPatch = diffActionEntries(previous.panel.actions, player.actions.actions);
        const removedActionIds = diffRemovedActionIds(previous.panel.actions, player.actions.actions);
        delta.act = {
            r: player.actions.revision,
            actions: actionPatch,
            removeActionIds: removedActionIds.length > 0 ? removedActionIds : undefined,
        };
    }
    const actionTopLevelChanged = previous.panel.actionAutoBattle !== player.combat.autoBattle
        || previous.panel.actionCombatTargetId !== player.combat.combatTargetId
        || previous.panel.actionCombatTargetLocked !== player.combat.combatTargetLocked
        || previous.panel.actionAutoRetaliate !== player.combat.autoRetaliate
        || previous.panel.actionAutoBattleStationary !== player.combat.autoBattleStationary
        || previous.panel.actionAllowAoePlayerHit !== player.combat.allowAoePlayerHit
        || previous.panel.actionAutoIdleCultivation !== player.combat.autoIdleCultivation
        || previous.panel.actionAutoSwitchCultivation !== player.combat.autoSwitchCultivation
        || previous.panel.actionCultivationActive !== player.combat.cultivationActive
        || previous.panel.actionSenseQiActive !== player.combat.senseQiActive;
    if (actionTopLevelChanged) {
        delta.act = {
            ...(delta.act ?? { r: player.actions.revision }),
            actionOrder: player.actions.actions.map((entry) => entry.id),
            autoBattle: player.combat.autoBattle,
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
    if (previous.panel.buffRevision !== player.buffs.revision) {
        const buffPatch = diffBuffEntries(previous.panel.buffs, player.buffs.buffs);
        const removedBuffIds = diffRemovedBuffIds(previous.panel.buffs, player.buffs.buffs);
        delta.buff = {
            r: player.buffs.revision,
            buffs: buffPatch,
            removeBuffIds: removedBuffIds.length > 0 ? removedBuffIds : undefined,
        };
    }
    return delta.inv || delta.eq || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
}
function diffPlayerEntries(previous, current) {
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
function diffNpcEntries(previous, current) {
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
function isSameNpcQuestMarker(left, right) {
    return left?.line === right?.line && left?.state === right?.state;
}
function diffPortalEntries(previous, current) {
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
function diffMonsterEntries(previous, current) {
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
function diffGroundPiles(previous, current) {
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
function diffContainerEntries(previous, current) {
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
function diffInventorySlots(previous, current) {
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
function diffEquipmentSlots(previous, current) {
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
function diffTechniqueEntries(previous, current) {
    const previousById = new Map(previous.map((entry) => [entry.techId, entry]));
    return current
        .filter((entry) => !isSameTechniqueEntry(previousById.get(entry.techId) ?? null, entry))
        .map((entry) => cloneTechniqueEntry(entry));
}
function diffRemovedTechniqueIds(previous, current) {
    const currentIds = new Set(current.map((entry) => entry.techId));
    return previous
        .map((entry) => entry.techId)
        .filter((techId) => !currentIds.has(techId));
}
function diffActionEntries(previous, current) {
    const previousById = new Map(previous.map((entry) => [entry.id, entry]));
    return current
        .filter((entry) => !isSameActionEntry(previousById.get(entry.id) ?? null, entry))
        .map((entry) => ({ ...entry }));
}
function diffRemovedActionIds(previous, current) {
    const currentIds = new Set(current.map((entry) => entry.id));
    return previous
        .map((entry) => entry.id)
        .filter((actionId) => !currentIds.has(actionId));
}
function diffBuffEntries(previous, current) {
    const previousById = new Map(previous.map((entry) => [entry.buffId, entry]));
    return current
        .filter((entry) => !isSameBuffEntry(previousById.get(entry.buffId) ?? null, entry))
        .map((entry) => cloneVisibleBuff(entry));
}
function diffRemovedBuffIds(previous, current) {
    const currentIds = new Set(current.map((entry) => entry.buffId));
    return previous
        .map((entry) => entry.buffId)
        .filter((buffId) => !currentIds.has(buffId));
}
function diffAttributes(previous, current) {
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
function diffNumericStats(previous, current) {
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
function diffRatioDivisors(previous, current) {
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
function diffElementGroup(previous, current) {
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
function isSameItem(left, right) {
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
        && left.tileAuraGainAmount === right.tileAuraGainAmount
        && left.allowBatchUse === right.allowBatchUse;
}
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
function isSameTechniqueEntry(left, right) {
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
function isSameActionEntry(left, right) {
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
function isSameBuffEntry(left, right) {
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
function isSameGroundPile(left, right) {
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
function isSameGroundItemEntry(left, right) {
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
function shallowEqualArray(left, right) {
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
function shallowEqualRecord(left, right) {
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
function shallowEqualValue(left, right) {
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
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
function buildAttrBonuses(player) {
    return Array.isArray(player.bonuses)
        ? player.bonuses.map((entry) => cloneAttrBonus(entry))
        : [];
}
function cloneSpecialStats(source) {
    return {
        foundation: source.foundation,
        combatExp: source.combatExp,
    };
}
function isSameAttrBonuses(left, right) {
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
function isSameSpecialStats(left, right) {
    return left.foundation === right.foundation
        && left.combatExp === right.combatExp;
}
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
function clonePartialNumericStats(source) {
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
function cloneVisibleBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}
function buildPortalId(x, y) {
    return `${x}:${y}`;
}
//# sourceMappingURL=world-projector.service.js.map
