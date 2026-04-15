"use strict";
/**
 * 用途：基准测试 combat 链路性能。
 */

Object.defineProperty(exports, "__esModule", { value: true });
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** player_combat_service_1：定义该变量以承载业务值。 */
const player_combat_service_1 = require("../runtime/combat/player-combat.service");
/**
 * 记录iterations。
 */
const ITERATIONS = 20_000;
/**
 * 串联执行脚本主流程。
 */
function main() {
/**
 * 记录attacker。
 */
    const attacker = createAttacker();
/**
 * 记录defender。
 */
    const defender = createDefender();
/**
 * 记录combat服务。
 */
    const combatService = new player_combat_service_1.PlayerCombatService(createRuntimeAdapter(attacker, defender));
/**
 * 记录durationsms。
 */
    const durationsMs = [];
/**
 * 记录totaldamage。
 */
    let totalDamage = 0;
/**
 * 记录totalqicost。
 */
    let totalQiCost = 0;
/**
 * 记录tick。
 */
    let tick = 1;
    for (let index = 0; index < ITERATIONS; index += 1) {
        attacker.qi = attacker.maxQi;
        attacker.selfRevision += 1;
        defender.hp = defender.maxHp;
        defender.selfRevision += 1;
/**
 * 记录startedat。
 */
        const startedAt = performance.now();
/**
 * 累计当前结果。
 */
        const result = combatService.castSkill(attacker, defender, 'skill.qingmu_slash', tick, 1);
        durationsMs.push(performance.now() - startedAt);
        totalDamage += result.totalDamage;
        totalQiCost += result.qiCost;
        tick += 17;
    }
    console.log(JSON.stringify({
        ok: true,
        iterations: ITERATIONS,
        avgMs: round6(average(durationsMs)),
        p95Ms: round6(percentile(durationsMs, 0.95)),
        p99Ms: round6(percentile(durationsMs, 0.99)),
        avgDamage: round3(totalDamage / ITERATIONS),
        avgQiCost: round3(totalQiCost / ITERATIONS),
        lastCooldownReadyTick: attacker.combat.cooldownReadyTickBySkillId['skill.qingmu_slash'],
    }, null, 2));
}
/**
 * 创建attacker。
 */
function createAttacker() {
    return {
        playerId: 'bench_attacker',
        sessionId: 'bench_session_attacker',
        name: 'bench_attacker',
        displayName: 'A',
        persistentRevision: 1,
        persistedRevision: 1,
        instanceId: 'public:bench',
        templateId: 'bench',
        x: 10,
        y: 10,
        facing: shared_1.Direction.East,
        hp: 120,
        maxHp: 120,
        qi: 61,
        maxQi: 61,
        foundation: 0,
        combatExp: 0,
        boneAgeBaseYears: 16,
        lifeElapsedTicks: 0,
        lifespanYears: null,
        realm: null,
        heavenGate: null,
        spiritualRoots: null,
        unlockedMapIds: [],
        selfRevision: 1,
        inventory: {
            revision: 1,
            capacity: 100,
            items: [],
        },
        equipment: {
            revision: 1,
            slots: [
                { slot: 'weapon', item: null },
                { slot: 'head', item: null },
                { slot: 'body', item: null },
                { slot: 'legs', item: null },
                { slot: 'accessory', item: null },
            ],
        },
        techniques: {
            revision: 2,
            techniques: [createTechnique()],
            cultivatingTechId: 'qingmu_sword',
        },
        attrs: {
            revision: 3,
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
                spirit: 11,
                perception: 13,
                talent: 10,
                comprehension: 0,
                luck: 0,
            },
            numericStats: {
                maxHp: 120,
                maxQi: 60.5,
                physAtk: 11,
                spellAtk: 5.55,
                physDef: 10,
                spellDef: 11,
                hit: 13,
                dodge: 13,
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
                moveSpeed: 13,
                extraAggroRate: 0,
                elementDamageBonus: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
                elementDamageReduce: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
            },
            ratioDivisors: {
                dodge: 100,
                crit: 100,
                breakPower: 100,
                resolvePower: 100,
                cooldownSpeed: 100,
                moveSpeed: 100,
                elementDamageReduce: { metal: 100, wood: 100, water: 100, fire: 100, earth: 100 },
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
 * 创建defender。
 */
function createDefender() {
    return {
        playerId: 'bench_defender',
        sessionId: 'bench_session_defender',
        name: 'bench_defender',
        displayName: 'D',
        persistentRevision: 1,
        persistedRevision: 1,
        instanceId: 'public:bench',
        templateId: 'bench',
        x: 11,
        y: 10,
        facing: shared_1.Direction.West,
        hp: 120,
        maxHp: 120,
        qi: 0,
        maxQi: 60,
        foundation: 0,
        combatExp: 0,
        boneAgeBaseYears: 16,
        lifeElapsedTicks: 0,
        lifespanYears: null,
        realm: null,
        heavenGate: null,
        spiritualRoots: null,
        unlockedMapIds: [],
        selfRevision: 1,
        inventory: {
            revision: 1,
            capacity: 100,
            items: [],
        },
        equipment: {
            revision: 1,
            slots: [
                { slot: 'weapon', item: null },
                { slot: 'head', item: null },
                { slot: 'body', item: null },
                { slot: 'legs', item: null },
                { slot: 'accessory', item: null },
            ],
        },
        techniques: {
            revision: 1,
            techniques: [],
            cultivatingTechId: null,
        },
        attrs: {
            revision: 2,
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
                elementDamageBonus: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
                elementDamageReduce: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
            },
            ratioDivisors: {
                dodge: 100,
                crit: 100,
                breakPower: 100,
                resolvePower: 100,
                cooldownSpeed: 100,
                moveSpeed: 100,
                elementDamageReduce: { metal: 100, wood: 100, water: 100, fire: 100, earth: 100 },
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
 * 创建功法。
 */
function createTechnique() {
    return {
        techId: 'qingmu_sword',
        level: 1,
        exp: 0,
        expToNext: 1300,
        realmLv: 1,
        realm: shared_1.TechniqueRealm.Entry,
        name: '青木剑诀',
        grade: 'mortal',
        category: 'arts',
        skills: [
            {
                id: 'skill.qingmu_slash',
                name: '青木斩',
                desc: '基准战斗技能',
                cooldown: 16,
                cost: 1,
                costMultiplier: 1,
                range: 1,
                effects: [
                    {
                        type: 'damage',
                        damageKind: 'spell',
                        element: 'wood',
                        formula: {
                            op: 'mul',
                            args: [
                                {
                                    op: 'add',
                                    args: [
                                        18,
                                        {
                                            var: 'caster.stat.spellAtk',
                                            scale: 0.8,
                                        },
                                    ],
                                },
                                {
                                    op: 'add',
                                    args: [
                                        1,
                                        {
                                            var: 'techLevel',
                                            scale: 0.08,
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                ],
                unlockLevel: 1,
            },
        ],
        layers: [],
        attrCurves: null,
    };
}
/**
 * 处理average。
 */
function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
/**
 * 处理percentile。
 */
function percentile(values, ratio) {
/**
 * 记录sorted。
 */
    const sorted = [...values].sort((left, right) => left - right);
/**
 * 记录索引。
 */
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index] ?? 0;
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
/**
 * 创建运行态adapter。
 */
function createRuntimeAdapter(...players) {
/**
 * 记录playersbyID。
 */
    const playersById = new Map(players.map((player) => [player.playerId, player]));
    return {
/** spendQi：执行对应的业务逻辑。 */
        spendQi(playerId, amount) {
/**
 * 记录玩家。
 */
            const player = getPlayerOrThrow(playersById, playerId);
            player.qi = Math.max(0, player.qi - Math.max(0, Math.round(amount)));
            player.selfRevision += 1;
            return player;
        },
/** setSkillCooldownReadyTick：执行对应的业务逻辑。 */
        setSkillCooldownReadyTick(playerId, skillId, readyTick, currentTick) {
/**
 * 记录玩家。
 */
            const player = getPlayerOrThrow(playersById, playerId);
            player.combat.cooldownReadyTickBySkillId[skillId] = Math.max(0, Math.trunc(readyTick));
            rebuildBenchActions(player, currentTick);
            return player;
        },
/** applyTemporaryBuff：执行对应的业务逻辑。 */
        applyTemporaryBuff(playerId, buff) {
/**
 * 记录玩家。
 */
            const player = getPlayerOrThrow(playersById, playerId);
/**
 * 记录existing。
 */
            const existing = player.buffs.buffs.find((entry) => entry.buffId === buff.buffId);
            if (existing) {
                existing.remainingTicks = Math.max(existing.remainingTicks, buff.remainingTicks);
                existing.duration = Math.max(existing.duration, buff.duration);
                existing.stacks = Math.min(existing.maxStacks, Math.max(existing.stacks, buff.stacks));
            }
            else {
                player.buffs.buffs.push({
                    ...buff,
                    attrs: buff.attrs ? { ...buff.attrs } : undefined,
                    stats: buff.stats ? { ...buff.stats } : undefined,
                    qiProjection: buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined,
                });
            }
            player.buffs.revision += 1;
            return player;
        },
/** applyDamage：执行对应的业务逻辑。 */
        applyDamage(playerId, amount) {
/**
 * 记录玩家。
 */
            const player = getPlayerOrThrow(playersById, playerId);
            player.hp = Math.max(0, player.hp - Math.max(0, Math.round(amount)));
            player.selfRevision += 1;
            return player;
        },
    };
}
/**
 * 获取玩家orthrow。
 */
function getPlayerOrThrow(playersById, playerId) {
/**
 * 记录玩家。
 */
    const player = playersById.get(playerId);
    if (!player) {
        throw new Error(`Player ${playerId} not found`);
    }
    return player;
}
/**
 * 处理rebuild压测actions。
 */
function rebuildBenchActions(player, currentTick) {
/**
 * 记录actions。
 */
    const actions = [];
    for (const technique of player.techniques.techniques) {
        for (const skill of technique.skills ?? []) {
            actions.push({
                id: skill.id,
                name: skill.name,
                type: 'skill',
                desc: skill.desc,
                cooldownLeft: Math.max(0, (player.combat.cooldownReadyTickBySkillId[skill.id] ?? 0) - currentTick),
                range: skill.targeting?.range ?? skill.range,
                requiresTarget: skill.requiresTarget ?? true,
                targetMode: skill.targetMode ?? 'entity',
            });
        }
    }
    player.actions.actions = actions;
    player.actions.revision += 1;
}
main();
//# sourceMappingURL=bench-combat.js.map
