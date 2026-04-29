// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeReadFacadeService } = require("../runtime/world/world-runtime-read-facade.service");
/**
 * testReadFacade：读取testReadFacade并返回结果。
 * @returns 无返回值，直接更新testReadFacade相关状态。
 */


function testReadFacade() {
    const service = new WorldRuntimeReadFacadeService();
    const log = [];
    const deps = {
        tick: 999,
        /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getPlayerViewOrThrow：读取玩家视图OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家视图OrThrow的读取/组装。
 */

        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return { tick: 7, visibleMonsters: [] };
        },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow(instanceId) {
            log.push(['getInstanceRuntimeOrThrow', instanceId]);
            return {
                meta: { instanceId },
                tick: 7,
                /**
 * getContainerAtTile：读取ContainerAtTile。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 无返回值，完成ContainerAtTile的读取/组装。
 */

                getContainerAtTile(x, y) {
                    log.push(['getContainerAtTile', x, y]);
                    return { id: 'crate:1' };
                },
            };
        },        
        /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        playerRuntimeService: {        
        /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

            getPlayerOrThrow(playerId) {
                log.push(['getPlayerOrThrow', playerId]);
                return { playerId };
            },            
            /**
 * getPlayer：读取玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */

            getPlayer(playerId) {
                return playerId === 'player:1' ? { instanceId: 'public:yunlai_town', x: 10, y: 10 } : null;
            },            
            /**
 * setContextActions：写入上下文Action。
 * @param playerId 玩家 ID。
 * @param actions 参数说明。
 * @param tick 当前 tick。
 * @returns 无返回值，直接更新上下文Action相关状态。
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
 * @returns 无返回值，直接更新NPCShop视图相关状态。
 */

            buildNpcShopView(playerId, npcId) {
                log.push(['buildNpcShopView', playerId, npcId]);
                return { npcId };
            },            
            /**
 * validateNpcShopPurchase：判断NPCShopPurchase是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @returns 无返回值，完成NPCShopPurchase的条件判断。
 */

            validateNpcShopPurchase(playerId, npcId, itemId, quantity) {
                return { playerId, npcId, itemId, quantity };
            },
        },
        worldRuntimeQuestQueryService: {        
        /**
 * buildQuestListView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新任务列表视图相关状态。
 */

            buildQuestListView(playerId) {
                log.push(['buildQuestListView', playerId]);
                return { quests: [] };
            },            
            /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新NPC任务视图相关状态。
 */

            buildNpcQuestsView(playerId, npcId) {
                log.push(['buildNpcQuestsView', playerId, npcId]);
                return { npcId, quests: [] };
            },            
            /**
 * createNpcQuestsEnvelope：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npc 参数说明。
 * @returns 无返回值，直接更新NPC任务Envelope相关状态。
 */

            createNpcQuestsEnvelope(playerId, npc) {
                return { playerId, npcId: npc.id };
            },            
            /**
 * resolveQuestProgress：规范化或转换任务进度。
 * @param playerId 玩家 ID。
 * @param quest 参数说明。
 * @returns 无返回值，直接更新任务进度相关状态。
 */

            resolveQuestProgress(playerId, quest) {
                return `${playerId}:${quest.id}`;
            },            
            /**
 * canQuestBecomeReady：读取任务BecomeReady并返回结果。
 * @returns 无返回值，完成任务BecomeReady的条件判断。
 */

            canQuestBecomeReady() {
                return true;
            },            
            /**
 * createQuestStateFromSource：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param questId quest ID。
 * @param status 参数说明。
 * @returns 无返回值，直接更新任务状态From来源相关状态。
 */

            createQuestStateFromSource(playerId, questId, status) {
                return { playerId, questId, status };
            },            
            /**
 * buildQuestRewardItems：构建并返回目标对象。
 * @param quest 参数说明。
 * @returns 无返回值，直接更新任务Reward道具相关状态。
 */

            buildQuestRewardItems(quest) {
                return quest.rewards ?? [];
            },            
            /**
 * buildQuestRewardItemsFromRecord：构建并返回目标对象。
 * @param quest 参数说明。
 * @returns 无返回值，直接更新任务Reward道具FromRecord相关状态。
 */

            buildQuestRewardItemsFromRecord(quest) {
                return quest.rewards ?? [];
            },            
            /**
 * resolveQuestNavigationTarget：读取任务导航目标并返回结果。
 * @param quest 参数说明。
 * @returns 无返回值，直接更新任务导航目标相关状态。
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
 * @returns 无返回值，直接更新详情相关状态。
 */

            buildDetail(context, target) {
                return { kind: target.kind, id: target.id, instanceId: context.instance.meta.instanceId };
            },            
            /**
 * buildTileDetail：构建并返回目标对象。
 * @param context 上下文信息。
 * @param target 目标对象。
 * @returns 无返回值，直接更新Tile详情相关状态。
 */

            buildTileDetail(context, target) {
                return { x: target.x, y: target.y, playerId: context.viewer.playerId };
            },
        },
        worldRuntimeContextActionQueryService: {        
        /**
 * buildContextActions：构建并返回目标对象。
 * @param view 参数说明。
 * @returns 无返回值，直接更新上下文Action相关状态。
 */

            buildContextActions(view) {
                return [{ id: `ctx:${view.tick}` }];
            },
        },
        worldRuntimePlayerViewQueryService: {        
        /**
 * getPlayerView：读取玩家视图。
 * @param _deps 参数说明。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家视图的读取/组装。
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
 * @returns 无返回值，直接更新掉落窗口Sync状态相关状态。
 */

            buildLootWindowSyncState(_deps, playerId, tileX, tileY) {
                log.push(['buildLootWindowSyncState', playerId, tileX, tileY]);
                return { tileX, tileY };
            },
        },
        worldRuntimeLootContainerService: {        
        /**
 * prepareContainerLootSource：执行prepareContainer掉落来源相关逻辑。
 * @param instanceId instance ID。
 * @param container 参数说明。
 * @param tick 当前 tick。
 * @returns 无返回值，直接更新prepareContainer掉落来源相关状态。
 */

            prepareContainerLootSource(instanceId, container, tick) {
                log.push(['prepareContainerLootSource', instanceId, container.id, tick]);
            },
        },
        worldRuntimeNpcAccessService: {        
        /**
 * resolveAdjacentNpc：规范化或转换AdjacentNPC。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新AdjacentNPC相关状态。
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
    assert.deepEqual(log.find((entry) => entry[0] === 'prepareContainerLootSource'), ['prepareContainerLootSource', 'public:yunlai_town', 'crate:1', 7]);
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
