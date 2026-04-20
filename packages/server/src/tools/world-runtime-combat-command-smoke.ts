// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeCombatCommandService } = require("../runtime/world/world-runtime-combat-command.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createService(log) {
    return new WorldRuntimeCombatCommandService({    
    /**
 * dispatchBasicAttack：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @returns 函数返回值。
 */

        dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
            log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]);
        },
    }, {    
    /**
 * dispatchCastSkill：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetRef 参数说明。
 * @returns 函数返回值。
 */

        dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef) {
            log.push(['dispatchCastSkill', playerId, skillId, targetPlayerId, targetMonsterId, targetRef]);
        },        
        /**
 * resolveLegacySkillTargetRef：执行核心业务逻辑。
 * @param attacker 参数说明。
 * @param skill 参数说明。
 * @param targetRef 参数说明。
 * @returns 函数返回值。
 */

        resolveLegacySkillTargetRef(attacker, skill, targetRef) {
            log.push(['resolveLegacySkillTargetRef', attacker.playerId, skill.id, targetRef]);
            return { kind: 'monster', monsterId: 'monster:1' };
        },        
        /**
 * dispatchCastSkillToMonster：处理事件并驱动执行路径。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @returns 函数返回值。
 */

        dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) {
            log.push(['dispatchCastSkillToMonster', attacker.playerId, skillId, targetMonsterId]);
        },        
        /**
 * dispatchCastSkillToTile：处理事件并驱动执行路径。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @returns 函数返回值。
 */

        dispatchCastSkillToTile(attacker, skillId, targetX, targetY) {
            log.push(['dispatchCastSkillToTile', attacker.playerId, skillId, targetX, targetY]);
        },
    }, {    
    /**
 * dispatchEngageBattle：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param locked 参数说明。
 * @returns 函数返回值。
 */

        dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
            log.push(['dispatchEngageBattle', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]);
        },
    });
}
/**
 * testDispatchBasicAttackDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDispatchBasicAttackDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchBasicAttack('player:1', 'player:2', null, null, null, {});
    assert.deepEqual(log, [
        ['dispatchBasicAttack', 'player:1', 'player:2', null, null, null],
    ]);
}
/**
 * testDispatchCastSkillDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDispatchCastSkillDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchCastSkill('player:1', 'skill.a', null, 'monster:9', 'tile:1:2', {});
    assert.deepEqual(log, [
        ['dispatchCastSkill', 'player:1', 'skill.a', null, 'monster:9', 'tile:1:2'],
    ]);
}
/**
 * testResolveLegacySkillTargetRefDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testResolveLegacySkillTargetRefDelegates() {
    const log = [];
    const service = createService(log);
    const result = service.resolveLegacySkillTargetRef({ playerId: 'player:1' }, { id: 'skill.a' }, 'tile:3:4', {});
    assert.deepEqual(log, [
        ['resolveLegacySkillTargetRef', 'player:1', 'skill.a', 'tile:3:4'],
    ]);
    assert.deepEqual(result, { kind: 'monster', monsterId: 'monster:1' });
}
/**
 * testDispatchCastSkillToMonsterDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDispatchCastSkillToMonsterDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchCastSkillToMonster({ playerId: 'player:1' }, 'skill.a', 'monster:9', {});
    assert.deepEqual(log, [
        ['dispatchCastSkillToMonster', 'player:1', 'skill.a', 'monster:9'],
    ]);
}
/**
 * testDispatchCastSkillToTileDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDispatchCastSkillToTileDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchCastSkillToTile({ playerId: 'player:1' }, 'skill.a', 5, 6, {});
    assert.deepEqual(log, [
        ['dispatchCastSkillToTile', 'player:1', 'skill.a', 5, 6],
    ]);
}
/**
 * testDispatchEngageBattleDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


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
