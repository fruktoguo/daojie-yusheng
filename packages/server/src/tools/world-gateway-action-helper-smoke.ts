// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldGatewayActionHelper } = require("../network/world-gateway-action.helper");

function createClient(log = [], id = 'socket:1') {
    return {
        id,
        emit(event, payload) {
            log.push(['emit', event, payload]);
        },
    };
}

function createGateway(log = [], playerId = 'player:1') {
    const runtime = {
        buildTileDetail(playerIdInput, tile) {
            log.push(['buildTileDetail', playerIdInput, tile.x, tile.y]);
            return { x: tile.x, y: tile.y };
        },
        buildQuestListView(playerIdInput) {
            log.push(['buildQuestListView', playerIdInput]);
            return { quests: [] };
        },
        worldRuntimeCommandIntakeFacadeService: {
            enqueueResetPlayerSpawn(inputPlayerId) {
                log.push(['enqueueResetPlayerSpawn', inputPlayerId]);
            },
            enqueueReturnToSpawn(inputPlayerId) {
                log.push(['enqueueReturnToSpawn', inputPlayerId]);
            },
            enqueueBattleTarget(inputPlayerId, locked, targetPlayerId, targetMonsterId, targetX, targetY) {
                log.push(['enqueueBattleTarget', inputPlayerId, locked, targetPlayerId, targetMonsterId, targetX, targetY]);
            },
            enqueueNpcInteraction(inputPlayerId, actionId) {
                log.push(['enqueueNpcInteraction', inputPlayerId, actionId]);
            },
            executeAction(inputPlayerId, actionId, target, deps) {
                log.push(['executeAction', inputPlayerId, actionId, target ?? null, deps === runtime]);
                return { kind: 'queued' };
            },
            enqueueRedeemCodes(inputPlayerId, codes) {
                log.push(['enqueueRedeemCodes', inputPlayerId, codes]);
            },
            usePortal(inputPlayerId) {
                log.push(['usePortal', inputPlayerId]);
            },
            enqueueCultivate(inputPlayerId, techId) {
                log.push(['enqueueCultivate', inputPlayerId, techId]);
            },
            enqueueCastSkill(inputPlayerId, skillId, targetPlayerId, targetMonsterId, targetRef) {
                log.push(['enqueueCastSkill', inputPlayerId, skillId, targetPlayerId, targetMonsterId, targetRef]);
            },
            enqueueCastSkillTargetRef(inputPlayerId, actionId, target) {
                log.push(['enqueueCastSkillTargetRef', inputPlayerId, actionId, target]);
            },
        },
    };
    return {
        gatewayGuardHelper: {
            requirePlayerId() {
                return playerId;
            },
        },
        worldClientEventService: {
            markProtocol(client, protocol) {
                log.push(['markProtocol', client.id, protocol]);
            },
            emitGatewayError(client, code, error) {
                log.push(['emitGatewayError', client.id, code, error instanceof Error ? error.message : String(error)]);
            },
            getExplicitProtocol() {
                return 'mainline';
            },
        },
        gatewayClientEmitHelper: {
            emitNpcShop(client, payload) {
                log.push(['emitNpcShop', client.id, payload]);
            },
            emitQuests(client, payload) {
                log.push(['emitQuests', client.id, payload]);
            },
        },
        worldProtocolProjectionService: {
            emitTileLootInteraction(client, inputPlayerId, payload) {
                log.push(['emitTileLootInteraction', client.id, inputPlayerId, payload]);
            },
        },
        playerRuntimeService: {
            getPlayerOrThrow(inputPlayerId) {
                log.push(['getPlayerOrThrow', inputPlayerId]);
                return { x: 10, y: 10 };
            },
        },
        worldRuntimeService: runtime,
    };
}

function testWorldMigrateDelegatesToExecuteAction() {
    const log = [];
    const helper = new WorldGatewayActionHelper(createGateway(log));
    const client = createClient(log);

    helper.handleUseAction(client, { actionId: 'world:migrate', target: 'real' });

    assert.deepEqual(log, [
        ['markProtocol', 'socket:1', 'mainline'],
        ['executeAction', 'player:1', 'world:migrate', 'real', true],
    ]);
}

function testTargetedSkillStillUsesCastSkillPath() {
    const log = [];
    const helper = new WorldGatewayActionHelper(createGateway(log));
    const client = createClient(log);

    helper.handleUseAction(client, { actionId: 'skill.fireball', target: 'tile:11,12' });

    assert.deepEqual(log, [
        ['markProtocol', 'socket:1', 'mainline'],
        ['enqueueCastSkillTargetRef', 'player:1', 'skill.fireball', 'tile:11,12'],
    ]);
}

function testBodyTrainingStillUsesExecuteAction() {
    const log = [];
    const helper = new WorldGatewayActionHelper(createGateway(log));
    const client = createClient(log);

    helper.handleUseAction(client, { actionId: 'body_training:infuse', target: '12' });

    assert.deepEqual(log, [
        ['markProtocol', 'socket:1', 'mainline'],
        ['executeAction', 'player:1', 'body_training:infuse', '12', true],
    ]);
}
function testReturnToSpawnUsesDedicatedCommand() {
    const log = [];
    const helper = new WorldGatewayActionHelper(createGateway(log));
    const client = createClient(log);

    helper.handleUseAction(client, { actionId: 'travel:return_spawn' });

    assert.deepEqual(log, [
        ['markProtocol', 'socket:1', 'mainline'],
        ['enqueueReturnToSpawn', 'player:1'],
    ]);
}

testWorldMigrateDelegatesToExecuteAction();
testTargetedSkillStillUsesCastSkillPath();
testBodyTrainingStillUsesExecuteAction();
testReturnToSpawnUsesDedicatedCommand();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-action-helper' }, null, 2));
