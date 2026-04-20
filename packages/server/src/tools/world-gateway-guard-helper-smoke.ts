// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldGatewayGuardHelper } = require("../network/world-gateway-guard.helper");
/**
 * testGuardHelper：执行testGuard辅助函数相关逻辑。
 * @returns 无返回值，直接更新testGuard辅助函数相关状态。
 */


function testGuardHelper() {
    const log = [];
    const gateway = {
        healthReadinessService: {        
        /**
 * build：构建并返回目标对象。
 * @returns 无返回值，直接更新结果相关状态。
 */

            build() {
                return { readiness: { ok: false, maintenance: { active: true } } };
            },
        },
        worldClientEventService: {        
        /**
 * emitError：处理Error并更新相关状态。
 * @param client 参数说明。
 * @param code 参数说明。
 * @param message 参数说明。
 * @returns 无返回值，直接更新Error相关状态。
 */

            emitError(client, code, message) {
                log.push(['emitError', client.id, code, message]);
            },            
            /**
 * emitNotReady：读取NotReady并返回结果。
 * @param client 参数说明。
 * @returns 无返回值，直接更新NotReady相关状态。
 */

            emitNotReady(client) {
                log.push(['emitNotReady', client.id]);
            },
        },
    };
    const helper = new WorldGatewayGuardHelper(gateway);
    const client = {
        id: 'socket:1',
        data: {},        
        /**
 * disconnect：判断disconnect是否满足条件。
 * @param force 参数说明。
 * @returns 无返回值，直接更新disconnect相关状态。
 */

        disconnect(force) {
            log.push(['disconnect', force]);
        },
    };
    assert.equal(helper.requirePlayerId(client), null);
    client.data.playerId = 'player:1';
    assert.equal(helper.requirePlayerId(client), 'player:1');
    assert.equal(helper.requireGm(client), null);
    client.data.isGm = true;
    assert.equal(helper.requireGm(client), 'player:1');
    assert.equal(helper.rejectWhenNotReady(client), true);
    assert.deepEqual(log, [
        ['emitNotReady', 'socket:1'],
        ['emitError', 'socket:1', 'GM_FORBIDDEN', 'GM 权限不足'],
        ['emitError', 'socket:1', 'SERVER_BUSY', '数据库维护中，请稍后重连'],
        ['disconnect', true],
    ]);
}

testGuardHelper();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-guard-helper' }, null, 2));
