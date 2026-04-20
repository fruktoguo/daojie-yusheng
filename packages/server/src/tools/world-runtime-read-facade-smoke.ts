// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeReadFacadeService } = require("../runtime/world/world-runtime-read-facade.service");
/**
 * testReadFacade：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testReadFacade() {
    const service = new WorldRuntimeReadFacadeService();
    const log = [];
    const deps = {
        tick: 7,        
        /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getPlayerViewOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return { tick: 7, visibleMonsters: [] };
        },        
        /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow(instanceId) {
            log.push(['getInstanceRuntimeOrThrow', instanceId]);
            return {
                meta: { instanceId },                
                /**
 * getContainerAtTile：按给定条件读取/查询数据。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 函数返回值。
 */

                getContainerAtTile(x, y) {
                    log.push(['getContainerAtTile', x, y]);
                    return { id: 'crate:1' };
                },
            };
        },        
        /**
 * refreshQuestStates：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        playerRuntimeService: {        
        /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            getPlayerOrThrow(playerId) {
                log.push(['getPlayerOrThrow', playerId]);
                return { playerId };
            },            
            /**
 * getPlayer：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            getPlayer(playerId) {
                return playerId === 'player:1' ? { instanceId: 'public:yunlai_town', x: 10, y: 10 } : null;
            },            
            /**
 * setContextActions：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param actions 参数说明。
 * @param tick 当前 tick。
 * @returns 函数返回值。
 */

            setContextActions(playerId, actions, tick) {
                log.push(['setContextActions', playerId, actions.length, tick]);
            },
        },
        worldRuntimeNpcShopQueryService: {        
        /**
 * buildNpcShopView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

            buildNpcShopView(playerId, npcId) {
                log.push(['buildNpcShopView', playerId, npcId]);
                return { npcId };
            },            
            /**
 * validateNpcShopPurchase：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @returns 函数返回值。
 */

            validateNpcShopPurchase(playerId, npcId, itemId, quantity) {
                return { playerId, npcId, itemId, quantity };
            },
        },
        worldRuntimeQuestQueryService: {        
        /**
 * buildQuestListView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            buildQuestListView(playerId) {
                log.push(['buildQuestListView', playerId]);
                return { quests: [] };
            },            
            /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

            buildNpcQuestsView(playerId, npcId) {
                log.push(['buildNpcQuestsView', playerId, npcId]);
                return { npcId, quests: [] };
            },            
            /**
 * createNpcQuestsEnvelope：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npc 参数说明。
 * @returns 函数返回值。
 */

            createNpcQuestsEnvelope(playerId, npc) {
                return { playerId, npcId: npc.id };
            },            
            /**
 * resolveQuestProgress：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param quest 参数说明。
 * @returns 函数返回值。
 */

            resolveQuestProgress(playerId, quest) {
                return `${playerId}:${quest.id}`;
            },            
            /**
 * canQuestBecomeReady：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */

            canQuestBecomeReady() {
                return true;
            },            
            /**
 * createQuestStateFromSource：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param questId quest ID。
 * @param status 参数说明。
 * @returns 函数返回值。
 */

            createQuestStateFromSource(playerId, questId, status) {
                return { playerId, questId, status };
            },            
            /**
 * buildQuestRewardItems：构建并返回目标对象。
 * @param quest 参数说明。
 * @returns 函数返回值。
 */

            buildQuestRewardItems(quest) {
                return quest.rewards ?? [];
            },            
            /**
 * buildQuestRewardItemsFromRecord：构建并返回目标对象。
 * @param quest 参数说明。
 * @returns 函数返回值。
 */

            buildQuestRewardItemsFromRecord(quest) {
                return quest.rewards ?? [];
            },            
            /**
 * resolveQuestNavigationTarget：执行核心业务逻辑。
 * @param quest 参数说明。
 * @returns 函数返回值。
 */

            resolveQuestNavigationTarget(quest) {
                return quest.target ?? null;
            },
        },
        worldRuntimeDetailQueryService: {        
        /**
 * buildDetail：构建并返回目标对象。
 * @param context 上下文信息。
 * @param target 目标对象。
 * @returns 函数返回值。
 */

            buildDetail(context, target) {
                return { kind: target.kind, id: target.id, instanceId: context.instance.meta.instanceId };
            },            
            /**
 * buildTileDetail：构建并返回目标对象。
 * @param context 上下文信息。
 * @param target 目标对象。
 * @returns 函数返回值。
 */

            buildTileDetail(context, target) {
                return { x: target.x, y: target.y, playerId: context.viewer.playerId };
            },
        },
        worldRuntimeContextActionQueryService: {        
        /**
 * buildContextActions：构建并返回目标对象。
 * @param view 参数说明。
 * @returns 函数返回值。
 */

            buildContextActions(view) {
                return [{ id: `ctx:${view.tick}` }];
            },
        },
        worldRuntimePlayerViewQueryService: {        
        /**
 * getPlayerView：按给定条件读取/查询数据。
 * @param _deps 参数说明。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            getPlayerView(_deps, playerId) {
                log.push(['getPlayerView', playerId]);
                return { tick: 9 };
            },            
            /**
 * buildLootWindowSyncState：构建并返回目标对象。
 * @param _deps 参数说明。
 * @param playerId 玩家 ID。
 * @param tileX 参数说明。
 * @param tileY 参数说明。
 * @returns 函数返回值。
 */

            buildLootWindowSyncState(_deps, playerId, tileX, tileY) {
                log.push(['buildLootWindowSyncState', playerId, tileX, tileY]);
                return { tileX, tileY };
            },
        },
        worldRuntimeLootContainerService: {        
        /**
 * prepareContainerLootSource：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param container 参数说明。
 * @param tick 当前 tick。
 * @returns 函数返回值。
 */

            prepareContainerLootSource(instanceId, container, tick) {
                log.push(['prepareContainerLootSource', instanceId, container.id, tick]);
            },
        },
        worldRuntimeNpcAccessService: {        
        /**
 * resolveAdjacentNpc：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

            resolveAdjacentNpc(playerId, npcId) {
                return { playerId, id: npcId };
            },
        },
    };

    assert.deepEqual(service.buildNpcShopView('player:1', 'npc:shop', deps), { npcId: 'npc:shop' });
    assert.deepEqual(service.buildQuestListView('player:1', {}, deps), { quests: [] });
    assert.deepEqual(service.buildNpcQuestsView('player:1', 'npc:quest', deps), { npcId: 'npc:quest', quests: [] });
    assert.deepEqual(service.buildDetail('player:1', { kind: 'npc', id: 'npc:1' }, deps), { kind: 'npc', id: 'npc:1', instanceId: 'public:yunlai_town' });
    assert.deepEqual(service.buildTileDetail('player:1', { x: 10, y: 11 }, deps), { x: 10, y: 11, playerId: 'player:1' });
    assert.deepEqual(service.buildLootWindowSyncState('player:1', 10, 10, deps), { tileX: 10, tileY: 10 });
    assert.deepEqual(service.refreshPlayerContextActions('player:1', null, deps), { tick: 9 });
    assert.deepEqual(service.createNpcQuestsEnvelope('player:1', 'npc:quest', deps), { playerId: 'player:1', npcId: 'npc:quest' });
    assert.equal(service.resolveQuestProgress('player:1', { id: 'quest:1' }, deps), 'player:1:quest:1');
    assert.equal(service.canQuestBecomeReady('player:1', { id: 'quest:1' }, deps), true);
    assert.deepEqual(service.createQuestStateFromSource('player:1', 'quest:1', 'ready', deps), { playerId: 'player:1', questId: 'quest:1', status: 'ready' });
    assert.deepEqual(service.buildQuestRewardItems({ rewards: [{ itemId: 'a' }] }, deps), [{ itemId: 'a' }]);
    assert.deepEqual(service.buildQuestRewardItemsFromRecord({ rewards: [{ itemId: 'b' }] }, deps), [{ itemId: 'b' }]);
    assert.deepEqual(service.resolveQuestNavigationTarget({ target: { mapId: 'yunlai_town' } }, deps), { mapId: 'yunlai_town' });
    assert.deepEqual(service.validateNpcShopPurchase('player:1', 'npc:shop', 'item:1', 2, deps), {
        playerId: 'player:1',
        npcId: 'npc:shop',
        itemId: 'item:1',
        quantity: 2,
    });
    assert.deepEqual(service.buildContextActions({ tick: 12 }, deps), [{ id: 'ctx:12' }]);
}

testReadFacade();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-read-facade' }, null, 2));
