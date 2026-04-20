// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldGatewayGuardHelper } = require("../network/world-gateway-guard.helper");
/**
 * testGuardHelper：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testGuardHelper() {
    const log = [];
    const gateway = {
        healthReadinessService: {        
        /**
 * build：构建并返回目标对象。
 * @returns 函数返回值。
 */

            build() {
                return { readiness: { ok: false, maintenance: { active: true } } };
            },
        },
        worldClientEventService: {        
        /**
 * emitError：执行核心业务逻辑。
 * @param client 参数说明。
 * @param code 参数说明。
 * @param message 参数说明。
 * @returns 函数返回值。
 */

            emitError(client, code, message) {
                log.push(['emitError', client.id, code, message]);
            },            
            /**
 * emitNotReady：执行核心业务逻辑。
 * @param client 参数说明。
 * @returns 函数返回值。
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
 * disconnect：执行核心业务逻辑。
 * @param force 参数说明。
 * @returns 函数返回值。
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
