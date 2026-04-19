"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimePlayerCommandService } = require("../runtime/world/world-runtime-player-command.service");

function createService(log = [], player = { hp: 10 }) {
    return new WorldRuntimePlayerCommandService({
        getPlayer(playerId) {
            log.push(['getPlayer', playerId]);
            return player;
        },
    }, {
        dispatchUseItem(playerId, slotIndex) {
            log.push(['dispatchUseItem', playerId, slotIndex]);
        },
    }, {
        dispatchEquipItem(playerId, slotIndex) {
            log.push(['dispatchEquipItem', playerId, slotIndex]);
        },
        dispatchUnequipItem(playerId, slot) {
            log.push(['dispatchUnequipItem', playerId, slot]);
        },
    }, {
        dispatchDropItem(playerId, slotIndex, count) {
            log.push(['dispatchDropItem', playerId, slotIndex, count]);
        },
        dispatchTakeGround(playerId, sourceId, itemKey) {
            log.push(['dispatchTakeGround', playerId, sourceId, itemKey]);
        },
        dispatchTakeGroundAll(playerId, sourceId) {
            log.push(['dispatchTakeGroundAll', playerId, sourceId]);
        },
    }, {
        dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint) {
            log.push(['dispatchMoveTo', playerId, x, y, allowNearestReachable, clientPathHint]);
        },
    }, {
        dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
            log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]);
        },
        dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef) {
            log.push(['dispatchCastSkill', playerId, skillId, targetPlayerId, targetMonsterId, targetRef]);
        },
        dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
            log.push(['dispatchEngageBattle', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]);
        },
    }, {
        dispatchCultivateTechnique(playerId, techniqueId) {
            log.push(['dispatchCultivateTechnique', playerId, techniqueId]);
        },
    }, {
        dispatchStartAlchemy(playerId, payload) {
            log.push(['dispatchStartAlchemy', playerId, payload]);
        },
        dispatchCancelAlchemy(playerId) {
            log.push(['dispatchCancelAlchemy', playerId]);
        },
        dispatchSaveAlchemyPreset(playerId, payload) {
            log.push(['dispatchSaveAlchemyPreset', playerId, payload]);
        },
        dispatchDeleteAlchemyPreset(playerId, presetId) {
            log.push(['dispatchDeleteAlchemyPreset', playerId, presetId]);
        },
    }, {
        dispatchStartEnhancement(playerId, payload) {
            log.push(['dispatchStartEnhancement', playerId, payload]);
        },
        dispatchCancelEnhancement(playerId) {
            log.push(['dispatchCancelEnhancement', playerId]);
        },
    }, {
        dispatchRedeemCodes(playerId, codes) {
            log.push(['dispatchRedeemCodes', playerId, codes]);
        },
    }, {
        dispatchBreakthrough(playerId) {
            log.push(['dispatchBreakthrough', playerId]);
        },
        dispatchHeavenGateAction(playerId, action, element) {
            log.push(['dispatchHeavenGateAction', playerId, action, element]);
        },
    }, {
        dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
            log.push(['dispatchBuyNpcShopItem', playerId, npcId, itemId, quantity]);
        },
    }, {
        dispatchNpcInteraction(playerId, npcId) {
            log.push(['dispatchNpcInteraction', playerId, npcId]);
        },
        dispatchInteractNpcQuest(playerId, npcId) {
            log.push(['dispatchInteractNpcQuest', playerId, npcId]);
        },
        dispatchAcceptNpcQuest(playerId, npcId, questId) {
            log.push(['dispatchAcceptNpcQuest', playerId, npcId, questId]);
        },
        dispatchSubmitNpcQuest(playerId, npcId, questId) {
            log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]);
        },
    });
}

function testUseItemDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchPlayerCommand('player:1', { kind: 'useItem', slotIndex: 2 }, {});
    assert.deepEqual(log, [
        ['getPlayer', 'player:1'],
        ['dispatchUseItem', 'player:1', 2],
    ]);
}

function testCastSkillDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchPlayerCommand('player:1', {
        kind: 'castSkill',
        skillId: 'skill.a',
        targetPlayerId: null,
        targetMonsterId: 'monster:1',
        targetRef: null,
    }, {});
    assert.deepEqual(log, [
        ['getPlayer', 'player:1'],
        ['dispatchCastSkill', 'player:1', 'skill.a', null, 'monster:1', null],
    ]);
}

function testDeadPlayerOnlyAllowsRedeemCodes() {
    const deadLog = [];
    const deadService = createService(deadLog, { hp: 0 });
    deadService.dispatchPlayerCommand('player:1', { kind: 'useItem', slotIndex: 1 }, {});
    deadService.dispatchPlayerCommand('player:1', { kind: 'redeemCodes', codes: ['A'] }, {});
    assert.deepEqual(deadLog, [
        ['getPlayer', 'player:1'],
        ['getPlayer', 'player:1'],
        ['dispatchRedeemCodes', 'player:1', ['A']],
    ]);
}

function testNpcQuestRoutes() {
    const log = [];
    const service = createService(log);
    service.dispatchPlayerCommand('player:1', { kind: 'acceptNpcQuest', npcId: 'npc.a', questId: 'quest.a' }, {});
    service.dispatchPlayerCommand('player:1', { kind: 'submitNpcQuest', npcId: 'npc.a', questId: 'quest.a' }, {});
    assert.deepEqual(log, [
        ['getPlayer', 'player:1'],
        ['dispatchAcceptNpcQuest', 'player:1', 'npc.a', 'quest.a'],
        ['getPlayer', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc.a', 'quest.a'],
    ]);
}

testUseItemDelegates();
testCastSkillDelegates();
testDeadPlayerOnlyAllowsRedeemCodes();
testNpcQuestRoutes();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-command' }, null, 2));
