// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeCombatCommandService } = require("../runtime/world/world-runtime-combat-command.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(log) {
    return new WorldRuntimeCombatCommandService({    
    /**
 * dispatchBasicAttack：判断BasicAttack是否满足条件。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @returns 无返回值，直接更新BasicAttack相关状态。
 */

        dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
            log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]);
        },
    }, {    
    /**
 * dispatchCastSkill：判断Cast技能是否满足条件。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetRef 参数说明。
 * @returns 无返回值，直接更新Cast技能相关状态。
 */

        dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef) {
            log.push(['dispatchCastSkill', playerId, skillId, targetPlayerId, targetMonsterId, targetRef]);
        },        
        /**
 * resolveLegacySkillTargetRef：读取Legacy技能目标Ref并返回结果。
 * @param attacker 参数说明。
 * @param skill 参数说明。
 * @param targetRef 参数说明。
 * @returns 无返回值，直接更新Legacy技能目标Ref相关状态。
 */

        resolveLegacySkillTargetRef(attacker, skill, targetRef) {
            log.push(['resolveLegacySkillTargetRef', attacker.playerId, skill.id, targetRef]);
            return { kind: 'monster', monsterId: 'monster:1' };
        },        
        /**
 * dispatchCastSkillToMonster：判断Cast技能To怪物是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @returns 无返回值，直接更新Cast技能To怪物相关状态。
 */

        dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) {
            log.push(['dispatchCastSkillToMonster', attacker.playerId, skillId, targetMonsterId]);
        },        
        /**
 * dispatchCastSkillToTile：判断Cast技能ToTile是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @returns 无返回值，直接更新Cast技能ToTile相关状态。
 */

        dispatchCastSkillToTile(attacker, skillId, targetX, targetY) {
            log.push(['dispatchCastSkillToTile', attacker.playerId, skillId, targetX, targetY]);
        },
    }, {    
    /**
 * dispatchEngageBattle：判断EngageBattle是否满足条件。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param locked 参数说明。
 * @returns 无返回值，直接更新EngageBattle相关状态。
 */

        dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
            log.push(['dispatchEngageBattle', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]);
        },
    });
}
/**
 * testDispatchBasicAttackDelegates：判断testDispatchBasicAttackDelegate是否满足条件。
 * @returns 无返回值，直接更新testDispatchBasicAttackDelegate相关状态。
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
 * testDispatchCastSkillDelegates：判断testDispatchCast技能Delegate是否满足条件。
 * @returns 无返回值，直接更新testDispatchCast技能Delegate相关状态。
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
 * testResolveLegacySkillTargetRefDelegates：读取testResolveLegacy技能目标RefDelegate并返回结果。
 * @returns 无返回值，直接更新testResolveLegacy技能目标RefDelegate相关状态。
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
 * testDispatchCastSkillToMonsterDelegates：判断testDispatchCast技能To怪物Delegate是否满足条件。
 * @returns 无返回值，直接更新testDispatchCast技能To怪物Delegate相关状态。
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
 * testDispatchCastSkillToTileDelegates：判断testDispatchCast技能ToTileDelegate是否满足条件。
 * @returns 无返回值，直接更新testDispatchCast技能ToTileDelegate相关状态。
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
 * testDispatchEngageBattleDelegates：判断testDispatchEngageBattleDelegate是否满足条件。
 * @returns 无返回值，直接更新testDispatchEngageBattleDelegate相关状态。
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
