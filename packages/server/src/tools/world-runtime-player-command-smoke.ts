// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePlayerCommandService } = require("../runtime/world/world-runtime-player-command.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(log = [], player = { hp: 10 }) {
    return new WorldRuntimePlayerCommandService({    
    /**
 * getPlayer：读取玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer(playerId) {
            log.push(['getPlayer', playerId]);
            return player;
        },
    }, {    
    /**
 * dispatchUseItem：判断Use道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新Use道具相关状态。
 */

        dispatchUseItem(playerId, slotIndex) {
            log.push(['dispatchUseItem', playerId, slotIndex]);
        },
    }, {    
    /**
 * dispatchEquipItem：判断Equip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新Equip道具相关状态。
 */

        dispatchEquipItem(playerId, slotIndex) {
            log.push(['dispatchEquipItem', playerId, slotIndex]);
        },        
        /**
 * dispatchUnequipItem：判断Unequip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @returns 无返回值，直接更新Unequip道具相关状态。
 */

        dispatchUnequipItem(playerId, slot) {
            log.push(['dispatchUnequipItem', playerId, slot]);
        },
    }, {    
    /**
 * dispatchDropItem：判断Drop道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新Drop道具相关状态。
 */

        dispatchDropItem(playerId, slotIndex, count) {
            log.push(['dispatchDropItem', playerId, slotIndex, count]);
        },        
        /**
 * dispatchTakeGround：判断Take地面是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

        dispatchTakeGround(playerId, sourceId, itemKey) {
            log.push(['dispatchTakeGround', playerId, sourceId, itemKey]);
        },        
        /**
 * dispatchTakeGroundAll：判断Take地面All是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

        dispatchTakeGroundAll(playerId, sourceId) {
            log.push(['dispatchTakeGroundAll', playerId, sourceId]);
        },
    }, {    
    /**
 * dispatchMoveTo：判断MoveTo是否满足条件。
 * @param playerId 玩家 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param allowNearestReachable 参数说明。
 * @param clientPathHint 参数说明。
 * @returns 无返回值，直接更新MoveTo相关状态。
 */

        dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint) {
            log.push(['dispatchMoveTo', playerId, x, y, allowNearestReachable, clientPathHint]);
        },
    }, {    
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
    }, {    
    /**
 * dispatchCultivateTechnique：判断Cultivate功法是否满足条件。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新Cultivate功法相关状态。
 */

        dispatchCultivateTechnique(playerId, techniqueId) {
            log.push(['dispatchCultivateTechnique', playerId, techniqueId]);
        },
    }, {    
    /**
 * dispatchStartAlchemy：判断开始炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Start炼丹相关状态。
 */

        dispatchStartAlchemy(playerId, payload) {
            log.push(['dispatchStartAlchemy', playerId, payload]);
        },        
        /**
 * dispatchCancelAlchemy：判断Cancel炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
 */

        dispatchCancelAlchemy(playerId) {
            log.push(['dispatchCancelAlchemy', playerId]);
        },        
        /**
 * dispatchSaveAlchemyPreset：判断Save炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
 */

        dispatchSaveAlchemyPreset(playerId, payload) {
            log.push(['dispatchSaveAlchemyPreset', playerId, payload]);
        },        
        /**
 * dispatchDeleteAlchemyPreset：判断Delete炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
 */

        dispatchDeleteAlchemyPreset(playerId, presetId) {
            log.push(['dispatchDeleteAlchemyPreset', playerId, presetId]);
        },
    }, {    
    /**
 * dispatchStartEnhancement：判断开始强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Start强化相关状态。
 */

        dispatchStartEnhancement(playerId, payload) {
            log.push(['dispatchStartEnhancement', playerId, payload]);
        },        
        /**
 * dispatchCancelEnhancement：判断Cancel强化是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Cancel强化相关状态。
 */

        dispatchCancelEnhancement(playerId) {
            log.push(['dispatchCancelEnhancement', playerId]);
        },
    }, {    
    /**
 * dispatchRedeemCodes：判断RedeemCode是否满足条件。
 * @param playerId 玩家 ID。
 * @param codes 参数说明。
 * @returns 无返回值，直接更新RedeemCode相关状态。
 */

        dispatchRedeemCodes(playerId, codes) {
            log.push(['dispatchRedeemCodes', playerId, codes]);
        },
    }, {    
    /**
 * dispatchBreakthrough：判断Breakthrough是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Breakthrough相关状态。
 */

        dispatchBreakthrough(playerId) {
            log.push(['dispatchBreakthrough', playerId]);
        },        
        /**
 * dispatchHeavenGateAction：判断HeavenGateAction是否满足条件。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @param element 参数说明。
 * @returns 无返回值，直接更新HeavenGateAction相关状态。
 */

        dispatchHeavenGateAction(playerId, action, element) {
            log.push(['dispatchHeavenGateAction', playerId, action, element]);
        },
    }, {    
    /**
 * dispatchBuyNpcShopItem：判断BuyNPCShop道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @returns 无返回值，直接更新BuyNPCShop道具相关状态。
 */

        dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
            log.push(['dispatchBuyNpcShopItem', playerId, npcId, itemId, quantity]);
        },
    }, {    
    /**
 * dispatchNpcInteraction：判断NPCInteraction是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新NPCInteraction相关状态。
 */

        dispatchNpcInteraction(playerId, npcId) {
            log.push(['dispatchNpcInteraction', playerId, npcId]);
        },        
        /**
 * dispatchInteractNpcQuest：判断InteractNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新InteractNPC任务相关状态。
 */

        dispatchInteractNpcQuest(playerId, npcId) {
            log.push(['dispatchInteractNpcQuest', playerId, npcId]);
        },        
        /**
 * dispatchAcceptNpcQuest：判断AcceptNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

        dispatchAcceptNpcQuest(playerId, npcId, questId) {
            log.push(['dispatchAcceptNpcQuest', playerId, npcId, questId]);
        },        
        /**
 * dispatchSubmitNpcQuest：判断SubmitNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

        dispatchSubmitNpcQuest(playerId, npcId, questId) {
            log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]);
        },
    });
}
/**
 * testUseItemDelegates：执行testUse道具Delegate相关逻辑。
 * @returns 无返回值，直接更新testUse道具Delegate相关状态。
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
 * testCastSkillDelegates：执行testCast技能Delegate相关逻辑。
 * @returns 无返回值，直接更新testCast技能Delegate相关状态。
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
 * testDeadPlayerOnlyAllowsRedeemCodes：执行testDead玩家OnlyAllowRedeemCode相关逻辑。
 * @returns 无返回值，直接更新testDead玩家OnlyAllowRedeemCode相关状态。
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
 * testTechniqueActivityRoutes：执行test技艺活动路线相关逻辑。
 * @returns 无返回值，直接更新test技艺活动路线相关状态。
 */


function testTechniqueActivityRoutes() {
    const log = [];
    const service = createService(log);
    service.dispatchStartTechniqueActivity('player:1', 'alchemy', { recipeId: 'recipe.a' }, {});
    service.dispatchCancelTechniqueActivity('player:1', 'enhancement', {});
    service.dispatchPlayerCommand('player:1', { kind: 'startEnhancement', payload: { itemId: 'item.a' } }, {});
    service.dispatchPlayerCommand('player:1', { kind: 'cancelAlchemy' }, {});
    assert.deepEqual(log, [
        ['dispatchStartAlchemy', 'player:1', { recipeId: 'recipe.a' }],
        ['dispatchCancelEnhancement', 'player:1'],
        ['getPlayer', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', { itemId: 'item.a' }],
        ['getPlayer', 'player:1'],
        ['dispatchCancelAlchemy', 'player:1'],
    ]);
}
/**
 * testNpcQuestRoutes：执行testNPC任务路线相关逻辑。
 * @returns 无返回值，直接更新testNPC任务路线相关状态。
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
testTechniqueActivityRoutes();
testNpcQuestRoutes();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-command' }, null, 2));
