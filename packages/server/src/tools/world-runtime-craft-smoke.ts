import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { BuildingStrategy } from '../runtime/craft/pipeline/strategies/building.strategy';
import { FormationStrategy } from '../runtime/craft/pipeline/strategies/formation.strategy';
import { GatherStrategy } from '../runtime/craft/pipeline/strategies/gather.strategy';
import { MiningStrategy } from '../runtime/craft/pipeline/strategies/mining.strategy';
import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import { TechniqueActivityQueueService } from '../runtime/craft/pipeline/technique-activity-queue.service';
import { WorldRuntimeCraftInterruptService } from '../runtime/world/world-runtime-craft-interrupt.service';
import { WorldRuntimeCraftTickService } from '../runtime/world/world-runtime-craft-tick.service';

type FlushCall = [playerId: string, kind: string, text: string | null];

async function main(): Promise<void> {
  testActiveTechniqueActivityCoversAllRuntimeKinds();
  testInterruptUsesUnifiedPipelineAndSleepsConditionalJobs();
  testSleepingQueueRetrySkipsHotConditionCheck();
  testSleepingQueuePermanentCancelMarksDirty();
  testSleepingGatherQueueRestartsThroughPipeline();
  testSleepingBuildingQueueRestartsThroughPipeline();
  testSleepingFormationQueueRestartsThroughPipeline();
  testSleepingMiningQueueRestartsThroughPipeline();
  await testGatherStrategyTickDelegatesRuntimeService();
  testBuildingStrategyTickDelegatesRuntimeService();
  await testCraftTickUsesUnifiedPipelineForCraftingKinds();
  await testCraftTickUsesUnifiedPipelineForGatherBuilding();
  await testCraftTickSleepsConditionalGatherFailure();
  await testCraftTickSleepsConditionalBuildingFailure();
  await testCraftTickSleepsConditionalFormationFailure();

  console.log(JSON.stringify({
    ok: true,
    answers: [
      'hasAnyActiveTechniqueActivity 覆盖 alchemy/forging/enhancement/gather/building/formation/mining。',
      '采集/建造中断先写 sleeping 队列，再统一调用 interruptTechniqueActivity。',
      'sleeping 队列在 retryAfterTicks 到期前不做条件热检查。',
      'sleeping 队列永久失效会移除队列、标记 active_job 脏域并触发面板刷新。',
      '采集/建造/阵法/挖矿 sleeping 队列项会用原 payload 经过 pipeline start 恢复。',
      '采集/建造 strategy tick 会委托真实 runtime service。',
      '炼丹/炼器/强化/采集/建造 tick 编排直接走统一 tickTechniqueActivity 入口。',
      '采集/建造 tick 条件失败会进入统一 sleeping 队列。',
      '阵法维护 tick 条件失败会进入统一 sleeping 队列。',
    ],
  }, null, 2));
}

function testActiveTechniqueActivityCoversAllRuntimeKinds(): void {
  const service = Object.create(CraftPanelRuntimeService.prototype) as CraftPanelRuntimeService;
  const player = {
    alchemyJob: { jobType: 'alchemy', remainingTicks: 1, totalTicks: 1, pausedTicks: 0, phase: 'brewing' },
    forgingJob: { jobType: 'forging', remainingTicks: 1, totalTicks: 1, pausedTicks: 0, phase: 'brewing' },
    enhancementJob: { jobType: 'enhancement', remainingTicks: 1, totalTicks: 1, pausedTicks: 0, phase: 'enhancing' },
    gatherJob: { remainingTicks: 1, totalTicks: 1, pausedTicks: 0, phase: 'gathering' },
    buildingJob: { remainingTicks: 1, totalTicks: 1, pausedTicks: 0, phase: 'building' },
    formationJob: { remainingTicks: 1, totalTicks: 1, pausedTicks: 0, phase: 'maintaining' },
    miningJob: { remainingTicks: 1, totalTicks: 1, pausedTicks: 0, phase: 'mining' },
  };

  assert.equal(service.hasActiveTechniqueActivity(player as never, 'alchemy'), true);
  assert.equal(service.hasActiveTechniqueActivity(player as never, 'forging'), true);
  assert.equal(service.hasActiveTechniqueActivity(player as never, 'enhancement'), true);
  assert.equal(service.hasActiveTechniqueActivity(player as never, 'gather'), true);
  assert.equal(service.hasActiveTechniqueActivity(player as never, 'building'), true);
  assert.equal(service.hasActiveTechniqueActivity(player as never, 'formation'), true);
  assert.equal(service.hasActiveTechniqueActivity(player as never, 'mining'), true);
  assert.equal(service.hasAnyActiveTechniqueActivity(player as never), true);
}

function testInterruptUsesUnifiedPipelineAndSleepsConditionalJobs(): void {
  const flushes: FlushCall[] = [];
  const genericInterrupts: string[] = [];
  const player = {
    playerId: 'player:interrupt',
    alchemyJob: { remainingTicks: 1 },
    gatherJob: { remainingTicks: 2, resourceNodeId: 'herb:1', resourceNodeName: '灵草丛' },
    buildingJob: { remainingTicks: 3, buildingId: 'building:1', buildingName: '工坊' },
    formationJob: { remainingTicks: 4, formationInstanceId: 'formation:1', formationName: '聚灵阵' },
    techniqueActivityQueue: [],
  };
  const service = new WorldRuntimeCraftInterruptService(
    {
      listActiveTechniqueActivityKinds(): Iterable<string> {
        return ['alchemy', 'gather', 'building', 'formation'];
      },
      interruptTechniqueActivity(_player: unknown, kind: string, reason: string): unknown {
        genericInterrupts.push(`${kind}:${reason}`);
        return { ok: true, panelChanged: true, messages: [{ kind: 'system', text: `${kind} interrupted` }] };
      },
    },
    {
      flushCraftMutation(playerId: string, mutation: { messages?: Array<{ text?: string }> }, kind: string): void {
        flushes.push([playerId, kind, mutation.messages?.[0]?.text ?? null]);
      },
    },
  );

  service.interruptCraftForReason(player.playerId, player, 'move', {
    worldRuntimeLootContainerService: {
      interruptGather(): unknown {
        player.gatherJob = null;
        return { ok: true, panelChanged: true, messages: [{ kind: 'system', text: 'gather released' }] };
      },
    },
    interruptBuildingConstruction(playerId: string, reason: string): void {
      assert.equal(playerId, player.playerId);
      assert.equal(reason, 'move');
      player.buildingJob = null;
    },
  });

  assert.deepEqual(genericInterrupts, ['alchemy:move', 'gather:move', 'building:move']);
  assert.equal(flushes.some((entry) => entry[1] === 'gather'), true);
  assert.equal(flushes.some((entry) => entry[1] === 'building'), true);
  assert.equal(flushes.some((entry) => entry[1] === 'formation'), false);
  assert.equal(player.techniqueActivityQueue.length, 2);
  assert.equal(player.techniqueActivityQueue[0]?.kind, 'gather');
  assert.equal(player.techniqueActivityQueue[1]?.kind, 'building');
}

function createConditionalQueueProbeStrategy(condition: (job: { targetId?: string }) => { satisfied: boolean; shouldCancel?: boolean; reason?: string }) {
  return {
    kind: 'gather',
    jobSlot: 'gatherJob',
    skillSlot: 'gatherSkill',
    activityLabel: '采集',
    pauseTicks: 0,
    conditional: true,
    validateStart() { return { ok: false, error: 'not used' }; },
    consumeResources() {},
    createJob() { return { remainingTicks: 1, totalTicks: 1 }; },
    resolveResumePhase() { return 'gathering'; },
    isResolvePoint() { return false; },
    resolve() { return { successCount: 0, failureCount: 0, outputs: [], expParams: undefined as never }; },
    computeRefund() { return { items: [], spiritStones: 0 }; },
    dirtyDomains() { return ['active_job']; },
    checkContinueCondition(_player: unknown, job: { targetId?: string }) {
      return condition(job);
    },
  };
}

function testSleepingQueueRetrySkipsHotConditionCheck(): void {
  const pipeline = new TechniqueActivityPipelineService();
  let conditionChecks = 0;
  pipeline.register(createConditionalQueueProbeStrategy(() => {
    conditionChecks += 1;
    return { satisfied: false };
  }) as never);
  const queueService = new TechniqueActivityQueueService(pipeline);
  const player = {
    playerId: 'player:sleeping-retry-skip',
    techniqueActivityQueue: [{
      queueId: 'queue:gather:retry',
      kind: 'gather',
      payload: { targetId: 'node:1' },
      label: '采集',
      state: 'sleeping',
      retryAfterTicks: 2,
      createdAt: 1,
    }],
  };

  const result = queueService.tickQueue(player, {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return null; },
    deps: {},
  });

  assert.equal(result, null);
  assert.equal(conditionChecks, 0);
  assert.equal(player.techniqueActivityQueue[0]?.retryAfterTicks, 1);
  assert.equal(player.techniqueActivityQueue.length, 1);
}

function testSleepingQueuePermanentCancelMarksDirty(): void {
  const pipeline = new TechniqueActivityPipelineService();
  let conditionChecks = 0;
  pipeline.register(createConditionalQueueProbeStrategy((job) => {
    conditionChecks += 1;
    assert.equal(job.targetId, 'node:gone');
    return { satisfied: false, shouldCancel: true, reason: '目标消失' };
  }) as never);
  const queueService = new TechniqueActivityQueueService(pipeline);
  const player = {
    playerId: 'player:sleeping-permanent-cancel',
    persistentRevision: 1,
    dirtyDomains: new Set<string>(),
    techniqueActivityQueue: [{
      queueId: 'queue:gather:gone',
      kind: 'gather',
      payload: { targetId: 'node:gone' },
      label: '采集',
      state: 'sleeping',
      retryAfterTicks: 0,
      createdAt: 1,
    }],
  };

  const result = queueService.tickQueue(player, {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return null; },
    deps: {
      playerRuntimeService: {
        markPersistenceDirtyDomains(target: typeof player, domains: string[]) {
          for (const domain of domains) target.dirtyDomains.add(domain);
        },
        bumpPersistentRevision(target: typeof player) {
          target.persistentRevision += 1;
        },
      },
    },
  });

  assert.equal(conditionChecks, 1);
  assert.equal(result?.ok, true);
  assert.equal(result?.panelChanged, true);
  assert.equal(player.techniqueActivityQueue.length, 0);
  assert.equal(player.dirtyDomains.has('active_job'), true);
  assert.equal(player.persistentRevision, 2);
}

function testSleepingGatherQueueRestartsThroughPipeline(): void {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new GatherStrategy());
  const queueService = new TechniqueActivityQueueService(pipeline);
  const startedPayloads: unknown[] = [];
  const player = {
    playerId: 'player:gather-queue',
    techniqueActivityQueue: [{
      queueId: 'queue:gather:1',
      kind: 'gather',
      payload: { sourceId: 'container:instance:herb-1', itemKey: 'herb:item' },
      label: '灵草丛',
      state: 'sleeping',
      sleepReason: '离开采集点',
      retryAfterTicks: 0,
      createdAt: 1,
    }],
  };

  const result = queueService.tickQueue(player, {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return null; },
    deps: {
      worldRuntimeLootContainerService: {
        checkGatherContinueCondition(_playerId: string, _player: unknown, job: { sourceId?: string }): { satisfied: boolean } {
          assert.equal(job.sourceId, 'container:instance:herb-1');
          return { satisfied: true };
        },
        dispatchStartGather(_playerId: string, payload: unknown): { ok: boolean; panelChanged: boolean; messages: unknown[] } {
          startedPayloads.push(payload);
          return { ok: true, panelChanged: true, messages: [] };
        },
      },
    },
  });

  assert.equal(result?.ok, true);
  assert.deepEqual(startedPayloads, [{ sourceId: 'container:instance:herb-1', itemKey: 'herb:item' }]);
  assert.equal(player.techniqueActivityQueue.length, 0);
}

function testSleepingBuildingQueueRestartsThroughPipeline(): void {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new BuildingStrategy());
  const queueService = new TechniqueActivityQueueService(pipeline);
  const startedBuildingIds: string[] = [];
  const player = {
    playerId: 'player:building-queue',
    instanceId: 'instance:building',
    techniqueActivityQueue: [{
      queueId: 'queue:building:1',
      kind: 'building',
      payload: { buildingId: 'building-1', instanceId: 'instance:building' },
      label: '工坊',
      state: 'sleeping',
      sleepReason: '离开建筑',
      retryAfterTicks: 0,
      createdAt: 1,
    }],
  };

  const result = queueService.tickQueue(player, {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return null; },
    deps: {
      getInstanceRuntime(instanceId: string): unknown {
        assert.equal(instanceId, 'instance:building');
        return {
          buildingById: new Map([['building-1', { state: 'building', activeBuilderPlayerId: null }]]),
        };
      },
      dispatchStartBuildingConstruction(_playerId: string, buildingId: string): void {
        startedBuildingIds.push(buildingId);
      },
    },
  });

  assert.equal(result?.ok, true);
  assert.deepEqual(startedBuildingIds, ['building-1']);
  assert.equal(player.techniqueActivityQueue.length, 0);
}

function testSleepingFormationQueueRestartsThroughPipeline(): void {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new FormationStrategy());
  const queueService = new TechniqueActivityQueueService(pipeline);
  const startedPayloads: unknown[] = [];
  const player = {
    playerId: 'player:formation-queue',
    techniqueActivityQueue: [{
      queueId: 'queue:formation:1',
      kind: 'formation',
      payload: { formationInstanceId: 'formation-1' },
      label: '维护 聚灵阵',
      state: 'sleeping',
      sleepReason: '离开阵法控制点位',
      retryAfterTicks: 0,
      createdAt: 1,
    }],
  };

  const result = queueService.tickQueue(player, {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return null; },
    deps: {
      worldRuntimeFormationService: {
        checkFormationMaintenanceCondition(
          _player: unknown,
          job: { formationInstanceId?: string },
        ): { satisfied: boolean } {
          assert.equal(job.formationInstanceId, 'formation-1');
          return { satisfied: true };
        },
        startFormationMaintenance(_player: unknown, payload: unknown): { ok: boolean; panelChanged: boolean; messages: unknown[] } {
          startedPayloads.push(payload);
          return { ok: true, panelChanged: true, messages: [] };
        },
      },
    },
  });

  assert.equal(result?.ok, true);
  assert.deepEqual(startedPayloads, [{ formationInstanceId: 'formation-1' }]);
  assert.equal(player.techniqueActivityQueue.length, 0);
}

function testSleepingMiningQueueRestartsThroughPipeline(): void {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new MiningStrategy());
  const queueService = new TechniqueActivityQueueService(pipeline);
  const tileChecks: Array<[number, number]> = [];
  const player = {
    playerId: 'player:mining-queue',
    instanceId: 'instance:mine',
    x: 4,
    y: 5,
    attrs: { numericStats: { physAtk: 3 } },
    miningJob: null,
    techniqueActivityQueue: [{
      queueId: 'queue:mining:1',
      kind: 'mining',
      payload: { instanceId: 'instance:mine', targetX: 5, targetY: 5 },
      label: '黑铁矿',
      state: 'sleeping',
      sleepReason: '离开矿脉范围',
      retryAfterTicks: 0,
      createdAt: 1,
    }],
  };
  const instance = {
    getTileCombatState(x: number, y: number): unknown {
      tileChecks.push([x, y]);
      return { tileType: 'black_iron_ore', hp: 7, maxHp: 10, destroyed: false };
    },
  };

  const result = queueService.tickQueue(player, {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(instanceId: string): unknown {
      assert.equal(instanceId, 'instance:mine');
      return instance;
    },
    deps: {
      getPlayerLocation(playerId: string): { instanceId: string; x: number; y: number } {
        assert.equal(playerId, 'player:mining-queue');
        return { instanceId: 'instance:mine', x: 4, y: 5 };
      },
      getInstanceRuntime(instanceId: string): unknown {
        assert.equal(instanceId, 'instance:mine');
        return instance;
      },
    },
  });

  assert.equal(result?.ok, true);
  assert.equal(player.techniqueActivityQueue.length, 0);
  assert.equal(player.miningJob?.jobType, 'mining');
  assert.equal(player.miningJob?.instanceId, 'instance:mine');
  assert.equal(player.miningJob?.targetX, 5);
  assert.equal(player.miningJob?.targetY, 5);
  assert.equal(player.miningJob?.remainingTicks, 7);
  assert.deepEqual(tileChecks, [[5, 5], [5, 5]]);
}

async function testCraftTickUsesUnifiedPipelineForCraftingKinds(): Promise<void> {
  const tickedKinds: string[] = [];
  const flushedKinds: string[] = [];
  const player = {
    playerId: 'player:crafting-tick',
    alchemyJob: { remainingTicks: 2 },
    forgingJob: { remainingTicks: 3 },
    enhancementJob: { remainingTicks: 4 },
  };
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer(playerId: string): unknown {
        return playerId === player.playerId ? player : null;
      },
      runtimeEventBusService: null,
    },
    {
      listActiveTechniqueActivityKinds(): string[] {
        return ['alchemy', 'forging', 'enhancement'];
      },
      hasAnyActiveTechniqueActivity(): boolean {
        return true;
      },
      tickTechniqueActivity(_player: unknown, kind: string): unknown {
        tickedKinds.push(kind);
        return { ok: true, panelChanged: true, messages: [] };
      },
      buildPipelineContext(): unknown {
        return {};
      },
    },
    {
      flushCraftMutation(_playerId: string, _result: unknown, kind: string): void {
        flushedKinds.push(kind);
      },
    },
  );

  await service.advanceCraftJobs([player.playerId], {
    queuePlayerNotice(): void {},
  });

  assert.deepEqual(tickedKinds, ['alchemy', 'forging', 'enhancement']);
  assert.deepEqual(flushedKinds, ['alchemy', 'forging', 'enhancement']);
}

async function testGatherStrategyTickDelegatesRuntimeService(): Promise<void> {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new GatherStrategy());
  const player = {
    playerId: 'player:gather-strategy-tick',
    gatherJob: { remainingTicks: 2, resourceNodeId: 'herb-1' },
  };
  const calls: string[] = [];
  const result = await Promise.resolve(pipeline.tick(player, 'gather', {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return null; },
    deps: {
      worldRuntimeLootContainerService: {
        async tickGather(playerId: string): Promise<unknown> {
          calls.push(playerId);
          return { ok: true, panelChanged: true, messages: [] };
        },
      },
    },
  }));

  assert.deepEqual(calls, ['player:gather-strategy-tick']);
  assert.equal((result as { ok?: boolean })?.ok, true);
}

function testBuildingStrategyTickDelegatesRuntimeService(): void {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new BuildingStrategy());
  const player = {
    playerId: 'player:building-strategy-tick',
    buildingJob: { remainingTicks: 2, buildingId: 'building-1' },
  };
  const calls: string[] = [];
  const result = pipeline.tick(player, 'building', {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return null; },
    deps: {
      tickBuildingConstruction(playerId: string): unknown {
        calls.push(playerId);
        return { ok: true, panelChanged: true, messages: [] };
      },
    },
  });

  assert.deepEqual(calls, ['player:building-strategy-tick']);
  assert.equal((result as { ok?: boolean })?.ok, true);
}

async function testCraftTickUsesUnifiedPipelineForGatherBuilding(): Promise<void> {
  const tickedKinds: string[] = [];
  const flushedKinds: string[] = [];
  const player = {
    playerId: 'player:tick',
    gatherJob: { remainingTicks: 2 },
    buildingJob: { remainingTicks: 3 },
  };
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer(playerId: string): unknown {
        return playerId === player.playerId ? player : null;
      },
      runtimeEventBusService: null,
    },
    {
      listActiveTechniqueActivityKinds(): string[] {
        return ['gather', 'building'];
      },
      hasAnyActiveTechniqueActivity(): boolean {
        return true;
      },
      tickTechniqueActivity(_player: unknown, kind: string): unknown {
        tickedKinds.push(kind);
        return { ok: true, panelChanged: true, messages: [] };
      },
      buildPipelineContext(): unknown {
        return {};
      },
    },
    {
      flushCraftMutation(_playerId: string, _result: unknown, kind: string): void {
        flushedKinds.push(kind);
      },
    },
  );

  await service.advanceCraftJobs([player.playerId], {
    queuePlayerNotice(): void {},
  });

  assert.deepEqual(tickedKinds, ['gather', 'building']);
  assert.deepEqual(flushedKinds, ['gather', 'building']);
}

async function testCraftTickSleepsConditionalGatherFailure(): Promise<void> {
  const player = {
    playerId: 'player:gather-condition-fail',
    gatherJob: { remainingTicks: 2, resourceNodeId: 'herb-1', resourceNodeName: '灵草丛' },
    techniqueActivityQueue: [],
  };
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer(playerId: string): unknown {
        return playerId === player.playerId ? player : null;
      },
      runtimeEventBusService: null,
    },
    {
      listActiveTechniqueActivityKinds(): string[] {
        return ['gather'];
      },
      hasAnyActiveTechniqueActivity(activePlayer: typeof player): boolean {
        return Boolean(activePlayer.gatherJob && Number(activePlayer.gatherJob.remainingTicks) > 0);
      },
      tickTechniqueActivity(): unknown {
        player.gatherJob = null;
        return {
          ok: true,
          panelChanged: true,
          messages: [],
          groundDrops: [],
          sleepPayload: {
            kind: 'gather',
            payload: { sourceId: 'container:instance:herb-1' },
            label: '灵草丛',
            reason: '你已离开草药采集范围。',
          },
        };
      },
      buildPipelineContext(): unknown {
        return {};
      },
    },
    {
      flushCraftMutation(): void {},
    },
  );

  await service.advanceCraftJobs([player.playerId], {
    queuePlayerNotice(): void {},
  });

  assert.equal(player.techniqueActivityQueue.length, 1);
  assert.equal(player.techniqueActivityQueue[0]?.kind, 'gather');
  assert.equal(player.techniqueActivityQueue[0]?.state, 'sleeping');
  assert.deepEqual(player.techniqueActivityQueue[0]?.payload, { sourceId: 'container:instance:herb-1' });
}

async function testCraftTickSleepsConditionalBuildingFailure(): Promise<void> {
  const player = {
    playerId: 'player:building-condition-fail',
    buildingJob: { remainingTicks: 3, buildingId: 'building-1', buildingName: '工坊' },
    techniqueActivityQueue: [],
  };
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer(playerId: string): unknown {
        return playerId === player.playerId ? player : null;
      },
      runtimeEventBusService: null,
    },
    {
      listActiveTechniqueActivityKinds(): string[] {
        return ['building'];
      },
      hasAnyActiveTechniqueActivity(activePlayer: typeof player): boolean {
        return Boolean(activePlayer.buildingJob && Number(activePlayer.buildingJob.remainingTicks) > 0);
      },
      tickTechniqueActivity(): unknown {
        player.buildingJob = null;
        return {
          ok: true,
          panelChanged: true,
          messages: [],
          groundDrops: [],
          sleepPayload: {
            kind: 'building',
            payload: { buildingId: 'building-1' },
            label: '工坊',
            reason: '建筑正在由其他玩家施工。',
          },
        };
      },
      buildPipelineContext(): unknown {
        return {};
      },
    },
    {
      flushCraftMutation(): void {},
    },
  );

  await service.advanceCraftJobs([player.playerId], {
    queuePlayerNotice(): void {},
  });

  assert.equal(player.techniqueActivityQueue.length, 1);
  assert.equal(player.techniqueActivityQueue[0]?.kind, 'building');
  assert.equal(player.techniqueActivityQueue[0]?.state, 'sleeping');
  assert.deepEqual(player.techniqueActivityQueue[0]?.payload, { buildingId: 'building-1' });
}

async function testCraftTickSleepsConditionalFormationFailure(): Promise<void> {
  const player = {
    playerId: 'player:formation-condition-fail',
    formationJob: {
      remainingTicks: 1,
      totalTicks: 1,
      formationInstanceId: 'formation-1',
      formationName: '聚灵阵',
      phase: 'maintaining',
    },
    techniqueActivityQueue: [],
  };
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer(playerId: string): unknown {
        return playerId === player.playerId ? player : null;
      },
      runtimeEventBusService: null,
    },
    {
      listActiveTechniqueActivityKinds(): string[] {
        return ['formation'];
      },
      hasAnyActiveTechniqueActivity(activePlayer: typeof player): boolean {
        return Boolean(activePlayer.formationJob && Number(activePlayer.formationJob.remainingTicks) > 0);
      },
      tickTechniqueActivity(): unknown {
        player.formationJob = null;
        return {
          ok: true,
          panelChanged: true,
          messages: [],
          groundDrops: [],
          sleepPayload: {
            kind: 'formation',
            payload: { formationInstanceId: 'formation-1' },
            label: '维护 聚灵阵',
            reason: '离开阵法控制点位。',
          },
        };
      },
      buildPipelineContext(): unknown {
        return {};
      },
    },
    {
      flushCraftMutation(): void {},
    },
  );

  await service.advanceCraftJobs([player.playerId], {
    queuePlayerNotice(): void {},
  });

  assert.equal(player.techniqueActivityQueue.length, 1);
  assert.equal(player.techniqueActivityQueue[0]?.kind, 'formation');
  assert.equal(player.techniqueActivityQueue[0]?.state, 'sleeping');
  assert.deepEqual(player.techniqueActivityQueue[0]?.payload, { formationInstanceId: 'formation-1' });
}

void main();
