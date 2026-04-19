"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeCombatCommandService } = require("../runtime/world/world-runtime-combat-command.service");

function createService(log) {
    return new WorldRuntimeCombatCommandService({
        dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
            log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]);
        },
    }, {
        dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef) {
            log.push(['dispatchCastSkill', playerId, skillId, targetPlayerId, targetMonsterId, targetRef]);
        },
        resolveLegacySkillTargetRef(attacker, skill, targetRef) {
            log.push(['resolveLegacySkillTargetRef', attacker.playerId, skill.id, targetRef]);
            return { kind: 'monster', monsterId: 'monster:1' };
        },
        dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) {
            log.push(['dispatchCastSkillToMonster', attacker.playerId, skillId, targetMonsterId]);
        },
        dispatchCastSkillToTile(attacker, skillId, targetX, targetY) {
            log.push(['dispatchCastSkillToTile', attacker.playerId, skillId, targetX, targetY]);
        },
    }, {
        dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
            log.push(['dispatchEngageBattle', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]);
        },
    });
}

function testDispatchBasicAttackDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchBasicAttack('player:1', 'player:2', null, null, null, {});
    assert.deepEqual(log, [
        ['dispatchBasicAttack', 'player:1', 'player:2', null, null, null],
    ]);
}

function testDispatchCastSkillDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchCastSkill('player:1', 'skill.a', null, 'monster:9', 'tile:1:2', {});
    assert.deepEqual(log, [
        ['dispatchCastSkill', 'player:1', 'skill.a', null, 'monster:9', 'tile:1:2'],
    ]);
}

function testResolveLegacySkillTargetRefDelegates() {
    const log = [];
    const service = createService(log);
    const result = service.resolveLegacySkillTargetRef({ playerId: 'player:1' }, { id: 'skill.a' }, 'tile:3:4', {});
    assert.deepEqual(log, [
        ['resolveLegacySkillTargetRef', 'player:1', 'skill.a', 'tile:3:4'],
    ]);
    assert.deepEqual(result, { kind: 'monster', monsterId: 'monster:1' });
}

function testDispatchCastSkillToMonsterDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchCastSkillToMonster({ playerId: 'player:1' }, 'skill.a', 'monster:9', {});
    assert.deepEqual(log, [
        ['dispatchCastSkillToMonster', 'player:1', 'skill.a', 'monster:9'],
    ]);
}

function testDispatchCastSkillToTileDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchCastSkillToTile({ playerId: 'player:1' }, 'skill.a', 5, 6, {});
    assert.deepEqual(log, [
        ['dispatchCastSkillToTile', 'player:1', 'skill.a', 5, 6],
    ]);
}

function testDispatchEngageBattleDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchEngageBattle('player:1', null, 'monster:9', 7, 8, true, {});
    assert.deepEqual(log, [
        ['dispatchEngageBattle', 'player:1', null, 'monster:9', 7, 8, true],
    ]);
}

testDispatchBasicAttackDelegates();
testDispatchCastSkillDelegates();
testResolveLegacySkillTargetRefDelegates();
testDispatchCastSkillToMonsterDelegates();
testDispatchCastSkillToTileDelegates();
testDispatchEngageBattleDelegates();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-combat-command' }, null, 2));
