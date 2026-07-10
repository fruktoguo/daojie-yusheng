import assert from 'node:assert/strict';

import { WorldRuntimeInstanceTickOrchestrationService } from '../runtime/world/world-runtime-instance-tick-orchestration.service';

function createInstance(instanceId: string, tickSpeed = 1) {
  return {
    meta: { instanceId },
    template: { id: 'clock-map' },
    tick: 0,
    tickSpeed,
    playersById: new Map(),
    tickOnce() {
      this.tick += 1;
      return { completedBuildings: [], transfers: [], monsterActions: [] };
    },
    listPlayerIds() { return []; },
  };
}

function createDeps(instances: Array<ReturnType<typeof createInstance>>) {
  const progress = new Map<string, number>();
  const formationTicks: Array<{ instanceId: string; tick: number }> = [];
  const cleanupWorldTicks: number[] = [];
  return {
    tick: 0,
    worldTickElapsedRemainderMs: 0,
    formationTicks,
    cleanupWorldTicks,
    listInstanceRuntimes() { return instances; },
    listInstanceEntries() { return instances.map((instance) => [instance.meta.instanceId, instance]); },
    getInstanceRuntime(instanceId: string) { return instances.find((instance) => instance.meta.instanceId === instanceId) ?? null; },
    listConnectedPlayerIds() { return [][Symbol.iterator](); },
    getPlayerLocation() { return null; },
    worldRuntimeCombatEffectsService: { resetFrameEffects() {} },
    worldRuntimeTickProgressService: {
      getProgress(instanceId: string) { return progress.get(instanceId) ?? 0; },
      setProgress(instanceId: string, value: number) { progress.set(instanceId, value); },
    },
    worldRuntimeMetricsService: {
      recordIdleFrame() {},
      recordFrameResult() {},
    },
    processPendingRespawns() {},
    async materializeNavigationCommands() {},
    materializeAutoUsePills() {},
    materializeAutoCombatCommands() {},
    async dispatchPendingCommands() {},
    dispatchPendingSystemCommands() {},
    worldRuntimeNavigationService: {
      getBlockedPlayerIds() { return new Set<string>(); },
      async materializeNavigationCommandsForInstance() {},
    },
    worldRuntimeFormationService: {
      advanceInstanceFormations(instance: ReturnType<typeof createInstance>, instanceTick: number) {
        formationTicks.push({ instanceId: instance.meta.instanceId, tick: instanceTick });
      },
    },
    worldRuntimeTongtianTowerService: {
      advanceInstance() {},
      async cleanupIdleInstances(runtime: { tick: number }) {
        cleanupWorldTicks.push(runtime.tick);
      },
    },
    worldRuntimeLootContainerService: { advanceContainerSearches() {} },
    playerRuntimeService: { advanceTickForPlayerIds() {} },
    worldRuntimeCraftTickService: { async advanceCraftJobs() {} },
    applyTransfer() {},
    applyMonsterAction() {},
    refreshQuestStates() {},
  };
}

async function verifyWorldTickDoesNotScaleWithInstanceCount(): Promise<void> {
  const instances = [createInstance('instance:1'), createInstance('instance:2')];
  const deps = createDeps(instances);
  const service = new WorldRuntimeInstanceTickOrchestrationService();

  const logicalSteps = await service.advanceFrame(deps, 1000, null);

  assert.equal(logicalSteps, 2);
  assert.equal(deps.tick, 1, '两个实例各走一步时世界 tick 仍只能 +1');
  assert.deepEqual(instances.map((instance) => instance.tick), [1, 1]);
  assert.deepEqual(deps.formationTicks, [
    { instanceId: 'instance:1', tick: 1 },
    { instanceId: 'instance:2', tick: 1 },
  ]);
  assert.deepEqual(deps.cleanupWorldTicks, [1]);
}

async function verifyHighFrequencyFramesStillProduceOneHzWorldClock(): Promise<void> {
  const instances = [createInstance('instance:fast:1', 4), createInstance('instance:fast:2', 4)];
  const deps = createDeps(instances);
  const service = new WorldRuntimeInstanceTickOrchestrationService();

  let logicalSteps = 0;
  for (let frame = 0; frame < 4; frame += 1) {
    logicalSteps += await service.advanceFrame(deps, 250, null);
  }

  assert.equal(logicalSteps, 8);
  assert.equal(deps.tick, 1, '4 倍速实例的 4 个 250ms 调度帧只应产生 1 个世界 tick');
  assert.deepEqual(instances.map((instance) => instance.tick), [4, 4]);
  assert.deepEqual(deps.cleanupWorldTicks, [0, 0, 0, 1]);
}

async function main(): Promise<void> {
  await verifyWorldTickDoesNotScaleWithInstanceCount();
  await verifyHighFrequencyFramesStillProduceOneHzWorldClock();
  console.log(JSON.stringify({ ok: true, case: 'world-runtime-world-clock' }));
}

void main();
