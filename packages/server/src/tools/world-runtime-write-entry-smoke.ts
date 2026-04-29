// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
    });
    return { promise, resolve, reject };
}

function nextTick() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
    const log = [];
    const engageBattleDeferred = createDeferred();
    const basicAttackDeferred = createDeferred();
    const castSkillDeferred = createDeferred();
    const monsterKillDeferred = createDeferred();
    const defeatDeferred = createDeferred();
    const redeemCodesDeferred = createDeferred();
    const takeGroundDeferred = createDeferred();
    const takeGroundAllDeferred = createDeferred();
    const buyNpcShopItemDeferred = createDeferred();
    const npcInteractionDeferred = createDeferred();
    const equipItemDeferred = createDeferred();
    const unequipItemDeferred = createDeferred();
    const startTechniqueDeferred = createDeferred();
    const cancelTechniqueDeferred = createDeferred();
    const startAlchemyDeferred = createDeferred();
    const cancelAlchemyDeferred = createDeferred();
    const startEnhancementDeferred = createDeferred();
    const cancelEnhancementDeferred = createDeferred();
    const submitQuestDeferred = createDeferred();

    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {
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
            async dispatchRedeemCodes(playerId, codes) {
                log.push(['dispatchRedeemCodes', playerId, codes]);
                await redeemCodesDeferred.promise;
                log.push(['dispatchRedeemCodes:resolved', playerId, codes]);
            },
            async dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
                log.push(['dispatchBuyNpcShopItem', playerId, npcId, itemId, quantity]);
                await buyNpcShopItemDeferred.promise;
                log.push(['dispatchBuyNpcShopItem:resolved', playerId, npcId, itemId, quantity]);
            },
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
            async dispatchNpcInteraction(playerId, npcId) {
                log.push(['dispatchNpcInteraction', playerId, npcId]);
                await npcInteractionDeferred.promise;
                log.push(['dispatchNpcInteraction:resolved', playerId, npcId]);
            },
            async dispatchEquipItem(playerId, slotIndex) {
                log.push(['dispatchEquipItem', playerId, slotIndex]);
                await equipItemDeferred.promise;
                log.push(['dispatchEquipItem:resolved', playerId, slotIndex]);
            },
            async dispatchUnequipItem(playerId, slot) {
                log.push(['dispatchUnequipItem', playerId, slot]);
                await unequipItemDeferred.promise;
                log.push(['dispatchUnequipItem:resolved', playerId, slot]);
            },
            async dispatchStartTechniqueActivity(playerId, kind, payload) {
                log.push(['dispatchStartTechniqueActivity', playerId, kind, payload]);
                await startTechniqueDeferred.promise;
                log.push(['dispatchStartTechniqueActivity:resolved', playerId, kind]);
            },
            async dispatchCancelTechniqueActivity(playerId, kind) {
                log.push(['dispatchCancelTechniqueActivity', playerId, kind]);
                await cancelTechniqueDeferred.promise;
                log.push(['dispatchCancelTechniqueActivity:resolved', playerId, kind]);
            },
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
            async dispatchSubmitNpcQuest(playerId, npcId, questId) {
                log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]);
                await submitQuestDeferred.promise;
                log.push(['dispatchSubmitNpcQuest:resolved', playerId, npcId, questId]);
            },
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
    };

    const pendingRedeemCodes = WorldRuntimeService.prototype.dispatchRedeemCodes.call(
        runtime,
        'player:1',
        ['code:alpha'],
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
    ]);
    redeemCodesDeferred.resolve();
    await pendingRedeemCodes;

    const pendingTakeGround = WorldRuntimeService.prototype.dispatchTakeGround.call(
        runtime,
        'player:1',
        'ground:1',
        'item:1',
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
    ]);
    takeGroundDeferred.resolve();
    await pendingTakeGround;

    const pendingTakeGroundAll = WorldRuntimeService.prototype.dispatchTakeGroundAll.call(
        runtime,
        'player:1',
        'ground:1',
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
    ]);
    takeGroundAllDeferred.resolve();
    await pendingTakeGroundAll;

    const pendingEngageBattle = WorldRuntimeService.prototype.dispatchEngageBattle.call(
        runtime,
        'player:1',
        null,
        'monster:1',
        10,
        11,
        true,
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
    ]);
    engageBattleDeferred.resolve();
    await pendingEngageBattle;

    const pendingBuyNpcShopItem = WorldRuntimeService.prototype.dispatchBuyNpcShopItem.call(
        runtime,
        'player:1',
        'npc:shop',
        'item:pill',
        3,
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
    ]);
    buyNpcShopItemDeferred.resolve();
    await pendingBuyNpcShopItem;

    const pendingNpcInteraction = WorldRuntimeService.prototype.dispatchNpcInteraction.call(
        runtime,
        'player:1',
        'npc:quest',
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
    ]);
    npcInteractionDeferred.resolve();
    await pendingNpcInteraction;

    const pendingEquipItem = WorldRuntimeService.prototype.dispatchEquipItem.call(
        runtime,
        'player:1',
        6,
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
    ]);
    equipItemDeferred.resolve();
    await pendingEquipItem;

    const pendingUnequipItem = WorldRuntimeService.prototype.dispatchUnequipItem.call(
        runtime,
        'player:1',
        'weapon',
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
    ]);
    unequipItemDeferred.resolve();
    await pendingUnequipItem;

    const pendingStartTechnique = WorldRuntimeService.prototype.dispatchStartTechniqueActivity.call(
        runtime,
        'player:1',
        'alchemy',
        { recipeId: 'recipe:generic' },
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
    ]);
    startTechniqueDeferred.resolve();
    await pendingStartTechnique;

    const pendingCancelTechnique = WorldRuntimeService.prototype.dispatchCancelTechniqueActivity.call(
        runtime,
        'player:1',
        'enhancement',
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
    ]);
    cancelTechniqueDeferred.resolve();
    await pendingCancelTechnique;

    const pendingStartAlchemy = WorldRuntimeService.prototype.dispatchStartAlchemy.call(
        runtime,
        'player:1',
        { recipeId: 'recipe:1' },
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
    ]);
    startAlchemyDeferred.resolve();
    await pendingStartAlchemy;

    const pendingCancelAlchemy = WorldRuntimeService.prototype.dispatchCancelAlchemy.call(runtime, 'player:1');
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
    ]);
    cancelAlchemyDeferred.resolve();
    await pendingCancelAlchemy;

    const pendingStartEnhancement = WorldRuntimeService.prototype.dispatchStartEnhancement.call(
        runtime,
        'player:1',
        { itemId: 'item:1' },
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
    ]);
    startEnhancementDeferred.resolve();
    await pendingStartEnhancement;

    const pendingCancelEnhancement = WorldRuntimeService.prototype.dispatchCancelEnhancement.call(runtime, 'player:1');
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
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

    const pendingSubmitQuest = WorldRuntimeService.prototype.dispatchSubmitNpcQuest.call(
        runtime,
        'player:1',
        'npc:quest',
        'quest:1',
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
        ['dispatchStartEnhancement:resolved', 'player:1', 'item:1'],
        ['dispatchCancelEnhancement', 'player:1'],
        ['dispatchCancelEnhancement:resolved', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
    ]);
    submitQuestDeferred.resolve();
    await pendingSubmitQuest;

    const pendingBasicAttack = WorldRuntimeService.prototype.dispatchBasicAttack.call(
        runtime,
        'player:1',
        null,
        'monster:1',
        10,
        11,
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
        ['dispatchStartEnhancement:resolved', 'player:1', 'item:1'],
        ['dispatchCancelEnhancement', 'player:1'],
        ['dispatchCancelEnhancement:resolved', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
    ]);
    basicAttackDeferred.resolve();
    await pendingBasicAttack;

    const pendingCastSkill = WorldRuntimeService.prototype.dispatchCastSkill.call(
        runtime,
        'player:1',
        'skill:1',
        null,
        'monster:1',
        null,
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
        ['dispatchStartEnhancement:resolved', 'player:1', 'item:1'],
        ['dispatchCancelEnhancement', 'player:1'],
        ['dispatchCancelEnhancement:resolved', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
    ]);
    castSkillDeferred.resolve();
    await pendingCastSkill;

    const pendingMonsterKill = WorldRuntimeService.prototype.handlePlayerMonsterKill.call(
        runtime,
        { meta: { instanceId: 'public:yunlai_town' } },
        { runtimeId: 'monster:runtime:1' },
        'player:1',
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
        ['dispatchStartEnhancement:resolved', 'player:1', 'item:1'],
        ['dispatchCancelEnhancement', 'player:1'],
        ['dispatchCancelEnhancement:resolved', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
    ]);
    monsterKillDeferred.resolve();
    await pendingMonsterKill;

    const pendingDefeat = WorldRuntimeService.prototype.handlePlayerDefeat.call(
        runtime,
        'player:1',
        'player:2',
    );
    await nextTick();
    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
        ['dispatchStartEnhancement:resolved', 'player:1', 'item:1'],
        ['dispatchCancelEnhancement', 'player:1'],
        ['dispatchCancelEnhancement:resolved', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
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

    assert.deepEqual(log, [
        ['dispatchRedeemCodes', 'player:1', ['code:alpha']],
        ['dispatchRedeemCodes:resolved', 'player:1', ['code:alpha']],
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGround:resolved', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
        ['dispatchTakeGroundAll:resolved', 'player:1', 'ground:1'],
        ['dispatchEngageBattle', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchEngageBattle:resolved', 'player:1', null, 'monster:1', 10, 11, true],
        ['dispatchBuyNpcShopItem', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchBuyNpcShopItem:resolved', 'player:1', 'npc:shop', 'item:pill', 3],
        ['dispatchNpcInteraction', 'player:1', 'npc:quest'],
        ['dispatchNpcInteraction:resolved', 'player:1', 'npc:quest'],
        ['dispatchEquipItem', 'player:1', 6],
        ['dispatchEquipItem:resolved', 'player:1', 6],
        ['dispatchUnequipItem', 'player:1', 'weapon'],
        ['dispatchUnequipItem:resolved', 'player:1', 'weapon'],
        ['dispatchStartTechniqueActivity', 'player:1', 'alchemy', { recipeId: 'recipe:generic' }],
        ['dispatchStartTechniqueActivity:resolved', 'player:1', 'alchemy'],
        ['dispatchCancelTechniqueActivity', 'player:1', 'enhancement'],
        ['dispatchCancelTechniqueActivity:resolved', 'player:1', 'enhancement'],
        ['dispatchStartAlchemy', 'player:1', 'recipe:1'],
        ['dispatchStartAlchemy:resolved', 'player:1', 'recipe:1'],
        ['dispatchCancelAlchemy', 'player:1'],
        ['dispatchCancelAlchemy:resolved', 'player:1'],
        ['dispatchStartEnhancement', 'player:1', 'item:1'],
        ['dispatchStartEnhancement:resolved', 'player:1', 'item:1'],
        ['dispatchCancelEnhancement', 'player:1'],
        ['dispatchCancelEnhancement:resolved', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchSubmitNpcQuest:resolved', 'player:1', 'npc:quest', 'quest:1'],
        ['dispatchBasicAttack', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchBasicAttack:resolved', 'player:1', null, 'monster:1', 10, 11],
        ['dispatchCastSkill', 'player:1', 'skill:1', null, 'monster:1', null],
        ['dispatchCastSkill:resolved', 'player:1', 'skill:1', null, 'monster:1', null],
        ['handlePlayerMonsterKill', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerMonsterKill:resolved', 'public:yunlai_town', 'monster:runtime:1', 'player:1'],
        ['handlePlayerDefeat', 'player:1', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'player:2'],
    ]);

    console.log(JSON.stringify({ ok: true, case: 'world-runtime-write-entry' }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
