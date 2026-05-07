// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldSyncService } = require("../network/world-sync.service");

function createService(log = [], options = {}) {
    const binding = { playerId: 'player:1', sessionId: 'session:1' };
    const socket = { id: 'socket:1', emit() {} };
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
            getPlayerView(playerId) {
                log.push(['getPlayerView', playerId]);
                return view;
            },
            refreshPlayerContextActions(playerId, inputView) {
                log.push(['refreshPlayerContextActions', playerId, inputView === view]);
            },
        },
        {
            syncFromWorldView(playerId, sessionId, inputView) {
                log.push(['syncFromWorldView', playerId, sessionId, inputView === view]);
                return player;
            },
            drainNotices() {
                return [];
            },
            getPendingPlayerStatisticRecords() {
                return [];
            },
            consumePlayerStatisticTotalsForEmit() {
                return null;
            },
            detachSession() {},
        },
        {
            getBinding(playerId) {
                log.push(['getBinding', playerId]);
                return binding;
            },
            getSocketByPlayerId(playerId) {
                log.push(['getSocketByPlayerId', playerId]);
                return socket;
            },
            listBindings() {
                return [binding];
            },
            consumePurgedPlayerIds() {
                return [];
            },
        },
        {
            emitQuestSyncIfChanged(socketInput, playerId, revision) {
                log.push(['emitQuestSyncIfChanged', socketInput.id, playerId, revision ?? null]);
            },
            clearPlayerCache() {},
        },
        {
            sendEnvelope(socketInput, envelope) {
                log.push(['sendEnvelope', socketInput.id, envelope?.worldDelta?.p?.[0]?.x ?? null]);
            },
            sendNotices() {},
        },
        {
            emitAuxDeltaSync(playerId, socketInput, inputView, inputPlayer, emitOptions) {
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
            createDeltaEnvelope(playerId, inputView, inputPlayer) {
                log.push(['createDeltaEnvelope', playerId, inputView === view, inputPlayer === player]);
                return { worldDelta: { t: inputView.tick, p: [{ id: playerId, x: inputView.self.x, y: inputView.self.y }] } };
            },
            clearPlayerCache() {},
        },
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

testAuxDeltaIsSentBeforeMovementEnvelope();
testMapChangedAuxDeltaStaysAfterMovementEnvelope();

console.log(JSON.stringify({ ok: true, case: 'world-sync-delta-order' }, null, 2));
