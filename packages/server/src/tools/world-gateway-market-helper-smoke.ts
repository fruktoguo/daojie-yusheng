import * as assert from 'node:assert/strict';
import { WorldGatewayMarketHelper } from '../network/world-gateway-market.helper';

type LogEntry = [string, ...unknown[]];

function createGateway(log: LogEntry[]): any {
    return {
        gatewayGuardHelper: {
            requirePlayerId(client: { id: string }) {
                log.push(['requirePlayerId', client.id]);
                return 'player:auction-duration';
            },
        },
        playerRuntimeService: {
            repairInventoryItemInstanceIds(playerId: string) {
                log.push(['repairInventoryItemInstanceIds', playerId]);
            },
        },
        marketRuntimeService: {
            async createSellOrder(playerId: string, payload: Record<string, unknown>) {
                log.push(['createSellOrder', playerId, payload]);
                return { ok: true, affectedPlayerIds: [playerId] };
            },
        },
        async flushMarketResult(result: unknown) {
            log.push(['flushMarketResult', result]);
        },
        worldClientEventService: {
            emitGatewayError(client: { id: string }, code: string, error: unknown) {
                log.push(['emitGatewayError', client.id, code, error instanceof Error ? error.message : String(error)]);
            },
        },
    };
}

async function testAuctionDurationHoursIsForwarded(): Promise<void> {
    const log: LogEntry[] = [];
    const helper = new WorldGatewayMarketHelper(createGateway(log));

    await helper.handleCreateMarketSellOrder(
        { id: 'socket:auction-duration' },
        {
            itemRef: { itemInstanceId: 'item-instance:duration' },
            quantity: 2,
            unitPrice: 1000,
            listingMode: 'auction',
            buyoutPrice: 1500,
            auctionDurationHours: 36,
        },
    );

    const createEntry = log.find((entry) => entry[0] === 'createSellOrder');
    assert.ok(createEntry, 'expected createSellOrder to be called');
    assert.equal(createEntry[1], 'player:auction-duration');
    assert.deepEqual(createEntry[2], {
        itemInstanceId: 'item-instance:duration',
        quantity: 2,
        unitPrice: 1000,
        listingMode: 'auction',
        buyoutPrice: 1500,
        auctionDurationHours: 36,
    });
    assert.equal(log.some((entry) => entry[0] === 'emitGatewayError'), false);
}

async function run(): Promise<void> {
    await testAuctionDurationHoursIsForwarded();
    console.log(JSON.stringify({ ok: true, case: 'world-gateway-market-helper' }, null, 2));
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
