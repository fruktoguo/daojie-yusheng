"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeReadFacadeService } = require("../runtime/world/world-runtime-read-facade.service");

function testReadFacade() {
    const service = new WorldRuntimeReadFacadeService();
    const log = [];
    const deps = {
        tick: 7,
        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'public:yunlai_town' };
        },
        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return { tick: 7, visibleMonsters: [] };
        },
        getInstanceRuntimeOrThrow(instanceId) {
            log.push(['getInstanceRuntimeOrThrow', instanceId]);
            return {
                meta: { instanceId },
                getContainerAtTile(x, y) {
                    log.push(['getContainerAtTile', x, y]);
                    return { id: 'crate:1' };
                },
            };
        },
        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        playerRuntimeService: {
            getPlayerOrThrow(playerId) {
                log.push(['getPlayerOrThrow', playerId]);
                return { playerId };
            },
            getPlayer(playerId) {
                return playerId === 'player:1' ? { instanceId: 'public:yunlai_town', x: 10, y: 10 } : null;
            },
            setContextActions(playerId, actions, tick) {
                log.push(['setContextActions', playerId, actions.length, tick]);
            },
        },
        worldRuntimeNpcShopQueryService: {
            buildNpcShopView(playerId, npcId) {
                log.push(['buildNpcShopView', playerId, npcId]);
                return { npcId };
            },
            validateNpcShopPurchase(playerId, npcId, itemId, quantity) {
                return { playerId, npcId, itemId, quantity };
            },
        },
        worldRuntimeQuestQueryService: {
            buildQuestListView(playerId) {
                log.push(['buildQuestListView', playerId]);
                return { quests: [] };
            },
            buildNpcQuestsView(playerId, npcId) {
                log.push(['buildNpcQuestsView', playerId, npcId]);
                return { npcId, quests: [] };
            },
            createNpcQuestsEnvelope(playerId, npc) {
                return { playerId, npcId: npc.id };
            },
            resolveQuestProgress(playerId, quest) {
                return `${playerId}:${quest.id}`;
            },
            canQuestBecomeReady() {
                return true;
            },
            createQuestStateFromSource(playerId, questId, status) {
                return { playerId, questId, status };
            },
            buildQuestRewardItems(quest) {
                return quest.rewards ?? [];
            },
            buildQuestRewardItemsFromRecord(quest) {
                return quest.rewards ?? [];
            },
            resolveQuestNavigationTarget(quest) {
                return quest.target ?? null;
            },
        },
        worldRuntimeDetailQueryService: {
            buildDetail(context, target) {
                return { kind: target.kind, id: target.id, instanceId: context.instance.meta.instanceId };
            },
            buildTileDetail(context, target) {
                return { x: target.x, y: target.y, playerId: context.viewer.playerId };
            },
        },
        worldRuntimeContextActionQueryService: {
            buildContextActions(view) {
                return [{ id: `ctx:${view.tick}` }];
            },
        },
        worldRuntimePlayerViewQueryService: {
            getPlayerView(_deps, playerId) {
                log.push(['getPlayerView', playerId]);
                return { tick: 9 };
            },
            buildLootWindowSyncState(_deps, playerId, tileX, tileY) {
                log.push(['buildLootWindowSyncState', playerId, tileX, tileY]);
                return { tileX, tileY };
            },
        },
        worldRuntimeLootContainerService: {
            prepareContainerLootSource(instanceId, container, tick) {
                log.push(['prepareContainerLootSource', instanceId, container.id, tick]);
            },
        },
        worldRuntimeNpcAccessService: {
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
