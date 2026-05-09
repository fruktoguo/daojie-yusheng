// @ts-nocheck

/**
 * 用途：基准测试 combat 链路性能。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@mud/shared");
const combat_resolution_helpers_1 = require("../runtime/combat/combat-resolution.helpers");
const player_combat_service_1 = require("../runtime/combat/player-combat.service");
const world_runtime_basic_attack_service_1 = require("../runtime/world/world-runtime-basic-attack.service");
const world_runtime_combat_action_service_1 = require("../runtime/world/world-runtime-combat-action.service");
const world_runtime_instance_tick_orchestration_service_1 = require("../runtime/world/world-runtime-instance-tick-orchestration.service");
/**
 * 记录iterations。
 */
const ITERATIONS = 20_000;
const HOT_PATH_ITERATIONS = 10_000;
const EVENT_BATCH_ITERATIONS = 1_000;
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    const lastCooldownReadyTick = attacker.combat.cooldownReadyTickBySkillId['skill.qingmu_slash'];
    const skillSingleTarget = {
        avgMs: round6(average(durationsMs)),
        p95Ms: round6(percentile(durationsMs, 0.95)),
        p99Ms: round6(percentile(durationsMs, 0.99)),
    };
    const hotPath = await benchmarkCombatHotPath(attacker, defender);
    const passed = {
        skillSingleTargetP95Lt5Ms: skillSingleTarget.p95Ms < 5,
        ...hotPath.passed,
    };
    const ok = Object.values(passed).every(Boolean);
    console.log(JSON.stringify({
        ok,
        iterations: ITERATIONS,
        ...skillSingleTarget,
        thresholds: {
            skillSingleTargetP95LtMs: 5,
            basicAttackSingleTargetP95LtMs: 1,
            actionDryRunSingleTargetP95LtMs: 10,
            skillFiveTargetsP95LtMs: 5,
            targetCollection100P95LtMs: 1,
            targetValidationSingleP95LtMs: 0.5,
            hitResolutionSingleP95LtMs: 0.5,
            eventBuild100P95LtMs: 10,
            aoiBroadcastSerialization100P95LtMs: 10,
            batch100PlayerBasicAttacksP95LtMs: 50,
            batch50MonsterSkillsP95LtMs: 100,
            fullInstanceTick100PlayersP95LtMs: 50,
            fullInstanceTick50MonsterSkillsP95LtMs: 100,
        },
        hotPath,
        passed,
        avgDamage: round3(totalDamage / ITERATIONS),
        avgQiCost: round3(totalQiCost / ITERATIONS),
        lastCooldownReadyTick,
    }, null, 2));
    if (!ok) {
        process.exitCode = 1;
    }
}

async function benchmarkCombatHotPath(attacker, defender) {
    const service = new world_runtime_combat_action_service_1.WorldRuntimeCombatActionService();
    const basicAttackService = new world_runtime_basic_attack_service_1.WorldRuntimeBasicAttackService(null, service);
    const skill = createTechnique().skills[0];
    const multiTargets = Array.from({ length: 5 }, (_, index) => ({
        ...createDefender(),
        playerId: `bench_defender_${index}`,
        sessionId: `bench_session_defender_${index}`,
    }));
    const multiTargetCombatService = new player_combat_service_1.PlayerCombatService(createRuntimeAdapter(attacker, ...multiTargets));
    const action = service.createPlayerSkillAction({
        playerId: attacker.playerId,
        instanceId: attacker.instanceId,
        skillId: skill.id,
        targetMonsterId: 'bench_monster',
    });
    const definition = service.createSkillDefinition(action, {
        ...skill,
        range: 120,
        targeting: { shape: 'single', maxTargets: 100 },
    });
    const targets100 = Array.from({ length: 100 }, (_, index) => ({
        kind: 'monster',
        id: `bench_monster_${index}`,
        instanceId: attacker.instanceId,
        x: 10 + (index % 10),
        y: 10 + Math.floor(index / 10),
        runtime: {
            runtimeId: `bench_monster_${index}`,
            x: 10 + (index % 10),
            y: 10 + Math.floor(index / 10),
            alive: true,
        },
    }));
    const singleTarget = targets100[0];
    const dryRunInput = {
        action,
        player: {
            techniques: {
                techniques: [{
                    skills: [skill],
                }],
            },
        },
        actorPosition: { x: attacker.x, y: attacker.y },
        targets: [singleTarget],
        instance: {
            canSeeTileFrom: () => true,
            getMonster: (monsterId) => ({ runtimeId: monsterId, x: singleTarget.x, y: singleTarget.y, alive: true }),
        },
        resources: { qi: attacker.maxQi },
        cooldownReadyTickByActionId: { [skill.id]: 0 },
        currentTick: 1,
        resolveCombatRelation: () => ({ hostile: true }),
    };
    const dryRunSingle = measureBenchmark(HOT_PATH_ITERATIONS, () => {
        const result = service.dryRunCombatAction(dryRunInput);
        if (!result.ok) throw new Error(`dry-run failed: ${result.reason}`);
    });
    const basicAttackSingle = measureBenchmark(HOT_PATH_ITERATIONS, () => {
        const result = basicAttackService.resolveBasicAttackDamage(
            attacker.attrs.numericStats,
            attacker.attrs.ratioDivisors,
            Math.max(1, attacker.realm?.realmLv ?? 1),
            Math.max(1, attacker.combatExp ?? 0),
            defender.attrs.numericStats,
            defender.attrs.ratioDivisors,
            Math.max(1, defender.realm?.realmLv ?? 1),
            Math.max(1, defender.combatExp ?? 0),
            1,
            'physical',
        );
        if (!Number.isFinite(Number(result.damage))) throw new Error('basic attack returned invalid damage');
    });
    const skillFiveTargets = measureBenchmark(HOT_PATH_ITERATIONS, (index) => {
        attacker.qi = attacker.maxQi;
        attacker.combat.cooldownReadyTickBySkillId[skill.id] = 0;
        let totalDamage = 0;
        for (let targetIndex = 0; targetIndex < multiTargets.length; targetIndex += 1) {
            const target = multiTargets[targetIndex];
            target.hp = target.maxHp;
            attacker.combat.cooldownReadyTickBySkillId[skill.id] = 0;
            const result = multiTargetCombatService.castSkill(attacker, target, skill.id, index + 1, 1, {
                skipResourceAndCooldown: targetIndex > 0,
                targetCount: multiTargets.length,
            });
            totalDamage += result.totalDamage;
        }
        if (!Number.isFinite(totalDamage)) throw new Error('five target skill returned invalid damage');
    });
    const targetCollection100 = measureBenchmark(HOT_PATH_ITERATIONS, () => {
        const result = service.collectCombatTargets({
            action,
            definition,
            candidates: targets100,
        });
        if (result.targets.length !== 100) throw new Error(`target collection mismatch: ${result.targets.length}`);
    });
    const targetValidationSingle = measureBenchmark(HOT_PATH_ITERATIONS, () => {
        const result = service.validateSingleCombatTarget({
            action,
            definition,
            actorPosition: { x: attacker.x, y: attacker.y },
            target: singleTarget,
            instance: {
                canSeeTileFrom: () => true,
                getMonster: (monsterId) => ({ runtimeId: monsterId, x: singleTarget.x, y: singleTarget.y, alive: true }),
            },
            resolveCombatRelation: () => ({ hostile: true }),
        });
        if (!result.ok) throw new Error(`target validation failed: ${result.reason}`);
    });
    const hitResolutionSingle = measureBenchmark(HOT_PATH_ITERATIONS, () => {
        const result = (0, combat_resolution_helpers_1.resolveCombatHit)({
            attackerStats: attacker.attrs.numericStats,
            targetStats: defender.attrs.numericStats,
            targetRatios: defender.attrs.ratioDivisors,
            baseDamage: 32,
            damageKind: 'spell',
            element: 'wood',
            attackerCombatExp: attacker.combatExp,
            targetCombatExp: defender.combatExp,
            attackerRealmLv: 1,
            targetRealmLv: 1,
            damageMultiplier: 1,
        });
        if (!Number.isFinite(Number(result.damage))) throw new Error('hit resolution returned invalid damage');
    });
    const eventBuild100 = measureBenchmark(EVENT_BATCH_ITERATIONS, () => {
        for (let index = 0; index < 100; index += 1) {
            const events = service.buildCombatEvents({
                ok: true,
                phase: 'instant',
                actor: { kind: 'player', id: attacker.playerId },
                actionId: skill.id,
                instanceId: attacker.instanceId,
                target: { kind: 'monster', id: `bench_monster_${index}`, x: 10 + (index % 10), y: 10 + Math.floor(index / 10) },
                result: { damage: 1 + (index % 7), dodged: false },
                application: {
                    dirtyDomains: ['instance:monster_runtime'],
                    writesDatabaseInTick: false,
                },
            }, { playerId: attacker.playerId, tags: ['bench'] });
            if (!events.aoiEvent || !events.notificationEvent || !events.auditEvent) {
                throw new Error('event build returned incomplete events');
            }
        }
    });
    const aoiBroadcastSerialization100 = measureBenchmark(EVENT_BATCH_ITERATIONS, () => {
        const payload = createCombatAoiWorldDeltaPayload(100);
        const visibleTileKeys = createVisibleTileKeysForCombatEffects(payload.fx);
        const visiblePayload = {
            ...payload,
            fx: filterCombatEffectsForBench(payload.fx, visibleTileKeys),
        };
        if (visiblePayload.fx.length !== 100) {
            throw new Error(`AOI combat effect filter mismatch: ${visiblePayload.fx.length}`);
        }
        const wire = shared_1.toWireTick(visiblePayload);
        const encoded = shared_1.encodeMessage(shared_1.tickPayloadType, wire);
        if (!encoded || encoded.length <= 0) {
            throw new Error('AOI combat protobuf encode returned empty payload');
        }
    });
    const batch100PlayerBasicAttacks = measureBenchmark(EVENT_BATCH_ITERATIONS, () => {
        for (let index = 0; index < 100; index += 1) {
            const result = basicAttackService.resolveBasicAttackDamage(
                attacker.attrs.numericStats,
                attacker.attrs.ratioDivisors,
                Math.max(1, attacker.realm?.realmLv ?? 1),
                Math.max(1, attacker.combatExp ?? 0),
                defender.attrs.numericStats,
                defender.attrs.ratioDivisors,
                Math.max(1, defender.realm?.realmLv ?? 1),
                Math.max(1, defender.combatExp ?? 0),
                1,
                'physical',
            );
            if (!Number.isFinite(Number(result.damage))) throw new Error('batch player basic attack returned invalid damage');
            const events = service.buildCombatEvents({
                ok: true,
                phase: 'instant',
                actor: { kind: 'player', id: `bench_attacker_${index}` },
                actionId: 'basic_attack',
                instanceId: attacker.instanceId,
                target: { kind: 'monster', id: `bench_monster_${index}`, x: 10 + (index % 10), y: 10 + Math.floor(index / 10) },
                result: { damage: result.damage, dodged: result.dodged === true },
                application: {
                    dirtyDomains: ['instance:monster_runtime'],
                    writesDatabaseInTick: false,
                },
            }, { tags: ['bench', 'batch_player_basic'] });
            if (!events.aoiEvent || !events.auditEvent) {
                throw new Error('batch player basic attack event missing');
            }
        }
    });
    const batch50MonsterSkills = measureBenchmark(EVENT_BATCH_ITERATIONS, () => {
        for (let index = 0; index < 50; index += 1) {
            const validation = service.validateSingleCombatTarget({
                action: {
                    actor: { kind: 'monster', id: `bench_monster_${index}` },
                    actionId: 'monster:bench_skill',
                    kind: 'skill',
                    phase: 'chant_resolve',
                    instanceId: attacker.instanceId,
                },
                definition: {
                    actionId: 'monster:bench_skill',
                    allowedTargetKinds: ['player'],
                    range: 120,
                },
                actorPosition: { x: 10, y: 10 },
                target: {
                    kind: 'player',
                    id: `bench_defender_${index}`,
                    instanceId: attacker.instanceId,
                    x: 10 + (index % 10),
                    y: 11 + Math.floor(index / 10),
                    runtime: {
                        playerId: `bench_defender_${index}`,
                        hp: 100,
                        instanceId: attacker.instanceId,
                    },
                },
                instance: { canSeeTileFrom: () => true },
                resolveCombatRelation: () => ({ hostile: true }),
            });
            if (!validation.ok) throw new Error(`batch monster skill validation failed: ${validation.reason}`);
            const hit = (0, combat_resolution_helpers_1.resolveCombatHit)({
                attackerStats: attacker.attrs.numericStats,
                targetStats: defender.attrs.numericStats,
                targetRatios: defender.attrs.ratioDivisors,
                baseDamage: 24,
                damageKind: 'spell',
                element: 'fire',
                attackerCombatExp: attacker.combatExp,
                targetCombatExp: defender.combatExp,
                attackerRealmLv: 1,
                targetRealmLv: 1,
                damageMultiplier: 1,
            });
            const events = service.buildCombatEvents({
                ok: true,
                phase: 'chant_resolve',
                actor: { kind: 'monster', id: `bench_monster_${index}` },
                actionId: 'monster:bench_skill',
                instanceId: attacker.instanceId,
                target: { kind: 'player', id: `bench_defender_${index}`, x: 10 + (index % 10), y: 11 + Math.floor(index / 10) },
                result: { damage: hit.damage, dodged: hit.dodged === true },
                application: {
                    dirtyDomains: ['player:vitals'],
                    writesDatabaseInTick: false,
                },
            }, { playerId: `bench_defender_${index}`, tags: ['bench', 'batch_monster_skill'] });
            if (!events.aoiEvent || !events.notificationEvent || !events.auditEvent) {
                throw new Error('batch monster skill event missing');
            }
        }
    });
    const fullInstanceTick100Players = await measureAsyncBenchmark(EVENT_BATCH_ITERATIONS, async () => {
        await runSyntheticInstanceTick({
            playerCount: 100,
            monsterActionCount: 0,
            depsKind: 'players',
        });
    });
    const fullInstanceTick50MonsterSkills = await measureAsyncBenchmark(EVENT_BATCH_ITERATIONS, async () => {
        await runSyntheticInstanceTick({
            playerCount: 50,
            monsterActionCount: 50,
            depsKind: 'monster_skills',
        });
    });
    return {
        iterations: HOT_PATH_ITERATIONS,
        dryRunSingle,
        basicAttackSingle,
        skillFiveTargets,
        targetCollection100,
        targetValidationSingle,
        hitResolutionSingle,
        eventBuild100: {
            iterations: EVENT_BATCH_ITERATIONS,
            eventsPerIteration: 100,
            ...eventBuild100,
        },
        aoiBroadcastSerialization100: {
            iterations: EVENT_BATCH_ITERATIONS,
            eventsPerIteration: 100,
            ...aoiBroadcastSerialization100,
        },
        batch100PlayerBasicAttacks: {
            iterations: EVENT_BATCH_ITERATIONS,
            actionsPerIteration: 100,
            ...batch100PlayerBasicAttacks,
        },
        batch50MonsterSkills: {
            iterations: EVENT_BATCH_ITERATIONS,
            actionsPerIteration: 50,
            ...batch50MonsterSkills,
        },
        fullInstanceTick100Players: {
            iterations: EVENT_BATCH_ITERATIONS,
            playersPerIteration: 100,
            ...fullInstanceTick100Players,
        },
        fullInstanceTick50MonsterSkills: {
            iterations: EVENT_BATCH_ITERATIONS,
            monsterActionsPerIteration: 50,
            ...fullInstanceTick50MonsterSkills,
        },
        passed: {
            actionDryRunSingleTargetP95Lt10Ms: dryRunSingle.p95Ms < 10,
            basicAttackSingleTargetP95Lt1Ms: basicAttackSingle.p95Ms < 1,
            skillFiveTargetsP95Lt5Ms: skillFiveTargets.p95Ms < 5,
            targetCollection100P95Lt1Ms: targetCollection100.p95Ms < 1,
            targetValidationSingleP95Lt05Ms: targetValidationSingle.p95Ms < 0.5,
            hitResolutionSingleP95Lt05Ms: hitResolutionSingle.p95Ms < 0.5,
            eventBuild100P95Lt10Ms: eventBuild100.p95Ms < 10,
            aoiBroadcastSerialization100P95Lt10Ms: aoiBroadcastSerialization100.p95Ms < 10,
            batch100PlayerBasicAttacksP95Lt50Ms: batch100PlayerBasicAttacks.p95Ms < 50,
            batch50MonsterSkillsP95Lt100Ms: batch50MonsterSkills.p95Ms < 100,
            fullInstanceTick100PlayersP95Lt50Ms: fullInstanceTick100Players.p95Ms < 50,
            fullInstanceTick50MonsterSkillsP95Lt100Ms: fullInstanceTick50MonsterSkills.p95Ms < 100,
        },
    };
}

function measureBenchmark(iterations, run) {
    const durationsMs = [];
    for (let index = 0; index < iterations; index += 1) {
        const startedAt = performance.now();
        run(index);
        durationsMs.push(performance.now() - startedAt);
    }
    return {
        avgMs: round6(average(durationsMs)),
        p95Ms: round6(percentile(durationsMs, 0.95)),
        p99Ms: round6(percentile(durationsMs, 0.99)),
    };
}

async function measureAsyncBenchmark(iterations, run) {
    const durationsMs = [];
    for (let index = 0; index < iterations; index += 1) {
        const startedAt = performance.now();
        await run(index);
        durationsMs.push(performance.now() - startedAt);
    }
    return {
        avgMs: round6(average(durationsMs)),
        p95Ms: round6(percentile(durationsMs, 0.95)),
        p99Ms: round6(percentile(durationsMs, 0.99)),
    };
}

function createCombatAoiWorldDeltaPayload(count) {
    const fx = [];
    for (let index = 0; index < count; index += 1) {
        const x = 10 + (index % 10);
        const y = 20 + Math.floor(index / 10);
        fx.push({
            type: 'attack',
            fromX: x,
            fromY: y,
            toX: x + 1,
            toY: y,
            color: '#f87171',
        });
        fx.push({
            type: 'float',
            x: x + 1,
            y,
            text: String(1 + (index % 9)),
            color: '#facc15',
            variant: 'damage',
        });
    }
    return {
        p: [],
        e: [],
        fx: fx.slice(0, count),
    };
}

function createVisibleTileKeysForCombatEffects(effects) {
    const keys = new Set();
    for (const effect of effects) {
        if (effect.type === 'attack') {
            keys.add(`${effect.fromX},${effect.fromY}`);
            keys.add(`${effect.toX},${effect.toY}`);
        }
        else if (Array.isArray(effect.cells)) {
            for (const cell of effect.cells) {
                keys.add(`${cell.x},${cell.y}`);
            }
        }
        else {
            keys.add(`${effect.x},${effect.y}`);
        }
    }
    return keys;
}

function filterCombatEffectsForBench(effects, visibleTileKeys) {
    if (!Array.isArray(effects) || effects.length === 0 || visibleTileKeys.size === 0) {
        return [];
    }
    return effects
        .filter((effect) => {
            if (effect.type === 'attack') {
                return visibleTileKeys.has(`${effect.fromX},${effect.fromY}`)
                    || visibleTileKeys.has(`${effect.toX},${effect.toY}`);
            }
            if (effect.type === 'warning_zone') {
                return Array.isArray(effect.cells)
                    && effect.cells.some((cell) => visibleTileKeys.has(`${cell.x},${cell.y}`));
            }
            return visibleTileKeys.has(`${effect.x},${effect.y}`);
        })
        .map((effect) => ({ ...effect }));
}

async function runSyntheticInstanceTick(input) {
    const playerIds = Array.from({ length: input.playerCount }, (_, index) => `bench_player_${index}`);
    const monsterActions = Array.from({ length: input.monsterActionCount }, (_, index) => ({
        kind: 'skill',
        runtimeId: `bench_monster_${index}`,
        targetPlayerId: playerIds[index % Math.max(1, playerIds.length)],
        skillId: 'monster:bench_skill',
        instanceId: 'public:bench',
        targetX: 10 + (index % 10),
        targetY: 10 + Math.floor(index / 10),
    }));
    const instance = {
        meta: { instanceId: 'public:bench' },
        template: { id: 'bench', source: {} },
        tick: 0,
        tickOnce() {
            this.tick += 1;
            return {
                completedBuildings: [],
                transfers: [],
                monsterActions,
            };
        },
        listPlayerIds() {
            return playerIds;
        },
        advanceTileResourceFlow() {},
        advanceTemporaryTiles() {},
        advanceTileRecovery() {},
    };
    const deps = createSyntheticTickDeps(instance, playerIds);
    const service = new world_runtime_instance_tick_orchestration_service_1.WorldRuntimeInstanceTickOrchestrationService();
    await service.advanceFrame(deps, 1000, () => 1);
}

function createSyntheticTickDeps(instance, playerIds) {
    const players = new Map(playerIds.map((playerId, index) => [playerId, {
        playerId,
        instanceId: instance.meta.instanceId,
        x: 10 + (index % 10),
        y: 10 + Math.floor(index / 10),
        worldTime: null,
    }]));
    return {
        tick: 0,
        listInstanceRuntimes: () => [instance],
        isInstanceLeaseWritable: () => true,
        worldRuntimeCombatEffectsService: { resetFrameEffects() {} },
        worldRuntimeTickProgressService: {
            progress: 0,
            getProgress() { return this.progress; },
            setProgress(value) { this.progress = value; },
        },
        worldRuntimeMetricsService: {
            recordIdleFrame() {},
            recordFrameResult() {},
        },
        processPendingRespawns() {},
        materializeNavigationCommands() {},
        materializeAutoUsePills() {},
        materializeAutoCombatCommands() {},
        async dispatchPendingCommands() {},
        dispatchPendingSystemCommands() {},
        worldRuntimeNavigationService: { getBlockedPlayerIds: () => new Set() },
        worldRuntimeFormationService: {
            createTerrainStabilizationChecker: () => () => false,
            advanceInstanceFormations() {},
            isTerrainStabilized: () => false,
        },
        worldRuntimeSectService: { isSectInnateStabilized: () => false },
        applyTransfer() {},
        applyMonsterAction() {},
        playerRuntimeService: {
            getPlayer: (playerId) => players.get(playerId) ?? null,
            playerAttributesService: { recalculate() {} },
            advanceTickForPlayerIds(ids) {
                for (const playerId of ids) {
                    const player = players.get(playerId);
                    if (player) {
                        player.lastTickAdvanced = instance.tick;
                    }
                }
            },
        },
        worldRuntimePlayerSkillDispatchService: {
            async resolvePendingPlayerSkillCast() {},
        },
        worldRuntimeCraftTickService: {
            async advanceCraftJobs() {},
        },
        worldRuntimeTongtianTowerService: {
            advanceInstance() {},
            async cleanupIdleInstances() {},
        },
        worldRuntimeLootContainerService: {
            advanceContainerSearches() {},
        },
        getInstanceRuntime: () => instance,
        listConnectedPlayerIds: () => playerIds,
        getPlayerLocation: (playerId) => {
            const player = players.get(playerId);
            return player ? { instanceId: instance.meta.instanceId, x: player.x, y: player.y } : null;
        },
        refreshQuestStates() {},
    };
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
                strength: 0,
                meridians: 0,
            },
            finalAttrs: {
                constitution: 10,
                spirit: 11,
                perception: 13,
                talent: 10,
                strength: 0,
                meridians: 0,
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
                strength: 0,
                meridians: 0,
            },
            finalAttrs: {
                constitution: 10,
                spirit: 10,
                perception: 10,
                talent: 10,
                strength: 0,
                meridians: 0,
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
    /**
 * spendQi：执行spendQi相关逻辑。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新spendQi相关状态。
 */

        spendQi(playerId, amount) {
/**
 * 记录玩家。
 */
            const player = getPlayerOrThrow(playersById, playerId);
            player.qi = Math.max(0, player.qi - Math.max(0, Math.round(amount)));
            player.selfRevision += 1;
            return player;
        },        
        /**
 * setSkillCooldownReadyTick：写入技能冷却Readytick。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @param readyTick 参数说明。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新技能冷却Readytick相关状态。
 */

        setSkillCooldownReadyTick(playerId, skillId, readyTick, currentTick) {
/**
 * 记录玩家。
 */
            const player = getPlayerOrThrow(playersById, playerId);
            player.combat.cooldownReadyTickBySkillId[skillId] = Math.max(0, Math.trunc(readyTick));
            rebuildBenchActions(player, currentTick);
            return player;
        },        
        /**
 * setRetaliatePlayerTarget：记录反击目标以匹配正式技能结算接口。
 */

        setRetaliatePlayerTarget(playerId, sourcePlayerId, currentTick) {
            const player = getPlayerOrThrow(playersById, playerId);
            player.combat.retaliatePlayerTargetId = sourcePlayerId;
            player.combat.retaliatePlayerTargetLastAttackTick = currentTick;
            player.selfRevision += 1;
            return player;
        },
        /**
 * applyTemporaryBuff：处理TemporaryBuff并更新相关状态。
 * @param playerId 玩家 ID。
 * @param buff 参数说明。
 * @returns 无返回值，直接更新TemporaryBuff相关状态。
 */

        applyTemporaryBuff(playerId, buff) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        /**
 * applyDamage：处理Damage并更新相关状态。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新Damage相关状态。
 */

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
