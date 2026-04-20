// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeCraftInterruptService } = require("../runtime/world/world-runtime-craft-interrupt.service");
const { WorldRuntimeCraftTickService } = require("../runtime/world/world-runtime-craft-tick.service");
/**
 * testInterruptCraftForReason：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testInterruptCraftForReason() {
    const log = [];
    const service = new WorldRuntimeCraftInterruptService({    
    /**
 * interruptEnhancement：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 函数返回值。
 */

        interruptEnhancement(player, reason) {
            log.push(['interruptEnhancement', player.playerId, reason]);
            return { ok: true, messages: [{ text: '强化中断', kind: 'info' }], panelChanged: true, groundDrops: [] };
        },
    }, {    
    /**
 * flushCraftMutation：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param result 返回结果。
 * @param panel 参数说明。
 * @returns 函数返回值。
 */

        flushCraftMutation(playerId, result, panel) {
            log.push(['flushCraftMutation', playerId, panel, result.messages?.[0]?.text ?? null]);
        },
    }, {    
    /**
 * interruptAlchemyForReason：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 函数返回值。
 */

        interruptAlchemyForReason(playerId, player, reason) {
            log.push(['interruptAlchemyForReason', playerId, player.playerId, reason]);
        },
    });
    service.interruptCraftForReason('player:1', { playerId: 'player:1' }, 'move', {    
    /**
 * queuePlayerNotice：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        queuePlayerNotice() { },        
        /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow() {
            return {};
        },        
        /**
 * spawnGroundItem：执行核心业务逻辑。
 * @returns 函数返回值。
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
 * testAdvanceCraftJobs：执行核心业务逻辑。
 * @returns 函数返回值。
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
 * getPlayer：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayer(playerId) {
            return players.get(playerId) ?? null;
        },
    }, {    
    /**
 * hasActiveAlchemyJob：执行状态校验并返回判断结果。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

        hasActiveAlchemyJob(player) {
            return player.playerId === 'alchemy' || player.playerId === 'both';
        },        
        /**
 * hasActiveEnhancementJob：执行状态校验并返回判断结果。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

        hasActiveEnhancementJob(player) {
            return player.playerId === 'enhancement' || player.playerId === 'both';
        },
    }, {    
    /**
 * tickEnhancement：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        tickEnhancement(playerId) {
            log.push(['tickEnhancement', playerId]);
        },
    }, {    
    /**
 * interruptAlchemyForReason：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        interruptAlchemyForReason() {
            log.push(['interruptAlchemyForReason']);
        },        
        /**
 * tickAlchemy：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
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
