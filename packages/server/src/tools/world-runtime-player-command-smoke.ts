// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePlayerCommandService } = require("../runtime/world/world-runtime-player-command.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */


function createService(log = [], player = { hp: 10 }) {
    return new WorldRuntimePlayerCommandService({    
    /**
 * getPlayer：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayer(playerId) {
            log.push(['getPlayer', playerId]);
            return player;
        },
    }, {    
    /**
 * dispatchUseItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 函数返回值。
 */

        dispatchUseItem(playerId, slotIndex) {
            log.push(['dispatchUseItem', playerId, slotIndex]);
        },
    }, {    
    /**
 * dispatchEquipItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 函数返回值。
 */

        dispatchEquipItem(playerId, slotIndex) {
            log.push(['dispatchEquipItem', playerId, slotIndex]);
        },        
        /**
 * dispatchUnequipItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @returns 函数返回值。
 */

        dispatchUnequipItem(playerId, slot) {
            log.push(['dispatchUnequipItem', playerId, slot]);
        },
    }, {    
    /**
 * dispatchDropItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 函数返回值。
 */

        dispatchDropItem(playerId, slotIndex, count) {
            log.push(['dispatchDropItem', playerId, slotIndex, count]);
        },        
        /**
 * dispatchTakeGround：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @returns 函数返回值。
 */

        dispatchTakeGround(playerId, sourceId, itemKey) {
            log.push(['dispatchTakeGround', playerId, sourceId, itemKey]);
        },        
        /**
 * dispatchTakeGroundAll：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @returns 函数返回值。
 */

        dispatchTakeGroundAll(playerId, sourceId) {
            log.push(['dispatchTakeGroundAll', playerId, sourceId]);
        },
    }, {    
    /**
 * dispatchMoveTo：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param allowNearestReachable 参数说明。
 * @param clientPathHint 参数说明。
 * @returns 函数返回值。
 */

        dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint) {
            log.push(['dispatchMoveTo', playerId, x, y, allowNearestReachable, clientPathHint]);
        },
    }, {    
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
    }, {    
    /**
 * dispatchCultivateTechnique：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 函数返回值。
 */

        dispatchCultivateTechnique(playerId, techniqueId) {
            log.push(['dispatchCultivateTechnique', playerId, techniqueId]);
        },
    }, {    
    /**
 * dispatchStartAlchemy：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

        dispatchStartAlchemy(playerId, payload) {
            log.push(['dispatchStartAlchemy', playerId, payload]);
        },        
        /**
 * dispatchCancelAlchemy：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        dispatchCancelAlchemy(playerId) {
            log.push(['dispatchCancelAlchemy', playerId]);
        },        
        /**
 * dispatchSaveAlchemyPreset：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

        dispatchSaveAlchemyPreset(playerId, payload) {
            log.push(['dispatchSaveAlchemyPreset', playerId, payload]);
        },        
        /**
 * dispatchDeleteAlchemyPreset：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @returns 函数返回值。
 */

        dispatchDeleteAlchemyPreset(playerId, presetId) {
            log.push(['dispatchDeleteAlchemyPreset', playerId, presetId]);
        },
    }, {    
    /**
 * dispatchStartEnhancement：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

        dispatchStartEnhancement(playerId, payload) {
            log.push(['dispatchStartEnhancement', playerId, payload]);
        },        
        /**
 * dispatchCancelEnhancement：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        dispatchCancelEnhancement(playerId) {
            log.push(['dispatchCancelEnhancement', playerId]);
        },
    }, {    
    /**
 * dispatchRedeemCodes：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param codes 参数说明。
 * @returns 函数返回值。
 */

        dispatchRedeemCodes(playerId, codes) {
            log.push(['dispatchRedeemCodes', playerId, codes]);
        },
    }, {    
    /**
 * dispatchBreakthrough：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        dispatchBreakthrough(playerId) {
            log.push(['dispatchBreakthrough', playerId]);
        },        
        /**
 * dispatchHeavenGateAction：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @param element 参数说明。
 * @returns 函数返回值。
 */

        dispatchHeavenGateAction(playerId, action, element) {
            log.push(['dispatchHeavenGateAction', playerId, action, element]);
        },
    }, {    
    /**
 * dispatchBuyNpcShopItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @returns 函数返回值。
 */

        dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
            log.push(['dispatchBuyNpcShopItem', playerId, npcId, itemId, quantity]);
        },
    }, {    
    /**
 * dispatchNpcInteraction：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

        dispatchNpcInteraction(playerId, npcId) {
            log.push(['dispatchNpcInteraction', playerId, npcId]);
        },        
        /**
 * dispatchInteractNpcQuest：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

        dispatchInteractNpcQuest(playerId, npcId) {
            log.push(['dispatchInteractNpcQuest', playerId, npcId]);
        },        
        /**
 * dispatchAcceptNpcQuest：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @returns 函数返回值。
 */

        dispatchAcceptNpcQuest(playerId, npcId, questId) {
            log.push(['dispatchAcceptNpcQuest', playerId, npcId, questId]);
        },        
        /**
 * dispatchSubmitNpcQuest：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @returns 函数返回值。
 */

        dispatchSubmitNpcQuest(playerId, npcId, questId) {
            log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]);
        },
    });
}
/**
 * testUseItemDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testUseItemDelegates() {
    const log = [];
    const service = createService(log);
    service.dispatchPlayerCommand('player:1', { kind: 'useItem', slotIndex: 2 }, {});
    assert.deepEqual(log, [
        ['getPlayer', 'player:1'],
        ['dispatchUseItem', 'player:1', 2],
    ]);
}
/**
 * testCastSkillDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


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
/**
 * testDeadPlayerOnlyAllowsRedeemCodes：执行核心业务逻辑。
 * @returns 函数返回值。
 */


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
/**
 * testNpcQuestRoutes：执行核心业务逻辑。
 * @returns 函数返回值。
 */


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
