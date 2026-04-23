// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeCraftMutationService } = require("../runtime/world/world-runtime-craft-mutation.service");
const { WorldRuntimeEnhancementService } = require("../runtime/world/world-runtime-enhancement.service");
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
 * testStartEnhancement：执行test开始强化相关逻辑。
 * @returns 无返回值，直接更新testStart强化相关状态。
 */


async function testStartEnhancement() {
    const log = [];
    const durableCalls = [];
    let resolveDurable = () => {};
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:enhancement',
        sessionEpoch: 11,
        inventory: {
            items: [
                { itemId: 'enhancement_stone', count: 3 },
                { itemId: 'rat_tail', count: 4 },
            ],
            revision: 4,
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 18, frozenBalance: 0, version: 2 }],
        },
        enhancementJob: null,
        enhancementRecords: [],
        persistentRevision: 4,
        selfRevision: 4,
        dirtyDomains: new Set(),
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
 * startEnhancement：执行开始强化相关逻辑。
 * @returns 无返回值，直接更新start强化相关状态。
 */

        startEnhancement(targetPlayer) {
            targetPlayer.inventory.items = [{ itemId: 'rat_tail', count: 2 }];
            targetPlayer.inventory.revision = 5;
            targetPlayer.wallet.balances = [{ walletType: 'spirit_stone', balance: 16, frozenBalance: 0, version: 3 }];
            targetPlayer.enhancementJob = {
                jobRunId: 'job:enhancement:start:1',
                jobType: 'enhancement',
                target: { source: 'inventory', slotIndex: 0 },
                item: { itemId: 'iron_sword', count: 1, enhanceLevel: 1, level: 8, type: 'equipment', name: '铁剑' },
                targetItemId: 'iron_sword',
                targetItemName: '铁剑',
                targetItemLevel: 8,
                currentLevel: 1,
                targetLevel: 2,
                desiredTargetLevel: 2,
                spiritStoneCost: 2,
                materials: [{ itemId: 'enhancement_stone', count: 3 }],
                protectionUsed: false,
                protectionStartLevel: null,
                protectionItemId: '',
                protectionItemName: '',
                protectionItemSignature: '',
                phase: 'enhancing',
                pausedTicks: 0,
                successRate: 0.65,
                totalTicks: 12,
                remainingTicks: 12,
                startedAt: 100,
                roleEnhancementLevel: 4,
                totalSpeedRate: 1,
                jobVersion: 2,
            };
            targetPlayer.enhancementRecords = [{
                itemId: 'iron_sword',
                actionStartedAt: 100,
                startLevel: 1,
                initialTargetLevel: 2,
                desiredTargetLevel: 2,
                protectionStartLevel: null,
                status: 'running',
            }];
            targetPlayer.selfRevision = 5;
            targetPlayer.persistentRevision = 5;
            targetPlayer.dirtyDomains = new Set(['inventory', 'wallet', 'active_job', 'enhancement_record']);
            return { ok: true, messages: [{ text: '强化开始', kind: 'success' }], panelChanged: true, groundDrops: [] };
        },        
        /**
 * startTechniqueActivity：统一技艺活动开始入口。
 * @returns 无返回值，直接更新技艺活动开始相关状态。
 */

        startTechniqueActivity(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.startEnhancement(_player);
        },        
        /**
 * buildEnhancementPanelPayload：构建并返回目标对象。
 * @returns 无返回值，直接更新强化面板载荷相关状态。
 */

        buildEnhancementPanelPayload() { return { ok: true }; },
        /**
 * buildTechniqueActivityPanelPayload：统一技艺面板载荷入口。
 * @returns 无返回值，直接更新技艺面板载荷相关状态。
 */

        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildEnhancementPanelPayload();
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
    const service = new WorldRuntimeEnhancementService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
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
                assigned_node_id: 'node:enhancement',
                ownership_epoch: 23,
            };
        },
    };
    const pendingDispatch = service.dispatchStartEnhancement('player:1', { target: { source: 'inventory', slotIndex: 0 } }, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(log.length, 0);
    assert.equal(durableCalls.length, 1);
    assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:enhancement');
    assert.equal(durableCalls[0]?.expectedSessionEpoch, 11);
    assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:1');
    assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:enhancement');
    assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 23);
    assert.equal(durableCalls[0]?.nextActiveJob?.jobRunId, 'job:enhancement:start:1');
    assert.equal(durableCalls[0]?.nextActiveJob?.jobVersion, 2);
    assert.equal(durableCalls[0]?.nextEnhancementRecords?.[0]?.itemId, 'iron_sword');
    assert.equal(durableCalls[0]?.nextEnhancementRecords?.[0]?.status, 'running');
    resolveDurable();
    await pendingDispatch;
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '强化开始', 'success'],
        ['emit', 'n:s:enhancementPanel', true],
    ]);
}
/**
 * testCancelEnhancement：判断testCancel强化是否满足条件。
 * @returns 无返回值，直接更新testCancel强化相关状态。
 */


async function testCancelEnhancement() {
    const log = [];
    const durableCalls = [];
    let resolveDurable = () => {};
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:enhancement',
        sessionEpoch: 11,
        inventory: {
            items: [],
            revision: 7,
        },
        equipment: {
            revision: 2,
            slots: [
                { slot: 'weapon', item: null },
                { slot: 'armor', item: null },
            ],
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 16, frozenBalance: 0, version: 3 }],
        },
        enhancementJob: {
            jobRunId: 'job:enhancement:cancel:1',
            jobType: 'enhancement',
            target: { source: 'equipment', slot: 'weapon' },
            item: { itemId: 'iron_sword', count: 1, enhanceLevel: 1, level: 8, type: 'equipment', name: '铁剑' },
            targetItemId: 'iron_sword',
            targetItemName: '铁剑',
            targetItemLevel: 8,
            currentLevel: 1,
            targetLevel: 2,
            desiredTargetLevel: 2,
            spiritStoneCost: 2,
            materials: [{ itemId: 'enhancement_stone', count: 3 }],
            protectionUsed: false,
            protectionStartLevel: null,
            protectionItemId: '',
            protectionItemName: '',
            protectionItemSignature: '',
            phase: 'enhancing',
            pausedTicks: 0,
            successRate: 0.65,
            totalTicks: 12,
            remainingTicks: 12,
            startedAt: 100,
            roleEnhancementLevel: 4,
            totalSpeedRate: 1,
            jobVersion: 5,
        },
        enhancementRecords: [{
            itemId: 'iron_sword',
            actionStartedAt: 100,
            startLevel: 1,
            initialTargetLevel: 2,
            desiredTargetLevel: 2,
            protectionStartLevel: null,
            status: 'running',
            highestLevel: 1,
        }],
        persistentRevision: 7,
        selfRevision: 7,
        dirtyDomains: new Set(),
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
        playerAttributesService: {
            recalculate() {},
        },
    };
    const craftPanelRuntimeService = {    
    /**
 * cancelEnhancement：判断cancel强化是否满足条件。
 * @returns 无返回值，完成cancel强化的条件判断。
 */

        cancelEnhancement(targetPlayer) {
            targetPlayer.equipment.slots = [
                {
                    slot: 'weapon',
                    item: { itemId: 'iron_sword', count: 1, enhanceLevel: 1, level: 8, type: 'equipment', name: '铁剑' },
                },
                { slot: 'armor', item: null },
            ];
            targetPlayer.equipment.revision = 3;
            targetPlayer.enhancementJob = null;
            targetPlayer.enhancementRecords = [{
                itemId: 'iron_sword',
                actionStartedAt: 100,
                actionEndedAt: 130,
                startLevel: 1,
                initialTargetLevel: 2,
                desiredTargetLevel: 2,
                protectionStartLevel: null,
                status: 'cancelled',
                highestLevel: 1,
            }];
            targetPlayer.selfRevision = 8;
            targetPlayer.persistentRevision = 8;
            targetPlayer.dirtyDomains = new Set(['active_job', 'enhancement_record', 'equipment', 'attr']);
            return {
                ok: true,
                panelChanged: true,
                inventoryChanged: false,
                equipmentChanged: true,
                attrChanged: true,
                groundDrops: [],
                messages: [{
                    text: '你停止了 铁剑 的强化，已投入的本阶材料不会退回；保护物仅在失败且保护生效时扣除，灵石将在本阶成功后结算。',
                    kind: 'system',
                }],
            };
        },        
        /**
 * cancelTechniqueActivity：统一技艺活动取消入口。
 * @returns 无返回值，直接更新技艺活动取消相关状态。
 */

        cancelTechniqueActivity(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.cancelEnhancement(_player);
        },        
        /**
 * buildEnhancementPanelPayload：构建并返回目标对象。
 * @returns 无返回值，直接更新强化面板载荷相关状态。
 */

        buildEnhancementPanelPayload() { return { ok: true }; },
        /**
 * buildTechniqueActivityPanelPayload：统一技艺面板载荷入口。
 * @returns 无返回值，直接更新技艺面板载荷相关状态。
 */

        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildEnhancementPanelPayload();
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
    const service = new WorldRuntimeEnhancementService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
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
                assigned_node_id: 'node:enhancement',
                ownership_epoch: 23,
            };
        },
    };
    const pendingDispatch = service.dispatchCancelEnhancement('player:1', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(log.length, 0);
    assert.equal(durableCalls.length, 1);
    assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:enhancement');
    assert.equal(durableCalls[0]?.expectedSessionEpoch, 11);
    assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:1');
    assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:enhancement');
    assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 23);
    assert.equal(durableCalls[0]?.expectedJobRunId, 'job:enhancement:cancel:1');
    assert.equal(durableCalls[0]?.expectedJobVersion, 5);
    assert.equal(durableCalls[0]?.nextEquipmentSlots?.[0]?.slot, 'weapon');
    assert.equal(durableCalls[0]?.nextEquipmentSlots?.[0]?.item?.itemId, 'iron_sword');
    assert.equal(durableCalls[0]?.nextEnhancementRecords?.[0]?.itemId, 'iron_sword');
    assert.equal(durableCalls[0]?.nextEnhancementRecords?.[0]?.status, 'cancelled');
    resolveDurable();
    await pendingDispatch;
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '你停止了 铁剑 的强化，已投入的本阶材料不会退回；保护物仅在失败且保护生效时扣除，灵石将在本阶成功后结算。', 'system'],
        ['emit', 'n:s:enhancementPanel', true],
    ]);
}

async function testCompleteEnhancement() {
    const log = [];
    const durableCalls = [];
    let resolveDurable = () => {};
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:enhancement',
        sessionEpoch: 11,
        inventory: {
            items: [],
            revision: 9,
        },
        equipment: {
            revision: 4,
            slots: [
                {
                    slot: 'weapon',
                    item: { itemId: 'iron_sword', count: 1, enhanceLevel: 1, level: 8, type: 'equipment', name: '铁剑' },
                },
                { slot: 'armor', item: null },
            ],
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 16, frozenBalance: 0, version: 3 }],
        },
        enhancementSkill: {
            level: 4,
            exp: 0,
            expToNext: 100,
        },
        enhancementSkillLevel: 4,
        enhancementJob: {
            jobRunId: 'job:enhancement:complete:1',
            jobType: 'enhancement',
            target: { source: 'equipment', slot: 'weapon' },
            item: { itemId: 'iron_sword', count: 1, enhanceLevel: 1, level: 8, type: 'equipment', name: '铁剑' },
            targetItemId: 'iron_sword',
            targetItemName: '铁剑',
            targetItemLevel: 8,
            currentLevel: 1,
            targetLevel: 2,
            desiredTargetLevel: 2,
            spiritStoneCost: 2,
            materials: [{ itemId: 'enhancement_stone', count: 3 }],
            protectionUsed: false,
            protectionStartLevel: null,
            protectionItemId: '',
            protectionItemName: '',
            protectionItemSignature: '',
            phase: 'enhancing',
            pausedTicks: 0,
            successRate: 1,
            totalTicks: 12,
            remainingTicks: 1,
            startedAt: 100,
            roleEnhancementLevel: 4,
            totalSpeedRate: 1,
            jobVersion: 6,
        },
        enhancementRecords: [{
            itemId: 'iron_sword',
            actionStartedAt: 100,
            startLevel: 1,
            initialTargetLevel: 2,
            desiredTargetLevel: 2,
            protectionStartLevel: null,
            status: 'running',
            highestLevel: 1,
        }],
        persistentRevision: 9,
        selfRevision: 9,
        dirtyDomains: new Set(),
    };
    const playerRuntimeService = {
        getPlayerOrThrow() { return player; },
        getPlayer() { return player; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
        playerProgressionService: {
            refreshPreview() {},
        },
        playerAttributesService: {
            recalculate() {},
        },
    };
    const craftPanelRuntimeService = {
        tickEnhancement(targetPlayer) {
            targetPlayer.equipment.slots = [
                {
                    slot: 'weapon',
                    item: { itemId: 'iron_sword', count: 1, enhanceLevel: 2, level: 8, type: 'equipment', name: '铁剑' },
                },
                { slot: 'armor', item: null },
            ];
            targetPlayer.equipment.revision = 5;
            targetPlayer.wallet.balances = [{ walletType: 'spirit_stone', balance: 14, frozenBalance: 0, version: 4 }];
            targetPlayer.enhancementSkill.level = 4;
            targetPlayer.enhancementSkill.exp = 2;
            targetPlayer.enhancementSkillLevel = 4;
            targetPlayer.enhancementJob = null;
            targetPlayer.enhancementRecords = [{
                itemId: 'iron_sword',
                actionStartedAt: 100,
                actionEndedAt: 140,
                startLevel: 1,
                initialTargetLevel: 2,
                desiredTargetLevel: 2,
                protectionStartLevel: null,
                status: 'completed',
                highestLevel: 2,
            }];
            targetPlayer.selfRevision = 10;
            targetPlayer.persistentRevision = 10;
            targetPlayer.dirtyDomains = new Set(['active_job', 'enhancement_record', 'equipment', 'attr', 'profession']);
            return {
                ok: true,
                panelChanged: true,
                inventoryChanged: false,
                equipmentChanged: true,
                attrChanged: true,
                groundDrops: [],
                messages: [{
                    text: '铁剑 强化成功，已提升至 +2。',
                    kind: 'quest',
                }],
            };
        },
        tickTechniqueActivity(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.tickEnhancement(_player);
        },
        buildEnhancementPanelPayload() { return { ok: true }; },
        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildEnhancementPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return {
            emit(event, payload) { log.push(['emit', event, payload.ok]); },
        }; },
    }, {
        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeEnhancementService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
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
                assigned_node_id: 'node:enhancement',
                ownership_epoch: 23,
            };
        },
    };
    service.tickEnhancement('player:1', player, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(log.length, 0);
    assert.equal(durableCalls.length, 1);
    assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:enhancement');
    assert.equal(durableCalls[0]?.expectedSessionEpoch, 11);
    assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:1');
    assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:enhancement');
    assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 23);
    assert.equal(durableCalls[0]?.expectedJobRunId, 'job:enhancement:complete:1');
    assert.equal(durableCalls[0]?.expectedJobVersion, 7);
    assert.equal(durableCalls[0]?.nextEquipmentSlots?.[0]?.slot, 'weapon');
    assert.equal(durableCalls[0]?.nextEquipmentSlots?.[0]?.item?.enhanceLevel, 2);
    assert.equal(durableCalls[0]?.nextWalletBalances?.[0]?.balance, 14);
    assert.equal(durableCalls[0]?.nextEnhancementRecords?.[0]?.itemId, 'iron_sword');
    assert.equal(durableCalls[0]?.nextEnhancementRecords?.[0]?.status, 'completed');
    assert.equal(durableCalls[0]?.nextEnhancementRecords?.[0]?.highestLevel, 2);
    resolveDurable();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '铁剑 强化成功，已提升至 +2。', 'quest'],
        ['emit', 'n:s:enhancementPanel', true],
    ]);
}

async function testUpdateEnhancementTick() {
    const log = [];
    const durableCalls = [];
    let resolveDurable = () => {};
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:enhancement',
        sessionEpoch: 11,
        inventory: {
            items: [],
            revision: 9,
        },
        equipment: {
            revision: 4,
            slots: [
                {
                    slot: 'weapon',
                    item: { itemId: 'iron_sword', count: 1, enhanceLevel: 1, level: 8, type: 'equipment', name: '铁剑' },
                },
                { slot: 'armor', item: null },
            ],
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 16, frozenBalance: 0, version: 3 }],
        },
        enhancementSkill: {
            level: 4,
            exp: 0,
            expToNext: 100,
        },
        enhancementSkillLevel: 4,
        enhancementJob: {
            jobRunId: 'job:enhancement:update:1',
            jobType: 'enhancement',
            target: { source: 'equipment', slot: 'weapon' },
            item: { itemId: 'iron_sword', count: 1, enhanceLevel: 1, level: 8, type: 'equipment', name: '铁剑' },
            targetItemId: 'iron_sword',
            targetItemName: '铁剑',
            targetItemLevel: 8,
            currentLevel: 1,
            targetLevel: 2,
            desiredTargetLevel: 2,
            spiritStoneCost: 2,
            materials: [{ itemId: 'enhancement_stone', count: 3 }],
            protectionUsed: false,
            protectionStartLevel: null,
            protectionItemId: '',
            protectionItemName: '',
            protectionItemSignature: '',
            phase: 'paused',
            pausedTicks: 1,
            successRate: 1,
            totalTicks: 12,
            remainingTicks: 6,
            startedAt: 100,
            roleEnhancementLevel: 4,
            totalSpeedRate: 1,
            jobVersion: 6,
        },
        enhancementRecords: [{
            itemId: 'iron_sword',
            actionStartedAt: 100,
            startLevel: 1,
            initialTargetLevel: 2,
            desiredTargetLevel: 2,
            protectionStartLevel: null,
            status: 'running',
            highestLevel: 1,
        }],
        persistentRevision: 9,
        selfRevision: 9,
        dirtyDomains: new Set(),
    };
    const playerRuntimeService = {
        getPlayerOrThrow() { return player; },
        getPlayer() { return player; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
        playerProgressionService: {
            refreshPreview() {},
        },
        playerAttributesService: {
            recalculate() {},
        },
    };
    const craftPanelRuntimeService = {
        tickEnhancement(targetPlayer) {
            targetPlayer.enhancementJob = {
                ...targetPlayer.enhancementJob,
                phase: 'enhancing',
                pausedTicks: 0,
                remainingTicks: 5,
                jobVersion: 7,
            };
            targetPlayer.selfRevision = 10;
            targetPlayer.persistentRevision = 10;
            targetPlayer.dirtyDomains = new Set(['active_job']);
            return {
                ok: true,
                panelChanged: true,
                inventoryChanged: false,
                equipmentChanged: false,
                attrChanged: false,
                groundDrops: [],
                messages: [],
            };
        },
        tickTechniqueActivity(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.tickEnhancement(_player);
        },
        buildEnhancementPanelPayload() { return { ok: true }; },
        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildEnhancementPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return {
            emit(event, payload) { log.push(['emit', event, payload.ok]); },
        }; },
    }, {
        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeEnhancementService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
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
                assigned_node_id: 'node:enhancement',
                ownership_epoch: 23,
            };
        },
    };
    service.tickEnhancement('player:1', player, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(log.length, 0);
    assert.equal(durableCalls.length, 1);
    assert.equal(durableCalls[0]?.action, 'update');
    assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:enhancement');
    assert.equal(durableCalls[0]?.expectedSessionEpoch, 11);
    assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:1');
    assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:enhancement');
    assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 23);
    assert.equal(durableCalls[0]?.expectedJobRunId, 'job:enhancement:update:1');
    assert.equal(durableCalls[0]?.expectedJobVersion, 6);
    assert.equal(durableCalls[0]?.nextActiveJob?.jobVersion, 7);
    assert.equal(durableCalls[0]?.nextActiveJob?.phase, 'enhancing');
    resolveDurable();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['emit', 'n:s:enhancementPanel', true],
    ]);
}

async function testTickEnhancementSkipsDurableWithoutLease() {
    const log = [];
    const durableCalls = [];
    const player = {
        playerId: 'player:1',
        instanceId: 'instance:1',
        x: 1,
        y: 2,
        runtimeOwnerId: 'runtime:enhancement',
        sessionEpoch: 11,
        inventory: {
            items: [],
            revision: 9,
        },
        equipment: {
            revision: 4,
            slots: [
                {
                    slot: 'weapon',
                    item: { itemId: 'iron_sword', count: 1, enhanceLevel: 1, level: 8, type: 'equipment', name: '铁剑' },
                },
                { slot: 'armor', item: null },
            ],
        },
        wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 16, frozenBalance: 0, version: 3 }],
        },
        enhancementSkill: {
            level: 4,
            exp: 0,
            expToNext: 100,
        },
        enhancementSkillLevel: 4,
        enhancementJob: {
            jobRunId: 'job:enhancement:update:missing-lease',
            jobType: 'enhancement',
            target: { source: 'equipment', slot: 'weapon' },
            item: { itemId: 'iron_sword', count: 1, enhanceLevel: 1, level: 8, type: 'equipment', name: '铁剑' },
            targetItemId: 'iron_sword',
            targetItemName: '铁剑',
            targetItemLevel: 8,
            currentLevel: 1,
            targetLevel: 2,
            desiredTargetLevel: 2,
            spiritStoneCost: 2,
            materials: [{ itemId: 'enhancement_stone', count: 3 }],
            protectionUsed: false,
            protectionStartLevel: null,
            protectionItemId: '',
            protectionItemName: '',
            protectionItemSignature: '',
            phase: 'enhancing',
            pausedTicks: 0,
            successRate: 0.65,
            totalTicks: 12,
            remainingTicks: 11,
            startedAt: 100,
            roleEnhancementLevel: 4,
            totalSpeedRate: 1,
            jobVersion: 6,
        },
        enhancementRecords: [{
            itemId: 'iron_sword',
            actionStartedAt: 100,
            startLevel: 1,
            initialTargetLevel: 2,
            desiredTargetLevel: 2,
            protectionStartLevel: null,
            status: 'running',
            highestLevel: 1,
        }],
        persistentRevision: 9,
        selfRevision: 9,
        dirtyDomains: new Set(),
    };
    const playerRuntimeService = {
        getPlayerOrThrow() { return player; },
        getPlayer() { return player; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
        playerProgressionService: {
            refreshPreview() {},
        },
        playerAttributesService: {
            recalculate() {},
        },
    };
    const craftPanelRuntimeService = {
        tickEnhancement(targetPlayer) {
            targetPlayer.enhancementJob = {
                ...targetPlayer.enhancementJob,
                remainingTicks: 10,
                jobVersion: 7,
            };
            targetPlayer.selfRevision = 10;
            targetPlayer.persistentRevision = 10;
            targetPlayer.dirtyDomains = new Set(['active_job']);
            return {
                ok: true,
                panelChanged: true,
                inventoryChanged: false,
                equipmentChanged: false,
                attrChanged: false,
                groundDrops: [],
                messages: [{
                    text: '铁剑 强化过程中灵力稳定，继续灌注。',
                    kind: 'quest',
                }],
            };
        },
        tickTechniqueActivity(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.tickEnhancement(_player);
        },
        buildEnhancementPanelPayload() { return { ok: true }; },
        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildEnhancementPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return {
            emit(event, payload) { log.push(['emit', event, payload.ok]); },
        }; },
    }, {
        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeEnhancementService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
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
                assigned_node_id: '',
                ownership_epoch: 0,
            };
        },
    };
    service.tickEnhancement('player:1', player, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(durableCalls.length, 0);
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', 'instance_lease_context_missing:instance:1', 'warn'],
    ]);
    assert.equal(player.enhancementJob?.jobVersion, 6);
    assert.equal(player.enhancementJob?.remainingTicks, 11);
}
/**
 * testWorldRuntimeFacadeDispatchStartEnhancement：判断test世界运行态FacadeDispatch开始强化是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchStart强化相关状态。
 */


function testWorldRuntimeFacadeDispatchStartEnhancement() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchStartEnhancement：判断开始强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start强化相关状态。
 */

            dispatchStartEnhancement(playerId, payload, deps) {
                log.push(['dispatchStartEnhancement', playerId, payload, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchStartEnhancement.call(runtime, 'player:1', { slotIndex: 2 });
    assert.deepEqual(log, [
        ['dispatchStartEnhancement', 'player:1', { slotIndex: 2 }, true],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchCancelEnhancement：判断test世界运行态FacadeDispatchCancel强化是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchCancel强化相关状态。
 */


function testWorldRuntimeFacadeDispatchCancelEnhancement() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchCancelEnhancement：判断Cancel强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel强化相关状态。
 */

            dispatchCancelEnhancement(playerId, deps) {
                log.push(['dispatchCancelEnhancement', playerId, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchCancelEnhancement.call(runtime, 'player:1');
    assert.deepEqual(log, [
        ['dispatchCancelEnhancement', 'player:1', true],
    ]);
}

Promise.resolve()
    .then(() => testStartEnhancement())
    .then(() => {
        return testCancelEnhancement();
    })
    .then(() => {
        return testCompleteEnhancement();
    })
    .then(() => {
        return testUpdateEnhancementTick();
    })
    .then(() => {
        return testTickEnhancementSkipsDurableWithoutLease();
    })
    .then(() => {
        testWorldRuntimeFacadeDispatchStartEnhancement();
        testWorldRuntimeFacadeDispatchCancelEnhancement();
        console.log(JSON.stringify({ ok: true, case: 'world-runtime-enhancement' }, null, 2));
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
