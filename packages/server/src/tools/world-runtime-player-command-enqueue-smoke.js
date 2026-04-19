"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimePlayerCommandEnqueueService } = require("../runtime/world/world-runtime-player-command-enqueue.service");

function createDeps(log = []) {
    return {
        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'public:yunlai_town' };
        },
        interruptManualCombat(playerId) {
            log.push(['interruptManualCombat', playerId]);
        },
        enqueuePendingCommand(playerId, command) {
            log.push(['enqueuePendingCommand', playerId, command]);
        },
        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return { playerId, tick: 9 };
        },
    };
}

function createService(actions = []) {
    return new WorldRuntimePlayerCommandEnqueueService({
        getPlayerOrThrow(playerId) {
            return {
                playerId,
                actions: {
                    actions,
                },
            };
        },
    });
}

function testBasicAttackQueue() {
    const log = [];
    const service = createService();
    const deps = createDeps(log);
    const result = service.enqueueBasicAttack('player:1', ' player:2 ', '', 5.8, 6.2, deps);
    assert.deepEqual(result, { playerId: 'player:1', tick: 9 });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['interruptManualCombat', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'basicAttack',
            targetPlayerId: 'player:2',
            targetMonsterId: null,
            targetX: 5,
            targetY: 6,
            locked: undefined,
        }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

function testStartAlchemyClonesIngredients() {
    const log = [];
    const service = createService();
    const deps = createDeps(log);
    const source = {
        recipeId: 'alchemy.alpha',
        ingredients: [{ slotIndex: 1, count: 2 }],
    };
    service.enqueueStartAlchemy('player:1', source, deps);
    source.ingredients[0].count = 99;
    assert.equal(log[1][2].payload.ingredients[0].count, 2);
}

function testCastSkillRequiresKnownAction() {
    const log = [];
    const service = createService([{ id: 'skill.alpha', type: 'skill', requiresTarget: true }]);
    const deps = createDeps(log);
    const result = service.enqueueCastSkill('player:1', ' skill.alpha ', '', ' monster:9 ', null, deps);
    assert.deepEqual(result, { playerId: 'player:1', tick: 9 });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'castSkill',
            skillId: 'skill.alpha',
            targetPlayerId: null,
            targetMonsterId: 'monster:9',
            targetRef: null,
        }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

function testHeavenGateActionNormalizesElement() {
    const log = [];
    const service = createService();
    const deps = createDeps(log);
    service.enqueueHeavenGateAction('player:1', 'open', ' fire ', deps);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'heavenGateAction',
            action: 'open',
            element: 'fire',
        }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

function testStartEnhancementClonesNestedPayload() {
    const log = [];
    const service = createService();
    const deps = createDeps(log);
    const payload = {
        target: { slotIndex: 3 },
        protection: { itemId: 'stone.a' },
    };
    service.enqueueStartEnhancement('player:1', payload, deps);
    payload.target.slotIndex = 99;
    payload.protection.itemId = 'stone.changed';
    assert.deepEqual(log[1][2].payload, {
        target: { slotIndex: 3 },
        protection: { itemId: 'stone.a' },
    });
}

testBasicAttackQueue();
testStartAlchemyClonesIngredients();
testCastSkillRequiresKnownAction();
testHeavenGateActionNormalizesElement();
testStartEnhancementClonesNestedPayload();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-command-enqueue' }, null, 2));
