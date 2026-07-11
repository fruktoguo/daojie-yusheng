// @ts-nocheck

const assert = require('node:assert/strict');
const { S2C } = require('@mud/shared');

const { WorldRuntimeCraftMutationService } = require('../runtime/world/world-runtime-craft-mutation.service');

async function testDurableRuntimeSkipsFallbackActiveJobSnapshot() {
    const fallbackWrites = [];
    const service = new WorldRuntimeCraftMutationService(
        {
            getPlayer(playerId) {
                if (playerId !== 'player:craft') {
                    return null;
                }
                return {
                    playerId,
                    runtimeOwnerId: 'runtime:craft',
                    sessionEpoch: 6,
                    instanceId: 'instance:craft',
                    alchemyJob: {
                        jobRunId: 'job:craft:alchemy:1',
                        jobType: 'alchemy',
                        jobVersion: 3,
                        status: 'running',
                        phase: 'running',
                        startedAt: 100,
                        totalTicks: 12,
                        remainingTicks: 9,
                        pausedTicks: 0,
                        successRate: 1,
                        speedRate: 1,
                    },
                };
            },
        },
        {
            persistTechniqueActivitySnapshot(player) {
                fallbackWrites.push(player.alchemyJob?.jobVersion ?? null);
            },
            buildTechniqueActivityPanelPayload() {
                return {};
            },
        },
        {
            getSocketByPlayerId() {
                return null;
            },
        },
        {
            prefersMainline() {
                return false;
            },
        },
    );
    service.flushCraftMutation(
        'player:craft',
        { ok: true, panelChanged: false, messages: [], groundDrops: [] },
        'alchemy',
        {
            durableOperationService: {
                isEnabled() {
                    return true;
                },
                async updateActiveJobState(input) {
                    throw new Error(`durable CAS path must own active_job persistence, got ${input.operationId}`);
                },
            },
            instanceCatalogService: {
                isEnabled() {
                    return true;
                },
                async loadInstanceCatalog(instanceId) {
                    assert.equal(instanceId, 'instance:craft');
                    return {
                        assigned_node_id: 'node:craft',
                        ownership_epoch: 21,
                    };
                },
            },
            queuePlayerNotice() {},
            getInstanceRuntimeOrThrow() {
                return {};
            },
            spawnGroundItem() {},
        },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(fallbackWrites, []);

    service.flushCraftMutation(
        'player:craft',
        { ok: true, panelChanged: false, messages: [], groundDrops: [] },
        'alchemy',
        {
            durableOperationService: {
                isEnabled() {
                    return true;
                },
                async updateActiveJobState(input) {
                    throw new Error(`durable CAS path must own active_job persistence, got ${input.operationId}`);
                },
            },
            instanceCatalogService: {
                isEnabled() {
                    return true;
                },
                async loadInstanceCatalog(instanceId) {
                    assert.equal(instanceId, 'instance:craft');
                    return {
                        assigned_node_id: 'node:craft',
                        ownership_epoch: 21,
                    };
                },
            },
            queuePlayerNotice() {},
            getInstanceRuntimeOrThrow() {
                return {};
            },
            spawnGroundItem() {},
        },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(fallbackWrites, []);
}

async function testFallbackActiveJobSnapshotStillWorksWithoutDurableSession() {
    const fallbackWrites = [];
    const service = new WorldRuntimeCraftMutationService(
        {
            getPlayer(playerId) {
                if (playerId !== 'player:craft-missing-lease') {
                    return null;
                }
                return {
                    playerId,
                    runtimeOwnerId: 'runtime:craft',
                    sessionEpoch: 6,
                    instanceId: 'instance:craft-missing-lease',
                    alchemyJob: {
                        jobRunId: 'job:craft:alchemy:missing-lease',
                        jobType: 'alchemy',
                        jobVersion: 2,
                        status: 'running',
                        phase: 'running',
                        startedAt: 100,
                        totalTicks: 12,
                        remainingTicks: 9,
                        pausedTicks: 0,
                        successRate: 1,
                        speedRate: 1,
                    },
                };
            },
        },
        {
            persistTechniqueActivitySnapshot(player) {
                fallbackWrites.push(player.alchemyJob?.jobRunId ?? null);
            },
            buildTechniqueActivityPanelPayload() {
                return {};
            },
        },
        {
            getSocketByPlayerId() {
                return null;
            },
        },
        {
            prefersMainline() {
                return false;
            },
        },
    );
    service.flushCraftMutation(
        'player:craft-missing-lease',
        { ok: true, panelChanged: false, messages: [], groundDrops: [] },
        'alchemy',
        {
            durableOperationService: {
                isEnabled() {
                    return false;
                },
                async updateActiveJobState(input) {
                    throw new Error(`durable path should be disabled, got ${input.operationId}`);
                },
            },
            instanceCatalogService: {
                isEnabled() {
                    return true;
                },
                async loadInstanceCatalog(instanceId) {
                    assert.equal(instanceId, 'instance:craft-missing-lease');
                    return {
                        assigned_node_id: null,
                        ownership_epoch: null,
                    };
                },
            },
            queuePlayerNotice() {},
            getInstanceRuntimeOrThrow() {
                return {};
            },
            spawnGroundItem() {},
        },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(fallbackWrites, ['job:craft:alchemy:missing-lease']);
}

async function testStructuredTechniqueNoticePassesThroughFlush() {
    const notices = [];
    const service = new WorldRuntimeCraftMutationService(
        {
            getPlayer(playerId) {
                return playerId === 'player:structured-notice' ? { playerId, instanceId: 'instance:notice' } : null;
            },
        },
        {
            async persistTechniqueActivitySnapshot() {},
            buildTechniqueActivityPanelPayload() {
                return {};
            },
        },
        {
            getSocketByPlayerId() {
                return null;
            },
        },
        {
            prefersMainline() {
                return false;
            },
        },
    );
    service.flushCraftMutation(
        'player:structured-notice',
        {
            ok: true,
            panelChanged: false,
            messages: [
                {
                    kind: 'quest',
                    key: 'notice.technique.activity-complete',
                    vars: { itemName: '归元丹', count: 2 },
                    pills: [{ key: 'itemName', style: 'target' }],
                },
            ],
            groundDrops: [],
        },
        'alchemy',
        {
            queuePlayerNotice(playerId, text, kind, _title, _icon, structured) {
                notices.push({ playerId, text, kind, structured });
            },
            getInstanceRuntimeOrThrow() {
                return {};
            },
            spawnGroundItem() {},
        },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(notices, [
        {
            playerId: 'player:structured-notice',
            text: 'notice.technique.activity-complete',
            kind: 'quest',
            structured: {
                key: 'notice.technique.activity-complete',
                vars: { itemName: '归元丹', count: 2 },
                pills: [{ key: 'itemName', style: 'target' }],
            },
        },
    ]);
}

async function testUnsolicitedPanelRefreshDoesNotUseCatalogPayload() {
    const refreshKinds = [];
    const emitted = [];
    const player = { playerId: 'player:catalog-refresh', instanceId: 'instance:catalog-refresh' };
    const service = new WorldRuntimeCraftMutationService(
        {
            getPlayer(playerId) {
                return playerId === player.playerId ? player : null;
            },
        },
        {
            hasActiveTechniqueActivity() {
                return false;
            },
            buildTechniqueActivityPanelPayload() {
                throw new Error('服务端主动刷新不得调用会夹带目录的请求响应构造器');
            },
            buildTechniqueActivityPanelRefreshPayload(_player, kind) {
                refreshKinds.push(kind);
                return { kind, state: { job: null }, catalogVersion: 4 };
            },
            buildTechniqueActivityTaskListPayload() {
                return { tasks: [] };
            },
        },
        {
            getSocketByPlayerId(playerId) {
                return playerId === player.playerId
                    ? { emit(event, payload) { emitted.push({ event, payload }); } }
                    : null;
            },
        },
        {
            prefersMainline() {
                return true;
            },
        },
    );

    service.emitAllTechniqueActivityPanelUpdates(player.playerId, {});

    assert.deepEqual(refreshKinds, ['alchemy', 'forging', 'enhancement']);
    assert.equal(emitted.filter((entry) => entry.event === S2C.AlchemyPanel).length, 2);
    assert.equal(emitted.filter((entry) => entry.event === S2C.EnhancementPanel).length, 1);
    assert.equal(emitted.filter((entry) => entry.event === S2C.TechniqueActivityTasks).length, 1);
    for (const entry of emitted) {
        assert.equal(entry.payload?.catalog, undefined, '装备等主动刷新不得携带静态目录');
    }
}

async function main() {
    await testDurableRuntimeSkipsFallbackActiveJobSnapshot();
    await testFallbackActiveJobSnapshotStillWorksWithoutDurableSession();
    await testStructuredTechniqueNoticePassesThroughFlush();
    await testUnsolicitedPanelRefreshDoesNotUseCatalogPayload();
    console.log(JSON.stringify({
        ok: true,
        case: 'world-runtime-craft-mutation',
        answers: 'WorldRuntimeCraftMutationService 在 durable 会话启用时不再通过非 CAS 后备直写 active_job，durable 不可用时仍保留后备快照持久化；技艺 result 的结构化 notice 会透传到通知队列；装备等服务端主动面板刷新只发送状态，不复用会夹带静态目录的请求响应载荷。',
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
