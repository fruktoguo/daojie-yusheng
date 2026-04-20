// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeProgressionService } = require("../runtime/world/world-runtime-progression.service");
/**
 * testBreakthrough：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testBreakthrough() {
    const log = [];
    const service = new WorldRuntimeProgressionService({    
    /**
 * attemptBreakthrough：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param currentTick 参数说明。
 * @returns 函数返回值。
 */

        attemptBreakthrough(playerId, currentTick) {
            log.push(['attemptBreakthrough', playerId, currentTick]);
            return { ok: true };
        },
    });
    const result = service.dispatchBreakthrough('player:1', {    
    /**
 * resolveCurrentTickForPlayerId：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 resolveCurrentTickForPlayerId() { return 17; } });
    assert.deepEqual(log, [['attemptBreakthrough', 'player:1', 17]]);
    assert.deepEqual(result, { ok: true });
}
/**
 * testHeavenGateAction：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testHeavenGateAction() {
    const log = [];
    const service = new WorldRuntimeProgressionService({    
    /**
 * handleHeavenGateAction：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @param element 参数说明。
 * @param currentTick 参数说明。
 * @returns 函数返回值。
 */

        handleHeavenGateAction(playerId, action, element, currentTick) {
            log.push(['handleHeavenGateAction', playerId, action, element, currentTick]);
            return { ok: true };
        },
    });
    const result = service.dispatchHeavenGateAction('player:1', 'choose_gate', 'wood', {    
    /**
 * resolveCurrentTickForPlayerId：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 resolveCurrentTickForPlayerId() { return 23; } });
    assert.deepEqual(log, [['handleHeavenGateAction', 'player:1', 'choose_gate', 'wood', 23]]);
    assert.deepEqual(result, { ok: true });
}

testBreakthrough();
testHeavenGateAction();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-progression' }, null, 2));
