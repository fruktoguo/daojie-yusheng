"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeCommandIntakeFacadeService } = require("../runtime/world/world-runtime-command-intake-facade.service");

function testCommandIntakeFacade() {
    const service = new WorldRuntimeCommandIntakeFacadeService();
    const log = [];
    const deps = {
        worldRuntimeNavigationService: {
            enqueueMove(playerId, directionInput) { log.push(['enqueueMove', playerId, directionInput]); return 'move'; },
            enqueueMoveTo(playerId, xInput, yInput) { log.push(['enqueueMoveTo', playerId, xInput, yInput]); return 'moveTo'; },
            usePortal(playerId) { log.push(['usePortal', playerId]); return 'portal'; },
            navigateQuest(playerId, questIdInput) { log.push(['navigateQuest', playerId, questIdInput]); return 'quest'; },
        },
        worldRuntimePlayerCommandEnqueueService: {
            enqueueBasicAttack(playerId) { log.push(['enqueueBasicAttack', playerId]); return 'basic'; },
            enqueueBattleTarget(playerId, locked) { log.push(['enqueueBattleTarget', playerId, locked]); return 'battle'; },
            enqueueUseItem(playerId, slotIndexInput) { log.push(['enqueueUseItem', playerId, slotIndexInput]); return 'use'; },
            enqueueDropItem(playerId, slotIndexInput, countInput) { log.push(['enqueueDropItem', playerId, slotIndexInput, countInput]); return 'drop'; },
            enqueueTakeGround(playerId, sourceIdInput, itemKeyInput) { log.push(['enqueueTakeGround', playerId, sourceIdInput, itemKeyInput]); return 'take'; },
            enqueueTakeGroundAll(playerId, sourceIdInput) { log.push(['enqueueTakeGroundAll', playerId, sourceIdInput]); return 'takeAll'; },
            enqueueEquip(playerId, slotIndexInput) { log.push(['enqueueEquip', playerId, slotIndexInput]); return 'equip'; },
            enqueueUnequip(playerId, slotInput) { log.push(['enqueueUnequip', playerId, slotInput]); return 'unequip'; },
            enqueueCultivate(playerId, techniqueIdInput) { log.push(['enqueueCultivate', playerId, techniqueIdInput]); return 'cultivate'; },
            enqueueStartAlchemy(playerId, payload) { log.push(['enqueueStartAlchemy', playerId, payload.recipeId]); return 'startAlchemy'; },
            enqueueCancelAlchemy(playerId) { log.push(['enqueueCancelAlchemy', playerId]); return 'cancelAlchemy'; },
            enqueueSaveAlchemyPreset(playerId, payload) { log.push(['enqueueSaveAlchemyPreset', playerId, payload.presetId]); return 'savePreset'; },
            enqueueDeleteAlchemyPreset(playerId, presetId) { log.push(['enqueueDeleteAlchemyPreset', playerId, presetId]); return 'deletePreset'; },
            enqueueStartEnhancement(playerId, payload) { log.push(['enqueueStartEnhancement', playerId, payload.itemId]); return 'startEnhancement'; },
            enqueueCancelEnhancement(playerId) { log.push(['enqueueCancelEnhancement', playerId]); return 'cancelEnhancement'; },
            enqueueRedeemCodes(playerId, codesInput) { log.push(['enqueueRedeemCodes', playerId, codesInput.length]); return 'redeem'; },
            enqueueHeavenGateAction(playerId, actionInput, elementInput) { log.push(['enqueueHeavenGateAction', playerId, actionInput, elementInput]); return 'heavenGate'; },
            enqueueCastSkill(playerId, skillIdInput) { log.push(['enqueueCastSkill', playerId, skillIdInput]); return 'cast'; },
            enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput) { log.push(['enqueueCastSkillTargetRef', playerId, skillIdInput, targetRefInput.kind]); return 'castRef'; },
        },
        worldRuntimeActionExecutionService: {
            executeAction(playerId, actionIdInput) { log.push(['executeAction', playerId, actionIdInput]); return 'action'; },
            executeLegacyNpcAction(playerId, npcId) { log.push(['executeLegacyNpcAction', playerId, npcId]); return 'legacy'; },
        },
        worldRuntimeNpcShopService: {
            enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput) { log.push(['enqueueBuyNpcShopItem', playerId, npcIdInput, itemIdInput, quantityInput]); return 'buy'; },
        },
        worldRuntimeNpcQuestWriteService: {
            enqueueNpcInteraction(playerId, actionIdInput) { log.push(['enqueueNpcInteraction', playerId, actionIdInput]); return 'npc'; },
            enqueueLegacyNpcInteraction(playerId, actionIdInput) { log.push(['enqueueLegacyNpcInteraction', playerId, actionIdInput]); return 'legacyNpc'; },
            enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput) { log.push(['enqueueAcceptNpcQuest', playerId, npcIdInput, questIdInput]); return 'accept'; },
            enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput) { log.push(['enqueueSubmitNpcQuest', playerId, npcIdInput, questIdInput]); return 'submit'; },
        },
        worldRuntimeSystemCommandEnqueueService: {
            enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput) { log.push(['enqueueSpawnMonsterLoot', instanceIdInput, monsterIdInput, xInput, yInput, rollsInput]); return 'spawnLoot'; },
            enqueueDefeatMonster(instanceIdInput, runtimeIdInput) { log.push(['enqueueDefeatMonster', instanceIdInput, runtimeIdInput]); return 'defeatMonster'; },
            enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput) { log.push(['enqueueDamageMonster', instanceIdInput, runtimeIdInput, amountInput]); return 'damageMonster'; },
            enqueueDamagePlayer(playerIdInput, amountInput) { log.push(['enqueueDamagePlayer', playerIdInput, amountInput]); return 'damagePlayer'; },
            enqueueRespawnPlayer(playerIdInput) { log.push(['enqueueRespawnPlayer', playerIdInput]); return 'respawn'; },
            enqueueResetPlayerSpawn(playerIdInput) { log.push(['enqueueResetPlayerSpawn', playerIdInput]); return 'resetSpawn'; },
            enqueueGmUpdatePlayer(input) { log.push(['enqueueGmUpdatePlayer', input.playerId]); return 'gmUpdate'; },
            enqueueGmResetPlayer(playerIdInput) { log.push(['enqueueGmResetPlayer', playerIdInput]); return 'gmReset'; },
            enqueueGmSpawnBots(anchorPlayerIdInput, countInput) { log.push(['enqueueGmSpawnBots', anchorPlayerIdInput, countInput]); return 'gmSpawnBots'; },
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
