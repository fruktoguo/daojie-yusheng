"use strict";
/**
 * 用途：基准测试 sync 链路性能。
 */

Object.defineProperty(exports, "__esModule", { value: true });
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** world_projector_service_1：定义该变量以承载业务值。 */
const world_projector_service_1 = require("../network/world-projector.service");
/**
 * 记录iterations。
 */
const ITERATIONS = 20_000;
/**
 * 串联执行脚本主流程。
 */
function main() {
/**
 * 记录binding。
 */
    const binding = {
        playerId: 'bench_player',
        sessionId: 'bench_session',
        socketId: null,
        resumed: false,
        connected: true,
        detachedAt: null,
        expireAt: null,
    };
/**
 * 记录baseview。
 */
    const baseView = createBaseView();
/**
 * 记录base玩家。
 */
    const basePlayer = createBasePlayer();
/**
 * 记录scenarios。
 */
    const scenarios = [
        runIdleScenario(binding, baseView, basePlayer),
        runMoveScenario(binding, baseView, basePlayer),
        runInventoryScenario(binding, baseView, basePlayer),
        runGroundScenario(binding, baseView, basePlayer),
        runTechniqueScenario(binding, baseView, basePlayer),
    ];
    console.log(JSON.stringify({
        ok: true,
        iterations: ITERATIONS,
        scenarios,
    }, null, 2));
}
/**
 * 运行idlescenario。
 */
function runIdleScenario(binding, baseView, basePlayer) {
/**
 * 记录projector。
 */
    const projector = new world_projector_service_1.WorldProjectorService();
    projector.createInitialEnvelope(binding, baseView, basePlayer);
/**
 * 记录durationsms。
 */
    const durationsMs = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
/**
 * 记录startedat。
 */
        const startedAt = performance.now();
/**
 * 记录envelope。
 */
        const envelope = projector.createDeltaEnvelope(baseView, basePlayer);
        durationsMs.push(performance.now() - startedAt);
        if (envelope !== null) {
            throw new Error('idle scenario should not emit envelope');
        }
    }
    return {
        name: 'idle-steady-state',
        avgMs: round6(average(durationsMs)),
        p95Ms: round6(percentile(durationsMs, 0.95)),
        p99Ms: round6(percentile(durationsMs, 0.99)),
        avgBytes: 0,
        p95Bytes: 0,
        maxBytes: 0,
    };
}
/**
 * 运行movescenario。
 */
function runMoveScenario(binding, baseView, basePlayer) {
/**
 * 记录projector。
 */
    const projector = new world_projector_service_1.WorldProjectorService();
    projector.createInitialEnvelope(binding, baseView, basePlayer);
/**
 * 记录movedview。
 */
    const movedView = {
        ...baseView,
        tick: baseView.tick + 1,
        worldRevision: baseView.worldRevision + 1,
        selfRevision: baseView.selfRevision + 1,
        self: {
            ...baseView.self,
            x: baseView.self.x + 1,
        },
    };
/**
 * 记录moved玩家。
 */
    const movedPlayer = {
        ...basePlayer,
        x: basePlayer.x + 1,
        selfRevision: basePlayer.selfRevision + 1,
    };
    return runAlternatingScenario('self-move', projector, [
        { view: movedView, player: movedPlayer },
        { view: baseView, player: basePlayer },
    ]);
}
/**
 * 运行inventoryscenario。
 */
function runInventoryScenario(binding, baseView, basePlayer) {
/**
 * 记录projector。
 */
    const projector = new world_projector_service_1.WorldProjectorService();
    projector.createInitialEnvelope(binding, baseView, basePlayer);
/**
 * 记录patched物品。
 */
    const patchedItem = {
        ...basePlayer.inventory.items[1],
        count: basePlayer.inventory.items[1].count + 2,
    };
/**
 * 记录next玩家。
 */
    const nextPlayer = {
        ...basePlayer,
        inventory: {
            ...basePlayer.inventory,
            revision: basePlayer.inventory.revision + 1,
            items: [
                basePlayer.inventory.items[0],
                patchedItem,
            ],
        },
    };
    return runAlternatingScenario('inventory-single-slot', projector, [
        { view: baseView, player: nextPlayer },
        { view: baseView, player: basePlayer },
    ]);
}
/**
 * 运行功法scenario。
 */
function runTechniqueScenario(binding, baseView, basePlayer) {
/**
 * 记录projector。
 */
    const projector = new world_projector_service_1.WorldProjectorService();
    projector.createInitialEnvelope(binding, baseView, basePlayer);
/**
 * 记录功法entry。
 */
    const techniqueEntry = {
        techId: 'bench.technique',
        level: 1,
        exp: 0,
        expToNext: 1200,
        realmLv: 1,
        realm: 0,
        name: '基准功法',
        grade: 'mortal',
        category: 'arts',
        skills: [],
        layers: [],
        attrCurves: null,
    };
/**
 * 记录next玩家。
 */
    const nextPlayer = {
        ...basePlayer,
        techniques: {
            ...basePlayer.techniques,
            revision: basePlayer.techniques.revision + 1,
            techniques: [techniqueEntry],
            cultivatingTechId: techniqueEntry.techId,
        },
    };
    return runAlternatingScenario('technique-learn', projector, [
        { view: baseView, player: nextPlayer },
        { view: baseView, player: basePlayer },
    ]);
}
/**
 * 运行groundscenario。
 */
function runGroundScenario(binding, baseView, basePlayer) {
/**
 * 记录projector。
 */
    const projector = new world_projector_service_1.WorldProjectorService();
    projector.createInitialEnvelope(binding, baseView, basePlayer);
/**
 * 记录nextview。
 */
    const nextView = {
        ...baseView,
        tick: baseView.tick + 1,
        worldRevision: baseView.worldRevision + 1,
        localMonsters: [{
                runtimeId: 'monster:bench:m_dummy:0',
                monsterId: 'm_dummy',
                name: '基准傀儡',
                char: '傀',
                color: '#8c6f52',
                tier: 'mortal_blood',
                x: 12,
                y: 18,
                hp: 18,
                maxHp: 18,
            }],
        localGroundPiles: [{
                sourceId: 'g:1164',
                x: 12,
                y: 18,
                items: [{
                        itemKey: 'rat_tail',
                        itemId: 'rat_tail',
                        name: '鼠尾',
                        type: 'material',
                        count: 2,
                    }],
            }],
    };
    return runAlternatingScenario('ground-single-pile', projector, [
        { view: nextView, player: basePlayer },
        { view: baseView, player: basePlayer },
    ]);
}
/**
 * 运行alternatingscenario。
 */
function runAlternatingScenario(name, projector, states) {
/**
 * 记录durationsms。
 */
    const durationsMs = [];
/**
 * 记录payloadbytes。
 */
    const payloadBytes = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
/**
 * 记录状态。
 */
        const state = states[index % states.length];
/**
 * 记录startedat。
 */
        const startedAt = performance.now();
/**
 * 记录envelope。
 */
        const envelope = projector.createDeltaEnvelope(state.view, state.player);
        durationsMs.push(performance.now() - startedAt);
        payloadBytes.push(estimateBytes(envelope));
    }
    return {
        name,
        avgMs: round6(average(durationsMs)),
        p95Ms: round6(percentile(durationsMs, 0.95)),
        p99Ms: round6(percentile(durationsMs, 0.99)),
        avgBytes: round3(average(payloadBytes)),
        p95Bytes: percentile(payloadBytes, 0.95),
        maxBytes: Math.max(...payloadBytes),
    };
}
/**
 * 创建baseview。
 */
function createBaseView() {
    return {
        playerId: 'bench_player',
        sessionId: 'bench_session',
        tick: 100,
        worldRevision: 10,
        selfRevision: 5,
        instance: {
            instanceId: 'public:bench',
            templateId: 'bench_map',
            name: 'Bench Map',
            kind: 'public',
            width: 64,
            height: 64,
        },
        self: {
            x: 12,
            y: 18,
            facing: shared_1.Direction.South,
        },
        localLandmarks: [],
        localSafeZones: [],
        visiblePlayers: Array.from({ length: 18 }, (_, index) => ({
            playerId: `other_${index}`,
            x: 20 + (index % 6),
            y: 20 + Math.trunc(index / 6),
        })),
        localContainers: [],
        localMonsters: [],
        localNpcs: [],
        localPortals: [
            {
                x: 16,
                y: 18,
                trigger: 'manual',
                targetMapId: 'bench_target',
            },
        ],
        localGroundPiles: [],
    };
}
/**
 * 创建base玩家。
 */
function createBasePlayer() {
/**
 * 记录inventoryitems。
 */
    const inventoryItems = [
        {
            itemId: 'book.qingmu_sword',
            name: '青木剑诀残页',
            type: 'consumable',
            desc: '用于基准同步测试的功法书。',
            allowBatchUse: false,
            count: 1,
        },
        {
            itemId: 'rat_tail',
            name: '鼠尾',
            type: 'material',
            desc: '用于基准同步测试的材料。',
            allowBatchUse: false,
            count: 3,
        },
    ];
/**
 * 记录equipmentslots。
 */
    const equipmentSlots = [
        { slot: 'weapon', item: null },
        { slot: 'head', item: null },
        { slot: 'body', item: null },
        { slot: 'legs', item: null },
        { slot: 'accessory', item: null },
    ];
    return {
        playerId: 'bench_player',
        sessionId: 'bench_session',
        name: 'bench_player',
        displayName: 'P',
        persistentRevision: 1,
        persistedRevision: 1,
        instanceId: 'public:bench',
        templateId: 'bench_map',
        x: 12,
        y: 18,
        facing: shared_1.Direction.South,
        hp: 100,
        maxHp: 100,
        qi: 20,
        maxQi: 100,
        foundation: 0,
        combatExp: 0,
        boneAgeBaseYears: 16,
        lifeElapsedTicks: 0,
        lifespanYears: null,
        realm: null,
        heavenGate: null,
        spiritualRoots: null,
        unlockedMapIds: [],
        selfRevision: 5,
        inventory: {
            revision: 2,
            capacity: 100,
            items: inventoryItems,
        },
        equipment: {
            revision: 1,
            slots: equipmentSlots,
        },
        techniques: {
            revision: 1,
            techniques: [],
            cultivatingTechId: null,
        },
        attrs: {
            revision: 1,
            stage: shared_1.PlayerRealmStage.Mortal,
            baseAttrs: {
                constitution: 10,
                spirit: 10,
                perception: 10,
                talent: 10,
                comprehension: 0,
                luck: 0,
            },
            finalAttrs: {
                constitution: 10,
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
                spellAtk: 5.5,
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
                elementDamageBonus: {
                    metal: 0,
                    wood: 0,
                    water: 0,
                    fire: 0,
                    earth: 0,
                },
                elementDamageReduce: {
                    metal: 0,
                    wood: 0,
                    water: 0,
                    fire: 0,
                    earth: 0,
                },
            },
            ratioDivisors: {
                dodge: 100,
                crit: 100,
                breakPower: 100,
                resolvePower: 100,
                cooldownSpeed: 100,
                moveSpeed: 100,
                elementDamageReduce: {
                    metal: 100,
                    wood: 100,
                    water: 100,
                    fire: 100,
                    earth: 100,
                },
            },
        },
        combat: {
            cooldownReadyTickBySkillId: {},
            autoBattle: false,
            autoRetaliate: true,
            autoBattleStationary: false,
            combatTargetId: null,
            combatTargetLocked: false,
            allowAoePlayerHit: false,
            autoIdleCultivation: true,
            autoSwitchCultivation: false,
            senseQiActive: false,
            autoBattleSkills: [],
            cultivationActive: false,
            lastActiveTick: 0,
        },
        actions: {
            revision: 1,
            contextActions: [],
            actions: [],
        },
        buffs: {
            revision: 1,
            buffs: [],
        },
        notices: {
            nextId: 1,
            queue: [],
        },
        quests: {
            revision: 1,
            quests: [],
        },
        lootWindowTarget: null,
        pendingLogbookMessages: [],
        vitalRecoveryDeferredUntilTick: -1,
    };
}
/**
 * 处理estimatebytes。
 */
function estimateBytes(value) {
    if (!value) {
        return 0;
    }
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
/**
 * 处理average。
 */
function average(values) {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
/**
 * 处理percentile。
 */
function percentile(values, ratio) {
    if (values.length === 0) {
        return 0;
    }
/**
 * 记录sorted。
 */
    const sorted = [...values].sort((left, right) => left - right);
/**
 * 记录索引。
 */
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index];
}
/**
 * 处理round3。
 */
function round3(value) {
    return Number(value.toFixed(3));
}
/**
 * 处理round6。
 */
function round6(value) {
    return Number(value.toFixed(6));
}
main();
//# sourceMappingURL=bench-sync.js.map
