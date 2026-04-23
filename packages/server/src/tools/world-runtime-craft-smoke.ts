// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeCraftInterruptService } = require("../runtime/world/world-runtime-craft-interrupt.service");
const { WorldRuntimeCraftTickService } = require("../runtime/world/world-runtime-craft-tick.service");
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
    service.interruptCraftForReason('player:1', { playerId: 'player:1', gatherJob: { remainingTicks: 2 } }, 'move', {    
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
    });
    assert.deepEqual(log, [
        ['interruptTechniqueActivity', 'player:1', 'alchemy', 'move'],
        ['flushCraftMutation', 'player:1', 'alchemy', 'alchemy中断'],
        ['interruptTechniqueActivity', 'player:1', 'enhancement', 'move'],
        ['flushCraftMutation', 'player:1', 'enhancement', 'enhancement中断'],
        ['interruptGather', 'player:1', 'move'],
        ['flushCraftMutation', 'player:1', 'gather', 'gather中断'],
    ]);
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
    .then(() => testAdvanceCraftJobs())
    .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-craft' }, null, 2));
});
