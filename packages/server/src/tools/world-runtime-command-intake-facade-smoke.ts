// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeCommandIntakeFacadeService } = require("../runtime/world/world-runtime-command-intake-facade.service");
/**
 * testCommandIntakeFacade：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testCommandIntakeFacade() {
    const service = new WorldRuntimeCommandIntakeFacadeService();
    const log = [];
    const deps = {
        worldRuntimeNavigationService: {        
        /**
 * enqueueMove：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param directionInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueMove(playerId, directionInput) { log.push(['enqueueMove', playerId, directionInput]); return 'move'; },            
            /**
 * enqueueMoveTo：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueMoveTo(playerId, xInput, yInput) { log.push(['enqueueMoveTo', playerId, xInput, yInput]); return 'moveTo'; },            
            /**
 * usePortal：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            usePortal(playerId) { log.push(['usePortal', playerId]); return 'portal'; },            
            /**
 * navigateQuest：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param questIdInput 参数说明。
 * @returns 函数返回值。
 */

            navigateQuest(playerId, questIdInput) { log.push(['navigateQuest', playerId, questIdInput]); return 'quest'; },
        },
        worldRuntimePlayerCommandEnqueueService: {        
        /**
 * enqueueBasicAttack：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            enqueueBasicAttack(playerId) { log.push(['enqueueBasicAttack', playerId]); return 'basic'; },            
            /**
 * enqueueBattleTarget：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param locked 参数说明。
 * @returns 函数返回值。
 */

            enqueueBattleTarget(playerId, locked) { log.push(['enqueueBattleTarget', playerId, locked]); return 'battle'; },            
            /**
 * enqueueUseItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueUseItem(playerId, slotIndexInput) { log.push(['enqueueUseItem', playerId, slotIndexInput]); return 'use'; },            
            /**
 * enqueueDropItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @param countInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueDropItem(playerId, slotIndexInput, countInput) { log.push(['enqueueDropItem', playerId, slotIndexInput, countInput]); return 'drop'; },            
            /**
 * enqueueTakeGround：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param sourceIdInput 参数说明。
 * @param itemKeyInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueTakeGround(playerId, sourceIdInput, itemKeyInput) { log.push(['enqueueTakeGround', playerId, sourceIdInput, itemKeyInput]); return 'take'; },            
            /**
 * enqueueTakeGroundAll：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param sourceIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueTakeGroundAll(playerId, sourceIdInput) { log.push(['enqueueTakeGroundAll', playerId, sourceIdInput]); return 'takeAll'; },            
            /**
 * enqueueEquip：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueEquip(playerId, slotIndexInput) { log.push(['enqueueEquip', playerId, slotIndexInput]); return 'equip'; },            
            /**
 * enqueueUnequip：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueUnequip(playerId, slotInput) { log.push(['enqueueUnequip', playerId, slotInput]); return 'unequip'; },            
            /**
 * enqueueCultivate：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueCultivate(playerId, techniqueIdInput) { log.push(['enqueueCultivate', playerId, techniqueIdInput]); return 'cultivate'; },            
            /**
 * enqueueStartAlchemy：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

            enqueueStartAlchemy(playerId, payload) { log.push(['enqueueStartAlchemy', playerId, payload.recipeId]); return 'startAlchemy'; },            
            /**
 * enqueueCancelAlchemy：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            enqueueCancelAlchemy(playerId) { log.push(['enqueueCancelAlchemy', playerId]); return 'cancelAlchemy'; },            
            /**
 * enqueueSaveAlchemyPreset：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

            enqueueSaveAlchemyPreset(playerId, payload) { log.push(['enqueueSaveAlchemyPreset', playerId, payload.presetId]); return 'savePreset'; },            
            /**
 * enqueueDeleteAlchemyPreset：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @returns 函数返回值。
 */

            enqueueDeleteAlchemyPreset(playerId, presetId) { log.push(['enqueueDeleteAlchemyPreset', playerId, presetId]); return 'deletePreset'; },            
            /**
 * enqueueStartEnhancement：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

            enqueueStartEnhancement(playerId, payload) { log.push(['enqueueStartEnhancement', playerId, payload.itemId]); return 'startEnhancement'; },            
            /**
 * enqueueCancelEnhancement：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            enqueueCancelEnhancement(playerId) { log.push(['enqueueCancelEnhancement', playerId]); return 'cancelEnhancement'; },            
            /**
 * enqueueRedeemCodes：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param codesInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueRedeemCodes(playerId, codesInput) { log.push(['enqueueRedeemCodes', playerId, codesInput.length]); return 'redeem'; },            
            /**
 * enqueueHeavenGateAction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param actionInput 参数说明。
 * @param elementInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueHeavenGateAction(playerId, actionInput, elementInput) { log.push(['enqueueHeavenGateAction', playerId, actionInput, elementInput]); return 'heavenGate'; },            
            /**
 * enqueueCastSkill：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param skillIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueCastSkill(playerId, skillIdInput) { log.push(['enqueueCastSkill', playerId, skillIdInput]); return 'cast'; },            
            /**
 * enqueueCastSkillTargetRef：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param skillIdInput 参数说明。
 * @param targetRefInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput) { log.push(['enqueueCastSkillTargetRef', playerId, skillIdInput, targetRefInput.kind]); return 'castRef'; },
        },
        worldRuntimeActionExecutionService: {        
        /**
 * executeAction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @returns 函数返回值。
 */

            executeAction(playerId, actionIdInput) { log.push(['executeAction', playerId, actionIdInput]); return 'action'; },            
            /**
 * executeLegacyNpcAction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

            executeLegacyNpcAction(playerId, npcId) { log.push(['executeLegacyNpcAction', playerId, npcId]); return 'legacy'; },
        },
        worldRuntimeNpcShopService: {        
        /**
 * enqueueBuyNpcShopItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param itemIdInput 参数说明。
 * @param quantityInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput) { log.push(['enqueueBuyNpcShopItem', playerId, npcIdInput, itemIdInput, quantityInput]); return 'buy'; },
        },
        worldRuntimeNpcQuestWriteService: {        
        /**
 * enqueueNpcInteraction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueNpcInteraction(playerId, actionIdInput) { log.push(['enqueueNpcInteraction', playerId, actionIdInput]); return 'npc'; },            
            /**
 * enqueueLegacyNpcInteraction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueLegacyNpcInteraction(playerId, actionIdInput) { log.push(['enqueueLegacyNpcInteraction', playerId, actionIdInput]); return 'legacyNpc'; },            
            /**
 * enqueueAcceptNpcQuest：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput) { log.push(['enqueueAcceptNpcQuest', playerId, npcIdInput, questIdInput]); return 'accept'; },            
            /**
 * enqueueSubmitNpcQuest：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput) { log.push(['enqueueSubmitNpcQuest', playerId, npcIdInput, questIdInput]); return 'submit'; },
        },
        worldRuntimeSystemCommandEnqueueService: {        
        /**
 * enqueueSpawnMonsterLoot：执行核心业务逻辑。
 * @param instanceIdInput 参数说明。
 * @param monsterIdInput 参数说明。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @param rollsInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput) { log.push(['enqueueSpawnMonsterLoot', instanceIdInput, monsterIdInput, xInput, yInput, rollsInput]); return 'spawnLoot'; },            
            /**
 * enqueueDefeatMonster：执行核心业务逻辑。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueDefeatMonster(instanceIdInput, runtimeIdInput) { log.push(['enqueueDefeatMonster', instanceIdInput, runtimeIdInput]); return 'defeatMonster'; },            
            /**
 * enqueueDamageMonster：执行核心业务逻辑。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param amountInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput) { log.push(['enqueueDamageMonster', instanceIdInput, runtimeIdInput, amountInput]); return 'damageMonster'; },            
            /**
 * enqueueDamagePlayer：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @param amountInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueDamagePlayer(playerIdInput, amountInput) { log.push(['enqueueDamagePlayer', playerIdInput, amountInput]); return 'damagePlayer'; },            
            /**
 * enqueueRespawnPlayer：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueRespawnPlayer(playerIdInput) { log.push(['enqueueRespawnPlayer', playerIdInput]); return 'respawn'; },            
            /**
 * enqueueResetPlayerSpawn：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueResetPlayerSpawn(playerIdInput) { log.push(['enqueueResetPlayerSpawn', playerIdInput]); return 'resetSpawn'; },            
            /**
 * enqueueGmUpdatePlayer：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

            enqueueGmUpdatePlayer(input) { log.push(['enqueueGmUpdatePlayer', input.playerId]); return 'gmUpdate'; },            
            /**
 * enqueueGmResetPlayer：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueGmResetPlayer(playerIdInput) { log.push(['enqueueGmResetPlayer', playerIdInput]); return 'gmReset'; },            
            /**
 * enqueueGmSpawnBots：执行核心业务逻辑。
 * @param anchorPlayerIdInput 参数说明。
 * @param countInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueGmSpawnBots(anchorPlayerIdInput, countInput) { log.push(['enqueueGmSpawnBots', anchorPlayerIdInput, countInput]); return 'gmSpawnBots'; },            
            /**
 * enqueueGmRemoveBots：执行核心业务逻辑。
 * @param playerIdsInput 参数说明。
 * @param allInput 参数说明。
 * @returns 函数返回值。
 */

            enqueueGmRemoveBots(playerIdsInput, allInput) { log.push(['enqueueGmRemoveBots', playerIdsInput.length, allInput]); return 'gmRemoveBots'; },
        },
    };

    assert.equal(service.enqueueMove('player:1', 'east', deps), 'move');
    assert.equal(service.enqueueMoveTo('player:1', 1, 2, true, null, null, null, null, deps), 'moveTo');
    assert.equal(service.usePortal('player:1', deps), 'portal');
    assert.equal(service.navigateQuest('player:1', 'quest:1', deps), 'quest');
    assert.equal(service.enqueueBasicAttack('player:1', null, 'monster:1', 1, 2, deps), 'basic');
    assert.equal(service.enqueueBattleTarget('player:1', true, null, 'monster:1', 1, 2, deps), 'battle');
    assert.equal(service.executeAction('player:1', 'portal:travel', null, deps), 'action');
    assert.equal(service.executeLegacyNpcAction('player:1', 'npc:1', deps), 'legacy');
    assert.equal(service.enqueueUseItem('player:1', 2, deps), 'use');
    assert.equal(service.enqueueDropItem('player:1', 2, 1, deps), 'drop');
    assert.equal(service.enqueueTakeGround('player:1', 'ground:1', 'item:1', deps), 'take');
    assert.equal(service.enqueueTakeGroundAll('player:1', 'ground:1', deps), 'takeAll');
    assert.equal(service.enqueueEquip('player:1', 2, deps), 'equip');
    assert.equal(service.enqueueUnequip('player:1', 'weapon', deps), 'unequip');
    assert.equal(service.enqueueCultivate('player:1', 'tech:1', deps), 'cultivate');
    assert.equal(service.enqueueStartAlchemy('player:1', { recipeId: 'recipe:1' }, deps), 'startAlchemy');
    assert.equal(service.enqueueCancelAlchemy('player:1', deps), 'cancelAlchemy');
    assert.equal(service.enqueueSaveAlchemyPreset('player:1', { presetId: 'preset:1' }, deps), 'savePreset');
    assert.equal(service.enqueueDeleteAlchemyPreset('player:1', 'preset:1', deps), 'deletePreset');
    assert.equal(service.enqueueStartEnhancement('player:1', { itemId: 'item:1' }, deps), 'startEnhancement');
    assert.equal(service.enqueueCancelEnhancement('player:1', deps), 'cancelEnhancement');
    assert.equal(service.enqueueRedeemCodes('player:1', ['A'], deps), 'redeem');
    assert.equal(service.enqueueHeavenGateAction('player:1', 'open', 'metal', deps), 'heavenGate');
    assert.equal(service.enqueueCastSkill('player:1', 'skill:1', null, 'monster:1', null, deps), 'cast');
    assert.equal(service.enqueueCastSkillTargetRef('player:1', 'skill:1', { kind: 'tile' }, deps), 'castRef');
    assert.equal(service.enqueueBuyNpcShopItem('player:1', 'npc:1', 'item:1', 2, deps), 'buy');
    assert.equal(service.enqueueNpcInteraction('player:1', 'npc_quests:talk', deps), 'npc');
    assert.equal(service.enqueueLegacyNpcInteraction('player:1', 'npc:legacy', deps), 'legacyNpc');
    assert.equal(service.enqueueAcceptNpcQuest('player:1', 'npc:1', 'quest:1', deps), 'accept');
    assert.equal(service.enqueueSubmitNpcQuest('player:1', 'npc:1', 'quest:1', deps), 'submit');
    assert.equal(service.enqueueSpawnMonsterLoot('public:yunlai_town', 'monster:1', 1, 2, 3, deps), 'spawnLoot');
    assert.equal(service.enqueueDefeatMonster('public:yunlai_town', 'monster:runtime:1', deps), 'defeatMonster');
    assert.equal(service.enqueueDamageMonster('public:yunlai_town', 'monster:runtime:1', 9, deps), 'damageMonster');
    assert.equal(service.enqueueDamagePlayer('player:1', 12, deps), 'damagePlayer');
    assert.equal(service.enqueueRespawnPlayer('player:1', deps), 'respawn');
    assert.equal(service.enqueueResetPlayerSpawn('player:1', deps), 'resetSpawn');
    assert.equal(service.enqueueGmUpdatePlayer({ playerId: 'player:1' }, deps), 'gmUpdate');
    assert.equal(service.enqueueGmResetPlayer('player:1', deps), 'gmReset');
    assert.equal(service.enqueueGmSpawnBots('player:1', 2, deps), 'gmSpawnBots');
    assert.equal(service.enqueueGmRemoveBots(['bot:1'], true, deps), 'gmRemoveBots');
    assert.ok(log.length > 30);
}

testCommandIntakeFacade();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-command-intake-facade' }, null, 2));
