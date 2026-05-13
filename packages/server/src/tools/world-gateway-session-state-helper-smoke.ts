// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldGatewaySessionStateHelper } = require("../network/world-gateway-session-state.helper");
/**
 * testSessionStateHelper：执行testSession状态辅助函数相关逻辑。
 * @returns 无返回值，直接更新testSession状态辅助函数相关状态。
 */


function testSessionStateHelper() {
    const log = [];
    const helper = new WorldGatewaySessionStateHelper({
        playerRuntimeService: {        
        /**
 * detachSession：执行detachSession相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新detachSession相关状态。
 */

            detachSession(playerId) {
                log.push(['detachSession', playerId]);
            },
        },
    });
    helper.subscribeMarket('player:1');
    helper.setMarketListingsRequest('player:1', { page: 2 });
    helper.setAuctionListingsRequest('player:1', { tab: 'mine', page: 2 });
    helper.setMarketTradeHistoryRequest('player:1', { page: 3, source: 'auction' });
    assert.equal(helper.getMarketSubscribers().has('player:1'), true);
    assert.deepEqual(helper.getMarketListingsRequest('player:1'), { page: 2 });
    assert.deepEqual(helper.getAuctionListingsRequest('player:1'), { tab: 'mine', page: 2 });
    assert.deepEqual(helper.getMarketTradeHistoryRequests().get('player:1'), { page: 3, source: 'auction' });
    helper.clearDisconnectedPlayerState({ playerId: 'player:1', connected: true });
    assert.equal(helper.getMarketSubscribers().has('player:1'), true);
    helper.clearDisconnectedPlayerState({ playerId: 'player:1', connected: false });
    assert.equal(helper.getMarketSubscribers().has('player:1'), false);
    assert.equal(helper.getMarketListingsRequest('player:1'), undefined);
    assert.equal(helper.getAuctionListingsRequest('player:1'), undefined);
    assert.equal(helper.getMarketTradeHistoryRequests().get('player:1'), undefined);
    assert.deepEqual(log, [['detachSession', 'player:1']]);
}

testSessionStateHelper();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-session-state-helper' }, null, 2));
