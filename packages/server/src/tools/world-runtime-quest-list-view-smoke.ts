// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeQuestQueryService } = require("../runtime/world/world-runtime-quest-query.service");
/**
 * createQuestQueryService：构建并返回目标对象。
 * @param log 参数说明。
 * @param quests 参数说明。
 * @returns 无返回值，直接更新任务Query服务相关状态。
 */


function createQuestQueryService(log, quests) {
    return new WorldRuntimeQuestQueryService({    
    /**
 * getItemName：读取道具名称。
 * @param itemId 道具 ID。
 * @returns 无返回值，完成道具名称的读取/组装。
 */

        getItemName(itemId) {
            return itemId;
        },        
        /**
 * getTechniqueName：读取功法名称。
 * @param techniqueId technique ID。
 * @returns 无返回值，完成功法名称的读取/组装。
 */

        getTechniqueName(techniqueId) {
            return techniqueId;
        },        
        /**
 * createItem：构建并返回目标对象。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 无返回值，直接更新道具相关状态。
 */

        createItem(itemId, count) {
            return { itemId, count };
        },
    }, {    
    /**
 * getQuestSource：读取任务来源。
 * @returns 无返回值，完成任务来源的读取/组装。
 */

        getQuestSource() {
            return null;
        },        
        /**
 * getNpcLocation：读取NPC位置。
 * @returns 无返回值，完成NPC位置的读取/组装。
 */

        getNpcLocation() {
            return null;
        },        
        /**
 * has：判断ha是否满足条件。
 * @returns 无返回值，完成结果的条件判断。
 */

        has() {
            return false;
        },        
        /**
 * getOrThrow：读取OrThrow。
 * @returns 无返回值，完成OrThrow的读取/组装。
 */

        getOrThrow() {
            return { name: 'ignored' };
        },
    }, {    
    /**
 * listQuests：读取任务并返回结果。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成任务的读取/组装。
 */

        listQuests(playerId) {
            log.push(['listQuests', playerId]);
            return quests.map((quest) => ({
                ...quest,
                rewards: Array.isArray(quest.rewards) ? quest.rewards.map((reward) => ({ ...reward })) : [],
            }));
        },        
        /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
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
 * testQuestQueryServiceBuildQuestListView：读取test任务Query服务Build任务列表视图并返回结果。
 * @returns 无返回值，直接更新test任务Query服务Build任务列表视图相关状态。
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
 * testWorldRuntimeFacadeBuildQuestListView：读取test世界运行态FacadeBuild任务列表视图并返回结果。
 * @returns 无返回值，直接更新test世界运行态FacadeBuild任务列表视图相关状态。
 */


function testWorldRuntimeFacadeBuildQuestListView() {
    const log = [];
    const runtime = {    
    /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'instance:1' };
        },        
        /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        worldRuntimeQuestQueryService: {        
        /**
 * buildQuestListView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新任务列表视图相关状态。
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
 * testQuestQueryServiceBuildNpcQuestsView：读取test任务Query服务BuildNPC任务视图并返回结果。
 * @returns 无返回值，直接更新test任务Query服务BuildNPC任务视图相关状态。
 */


function testQuestQueryServiceBuildNpcQuestsView() {
    const log = [];
    const service = createQuestQueryService(log, []);
    const view = service.buildNpcQuestsView('player:3', 'npc_a', {    
    /**
 * resolveAdjacentNpc：规范化或转换AdjacentNPC。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新AdjacentNPC相关状态。
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
 * testWorldRuntimeFacadeBuildNpcQuestsView：构建test世界运行态FacadeBuildNPC任务视图。
 * @returns 无返回值，直接更新test世界运行态FacadeBuildNPC任务视图相关状态。
 */


function testWorldRuntimeFacadeBuildNpcQuestsView() {
    const log = [];
    const runtime = {    
    /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'instance:2' };
        },        
        /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
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
 * @returns 无返回值，直接更新NPC任务视图相关状态。
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
