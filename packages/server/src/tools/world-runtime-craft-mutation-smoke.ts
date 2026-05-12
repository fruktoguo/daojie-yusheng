// @ts-nocheck

const assert = require('node:assert/strict');

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

async function main() {
    await testDurableRuntimeSkipsFallbackActiveJobSnapshot();
    await testFallbackActiveJobSnapshotStillWorksWithoutDurableSession();
    console.log(JSON.stringify({
        ok: true,
        case: 'world-runtime-craft-mutation',
        answers: 'WorldRuntimeCraftMutationService 在 durable 会话启用时不再通过非 CAS 后备直写 active_job，避免旧 fire-and-forget flush 读到新内存版本后抢先推进 player_active_job；durable 不可用时仍保留后备快照持久化。',
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
