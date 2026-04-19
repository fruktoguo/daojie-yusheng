"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeGameplayWriteFacadeService } = require("../runtime/world/world-runtime-gameplay-write-facade.service");

function testGameplayWriteFacade() {
    const service = new WorldRuntimeGameplayWriteFacadeService();
    const log = [];
    const deps = {
        worldRuntimeRedeemCodeService: { dispatchRedeemCodes(playerId, codes) { log.push(['dispatchRedeemCodes', playerId, codes]); } },
        worldRuntimeCombatCommandService: {
            dispatchCastSkill(playerId, skillId) { log.push(['dispatchCastSkill', playerId, skillId]); },
            resolveLegacySkillTargetRef(attacker, skill, targetRef) { return { attacker: attacker.playerId, skillId: skill.id, targetRef }; },
            dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) { log.push(['dispatchEngageBattle', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]); },
            dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) { log.push(['dispatchCastSkillToMonster', attacker.playerId, skillId, targetMonsterId]); },
            dispatchCastSkillToTile(attacker, skillId, targetX, targetY) { log.push(['dispatchCastSkillToTile', attacker.playerId, skillId, targetX, targetY]); },
            dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) { log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]); },
        },
        worldRuntimeUseItemService: { dispatchUseItem(playerId, slotIndex) { log.push(['dispatchUseItem', playerId, slotIndex]); } },
        worldRuntimeProgressionService: {
            dispatchBreakthrough(playerId) { log.push(['dispatchBreakthrough', playerId]); },
            dispatchHeavenGateAction(playerId, action, element) { log.push(['dispatchHeavenGateAction', playerId, action, element]); },
        },
        worldRuntimeItemGroundService: {
            dispatchDropItem(playerId, slotIndex, count) { log.push(['dispatchDropItem', playerId, slotIndex, count]); },
            dispatchTakeGround(playerId, sourceId, itemKey) { log.push(['dispatchTakeGround', playerId, sourceId, itemKey]); },
            dispatchTakeGroundAll(playerId, sourceId) { log.push(['dispatchTakeGroundAll', playerId, sourceId]); },
        },
        worldRuntimeNpcShopService: { dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) { log.push(['dispatchBuyNpcShopItem', playerId, npcId, itemId, quantity]); } },
        worldRuntimeNpcQuestWriteService: {
            dispatchNpcInteraction(playerId, npcId) { log.push(['dispatchNpcInteraction', playerId, npcId]); },
            dispatchInteractNpcQuest(playerId, npcId) { log.push(['dispatchInteractNpcQuest', playerId, npcId]); },
            dispatchAcceptNpcQuest(playerId, npcId, questId) { log.push(['dispatchAcceptNpcQuest', playerId, npcId, questId]); },
            dispatchSubmitNpcQuest(playerId, npcId, questId) { log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]); },
        },
        worldRuntimeEquipmentService: {
            dispatchEquipItem(playerId, slotIndex) { log.push(['dispatchEquipItem', playerId, slotIndex]); },
            dispatchUnequipItem(playerId, slot) { log.push(['dispatchUnequipItem', playerId, slot]); },
        },
        worldRuntimeCultivationService: { dispatchCultivateTechnique(playerId, techniqueId) { log.push(['dispatchCultivateTechnique', playerId, techniqueId]); } },
        worldRuntimeAlchemyService: {
            dispatchStartAlchemy(playerId, payload) { log.push(['dispatchStartAlchemy', playerId, payload.recipeId]); },
            dispatchCancelAlchemy(playerId) { log.push(['dispatchCancelAlchemy', playerId]); },
            dispatchSaveAlchemyPreset(playerId, payload) { log.push(['dispatchSaveAlchemyPreset', playerId, payload.presetId]); },
            dispatchDeleteAlchemyPreset(playerId, presetId) { log.push(['dispatchDeleteAlchemyPreset', playerId, presetId]); },
        },
        worldRuntimeEnhancementService: {
            dispatchStartEnhancement(playerId, payload) { log.push(['dispatchStartEnhancement', playerId, payload.itemId]); },
            dispatchCancelEnhancement(playerId) { log.push(['dispatchCancelEnhancement', playerId]); },
        },
        worldRuntimeMonsterSystemCommandService: {
            dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls) { log.push(['dispatchSpawnMonsterLoot', instanceId, x, y, monsterId, rolls]); },
            dispatchDefeatMonster(instanceId, runtimeId) { log.push(['dispatchDefeatMonster', instanceId, runtimeId]); },
            dispatchDamageMonster(instanceId, runtimeId, amount) { log.push(['dispatchDamageMonster', instanceId, runtimeId, amount]); },
        },
        worldRuntimePlayerCombatOutcomeService: {
            dispatchDamagePlayer(playerId, amount) { log.push(['dispatchDamagePlayer', playerId, amount]); },
            handlePlayerMonsterKill(instance, monster, killerPlayerId) { log.push(['handlePlayerMonsterKill', instance.meta.instanceId, monster.runtimeId, killerPlayerId]); },
            handlePlayerDefeat(playerId) { log.push(['handlePlayerDefeat', playerId]); },
            processPendingRespawns() { log.push(['processPendingRespawns']); },
            respawnPlayer(playerId) { log.push(['respawnPlayer', playerId]); },
        },
    };

    service.dispatchRedeemCodes('player:1', ['A'], deps);
    service.dispatchCastSkill('player:1', 'skill:1', null, 'monster:1', null, deps);
    assert.deepEqual(service.resolveLegacySkillTargetRef({ playerId: 'player:1' }, { id: 'skill:1' }, { kind: 'tile' }, deps), {
        attacker: 'player:1',
        skillId: 'skill:1',
        targetRef: { kind: 'tile' },
    });
    service.dispatchEngageBattle('player:1', null, 'monster:1', 10, 11, true, deps);
    service.dispatchCastSkillToMonster({ playerId: 'player:1' }, 'skill:1', 'monster:1', deps);
    service.dispatchCastSkillToTile({ playerId: 'player:1' }, 'skill:1', 10, 11, deps);
    service.dispatchUseItem('player:1', 2, deps);
    service.dispatchBreakthrough('player:1', deps);
    service.dispatchHeavenGateAction('player:1', 'open', 'metal', deps);
    service.dispatchBasicAttack('player:1', null, 'monster:1', 10, 11, deps);
    service.dispatchDropItem('player:1', 2, 1, deps);
    service.dispatchTakeGround('player:1', 'ground:1', 'item:1', deps);
    service.dispatchTakeGroundAll('player:1', 'ground:1', deps);
    service.dispatchBuyNpcShopItem('player:1', 'npc:shop', 'item:1', 2, deps);
    service.dispatchNpcInteraction('player:1', 'npc:quest', deps);
    service.dispatchEquipItem('player:1', 2, deps);
    service.dispatchUnequipItem('player:1', 'weapon', deps);
    service.dispatchCultivateTechnique('player:1', 'tech:1', deps);
    service.dispatchStartAlchemy('player:1', { recipeId: 'recipe:1' }, deps);
    service.dispatchCancelAlchemy('player:1', deps);
    service.dispatchSaveAlchemyPreset('player:1', { presetId: 'preset:1' }, deps);
    service.dispatchDeleteAlchemyPreset('player:1', 'preset:1', deps);
    service.dispatchStartEnhancement('player:1', { itemId: 'item:1' }, deps);
    service.dispatchCancelEnhancement('player:1', deps);
    service.dispatchInteractNpcQuest('player:1', 'npc:quest', deps);
    service.dispatchAcceptNpcQuest('player:1', 'npc:quest', 'quest:1', deps);
    service.dispatchSubmitNpcQuest('player:1', 'npc:quest', 'quest:1', deps);
    service.dispatchSpawnMonsterLoot('public:yunlai_town', 10, 11, 'monster:1', 2, deps);
    service.dispatchDefeatMonster('public:yunlai_town', 'monster:runtime:1', deps);
    service.dispatchDamagePlayer('player:1', 12, deps);
    service.dispatchDamageMonster('public:yunlai_town', 'monster:runtime:1', 9, deps);
    service.handlePlayerMonsterKill({ meta: { instanceId: 'public:yunlai_town' } }, { runtimeId: 'monster:runtime:1' }, 'player:1', deps);
    service.handlePlayerDefeat('player:1', deps);
    service.processPendingRespawns(deps);
    service.respawnPlayer('player:1', deps);

    assert.ok(log.length >= 30);
}

testGameplayWriteFacade();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-gameplay-write-facade' }, null, 2));
