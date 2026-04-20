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
 * interruptEnhancement：执行interrupt强化相关逻辑。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新interrupt强化相关状态。
 */

        interruptEnhancement(player, reason) {
            log.push(['interruptEnhancement', player.playerId, reason]);
            return { ok: true, messages: [{ text: '强化中断', kind: 'info' }], panelChanged: true, groundDrops: [] };
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
    }, {    
    /**
 * interruptAlchemyForReason：执行interrupt炼丹ForReason相关逻辑。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新interrupt炼丹ForReason相关状态。
 */

        interruptAlchemyForReason(playerId, player, reason) {
            log.push(['interruptAlchemyForReason', playerId, player.playerId, reason]);
        },
    });
    service.interruptCraftForReason('player:1', { playerId: 'player:1' }, 'move', {    
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
    });
    assert.deepEqual(log, [
        ['interruptAlchemyForReason', 'player:1', 'player:1', 'move'],
        ['interruptEnhancement', 'player:1', 'move'],
        ['flushCraftMutation', 'player:1', 'enhancement', '强化中断'],
    ]);
}
/**
 * testAdvanceCraftJobs：执行testAdvance炼制Job相关逻辑。
 * @returns 无返回值，直接更新testAdvance炼制Job相关状态。
 */


function testAdvanceCraftJobs() {
    const log = [];
    const players = new Map([
        ['alchemy', { playerId: 'alchemy' }],
        ['enhancement', { playerId: 'enhancement' }],
        ['both', { playerId: 'both' }],
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
 * hasActiveAlchemyJob：判断激活炼丹Job是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成激活炼丹Job的条件判断。
 */

        hasActiveAlchemyJob(player) {
            return player.playerId === 'alchemy' || player.playerId === 'both';
        },        
        /**
 * hasActiveEnhancementJob：判断激活强化Job是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成激活强化Job的条件判断。
 */

        hasActiveEnhancementJob(player) {
            return player.playerId === 'enhancement' || player.playerId === 'both';
        },
    }, {    
    /**
 * tickEnhancement：执行tick强化相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新tick强化相关状态。
 */

        tickEnhancement(playerId) {
            log.push(['tickEnhancement', playerId]);
        },
    }, {    
    /**
 * interruptAlchemyForReason：执行interrupt炼丹ForReason相关逻辑。
 * @returns 无返回值，直接更新interrupt炼丹ForReason相关状态。
 */

        interruptAlchemyForReason() {
            log.push(['interruptAlchemyForReason']);
        },        
        /**
 * tickAlchemy：执行tick炼丹相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新tick炼丹相关状态。
 */

        tickAlchemy(playerId) {
            log.push(['tickAlchemy', playerId]);
        },
    });
    service.advanceCraftJobs(['alchemy', 'enhancement', 'both', 'missing'], {});
    assert.deepEqual(log, [
        ['tickAlchemy', 'alchemy'],
        ['tickEnhancement', 'enhancement'],
        ['tickAlchemy', 'both'],
        ['tickEnhancement', 'both'],
    ]);
}

testInterruptCraftForReason();
testAdvanceCraftJobs();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-craft' }, null, 2));
