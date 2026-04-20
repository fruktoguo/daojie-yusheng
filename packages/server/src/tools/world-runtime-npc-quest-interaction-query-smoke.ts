// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeNpcQuestInteractionQueryService } = require("../runtime/world/world-runtime-npc-quest-interaction-query.service");
/**
 * createService：构建并返回目标对象。
 * @param player 玩家对象。
 * @param collectNpcQuestViews 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(player, collectNpcQuestViews) {
    return new WorldRuntimeNpcQuestInteractionQueryService({
        collectNpcQuestViews,
    }, {    
    /**
 * getPlayer：读取玩家。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer() {
            return player;
        },
    });
}
/**
 * testResolveNpcQuestMarkerReady：读取testResolveNPC任务MarkerReady并返回结果。
 * @returns 无返回值，直接更新testResolveNPC任务MarkerReady相关状态。
 */


function testResolveNpcQuestMarkerReady() {
    const service = createService({
        templateId: 'map_a',
        quests: {
            quests: [{ status: 'ready', submitNpcId: 'npc_a', submitMapId: 'map_a', line: 'main' }],
        },
    }, () => {
        throw new Error('should not collect npc quests for ready');
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {    
    /**
 * getNpcForPlayerMap：读取NPCFor玩家地图。
 * @returns 无返回值，完成NPCFor玩家地图的读取/组装。
 */

        getNpcForPlayerMap() {
            throw new Error('should not read npc for ready');
        },
    });
    assert.deepEqual(marker, { line: 'main', state: 'ready' });
}
/**
 * testResolveNpcQuestMarkerActive：规范化或转换testResolveNPC任务Marker激活。
 * @returns 无返回值，直接更新testResolveNPC任务Marker激活相关状态。
 */


function testResolveNpcQuestMarkerActive() {
    const service = createService({
        templateId: 'map_a',
        quests: {
            quests: [{ status: 'active', objectiveType: 'talk', targetNpcId: 'npc_a', targetMapId: 'map_a', line: 'branch' }],
        },
    }, () => {
        throw new Error('should not collect npc quests for active');
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {    
    /**
 * getNpcForPlayerMap：读取NPCFor玩家地图。
 * @returns 无返回值，完成NPCFor玩家地图的读取/组装。
 */

        getNpcForPlayerMap() {
            throw new Error('should not read npc for active');
        },
    });
    assert.deepEqual(marker, { line: 'branch', state: 'active' });
}
/**
 * testResolveNpcQuestMarkerAvailable：规范化或转换testResolveNPC任务MarkerAvailable。
 * @returns 无返回值，直接更新testResolveNPC任务MarkerAvailable相关状态。
 */


function testResolveNpcQuestMarkerAvailable() {
    const log = [];
    const npc = { npcId: 'npc_a', name: '阿青', quests: [] };
    const service = createService({
        templateId: 'map_a',
        quests: {
            quests: [],
        },
    }, (playerId, receivedNpc) => {
        log.push(['collectNpcQuestViews', playerId, receivedNpc.npcId]);
        return [{ status: 'available', line: 'side' }];
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {    
    /**
 * getNpcForPlayerMap：读取NPCFor玩家地图。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，完成NPCFor玩家地图的读取/组装。
 */

        getNpcForPlayerMap(playerId, npcId) {
            log.push(['getNpcForPlayerMap', playerId, npcId]);
            return npc;
        },
    });
    assert.deepEqual(marker, { line: 'side', state: 'available' });
    assert.deepEqual(log, [
        ['getNpcForPlayerMap', 'player:1', 'npc_a'],
        ['collectNpcQuestViews', 'player:1', 'npc_a'],
    ]);
}
/**
 * testResolveNpcQuestMarkerReturnsUndefinedWithoutPlayer：规范化或转换testResolveNPC任务MarkerReturnUndefinedWithout玩家。
 * @returns 无返回值，直接更新testResolveNPC任务MarkerReturnUndefinedWithout玩家相关状态。
 */


function testResolveNpcQuestMarkerReturnsUndefinedWithoutPlayer() {
    const service = createService(null, () => {
        throw new Error('should not collect without player');
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {    
    /**
 * getNpcForPlayerMap：读取NPCFor玩家地图。
 * @returns 无返回值，完成NPCFor玩家地图的读取/组装。
 */

        getNpcForPlayerMap() {
            throw new Error('should not read npc without player');
        },
    });
    assert.equal(marker, undefined);
}
/**
 * testResolveNpcQuestMarkerReturnsUndefinedWithoutNpc：规范化或转换testResolveNPC任务MarkerReturnUndefinedWithoutNPC。
 * @returns 无返回值，直接更新testResolveNPC任务MarkerReturnUndefinedWithoutNPC相关状态。
 */


function testResolveNpcQuestMarkerReturnsUndefinedWithoutNpc() {
    const service = createService({
        templateId: 'map_a',
        quests: {
            quests: [],
        },
    }, () => {
        throw new Error('should not collect npc quests without npc');
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {    
    /**
 * getNpcForPlayerMap：读取NPCFor玩家地图。
 * @returns 无返回值，完成NPCFor玩家地图的读取/组装。
 */

        getNpcForPlayerMap() {
            return null;
        },
    });
    assert.equal(marker, undefined);
}

testResolveNpcQuestMarkerReady();
testResolveNpcQuestMarkerActive();
testResolveNpcQuestMarkerAvailable();
testResolveNpcQuestMarkerReturnsUndefinedWithoutPlayer();
testResolveNpcQuestMarkerReturnsUndefinedWithoutNpc();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-npc-quest-interaction-query' }, null, 2));
