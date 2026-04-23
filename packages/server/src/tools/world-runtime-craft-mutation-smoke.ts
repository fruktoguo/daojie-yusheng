// @ts-nocheck

const assert = require('node:assert/strict');

const { WorldRuntimeCraftMutationService } = require('../runtime/world/world-runtime-craft-mutation.service');

async function testPersistActiveJobUsesExactLeaseFence() {
    const durableCalls = [];
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
                    durableCalls.push({ ...input });
                    return { ok: true, alreadyCommitted: false };
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
    assert.equal(durableCalls.length, 1);
    assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:craft');
    assert.equal(durableCalls[0]?.expectedSessionEpoch, 6);
    assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:craft');
    assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:craft');
    assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 21);
    assert.equal(durableCalls[0]?.expectedJobRunId, 'job:craft:alchemy:1');
    assert.equal(durableCalls[0]?.expectedJobVersion, 3);
    assert.equal(durableCalls[0]?.nextActiveJob?.jobRunId, 'job:craft:alchemy:1');
    assert.equal(durableCalls[0]?.operationId, 'op:player:craft:active-job:job:craft:alchemy:1:v3:running');

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
                    durableCalls.push({ ...input });
                    return { ok: true, alreadyCommitted: false };
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
    assert.equal(durableCalls[1]?.operationId, durableCalls[0]?.operationId);
}

async function testPersistActiveJobSkipsWhenLeaseMissing() {
    const durableCalls = [];
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
                    return true;
                },
                async updateActiveJobState(input) {
                    durableCalls.push({ ...input });
                    return { ok: true, alreadyCommitted: false };
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
    assert.equal(durableCalls.length, 0);
}

async function main() {
    await testPersistActiveJobUsesExactLeaseFence();
    await testPersistActiveJobSkipsWhenLeaseMissing();
    console.log(JSON.stringify({
        ok: true,
        case: 'world-runtime-craft-mutation',
        answers: 'WorldRuntimeCraftMutationService 现已把 active_job 的 durable 出口补上 instanceId/assignedNodeId/ownershipEpoch exact lease 透传，并在 lease 缺失时跳过 durable 提交；同一份作业状态重复 flush 时会复用稳定 operationId。当前仍是 fire-and-forget durable 记账，不证明 craft tick 会等待事务提交后再返回成功',
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
