// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeQuestQueryService } = require("../runtime/world/world-runtime-quest-query.service");
/**
 * createQuestQueryService：构建并返回目标对象。
 * @param log 参数说明。
 * @param quests 参数说明。
 * @returns 函数返回值。
 */


function createQuestQueryService(log, quests) {
    return new WorldRuntimeQuestQueryService({    
    /**
 * getItemName：按给定条件读取/查询数据。
 * @param itemId 道具 ID。
 * @returns 函数返回值。
 */

        getItemName(itemId) {
            return itemId;
        },        
        /**
 * getTechniqueName：按给定条件读取/查询数据。
 * @param techniqueId technique ID。
 * @returns 函数返回值。
 */

        getTechniqueName(techniqueId) {
            return techniqueId;
        },        
        /**
 * createItem：构建并返回目标对象。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 函数返回值。
 */

        createItem(itemId, count) {
            return { itemId, count };
        },
    }, {    
    /**
 * getQuestSource：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getQuestSource() {
            return null;
        },        
        /**
 * getNpcLocation：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getNpcLocation() {
            return null;
        },        
        /**
 * has：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */

        has() {
            return false;
        },        
        /**
 * getOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getOrThrow() {
            return { name: 'ignored' };
        },
    }, {    
    /**
 * listQuests：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        listQuests(playerId) {
            log.push(['listQuests', playerId]);
            return quests.map((quest) => ({
                ...quest,
                rewards: Array.isArray(quest.rewards) ? quest.rewards.map((reward) => ({ ...reward })) : [],
            }));
        },        
        /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerOrThrow(playerId) {
            log.push(['getPlayerOrThrow', playerId]);
            return {
                quests: {
                    quests: [],
                },
            };
        },
    });
}
/**
 * testQuestQueryServiceBuildQuestListView：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testQuestQueryServiceBuildQuestListView() {
    const log = [];
    const quests = [{ id: 'quest:1', title: '云游初试', rewards: [{ itemId: 'stone', count: 1 }] }];
    const service = createQuestQueryService(log, quests);
    const view = service.buildQuestListView('player:1');
    assert.deepEqual(view, {
        quests: [{ id: 'quest:1', title: '云游初试', rewards: [{ itemId: 'stone', count: 1 }] }],
    });
    assert.notEqual(view.quests, quests);
    assert.notEqual(view.quests[0], quests[0]);
    assert.notEqual(view.quests[0].rewards, quests[0].rewards);
    assert.notEqual(view.quests[0].rewards[0], quests[0].rewards[0]);
    assert.deepEqual(log, [['listQuests', 'player:1']]);
}
/**
 * testWorldRuntimeFacadeBuildQuestListView：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testWorldRuntimeFacadeBuildQuestListView() {
    const log = [];
    const runtime = {    
    /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'instance:1' };
        },        
        /**
 * refreshQuestStates：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        worldRuntimeQuestQueryService: {        
        /**
 * buildQuestListView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            buildQuestListView(playerId) {
                log.push(['buildQuestListView', playerId]);
                return { quests: [{ id: 'quest:2', title: '归宗试炼', rewards: [] }] };
            },
        },
    };
    const view = WorldRuntimeService.prototype.buildQuestListView.call(runtime, 'player:2', {});
    assert.deepEqual(view, {
        quests: [{ id: 'quest:2', title: '归宗试炼', rewards: [] }],
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:2'],
        ['refreshQuestStates', 'player:2'],
        ['buildQuestListView', 'player:2'],
    ]);
}
/**
 * testQuestQueryServiceBuildNpcQuestsView：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testQuestQueryServiceBuildNpcQuestsView() {
    const log = [];
    const service = createQuestQueryService(log, []);
    const view = service.buildNpcQuestsView('player:3', 'npc_a', {    
    /**
 * resolveAdjacentNpc：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

        resolveAdjacentNpc(playerId, npcId) {
            log.push(['resolveAdjacentNpc', playerId, npcId]);
            return {
                npcId,
                name: '阿青',
                quests: [],
            };
        },
    });
    assert.deepEqual(view, {
        npcId: 'npc_a',
        npcName: '阿青',
        quests: [],
    });
    assert.deepEqual(log, [
        ['resolveAdjacentNpc', 'player:3', 'npc_a'],
        ['getPlayerOrThrow', 'player:3'],
    ]);
}
/**
 * testWorldRuntimeFacadeBuildNpcQuestsView：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testWorldRuntimeFacadeBuildNpcQuestsView() {
    const log = [];
    const runtime = {    
    /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'instance:2' };
        },        
        /**
 * refreshQuestStates：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        worldRuntimeQuestQueryService: {        
        /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

            buildNpcQuestsView(playerId, npcId, deps) {
                log.push(['buildNpcQuestsView', playerId, npcId, deps === runtime]);
                return { npcId, npcName: '阿青', quests: [] };
            },
        },
    };
    const view = WorldRuntimeService.prototype.buildNpcQuestsView.call(runtime, 'player:4', ' npc_a ');
    assert.deepEqual(view, {
        npcId: 'npc_a',
        npcName: '阿青',
        quests: [],
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:4'],
        ['refreshQuestStates', 'player:4'],
        ['buildNpcQuestsView', 'player:4', 'npc_a', true],
    ]);
    assert.throws(() => WorldRuntimeService.prototype.buildNpcQuestsView.call(runtime, 'player:4', '   '), /npcId is required/);
}

testQuestQueryServiceBuildQuestListView();
testWorldRuntimeFacadeBuildQuestListView();
testQuestQueryServiceBuildNpcQuestsView();
testWorldRuntimeFacadeBuildNpcQuestsView();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-quest-list-view' }, null, 2));
