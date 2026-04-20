// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeGameplayWriteFacadeService } = require("../runtime/world/world-runtime-gameplay-write-facade.service");
/**
 * testGameplayWriteFacade：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testGameplayWriteFacade() {
    const service = new WorldRuntimeGameplayWriteFacadeService();
    const log = [];
    const deps = {
        worldRuntimeRedeemCodeService: {        
        /**
 * dispatchRedeemCodes：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param codes 参数说明。
 * @returns 函数返回值。
 */
 dispatchRedeemCodes(playerId, codes) { log.push(['dispatchRedeemCodes', playerId, codes]); } },
        worldRuntimeCombatCommandService: {        
        /**
 * dispatchCastSkill：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @returns 函数返回值。
 */

            dispatchCastSkill(playerId, skillId) { log.push(['dispatchCastSkill', playerId, skillId]); },            
            /**
 * resolveLegacySkillTargetRef：执行核心业务逻辑。
 * @param attacker 参数说明。
 * @param skill 参数说明。
 * @param targetRef 参数说明。
 * @returns 函数返回值。
 */

            resolveLegacySkillTargetRef(attacker, skill, targetRef) { return { attacker: attacker.playerId, skillId: skill.id, targetRef }; },            
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

            dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) { log.push(['dispatchEngageBattle', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]); },            
            /**
 * dispatchCastSkillToMonster：处理事件并驱动执行路径。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @returns 函数返回值。
 */

            dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) { log.push(['dispatchCastSkillToMonster', attacker.playerId, skillId, targetMonsterId]); },            
            /**
 * dispatchCastSkillToTile：处理事件并驱动执行路径。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @returns 函数返回值。
 */

            dispatchCastSkillToTile(attacker, skillId, targetX, targetY) { log.push(['dispatchCastSkillToTile', attacker.playerId, skillId, targetX, targetY]); },            
            /**
 * dispatchBasicAttack：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @returns 函数返回值。
 */

            dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) { log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]); },
        },
        worldRuntimeUseItemService: {        
        /**
 * dispatchUseItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 函数返回值。
 */
 dispatchUseItem(playerId, slotIndex) { log.push(['dispatchUseItem', playerId, slotIndex]); } },
        worldRuntimeProgressionService: {        
        /**
 * dispatchBreakthrough：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            dispatchBreakthrough(playerId) { log.push(['dispatchBreakthrough', playerId]); },            
            /**
 * dispatchHeavenGateAction：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @param element 参数说明。
 * @returns 函数返回值。
 */

            dispatchHeavenGateAction(playerId, action, element) { log.push(['dispatchHeavenGateAction', playerId, action, element]); },
        },
        worldRuntimeItemGroundService: {        
        /**
 * dispatchDropItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 函数返回值。
 */

            dispatchDropItem(playerId, slotIndex, count) { log.push(['dispatchDropItem', playerId, slotIndex, count]); },            
            /**
 * dispatchTakeGround：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @returns 函数返回值。
 */

            dispatchTakeGround(playerId, sourceId, itemKey) { log.push(['dispatchTakeGround', playerId, sourceId, itemKey]); },            
            /**
 * dispatchTakeGroundAll：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @returns 函数返回值。
 */

            dispatchTakeGroundAll(playerId, sourceId) { log.push(['dispatchTakeGroundAll', playerId, sourceId]); },
        },
        worldRuntimeNpcShopService: {        
        /**
 * dispatchBuyNpcShopItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @returns 函数返回值。
 */
 dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) { log.push(['dispatchBuyNpcShopItem', playerId, npcId, itemId, quantity]); } },
        worldRuntimeNpcQuestWriteService: {        
        /**
 * dispatchNpcInteraction：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

            dispatchNpcInteraction(playerId, npcId) { log.push(['dispatchNpcInteraction', playerId, npcId]); },            
            /**
 * dispatchInteractNpcQuest：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

            dispatchInteractNpcQuest(playerId, npcId) { log.push(['dispatchInteractNpcQuest', playerId, npcId]); },            
            /**
 * dispatchAcceptNpcQuest：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @returns 函数返回值。
 */

            dispatchAcceptNpcQuest(playerId, npcId, questId) { log.push(['dispatchAcceptNpcQuest', playerId, npcId, questId]); },            
            /**
 * dispatchSubmitNpcQuest：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @returns 函数返回值。
 */

            dispatchSubmitNpcQuest(playerId, npcId, questId) { log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]); },
        },
        worldRuntimeEquipmentService: {        
        /**
 * dispatchEquipItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 函数返回值。
 */

            dispatchEquipItem(playerId, slotIndex) { log.push(['dispatchEquipItem', playerId, slotIndex]); },            
            /**
 * dispatchUnequipItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @returns 函数返回值。
 */

            dispatchUnequipItem(playerId, slot) { log.push(['dispatchUnequipItem', playerId, slot]); },
        },
        worldRuntimeCultivationService: {        
        /**
 * dispatchCultivateTechnique：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 函数返回值。
 */
 dispatchCultivateTechnique(playerId, techniqueId) { log.push(['dispatchCultivateTechnique', playerId, techniqueId]); } },
        worldRuntimeAlchemyService: {        
        /**
 * dispatchStartAlchemy：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

            dispatchStartAlchemy(playerId, payload) { log.push(['dispatchStartAlchemy', playerId, payload.recipeId]); },            
            /**
 * dispatchCancelAlchemy：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            dispatchCancelAlchemy(playerId) { log.push(['dispatchCancelAlchemy', playerId]); },            
            /**
 * dispatchSaveAlchemyPreset：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

            dispatchSaveAlchemyPreset(playerId, payload) { log.push(['dispatchSaveAlchemyPreset', playerId, payload.presetId]); },            
            /**
 * dispatchDeleteAlchemyPreset：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @returns 函数返回值。
 */

            dispatchDeleteAlchemyPreset(playerId, presetId) { log.push(['dispatchDeleteAlchemyPreset', playerId, presetId]); },
        },
        worldRuntimeEnhancementService: {        
        /**
 * dispatchStartEnhancement：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

            dispatchStartEnhancement(playerId, payload) { log.push(['dispatchStartEnhancement', playerId, payload.itemId]); },            
            /**
 * dispatchCancelEnhancement：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            dispatchCancelEnhancement(playerId) { log.push(['dispatchCancelEnhancement', playerId]); },
        },
        worldRuntimeMonsterSystemCommandService: {        
        /**
 * dispatchSpawnMonsterLoot：处理事件并驱动执行路径。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param monsterId monster ID。
 * @param rolls 参数说明。
 * @returns 函数返回值。
 */

            dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls) { log.push(['dispatchSpawnMonsterLoot', instanceId, x, y, monsterId, rolls]); },            
            /**
 * dispatchDefeatMonster：处理事件并驱动执行路径。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @returns 函数返回值。
 */

            dispatchDefeatMonster(instanceId, runtimeId) { log.push(['dispatchDefeatMonster', instanceId, runtimeId]); },            
            /**
 * dispatchDamageMonster：处理事件并驱动执行路径。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param amount 参数说明。
 * @returns 函数返回值。
 */

            dispatchDamageMonster(instanceId, runtimeId, amount) { log.push(['dispatchDamageMonster', instanceId, runtimeId, amount]); },
        },
        worldRuntimePlayerCombatOutcomeService: {        
        /**
 * dispatchDamagePlayer：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @returns 函数返回值。
 */

            dispatchDamagePlayer(playerId, amount) { log.push(['dispatchDamagePlayer', playerId, amount]); },            
            /**
 * handlePlayerMonsterKill：处理事件并驱动执行路径。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @returns 函数返回值。
 */

            handlePlayerMonsterKill(instance, monster, killerPlayerId) { log.push(['handlePlayerMonsterKill', instance.meta.instanceId, monster.runtimeId, killerPlayerId]); },            
            /**
 * handlePlayerDefeat：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            handlePlayerDefeat(playerId) { log.push(['handlePlayerDefeat', playerId]); },            
            /**
 * processPendingRespawns：处理事件并驱动执行路径。
 * @returns 函数返回值。
 */

            processPendingRespawns() { log.push(['processPendingRespawns']); },            
            /**
 * respawnPlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

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
