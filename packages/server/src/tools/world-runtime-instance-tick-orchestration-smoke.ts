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
        'materializeAutoCombatCommands',
        'dispatchPendingCommands',
        'dispatchPendingSystemCommands',
        'getBlockedPlayerIds',
        'instance.tickOnce',
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
        'materializeAutoCombatCommands',
        'dispatchPendingCommands:start',
        'dispatchPendingCommands:resolved',
        'dispatchPendingSystemCommands',
        'getBlockedPlayerIds',
        'instance.tickOnce',
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

Promise.resolve()
    .then(() => verifyNormalPath())
    .then(() => verifyZeroTickPath())
    .then(() => verifyAwaitsPendingCommandsBeforeSystemAndTicks())
    .then(() => verifyCultivationAuraMultiplierUsesPlayerTileAura())
    .then(() => verifyCultivationAuraMultiplierUsesQiProjectionEfficiency())
    .then(() => verifyCultivationAuraMultiplierUsesAllAbsorbableQiResources())
    .then(() => verifyTemporaryTileExpiryUsesInstanceTick())
    .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-tick-orchestration' }, null, 2));
});
