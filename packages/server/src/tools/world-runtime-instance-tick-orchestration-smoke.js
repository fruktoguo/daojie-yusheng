"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeInstanceTickOrchestrationService } = require("../runtime/world/world-runtime-instance-tick-orchestration.service");

function createDeps(log) {
    const progress = new Map([['instance:1', 0]]);
    return {
        tick: 0,
        instances: new Map([['instance:1', {
            meta: { instanceId: 'instance:1' },
            template: { id: 'yunlai_town' },
            tick: 3,
            tickOnce() {
                log.push('instance.tickOnce');
                return { transfers: [{ id: 'transfer:1' }], monsterActions: [{ id: 'action:1' }] };
            },
            listPlayerIds() {
                log.push('instance.listPlayerIds');
                return ['player:1'];
            },
        }]]),
        playerLocations: new Map(),
        worldRuntimeCombatEffectsService: { resetFrameEffects() { log.push('resetFrameEffects'); } },
        worldRuntimeTickProgressService: {
            getProgress(instanceId) { log.push(`getProgress:${instanceId}`); return progress.get(instanceId) ?? 0; },
            setProgress(instanceId, value) { log.push(`setProgress:${instanceId}`); progress.set(instanceId, value); },
        },
        worldRuntimeMetricsService: {
            idleCalled: false,
            frameCalled: false,
            recordIdleFrame() { log.push('recordIdleFrame'); this.idleCalled = true; },
            recordFrameResult(_startedAt, durations) { log.push('recordFrameResult'); this.frameCalled = true; this.durations = durations; },
        },
        processPendingRespawns() { log.push('processPendingRespawns'); },
        materializeNavigationCommands() { log.push('materializeNavigationCommands'); },
        materializeAutoCombatCommands() { log.push('materializeAutoCombatCommands'); },
        dispatchPendingCommands() { log.push('dispatchPendingCommands'); },
        dispatchPendingSystemCommands() { log.push('dispatchPendingSystemCommands'); },
        worldRuntimeNavigationService: { getBlockedPlayerIds() { log.push('getBlockedPlayerIds'); return new Set(['player:block']); } },
        applyTransfer() { log.push('applyTransfer'); },
        applyMonsterAction() { log.push('applyMonsterAction'); },
        playerRuntimeService: { advanceTickForPlayerIds() { log.push('advanceTickForPlayerIds'); } },
        worldRuntimeCraftService: { advanceCraftJobs() { log.push('advanceCraftJobs'); } },
        worldRuntimeLootContainerService: { advanceContainerSearches() { log.push('advanceContainerSearches'); } },
        refreshQuestStates(playerId) { log.push(`refreshQuestStates:${playerId}`); },
    };
}

function verifyNormalPath() {
    const log = [];
    const deps = createDeps(log);
    const service = new WorldRuntimeInstanceTickOrchestrationService();
    const ticks = service.advanceFrame(deps, 1000, null);
    assert.equal(ticks, 1);
    assert.equal(deps.tick, 1);
    assert.equal(deps.worldRuntimeMetricsService.frameCalled, true);
    assert.equal(deps.worldRuntimeMetricsService.idleCalled, false);
    assert.deepEqual(log, [
        'resetFrameEffects',
        'getProgress:instance:1',
        'setProgress:instance:1',
        'processPendingRespawns',
        'materializeNavigationCommands',
        'materializeAutoCombatCommands',
        'dispatchPendingCommands',
        'dispatchPendingSystemCommands',
        'getBlockedPlayerIds',
        'instance.tickOnce',
        'applyTransfer',
        'applyMonsterAction',
        'instance.listPlayerIds',
        'advanceTickForPlayerIds',
        'advanceCraftJobs',
        'advanceContainerSearches',
        'refreshQuestStates:player:1',
        'recordFrameResult',
    ]);
}

function verifyZeroTickPath() {
    const log = [];
    const deps = createDeps(log);
    deps.worldRuntimeTickProgressService.getProgress = () => 0;
    const service = new WorldRuntimeInstanceTickOrchestrationService();
    const ticks = service.advanceFrame(deps, 0, null);
    assert.equal(ticks, 0);
    assert.equal(deps.worldRuntimeMetricsService.idleCalled, true);
    assert.equal(deps.worldRuntimeMetricsService.frameCalled, false);
    assert.deepEqual(log, ['resetFrameEffects', 'setProgress:instance:1', 'recordIdleFrame']);
}

verifyNormalPath();
verifyZeroTickPath();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-tick-orchestration' }, null, 2));
