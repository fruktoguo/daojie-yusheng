// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeQuestStateService } = require("../runtime/world/world-runtime-quest-state.service");
/**
 * createService：构建并返回目标对象。
 * @param { player, progressMap = {}, readyMap = {}, createdQuest = null, log = [] } 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService({ player, progressMap = {}, readyMap = {}, rewardMap = {}, nextQuestMap = {}, chainGapMap = {}, questTemplateMap = {}, hydratedQuestMap = {}, acceptRealmReachedMap = {}, unlockedQuestMap = {}, createdQuest = null, log = [], mailLog = [] } = {}) {
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
        hydrateQuestRuntimeState(playerId, quest) {
            if (!Object.prototype.hasOwnProperty.call(hydratedQuestMap, quest.id)) {
                return quest;
            }
            const hydrated = {
                ...quest,
                ...hydratedQuestMap[quest.id],
                id: quest.id,
                status: quest.status,
                progress: quest.progress,
            };
            if (typeof quest.targetName === 'string'
                && quest.targetName.trim()
                && quest.targetName.trim() !== hydrated.targetMonsterId) {
                hydrated.targetName = quest.targetName.trim();
            }
            return {
                ...hydrated,
            };
        },
        isQuestUnlockedForPlayer(playerQuests, questId) {
            return Object.prototype.hasOwnProperty.call(unlockedQuestMap, questId)
                ? unlockedQuestMap[questId]
                : true;
        },
        isQuestAcceptRealmReachedForPlayer(player, questId) {
            return Object.prototype.hasOwnProperty.call(acceptRealmReachedMap, questId)
                ? acceptRealmReachedMap[questId]
                : true;
        },
        resolveQuestNextQuestId(quest) {
            return typeof quest.nextQuestId === 'string' && quest.nextQuestId.trim()
                ? quest.nextQuestId.trim()
                : Object.prototype.hasOwnProperty.call(nextQuestMap, quest.id)
                    ? nextQuestMap[quest.id]
                    : '';
        },
        resolveQuestChainGapToOwnedQuest(quest) {
            return Object.prototype.hasOwnProperty.call(chainGapMap, quest.id)
                ? {
                    ownedQuestId: chainGapMap[quest.id].ownedQuestId,
                    missingQuestIds: chainGapMap[quest.id].missingQuestIds.slice(),
                }
                : null;
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

            if (Object.prototype.hasOwnProperty.call(questTemplateMap, questId)) {
                return {
                    ...questTemplateMap[questId],
                    id: questId,
                    status,
                };
            }
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
        buildQuestRewardItems(quest) {
            return Object.prototype.hasOwnProperty.call(rewardMap, quest.id)
                ? rewardMap[quest.id].map((entry) => ({ ...entry }))
                : Array.isArray(quest.rewards)
                    ? quest.rewards.map((entry) => ({ ...entry }))
                    : [];
        },
    };
    const mailRuntimeService = {
        createDirectMail(playerId, input) {
            mailLog.push({ playerId, input });
            return Promise.resolve(`mail:${mailLog.length}`);
        },
    };
    return new WorldRuntimeQuestStateService(playerRuntimeService, worldRuntimeQuestQueryService, mailRuntimeService);
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

function testRefreshCompletesDanglingPreviousQuestWhenNextExists() {
    const log = [];
    const player = {
        quests: {
            quests: [
                {
                    id: 'intro-body-tempering',
                    status: 'ready',
                    progress: 1,
                    required: 1,
                    nextQuestId: 'wildlands-roadhouse',
                    rewardItemIds: [],
                    rewards: [],
                },
                {
                    id: 'wildlands-roadhouse',
                    status: 'completed',
                    progress: 1,
                    required: 1,
                    rewardItemIds: [],
                    rewards: [],
                },
            ],
        },
    };
    const service = createService({ player, log });
    service.refreshQuestStates('player:1');
    assert.deepEqual(player.quests.quests.map((quest) => ({ id: quest.id, status: quest.status, progress: quest.progress })), [
        { id: 'intro-body-tempering', status: 'completed', progress: 1 },
        { id: 'wildlands-roadhouse', status: 'completed', progress: 1 },
    ]);
    assert.deepEqual(log, [['markQuestStateDirty', 'player:1']]);
}

function testRefreshCompletesDanglingPreviousQuestFromCurrentTemplateNextQuest() {
    const log = [];
    const player = {
        quests: {
            quests: [
                {
                    id: 'chapter-one',
                    line: 'main',
                    status: 'active',
                    progress: 0,
                    required: 1,
                    rewardItemIds: [],
                    rewards: [],
                },
                {
                    id: 'chapter-two',
                    line: 'main',
                    status: 'active',
                    progress: 0,
                    required: 1,
                    rewardItemIds: [],
                    rewards: [],
                },
            ],
        },
    };
    const service = createService({
        player,
        nextQuestMap: { 'chapter-one': 'chapter-two' },
        log,
    });
    service.refreshQuestStates('player:1');
    assert.deepEqual(player.quests.quests.map((quest) => ({ id: quest.id, status: quest.status })), [
        { id: 'chapter-one', status: 'completed' },
        { id: 'chapter-two', status: 'active' },
    ]);
    assert.deepEqual(log, [['markQuestStateDirty', 'player:1']]);
}

function testRefreshSendsMergedCompensationMailForDanglingPreviousQuests() {
    const log = [];
    const mailLog = [];
    const player = {
        quests: {
            quests: [
                {
                    id: 'first-previous',
                    status: 'ready',
                    progress: 1,
                    required: 1,
                    nextQuestId: 'first-next',
                    rewards: [{ itemId: 'rat_tail', count: 2 }, { itemId: 'spirit_stone', count: 10 }],
                },
                {
                    id: 'first-next',
                    status: 'active',
                    progress: 0,
                    required: 1,
                    rewards: [],
                },
                {
                    id: 'second-previous',
                    status: 'active',
                    progress: 1,
                    required: 1,
                    nextQuestId: 'second-next',
                    rewards: [{ itemId: 'rat_tail', count: 3 }, { itemId: 'minor_qi_pill', count: 1 }],
                },
                {
                    id: 'second-next',
                    status: 'ready',
                    progress: 1,
                    required: 1,
                    rewards: [],
                },
            ],
        },
    };
    const service = createService({ player, log, mailLog });
    service.refreshQuestStates('player:1');
    assert.deepEqual(player.quests.quests.map((quest) => ({ id: quest.id, status: quest.status })), [
        { id: 'first-previous', status: 'completed' },
        { id: 'first-next', status: 'active' },
        { id: 'second-previous', status: 'completed' },
        { id: 'second-next', status: 'ready' },
    ]);
    assert.deepEqual(log, [['markQuestStateDirty', 'player:1']]);
    assert.equal(mailLog.length, 1);
    assert.equal(mailLog[0].playerId, 'player:1');
    assert.equal(mailLog[0].input.senderLabel, '司命台');
    assert.equal(mailLog[0].input.fallbackTitle, '任务奖励补发');
    assert.equal(mailLog[0].input.fallbackBody, '检测到历史任务进度已推进，现补发未领取的任务奖励。');
    assert.deepEqual(mailLog[0].input.attachments, [
        { itemId: 'rat_tail', count: 5 },
        { itemId: 'spirit_stone', count: 10 },
        { itemId: 'minor_qi_pill', count: 1 },
    ]);
}

function testRefreshCompletesAndCompensatesMissingQuestChainGap() {
    const log = [];
    const mailLog = [];
    const player = {
        quests: {
            quests: [
                {
                    id: 'chapter-2-1',
                    status: 'active',
                    progress: 0,
                    required: 1,
                    rewards: [{ itemId: 'stone', count: 1 }],
                },
                {
                    id: 'chapter-3-1',
                    status: 'active',
                    progress: 0,
                    required: 1,
                    rewards: [],
                },
            ],
        },
    };
    const service = createService({
        player,
        log,
        mailLog,
        chainGapMap: {
            'chapter-2-1': {
                ownedQuestId: 'chapter-3-1',
                missingQuestIds: ['chapter-2-2', 'chapter-2-3'],
            },
        },
        questTemplateMap: {
            'chapter-2-2': {
                title: '二章二',
                progress: 0,
                required: 1,
                rewards: [{ itemId: 'stone', count: 2 }],
            },
            'chapter-2-3': {
                title: '二章三',
                progress: 0,
                required: 1,
                rewards: [{ itemId: 'pill', count: 1 }],
            },
        },
    });
    service.refreshQuestStates('player:1');
    assert.deepEqual(player.quests.quests.map((quest) => ({ id: quest.id, status: quest.status, progress: quest.progress })), [
        { id: 'chapter-2-1', status: 'completed', progress: 1 },
        { id: 'chapter-2-2', status: 'completed', progress: 1 },
        { id: 'chapter-2-3', status: 'completed', progress: 1 },
        { id: 'chapter-3-1', status: 'active', progress: 0 },
    ]);
    assert.deepEqual(log, [['markQuestStateDirty', 'player:1']]);
    assert.equal(mailLog.length, 1);
    assert.deepEqual(mailLog[0].input.attachments, [
        { itemId: 'stone', count: 3 },
        { itemId: 'pill', count: 1 },
    ]);
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

function testTryAcceptNextQuestRejectsSecondMainQuest() {
    const log = [];
    const player = {
        quests: {
            quests: [{ id: 'current-main', line: 'main', status: 'active', progress: 0, required: 1 }],
        },
    };
    const service = createService({
        player,
        createdQuest: {
            line: 'main',
            title: '新的主线',
            progress: 0,
            required: 1,
            rewardItemIds: [],
            rewards: [],
        },
        log,
    });
    const accepted = service.tryAcceptNextQuest('player:1', 'next-main');
    assert.equal(accepted, null);
    assert.deepEqual(player.quests.quests.map((quest) => quest.id), ['current-main']);
    assert.deepEqual(log, []);
}

function testTryAcceptNextQuestRejectsInsufficientAcceptRealm() {
    const log = [];
    const player = {
        realm: { realmLv: 3 },
        quests: {
            quests: [{ id: 'current', status: 'completed', progress: 1, required: 1 }],
        },
    };
    const service = createService({
        player,
        acceptRealmReachedMap: { 'next-realm-gated': false },
        createdQuest: {
            line: 'main',
            title: '境界门槛任务',
            progress: 0,
            required: 1,
            rewardItemIds: [],
            rewards: [],
        },
        log,
    });
    const accepted = service.tryAcceptNextQuest('player:1', 'next-realm-gated');
    assert.equal(accepted, null);
    assert.deepEqual(player.quests.quests.map((quest) => quest.id), ['current']);
    assert.deepEqual(log, []);
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

function testAdvanceKillQuestProgressHydratesCorruptedRuntimeEntry() {
    const log = [];
    const player = {
        quests: {
            quests: [
                {
                    id: 'kill-rat',
                    line: 'side',
                    status: 'active',
                    objectiveType: 'kill',
                    targetMonsterId: '',
                    targetName: '',
                    progress: 0,
                    required: 1,
                    rewardItemIds: [],
                    rewards: [],
                },
            ],
        },
    };
    const service = createService({
        player,
        hydratedQuestMap: {
            'kill-rat': {
                line: 'main',
                objectiveType: 'kill',
                targetMonsterId: 'rat',
                required: 2,
                targetName: 'rat',
                acceptRealmLv: 4,
            },
        },
        progressMap: { 'kill-rat': 1 },
        readyMap: { 'kill-rat': false },
        log,
    });
    service.advanceKillQuestProgress('player:1', 'rat', '灰尾鼠');
    assert.deepEqual(player.quests.quests.map((quest) => ({
        id: quest.id,
        line: quest.line,
        objectiveType: quest.objectiveType,
        targetMonsterId: quest.targetMonsterId,
        targetName: quest.targetName,
        progress: quest.progress,
        required: quest.required,
        acceptRealmLv: quest.acceptRealmLv,
    })), [
        {
            id: 'kill-rat',
            line: 'main',
            objectiveType: 'kill',
            targetMonsterId: 'rat',
            targetName: '灰尾鼠',
            progress: 1,
            required: 2,
            acceptRealmLv: 4,
        },
    ]);
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

function testAdvanceLearnTechniqueQuestHydratesCorruptedRuntimeEntry() {
    const log = [];
    const player = {
        quests: {
            quests: [
                {
                    id: 'learn-fire',
                    line: 'side',
                    status: 'active',
                    objectiveType: 'kill',
                    targetMonsterId: '',
                    progress: 0,
                    required: 1,
                    rewardItemIds: [],
                    rewards: [],
                },
            ],
        },
    };
    const service = createService({
        player,
        hydratedQuestMap: {
            'learn-fire': {
                line: 'main',
                objectiveType: 'learn_technique',
                targetTechniqueId: 'technique.fire',
                required: 1,
            },
        },
        progressMap: { 'learn-fire': 1 },
        readyMap: { 'learn-fire': true },
        log,
    });
    service.advanceLearnTechniqueQuest('player:1', 'technique.fire');
    assert.deepEqual(player.quests.quests.map((quest) => ({
        id: quest.id,
        line: quest.line,
        objectiveType: quest.objectiveType,
        targetTechniqueId: quest.targetTechniqueId,
        progress: quest.progress,
        status: quest.status,
    })), [
        {
            id: 'learn-fire',
            line: 'main',
            objectiveType: 'learn_technique',
            targetTechniqueId: 'technique.fire',
            progress: 1,
            status: 'ready',
        },
    ]);
    assert.deepEqual(log, [['markQuestStateDirty', 'player:1']]);
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
testRefreshCompletesDanglingPreviousQuestWhenNextExists();
testRefreshCompletesDanglingPreviousQuestFromCurrentTemplateNextQuest();
testRefreshSendsMergedCompensationMailForDanglingPreviousQuests();
testRefreshCompletesAndCompensatesMissingQuestChainGap();
testTryAcceptNextQuest();
testTryAcceptNextQuestRejectsSecondMainQuest();
testTryAcceptNextQuestRejectsInsufficientAcceptRealm();
testAdvanceKillQuestProgress();
testAdvanceKillQuestProgressHydratesCorruptedRuntimeEntry();
testAdvanceLearnTechniqueQuest();
testAdvanceLearnTechniqueQuestHydratesCorruptedRuntimeEntry();
testCanReceiveRewardItems();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-quest-state' }, null, 2));
