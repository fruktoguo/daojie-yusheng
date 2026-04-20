// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldGatewayClientEmitHelper } = require("../network/world-gateway-client-emit.helper");
/**
 * createGateway：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Gateway相关状态。
 */


function createGateway(log = []) {
    return {
        gatewaySessionStateHelper: {        
        /**
 * getMarketSubscribers：读取坊市Subscriber。
 * @returns 无返回值，完成坊市Subscriber的读取/组装。
 */

            getMarketSubscribers() {
                return new Set(['player:1']);
            },            
            /**
 * getMarketListingRequests：读取坊市ListingRequest。
 * @returns 无返回值，完成坊市ListingRequest的读取/组装。
 */

            getMarketListingRequests() {
                return new Map([['player:1', 2]]);
            },            
            /**
 * getMarketTradeHistoryRequests：读取坊市Trade历史Request。
 * @returns 无返回值，完成坊市TradeHistoryRequest的读取/组装。
 */

            getMarketTradeHistoryRequests() {
                return new Map([['player:1', 3]]);
            },
        },
        worldClientEventService: {        
        /**
 * markProtocol：处理Protocol并更新相关状态。
 * @param client 参数说明。
 * @param protocol 参数说明。
 * @returns 无返回值，直接更新Protocol相关状态。
 */

            markProtocol(client, protocol) {
                log.push(['markProtocol', client.id, protocol]);
            },            
            /**
 * emitQuests：处理任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新任务相关状态。
 */

            emitQuests(client, payload) {
                log.push(['emitQuests', client.id, payload]);
            },            
            /**
 * emitMailSummary：处理邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新邮件摘要相关状态。
 */

            emitMailSummary(client, payload) {
                log.push(['emitMailSummary', client.id, payload]);
            },            
            /**
 * emitMailSummaryForPlayer：处理邮件摘要For玩家并更新相关状态。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新邮件摘要For玩家相关状态。
 */

            emitMailSummaryForPlayer(client, playerId) {
                log.push(['emitMailSummaryForPlayer', client.id, playerId]);
                return Promise.resolve();
            },            
            /**
 * emitNpcShop：处理NPCShop并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NPCShop相关状态。
 */

            emitNpcShop(client, payload) {
                log.push(['emitNpcShop', client.id, payload]);
            },            
            /**
 * flushMarketResult：处理刷新坊市结果并更新相关状态。
 * @param subscribers 参数说明。
 * @param result 返回结果。
 * @param options 选项参数。
 * @returns 无返回值，直接更新flush坊市结果相关状态。
 */

            flushMarketResult(subscribers, result, options) {
                log.push(['flushMarketResult', Array.from(subscribers), result, options.marketListingRequests.get('player:1'), options.marketTradeHistoryRequests.get('player:1')]);
            },            
            /**
 * broadcastSuggestionUpdate：处理broadcastSuggestionUpdate并更新相关状态。
 * @returns 无返回值，直接更新broadcastSuggestionUpdate相关状态。
 */

            broadcastSuggestionUpdate() {
                log.push(['broadcastSuggestionUpdate']);
            },
        },
    };
}
/**
 * testClientEmitHelper：处理testClientEmit辅助函数并更新相关状态。
 * @returns 无返回值，直接更新testClientEmit辅助函数相关状态。
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
