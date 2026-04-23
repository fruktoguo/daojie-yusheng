// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeGameplayWriteFacadeService } = require("../runtime/world/world-runtime-gameplay-write-facade.service");

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
    });
    return { promise, resolve, reject };
}
/**
 * testGameplayWriteFacade：处理testGameplayWriteFacade并更新相关状态。
 * @returns 无返回值，直接更新testGameplayWriteFacade相关状态。
 */


function testGameplayWriteFacade() {
    const service = new WorldRuntimeGameplayWriteFacadeService();
    const log = [];
    const deps = {
        worldRuntimeRedeemCodeService: {        
        /**
 * dispatchRedeemCodes：判断RedeemCode是否满足条件。
 * @param playerId 玩家 ID。
 * @param codes 参数说明。
 * @returns 无返回值，直接更新RedeemCode相关状态。
 */
 dispatchRedeemCodes(playerId, codes) { log.push(['dispatchRedeemCodes', playerId, codes]); } },
        worldRuntimeCombatCommandService: {        
        /**
 * dispatchCastSkill：判断Cast技能是否满足条件。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @returns 无返回值，直接更新Cast技能相关状态。
 */

            dispatchCastSkill(playerId, skillId) { log.push(['dispatchCastSkill', playerId, skillId]); },            
            /**
 * resolveLegacySkillTargetRef：读取Legacy技能目标Ref并返回结果。
 * @param attacker 参数说明。
 * @param skill 参数说明。
 * @param targetRef 参数说明。
 * @returns 无返回值，直接更新Legacy技能目标Ref相关状态。
 */

            resolveLegacySkillTargetRef(attacker, skill, targetRef) { return { attacker: attacker.playerId, skillId: skill.id, targetRef }; },            
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

            dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) { log.push(['dispatchEngageBattle', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]); },            
            /**
 * dispatchCastSkillToMonster：判断Cast技能To怪物是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @returns 无返回值，直接更新Cast技能To怪物相关状态。
 */

            dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) { log.push(['dispatchCastSkillToMonster', attacker.playerId, skillId, targetMonsterId]); },            
            /**
 * dispatchCastSkillToTile：判断Cast技能ToTile是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @returns 无返回值，直接更新Cast技能ToTile相关状态。
 */

            dispatchCastSkillToTile(attacker, skillId, targetX, targetY) { log.push(['dispatchCastSkillToTile', attacker.playerId, skillId, targetX, targetY]); },            
            /**
 * dispatchBasicAttack：判断BasicAttack是否满足条件。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @returns 无返回值，直接更新BasicAttack相关状态。
 */

            dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) { log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]); },
        },
        worldRuntimeUseItemService: {        
        /**
 * dispatchUseItem：判断Use道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新Use道具相关状态。
 */
 dispatchUseItem(playerId, slotIndex) { log.push(['dispatchUseItem', playerId, slotIndex]); } },
        worldRuntimeProgressionService: {        
        /**
 * dispatchBreakthrough：判断Breakthrough是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Breakthrough相关状态。
 */

            dispatchBreakthrough(playerId) { log.push(['dispatchBreakthrough', playerId]); },            
            /**
 * dispatchHeavenGateAction：判断HeavenGateAction是否满足条件。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @param element 参数说明。
 * @returns 无返回值，直接更新HeavenGateAction相关状态。
 */

            dispatchHeavenGateAction(playerId, action, element) { log.push(['dispatchHeavenGateAction', playerId, action, element]); },
        },
        worldRuntimeItemGroundService: {        
        /**
 * dispatchDropItem：判断Drop道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新Drop道具相关状态。
 */

            dispatchDropItem(playerId, slotIndex, count) { log.push(['dispatchDropItem', playerId, slotIndex, count]); },            
            /**
 * dispatchTakeGround：判断Take地面是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

            dispatchTakeGround(playerId, sourceId, itemKey) { log.push(['dispatchTakeGround', playerId, sourceId, itemKey]); },            
            /**
 * dispatchTakeGroundAll：判断Take地面All是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

            dispatchTakeGroundAll(playerId, sourceId) { log.push(['dispatchTakeGroundAll', playerId, sourceId]); },
        },
        worldRuntimeNpcShopService: {        
        /**
 * dispatchBuyNpcShopItem：判断BuyNPCShop道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @returns 无返回值，直接更新BuyNPCShop道具相关状态。
 */
 dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) { log.push(['dispatchBuyNpcShopItem', playerId, npcId, itemId, quantity]); } },
        worldRuntimeNpcQuestWriteService: {        
        /**
 * dispatchNpcInteraction：判断NPCInteraction是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新NPCInteraction相关状态。
 */

            dispatchNpcInteraction(playerId, npcId) { log.push(['dispatchNpcInteraction', playerId, npcId]); },            
            /**
 * dispatchInteractNpcQuest：判断InteractNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新InteractNPC任务相关状态。
 */

            dispatchInteractNpcQuest(playerId, npcId) { log.push(['dispatchInteractNpcQuest', playerId, npcId]); },            
            /**
 * dispatchAcceptNpcQuest：判断AcceptNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

            dispatchAcceptNpcQuest(playerId, npcId, questId) { log.push(['dispatchAcceptNpcQuest', playerId, npcId, questId]); },            
            /**
 * dispatchSubmitNpcQuest：判断SubmitNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

            dispatchSubmitNpcQuest(playerId, npcId, questId) { log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]); },
        },
        worldRuntimeEquipmentService: {        
        /**
 * dispatchEquipItem：判断Equip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新Equip道具相关状态。
 */

            dispatchEquipItem(playerId, slotIndex) { log.push(['dispatchEquipItem', playerId, slotIndex]); },            
            /**
 * dispatchUnequipItem：判断Unequip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @returns 无返回值，直接更新Unequip道具相关状态。
 */

            dispatchUnequipItem(playerId, slot) { log.push(['dispatchUnequipItem', playerId, slot]); },
        },
        worldRuntimeCultivationService: {        
        /**
 * dispatchCultivateTechnique：判断Cultivate功法是否满足条件。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新Cultivate功法相关状态。
 */
 dispatchCultivateTechnique(playerId, techniqueId) { log.push(['dispatchCultivateTechnique', playerId, techniqueId]); } },
        worldRuntimeAlchemyService: {        
        /**
 * dispatchStartAlchemy：判断开始炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Start炼丹相关状态。
 */

            dispatchStartAlchemy(playerId, payload) { log.push(['dispatchStartAlchemy', playerId, payload.recipeId]); },            
            /**
 * dispatchCancelAlchemy：判断Cancel炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
 */

            dispatchCancelAlchemy(playerId) { log.push(['dispatchCancelAlchemy', playerId]); },            
            /**
 * dispatchSaveAlchemyPreset：判断Save炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
 */

            dispatchSaveAlchemyPreset(playerId, payload) { log.push(['dispatchSaveAlchemyPreset', playerId, payload.presetId]); },            
            /**
 * dispatchDeleteAlchemyPreset：判断Delete炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
 */

            dispatchDeleteAlchemyPreset(playerId, presetId) { log.push(['dispatchDeleteAlchemyPreset', playerId, presetId]); },
        },
        worldRuntimeEnhancementService: {        
        /**
 * dispatchStartEnhancement：判断开始强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Start强化相关状态。
 */

            dispatchStartEnhancement(playerId, payload) { log.push(['dispatchStartEnhancement', playerId, payload.itemId]); },            
            /**
 * dispatchCancelEnhancement：判断Cancel强化是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Cancel强化相关状态。
 */

            dispatchCancelEnhancement(playerId) { log.push(['dispatchCancelEnhancement', playerId]); },
        },
        worldRuntimeMonsterSystemCommandService: {        
        /**
 * dispatchSpawnMonsterLoot：判断Spawn怪物掉落是否满足条件。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param monsterId monster ID。
 * @param rolls 参数说明。
 * @returns 无返回值，直接更新Spawn怪物掉落相关状态。
 */

            dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls) { log.push(['dispatchSpawnMonsterLoot', instanceId, x, y, monsterId, rolls]); },            
            /**
 * dispatchDefeatMonster：判断Defeat怪物是否满足条件。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @returns 无返回值，直接更新Defeat怪物相关状态。
 */

            dispatchDefeatMonster(instanceId, runtimeId) { log.push(['dispatchDefeatMonster', instanceId, runtimeId]); },            
            /**
 * dispatchDamageMonster：判断Damage怪物是否满足条件。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新Damage怪物相关状态。
 */

            dispatchDamageMonster(instanceId, runtimeId, amount) { log.push(['dispatchDamageMonster', instanceId, runtimeId, amount]); },
        },
        worldRuntimePlayerCombatOutcomeService: {        
        /**
 * dispatchDamagePlayer：判断Damage玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

            dispatchDamagePlayer(playerId, amount) { log.push(['dispatchDamagePlayer', playerId, amount]); },            
            /**
 * handlePlayerMonsterKill：处理玩家怪物Kill并更新相关状态。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @returns 无返回值，直接更新玩家怪物Kill相关状态。
 */

            handlePlayerMonsterKill(instance, monster, killerPlayerId) { log.push(['handlePlayerMonsterKill', instance.meta.instanceId, monster.runtimeId, killerPlayerId]); },            
            /**
 * handlePlayerDefeat：处理玩家Defeat并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新玩家Defeat相关状态。
 */

            handlePlayerDefeat(playerId) { log.push(['handlePlayerDefeat', playerId]); },            
            /**
 * processPendingRespawns：处理待处理重生并更新相关状态。
 * @returns 无返回值，直接更新Pending重生相关状态。
 */

            processPendingRespawns() { log.push(['processPendingRespawns']); },            
            /**
 * respawnPlayer：执行重生玩家相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新重生玩家相关状态。
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
    service.dispatchStartTechniqueActivity('player:1', 'alchemy', { recipeId: 'recipe:generic' }, deps);
    service.dispatchCancelTechniqueActivity('player:1', 'enhancement', deps);
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

    assert.deepEqual(log.slice(16, 22), [
        ['dispatchCultivateTechnique', 'player:1', 'tech:1'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:generic'],
        ['dispatchCancelEnhancement', 'player:1'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchSaveAlchemyPreset', 'player:1', 'preset:1'],
    ]);
    assert.ok(log.length >= 32);
}

function testLeaseFenceRejection() {
    const service = new WorldRuntimeGameplayWriteFacadeService();
    const deps = {
        getPlayerLocation(playerId) {
            return playerId === 'player:1' ? { instanceId: 'instance:lease-fenced' } : null;
        },
        getInstanceRuntime(instanceId) {
            if (instanceId !== 'instance:lease-fenced') {
                return null;
            }
            return { meta: { instanceId: 'instance:lease-fenced', runtimeStatus: 'running' } };
        },
        isInstanceLeaseWritable() {
            return false;
        },
        fenceInstanceRuntimeCalls: [],
        fenceInstanceRuntime(instanceId, reason) {
            this.fenceInstanceRuntimeCalls.push([instanceId, reason]);
        },
    };

    assert.throws(() => service.dispatchUseItem('player:1', 1, deps), /lease is not writable/);
    assert.deepEqual(deps.fenceInstanceRuntimeCalls, [['instance:lease-fenced', 'player_write_lease_check_failed']]);
}

async function testNpcShopAndEquipmentRoutesAwaitHandlers() {
    const service = new WorldRuntimeGameplayWriteFacadeService();
    const log = [];
    const engageBattleDeferred = createDeferred();
    const basicAttackDeferred = createDeferred();
    const castSkillDeferred = createDeferred();
    const monsterKillDeferred = createDeferred();
    const defeatDeferred = createDeferred();
    const takeGroundDeferred = createDeferred();
    const takeGroundAllDeferred = createDeferred();
    const shopDeferred = createDeferred();
    const equipDeferred = createDeferred();
    const unequipDeferred = createDeferred();
    const submitQuestDeferred = createDeferred();
    const startAlchemyDeferred = createDeferred();
    const cancelAlchemyDeferred = createDeferred();
    const startEnhancementDeferred = createDeferred();
    const cancelEnhancementDeferred = createDeferred();
    const deps = {
        getPlayerLocation() {
            return { instanceId: 'instance:async' };
        },
        getInstanceRuntime() {
            return { meta: { instanceId: 'instance:async', runtimeStatus: 'running' } };
        },
        isInstanceLeaseWritable() {
            return true;
        },
        worldRuntimeCombatCommandService: {
            async dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
                log.push(['dispatchEngageBattle', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]);
                await engageBattleDeferred.promise;
                log.push(['dispatchEngageBattle:resolved', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]);
            },
            async dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
                log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]);
                await basicAttackDeferred.promise;
                log.push(['dispatchBasicAttack:resolved', playerId, targetPlayerId, targetMonsterId, targetX, targetY]);
            },
            async dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef) {
                log.push(['dispatchCastSkill', playerId, skillId, targetPlayerId, targetMonsterId, targetRef]);
                await castSkillDeferred.promise;
                log.push(['dispatchCastSkill:resolved', playerId, skillId, targetPlayerId, targetMonsterId, targetRef]);
            },
        },
        worldRuntimePlayerCombatOutcomeService: {
            async handlePlayerMonsterKill(instance, monster, killerPlayerId) {
                log.push(['handlePlayerMonsterKill', instance.meta.instanceId, monster.runtimeId, killerPlayerId]);
                await monsterKillDeferred.promise;
                log.push(['handlePlayerMonsterKill:resolved', instance.meta.instanceId, monster.runtimeId, killerPlayerId]);
            },
            async handlePlayerDefeat(playerId, _deps, killerPlayerId = null) {
                log.push(['handlePlayerDefeat', playerId, killerPlayerId]);
                await defeatDeferred.promise;
                log.push(['handlePlayerDefeat:resolved', playerId, killerPlayerId]);
            },
        },
        worldRuntimeItemGroundService: {
            async dispatchTakeGround(playerId, sourceId, itemKey) {
                log.push(['dispatchTakeGround', playerId, sourceId, itemKey]);
                await takeGroundDeferred.promise;
                log.push(['dispatchTakeGround:resolved', playerId, sourceId, itemKey]);
            },
            async dispatchTakeGroundAll(playerId, sourceId) {
                log.push(['dispatchTakeGroundAll', playerId, sourceId]);
                await takeGroundAllDeferred.promise;
                log.push(['dispatchTakeGroundAll:resolved', playerId, sourceId]);
            },
        },
        worldRuntimeNpcShopService: {
            async dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
                log.push(['dispatchBuyNpcShopItem', playerId, npcId, itemId, quantity]);
                await shopDeferred.promise;
                log.push(['dispatchBuyNpcShopItem:resolved', playerId]);
            },
        },
        worldRuntimeNpcQuestWriteService: {
            async dispatchSubmitNpcQuest(playerId, npcId, questId) {
                log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]);
                await submitQuestDeferred.promise;
                log.push(['dispatchSubmitNpcQuest:resolved', playerId, npcId, questId]);
            },
        },
        worldRuntimeAlchemyService: {
            async dispatchStartAlchemy(playerId, payload) {
                log.push(['dispatchStartAlchemy', playerId, payload.recipeId]);
                await startAlchemyDeferred.promise;
                log.push(['dispatchStartAlchemy:resolved', playerId, payload.recipeId]);
            },
            async dispatchCancelAlchemy(playerId) {
                log.push(['dispatchCancelAlchemy', playerId]);
                await cancelAlchemyDeferred.promise;
                log.push(['dispatchCancelAlchemy:resolved', playerId]);
            },
        },
        worldRuntimeEnhancementService: {
            async dispatchStartEnhancement(playerId, payload) {
                log.push(['dispatchStartEnhancement', playerId, payload.itemId]);
                await startEnhancementDeferred.promise;
                log.push(['dispatchStartEnhancement:resolved', playerId, payload.itemId]);
            },
            async dispatchCancelEnhancement(playerId) {
                log.push(['dispatchCancelEnhancement', playerId]);
                await cancelEnhancementDeferred.promise;
                log.push(['dispatchCancelEnhancement:resolved', playerId]);
            },
        },
        worldRuntimeEquipmentService: {
            async dispatchEquipItem(playerId, slotIndex) {
                log.push(['dispatchEquipItem', playerId, slotIndex]);
                await equipDeferred.promise;
                log.push(['dispatchEquipItem:resolved', playerId, slotIndex]);
            },
            async dispatchUnequipItem(playerId, slot) {
                log.push(['dispatchUnequipItem', playerId, slot]);
                await unequipDeferred.promise;
                log.push(['dispatchUnequipItem:resolved', playerId, slot]);
            },
        },
    };

    const pendingTakeGround = service.dispatchTakeGround('player:1', 'ground:1', 'item:1', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
    ]);
    takeGroundDeferred.resolve();
    await pendingTakeGround;

    const pendingTakeGroundAll = service.dispatchTakeGroundAll('player:1', 'ground:1', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
    ]);
    takeGroundAllDeferred.resolve();
    await pendingTakeGroundAll;

    const pendingEngageBattle = service.dispatchEngageBattle('player:1', null, 'monster:1', 10, 11, true, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
    ]);
    engageBattleDeferred.resolve();
    await pendingEngageBattle;

    const pendingBasicAttack = service.dispatchBasicAttack('player:1', null, 'monster:1', 10, 11, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
    ]);
    basicAttackDeferred.resolve();
    await pendingBasicAttack;

    const pendingCastSkill = service.dispatchCastSkill('player:1', 'skill:1', null, 'monster:1', null, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
    ]);
    castSkillDeferred.resolve();
    await pendingCastSkill;

    const pendingMonsterKill = service.handlePlayerMonsterKill({ meta: { instanceId: 'public:yunlai_town' } }, { runtimeId: 'monster:runtime:1' }, 'player:1', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
    ]);
    monsterKillDeferred.resolve();
    await pendingMonsterKill;

    const pendingDefeat = service.handlePlayerDefeat('player:1', deps, 'player:2');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
    ]);
    defeatDeferred.resolve();
    await pendingDefeat;

    const pendingShop = service.dispatchBuyNpcShopItem('player:1', 'npc:shop', 'item:1', 2, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
    ]);
    shopDeferred.resolve();
    await pendingShop;

    const pendingEquip = service.dispatchEquipItem('player:1', 2, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
        ['dispatchBuyNpcShopItem:resolved', 'player:1'],
        ['dispatchEquipItem', 'player:1', 2],
    ]);
    equipDeferred.resolve();
    await pendingEquip;

    const pendingUnequip = service.dispatchUnequipItem('player:1', 'weapon', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
        ['dispatchBuyNpcShopItem:resolved', 'player:1'],
        ['dispatchEquipItem', 'player:1', 2],
        ['dispatchEquipItem:resolved', 'player:1', 2],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
    ]);
    unequipDeferred.resolve();
    await pendingUnequip;

    const pendingSubmitQuest = service.dispatchSubmitNpcQuest('player:1', 'npc:quest', 'quest:1', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
        ['dispatchBuyNpcShopItem:resolved', 'player:1'],
        ['dispatchEquipItem', 'player:1', 2],
        ['dispatchEquipItem:resolved', 'player:1', 2],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
    ]);
    submitQuestDeferred.resolve();
    await pendingSubmitQuest;
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
        ['dispatchBuyNpcShopItem:resolved', 'player:1'],
        ['dispatchEquipItem', 'player:1', 2],
        ['dispatchEquipItem:resolved', 'player:1', 2],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
    ]);

    const pendingStartAlchemy = service.dispatchStartAlchemy('player:1', { recipeId: 'recipe:1' }, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
        ['dispatchBuyNpcShopItem:resolved', 'player:1'],
        ['dispatchEquipItem', 'player:1', 2],
        ['dispatchEquipItem:resolved', 'player:1', 2],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
    ]);
    startAlchemyDeferred.resolve();
    await pendingStartAlchemy;

    const pendingCancelAlchemy = service.dispatchCancelAlchemy('player:1', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
        ['dispatchBuyNpcShopItem:resolved', 'player:1'],
        ['dispatchEquipItem', 'player:1', 2],
        ['dispatchEquipItem:resolved', 'player:1', 2],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
    ]);
    cancelAlchemyDeferred.resolve();
    await pendingCancelAlchemy;

    const pendingStartEnhancement = service.dispatchStartEnhancement('player:1', { itemId: 'item:1' }, deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
        ['dispatchBuyNpcShopItem:resolved', 'player:1'],
        ['dispatchEquipItem', 'player:1', 2],
        ['dispatchEquipItem:resolved', 'player:1', 2],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
    ]);
    startEnhancementDeferred.resolve();
    await pendingStartEnhancement;

    const pendingCancelEnhancement = service.dispatchCancelEnhancement('player:1', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
        ['dispatchBuyNpcShopItem:resolved', 'player:1'],
        ['dispatchEquipItem', 'player:1', 2],
        ['dispatchEquipItem:resolved', 'player:1', 2],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
        ['dispatchStartEnhancement:resolved', 'player:1', 'item:1'],
        ['dispatchCancelEnhancement', 'player:1'],
    ]);
    cancelEnhancementDeferred.resolve();
    await pendingCancelEnhancement;
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:1', 2],
        ['dispatchBuyNpcShopItem:resolved', 'player:1'],
        ['dispatchEquipItem', 'player:1', 2],
        ['dispatchEquipItem:resolved', 'player:1', 2],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
        ['dispatchStartEnhancement:resolved', 'player:1', 'item:1'],
        ['dispatchCancelEnhancement', 'player:1'],
        ['dispatchCancelEnhancement:resolved', 'player:1'],
    ]);
}

Promise.resolve()
    .then(() => testGameplayWriteFacade())
    .then(() => testLeaseFenceRejection())
    .then(() => testNpcShopAndEquipmentRoutesAwaitHandlers())
    .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-gameplay-write-facade' }, null, 2));
});
