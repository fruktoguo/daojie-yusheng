import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { BuildingStrategy } from '../runtime/craft/pipeline/strategies/building.strategy';
import { FormationStrategy } from '../runtime/craft/pipeline/strategies/formation.strategy';
import { GatherStrategy } from '../runtime/craft/pipeline/strategies/gather.strategy';
import { MiningStrategy } from '../runtime/craft/pipeline/strategies/mining.strategy';
import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import { TechniqueActivityQueueService } from '../runtime/craft/pipeline/technique-activity-queue.service';
import { WorldRuntimeCraftInterruptService } from '../runtime/world/world-runtime-craft-interrupt.service';
import { WorldRuntimeCraftTickService } from '../runtime/world/world-runtime-craft-tick.service';
import { tickBuildingConstruction } from '../runtime/world/world-runtime-building.service';
import { WorldRuntimeLootContainerService } from '../runtime/world/world-runtime-loot-container.service';

type FlushCall = [playerId: string, kind: string, text: string | null];

async function main(): Promise<void> {
  testActiveTechniqueActivityCoversAllRuntimeKinds();
  testInterruptUsesUnifiedPipelineAndSleepsConditionalJobs();
  testInterruptReasonsKeepWorkProgressSeparate();
  testSleepingQueueRetrySkipsHotConditionCheck();
  testSleepingQueuePermanentCancelMarksDirty();
  testSleepingGatherQueueRestartsThroughPipeline();
  testGatherStartCancelUsePipelineLifecycle();
  testSleepingBuildingQueueRestartsThroughPipeline();
  testBuildingStartCancelUsePipelineLifecycle();
  testSleepingFormationQueueRestartsThroughPipeline();
  testSleepingMiningQueueRestartsThroughPipeline();
  testGenericPipelinePauseAdvancesInterruptWaitState();
  await testGatherActiveSearchRejectsCompetingPlayers();
  await testGatherPermanentLossReleasesStaleActiveSearch();
  testBuildingActiveBuilderRejectsCompetingPlayers();
  testBuildingStrategyConditionFailureReleasesActiveBuilder();
  testBuildingPermanentInvalidTickReleasesActiveBuilder();
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
      'move/attack/cultivate 打断炼丹/炼器/强化/挖矿/阵法维护时不修改实际工作进度；阵法移动不伪装成等待条。',
      'sleeping 队列在 retryAfterTicks 到期前不做条件热检查。',
      'sleeping 队列永久失效会移除队列、标记 active_job 脏域并触发面板刷新。',
      '采集/建造/阵法/挖矿 sleeping 队列项会用原 payload 经过 pipeline start 恢复。',
      '采集 start/cancel 不再走 strategy 旧委托，而是通过标准 pipeline lifecycle 创建 job 并释放 activeSearch。',
      '建造 start/cancel 不再走 strategy 旧委托，而是通过标准 pipeline lifecycle 创建 job 并释放 activeBuilder。',
      '公共 pipeline 暂停推进会同步 interruptWaitRemainingTicks 和 interruptState，不改实际工作进度。',
      '采集 activeSearch 带 owner，其他玩家不能覆盖同一采集目标的 job 进度。',
      '采集目标永久消失时会释放遗留 container activeSearch。',
      '建造 activeBuilder 不会被其他玩家重入覆盖。',
      '建造条件永久失效时会释放当前玩家遗留 activeBuilder。',
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

function testInterruptReasonsKeepWorkProgressSeparate(): void {
  for (const reason of ['move', 'attack', 'cultivate'] as const) {
    const player = createInterruptProgressPlayer(reason);
    const before = snapshotProgressFields(player);
    const craftService = createInterruptProgressCraftService();
    const service = new WorldRuntimeCraftInterruptService(
      craftService as never,
      {
        flushCraftMutation(_playerId: string, mutation: { ok?: boolean }, _kind: string): void {
          assert.equal(mutation.ok, true);
        },
      },
    );

    service.interruptCraftForReason(player.playerId, player, reason, {
      playerRuntimeService: {
        markPersistenceDirtyDomains(activePlayer: typeof player, domains: string[]): void {
          for (const domain of domains) {
            activePlayer.dirtyDomains.add(domain);
          }
        },
        bumpPersistentRevision(activePlayer: typeof player): void {
          activePlayer.persistentRevision += 1;
        },
      },
      worldRuntimeLootContainerService: {
        interruptGather(): unknown {
          throw new Error('gather should not be active in this proof');
        },
      },
    } as never);

    assert.deepEqual(snapshotProgressFields(player), before);
    assertInterruptWait(player.alchemyJob, reason);
    assertInterruptWait(player.forgingJob, reason);
    assertInterruptWait(player.enhancementJob, reason);
    assertInterruptWait(player.miningJob, reason);
    if (reason === 'move') {
      assert.equal(player.formationJob.phase, 'maintaining');
      assert.equal(player.formationJob.interruptWaitRemainingTicks, 0);
      assert.equal(player.formationJob.interruptState, null);
    } else {
      assertInterruptWait(player.formationJob, reason);
    }
    assert.equal(player.dirtyDomains.has('active_job'), true);
  }
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

function createInterruptProgressCraftService(): CraftPanelRuntimeService {
  const service = Object.create(CraftPanelRuntimeService.prototype) as CraftPanelRuntimeService & {
    contentTemplateRepository: {
      getItemName(itemId: string): string;
      normalizeItem(item: { itemId: string; count: number }): unknown;
    };
    playerRuntimeService: {
      markPersistenceDirtyDomains(player: { dirtyDomains: Set<string> }, domains: string[]): void;
      bumpPersistentRevision(player: { persistentRevision: number }): void;
    };
    ensureCraftSkills(player: unknown): void;
    finalizeMutation(player: { dirtyDomains: Set<string>; persistentRevision: number }, options?: { dirtyDomains?: string[] }): void;
  };
  service.pipeline = null;
  service.contentTemplateRepository = {
    getItemName(itemId: string): string {
      return `物品:${itemId}`;
    },
    normalizeItem(item: { itemId: string; count: number }): unknown {
      return item;
    },
  };
  service.playerRuntimeService = {
    markPersistenceDirtyDomains(player: { dirtyDomains: Set<string> }, domains: string[]): void {
      for (const domain of domains) {
        player.dirtyDomains.add(domain);
      }
    },
    bumpPersistentRevision(player: { persistentRevision: number }): void {
      player.persistentRevision += 1;
    },
  };
  service.ensureCraftSkills = () => {};
  service.finalizeMutation = (
    player: { dirtyDomains: Set<string>; persistentRevision: number },
    options: { dirtyDomains?: string[] } = {},
  ) => {
    for (const domain of options.dirtyDomains ?? ['active_job']) {
      player.dirtyDomains.add(domain);
    }
    player.persistentRevision += 1;
  };
  return service;
}

function createInterruptProgressPlayer(reason: string) {
  return {
    playerId: `player:interrupt-progress:${reason}`,
    dirtyDomains: new Set<string>(),
    persistentRevision: 1,
    techniqueActivityQueue: [],
    alchemyJob: createProgressJob('alchemy', 'brewing', {
      outputItemId: 'pill.test',
      currentBatchRemainingTicks: 4,
    }),
    forgingJob: createProgressJob('forging', 'brewing', {
      outputItemId: 'gear.test',
      currentBatchRemainingTicks: 5,
    }),
    enhancementJob: createProgressJob('enhancement', 'enhancing', {
      targetItemName: '试炼剑',
    }),
    miningJob: createProgressJob('mining', 'mining', {
      miningNodeName: '试炼矿脉',
      instanceId: 'instance:test',
      targetX: 1,
      targetY: 1,
      tileType: 'ore',
      baseDamagePerTick: 1,
    }),
    formationJob: createProgressJob('formation', 'maintaining', {
      formationInstanceId: 'formation:test',
      formationName: '试炼阵法',
    }),
  };
}

function createProgressJob(jobType: string, phase: string, extra: Record<string, unknown>) {
  return {
    jobRunId: `job:${jobType}:progress-proof`,
    jobType,
    phase,
    totalTicks: 20,
    remainingTicks: 12,
    workTotalTicks: 20,
    workRemainingTicks: 12,
    pausedTicks: 0,
    interruptWaitRemainingTicks: 0,
    interruptState: null,
    successRate: 1,
    spiritStoneCost: 0,
    startedAt: 1,
    ...extra,
  };
}

function snapshotProgressFields(player: ReturnType<typeof createInterruptProgressPlayer>): Record<string, unknown> {
  return {
    alchemy: pickProgressFields(player.alchemyJob),
    forging: pickProgressFields(player.forgingJob),
    enhancement: pickProgressFields(player.enhancementJob),
    mining: pickProgressFields(player.miningJob),
    formation: pickProgressFields(player.formationJob),
  };
}

function pickProgressFields(job: { totalTicks: number; remainingTicks: number; workTotalTicks: number; workRemainingTicks: number }): Record<string, number> {
  return {
    totalTicks: job.totalTicks,
    remainingTicks: job.remainingTicks,
    workTotalTicks: job.workTotalTicks,
    workRemainingTicks: job.workRemainingTicks,
  };
}

function assertInterruptWait(job: { phase: string; pausedTicks: number; interruptWaitRemainingTicks?: number; interruptState?: { reason?: string; waitRemainingTicks?: number } | null }, reason: string): void {
  assert.equal(job.phase, 'paused');
  assert.equal(job.pausedTicks, 10);
  assert.equal(job.interruptWaitRemainingTicks, 10);
  assert.equal(job.interruptState?.reason, reason);
  assert.equal(job.interruptState?.waitRemainingTicks, 10);
}

function testGenericPipelinePauseAdvancesInterruptWaitState(): void {
  const pipeline = new TechniqueActivityPipelineService();
  const player = {
    playerId: 'player:pipeline-pause',
    formationJob: {
      remainingTicks: 5,
      totalTicks: 5,
      workRemainingTicks: 5,
      workTotalTicks: 5,
      pausedTicks: 3,
      interruptWaitRemainingTicks: 3,
      interruptState: {
        reason: 'attack',
        waitTotalTicks: 3,
        waitRemainingTicks: 3,
      },
      phase: 'paused',
    },
    dirtyDomains: new Set<string>(),
    persistentRevision: 1,
  };
  pipeline.register({
    kind: 'formation',
    jobSlot: 'formationJob',
    skillSlot: 'formationSkill',
    activityLabel: '阵法维护',
    pauseTicks: 10,
    conditional: false,
    resolveResumePhase(): string {
      return 'maintaining';
    },
    isResolvePoint(): boolean {
      return false;
    },
    resolve(): never {
      throw new Error('unexpected resolve');
    },
    computeRefund(): { items: never[]; spiritStones: number } {
      return { items: [], spiritStones: 0 };
    },
    dirtyDomains(): string[] {
      return ['active_job'];
    },
  } as any);

  const result = pipeline.tick(player, 'formation', {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return null; },
    deps: {
      playerRuntimeService: {
        bumpPersistentRevision(activePlayer: typeof player): void {
          activePlayer.persistentRevision += 1;
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(player.formationJob.pausedTicks, 2);
  assert.equal(player.formationJob.interruptWaitRemainingTicks, 2);
  assert.equal(player.formationJob.interruptState?.waitRemainingTicks, 2);
  assert.equal(player.formationJob.remainingTicks, 5);
  assert.equal(player.formationJob.workRemainingTicks, 5);
  assert.equal(player.formationJob.phase, 'paused');
  assert.equal(player.dirtyDomains.has('active_job'), true);
  assert.equal(player.persistentRevision, 2);
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
  const dirtyDomains: string[][] = [];
  const player = {
    playerId: 'player:gather-queue',
    gatherJob: null as any,
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
          player.gatherJob = {
            sourceId: 'container:instance:herb-1',
            resourceNodeId: 'herb-1',
            instanceId: 'instance',
            resourceNodeName: '灵草丛',
            remainingTicks: 3,
            totalTicks: 3,
            workRemainingTicks: 3,
            workTotalTicks: 3,
            phase: 'gathering',
          };
          dirtyDomains.push(['active_job']);
          return { ok: true, panelChanged: true, messages: [] };
        },
      },
      playerRuntimeService: {
        markPersistenceDirtyDomains(_player: unknown, domains: string[]): void {
          dirtyDomains.push(domains);
        },
        bumpPersistentRevision(_player: unknown): void {},
      },
    },
  });

  assert.equal(result?.ok, true);
  assert.deepEqual(startedPayloads, [{ sourceId: 'container:instance:herb-1', itemKey: 'herb:item' }]);
  assert.equal(player.gatherJob?.sourceId, 'container:instance:herb-1');
  assert.equal(player.techniqueActivityQueue.length, 0);
  assert.deepEqual(dirtyDomains, [['active_job']]);
}

function testGatherStartCancelUsePipelineLifecycle(): void {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new GatherStrategy());
  const player = {
    playerId: 'player:gather-lifecycle',
    gatherJob: null as any,
    dirtyDomains: new Set<string>(),
  };
  const released: Array<{ playerId: string; sourceId?: string }> = [];
  const playerDirtyDomains: string[][] = [];
  const ctx = {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return null; },
    deps: {
      worldRuntimeLootContainerService: {
        dispatchStartGather(playerId: string, payload: unknown): { ok: boolean; panelChanged: boolean; messages: unknown[] } {
          assert.equal(playerId, player.playerId);
          assert.deepEqual(payload, { sourceId: 'container:instance:herb-1' });
          player.gatherJob = {
            sourceId: 'container:instance:herb-1',
            resourceNodeId: 'herb-1',
            instanceId: 'instance',
            resourceNodeName: '灵草丛',
            remainingTicks: 3,
            totalTicks: 3,
            workRemainingTicks: 3,
            workTotalTicks: 3,
            phase: 'gathering',
          };
          return { ok: true, panelChanged: true, messages: [] };
        },
        releaseGatherActiveSearch(playerId: string, _player: unknown, job: { sourceId?: string }): void {
          released.push({ playerId, sourceId: job.sourceId });
        },
      },
      playerRuntimeService: {
        markPersistenceDirtyDomains(_player: unknown, domains: string[]): void {
          playerDirtyDomains.push(domains);
        },
        bumpPersistentRevision(_player: unknown): void {},
      },
    },
  };

  const started = pipeline.start(player, 'gather', { sourceId: 'container:instance:herb-1' }, ctx);
  assert.equal(started.ok, true);
  assert.equal(started.panelChanged, true);
  assert.equal(player.gatherJob?.sourceId, 'container:instance:herb-1');

  const cancelled = pipeline.cancel(player, 'gather', ctx);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.panelChanged, true);
  assert.equal(player.gatherJob, null);
  assert.deepEqual(released, [{ playerId: player.playerId, sourceId: 'container:instance:herb-1' }]);
  assert.deepEqual(playerDirtyDomains, [['active_job']]);
  assert.equal(player.dirtyDomains.has('active_job'), true);
}

function testSleepingBuildingQueueRestartsThroughPipeline(): void {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new BuildingStrategy());
  const queueService = new TechniqueActivityQueueService(pipeline);
  const startedBuildingIds: string[] = [];
  const dirtyDomains: string[][] = [];
  const player = {
    playerId: 'player:building-queue',
    instanceId: 'instance:building',
    buildingJob: null as any,
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
        player.buildingJob = {
          buildingId,
          buildingName: '工坊',
          instanceId: 'instance:building',
          remainingTicks: 5,
          totalTicks: 5,
          workRemainingTicks: 5,
          workTotalTicks: 5,
          phase: 'building',
        };
        dirtyDomains.push(['active_job']);
      },
      playerRuntimeService: {
        markPersistenceDirtyDomains(_player: unknown, domains: string[]): void {
          dirtyDomains.push(domains);
        },
        bumpPersistentRevision(_player: unknown): void {},
      },
    },
  });

  assert.equal(result?.ok, true);
  assert.deepEqual(startedBuildingIds, ['building-1']);
  assert.equal(player.buildingJob?.buildingId, 'building-1');
  assert.equal(player.techniqueActivityQueue.length, 0);
  assert.deepEqual(dirtyDomains, [['active_job']]);
}

function testBuildingStartCancelUsePipelineLifecycle(): void {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new BuildingStrategy());
  const building = {
    id: 'building-1',
    state: 'building',
    activeBuilderPlayerId: null as string | null,
    buildCompleteTick: 40 as number | undefined,
    buildRemainingTicks: 4,
    revision: 1,
  };
  const instance = {
    tick: 20,
    worldRevision: 1,
    persistentRevision: 1,
    buildingById: new Map<string, any>([['building-1', building]]),
    dirtyDomains: [] as string[][],
    stopBuildingConstruction(buildingId: string, playerId: string): { ok: boolean } {
      assert.equal(buildingId, 'building-1');
      assert.equal(playerId, 'player:building-lifecycle');
      building.activeBuilderPlayerId = null;
      building.buildCompleteTick = undefined;
      this.dirtyDomains.push(['building']);
      return { ok: true };
    },
    markPersistenceDirtyDomainsHighPriority(domains: string[]): void {
      this.dirtyDomains.push(domains);
    },
  };
  const player = {
    playerId: 'player:building-lifecycle',
    instanceId: 'instance:building',
    buildingJob: null as any,
    dirtyDomains: new Set<string>(),
  };
  const playerDirtyDomains: string[][] = [];
  let refreshed = 0;
  const ctx = {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return instance; },
    deps: {
      getInstanceRuntime(instanceId: string): unknown {
        assert.equal(instanceId, 'instance:building');
        return instance;
      },
      dispatchStartBuildingConstruction(playerId: string, buildingId: string): void {
        assert.equal(playerId, player.playerId);
        assert.equal(buildingId, 'building-1');
        building.activeBuilderPlayerId = playerId;
        player.buildingJob = {
          buildingId,
          buildingName: '工坊',
          instanceId: 'instance:building',
          remainingTicks: 4,
          totalTicks: 4,
          workRemainingTicks: 4,
          workTotalTicks: 4,
          phase: 'building',
        };
      },
      refreshPlayerContextActions(playerId: string): void {
        assert.equal(playerId, player.playerId);
        refreshed += 1;
      },
      playerRuntimeService: {
        markPersistenceDirtyDomains(_player: unknown, domains: string[]): void {
          playerDirtyDomains.push(domains);
        },
        bumpPersistentRevision(_player: unknown): void {},
      },
    },
  };

  const started = pipeline.start(player, 'building', { buildingId: 'building-1' }, ctx);
  assert.equal(started.ok, true);
  assert.equal(started.panelChanged, true);
  assert.equal(player.buildingJob?.buildingId, 'building-1');
  assert.equal(building.activeBuilderPlayerId, player.playerId);

  const cancelled = pipeline.cancel(player, 'building', ctx);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.panelChanged, true);
  assert.equal(player.buildingJob, null);
  assert.equal(building.activeBuilderPlayerId, null);
  assert.equal(building.buildCompleteTick, undefined);
  assert.equal(refreshed, 1);
  assert.deepEqual(instance.dirtyDomains, [['building']]);
  assert.deepEqual(playerDirtyDomains, [['active_job']]);
  assert.equal(player.dirtyDomains.has('active_job'), true);
}

function testSleepingFormationQueueRestartsThroughPipeline(): void {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new FormationStrategy());
  const queueService = new TechniqueActivityQueueService(pipeline);
  const player = {
    playerId: 'player:formation-queue',
    formationJob: null,
    dirtyDomains: new Set<string>(),
    persistentRevision: 1,
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
        findOwnedFormation(playerId: string, formationInstanceId: string): { id: string; name: string; instanceId: string; x: number; y: number } {
          assert.equal(playerId, 'player:formation-queue');
          assert.equal(formationInstanceId, 'formation-1');
          return { id: 'formation-1', name: '聚灵阵', instanceId: 'instance:formation', x: 4, y: 5 };
        },
        checkFormationMaintenanceCondition(
          _player: unknown,
          job: { formationInstanceId?: string },
        ): { satisfied: boolean } {
          assert.equal(job.formationInstanceId, 'formation-1');
          return { satisfied: true };
        },
        createFormationMaintenanceJob(_player: unknown, validated: { formationInstanceId?: string }): Record<string, unknown> {
          assert.equal(validated.formationInstanceId, 'formation-1');
          return {
            jobRunId: 'job:formation:queue',
            jobType: 'formation',
            formationInstanceId: 'formation-1',
            formationName: '聚灵阵',
            phase: 'maintaining',
            totalTicks: 1,
            remainingTicks: 1,
            workTotalTicks: 1,
            workRemainingTicks: 1,
            jobVersion: 1,
          };
        },
        startFormationMaintenance(): never {
          throw new Error('formation queue restart must use pipeline lifecycle');
        },
      },
      playerRuntimeService: {
        bumpPersistentRevision(activePlayer: typeof player): void {
          activePlayer.persistentRevision += 1;
        },
      },
    },
  });

  assert.equal(result?.ok, true);
  assert.equal(player.formationJob?.formationInstanceId, 'formation-1');
  assert.equal(player.dirtyDomains.has('active_job'), true);
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

async function testGatherActiveSearchRejectsCompetingPlayers(): Promise<void> {
  const instanceId = 'instance:gather-competition';
  const container = {
    id: 'herb-1',
    name: '灵草丛',
    variant: 'herb',
    grade: 'mortal',
    x: 1,
    y: 1,
    drops: [{
      itemId: 'herb.qi',
      name: '灵草',
      type: 'material',
      count: 1,
      chance: 1,
    }],
    lootPools: [],
  };
  const instance = {
    tick: 1,
    getContainerById(containerId: string): unknown {
      return containerId === container.id ? container : null;
    },
  };
  const playerA = createGatherCompetitionPlayer('player:gather-a', instanceId);
  const playerB = createGatherCompetitionPlayer('player:gather-b', instanceId);
  const players = new Map<string, any>([
    [playerA.playerId, playerA],
    [playerB.playerId, playerB],
  ]);
  const playerRuntimeService = {
    getPlayer(playerId: string): any | null {
      return players.get(playerId) ?? null;
    },
    getPlayerOrThrow(playerId: string): any {
      const player = players.get(playerId);
      if (!player) {
        throw new Error(`unknown player: ${playerId}`);
      }
      return player;
    },
    getLootWindowTarget(): { tileX: number; tileY: number } {
      return { tileX: container.x, tileY: container.y };
    },
    clearLootWindow(): void {},
    bumpPersistentRevision(player: any): void {
      player.persistentRevision = Math.max(0, Math.trunc(Number(player.persistentRevision) || 0)) + 1;
    },
    markPersistenceDirtyDomains(player: any, domains: string[]): void {
      if (!(player.dirtyDomains instanceof Set)) {
        player.dirtyDomains = new Set<string>();
      }
      for (const domain of domains) {
        player.dirtyDomains.add(domain);
      }
    },
  };
  const service = new WorldRuntimeLootContainerService({
    createItem(itemId: string, count: number): unknown {
      return { itemId, count, name: '灵草', type: 'material', grade: 'mortal', level: 1 };
    },
  } as never, playerRuntimeService as never, null);
  const deps = {
    getPlayerLocationOrThrow(playerId: string): { instanceId: string } {
      assert.equal(players.has(playerId), true);
      return { instanceId };
    },
    getInstanceRuntimeOrThrow(targetInstanceId: string): unknown {
      assert.equal(targetInstanceId, instanceId);
      return instance;
    },
    getInstanceRuntime(targetInstanceId: string): unknown {
      assert.equal(targetInstanceId, instanceId);
      return instance;
    },
  };
  const sourceId = `container:${instanceId}:${container.id}`;

  const startA = service.dispatchStartGather(playerA.playerId, { sourceId }, deps);
  assert.equal(startA.ok, true);
  const state = service.ensureContainerState(instanceId, container, instance.tick);
  assert.equal(state.activeSearch?.playerId, playerA.playerId);

  const startB = service.dispatchStartGather(playerB.playerId, { sourceId }, deps) as any;
  assert.equal(startB.ok, false);
  assert.equal(startB.error, '当前已有玩家正在采集该目标。');
  assert.equal(state.activeSearch?.playerId, playerA.playerId);

  playerB.gatherJob = {
    resourceNodeId: container.id,
    sourceId,
    instanceId,
    resourceNodeName: container.name,
    remainingTicks: 2,
    totalTicks: 2,
    workRemainingTicks: 2,
    workTotalTicks: 2,
    phase: 'gathering',
  };
  const tickB = await service.tickGather(playerB.playerId, deps) as any;
  assert.equal(tickB.ok, true);
  assert.equal(tickB.sleepPayload?.kind, 'gather');
  assert.equal(playerB.gatherJob, null);
  assert.equal(state.activeSearch?.playerId, playerA.playerId);

  const cancelA = service.dispatchCancelGather(playerA.playerId, deps);
  assert.equal(cancelA.ok, true);
  assert.equal(state.activeSearch, undefined);
}

async function testGatherPermanentLossReleasesStaleActiveSearch(): Promise<void> {
  const instanceId = 'instance:gather-permanent-loss';
  const containerId = 'herb-missing';
  const player = createGatherCompetitionPlayer('player:gather-loss', instanceId);
  player.gatherJob = {
    resourceNodeId: containerId,
    sourceId: `container:${instanceId}:${containerId}`,
    instanceId,
    resourceNodeName: '消失的灵草丛',
    remainingTicks: 2,
    totalTicks: 2,
    workRemainingTicks: 2,
    workTotalTicks: 2,
    phase: 'gathering',
  };
  const playerRuntimeService = {
    getLootWindowTarget(): { tileX: number; tileY: number } {
      return { tileX: 1, tileY: 1 };
    },
    getPlayerOrThrow(): any {
      return player;
    },
    getPlayer(): any {
      return player;
    },
    bumpPersistentRevision(targetPlayer: any): void {
      targetPlayer.persistentRevision = Math.max(0, Math.trunc(Number(targetPlayer.persistentRevision) || 0)) + 1;
    },
    markPersistenceDirtyDomains(targetPlayer: any, domains: string[]): void {
      if (!(targetPlayer.dirtyDomains instanceof Set)) {
        targetPlayer.dirtyDomains = new Set<string>();
      }
      for (const domain of domains) {
        targetPlayer.dirtyDomains.add(domain);
      }
    },
  };
  const service = new WorldRuntimeLootContainerService({
    createItem(itemId: string, count: number): unknown {
      return { itemId, count };
    },
  } as never, playerRuntimeService as never, null);
  service.hydrateContainerStates(instanceId, [{
    sourceId: `container:${instanceId}:${containerId}`,
    containerId,
    generatedAtTick: 1,
    refreshAtTick: 100,
    entries: [],
    activeSearch: {
      playerId: player.playerId,
      itemKey: 'herb.qi:1',
      totalTicks: 2,
      remainingTicks: 1,
    },
  }]);
  const instance = {
    tick: 5,
    getContainerById(): null {
      return null;
    },
  };
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new GatherStrategy());

  const result = await Promise.resolve(pipeline.tick(player, 'gather', {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return instance; },
    deps: {
      worldRuntimeLootContainerService: service,
      getPlayerLocationOrThrow(): { instanceId: string } {
        return { instanceId };
      },
      getInstanceRuntimeOrThrow(targetInstanceId: string): unknown {
        assert.equal(targetInstanceId, instanceId);
        return instance;
      },
      getInstanceRuntime(targetInstanceId: string): unknown {
        assert.equal(targetInstanceId, instanceId);
        return instance;
      },
    },
  })) as any;

  assert.equal(result.ok, true);
  assert.equal(result.sleepPayload, undefined);
  assert.equal(player.gatherJob, null);
  const [persisted] = service.buildContainerPersistenceStates(instanceId);
  assert.equal(persisted?.activeSearch, undefined);
  assert.equal(service.getDirtyInstanceIds().has(instanceId), true);
}

function testBuildingActiveBuilderRejectsCompetingPlayers(): void {
  const instance = Object.create(MapInstanceRuntime.prototype) as any;
  instance.tick = 10;
  instance.worldRevision = 1;
  instance.persistentRevision = 1;
  instance.playersById = new Map<string, any>([
    ['player:builder-a', { playerId: 'player:builder-a', x: 1, y: 1 }],
    ['player:builder-b', { playerId: 'player:builder-b', x: 1, y: 1 }],
  ]);
  instance.buildingById = new Map<string, any>([
    ['building-1', {
      id: 'building-1',
      state: 'building',
      x: 1,
      y: 1,
      buildStrength: 5,
      buildRemainingTicks: 5,
      activeBuilderPlayerId: 'player:builder-a',
      revision: 1,
    }],
  ]);
  const dirtyDomains: string[][] = [];
  instance.markPersistenceDirtyDomainsHighPriority = (domains: string[]): void => {
    dirtyDomains.push(domains);
  };

  const rejected = instance.startBuildingConstruction('building-1', 'player:builder-b');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'building_active_builder_mismatch');
  const building = instance.buildingById.get('building-1');
  assert.equal(building.activeBuilderPlayerId, 'player:builder-a');
  assert.equal(building.buildCompleteTick, undefined);
  assert.equal(instance.worldRevision, 1);
  assert.deepEqual(dirtyDomains, []);

  const resumedByOwner = instance.startBuildingConstruction('building-1', 'player:builder-a');
  assert.equal(resumedByOwner.ok, true);
  assert.equal(building.activeBuilderPlayerId, 'player:builder-a');
}

function testBuildingStrategyConditionFailureReleasesActiveBuilder(): void {
  const strategy = new BuildingStrategy();
  const instance = {
    tick: 20,
    worldRevision: 1,
    persistentRevision: 1,
    buildingById: new Map<string, any>([
      ['building-1', {
        id: 'building-1',
        state: 'active',
        activeBuilderPlayerId: 'player:builder-a',
        buildCompleteTick: 30,
        revision: 1,
      }],
    ]),
    dirtyDomains: [] as string[][],
    markPersistenceDirtyDomainsHighPriority(domains: string[]): void {
      this.dirtyDomains.push(domains);
    },
  };
  const player = {
    playerId: 'player:builder-a',
    instanceId: 'instance:building',
  };
  const job = {
    buildingId: 'building-1',
    instanceId: 'instance:building',
  };

  const condition = strategy.checkContinueCondition(player, job, {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return instance; },
    deps: {
      getInstanceRuntime(instanceId: string): unknown {
        assert.equal(instanceId, 'instance:building');
        return instance;
      },
    },
  });
  assert.equal(condition.satisfied, false);
  assert.equal(condition.shouldCancel, true);

  strategy.onConditionFailed?.(player, job, {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: { itemId: string; count: number }): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 100; },
    getInstanceRuntime(): unknown { return instance; },
    deps: {
      getInstanceRuntime(instanceId: string): unknown {
        assert.equal(instanceId, 'instance:building');
        return instance;
      },
    },
  });

  const building = instance.buildingById.get('building-1');
  assert.equal(building.activeBuilderPlayerId, null);
  assert.equal(building.buildCompleteTick, undefined);
  assert.equal(instance.worldRevision, 2);
  assert.equal(instance.persistentRevision, 2);
  assert.deepEqual(instance.dirtyDomains, [['building']]);
}

function testBuildingPermanentInvalidTickReleasesActiveBuilder(): void {
  const player = {
    playerId: 'player:builder-a',
    buildingJob: {
      buildingId: 'building-1',
      buildingName: '工坊',
      instanceId: 'instance:building',
      remainingTicks: 3,
      totalTicks: 3,
    },
  };
  const building = {
    id: 'building-1',
    state: 'active',
    activeBuilderPlayerId: 'player:builder-a',
    buildCompleteTick: 30,
    buildRemainingTicks: 3,
    revision: 1,
  };
  const instance = {
    tick: 20,
    worldRevision: 1,
    persistentRevision: 1,
    buildingById: new Map<string, any>([['building-1', building]]),
    dirtyDomains: [] as string[][],
    markPersistenceDirtyDomainsHighPriority(domains: string[]): void {
      this.dirtyDomains.push(domains);
    },
  };
  const playerDirtyDomains: string[][] = [];
  let bumped = 0;
  let refreshed = 0;
  const result = tickBuildingConstruction({
    playerRuntimeService: {
      getPlayer(playerId: string): unknown {
        return playerId === player.playerId ? player : null;
      },
      bumpPersistentRevision(): void {
        bumped += 1;
      },
      markPersistenceDirtyDomains(_player: unknown, domains: string[]): void {
        playerDirtyDomains.push(domains);
      },
    },
    getInstanceRuntime(instanceId: string): unknown {
      assert.equal(instanceId, 'instance:building');
      return instance;
    },
    refreshPlayerContextActions(playerId: string): void {
      assert.equal(playerId, player.playerId);
      refreshed += 1;
    },
  }, player.playerId) as { ok?: boolean; panelChanged?: boolean; messages?: Array<{ text?: string }> };

  assert.equal(result.ok, true);
  assert.equal(result.panelChanged, true);
  assert.equal(player.buildingJob, null);
  assert.equal(building.activeBuilderPlayerId, null);
  assert.equal(building.buildCompleteTick, undefined);
  assert.equal(instance.worldRevision, 2);
  assert.equal(instance.persistentRevision, 2);
  assert.deepEqual(instance.dirtyDomains, [['building']]);
  assert.equal(bumped, 1);
  assert.deepEqual(playerDirtyDomains, [['active_job']]);
  assert.equal(refreshed, 1);
}

function createGatherCompetitionPlayer(playerId: string, instanceId: string): any {
  return {
    playerId,
    instanceId,
    x: 1,
    y: 1,
    gatherSkill: { level: 1, exp: 0, expToNext: 60 },
    gatherJob: null,
    techniqueActivityQueue: [],
    persistentRevision: 1,
    dirtyDomains: new Set<string>(),
  };
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
