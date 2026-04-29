// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeQuestStateService } = require("../runtime/world/world-runtime-quest-state.service");
/**
 * createService：构建并返回目标对象。
 * @param { player, progressMap = {}, readyMap = {}, createdQuest = null, log = [] } 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService({ player, progressMap = {}, readyMap = {}, createdQuest = null, log = [] } = {}) {
    const playerRuntimeService = {    
    /**
 * getPlayer：读取玩家。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer() {
            return player ?? null;
        },        
        /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (!player) {
                throw new Error('player missing');
            }
            return player;
        },        
        /**
 * markQuestStateDirty：处理任务状态Dirty并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新任务状态Dirty相关状态。
 */

        markQuestStateDirty(playerId) {
            log.push(['markQuestStateDirty', playerId]);
        },
    };
    const worldRuntimeQuestQueryService = {    
    /**
 * resolveQuestProgress：规范化或转换任务进度。
 * @param playerId 玩家 ID。
 * @param quest 参数说明。
 * @returns 无返回值，直接更新任务进度相关状态。
 */

        resolveQuestProgress(playerId, quest) {
            return Object.prototype.hasOwnProperty.call(progressMap, quest.id)
                ? progressMap[quest.id]
                : quest.progress;
        },        
        /**
 * canQuestBecomeReady：读取任务BecomeReady并返回结果。
 * @param playerId 玩家 ID。
 * @param quest 参数说明。
 * @returns 无返回值，完成任务BecomeReady的条件判断。
 */

        canQuestBecomeReady(playerId, quest) {
            return Object.prototype.hasOwnProperty.call(readyMap, quest.id)
                ? readyMap[quest.id]
                : quest.progress >= quest.required;
        },        
        /**
 * createQuestStateFromSource：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param questId quest ID。
 * @param status 参数说明。
 * @returns 无返回值，直接更新任务状态From来源相关状态。
 */

        createQuestStateFromSource(playerId, questId, status) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (createdQuest) {
                return { ...createdQuest, id: questId, status };
            }
            return {
                id: questId,
                title: `quest:${questId}`,
                status,
                progress: 0,
                required: 1,
                rewardItemIds: [],
                rewards: [],
            };
        },
    };
    return new WorldRuntimeQuestStateService(playerRuntimeService, worldRuntimeQuestQueryService);
}
/**
 * testRefreshQuestStates：执行testRefresh任务状态相关逻辑。
 * @returns 无返回值，直接更新testRefresh任务状态相关状态。
 */


function testRefreshQuestStates() {
    const log = [];
    const player = {
        quests: {
            quests: [
                { id: 'kill-rat', status: 'active', progress: 0, required: 1, rewardItemIds: [], rewards: [] },
                { id: 'submit-herb', status: 'ready', progress: 1, required: 1, rewardItemIds: [], rewards: [] },
                { id: 'done', status: 'completed', progress: 1, required: 1, rewardItemIds: [], rewards: [] },
            ],
        },
    };
    const service = createService({
        player,
        progressMap: { 'kill-rat': 1, 'submit-herb': 0, done: 1 },
        readyMap: { 'kill-rat': true, 'submit-herb': false, done: true },
        log,
    });
    service.refreshQuestStates('player:1');
    assert.deepEqual(player.quests.quests.map((quest) => ({ id: quest.id, status: quest.status, progress: quest.progress })), [
        { id: 'kill-rat', status: 'ready', progress: 1 },
        { id: 'submit-herb', status: 'active', progress: 0 },
        { id: 'done', status: 'completed', progress: 1 },
    ]);
    assert.deepEqual(log, [['markQuestStateDirty', 'player:1']]);
}
/**
 * testTryAcceptNextQuest：执行testTryAcceptNext任务相关逻辑。
 * @returns 无返回值，直接更新testTryAcceptNext任务相关状态。
 */


function testTryAcceptNextQuest() {
    const log = [];
    const player = {
        quests: {
            quests: [{ id: 'current', status: 'completed', progress: 1, required: 1 }],
        },
    };
    const service = createService({
        player,
        createdQuest: {
            title: '新的任务',
            progress: 0,
            required: 1,
            rewardItemIds: [],
            rewards: [],
        },
        log,
    });
    const accepted = service.tryAcceptNextQuest('player:1', 'next-quest');
    assert.equal(player.quests.quests.length, 2);
    assert.equal(player.quests.quests[1].id, 'next-quest');
    assert.equal(accepted.id, 'next-quest');
    assert.notEqual(accepted, player.quests.quests[1]);
    assert.deepEqual(log, [['markQuestStateDirty', 'player:1']]);
    assert.equal(service.tryAcceptNextQuest('player:1', 'next-quest'), null);
    assert.equal(service.tryAcceptNextQuest('player:1', null), null);
}
/**
 * testAdvanceKillQuestProgress：执行testAdvanceKill任务进度相关逻辑。
 * @returns 无返回值，直接更新testAdvanceKill任务进度相关状态。
 */


function testAdvanceKillQuestProgress() {
    const log = [];
    const player = {
        quests: {
            quests: [
                {
                    id: 'kill-rat',
                    status: 'active',
                    objectiveType: 'kill',
                    targetMonsterId: 'rat',
                    targetName: 'rat',
                    progress: 0,
                    required: 2,
                    rewardItemIds: [],
                    rewards: [],
                },
            ],
        },
    };
    const service = createService({
        player,
        progressMap: { 'kill-rat': 1 },
        readyMap: { 'kill-rat': false },
        log,
    });
    service.advanceKillQuestProgress('player:1', 'rat', '灰尾鼠');
    assert.equal(player.quests.quests[0].progress, 1);
    assert.equal(player.quests.quests[0].targetName, '灰尾鼠');
    assert.deepEqual(log, [['markQuestStateDirty', 'player:1']]);
}
/**
 * testAdvanceLearnTechniqueQuest：执行testAdvanceLearn功法任务相关逻辑。
 * @returns 无返回值，直接更新testAdvanceLearn功法任务相关状态。
 */


function testAdvanceLearnTechniqueQuest() {
    const changedLog = [];
    const changedPlayer = {
        quests: {
            quests: [
                {
                    id: 'learn-technique',
                    status: 'active',
                    objectiveType: 'learn_technique',
                    targetTechniqueId: 'technique.scroll',
                    progress: 0,
                    required: 1,
                    rewardItemIds: [],
                    rewards: [],
                },
            ],
        },
    };
    const changedService = createService({
        player: changedPlayer,
        progressMap: { 'learn-technique': 1 },
        readyMap: { 'learn-technique': true },
        log: changedLog,
    });
    changedService.advanceLearnTechniqueQuest('player:1', 'technique.scroll');
    assert.equal(changedPlayer.quests.quests[0].status, 'ready');
    assert.deepEqual(changedLog, [['markQuestStateDirty', 'player:1']]);

    const unchangedLog = [];
    const unchangedPlayer = {
        quests: {
            quests: [
                {
                    id: 'learn-other',
                    status: 'active',
                    objectiveType: 'learn_technique',
                    targetTechniqueId: 'other',
                    progress: 0,
                    required: 1,
                    rewardItemIds: [],
                    rewards: [],
                },
            ],
        },
    };
    const unchangedService = createService({
        player: unchangedPlayer,
        progressMap: { 'learn-other': 0 },
        readyMap: { 'learn-other': false },
        log: unchangedLog,
    });
    unchangedService.advanceLearnTechniqueQuest('player:1', 'technique.scroll');
    assert.deepEqual(unchangedLog, []);
}
/**
 * testCanReceiveRewardItems：判断testCanReceiveReward道具是否满足条件。
 * @returns 无返回值，直接更新testCanReceiveReward道具相关状态。
 */


function testCanReceiveRewardItems() {
    const player = {
        inventory: {
            capacity: 3,
            items: [{ itemId: 'existing' }, { itemId: 'existing-2' }],
        },
    };
    const service = createService({ player });
    assert.equal(service.canReceiveRewardItems('player:1', [{ itemId: 'existing' }]), true);
    assert.equal(service.canReceiveRewardItems('player:1', [{ itemId: 'new-1' }]), true);
    assert.equal(service.canReceiveRewardItems('player:1', [{ itemId: 'new-1' }, { itemId: 'new-1' }]), true);
    assert.equal(service.canReceiveRewardItems('player:1', [{ itemId: 'new-1' }, { itemId: 'new-2' }]), false);
    assert.equal(service.canReceiveRewardItems('player:1', [{ itemId: 'spirit_stone' }]), true);
    assert.equal(service.canReceiveRewardItems('player:1', [{ itemId: 'new-1' }, { itemId: 'spirit_stone' }]), true);
}

testRefreshQuestStates();
testTryAcceptNextQuest();
testAdvanceKillQuestProgress();
testAdvanceLearnTechniqueQuest();
testCanReceiveRewardItems();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-quest-state' }, null, 2));
