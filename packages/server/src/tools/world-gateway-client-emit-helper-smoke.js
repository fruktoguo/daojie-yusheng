"use strict";

const assert = require("node:assert/strict");

const { WorldGatewayClientEmitHelper } = require("../network/world-gateway-client-emit.helper");

function createGateway(log = []) {
    return {
        gatewaySessionStateHelper: {
            getMarketSubscribers() {
                return new Set(['player:1']);
            },
            getMarketListingRequests() {
                return new Map([['player:1', 2]]);
            },
            getMarketTradeHistoryRequests() {
                return new Map([['player:1', 3]]);
            },
        },
        worldClientEventService: {
            markProtocol(client, protocol) {
                log.push(['markProtocol', client.id, protocol]);
            },
            emitQuests(client, payload) {
                log.push(['emitQuests', client.id, payload]);
            },
            emitMailSummary(client, payload) {
                log.push(['emitMailSummary', client.id, payload]);
            },
            emitMailSummaryForPlayer(client, playerId) {
                log.push(['emitMailSummaryForPlayer', client.id, playerId]);
                return Promise.resolve();
            },
            emitNpcShop(client, payload) {
                log.push(['emitNpcShop', client.id, payload]);
            },
            flushMarketResult(subscribers, result, options) {
                log.push(['flushMarketResult', Array.from(subscribers), result, options.marketListingRequests.get('player:1'), options.marketTradeHistoryRequests.get('player:1')]);
            },
            broadcastSuggestionUpdate() {
                log.push(['broadcastSuggestionUpdate']);
            },
        },
    };
}

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
