"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeActionExecutionService } = require("../runtime/world/world-runtime-action-execution.service");

function createService(player, log = []) {
    return new WorldRuntimeActionExecutionService({
        getPlayerOrThrow(playerId) {
            log.push(['getPlayerOrThrow', playerId]);
            if (!player) {
                throw new Error('player missing');
            }
            return player;
        },
        updateCombatSettings(playerId, patch, tick) {
            log.push(['updateCombatSettings', playerId, patch, tick]);
        },
        cultivateTechnique(playerId, techniqueId) {
            log.push(['cultivateTechnique', playerId, techniqueId]);
        },
        infuseBodyTraining(playerId, foundationAmount) {
            log.push(['infuseBodyTraining', playerId, foundationAmount]);
            return { foundationSpent: foundationAmount, expGained: foundationAmount * 2 };
        },
    }, {
        executeNpcQuestAction(playerId, npcId) {
            log.push(['executeNpcQuestAction', playerId, npcId]);
            return { kind: 'npcQuests', npcQuests: { npcId, quests: [] } };
        },
    });
}

function createDeps(log = []) {
    return {
        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'public:yunlai_town' };
        },
        resolveCurrentTickForPlayerId(playerId) {
            log.push(['resolveCurrentTickForPlayerId', playerId]);
            return 77;
        },
        usePortal(playerId) {
            log.push(['usePortal', playerId]);
            return { tick: 1 };
        },
        enqueuePendingCommand(playerId, command) {
            log.push(['enqueuePendingCommand', playerId, command]);
        },
        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return { tick: 2 };
        },
        queuePlayerNotice(playerId, message, kind) {
            log.push(['queuePlayerNotice', playerId, message, kind]);
        },
        buildNpcShopView(playerId, npcId) {
            log.push(['buildNpcShopView', playerId, npcId]);
            return { npcId, items: [] };
        },
    };
}

function testPortalTravel() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'portal:travel', undefined, deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 1 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['usePortal', 'player:1'],
    ]);
}

function testBreakthroughQueuesPendingCommand() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'realm:breakthrough', undefined, deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 2 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['enqueuePendingCommand', 'player:1', { kind: 'breakthrough' }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

function testBodyTrainingInfuse() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'body_training:infuse', '12', deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 2 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['infuseBodyTraining', 'player:1', 12],
        ['queuePlayerNotice', 'player:1', '你将 12 点底蕴灌入肉身，转化为 24 点炼体经验', 'success'],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

function testToggleAutoBattle() {
    const log = [];
    const service = createService({
        combat: {
            autoBattle: false,
        },
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'toggle:auto_battle', undefined, deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 2 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['getPlayerOrThrow', 'player:1'],
        ['updateCombatSettings', 'player:1', { autoBattle: true }, 77],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

function testCultivationToggle() {
    const log = [];
    const service = createService({
        combat: {
            cultivationActive: false,
        },
        techniques: {
            cultivatingTechId: 'technique.alpha',
        },
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'cultivation:toggle', undefined, deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 2 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['getPlayerOrThrow', 'player:1'],
        ['cultivateTechnique', 'player:1', 'technique.alpha'],
        ['queuePlayerNotice', 'player:1', '已恢复当前修炼', 'info'],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

function testNpcShopView() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'npc_shop:npc_a', undefined, deps);
    assert.deepEqual(result, {
        kind: 'npcShop',
        npcShop: { npcId: 'npc_a', items: [] },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['buildNpcShopView', 'player:1', 'npc_a'],
    ]);
}

function testNpcQuestActionDelegates() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'npc_quests:npc_a', undefined, deps);
    assert.deepEqual(result, {
        kind: 'npcQuests',
        npcQuests: { npcId: 'npc_a', quests: [] },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['executeNpcQuestAction', 'player:1', 'npc_a'],
    ]);
}

function testLegacyNpcActionDelegates() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'npc:npc_legacy', undefined, deps);
    assert.deepEqual(result, {
        kind: 'npcQuests',
        npcQuests: { npcId: 'npc_legacy', quests: [] },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['executeNpcQuestAction', 'player:1', 'npc_legacy'],
    ]);
}

testPortalTravel();
testBreakthroughQueuesPendingCommand();
testBodyTrainingInfuse();
testToggleAutoBattle();
testCultivationToggle();
testNpcShopView();
testNpcQuestActionDelegates();
testLegacyNpcActionDelegates();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-action-execution' }, null, 2));
