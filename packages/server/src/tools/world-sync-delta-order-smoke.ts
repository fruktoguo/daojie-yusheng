import assert from 'node:assert/strict';

import { S2C } from '@mud/shared';

import { WorldSyncService } from '../network/world-sync.service';

type LogEntry = unknown[];

interface DeltaOrderSmokeOptions {
    deferFirstAux?: boolean;
    trackRoomSync?: boolean;
    pendingStatisticRecords?: Record<string, unknown>[];
    statisticTotals?: Record<string, unknown> | null;
    statisticTotalsPatch?: Record<string, unknown> | null;
    runtimeGmStateService?: {
        recordSyncFlushBreakdown(sample: Record<string, number>): void;
    };
}

function createService(log: LogEntry[] = [], options: DeltaOrderSmokeOptions = {}) {
    const binding = { playerId: 'player:1', sessionId: 'session:1' };
    let statisticRecordsConsumed = false;
    const socket = {
        id: 'socket:1',
        emit(event: string, payload: Record<string, unknown>) {
            log.push([
                'socketEmit',
                event,
                Buffer.byteLength(JSON.stringify(payload)),
                Boolean(payload?.totals),
                Boolean(payload?.totalsPatch),
                Array.isArray(payload?.reports) ? payload.reports.length : 0,
            ]);
        },
    };
    const view = {
        tick: 9,
        worldRevision: 10,
        selfRevision: 11,
        instance: { templateId: 'map.a', instanceId: 'inst.a' },
        self: { x: 4, y: 5 },
    };
    const player = { id: 'player:1', quests: { revision: 12 } };
    const service = new WorldSyncService(
        {
            getPlayerView(playerId: string) {
                log.push(['getPlayerView', playerId]);
                return view;
            },
            refreshPlayerContextActions(playerId: string, inputView: unknown) {
                log.push(['refreshPlayerContextActions', playerId, inputView === view]);
            },
        },
        {
            syncFromWorldView(playerId: string, sessionId: string, inputView: unknown) {
                log.push(['syncFromWorldView', playerId, sessionId, inputView === view]);
                return player;
            },
            drainNotices() {
                return [];
            },
            getPendingPlayerStatisticRecords() {
                return options.pendingStatisticRecords ?? [];
            },
            consumePendingPlayerStatisticRecordsForEmit() {
                if (!options.pendingStatisticRecords || statisticRecordsConsumed) {
                    return [];
                }
                statisticRecordsConsumed = true;
                return options.pendingStatisticRecords;
            },
            consumePlayerStatisticTotalsPatchForEmit() {
                return options.statisticTotalsPatch ?? null;
            },
            consumePlayerStatisticTotalsForEmit() {
                return options.statisticTotals ?? null;
            },
            detachSession() {},
        },
        {
            getBinding(playerId: string) {
                log.push(['getBinding', playerId]);
                return binding;
            },
            getSocketByPlayerId(playerId: string) {
                log.push(['getSocketByPlayerId', playerId]);
                return socket;
            },
            listBindings() {
                return [binding];
            },
            consumePurgedPlayerIds() {
                return [];
            },
            syncPlayerInstanceRoom(playerId: string, instanceId: string) {
                if (options.trackRoomSync === true) {
                    log.push(['syncPlayerInstanceRoom', playerId, instanceId]);
                }
            },
        },
        {
            emitQuestSyncIfChanged(socketInput: { id: string }, playerId: string, revision?: number) {
                log.push(['emitQuestSyncIfChanged', socketInput.id, playerId, revision ?? null]);
            },
            clearPlayerCache() {},
        },
        {
            sendEnvelope(socketInput: { id: string }, envelope: { worldDelta?: { p?: Array<{ x?: number }> } }) {
                log.push(['sendEnvelope', socketInput.id, envelope?.worldDelta?.p?.[0]?.x ?? null]);
            },
            sendNotices() {},
        },
        {
            emitAuxDeltaSync(playerId: string, socketInput: { id: string }, inputView: unknown, inputPlayer: unknown, emitOptions?: { deferMapChanged?: boolean }) {
                log.push([
                    'emitAuxDeltaSync',
                    playerId,
                    socketInput.id,
                    inputView === view,
                    inputPlayer === player,
                    emitOptions?.deferMapChanged === true,
                ]);
                return options.deferFirstAux === true ? false : true;
            },
            clearPlayerCache() {},
        },
        {
            createDeltaEnvelope(playerId: string, inputView: typeof view, inputPlayer: unknown) {
                log.push(['createDeltaEnvelope', playerId, inputView === view, inputPlayer === player]);
                return { worldDelta: { t: inputView.tick, p: [{ id: playerId, x: inputView.self.x, y: inputView.self.y }] } };
            },
            clearPlayerCache() {},
        },
        options.runtimeGmStateService ?? {},
    );
    return { service };
}

function testAuxDeltaIsSentBeforeMovementEnvelope() {
    const log = [];
    const { service } = createService(log);

    service.emitDeltaSync('player:1');

    assert.deepEqual(log, [
        ['getBinding', 'player:1'],
        ['getSocketByPlayerId', 'player:1'],
        ['getPlayerView', 'player:1'],
        ['refreshPlayerContextActions', 'player:1', true],
        ['syncFromWorldView', 'player:1', 'session:1', true],
        ['createDeltaEnvelope', 'player:1', true, true],
        ['emitAuxDeltaSync', 'player:1', 'socket:1', true, true, true],
        ['sendEnvelope', 'socket:1', 4],
        ['emitQuestSyncIfChanged', 'socket:1', 'player:1', 12],
    ]);
}

function testMapChangedAuxDeltaStaysAfterMovementEnvelope() {
    const log = [];
    const { service } = createService(log, { deferFirstAux: true });

    service.emitDeltaSync('player:1');

    assert.deepEqual(log, [
        ['getBinding', 'player:1'],
        ['getSocketByPlayerId', 'player:1'],
        ['getPlayerView', 'player:1'],
        ['refreshPlayerContextActions', 'player:1', true],
        ['syncFromWorldView', 'player:1', 'session:1', true],
        ['createDeltaEnvelope', 'player:1', true, true],
        ['emitAuxDeltaSync', 'player:1', 'socket:1', true, true, true],
        ['sendEnvelope', 'socket:1', 4],
        ['emitAuxDeltaSync', 'player:1', 'socket:1', true, true, false],
        ['emitQuestSyncIfChanged', 'socket:1', 'player:1', 12],
    ]);
}

function testFlushConnectedPlayersRecordsBreakdownAndSyncsRoomOnce() {
    const log = [];
    const records: Record<string, number>[] = [];
    const { service } = createService(log, {
        trackRoomSync: true,
        runtimeGmStateService: {
            recordSyncFlushBreakdown(sample: Record<string, number>) {
                records.push(sample);
                log.push(['recordSyncFlushBreakdown', sample.processedPlayerCount, sample.roomSyncCount]);
            },
        },
    });

    service.flushConnectedPlayers();

    assert.equal(log.filter((entry) => entry[0] === 'syncPlayerInstanceRoom').length, 1);
    assert.equal(records.length, 1);
    assert.equal(records[0].playerCount, 1);
    assert.equal(records[0].processedPlayerCount, 1);
    assert.equal(records[0].skippedPlayerCount, 0);
    assert.equal(records[0].getSocketCount, 1);
    assert.equal(records[0].getViewCount, 1);
    assert.equal(records[0].roomSyncCount, 1);
    assert.equal(records[0].contextActionsCount, 1);
    assert.equal(records[0].playerStateCount, 1);
    assert.equal(records[0].envelopeCount, 1);
    assert.equal(records[0].auxSyncCount, 1);
    assert.equal(records[0].emitEnvelopeCount, 1);
    assert.equal(records[0].questSyncCount, 1);
    assert.equal(records[0].runtimeEventsCount, 1);
    assert.equal(records[0].statisticRecordsCount, 1);
}

function testStatisticTotalsPatchUsesCompactOfflineGainPayload() {
    const log = [];
    const totalsPatch = {
        generatedAt: 123,
        today: { progress: { gained: 10, lost: 0, net: 10 } },
        week: { progress: { gained: 10, lost: 0, net: 10 } },
    };
    const fullTotals = {
        generatedAt: 123,
        today: {
            spiritStones: { gained: 0, lost: 0, net: 0 },
            progress: { gained: 10, lost: 0, net: 10 },
            techniques: { gained: 0, lost: 0, net: 0 },
            professions: { gained: 0, lost: 0, net: 0 },
        },
        yesterday: {
            spiritStones: { gained: 0, lost: 0, net: 0 },
            progress: { gained: 0, lost: 0, net: 0 },
            techniques: { gained: 0, lost: 0, net: 0 },
            professions: { gained: 0, lost: 0, net: 0 },
        },
        week: {
            spiritStones: { gained: 0, lost: 0, net: 0 },
            progress: { gained: 10, lost: 0, net: 10 },
            techniques: { gained: 0, lost: 0, net: 0 },
            professions: { gained: 0, lost: 0, net: 0 },
        },
    };
    const { service } = createService(log, {
        statisticTotals: fullTotals,
        statisticTotalsPatch: totalsPatch,
    });

    service.emitDeltaSync('player:1');

    const emitted = log.find((entry) => entry[0] === 'socketEmit');
    assert.ok(emitted);
    assert.equal(emitted[1], S2C.OfflineGainReports);
    assert.equal(emitted[3], false);
    assert.equal(emitted[4], true);
    assert.ok(Number(emitted[2]) < Buffer.byteLength(JSON.stringify({ reports: [], totals: fullTotals })));
}

function testPendingStatisticRecordsEmitOnlyOncePerConnection() {
    const log = [];
    const { service } = createService(log, {
        pendingStatisticRecords: [{
            id: 'offline-report:1',
            startedAt: 1,
            endedAt: 2,
            durationMs: 60_000,
            generatedAt: 2,
            items: [],
            progress: [],
            techniques: [],
            professions: [],
        }],
    });

    service.emitDeltaSync('player:1');
    service.emitDeltaSync('player:1');

    const emitted = log.filter((entry) => entry[0] === 'socketEmit' && entry[1] === S2C.OfflineGainReports);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0][5], 1);
}

testAuxDeltaIsSentBeforeMovementEnvelope();
testMapChangedAuxDeltaStaysAfterMovementEnvelope();
testFlushConnectedPlayersRecordsBreakdownAndSyncsRoomOnce();
testStatisticTotalsPatchUsesCompactOfflineGainPayload();
testPendingStatisticRecordsEmitOnlyOncePerConnection();

console.log(JSON.stringify({ ok: true, case: 'world-sync-delta-order' }, null, 2));
