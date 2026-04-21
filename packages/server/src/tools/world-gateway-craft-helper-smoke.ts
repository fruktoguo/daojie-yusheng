// @ts-nocheck

const assert = require("node:assert/strict");

const { NEXT_S2C } = require("@mud/shared-next");
const { WorldGatewayCraftHelper } = require("../network/world-gateway-craft.helper");

function createGateway(log = [], playerId = 'player:1') {
    const runtime = {
        worldRuntimeCommandIntakeFacadeService: {
            enqueueStartTechniqueActivity(inputPlayerId, kind, payload, deps) {
                log.push(['enqueueStartTechniqueActivity', inputPlayerId, kind, payload, deps === runtime]);
            },
            enqueueCancelTechniqueActivity(inputPlayerId, kind, deps) {
                log.push(['enqueueCancelTechniqueActivity', inputPlayerId, kind, deps === runtime]);
            },
            enqueueSaveAlchemyPreset(inputPlayerId, payload, deps) {
                log.push(['enqueueSaveAlchemyPreset', inputPlayerId, payload, deps === runtime]);
            },
            enqueueDeleteAlchemyPreset(inputPlayerId, presetId, deps) {
                log.push(['enqueueDeleteAlchemyPreset', inputPlayerId, presetId, deps === runtime]);
            },
        },
    };
    return {
        gatewayGuardHelper: {
            requirePlayerId() {
                return playerId;
            },
        },
        playerRuntimeService: {
            getPlayer(inputPlayerId) {
                log.push(['getPlayer', inputPlayerId]);
                return inputPlayerId ? { playerId: inputPlayerId } : null;
            },
        },
        worldClientEventService: {
            markProtocol(client, protocol) {
                log.push(['markProtocol', client.id, protocol]);
            },
            emitGatewayError(client, code, error) {
                log.push(['emitGatewayError', client.id, code, error instanceof Error ? error.message : String(error)]);
            },
        },
        craftPanelRuntimeService: {
            buildTechniqueActivityPanelPayload(player, kind, knownCatalogVersion) {
                log.push(['buildTechniqueActivityPanelPayload', player.playerId, kind, knownCatalogVersion ?? null]);
                return { kind, knownCatalogVersion: knownCatalogVersion ?? null };
            },
        },
        worldRuntimeService: runtime,
    };
}

function createClient(log = [], id = 'socket:1') {
    return {
        id,
        emit(event, payload) {
            log.push(['emit', event, payload]);
        },
    };
}

function testRequestAndCommandDelegation() {
    const log = [];
    const gateway = createGateway(log);
    const helper = new WorldGatewayCraftHelper(gateway);
    const client = createClient(log);

    helper.handleNextRequestTechniqueActivityPanel(client, { knownCatalogVersion: 7 }, 'alchemy');
    helper.handleNextRequestEnhancementPanel(client, {}, );
    helper.handleNextStartTechniqueActivity(client, { recipeId: 'recipe:1' }, 'alchemy');
    helper.handleNextCancelTechniqueActivity(client, 'enhancement');
    helper.handleNextSaveAlchemyPreset(client, { presetId: 'preset:1' });
    helper.handleNextDeleteAlchemyPreset(client, { presetId: 'preset:2' });

    assert.deepEqual(log, [
        ['getPlayer', 'player:1'],
        ['markProtocol', 'socket:1', 'next'],
        ['buildTechniqueActivityPanelPayload', 'player:1', 'alchemy', 7],
        ['emit', NEXT_S2C.AlchemyPanel, { kind: 'alchemy', knownCatalogVersion: 7 }],
        ['getPlayer', 'player:1'],
        ['markProtocol', 'socket:1', 'next'],
        ['buildTechniqueActivityPanelPayload', 'player:1', 'enhancement', null],
        ['emit', NEXT_S2C.EnhancementPanel, { kind: 'enhancement', knownCatalogVersion: null }],
        ['markProtocol', 'socket:1', 'next'],
        ['enqueueStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:1' }, true],
        ['markProtocol', 'socket:1', 'next'],
        ['enqueueCancelTechniqueActivity', 'player:1', 'enhancement', true],
        ['markProtocol', 'socket:1', 'next'],
        ['enqueueSaveAlchemyPreset', 'player:1', { presetId: 'preset:1' }, true],
        ['markProtocol', 'socket:1', 'next'],
        ['enqueueDeleteAlchemyPreset', 'player:1', 'preset:2', true],
    ]);
}

function testGuardFailureSkipsWork() {
    const log = [];
    const gateway = createGateway(log, null);
    const helper = new WorldGatewayCraftHelper(gateway);
    const client = createClient(log);

    helper.handleNextRequestTechniqueActivityPanel(client, { knownCatalogVersion: 1 }, 'alchemy');
    helper.handleNextStartTechniqueActivity(client, { recipeId: 'recipe:1' }, 'alchemy');
    helper.handleNextCancelTechniqueActivity(client, 'alchemy');
    helper.handleNextSaveAlchemyPreset(client, { presetId: 'preset:1' });

    assert.deepEqual(log, []);
}

function testGatewayErrorCodes() {
    const log = [];
    const gateway = createGateway(log);
    gateway.craftPanelRuntimeService.buildTechniqueActivityPanelPayload = () => {
        throw new Error('panel failed');
    };
    gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueStartTechniqueActivity = () => {
        throw new Error('start failed');
    };
    gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCancelTechniqueActivity = () => {
        throw new Error('cancel failed');
    };
    gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSaveAlchemyPreset = () => {
        throw new Error('save failed');
    };
    gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDeleteAlchemyPreset = () => {
        throw new Error('delete failed');
    };

    const helper = new WorldGatewayCraftHelper(gateway);
    const client = createClient(log);
    helper.handleNextRequestTechniqueActivityPanel(client, { knownCatalogVersion: 0 }, 'enhancement');
    helper.handleNextStartTechniqueActivity(client, { itemId: 'item:1' }, 'enhancement');
    helper.handleNextCancelTechniqueActivity(client, 'alchemy');
    helper.handleNextSaveAlchemyPreset(client, { presetId: 'preset:1' });
    helper.handleNextDeleteAlchemyPreset(client, { presetId: 'preset:2' });

    assert.deepEqual(log, [
        ['getPlayer', 'player:1'],
        ['markProtocol', 'socket:1', 'next'],
        ['emitGatewayError', 'socket:1', 'REQUEST_ENHANCEMENT_PANEL_FAILED', 'panel failed'],
        ['markProtocol', 'socket:1', 'next'],
        ['emitGatewayError', 'socket:1', 'START_ENHANCEMENT_FAILED', 'start failed'],
        ['markProtocol', 'socket:1', 'next'],
        ['emitGatewayError', 'socket:1', 'CANCEL_ALCHEMY_FAILED', 'cancel failed'],
        ['markProtocol', 'socket:1', 'next'],
        ['emitGatewayError', 'socket:1', 'SAVE_ALCHEMY_PRESET_FAILED', 'save failed'],
        ['markProtocol', 'socket:1', 'next'],
        ['emitGatewayError', 'socket:1', 'DELETE_ALCHEMY_PRESET_FAILED', 'delete failed'],
    ]);
}

testRequestAndCommandDelegation();
testGuardFailureSkipsWork();
testGatewayErrorCodes();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-craft-helper' }, null, 2));
