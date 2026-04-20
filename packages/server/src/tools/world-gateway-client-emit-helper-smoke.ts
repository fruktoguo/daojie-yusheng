// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldGatewayClientEmitHelper } = require("../network/world-gateway-client-emit.helper");
/**
 * createGateway：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createGateway(log = []) {
    return {
        gatewaySessionStateHelper: {        
        /**
 * getMarketSubscribers：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getMarketSubscribers() {
                return new Set(['player:1']);
            },            
            /**
 * getMarketListingRequests：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getMarketListingRequests() {
                return new Map([['player:1', 2]]);
            },            
            /**
 * getMarketTradeHistoryRequests：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getMarketTradeHistoryRequests() {
                return new Map([['player:1', 3]]);
            },
        },
        worldClientEventService: {        
        /**
 * markProtocol：执行核心业务逻辑。
 * @param client 参数说明。
 * @param protocol 参数说明。
 * @returns 函数返回值。
 */

            markProtocol(client, protocol) {
                log.push(['markProtocol', client.id, protocol]);
            },            
            /**
 * emitQuests：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

            emitQuests(client, payload) {
                log.push(['emitQuests', client.id, payload]);
            },            
            /**
 * emitMailSummary：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

            emitMailSummary(client, payload) {
                log.push(['emitMailSummary', client.id, payload]);
            },            
            /**
 * emitMailSummaryForPlayer：执行核心业务逻辑。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            emitMailSummaryForPlayer(client, playerId) {
                log.push(['emitMailSummaryForPlayer', client.id, playerId]);
                return Promise.resolve();
            },            
            /**
 * emitNpcShop：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

            emitNpcShop(client, payload) {
                log.push(['emitNpcShop', client.id, payload]);
            },            
            /**
 * flushMarketResult：执行核心业务逻辑。
 * @param subscribers 参数说明。
 * @param result 返回结果。
 * @param options 选项参数。
 * @returns 函数返回值。
 */

            flushMarketResult(subscribers, result, options) {
                log.push(['flushMarketResult', Array.from(subscribers), result, options.marketListingRequests.get('player:1'), options.marketTradeHistoryRequests.get('player:1')]);
            },            
            /**
 * broadcastSuggestionUpdate：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            broadcastSuggestionUpdate() {
                log.push(['broadcastSuggestionUpdate']);
            },
        },
    };
}
/**
 * testClientEmitHelper：执行核心业务逻辑。
 * @returns 函数返回值。
 */


async function testClientEmitHelper() {
    const log = [];
    const gateway = createGateway(log);
    const helper = new WorldGatewayClientEmitHelper(gateway);
    const client = { id: 'socket:1' };
    helper.emitNextQuests(client, { quests: [] });
    helper.emitNextMailSummary(client, { unread: 2 });
    helper.emitNextNpcShop(client, { npcId: 'npc.a' });
    helper.flushMarketResult({ ok: true });
    await helper.emitNextMailSummaryForPlayer(client, 'player:1');
    helper.broadcastSuggestions();
    assert.deepEqual(log, [
        ['markProtocol', 'socket:1', 'next'],
        ['emitQuests', 'socket:1', { quests: [] }],
        ['markProtocol', 'socket:1', 'next'],
        ['emitMailSummary', 'socket:1', { unread: 2 }],
        ['markProtocol', 'socket:1', 'next'],
        ['emitNpcShop', 'socket:1', { npcId: 'npc.a' }],
        ['flushMarketResult', ['player:1'], { ok: true }, 2, 3],
        ['markProtocol', 'socket:1', 'next'],
        ['emitMailSummaryForPlayer', 'socket:1', 'player:1'],
        ['broadcastSuggestionUpdate'],
    ]);
}

testClientEmitHelper()
    .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-gateway-client-emit-helper' }, null, 2));
})
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
