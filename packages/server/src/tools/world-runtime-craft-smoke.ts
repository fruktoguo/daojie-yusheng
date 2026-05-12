// @ts-nocheck

const assert = require("node:assert/strict");

const { computeAlchemyAdjustedBrewTicks, computeCraftSkillExpGain } = require("@mud/shared");
const { CraftPanelRuntimeService } = require("../runtime/craft/craft-panel-runtime.service");
const { CraftPanelAlchemyQueryService } = require("../runtime/craft/craft-panel-alchemy-query.service");
const { CraftPanelEnhancementQueryService } = require("../runtime/craft/craft-panel-enhancement-query.service");
const { WorldRuntimeCraftInterruptService } = require("../runtime/world/world-runtime-craft-interrupt.service");
const { WorldRuntimeCraftTickService } = require("../runtime/world/world-runtime-craft-tick.service");

const TEST_REALM_EXP_MULTIPLIER = 1000;

function resolveTestRealmExpToNext(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    if (normalizedLevel === 1) {
        return 10 * TEST_REALM_EXP_MULTIPLIER;
    }
    if (normalizedLevel === 6) {
        return 30 * TEST_REALM_EXP_MULTIPLIER;
    }
    return Math.max(0, (10 + ((normalizedLevel - 1) * 2)) * TEST_REALM_EXP_MULTIPLIER);
}

function getTestRealmLevelEntry(level) {
    const realmLv = Math.max(1, Math.floor(Number(level) || 1));
    return {
        realmLv,
        expToNext: resolveTestRealmExpToNext(realmLv),
    };
}

function createCraftPanelRuntimeService(repository, playerRuntimeService = {}, playerDomainPersistenceService = {}) {
    return new CraftPanelRuntimeService(
        repository,
        playerRuntimeService,
        playerDomainPersistenceService,
        new CraftPanelAlchemyQueryService(),
        new CraftPanelEnhancementQueryService(repository),
    );
}
/**
 * testInterruptCraftForReason：执行testInterrupt炼制ForReason相关逻辑。
 * @returns 无返回值，直接更新testInterrupt炼制ForReason相关状态。
 */


function testInterruptCraftForReason() {
    const log = [];
    const service = new WorldRuntimeCraftInterruptService({    
    /**
 * listActiveTechniqueActivityKinds：读取当前激活的技艺活动键。
 * @returns 返回活动键列表。
 */

        listActiveTechniqueActivityKinds() {
            return ['alchemy', 'enhancement'];
        },        
        /**
 * interruptTechniqueActivity：统一派发技艺活动中断。
 * @param player 玩家对象。
 * @param kind 技艺键。
 * @param reason 参数说明。
 * @returns 返回统一 mutation。
 */

        interruptTechniqueActivity(player, kind, reason) {
            log.push(['interruptTechniqueActivity', player.playerId, kind, reason]);
            return { ok: true, messages: [{ text: `${kind}中断`, kind: 'info' }], panelChanged: true, groundDrops: [] };
        },
    }, {    
    /**
 * flushCraftMutation：执行刷新炼制Mutation相关逻辑。
 * @param playerId 玩家 ID。
 * @param result 返回结果。
 * @param panel 参数说明。
 * @returns 无返回值，直接更新flush炼制Mutation相关状态。
 */

        flushCraftMutation(playerId, result, panel) {
            log.push(['flushCraftMutation', playerId, panel, result.messages?.[0]?.text ?? null]);
        },
    });
    service.interruptCraftForReason('player:1', { playerId: 'player:1', gatherJob: { remainingTicks: 2 }, buildingJob: { remainingTicks: 3 } }, 'move', {
    /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice() { },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow() {
            return {};
        },        
        /**
 * spawnGroundItem：执行spawn地面道具相关逻辑。
 * @returns 无返回值，直接更新spawnGround道具相关状态。
 */

        spawnGroundItem() { },
        worldRuntimeLootContainerService: {
            interruptGather(playerId, _player, reason) {
                log.push(['interruptGather', playerId, reason]);
                return { ok: true, messages: [{ text: 'gather中断', kind: 'info' }], panelChanged: false, groundDrops: [] };
            },
        },
        interruptBuildingConstruction(playerId, reason) {
            log.push(['interruptBuildingConstruction', playerId, reason]);
        },
    });
    assert.deepEqual(log, [
        ['interruptTechniqueActivity', 'player:1', 'alchemy', 'move'],
        ['flushCraftMutation', 'player:1', 'alchemy', 'alchemy中断'],
        ['interruptTechniqueActivity', 'player:1', 'enhancement', 'move'],
        ['flushCraftMutation', 'player:1', 'enhancement', 'enhancement中断'],
        ['interruptGather', 'player:1', 'move'],
        ['flushCraftMutation', 'player:1', 'gather', 'gather中断'],
        ['interruptBuildingConstruction', 'player:1', 'move'],
    ]);
}

function testInterruptCraftSkipsDuringDurableCommitWindow() {
    const log = [];
    const service = new WorldRuntimeCraftInterruptService({
        listActiveTechniqueActivityKinds() {
            log.push(['listActiveTechniqueActivityKinds']);
            return ['enhancement'];
        },
        interruptTechniqueActivity() {
            log.push(['interruptTechniqueActivity']);
            return { ok: true, messages: [], panelChanged: true, groundDrops: [] };
        },
    }, {
        flushCraftMutation() {
            log.push(['flushCraftMutation']);
        },
    });
    service.interruptCraftForReason(
        'player:1',
        {
            playerId: 'player:1',
            suppressImmediateDomainPersistence: true,
            gatherJob: { remainingTicks: 2 },
            buildingJob: { remainingTicks: 3 },
        },
        'move',
        {
            worldRuntimeLootContainerService: {
                interruptGather() {
                    log.push(['interruptGather']);
                    return { ok: true, messages: [], panelChanged: false, groundDrops: [] };
                },
            },
            interruptBuildingConstruction() {
                log.push(['interruptBuildingConstruction']);
            },
        },
    );
    assert.deepEqual(log, []);
}

function testShortCraftSkillExpGain() {
    const expToNextByLevel = resolveTestRealmExpToNext;
    const lowTickAlchemyGain = computeCraftSkillExpGain({
        skillLevel: 1,
        targetLevel: 1,
        baseActionTicks: 12,
        getExpToNextByLevel: expToNextByLevel,
        successCount: 1,
        failureCount: 0,
        successMultiplier: 1,
    });
    assert.equal(lowTickAlchemyGain.finalGain, 167);
    const lowTickEnhancementGain = computeCraftSkillExpGain({
        skillLevel: 6,
        targetLevel: 6,
        baseActionTicks: 5,
        getExpToNextByLevel: expToNextByLevel,
        successCount: 1,
        failureCount: 0,
        successMultiplier: 1,
    });
    assert.equal(lowTickEnhancementGain.finalGain, 127);
}

function testAlchemyBatchTicksDoNotScaleWithFurnaceOutputCount() {
    const exactRecipe = {
        fullPower: 1,
        ingredients: [{ itemId: 'herb', count: 1, role: 'main' }],
    };
    assert.equal(computeAlchemyAdjustedBrewTicks(12, exactRecipe, exactRecipe.ingredients, 1, 1, 0, 6), 12);
}

function testForgingStartsSingleOutputBatch() {
    const service = createCraftPanelRuntimeService({
        getItemName() { return null; },
    }, {
        playerProgressionService: {
            refreshPreview() {},
            getRealmLevelEntry: getTestRealmLevelEntry,
        },
        markPersistenceDirtyDomains() {},
        bumpPersistentRevision(player) {
            player.persistentRevision = Math.max(0, Number(player.persistentRevision) || 0) + 1;
        },
    }, {
        isEnabled() {
            return false;
        },
    }, {
        canAffordWallet() {
            return true;
        },
        debitWallet() {},
    });
    service.forgingCatalog = [{
        recipeId: 'forging.copper_tool',
        outputItemId: 'equip.copper_forging_tool',
        outputName: '铜炼器钳',
        outputLevel: 1,
        outputCount: 1,
        category: 'special',
        baseBrewTicks: 10,
        ingredients: [],
    }];
    const player = {
        playerId: 'player:forging-start',
        persistentRevision: 1,
        inventory: { revision: 1, capacity: 20, items: [] },
        alchemySkill: { level: 1, exp: 0, expToNext: resolveTestRealmExpToNext(1) },
        forgingSkill: { level: 1, exp: 0, expToNext: resolveTestRealmExpToNext(1) },
        gatherSkill: { level: 1, exp: 0, expToNext: resolveTestRealmExpToNext(1) },
        enhancementSkill: { level: 1, exp: 0, expToNext: resolveTestRealmExpToNext(1) },
        enhancementSkillLevel: 1,
        alchemyPresets: [],
        enhancementRecords: [],
        enhancementJob: null,
        alchemyJob: null,
        forgingJob: null,
    };
    const result = service.startTechniqueActivity(player, 'forging', {
        recipeId: 'forging.copper_tool',
        ingredients: [],
        quantity: 1,
    });
    assert.equal(result.ok, true);
    assert.equal(player.alchemyJob, null);
    assert.equal(player.forgingJob?.jobType, 'forging');
    assert.equal(player.forgingJob?.outputCount, 1);
    assert.equal(player.forgingJob?.batchBrewTicks, 10);
    assert.equal(player.forgingJob?.totalTicks, 20);
    const panelPayload = service.buildForgingPanelPayload(player);
    assert.equal(panelPayload.state.job?.jobType, 'forging');
    assert.equal(panelPayload.state.job?.jobRunId, player.forgingJob.jobRunId);
}

function testToolSlotsAreNoLongerLockedByCraftJobs() {
    const service = createCraftPanelRuntimeService({
        getItemName() { return null; },
    }, {}, {}, {}, {});
    const alchemyPlayer = {
        alchemyJob: { remainingTicks: 5, jobType: 'alchemy' },
        enhancementJob: null,
        equipment: {
            slots: [{
                slot: 'weapon',
                item: { itemId: 'equip.copper_pill_furnace', tags: ['alchemy_furnace'] },
            }],
        },
    };
    assert.equal(service.blocksEquipSlotChange(alchemyPlayer, 'weapon'), false);
    assert.equal(service.getLockedSlotReason(alchemyPlayer, 'weapon'), null);
    const enhancementPlayer = {
        alchemyJob: null,
        enhancementJob: {
            remainingTicks: 5,
            target: { source: 'equipment', slot: 'armor' },
            targetItemName: '铁甲',
        },
        equipment: {
            slots: [{
                slot: 'weapon',
                item: { itemId: 'equip.copper_enhancement_hammer', tags: ['enhancement_hammer'] },
            }, {
                slot: 'armor',
                item: { itemId: 'armor_iron', name: '铁甲' },
            }],
        },
    };
    assert.equal(service.blocksEquipSlotChange(enhancementPlayer, 'weapon'), false);
    assert.equal(service.getLockedSlotReason(enhancementPlayer, 'weapon'), null);
    assert.equal(service.blocksEquipSlotChange(enhancementPlayer, 'armor'), true);
    assert.equal(service.getLockedSlotReason(enhancementPlayer, 'armor'), '铁甲 强化进行中，暂时不能更换对应装备槽。');
}

async function testAlchemyLikeFinalTickOnlyPersistsClearedActiveJob() {
    const persistedActiveJobs = [];
    const dirtyDomains = [];
    const service = createCraftPanelRuntimeService({
        getItemName(itemId) {
            return itemId === 'equip.copper_forging_tool' ? '铜炼器钳' : null;
        },
        normalizeItem(item) {
            return {
                itemId: item.itemId,
                name: item.itemId === 'equip.copper_forging_tool' ? '铜炼器钳' : item.itemId,
                count: Math.max(1, Math.floor(Number(item.count) || 1)),
            };
        },
    }, {
        playerProgressionService: {
            refreshPreview() {},
            getRealmLevelEntry: getTestRealmLevelEntry,
        },
        playerAttributesService: {
            recalculate() {},
        },
        rebuildActionState() {},
        markPersistenceDirtyDomains(_player, domains) {
            dirtyDomains.push([...domains]);
        },
        bumpPersistentRevision(player) {
            player.persistentRevision = Math.max(0, Number(player.persistentRevision) || 0) + 1;
        },
    }, {
        isEnabled() {
            return true;
        },
        async savePlayerActiveJob(_playerId, activeJob) {
            persistedActiveJobs.push(activeJob ? { ...activeJob } : null);
        },
    });
    service.forgingCatalog = [{
        recipeId: 'forging:copper_tool',
        outputItemId: 'equip.copper_forging_tool',
        outputName: '铜炼器钳',
        outputLevel: 1,
        outputCount: 1,
        category: 'special',
        baseBrewTicks: 10,
        ingredients: [],
    }];
    const player = {
        playerId: 'player:forging',
        persistentRevision: 1,
        inventory: {
            revision: 1,
            capacity: 20,
            items: [],
        },
        alchemySkill: {
            level: 1,
            exp: 0,
            expToNext: resolveTestRealmExpToNext(1),
        },
        forgingSkill: {
            level: 1,
            exp: 0,
            expToNext: resolveTestRealmExpToNext(1),
        },
        gatherSkill: {
            level: 1,
            exp: 0,
            expToNext: resolveTestRealmExpToNext(1),
        },
        enhancementSkill: {
            level: 1,
            exp: 0,
            expToNext: resolveTestRealmExpToNext(1),
        },
        enhancementSkillLevel: 1,
        alchemyPresets: [],
        enhancementRecords: [],
        enhancementJob: null,
        alchemyJob: null,
        forgingJob: {
            jobRunId: 'job:forging:final',
            jobType: 'forging',
            jobVersion: 5,
            recipeId: 'forging:copper_tool',
            outputItemId: 'equip.copper_forging_tool',
            outputCount: 1,
            quantity: 1,
            completedCount: 0,
            successCount: 0,
            failureCount: 0,
            ingredients: [],
            phase: 'brewing',
            preparationTicks: 0,
            batchBrewTicks: 5,
            currentBatchRemainingTicks: 1,
            pausedTicks: 0,
            spiritStoneCost: 0,
            totalTicks: 5,
            remainingTicks: 1,
            successRate: 1,
            exactRecipe: true,
            outputLevel: 1,
            baseBrewTicks: 10,
            startedAt: 100,
            queuedJobs: [],
        },
    };
    const result = service.tickTechniqueActivity(player, 'forging');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.ok, true);
    assert.equal(player.alchemyJob, null);
    assert.equal(player.forgingJob, null);
    assert.equal(player.inventory.items[0]?.itemId, 'equip.copper_forging_tool');
    assert.equal(player.inventory.items[0]?.count, 1);
    assert.equal(player.forgingSkill.exp, 139);
    assert.deepEqual(persistedActiveJobs, [null]);
    assert.equal(dirtyDomains.some((domains) => domains.includes('active_job')), true);
    assert.equal(dirtyDomains.some((domains) => domains.includes('profession')), true);
}

async function testCompletedAlchemyLikeJobIsClearedOnEnsure() {
    const persistedActiveJobs = [];
    const service = createCraftPanelRuntimeService({
        getItemName() { return null; },
        normalizeItem(item) { return item; },
    }, {
        playerProgressionService: {
            refreshPreview() {},
            getRealmLevelEntry: getTestRealmLevelEntry,
        },
        markPersistenceDirtyDomains() {},
        bumpPersistentRevision(player) {
            player.persistentRevision = Math.max(0, Number(player.persistentRevision) || 0) + 1;
        },
    }, {
        isEnabled() {
            return true;
        },
        async savePlayerActiveJob(_playerId, activeJob) {
            persistedActiveJobs.push(activeJob ? { ...activeJob } : null);
        },
    });
    const player = {
        playerId: 'player:stale-forging',
        persistentRevision: 1,
        alchemySkill: { level: 1, exp: 0, expToNext: resolveTestRealmExpToNext(1) },
        forgingSkill: { level: 1, exp: 0, expToNext: resolveTestRealmExpToNext(1) },
        gatherSkill: { level: 1, exp: 0, expToNext: resolveTestRealmExpToNext(1) },
        enhancementSkill: { level: 1, exp: 0, expToNext: resolveTestRealmExpToNext(1) },
        enhancementSkillLevel: 1,
        alchemyPresets: [],
        enhancementRecords: [],
        enhancementJob: null,
        alchemyJob: null,
        forgingJob: {
            jobRunId: 'job:forging:stale',
            jobType: 'forging',
            recipeId: 'forging:copper_tool',
            outputItemId: 'equip.copper_forging_tool',
            outputCount: 6,
            quantity: 1,
            completedCount: 1,
            successCount: 6,
            failureCount: 0,
            ingredients: [],
            phase: 'brewing',
            preparationTicks: 0,
            batchBrewTicks: 1,
            currentBatchRemainingTicks: 0,
            pausedTicks: 0,
            spiritStoneCost: 0,
            totalTicks: 1,
            remainingTicks: 0,
            successRate: 1,
            exactRecipe: true,
            startedAt: 100,
        },
    };
    service.ensureCraftSkills(player);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(player.alchemyJob, null);
    assert.equal(player.forgingJob, null);
    assert.deepEqual(persistedActiveJobs, [null]);
}
/**
 * testAdvanceCraftJobs：执行testAdvance炼制Job相关逻辑。
 * @returns 无返回值，直接更新testAdvance炼制Job相关状态。
 */


async function testAdvanceCraftJobs() {
    const log = [];
    const players = new Map([
        ['alchemy', { playerId: 'alchemy' }],
        ['enhancement', { playerId: 'enhancement' }],
        ['both', { playerId: 'both' }],
        ['gather', { playerId: 'gather', gatherJob: { remainingTicks: 2 } }],
    ]);
    const service = new WorldRuntimeCraftTickService({    
    /**
 * getPlayer：读取玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer(playerId) {
            return players.get(playerId) ?? null;
        },
    }, {    
    /**
 * listActiveTechniqueActivityKinds：读取当前激活的技艺活动键。
 * @param player 玩家对象。
 * @returns 返回活动键列表。
 */

        listActiveTechniqueActivityKinds(player) {
            if (player.playerId === 'alchemy') {
                return ['alchemy'];
            }
            if (player.playerId === 'enhancement') {
                return ['enhancement'];
            }
            if (player.playerId === 'both') {
                return ['alchemy', 'enhancement'];
            }
            return [];
        },        
        hasAnyActiveTechniqueActivity(player) {
            return this.listActiveTechniqueActivityKinds(player).length > 0;
        },
        /**
 * tickTechniqueActivity：统一推进技艺活动。
 * @param player 玩家对象。
 * @param kind 技艺键。
 * @returns 返回统一 mutation。
 */

        tickTechniqueActivity(player, kind) {
            log.push(['tickTechniqueActivity', player.playerId, kind]);
            return { ok: true, messages: [{ text: `${kind} tick`, kind: 'info' }], panelChanged: false, groundDrops: [] };
        },
    }, {    
    /**
 * flushCraftMutation：统一刷新技艺活动 mutation。
 * @param playerId 玩家 ID。
 * @param result 返回结果。
 * @param panel 技艺键。
 * @returns 无返回值。
 */

        flushCraftMutation(playerId, result, panel) {
            log.push(['flushCraftMutation', playerId, panel, result.messages?.[0]?.text ?? null]);
        },
    }, {
        tickAlchemy(playerId, player) {
            log.push(['tickAlchemy', playerId, player.playerId]);
        },
    }, {
        tickEnhancement(playerId, player) {
            log.push(['tickEnhancement', playerId, player.playerId]);
        },
    });
    await service.advanceCraftJobs(['alchemy', 'enhancement', 'both', 'gather', 'missing'], {
        worldRuntimeLootContainerService: {
            tickGather(playerId) {
                log.push(['tickGather', playerId]);
                return { ok: true, messages: [{ text: 'gather tick', kind: 'info' }], panelChanged: false, groundDrops: [] };
            },
        },
    });
    assert.deepEqual(log, [
        ['tickAlchemy', 'alchemy', 'alchemy'],
        ['tickEnhancement', 'enhancement', 'enhancement'],
        ['tickAlchemy', 'both', 'both'],
        ['tickEnhancement', 'both', 'both'],
        ['tickGather', 'gather'],
        ['flushCraftMutation', 'gather', 'gather', 'gather tick'],
    ]);
}

Promise.resolve()
    .then(() => {
    testInterruptCraftForReason();
})
    .then(() => {
    testInterruptCraftSkipsDuringDurableCommitWindow();
})
    .then(() => {
    testShortCraftSkillExpGain();
})
.then(() => {
    testAlchemyBatchTicksDoNotScaleWithFurnaceOutputCount();
})
.then(() => {
    testForgingStartsSingleOutputBatch();
})
    .then(() => {
    testToolSlotsAreNoLongerLockedByCraftJobs();
})
.then(() => testAlchemyLikeFinalTickOnlyPersistsClearedActiveJob())
.then(() => testCompletedAlchemyLikeJobIsClearedOnEnsure())
.then(() => testAdvanceCraftJobs())
.then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-craft' }, null, 2));
});
