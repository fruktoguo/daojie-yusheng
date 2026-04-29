// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeCraftMutationService } = require("../runtime/world/world-runtime-craft-mutation.service");
const { WorldRuntimeAlchemyService } = require("../runtime/world/world-runtime-alchemy.service");
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function createDeps(log) {
    return {    
    /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, kind) { log.push(['queuePlayerNotice', playerId, message, kind]); },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow() {
            return {            
            /**
 * dropGroundItem：执行drop地面道具相关逻辑。
 * @returns 无返回值，直接更新dropGround道具相关状态。
 */

                dropGroundItem() { log.push(['dropGroundItem']); return { sourceId: 'ground:1' }; },
            };
        },        
        /**
 * spawnGroundItem：执行spawn地面道具相关逻辑。
 * @returns 无返回值，直接更新spawnGround道具相关状态。
 */

        spawnGroundItem() { log.push(['spawnGroundItem']); },
    };
}
/**
 * testStartAlchemy：执行test开始炼丹相关逻辑。
 * @returns 无返回值，直接更新testStart炼丹相关状态。
 */


async function testStartAlchemy() {
    const log = [];
    const durableCalls = [];
    let resolveDurable = () => {};
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:alchemy',
        sessionEpoch: 9,
        inventory: {
            items: [{ itemId: 'moon_grass', count: 3 }],
            revision: 1,
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 8, frozenBalance: 0, version: 1 }],
        },
        persistentRevision: 1,
        selfRevision: 1,
        dirtyDomains: new Set(),
        alchemyJob: null,
    };
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return player; },        
        /**
 * getPlayer：读取玩家。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer() { return player; },        
        /**
 * receiveInventoryItem：执行receive背包道具相关逻辑。
 * @returns 无返回值，直接更新receive背包道具相关状态。
 */

        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
        playerProgressionService: {
            refreshPreview() {},
        },
    };
    const craftPanelRuntimeService = {    
    /**
 * startAlchemy：执行开始炼丹相关逻辑。
 * @returns 无返回值，直接更新start炼丹相关状态。
 */

        startAlchemy(targetPlayer) {
            targetPlayer.inventory.items = [{ itemId: 'moon_grass', count: 1 }];
            targetPlayer.wallet.balances = [{ walletType: 'spirit_stone', balance: 6, frozenBalance: 0, version: 2 }];
            targetPlayer.alchemyJob = {
                jobRunId: 'job:alchemy:start:1',
                jobType: 'alchemy',
                jobVersion: 2,
                phase: 'preparing',
                startedAt: 100,
                totalTicks: 8,
                remainingTicks: 8,
                pausedTicks: 0,
                successRate: 1,
                outputItemId: 'qi_pill',
                outputCount: 1,
                quantity: 1,
                completedCount: 0,
                successCount: 0,
                failureCount: 0,
                ingredients: [{ itemId: 'moon_grass', count: 2 }],
                preparationTicks: 1,
                batchBrewTicks: 7,
                currentBatchRemainingTicks: 7,
                spiritStoneCost: 2,
                exactRecipe: true,
            };
            targetPlayer.inventory.revision = 2;
            targetPlayer.selfRevision = 2;
            targetPlayer.persistentRevision = 2;
            targetPlayer.dirtyDomains = new Set(['inventory', 'wallet', 'active_job']);
            return { ok: true, messages: [{ text: '炼丹开始', kind: 'success' }], panelChanged: true, groundDrops: [] };
        },        
        /**
 * startTechniqueActivity：统一技艺活动开始入口。
 * @returns 无返回值，直接更新技艺活动开始相关状态。
 */

        startTechniqueActivity(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.startAlchemy(_player);
        },        
        /**
 * buildAlchemyPanelPayload：构建并返回目标对象。
 * @returns 无返回值，直接更新炼丹面板载荷相关状态。
 */

        buildAlchemyPanelPayload() { return { ok: true }; },
        /**
 * buildTechniqueActivityPanelPayload：统一技艺面板载荷入口。
 * @returns 无返回值，直接更新技艺面板载荷相关状态。
 */

        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildAlchemyPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {    
    /**
 * getSocketByPlayerId：读取SocketBy玩家ID。
 * @returns 无返回值，完成SocketBy玩家ID的读取/组装。
 */

        getSocketByPlayerId() { return {        
        /**
 * emit：处理emit并更新相关状态。
 * @param event 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新结果相关状态。
 */
 emit(event, payload) { log.push(['emit', event, payload.ok]); } }; },
    }, {    
    /**
 * prefersMainline：执行preferNext相关逻辑。
 * @returns 无返回值，直接更新preferNext相关状态。
 */

        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    const deps = createDeps(log);
    deps.durableOperationService = {
        isEnabled() {
            return true;
        },
        startActiveJobWithAssets(input) {
            durableCalls.push(input);
            return new Promise((resolve) => {
                resolveDurable = () => resolve({
                    ok: true,
                    alreadyCommitted: false,
                    action: 'start',
                    jobRunId: input.nextActiveJob.jobRunId,
                    jobVersion: input.nextActiveJob.jobVersion,
                });
            });
        },
    };
    deps.instanceCatalogService = {
        isEnabled() {
            return true;
        },
        async loadInstanceCatalog(instanceId) {
            assert.equal(instanceId, 'instance:1');
            return {
                assigned_node_id: 'node:alchemy',
                ownership_epoch: 17,
            };
        },
    };
    const pendingDispatch = service.dispatchStartAlchemy('player:1', { presetId: 'p1' }, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(log.length, 0);
    assert.equal(durableCalls.length, 1);
    assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:alchemy');
    assert.equal(durableCalls[0]?.expectedSessionEpoch, 9);
    assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:1');
    assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:alchemy');
    assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 17);
    assert.equal(durableCalls[0]?.nextActiveJob?.jobRunId, 'job:alchemy:start:1');
    resolveDurable();
    await pendingDispatch;
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '炼丹开始', 'success'],
        ['emit', 'n:s:alchemyPanel', true],
    ]);
}
/**
 * testCancelAlchemy：执行test取消炼丹相关逻辑。
 * @returns 无返回值，直接更新testCancel炼丹相关状态。
 */


async function testCancelAlchemy() {
    const log = [];
    const durableCalls = [];
    let resolveDurable = () => {};
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:alchemy',
        sessionEpoch: 9,
        inventory: {
            items: [],
            revision: 3,
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 0, frozenBalance: 0, version: 1 }],
        },
        persistentRevision: 3,
        selfRevision: 3,
        dirtyDomains: new Set(),
        alchemyJob: {
            jobRunId: 'job:alchemy:cancel:1',
            jobType: 'alchemy',
            jobVersion: 4,
            phase: 'paused',
            startedAt: 100,
            totalTicks: 12,
            remainingTicks: 6,
            pausedTicks: 2,
            successRate: 1,
            outputItemId: 'qi_pill',
            outputCount: 1,
            quantity: 3,
            completedCount: 1,
            successCount: 1,
            failureCount: 0,
            ingredients: [{ itemId: 'moon_grass', count: 2 }],
            preparationTicks: 1,
            batchBrewTicks: 7,
            currentBatchRemainingTicks: 7,
            spiritStoneCost: 3,
            exactRecipe: true,
        },
    };
    const playerRuntimeService = {
        getPlayerOrThrow() { return player; },
        getPlayer() { return player; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
        playerProgressionService: {
            refreshPreview() {},
        },
    };
    const craftPanelRuntimeService = {
        cancelAlchemy(targetPlayer) {
            targetPlayer.inventory.items = [{ itemId: 'moon_grass', count: 4 }];
            targetPlayer.wallet.balances = [{ walletType: 'spirit_stone', balance: 2, frozenBalance: 0, version: 2 }];
            targetPlayer.alchemyJob = null;
            targetPlayer.inventory.revision = 4;
            targetPlayer.selfRevision = 4;
            targetPlayer.persistentRevision = 4;
            targetPlayer.dirtyDomains = new Set(['inventory', 'wallet', 'active_job']);
            return {
                ok: true,
                panelChanged: true,
                inventoryChanged: true,
                groundDrops: [],
                messages: [{ text: '你收了炉火，未开炼的后续炉次材料已退回。', kind: 'system' }],
            };
        },
        cancelTechniqueActivity(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.cancelAlchemy(_player);
        },
        buildAlchemyPanelPayload() { return { ok: true }; },
        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildAlchemyPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return {
            emit(event, payload) { log.push(['emit', event, payload.ok]); },
        }; },
    }, {
        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    const deps = createDeps(log);
    deps.durableOperationService = {
        isEnabled() {
            return true;
        },
        cancelActiveJobWithAssets(input) {
            durableCalls.push(input);
            return new Promise((resolve) => {
                resolveDurable = () => resolve({
                    ok: true,
                    alreadyCommitted: false,
                    action: 'cancel',
                    jobRunId: null,
                    jobVersion: null,
                });
            });
        },
    };
    deps.instanceCatalogService = {
        isEnabled() {
            return true;
        },
        async loadInstanceCatalog(instanceId) {
            assert.equal(instanceId, 'instance:1');
            return {
                assigned_node_id: 'node:alchemy',
                ownership_epoch: 17,
            };
        },
    };
    const pendingDispatch = service.dispatchCancelAlchemy('player:1', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(log.length, 0);
    assert.equal(durableCalls.length, 1);
    assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:alchemy');
    assert.equal(durableCalls[0]?.expectedSessionEpoch, 9);
    assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:1');
    assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:alchemy');
    assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 17);
    assert.equal(durableCalls[0]?.expectedJobRunId, 'job:alchemy:cancel:1');
    assert.equal(durableCalls[0]?.expectedJobVersion, 4);
    assert.deepEqual(durableCalls[0]?.nextInventoryItems, [{ itemId: 'moon_grass', count: 4 }]);
    assert.deepEqual(durableCalls[0]?.nextWalletBalances, [{ walletType: 'spirit_stone', balance: 2, frozenBalance: 0, version: 2 }]);
    resolveDurable();
    await pendingDispatch;
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '你收了炉火，未开炼的后续炉次材料已退回。', 'system'],
        ['emit', 'n:s:alchemyPanel', true],
    ]);
}

async function testCompleteAlchemy() {
    const log = [];
    const durableCalls = [];
    let resolveDurable = () => {};
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:alchemy',
        sessionEpoch: 9,
        inventory: {
            items: [{ itemId: 'moon_grass', count: 1 }],
            revision: 5,
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 6, frozenBalance: 0, version: 2 }],
        },
        alchemySkill: {
            level: 1,
            exp: 0,
            expToNext: 100,
        },
        enhancementSkillLevel: 1,
        persistentRevision: 5,
        selfRevision: 5,
        dirtyDomains: new Set(),
        alchemyJob: {
            jobRunId: 'job:alchemy:complete:1',
            jobType: 'alchemy',
            jobVersion: 7,
            phase: 'brewing',
            startedAt: 100,
            totalTicks: 8,
            remainingTicks: 1,
            pausedTicks: 0,
            successRate: 1,
            outputItemId: 'qi_pill',
            outputCount: 1,
            quantity: 1,
            completedCount: 0,
            successCount: 0,
            failureCount: 0,
            ingredients: [{ itemId: 'moon_grass', count: 2 }],
            preparationTicks: 1,
            batchBrewTicks: 7,
            currentBatchRemainingTicks: 1,
            spiritStoneCost: 2,
            exactRecipe: true,
        },
    };
    const playerRuntimeService = {
        getPlayerOrThrow() { return player; },
        getPlayer() { return player; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
        playerProgressionService: {
            refreshPreview() {},
        },
    };
    const craftPanelRuntimeService = {
        tickAlchemy(targetPlayer) {
            targetPlayer.inventory.items = [{ itemId: 'qi_pill', count: 1 }];
            targetPlayer.wallet.balances = [{ walletType: 'spirit_stone', balance: 6, frozenBalance: 0, version: 2 }];
            targetPlayer.alchemySkill.exp = 1;
            targetPlayer.alchemyJob = null;
            targetPlayer.inventory.revision = 6;
            targetPlayer.selfRevision = 6;
            targetPlayer.persistentRevision = 6;
            targetPlayer.dirtyDomains = new Set(['inventory', 'active_job', 'profession']);
            return {
                ok: true,
                panelChanged: true,
                inventoryChanged: true,
                groundDrops: [],
                messages: [{ text: '炼制完成，成丹 1 枚。', kind: 'quest' }],
            };
        },
        tickTechniqueActivity(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.tickAlchemy(_player);
        },
        buildAlchemyPanelPayload() { return { ok: true }; },
        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildAlchemyPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return {
            emit(event, payload) { log.push(['emit', event, payload.ok]); },
        }; },
    }, {
        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    const deps = createDeps(log);
    deps.durableOperationService = {
        isEnabled() {
            return true;
        },
        completeActiveJobWithAssets(input) {
            durableCalls.push(input);
            return new Promise((resolve) => {
                resolveDurable = () => resolve({
                    ok: true,
                    alreadyCommitted: false,
                    action: 'complete',
                    jobRunId: null,
                    jobVersion: null,
                });
            });
        },
    };
    deps.instanceCatalogService = {
        isEnabled() {
            return true;
        },
        async loadInstanceCatalog(instanceId) {
            assert.equal(instanceId, 'instance:1');
            return {
                assigned_node_id: 'node:alchemy',
                ownership_epoch: 17,
            };
        },
    };
    service.tickAlchemy('player:1', player, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(log.length, 0);
    assert.equal(durableCalls.length, 1);
    assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:alchemy');
    assert.equal(durableCalls[0]?.expectedSessionEpoch, 9);
    assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:1');
    assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:alchemy');
    assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 17);
    assert.equal(durableCalls[0]?.expectedJobRunId, 'job:alchemy:complete:1');
    assert.equal(durableCalls[0]?.expectedJobVersion, 8);
    assert.equal(durableCalls[0]?.nextInventoryItems?.[0]?.itemId, 'qi_pill');
    assert.equal(durableCalls[0]?.nextInventoryItems?.[0]?.count, 1);
    resolveDurable();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '炼制完成，成丹 1 枚。', 'quest'],
        ['emit', 'n:s:alchemyPanel', true],
    ]);
}

async function testUpdateAlchemyTick() {
    const log = [];
    const durableCalls = [];
    let resolveDurable = () => {};
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:alchemy',
        sessionEpoch: 9,
        inventory: {
            items: [{ itemId: 'moon_grass', count: 1 }],
            revision: 5,
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 6, frozenBalance: 0, version: 2 }],
        },
        alchemySkill: {
            level: 1,
            exp: 0,
            expToNext: 100,
        },
        enhancementSkillLevel: 1,
        persistentRevision: 5,
        selfRevision: 5,
        dirtyDomains: new Set(),
        alchemyJob: {
            jobRunId: 'job:alchemy:update:1',
            jobType: 'alchemy',
            jobVersion: 4,
            phase: 'preparing',
            startedAt: 100,
            totalTicks: 8,
            remainingTicks: 7,
            pausedTicks: 0,
            successRate: 1,
            outputItemId: 'qi_pill',
            outputCount: 1,
            quantity: 1,
            completedCount: 0,
            successCount: 0,
            failureCount: 0,
            ingredients: [{ itemId: 'moon_grass', count: 2 }],
            preparationTicks: 1,
            batchBrewTicks: 7,
            currentBatchRemainingTicks: 7,
            spiritStoneCost: 2,
            exactRecipe: true,
        },
    };
    const playerRuntimeService = {
        getPlayerOrThrow() { return player; },
        getPlayer() { return player; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
        playerProgressionService: {
            refreshPreview() {},
        },
    };
    const craftPanelRuntimeService = {
        tickAlchemy(targetPlayer) {
            targetPlayer.alchemyJob = {
                ...targetPlayer.alchemyJob,
                phase: 'brewing',
                remainingTicks: 6,
                currentBatchRemainingTicks: 6,
                jobVersion: 5,
            };
            targetPlayer.selfRevision = 6;
            targetPlayer.persistentRevision = 6;
            targetPlayer.dirtyDomains = new Set(['active_job']);
            return {
                ok: true,
                panelChanged: true,
                inventoryChanged: false,
                groundDrops: [],
                messages: [{ text: 'qi_pill 炉火已稳，开始正式炼制。', kind: 'quest' }],
            };
        },
        tickTechniqueActivity(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.tickAlchemy(_player);
        },
        buildAlchemyPanelPayload() { return { ok: true }; },
        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildAlchemyPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return {
            emit(event, payload) { log.push(['emit', event, payload.ok]); },
        }; },
    }, {
        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    const deps = createDeps(log);
    deps.durableOperationService = {
        isEnabled() {
            return true;
        },
        updateActiveJobState(input) {
            durableCalls.push(input);
            return new Promise((resolve) => {
                resolveDurable = () => resolve({
                    ok: true,
                    alreadyCommitted: false,
                    action: 'update',
                    jobRunId: input.nextActiveJob.jobRunId,
                    jobVersion: input.nextActiveJob.jobVersion,
                });
            });
        },
    };
    deps.instanceCatalogService = {
        isEnabled() {
            return true;
        },
        async loadInstanceCatalog(instanceId) {
            assert.equal(instanceId, 'instance:1');
            return {
                assigned_node_id: 'node:alchemy',
                ownership_epoch: 17,
            };
        },
    };
    service.tickAlchemy('player:1', player, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(log.length, 0);
    assert.equal(durableCalls.length, 1);
    assert.equal(durableCalls[0]?.action, 'update');
    assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:alchemy');
    assert.equal(durableCalls[0]?.expectedSessionEpoch, 9);
    assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:1');
    assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:alchemy');
    assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 17);
    assert.equal(durableCalls[0]?.expectedJobRunId, 'job:alchemy:update:1');
    assert.equal(durableCalls[0]?.expectedJobVersion, 4);
    assert.equal(durableCalls[0]?.nextActiveJob?.jobVersion, 5);
    assert.equal(durableCalls[0]?.nextActiveJob?.phase, 'brewing');
    resolveDurable();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', 'qi_pill 炉火已稳，开始正式炼制。', 'quest'],
        ['emit', 'n:s:alchemyPanel', true],
    ]);
}

async function testTickAlchemySkipsDurableWithoutLease() {
    const log = [];
    const durableCalls = [];
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:alchemy',
        sessionEpoch: 9,
        inventory: {
            items: [{ itemId: 'moon_grass', count: 1 }],
            revision: 5,
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 6, frozenBalance: 0, version: 2 }],
        },
        alchemySkill: {
            level: 1,
            exp: 0,
            expToNext: 100,
        },
        enhancementSkillLevel: 1,
        persistentRevision: 5,
        selfRevision: 5,
        dirtyDomains: new Set(),
        alchemyJob: {
            jobRunId: 'job:alchemy:update:missing-lease',
            jobType: 'alchemy',
            jobVersion: 4,
            phase: 'preparing',
            startedAt: 100,
            totalTicks: 8,
            remainingTicks: 7,
            pausedTicks: 0,
            successRate: 1,
            outputItemId: 'qi_pill',
            outputCount: 1,
            quantity: 1,
            completedCount: 0,
            successCount: 0,
            failureCount: 0,
            ingredients: [{ itemId: 'moon_grass', count: 2 }],
            preparationTicks: 1,
            batchBrewTicks: 7,
            currentBatchRemainingTicks: 7,
            spiritStoneCost: 2,
            exactRecipe: true,
        },
    };
    const playerRuntimeService = {
        getPlayerOrThrow() { return player; },
        getPlayer() { return player; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
        playerProgressionService: {
            refreshPreview() {},
        },
    };
    const craftPanelRuntimeService = {
        tickAlchemy(targetPlayer) {
            targetPlayer.alchemyJob = {
                ...targetPlayer.alchemyJob,
                phase: 'brewing',
                remainingTicks: 6,
                currentBatchRemainingTicks: 6,
                jobVersion: 5,
            };
            targetPlayer.selfRevision = 6;
            targetPlayer.persistentRevision = 6;
            targetPlayer.dirtyDomains = new Set(['active_job']);
            return {
                ok: true,
                panelChanged: true,
                inventoryChanged: false,
                groundDrops: [],
                messages: [{ text: 'qi_pill 炉火已稳，开始正式炼制。', kind: 'quest' }],
            };
        },
        tickTechniqueActivity(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.tickAlchemy(_player);
        },
        buildAlchemyPanelPayload() { return { ok: true }; },
        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildAlchemyPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return {
            emit(event, payload) { log.push(['emit', event, payload.ok]); },
        }; },
    }, {
        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    const deps = createDeps(log);
    deps.durableOperationService = {
        isEnabled() {
            return true;
        },
        updateActiveJobState(input) {
            durableCalls.push(input);
            return Promise.resolve({
                ok: true,
                alreadyCommitted: false,
                action: 'update',
                jobRunId: input.nextActiveJob.jobRunId,
                jobVersion: input.nextActiveJob.jobVersion,
            });
        },
    };
    deps.instanceCatalogService = {
        isEnabled() {
            return true;
        },
        async loadInstanceCatalog(instanceId) {
            assert.equal(instanceId, 'instance:1');
            return {
                assigned_node_id: null,
                ownership_epoch: 0,
            };
        },
    };
    service.tickAlchemy('player:1', player, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(durableCalls.length, 0);
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', 'instance_lease_context_missing:instance:1', 'warn'],
    ]);
    assert.equal(player.alchemyJob?.jobVersion, 4);
    assert.equal(player.alchemyJob?.phase, 'preparing');
}
/**
 * testDeletePreset：处理testDeletePreset并更新相关状态。
 * @returns 无返回值，直接更新testDeletePreset相关状态。
 */


function testDeletePreset() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },        
        /**
 * getPlayer：读取玩家。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer() { return { playerId: 'player:1' }; },        
        /**
 * receiveInventoryItem：执行receive背包道具相关逻辑。
 * @returns 无返回值，直接更新receive背包道具相关状态。
 */

        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    };
    const craftPanelRuntimeService = {    
    /**
 * deleteAlchemyPreset：处理炼丹Preset并更新相关状态。
 * @returns 无返回值，直接更新炼丹Preset相关状态。
 */

        deleteAlchemyPreset() { return { ok: true, messages: [{ text: '预设删除成功', kind: 'info' }], panelChanged: false, groundDrops: [] }; },        
        /**
 * buildAlchemyPanelPayload：构建并返回目标对象。
 * @returns 无返回值，直接更新炼丹面板载荷相关状态。
 */

        buildAlchemyPanelPayload() { return { ok: true }; },
        /**
 * buildTechniqueActivityPanelPayload：统一技艺面板载荷入口。
 * @returns 无返回值，直接更新技艺面板载荷相关状态。
 */

        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildAlchemyPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {    
    /**
 * getSocketByPlayerId：读取SocketBy玩家ID。
 * @returns 无返回值，完成SocketBy玩家ID的读取/组装。
 */

        getSocketByPlayerId() { return {        
        /**
 * emit：处理emit并更新相关状态。
 * @returns 无返回值，直接更新结果相关状态。
 */
 emit() { log.push(['emit']); } }; },
    }, {    
    /**
 * prefersMainline：执行preferNext相关逻辑。
 * @returns 无返回值，直接更新preferNext相关状态。
 */

        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchDeleteAlchemyPreset('player:1', 'preset:1', createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '预设删除成功', 'info'],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchStartAlchemy：判断test世界运行态FacadeDispatch开始炼丹是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchStart炼丹相关状态。
 */


function testWorldRuntimeFacadeDispatchStartAlchemy() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchStartAlchemy：判断开始炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start炼丹相关状态。
 */

            dispatchStartAlchemy(playerId, payload, deps) {
                log.push(['dispatchStartAlchemy', playerId, payload, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchStartAlchemy.call(runtime, 'player:1', { presetId: 'p1' });
    assert.deepEqual(log, [
        ['dispatchStartAlchemy', 'player:1', { presetId: 'p1' }, true],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchCancelAlchemy：判断test世界运行态FacadeDispatchCancel炼丹是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchCancel炼丹相关状态。
 */


function testWorldRuntimeFacadeDispatchCancelAlchemy() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchCancelAlchemy：判断Cancel炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
 */

            dispatchCancelAlchemy(playerId, deps) {
                log.push(['dispatchCancelAlchemy', playerId, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchCancelAlchemy.call(runtime, 'player:1');
    assert.deepEqual(log, [
        ['dispatchCancelAlchemy', 'player:1', true],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchSaveAlchemyPreset：判断test世界运行态FacadeDispatchSave炼丹Preset是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchSave炼丹Preset相关状态。
 */


function testWorldRuntimeFacadeDispatchSaveAlchemyPreset() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchSaveAlchemyPreset：判断Save炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
 */

            dispatchSaveAlchemyPreset(playerId, payload, deps) {
                log.push(['dispatchSaveAlchemyPreset', playerId, payload, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchSaveAlchemyPreset.call(runtime, 'player:1', { presetId: 'p2' });
    assert.deepEqual(log, [
        ['dispatchSaveAlchemyPreset', 'player:1', { presetId: 'p2' }, true],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchDeleteAlchemyPreset：判断test世界运行态FacadeDispatchDelete炼丹Preset是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchDelete炼丹Preset相关状态。
 */


function testWorldRuntimeFacadeDispatchDeleteAlchemyPreset() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchDeleteAlchemyPreset：判断Delete炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
 */

            dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
                log.push(['dispatchDeleteAlchemyPreset', playerId, presetId, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchDeleteAlchemyPreset.call(runtime, 'player:1', 'preset:1');
    assert.deepEqual(log, [
        ['dispatchDeleteAlchemyPreset', 'player:1', 'preset:1', true],
    ]);
}

Promise.resolve()
    .then(() => testStartAlchemy())
    .then(() => testCancelAlchemy())
    .then(() => testCompleteAlchemy())
    .then(() => testUpdateAlchemyTick())
    .then(() => testTickAlchemySkipsDurableWithoutLease())
    .then(() => testDeletePreset())
    .then(() => {
    testWorldRuntimeFacadeDispatchStartAlchemy();
    testWorldRuntimeFacadeDispatchCancelAlchemy();
    testWorldRuntimeFacadeDispatchSaveAlchemyPreset();
    testWorldRuntimeFacadeDispatchDeleteAlchemyPreset();
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-alchemy' }, null, 2));
});
