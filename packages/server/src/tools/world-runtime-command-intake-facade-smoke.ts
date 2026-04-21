// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeCommandIntakeFacadeService } = require("../runtime/world/world-runtime-command-intake-facade.service");
/**
 * testCommandIntakeFacade：执行testCommandIntakeFacade相关逻辑。
 * @returns 无返回值，直接更新testCommandIntakeFacade相关状态。
 */


function testCommandIntakeFacade() {
    const log = [];
    const systemCommandEnqueueService = {
        enqueueGmUpdatePlayer(input) { log.push(['enqueueGmUpdatePlayer', input.playerId]); return 'gmUpdate'; },
        enqueueGmResetPlayer(playerIdInput) { log.push(['enqueueGmResetPlayer', playerIdInput]); return 'gmReset'; },
        enqueueGmSpawnBots(anchorPlayerIdInput, countInput) { log.push(['enqueueGmSpawnBots', anchorPlayerIdInput, countInput]); return 'gmSpawnBots'; },
        enqueueGmRemoveBots(playerIdsInput, allInput) { log.push(['enqueueGmRemoveBots', playerIdsInput.length, allInput]); return 'gmRemoveBots'; },
    };
    const service = new WorldRuntimeCommandIntakeFacadeService(systemCommandEnqueueService);
    const deps = {
        worldRuntimeNavigationService: {        
        /**
 * enqueueMove：处理Move并更新相关状态。
 * @param playerId 玩家 ID。
 * @param directionInput 参数说明。
 * @returns 无返回值，直接更新Move相关状态。
 */

            enqueueMove(playerId, directionInput) { log.push(['enqueueMove', playerId, directionInput]); return 'move'; },            
            /**
 * enqueueMoveTo：处理MoveTo并更新相关状态。
 * @param playerId 玩家 ID。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @returns 无返回值，直接更新MoveTo相关状态。
 */

            enqueueMoveTo(playerId, xInput, yInput) { log.push(['enqueueMoveTo', playerId, xInput, yInput]); return 'moveTo'; },            
            /**
 * usePortal：执行use传送门相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新usePortal相关状态。
 */

            usePortal(playerId) { log.push(['usePortal', playerId]); return 'portal'; },            
            /**
 * navigateQuest：执行navigate任务相关逻辑。
 * @param playerId 玩家 ID。
 * @param questIdInput 参数说明。
 * @returns 无返回值，直接更新navigate任务相关状态。
 */

            navigateQuest(playerId, questIdInput) { log.push(['navigateQuest', playerId, questIdInput]); return 'quest'; },
        },
        worldRuntimePlayerCommandEnqueueService: {        
        /**
 * enqueueBasicAttack：处理BasicAttack并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新BasicAttack相关状态。
 */

            enqueueBasicAttack(playerId) { log.push(['enqueueBasicAttack', playerId]); return 'basic'; },            
            /**
 * enqueueBattleTarget：读取Battle目标并返回结果。
 * @param playerId 玩家 ID。
 * @param locked 参数说明。
 * @returns 无返回值，直接更新Battle目标相关状态。
 */

            enqueueBattleTarget(playerId, locked) { log.push(['enqueueBattleTarget', playerId, locked]); return 'battle'; },            
            /**
 * enqueueUseItem：处理Use道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @returns 无返回值，直接更新Use道具相关状态。
 */

            enqueueUseItem(playerId, slotIndexInput) { log.push(['enqueueUseItem', playerId, slotIndexInput]); return 'use'; },            
            /**
 * enqueueDropItem：处理Drop道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @param countInput 参数说明。
 * @returns 无返回值，直接更新Drop道具相关状态。
 */

            enqueueDropItem(playerId, slotIndexInput, countInput) { log.push(['enqueueDropItem', playerId, slotIndexInput, countInput]); return 'drop'; },            
            /**
 * enqueueTakeGround：处理Take地面并更新相关状态。
 * @param playerId 玩家 ID。
 * @param sourceIdInput 参数说明。
 * @param itemKeyInput 参数说明。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

            enqueueTakeGround(playerId, sourceIdInput, itemKeyInput) { log.push(['enqueueTakeGround', playerId, sourceIdInput, itemKeyInput]); return 'take'; },            
            /**
 * enqueueTakeGroundAll：处理Take地面All并更新相关状态。
 * @param playerId 玩家 ID。
 * @param sourceIdInput 参数说明。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

            enqueueTakeGroundAll(playerId, sourceIdInput) { log.push(['enqueueTakeGroundAll', playerId, sourceIdInput]); return 'takeAll'; },            
            /**
 * enqueueEquip：处理Equip并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @returns 无返回值，直接更新Equip相关状态。
 */

            enqueueEquip(playerId, slotIndexInput) { log.push(['enqueueEquip', playerId, slotIndexInput]); return 'equip'; },            
            /**
 * enqueueUnequip：处理Unequip并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotInput 参数说明。
 * @returns 无返回值，直接更新Unequip相关状态。
 */

            enqueueUnequip(playerId, slotInput) { log.push(['enqueueUnequip', playerId, slotInput]); return 'unequip'; },            
            /**
 * enqueueCultivate：处理Cultivate并更新相关状态。
 * @param playerId 玩家 ID。
 * @param techniqueIdInput 参数说明。
 * @returns 无返回值，直接更新Cultivate相关状态。
 */

            enqueueCultivate(playerId, techniqueIdInput) { log.push(['enqueueCultivate', playerId, techniqueIdInput]); return 'cultivate'; },            
            /**
 * enqueueStartAlchemy：处理开始炼丹并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Start炼丹相关状态。
 */

            enqueueStartTechniqueActivity(playerId, kind, payload) {
                const marker = kind === 'alchemy' ? payload.recipeId : payload.itemId;
                log.push(['enqueueStartTechniqueActivity', playerId, kind, marker]);
                return kind === 'alchemy' ? 'startAlchemy' : 'startEnhancement';
            },            
            /**
 * enqueueCancelTechniqueActivity：判断Cancel技艺活动是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
 */

            enqueueCancelTechniqueActivity(playerId, kind) {
                log.push(['enqueueCancelTechniqueActivity', playerId, kind]);
                return kind === 'alchemy' ? 'cancelAlchemy' : 'cancelEnhancement';
            },            
            /**
 * enqueueSaveAlchemyPreset：处理Save炼丹Preset并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
 */

            enqueueSaveAlchemyPreset(playerId, payload) { log.push(['enqueueSaveAlchemyPreset', playerId, payload.presetId]); return 'savePreset'; },            
            /**
 * enqueueDeleteAlchemyPreset：处理Delete炼丹Preset并更新相关状态。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
 */

            enqueueDeleteAlchemyPreset(playerId, presetId) { log.push(['enqueueDeleteAlchemyPreset', playerId, presetId]); return 'deletePreset'; },            
            /**
 * enqueueStartEnhancement：处理开始强化并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Start强化相关状态。
 */

            /**
 * enqueueRedeemCodes：处理RedeemCode并更新相关状态。
 * @param playerId 玩家 ID。
 * @param codesInput 参数说明。
 * @returns 无返回值，直接更新RedeemCode相关状态。
 */

            enqueueRedeemCodes(playerId, codesInput) { log.push(['enqueueRedeemCodes', playerId, codesInput.length]); return 'redeem'; },            
            /**
 * enqueueHeavenGateAction：处理HeavenGateAction并更新相关状态。
 * @param playerId 玩家 ID。
 * @param actionInput 参数说明。
 * @param elementInput 参数说明。
 * @returns 无返回值，直接更新HeavenGateAction相关状态。
 */

            enqueueHeavenGateAction(playerId, actionInput, elementInput) { log.push(['enqueueHeavenGateAction', playerId, actionInput, elementInput]); return 'heavenGate'; },            
            /**
 * enqueueCastSkill：处理Cast技能并更新相关状态。
 * @param playerId 玩家 ID。
 * @param skillIdInput 参数说明。
 * @returns 无返回值，直接更新Cast技能相关状态。
 */

            enqueueCastSkill(playerId, skillIdInput) { log.push(['enqueueCastSkill', playerId, skillIdInput]); return 'cast'; },            
            /**
 * enqueueCastSkillTargetRef：读取Cast技能目标Ref并返回结果。
 * @param playerId 玩家 ID。
 * @param skillIdInput 参数说明。
 * @param targetRefInput 参数说明。
 * @returns 无返回值，直接更新Cast技能目标Ref相关状态。
 */

            enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput) { log.push(['enqueueCastSkillTargetRef', playerId, skillIdInput, targetRefInput.kind]); return 'castRef'; },
        },
        worldRuntimeActionExecutionService: {        
        /**
 * executeAction：执行executeAction相关逻辑。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @returns 无返回值，直接更新executeAction相关状态。
 */

            executeAction(playerId, actionIdInput) { log.push(['executeAction', playerId, actionIdInput]); return 'action'; },            
            /**
 * executeLegacyNpcAction：执行executeLegacyNPCAction相关逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新executeLegacyNPCAction相关状态。
 */

            executeLegacyNpcAction(playerId, npcId) { log.push(['executeLegacyNpcAction', playerId, npcId]); return 'legacy'; },
        },
        worldRuntimeNpcShopService: {        
        /**
 * enqueueBuyNpcShopItem：处理BuyNPCShop道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param itemIdInput 参数说明。
 * @param quantityInput 参数说明。
 * @returns 无返回值，直接更新BuyNPCShop道具相关状态。
 */

            enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput) { log.push(['enqueueBuyNpcShopItem', playerId, npcIdInput, itemIdInput, quantityInput]); return 'buy'; },
        },
        worldRuntimeNpcQuestWriteService: {        
        /**
 * enqueueNpcInteraction：处理NPCInteraction并更新相关状态。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @returns 无返回值，直接更新NPCInteraction相关状态。
 */

            enqueueNpcInteraction(playerId, actionIdInput) { log.push(['enqueueNpcInteraction', playerId, actionIdInput]); return 'npc'; },            
            /**
 * enqueueLegacyNpcInteraction：处理LegacyNPCInteraction并更新相关状态。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @returns 无返回值，直接更新LegacyNPCInteraction相关状态。
 */

            enqueueLegacyNpcInteraction(playerId, actionIdInput) { log.push(['enqueueLegacyNpcInteraction', playerId, actionIdInput]); return 'legacyNpc'; },            
            /**
 * enqueueAcceptNpcQuest：处理AcceptNPC任务并更新相关状态。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

            enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput) { log.push(['enqueueAcceptNpcQuest', playerId, npcIdInput, questIdInput]); return 'accept'; },            
            /**
 * enqueueSubmitNpcQuest：处理SubmitNPC任务并更新相关状态。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

            enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput) { log.push(['enqueueSubmitNpcQuest', playerId, npcIdInput, questIdInput]); return 'submit'; },
        },
        worldRuntimeSystemCommandEnqueueService: {        
        /**
 * enqueueSpawnMonsterLoot：处理Spawn怪物掉落并更新相关状态。
 * @param instanceIdInput 参数说明。
 * @param monsterIdInput 参数说明。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @param rollsInput 参数说明。
 * @returns 无返回值，直接更新Spawn怪物掉落相关状态。
 */

            enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput) { log.push(['enqueueSpawnMonsterLoot', instanceIdInput, monsterIdInput, xInput, yInput, rollsInput]); return 'spawnLoot'; },            
            /**
 * enqueueDefeatMonster：处理Defeat怪物并更新相关状态。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @returns 无返回值，直接更新Defeat怪物相关状态。
 */

            enqueueDefeatMonster(instanceIdInput, runtimeIdInput) { log.push(['enqueueDefeatMonster', instanceIdInput, runtimeIdInput]); return 'defeatMonster'; },            
            /**
 * enqueueDamageMonster：处理Damage怪物并更新相关状态。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param amountInput 参数说明。
 * @returns 无返回值，直接更新Damage怪物相关状态。
 */

            enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput) { log.push(['enqueueDamageMonster', instanceIdInput, runtimeIdInput, amountInput]); return 'damageMonster'; },            
            /**
 * enqueueDamagePlayer：处理Damage玩家并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param amountInput 参数说明。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

            enqueueDamagePlayer(playerIdInput, amountInput) { log.push(['enqueueDamagePlayer', playerIdInput, amountInput]); return 'damagePlayer'; },            
            /**
 * enqueueRespawnPlayer：处理重生玩家并更新相关状态。
 * @param playerIdInput 参数说明。
 * @returns 无返回值，直接更新重生玩家相关状态。
 */

            enqueueRespawnPlayer(playerIdInput) { log.push(['enqueueRespawnPlayer', playerIdInput]); return 'respawn'; },            
            /**
 * enqueueResetPlayerSpawn：处理Reset玩家Spawn并更新相关状态。
 * @param playerIdInput 参数说明。
 * @returns 无返回值，直接更新Reset玩家Spawn相关状态。
 */

            enqueueResetPlayerSpawn(playerIdInput) { log.push(['enqueueResetPlayerSpawn', playerIdInput]); return 'resetSpawn'; },            
            /**
 * enqueueGmUpdatePlayer：处理GMUpdate玩家并更新相关状态。
 * @param input 输入参数。
 * @returns 无返回值，直接更新GMUpdate玩家相关状态。
 */

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
    assert.equal(service.enqueueStartTechniqueActivity('player:1', 'alchemy', { recipeId: 'recipe:2' }, deps), 'startAlchemy');
    assert.equal(service.enqueueCancelTechniqueActivity('player:1', 'alchemy', deps), 'cancelAlchemy');
    assert.equal(service.enqueueSaveAlchemyPreset('player:1', { presetId: 'preset:1' }, deps), 'savePreset');
    assert.equal(service.enqueueDeleteAlchemyPreset('player:1', 'preset:1', deps), 'deletePreset');
    assert.equal(service.enqueueStartEnhancement('player:1', { itemId: 'item:1' }, deps), 'startEnhancement');
    assert.equal(service.enqueueCancelEnhancement('player:1', deps), 'cancelEnhancement');
    assert.equal(service.enqueueStartTechniqueActivity('player:1', 'enhancement', { itemId: 'item:2' }, deps), 'startEnhancement');
    assert.equal(service.enqueueCancelTechniqueActivity('player:1', 'enhancement', deps), 'cancelEnhancement');
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
    assert.equal(service.enqueueGmUpdatePlayer({ playerId: 'player:1' }), 'gmUpdate');
    assert.equal(service.enqueueGmResetPlayer('player:1'), 'gmReset');
    assert.equal(service.enqueueGmSpawnBots('player:1', 2), 'gmSpawnBots');
    assert.equal(service.enqueueGmRemoveBots(['bot:1'], true), 'gmRemoveBots');
    assert.ok(log.length > 30);
}

testCommandIntakeFacade();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-command-intake-facade' }, null, 2));
