"use strict";

const assert = require("node:assert/strict");

const { WorldGatewaySessionStateHelper } = require("../network/world-gateway-session-state.helper");

function testSessionStateHelper() {
    const log = [];
    const helper = new WorldGatewaySessionStateHelper({
        playerRuntimeService: {
            detachSession(playerId) {
                log.push(['detachSession', playerId]);
            },
        },
    });
    helper.subscribeMarket('player:1');
    helper.setMarketListingsRequest('player:1', { page: 2 });
    helper.setMarketTradeHistoryRequest('player:1', 3);
    assert.equal(helper.getMarketSubscribers().has('player:1'), true);
    assert.deepEqual(helper.getMarketListingsRequest('player:1'), { page: 2 });
    assert.equal(helper.getMarketTradeHistoryRequests().get('player:1'), 3);
    helper.clearDisconnectedPlayerState({ playerId: 'player:1', connected: true });
    assert.equal(helper.getMarketSubscribers().has('player:1'), true);
    helper.clearDisconnectedPlayerState({ playerId: 'player:1', connected: false });
    assert.equal(helper.getMarketSubscribers().has('player:1'), false);
    assert.equal(helper.getMarketListingsRequest('player:1'), undefined);
    assert.equal(helper.getMarketTradeHistoryRequests().get('player:1'), undefined);
    assert.deepEqual(log, [['detachSession', 'player:1']]);
}

testSessionStateHelper();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-session-state-helper' }, null, 2));
