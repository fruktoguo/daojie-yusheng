// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeInstanceTickOrchestrationService } = require("../runtime/world/world-runtime-instance-tick-orchestration.service");
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function createDeps(log) {
    const progress = new Map([['instance:1', 0]]);
    const instanceRuntimes = new Map([['instance:1', {
        meta: { instanceId: 'instance:1' },
        template: { id: 'yunlai_town' },
        tick: 3,        
        /**
 * tickOnce：执行tick一次性相关逻辑。
 * @returns 无返回值，直接更新tickOnce相关状态。
 */

        tickOnce() {
            log.push('instance.tickOnce');
            return { transfers: [{ id: 'transfer:1' }], monsterActions: [{ id: 'action:1' }] };
        },        
        advanceTileResourceFlow() {
            log.push('instance.advanceTileResourceFlow');
            return false;
        },
        /**
 * listPlayerIds：读取玩家ID并返回结果。
 * @returns 无返回值，完成玩家ID的读取/组装。
 */

        listPlayerIds() {
            log.push('instance.listPlayerIds');
            return ['player:1'];
        },
    }]]);
    return {
        tick: 0,        
        /**
 * listInstanceRuntimes：读取Instance运行态并返回结果。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        listInstanceRuntimes() { return instanceRuntimes.values(); },        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime(instanceId) { return instanceRuntimes.get(instanceId) ?? null; },        
        /**
 * listConnectedPlayerIds：读取Connected玩家ID并返回结果。
 * @returns 无返回值，完成Connected玩家ID的读取/组装。
 */

        listConnectedPlayerIds() { return ['player:1'].values(); },        
        /**
 * getPlayerLocation：读取玩家位置。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

        getPlayerLocation(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (playerId !== 'player:1') {
                return null;
            }
            return { instanceId: 'instance:1', sessionId: 'session:1' };
        },
        worldRuntimeCombatEffectsService: {        
        /**
 * resetFrameEffects：执行reset帧Effect相关逻辑。
 * @returns 无返回值，直接更新reset帧Effect相关状态。
 */
 resetFrameEffects() { log.push('resetFrameEffects'); } },
        worldRuntimeTickProgressService: {        
        /**
 * getProgress：读取进度。
 * @param instanceId instance ID。
 * @returns 无返回值，完成进度的读取/组装。
 */

            getProgress(instanceId) { log.push(`getProgress:${instanceId}`); return progress.get(instanceId) ?? 0; },            
            /**
 * setProgress：写入进度。
 * @param instanceId instance ID。
 * @param value 参数说明。
 * @returns 无返回值，直接更新进度相关状态。
 */

            setProgress(instanceId, value) { log.push(`setProgress:${instanceId}`); progress.set(instanceId, value); },
        },
        worldRuntimeMetricsService: {
            idleCalled: false,
            frameCalled: false,            
            /**
 * recordIdleFrame：执行recordIdle帧相关逻辑。
 * @returns 无返回值，直接更新recordIdle帧相关状态。
 */

            recordIdleFrame() { log.push('recordIdleFrame'); this.idleCalled = true; },            
            /**
 * recordFrameResult：执行record帧结果相关逻辑。
 * @param _startedAt 参数说明。
 * @param durations 参数说明。
 * @returns 无返回值，直接更新record帧结果相关状态。
 */

            recordFrameResult(_startedAt, durations) { log.push('recordFrameResult'); this.frameCalled = true; this.durations = durations; },
        },        
        /**
 * processPendingRespawns：处理待处理重生并更新相关状态。
 * @returns 无返回值，直接更新Pending重生相关状态。
 */

        processPendingRespawns() { log.push('processPendingRespawns'); },        
        /**
 * materializeNavigationCommands：执行materialize导航Command相关逻辑。
 * @returns 无返回值，直接更新materialize导航Command相关状态。
 */

        materializeNavigationCommands() { log.push('materializeNavigationCommands'); },        
        /**
 * materializeAutoUsePills：执行materializeAuto丹药相关逻辑。
 * @returns 无返回值，直接更新materializeAuto丹药相关状态。
 */

        materializeAutoUsePills() { log.push('materializeAutoUsePills'); },
        /**
 * materializeAutoCombatCommands：执行materializeAuto战斗Command相关逻辑。
 * @returns 无返回值，直接更新materializeAuto战斗Command相关状态。
 */

        materializeAutoCombatCommands() { log.push('materializeAutoCombatCommands'); },        
        /**
 * dispatchPendingCommands：判断待处理Command是否满足条件。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

        async dispatchPendingCommands() { log.push('dispatchPendingCommands'); },        
        /**
 * dispatchPendingSystemCommands：判断待处理SystemCommand是否满足条件。
 * @returns 无返回值，直接更新PendingSystemCommand相关状态。
 */

        dispatchPendingSystemCommands() { log.push('dispatchPendingSystemCommands'); },
        worldRuntimeNavigationService: {        
        /**
 * getBlockedPlayerIds：读取Blocked玩家ID。
 * @returns 无返回值，完成Blocked玩家ID的读取/组装。
 */
 getBlockedPlayerIds() { log.push('getBlockedPlayerIds'); return new Set(['player:block']); } },        
 /**
 * applyTransfer：处理Transfer并更新相关状态。
 * @returns 无返回值，直接更新Transfer相关状态。
 */

        applyTransfer() { log.push('applyTransfer'); },        
        /**
 * applyMonsterAction：处理怪物Action并更新相关状态。
 * @returns 无返回值，直接更新怪物Action相关状态。
 */

        applyMonsterAction() { log.push('applyMonsterAction'); },
        playerRuntimeService: {        
        /**
 * advanceTickForPlayerIds：执行advancetickFor玩家ID相关逻辑。
 * @returns 无返回值，直接更新advancetickFor玩家ID相关状态。
 */
 advanceTickForPlayerIds() { log.push('advanceTickForPlayerIds'); } },
        worldRuntimeCraftTickService: {        
        /**
 * advanceCraftJobs：执行advance炼制Job相关逻辑。
 * @returns 无返回值，直接更新advance炼制Job相关状态。
 */
 advanceCraftJobs() { log.push('advanceCraftJobs'); } },
        worldRuntimeLootContainerService: {        
        /**
 * advanceContainerSearches：执行advanceContainerSearche相关逻辑。
 * @param instanceAccess 参数说明。
 * @param playerLocationIndex 参数说明。
 * @returns 无返回值，直接更新advanceContainerSearche相关状态。
 */

            advanceContainerSearches(instanceAccess, playerLocationIndex) {
                assert.equal(typeof instanceAccess.getInstanceRuntime, 'function');
                assert.equal(instanceAccess.getInstanceRuntime('instance:1'), instanceRuntimes.get('instance:1'));
                assert.equal(typeof playerLocationIndex.listConnectedPlayerIds, 'function');
                assert.equal(typeof playerLocationIndex.getPlayerLocation, 'function');
                assert.deepEqual(Array.from(playerLocationIndex.listConnectedPlayerIds()), ['player:1']);
                assert.deepEqual(playerLocationIndex.getPlayerLocation('player:1'), { instanceId: 'instance:1', sessionId: 'session:1' });
                log.push('advanceContainerSearches');
            },
        },        
        /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

        refreshQuestStates(playerId) { log.push(`refreshQuestStates:${playerId}`); },
    };
}
/**
 * verifyNormalPath：执行verifyNormal路径相关逻辑。
 * @returns 无返回值，直接更新verifyNormal路径相关状态。
 */


async function verifyNormalPath() {
    const log = [];
    const deps = createDeps(log);
    const service = new WorldRuntimeInstanceTickOrchestrationService();
    const ticks = await service.advanceFrame(deps, 1000, null);
    assert.equal(ticks, 1);
    assert.equal(deps.tick, 1);
    assert.equal(deps.worldRuntimeMetricsService.frameCalled, true);
    assert.equal(deps.worldRuntimeMetricsService.idleCalled, false);
    assert.deepEqual(log, [
        'resetFrameEffects',
        'getProgress:instance:1',
        'setProgress:instance:1',
        'processPendingRespawns',
        'materializeNavigationCommands',
        'materializeAutoUsePills',
        'materializeAutoCombatCommands',
        'dispatchPendingCommands',
        'dispatchPendingSystemCommands',
        'getBlockedPlayerIds',
        'instance.tickOnce',
        'instance.advanceTileResourceFlow',
        'applyTransfer',
        'applyMonsterAction',
        'instance.listPlayerIds',
        'advanceTickForPlayerIds',
        'advanceCraftJobs',
        'advanceContainerSearches',
        'refreshQuestStates:player:1',
        'recordFrameResult',
    ]);
}
/**
 * verifyZeroTickPath：执行verifyZerotick路径相关逻辑。
 * @returns 无返回值，直接更新verifyZerotick路径相关状态。
 */


async function verifyZeroTickPath() {
    const log = [];
    const deps = createDeps(log);
    deps.worldRuntimeTickProgressService.getProgress = () => 0;
    const service = new WorldRuntimeInstanceTickOrchestrationService();
    const ticks = await service.advanceFrame(deps, 0, null);
    assert.equal(ticks, 0);
    assert.equal(deps.worldRuntimeMetricsService.idleCalled, true);
    assert.equal(deps.worldRuntimeMetricsService.frameCalled, false);
    assert.deepEqual(log, ['resetFrameEffects', 'setProgress:instance:1', 'recordIdleFrame']);
}

async function verifyAwaitsPendingCommandsBeforeSystemAndTicks() {
    const log = [];
    let resolvePendingCommands = () => {};
    const deps = createDeps(log);
    deps.dispatchPendingCommands = async () => {
        log.push('dispatchPendingCommands:start');
        await new Promise((resolve) => {
            resolvePendingCommands = () => {
                log.push('dispatchPendingCommands:resolved');
                resolve(undefined);
            };
        });
    };
    const service = new WorldRuntimeInstanceTickOrchestrationService();
    const pendingAdvance = service.advanceFrame(deps, 1000, null);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        'resetFrameEffects',
        'getProgress:instance:1',
        'setProgress:instance:1',
        'processPendingRespawns',
        'materializeNavigationCommands',
        'materializeAutoUsePills',
        'materializeAutoCombatCommands',
        'dispatchPendingCommands:start',
    ]);
    resolvePendingCommands();
    await pendingAdvance;
    assert.deepEqual(log, [
        'resetFrameEffects',
        'getProgress:instance:1',
        'setProgress:instance:1',
        'processPendingRespawns',
        'materializeNavigationCommands',
        'materializeAutoUsePills',
        'materializeAutoCombatCommands',
        'dispatchPendingCommands:start',
        'dispatchPendingCommands:resolved',
        'dispatchPendingSystemCommands',
        'getBlockedPlayerIds',
        'instance.tickOnce',
        'instance.advanceTileResourceFlow',
        'applyTransfer',
        'applyMonsterAction',
        'instance.listPlayerIds',
        'advanceTickForPlayerIds',
        'advanceCraftJobs',
        'advanceContainerSearches',
        'refreshQuestStates:player:1',
        'recordFrameResult',
    ]);
}

async function verifyCultivationAuraMultiplierUsesPlayerTileAura() {
    const log = [];
    const deps = createDeps(log);
    const instance = deps.getInstanceRuntime('instance:1');
    instance.getPlayerPosition = (playerId) => playerId === 'player:1'
        ? { x: 12, y: 8 }
        : null;
    instance.listTileResources = (x, y) => {
        assert.equal(x, 12);
        assert.equal(y, 8);
        return [{
            resourceKey: 'aura.refined.neutral',
            value: 2250,
            sourceValue: 2250,
        }];
    };
    deps.playerRuntimeService.getPlayer = (playerId) => playerId === 'player:1'
        ? {
            playerId,
            techniques: { techniques: [] },
            buffs: { buffs: [] },
            runtimeBonuses: [],
        }
        : null;
    let capturedOptions = null;
    deps.playerRuntimeService.advanceTickForPlayerIds = (_playerIds, _tick, options) => {
        capturedOptions = options;
        log.push('advanceTickForPlayerIds');
    };
    const service = new WorldRuntimeInstanceTickOrchestrationService();

    await service.advanceFrame(deps, 1000, null);

    assert.equal(capturedOptions?.cultivationAuraMultiplierByPlayerId?.get('player:1'), 4);
    assert.equal(capturedOptions?.idleCultivationBlockedPlayerIds?.has('player:block'), true);
}

async function verifyCultivationAuraMultiplierUsesQiProjectionEfficiency() {
    const log = [];
    const deps = createDeps(log);
    const instance = deps.getInstanceRuntime('instance:1');
    instance.getPlayerPosition = (playerId) => playerId === 'player:1'
        ? { x: 12, y: 8 }
        : null;
    instance.listTileResources = (x, y) => {
        assert.equal(x, 12);
        assert.equal(y, 8);
        return [{
            resourceKey: 'aura.refined.neutral',
            value: 2250,
            sourceValue: 2250,
        }];
    };
    deps.playerRuntimeService.getPlayer = (playerId) => playerId === 'player:1'
        ? {
            playerId,
            techniques: {
                techniques: [{
                    techId: 'ningqi_chengji',
                    name: '凝气成基法',
                    level: 49,
                    exp: 0,
                    expToNext: 0,
                    realmLv: 31,
                    realm: 0,
                    grade: 'heaven',
                    category: 'internal',
                    skills: [],
                    layers: [{
                        level: 49,
                        expToNext: 0,
                        qiProjection: [{
                            selector: { families: ['aura'], elements: ['neutral'] },
                            visibility: 'absorbable',
                            efficiencyBpMultiplier: 11000,
                        }],
                    }],
                }],
            },
            buffs: { buffs: [] },
            attrBonuses: [],
            runtimeBonuses: [],
        }
        : null;
    let capturedOptions = null;
    deps.playerRuntimeService.advanceTickForPlayerIds = (_playerIds, _tick, options) => {
        capturedOptions = options;
        log.push('advanceTickForPlayerIds');
    };
    const service = new WorldRuntimeInstanceTickOrchestrationService();

    await service.advanceFrame(deps, 1000, null);

    const multiplier = capturedOptions?.cultivationAuraMultiplierByPlayerId?.get('player:1');
    assert.ok(Math.abs(multiplier - 4.3) < 0.000001, `expected projected aura multiplier 4.3, got ${multiplier}`);
}

async function verifyCultivationAuraMultiplierUsesAllAbsorbableQiResources() {
    const log = [];
    const deps = createDeps(log);
    const instance = deps.getInstanceRuntime('instance:1');
    instance.getPlayerPosition = (playerId) => playerId === 'player:1'
        ? { x: 12, y: 8 }
        : null;
    instance.listTileResources = (x, y) => {
        assert.equal(x, 12);
        assert.equal(y, 8);
        return [
            { resourceKey: 'aura.refined.neutral', value: 1000, sourceValue: 1000 },
            { resourceKey: 'aura.refined.wood', value: 1000, sourceValue: 1000 },
            { resourceKey: 'sha.refined.neutral', value: 1000, sourceValue: 1000 },
        ];
    };
    deps.playerRuntimeService.getPlayer = (playerId) => playerId === 'player:1'
        ? {
            playerId,
            techniques: { techniques: [] },
            buffs: { buffs: [] },
            attrBonuses: [{
                source: 'test:all-qi',
                label: '全气机测试',
                qiProjection: [{
                    selector: { resourceKeys: ['aura.refined.wood'] },
                    visibility: 'absorbable',
                    efficiencyBpMultiplier: 20000,
                }, {
                    selector: { resourceKeys: ['sha.refined.neutral'] },
                    visibility: 'absorbable',
                    efficiencyBpMultiplier: 28000,
                }],
            }],
            runtimeBonuses: [],
        }
        : null;
    let capturedOptions = null;
    deps.playerRuntimeService.advanceTickForPlayerIds = (_playerIds, _tick, options) => {
        capturedOptions = options;
        log.push('advanceTickForPlayerIds');
    };
    const service = new WorldRuntimeInstanceTickOrchestrationService();

    await service.advanceFrame(deps, 1000, null);

    const multiplier = capturedOptions?.cultivationAuraMultiplierByPlayerId?.get('player:1');
    assert.ok(Math.abs(multiplier - 4.8) < 0.000001, `expected all absorbable qi multiplier 4.8, got ${multiplier}`);
}

async function verifyTemporaryTileExpiryUsesInstanceTick() {
    const log = [];
    const deps = createDeps(log);
    deps.tick = 500;
    const instance = deps.getInstanceRuntime('instance:1');
    instance.tick = 3;
    instance.tickOnce = () => {
        instance.tick += 1;
        log.push('instance.tickOnce');
        return { transfers: [], monsterActions: [] };
    };
    let receivedTick = null;
    instance.advanceTemporaryTiles = (currentTick) => {
        receivedTick = currentTick;
        log.push(`advanceTemporaryTiles:${currentTick}`);
        return false;
    };
    const service = new WorldRuntimeInstanceTickOrchestrationService();

    await service.advanceFrame(deps, 1000, null);

    assert.equal(deps.tick, 501);
    assert.equal(instance.tick, 4);
    assert.equal(receivedTick, 4);
    assert.ok(!log.includes('advanceTemporaryTiles:501'));
}

async function verifyTileQiDrainRelocatesPlayerToSpawnOnEmptyQi() {
    const log = [];
    const deps = createDeps(log);
    const instance = deps.getInstanceRuntime('instance:1');
    let position = { x: 6, y: 3 };
    instance.template = {
        id: 'heaven_ladder',
        spawnPoint: { x: 2, y: 3 },
    };
    instance.tickOnce = () => {
        log.push('instance.tickOnce');
        return { transfers: [], monsterActions: [] };
    };
    instance.getPlayerPosition = (playerId) => {
        assert.equal(playerId, 'player:1');
        return position;
    };
    instance.getTileQiDrainPerTick = (x, y) => {
        assert.deepEqual({ x, y }, { x: 6, y: 3 });
        return 15;
    };
    instance.relocatePlayer = (playerId, x, y) => {
        log.push(['relocatePlayer', playerId, x, y]);
        position = { x, y };
        return position;
    };
    instance.cancelPendingCommand = (playerId) => {
        log.push(['cancelPendingCommand', playerId]);
        return true;
    };
    const player = { playerId: 'player:1', hp: 100, qi: 10 };
    deps.playerRuntimeService.getPlayer = (playerId) => playerId === 'player:1' ? player : null;
    deps.playerRuntimeService.setVitals = (playerId, vitals) => {
        log.push(['setVitals', playerId, vitals]);
        if (typeof vitals.qi === 'number') {
            player.qi = vitals.qi;
        }
        return player;
    };
    deps.worldRuntimeNavigationService.clearNavigationIntent = (playerId) => {
        log.push(['clearNavigationIntent', playerId]);
    };
    deps.clearPendingCommand = (playerId) => {
        log.push(['clearPendingCommand', playerId]);
    };
    deps.queuePlayerNotice = (playerId, message, kind) => {
        log.push(['queuePlayerNotice', playerId, message, kind]);
    };

    const service = new WorldRuntimeInstanceTickOrchestrationService();
    await service.advanceFrame(deps, 1000, null);

    assert.equal(player.qi, 0);
    assert.deepEqual(position, { x: 2, y: 3 });
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'setVitals' && entry[2].qi === 0));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'relocatePlayer' && entry[2] === 2 && entry[3] === 3));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'clearNavigationIntent'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'queuePlayerNotice'));
}

async function verifyOperationFailuresAreIsolatedWithinTick() {
    const log = [];
    const diagnostics = [];
    const warnings = [];
    const deps = createDeps(log);
    const instance = deps.getInstanceRuntime('instance:1');
    instance.tickOnce = () => {
        log.push('instance.tickOnce');
        return {
            completedBuildings: [],
            transfers: [{ id: 'transfer:fail', playerId: 'player:bad' }, { id: 'transfer:ok', playerId: 'player:2' }],
            monsterActions: [{ id: 'action:fail', runtimeId: 'monster:bad' }, { id: 'action:ok', runtimeId: 'monster:ok' }],
        };
    };
    instance.listPlayerIds = () => {
        log.push('instance.listPlayerIds');
        return ['player:1', 'player:2'];
    };
    deps.recordCombatDiagnostic = (entry) => {
        diagnostics.push(entry);
    };
    deps.logger = {
        warn: (message) => warnings.push(message),
    };
    deps.applyTransfer = (transfer) => {
        log.push(['applyTransfer', transfer.id]);
        if (transfer.id === 'transfer:fail') {
            throw new Error('transfer failed');
        }
    };
    deps.applyMonsterAction = (action) => {
        log.push(['applyMonsterAction', action.id]);
        if (action.id === 'action:fail') {
            throw new Error('monster action failed');
        }
    };
    deps.playerRuntimeService.getPlayer = (playerId) => ({
        playerId,
        techniques: { techniques: [] },
        buffs: { buffs: [] },
        runtimeBonuses: [],
        worldTime: null,
    });
    deps.playerRuntimeService.advanceTickForPlayerIds = (playerIds) => {
        log.push(['advanceTickForPlayerIds', playerIds[0]]);
        if (playerIds[0] === 'player:1') {
            throw new Error('player tick failed');
        }
    };
    deps.worldRuntimePlayerSkillDispatchService = {
        resolvePendingPlayerSkillCast: async (playerId) => {
            log.push(['resolvePendingPlayerSkillCast', playerId]);
            if (playerId === 'player:1') {
                throw new Error('pending skill failed');
            }
        },
    };
    deps.worldRuntimeCraftTickService.advanceCraftJobs = async (playerIds) => {
        log.push(['advanceCraftJobs', playerIds[0]]);
        if (playerIds[0] === 'player:1') {
            throw new Error('craft failed');
        }
    };
    deps.worldRuntimeTongtianTowerService = {};
    deps.worldRuntimeTongtianTowerService.advanceInstance = () => {
        log.push('tongtianTower.advanceInstance');
        throw new Error('tower failed');
    };
    deps.worldRuntimeLootContainerService.advanceContainerSearches = () => {
        log.push('advanceContainerSearches');
        throw new Error('loot failed');
    };
    deps.refreshQuestStates = (playerId) => {
        log.push(['refreshQuestStates', playerId]);
        if (playerId === 'player:1') {
            throw new Error('quest failed');
        }
    };

    const service = new WorldRuntimeInstanceTickOrchestrationService();
    const ticks = await service.advanceFrame(deps, 1000, null);

    assert.equal(ticks, 1);
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'applyTransfer' && entry[1] === 'transfer:ok'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'applyMonsterAction' && entry[1] === 'action:ok'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'advanceTickForPlayerIds' && entry[1] === 'player:2'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'resolvePendingPlayerSkillCast' && entry[1] === 'player:2'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'advanceCraftJobs' && entry[1] === 'player:2'));
    assert.ok(log.includes('tongtianTower.advanceInstance'));
    assert.ok(log.includes('advanceContainerSearches'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'refreshQuestStates' && entry[1] === 'player:2'));
    assert.ok(diagnostics.some((entry) => entry.phase === 'transfer_apply' && entry.details.playerId === 'player:bad'));
    assert.ok(diagnostics.some((entry) => entry.phase === 'monster_action_apply' && entry.details.monsterId === 'monster:bad'));
    assert.ok(diagnostics.some((entry) => entry.phase === 'player_tick_advance' && entry.details.playerId === 'player:1'));
    assert.ok(diagnostics.some((entry) => entry.phase === 'player_pending_skill_cast' && entry.details.playerId === 'player:1'));
    assert.ok(diagnostics.some((entry) => entry.phase === 'player_craft_jobs' && entry.details.playerId === 'player:1'));
    assert.ok(diagnostics.some((entry) => entry.phase === 'tongtian_tower_instance'));
    assert.ok(diagnostics.some((entry) => entry.phase === 'loot_container_searches'));
    assert.ok(diagnostics.some((entry) => entry.phase === 'player_quest_refresh' && entry.details.playerId === 'player:1'));
    assert.ok(warnings.length >= 8);
}

Promise.resolve()
    .then(() => verifyNormalPath())
    .then(() => verifyZeroTickPath())
    .then(() => verifyAwaitsPendingCommandsBeforeSystemAndTicks())
    .then(() => verifyCultivationAuraMultiplierUsesPlayerTileAura())
    .then(() => verifyCultivationAuraMultiplierUsesQiProjectionEfficiency())
    .then(() => verifyCultivationAuraMultiplierUsesAllAbsorbableQiResources())
    .then(() => verifyTemporaryTileExpiryUsesInstanceTick())
    .then(() => verifyTileQiDrainRelocatesPlayerToSpawnOnEmptyQi())
    .then(() => verifyOperationFailuresAreIsolatedWithinTick())
    .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-tick-orchestration' }, null, 2));
});
