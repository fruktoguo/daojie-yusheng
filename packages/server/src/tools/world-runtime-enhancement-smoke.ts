import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import type { RuntimeTechniqueActivityKind } from '@mud/shared';
import { computeEnhancementAdjustedSuccessRate } from '@mud/shared';
import { isSupersededPlayerAssetFenceError } from '../persistence/player-domain-persistence.service';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { WorldRuntimeCraftTickService } from '../runtime/world/world-runtime-craft-tick.service';

type PersistedActiveJob = {
  jobRunId?: string;
  jobType?: string;
  phase?: string;
  workTotalTicks?: number;
  workRemainingTicks?: number;
  interruptWaitRemainingTicks?: number;
};

type DurableEnhancementCall = {
  kind: 'start' | 'update' | 'cancel' | 'complete';
  args: any;
};

type AssetMutationProbe = {
  busy: boolean;
  exclusiveCalls: number;
  idleChecks: number;
};

async function main(): Promise<void> {
  testEnhancementCancelUsesPipelineLifecycle();
  await testStartInterruptAndCompleteEnhancement();
  await testDurableEnhancementFlushesStaleActivityProjectionBeforeStart();
  await testDurableEnhancementPersistsAssetsAtomically();
  await testPresenceRevisionChangeKeepsNextFenceWrite();
  await testDurableEnhancementProgressFallsBackWhenAssetBusy();
  await testDurableEnhancementProgressRollbackAfterPipelineFailure();
  await testDurableEnhancementAdvanceCommitsProfessionAtomically();
  await testDurableEnhancementFailureRestoresFullRuntimeState();
  await testDurableEnhancementSessionFenceYieldsToNewOwner();
  await testDurableEnhancementCancelUsesCancelOperation();
  await testDurableEnhancementStopUsesStoppedCompletionKind();
  await testQueuedEnhancementDurableFailureRestoresQueueAndAssets();
  await testTickUsesJobSuccessRateForFailure();
  await testProtectionFailureConsumesProtectionAndContinues();
  await testProtectionMissingStopsAndReturnsCurrentLevel();
  await testSpiritStoneMissingStopsOnSuccessSettlement();
  await testMissingLockedItemClearsJobWithoutSnapshotFallback();
  await testCancelReturnsLockedTargetWhenInventoryFull();
  await testQueuedEnhancementDoesNotLockOrConsumeResources();
  await testDurableQueuedEnhancementDuringActiveJobDoesNotStartImmediately();
  await testEnhancementUsesTemplateNameWhenRuntimeItemNameMissing();
  await testHighLevelChainNoticeUsesBaseItemName();
  await testArtifactUsesExistingEnhancementLifecycle();

  console.log(JSON.stringify({
    ok: true,
    answers: [
      '强化启动后直接进入实际工作 job，workRemainingTicks/workTotalTicks 独立于打断等待。',
      '打断只改 interruptWaitRemainingTicks，不改实际工作进度。',
      'tick 结算按 job.successRate 判定成功或失败。',
      '保护物不足、灵石不足、锁定物丢失都有确定停止结果。',
      '成功后会回写强化等级、记录和灵石消耗；取消会释放锁定目标。',
      '强化取消不再暴露 strategy executeCancel，公共 cancelLifecycle 通过 computeRefund 复用权威 finishEnhancementJob。',
      '强化中断不再暴露 strategy executeInterrupt，公共 interrupt lifecycle 统一刷新独立等待条和 active job version。',
      '已有技艺活动时，强化入队不会提前锁装备或扣灵石。',
      '强化进行中继续追加强化任务只入队列，不重复提交 active job 强事务。',
      '强化运行态物品缺少 name 或仅有 itemId 时，通知和队列使用内容目录基础显示名，不把起始强化等级写入连续强化文案。',
      '法宝复用现有强化生命周期，成功后按实例写回背包并提升 enhanceLevel。',
      '强化强事务提交真实钱包投影，提交失败会恢复钱包、队列、任务、装备与 revision 派生态。',
      '旧 session 的强化资产 fence 冲突会让位并停止重复 tick；新 session fence 到位后会恢复推进。',
      '强化普通进度 tick 不新增 durable 操作；连续强化每阶只提交一条 advanced 强事务，并把强化技艺经验放入同一职业 patch。',
      '强化普通进度和暂停等待在资产队列空闲时同步推进；资产队列忙或进入结算点时自动回退玩家资产串行区。',
      '强化取消使用专用 cancel 强事务；队列自动启动失败时不会丢队首或遗留已扣材料。',
      'sessionId 为空但持有离线运行态 owner/epoch 时，强化资产边界仍可提交强事务。',
      '强化启动前会先强制收敛当前 active_job 投影，数据库遗留建造任务不会再触发启动 CAS 冲突。',
    ],
  }, null, 2));
}

function testEnhancementCancelUsesPipelineLifecycle(): void {
  const player = createPlayer('player:enhancement:lifecycle-cancel', []);
  const { craftService } = createCraftHarness(player, [], []);
  craftService.ensurePipelineInitialized();
  const pipeline = (craftService as unknown as { pipeline?: { getStrategy?: (kind: RuntimeTechniqueActivityKind) => unknown } }).pipeline;
  const enhancementStrategy = pipeline?.getStrategy?.('enhancement') as { executeCancel?: unknown; executeInterrupt?: unknown; computeRefund?: unknown } | undefined;

  assert.equal(typeof enhancementStrategy?.executeCancel, 'undefined');
  assert.equal(typeof enhancementStrategy?.executeInterrupt, 'undefined');
  assert.equal(typeof enhancementStrategy?.computeRefund, 'function');
}

async function testStartInterruptAndCompleteEnhancement(): Promise<void> {
  const persistedActiveJobs: PersistedActiveJob[] = [];
  const persistedEnhancementRecords: unknown[] = [];
  const player = createPlayer('player:enhancement:success', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, persistedActiveJobs, persistedEnhancementRecords);
  const target = player.inventory.items[0];
  if (!target?.itemInstanceId) {
    throw new Error('missing enhancement target instance id');
  }

  const start = craftService.startEnhancement(player, {
    target: {
      source: 'inventory',
      itemInstanceId: target.itemInstanceId,
      expectedItemInstanceId: target.itemInstanceId,
    },
  });
  assert.equal(start.ok, true);
  assert.equal(start.messages?.[0]?.key, 'notice.craft.enhancement.start');
  assert.equal(start.messages?.[0]?.kind, 'enhancement');
  assert.equal(start.messages?.[0]?.vars?.itemName, '铁剑');
  assert.equal(player.enhancementJob?.phase, 'enhancing');
  assert.equal(player.enhancementJob?.remainingTicks, player.enhancementJob?.workRemainingTicks);
  assert.equal(player.enhancementJob?.totalTicks, player.enhancementJob?.workTotalTicks);
  assert.equal(player.enhancementJob?.interruptWaitRemainingTicks, 0);
  assert.equal(player.inventory.lockedItems?.length, 1);
  assert.equal(
    player.enhancementJob?.successRate,
    computeEnhancementAdjustedSuccessRate(
      player.enhancementJob!.targetLevel,
      player.enhancementJob!.roleEnhancementLevel,
      player.enhancementJob!.targetItemLevel,
      undefined,
    ),
  );
  await settleAsync();
  assert.equal(persistedActiveJobs.at(-1)?.jobType, 'enhancement');
  assert.equal(persistedActiveJobs.at(-1)?.phase, 'enhancing');

  const interrupt = craftService.interruptEnhancement(player, 'attack');
  assert.equal(interrupt.ok, true);
  assert.equal(interrupt.messages?.[0]?.key, 'notice.craft.activity-interrupted-wait-generic');
  assert.equal(player.enhancementJob?.phase, 'paused');
  assert.equal(player.enhancementJob?.workRemainingTicks, player.enhancementJob?.remainingTicks);
  assert.equal(player.enhancementJob?.interruptWaitRemainingTicks, 10);

  const pausedTick = craftService.tickEnhancement(player);
  assert.equal(pausedTick.ok, true);
  assert.equal(player.enhancementJob?.workRemainingTicks, player.enhancementJob?.remainingTicks);
  assert.equal(player.enhancementJob?.interruptWaitRemainingTicks, 9);

  for (let index = 0; index < 9; index += 1) {
    craftService.tickEnhancement(player);
  }
  assert.equal(player.enhancementJob?.phase, 'enhancing');
  assert.equal(player.enhancementJob?.interruptWaitRemainingTicks, 0);

  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const completed = craftService.tickEnhancement(player);
    assert.equal(completed.ok, true);
    assert.equal(completed.messages?.[0]?.key, 'notice.craft.enhancement.success');
    assert.equal(completed.messages?.[0]?.kind, 'enhancement');
    assert.equal(completed.messages?.[0]?.vars?.itemName, '铁剑');
    assert.equal(completed.messages?.[0]?.vars?.level, 2);
  } finally {
    Math.random = originalRandom;
  }

  await settleAsync();
  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(player.inventory.items.some((item) => item.itemId === 'iron_sword' && item.enhanceLevel === 2), true);
  assert.equal(player.wallet.balances[0].balance, 19);
  assert.equal(player.enhancementRecords[0]?.status, 'completed');
  assert.equal(player.enhancementRecords[0]?.itemName, '铁剑');
  assert.equal(persistedEnhancementRecords.length > 0, true);
}

async function testDurableEnhancementPersistsAssetsAtomically(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  const presenceSaves: unknown[] = [];
  const assetMutationProbe: AssetMutationProbe = { busy: false, exclusiveCalls: 0, idleChecks: 0 };
  const perfCounts = new Map<string, number>();
  const player = createPlayer('player:enhancement:durable', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], [], {
    durableCalls,
    presenceSaves,
    assetMutationProbe,
  });
  const target = player.inventory.items[0];
  if (!target?.itemInstanceId) {
    throw new Error('missing enhancement target instance id');
  }

  const start = await craftService.startEnhancementDurably(player, {
    target: buildInventoryRef(target),
  });
  assert.equal(start.ok, true);
  assert.equal(presenceSaves.length, 1);
  assert.equal(durableCalls.length, 1);
  assert.equal(presenceSaves.length, 1, '强化普通进度 tick 不应写 presence');
  assert.equal(durableCalls[0]?.kind, 'start');
  assert.equal(durableCalls[0]?.args.nextActiveJob?.jobType, 'enhancement');
  assert.equal(durableCalls[0]?.args.nextEnhancementRecords?.[0]?.itemName, '铁剑');
  assert.equal(
    durableCalls[0]?.args.nextInventoryItems.some(
      (item: any) => item.itemInstanceId === target.itemInstanceId && item.lockedBy === `enhancement:${player.enhancementJob?.jobRunId}`,
    ),
    true,
  );
  assert.deepEqual(durableCalls[0]?.args.nextWalletBalances, [
    { walletType: 'spirit_stone', balance: 20, frozenBalance: 0, version: 1 },
  ]);
  assert.equal(assetMutationProbe.exclusiveCalls, 1);

  player.enhancementJob!.remainingTicks = 2;
  player.enhancementJob!.workRemainingTicks = 2;
  const tick = craftService.tickEnhancementDurably(player);
  assert.equal(isPromiseLike(tick), false, '强化普通进度息不应创建 Promise 或进入资产锁');
  assert.equal(tick.ok, true);
  assert.equal(durableCalls.length, 1);
  assert.equal(player.dirtyDomains.has('active_job'), true);
  assert.equal(assetMutationProbe.idleChecks, 1);
  assert.equal(assetMutationProbe.exclusiveCalls, 1);

  player.enhancementJob!.phase = 'paused';
  player.enhancementJob!.pausedTicks = 1;
  player.enhancementJob!.interruptWaitRemainingTicks = 1;
  const resumed = craftService.tickEnhancementDurably(player);
  assert.equal(isPromiseLike(resumed), false, '强化暂停等待息也应保持同步轻量推进');
  assert.equal(resumed.ok, true);
  assert.equal(player.enhancementJob?.phase, 'enhancing');
  assert.equal(player.enhancementJob?.remainingTicks, 1);
  assert.equal(assetMutationProbe.idleChecks, 2);
  assert.equal(assetMutationProbe.exclusiveCalls, 1);

  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const pendingCompletion = craftService.tickEnhancementDurably(
      player,
      null,
      (key: string, durationMs: number, count = 1) => {
        assert.equal(Number.isFinite(durationMs) && durationMs >= 0, true);
        perfCounts.set(key, (perfCounts.get(key) ?? 0) + count);
      },
    );
    assert.equal(isPromiseLike(pendingCompletion), true, '强化结算点必须回到异步资产强事务');
    const completed = await pendingCompletion;
    assert.equal(completed.ok, true);
  } finally {
    Math.random = originalRandom;
  }

  const completeCall = durableCalls.at(-1);
  assert.equal(presenceSaves.length, 1, '同一 presence 修订不应重复写入 presence fence');
  assert.equal(completeCall?.kind, 'complete');
  assert.equal(completeCall?.args.completionKind, 'completed');
  assert.equal(completeCall?.args.nextActiveJob, null);
  assert.equal(completeCall?.args.nextEnhancementRecords?.[0]?.itemName, '铁剑');
  assert.equal(
    completeCall?.args.nextInventoryItems.some(
      (item: any) => item.itemInstanceId === target.itemInstanceId && item.lockedBy == null && item.enhanceLevel === 2,
    ),
    true,
  );
  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(completeCall?.args.nextWalletBalances?.[0]?.balance, 19);
  assert.equal(player.inventory.items.find((item: any) => item.itemId === 'spirit_stone')?.count, 19);
  assert.equal(assetMutationProbe.exclusiveCalls, 2);
  for (const key of [
    'instance.craftJob.enhancementAsyncSettlement',
    'instance.craftJob.enhancementAssetQueueWaitMs',
    'instance.craftJob.enhancementRuntimeResolveMs',
    'instance.craftJob.enhancementPresenceFenceMs',
    'instance.craftJob.enhancementPresenceDescribeMs',
    'instance.craftJob.enhancementPresenceClean',
    'instance.craftJob.enhancementPayloadBuildMs',
    'instance.craftJob.enhancementDurableCommitMs',
    'instance.craftJob.enhancementMarkPersistedMs',
    'instance.craftJob.enhancementCoordinatorFinalizeMs',
  ]) {
    assert.equal(perfCounts.get(key), 1, `缺少强化异步分段统计：${key}`);
  }
  assert.equal(perfCounts.get('instance.craftJob.enhancementPresenceSkip'), 1);
  assert.equal(perfCounts.has('instance.craftJob.enhancementPresencePersistMs'), false);
  assert.equal(perfCounts.has('instance.craftJob.enhancementPresenceClaimMs'), false);
  assert.equal(perfCounts.has('instance.craftJob.enhancementPresenceDirty'), false);
}

async function testPresenceRevisionChangeKeepsNextFenceWrite(): Promise<void> {
  const presenceSaves: unknown[] = [];
  const player = createPlayer('player:enhancement:presence-revision', []);
  const { craftService } = createCraftHarness(player, [], [], {
    presenceSaves,
    presenceSaveHook(saveIndex: number): void {
      if (saveIndex !== 1) {
        return;
      }
      player.dirtyDomains.add('presence');
      player.persistenceDomainRevisionByDomain.set('presence', 2);
    },
  });

  await craftService.resolveDurablePresenceFence(player.playerId);
  assert.equal(player.dirtyDomains.has('presence'), true, 'presence 写入期间的新心跳修订必须保留');
  await craftService.resolveDurablePresenceFence(player.playerId);
  assert.equal(presenceSaves.length, 2, '新心跳修订必须触发下一次 presence 写入');
  assert.equal(player.dirtyDomains.has('presence'), false);
  await craftService.resolveDurablePresenceFence(player.playerId);
  assert.equal(presenceSaves.length, 2, '相同且已落库的 presence 修订才允许跳过');
}

async function testDurableEnhancementProgressFallsBackWhenAssetBusy(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  const assetMutationProbe: AssetMutationProbe = { busy: false, exclusiveCalls: 0, idleChecks: 0 };
  const perfCounts = new Map<string, number>();
  const player = createPlayer('player:enhancement:asset-busy', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], [], { durableCalls, assetMutationProbe });
  await craftService.startEnhancementDurably(player, {
    target: buildInventoryRef(player.inventory.items[0]),
  });
  player.enhancementJob!.remainingTicks = 2;
  player.enhancementJob!.workRemainingTicks = 2;
  assetMutationProbe.busy = true;

  const pendingTick = craftService.tickEnhancementDurably(
    player,
    null,
    (key: string, durationMs: number, count = 1) => {
      assert.equal(Number.isFinite(durationMs) && durationMs >= 0, true);
      perfCounts.set(key, (perfCounts.get(key) ?? 0) + count);
    },
  );
  assert.equal(isPromiseLike(pendingTick), true, '资产队列忙时普通进度也必须回退资产串行区');
  const tick = await pendingTick;

  assert.equal(tick.ok, true);
  assert.equal(player.enhancementJob?.remainingTicks, 1);
  assert.equal(assetMutationProbe.idleChecks, 1);
  assert.equal(assetMutationProbe.exclusiveCalls, 2);
  assert.deepEqual(durableCalls.map((call) => call.kind), ['start']);
  assert.equal(perfCounts.get('instance.craftJob.enhancementAsyncQueueBusy'), 1);
  assert.equal(perfCounts.get('instance.craftJob.enhancementAssetQueueWaitMs'), 1);
  assert.equal(perfCounts.get('instance.craftJob.enhancementRuntimeResolveMs'), 1);
  assert.equal(perfCounts.get('instance.craftJob.enhancementCoordinatorFinalizeMs'), 1);
  assert.equal(perfCounts.has('instance.craftJob.enhancementPresenceFenceMs'), false);
}

async function testDurableEnhancementProgressRollbackAfterPipelineFailure(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  const assetMutationProbe: AssetMutationProbe = { busy: false, exclusiveCalls: 0, idleChecks: 0 };
  const player = createPlayer('player:enhancement:progress-rollback', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], [], { durableCalls, assetMutationProbe });
  await craftService.startEnhancementDurably(player, {
    target: buildInventoryRef(player.inventory.items[0]),
  });
  player.enhancementJob!.remainingTicks = 2;
  player.enhancementJob!.workRemainingTicks = 2;
  const beforeJob = structuredClone(player.enhancementJob);
  const beforeEnhancementSkill = player.enhancementSkill;
  const beforePersistentRevision = player.persistentRevision;
  const beforeSelfRevision = player.selfRevision;
  const beforeDirtyDomains = Array.from(player.dirtyDomains).sort();

  (craftService as unknown as { finalizeMutation: () => never }).finalizeMutation = () => {
    throw new Error('synthetic_enhancement_progress_failure');
  };

  assert.throws(
    () => craftService.tickEnhancementDurably(player),
    /synthetic_enhancement_progress_failure/,
  );
  assert.deepEqual(player.enhancementJob, beforeJob, 'pipeline 在递减后失败时必须恢复原始强化进度');
  assert.equal(player.enhancementSkill, beforeEnhancementSkill, 'ensureCraftSkills 替换的技能引用必须回滚');
  assert.equal(player.persistentRevision, beforePersistentRevision);
  assert.equal(player.selfRevision, beforeSelfRevision);
  assert.deepEqual(Array.from(player.dirtyDomains).sort(), beforeDirtyDomains);
  assert.equal(player.suppressImmediateDomainPersistence, undefined);
  assert.equal(assetMutationProbe.idleChecks, 1);
  assert.equal(assetMutationProbe.exclusiveCalls, 1, '轻量路径异常不得额外进入资产强事务');
  assert.deepEqual(durableCalls.map((call) => call.kind), ['start']);
}

async function testDurableEnhancementFlushesStaleActivityProjectionBeforeStart(): Promise<void> {
  const player = createPlayer('player:enhancement:stale-building-projection', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], []);
  const target = player.inventory.items[0];
  const events: string[] = [];
  let persistedActiveJob: PersistedActiveJob | null = {
    jobRunId: 'job:legacy:building',
    jobType: 'building',
    phase: 'building',
  };

  (craftService as unknown as { playerPersistenceFlushService: unknown }).playerPersistenceFlushService = {
    async flushPlayerDomains(
      playerId: string,
      domains: Iterable<string>,
      options?: { forceCurrentSnapshot?: boolean },
    ): Promise<boolean> {
      events.push('flush-active-job');
      assert.equal(playerId, player.playerId);
      assert.deepEqual(Array.from(domains), ['active_job']);
      assert.equal(options?.forceCurrentSnapshot, true);
      assert.equal(player.dirtyDomains.has('active_job'), true, '强化前应强制重建当前运行态任务投影');
      assert.equal(player.buildingJob, undefined);
      persistedActiveJob = null;
      // 模拟即时快照提交后又产生了更高版本任务 dirty；不能把本次成功提交误判为失败。
      return true;
    },
  };
  (craftService as unknown as { durableOperationService: unknown }).durableOperationService = {
    isEnabled(): boolean {
      return true;
    },
    async startActiveJobWithAssets(args: { nextActiveJob: PersistedActiveJob }): Promise<void> {
      events.push('durable-start');
      if (persistedActiveJob) {
        throw new Error('player_active_job_cas_conflict');
      }
      persistedActiveJob = args.nextActiveJob;
    },
  };

  const result = await craftService.startEnhancementDurably(player, {
    target: buildInventoryRef(target),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(events, ['flush-active-job', 'durable-start']);
  assert.equal(persistedActiveJob?.jobType, 'enhancement');
  assert.equal(player.enhancementJob?.jobType, 'enhancement');
}

async function testDurableEnhancementAdvanceCommitsProfessionAtomically(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  const player = createPlayer('player:enhancement:durable-advance', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const spiritStone = player.inventory.items.pop();
  for (let index = 0; index < 120; index += 1) {
    player.inventory.items.push({
      itemId: `material.test.${index}`,
      itemInstanceId: randomUUID(),
      count: index + 1,
    });
  }
  player.inventory.items.push(spiritStone);
  player.inventory.capacity = 160;
  player.equipment.slots = [{
    slot: 'technique_enhancement',
    item: {
      itemId: 'equip.copper_enhancement_hammer',
      itemInstanceId: randomUUID(),
      count: 1,
      tags: ['enhancement_hammer'],
    },
  }];
  const { craftService } = createCraftHarness(player, [], [], { durableCalls });
  const target = player.inventory.items[0];
  const started = await craftService.startEnhancementDurably(player, {
    target: buildInventoryRef(target),
    targetLevel: 3,
  });
  assert.equal(started.ok, true);

  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;
  const beforeExp = player.enhancementSkill.exp;
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const advanced = await craftService.tickEnhancementDurably(player);
    assert.equal(advanced.ok, true);
  } finally {
    Math.random = originalRandom;
  }

  assert.deepEqual(durableCalls.map((call) => call.kind), ['start', 'complete']);
  const advanceCall = durableCalls[1]?.args;
  assert.equal(advanceCall?.completionKind, 'advanced');
  assert.equal(advanceCall?.assetWriteMode, 'patch');
  assert.equal(advanceCall?.nextInventoryItems?.length, 2, '大背包连续强化只应提交目标装备与灵石变化行');
  assert.deepEqual(advanceCall?.removedInventoryItemInstanceIds, []);
  assert.equal(advanceCall?.nextWalletBalances?.length, 1);
  assert.equal(advanceCall?.nextEquipmentSlots, null);
  assert.equal(advanceCall?.nextEnhancementRecords?.length, 1);
  assert.equal(advanceCall?.nextProfessionStates?.length, 1);
  assert.equal(advanceCall?.nextActiveJob?.jobRunId, player.enhancementJob?.jobRunId);
  assert.equal(player.enhancementJob?.targetLevel, 3);
  assert.equal(player.enhancementSkill.exp > beforeExp, true);
  const enhancementProfession = advanceCall?.nextProfessionStates?.find(
    (entry: { professionType?: string }) => entry.professionType === 'enhancement',
  );
  assert.deepEqual(enhancementProfession, {
    professionType: 'enhancement',
    level: player.enhancementSkill.level,
    exp: player.enhancementSkill.exp,
    expToNext: player.enhancementSkill.expToNext,
  });
  assert.equal(player.dirtyDomains.has('profession'), false);
}

async function testDurableEnhancementFailureRestoresFullRuntimeState(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  const player = createPlayer('player:enhancement:durable-rollback', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], [], {
    durableCalls,
    failDurableKinds: new Set(['complete']),
  });
  const target = player.inventory.items[0];
  await craftService.startEnhancementDurably(player, { target: buildInventoryRef(target) });
  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;
  const before = snapshotEnhancementRuntime(player);
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    await assert.rejects(
      () => craftService.tickEnhancementDurably(player),
      /durable_complete_failed/,
    );
  } finally {
    Math.random = originalRandom;
  }
  assert.deepEqual(snapshotEnhancementRuntime(player), before);
  assert.equal(player.dirtyDomains.has('inventory'), true);
  assert.equal(player.dirtyDomains.has('wallet'), true);
  assert.equal(durableCalls.at(-1)?.args.nextWalletBalances?.[0]?.balance, 19);
}

async function testDurableEnhancementSessionFenceYieldsToNewOwner(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  let staleFence = true;
  const player = createPlayer('player:enhancement:session-fence', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const staleFenceError = 'player_session_fencing_conflict:'
    + 'expectedRuntimeOwnerId=runtime:player:enhancement:session-fence:offline:'
    + 'expectedSessionEpoch=1:'
    + 'persistedRuntimeOwnerId=runtime:new-session:'
    + 'persistedSessionEpoch=2';
  assert.equal(isSupersededPlayerAssetFenceError(new Error(staleFenceError)), true);
  assert.equal(
    isSupersededPlayerAssetFenceError(new Error(staleFenceError.replace('persistedSessionEpoch=2', 'persistedSessionEpoch=1'))),
    false,
  );
  const { craftService } = createCraftHarness(player, [], [], {
    durableCalls,
    durableErrorFactory: (kind) => kind === 'complete' && staleFence ? new Error(staleFenceError) : null,
  });
  const target = player.inventory.items[0];
  await craftService.startEnhancementDurably(player, { target: buildInventoryRef(target) });
  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;

  const flushes: unknown[] = [];
  const notices: unknown[] = [];
  const tickService = new WorldRuntimeCraftTickService(
    createPlayerRuntimeService(player),
    craftService,
    {
      flushCraftMutation(...args: unknown[]): void {
        flushes.push(args);
      },
    },
  );
  const deps = {
    queuePlayerNotice(...args: unknown[]): void {
      notices.push(args);
    },
  };
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    await tickService.advanceCraftJobs([player.playerId], deps);
    assert.equal(durableCalls.filter((call) => call.kind === 'complete').length, 1);
    assert.equal(flushes.length, 0, '旧 session 让位时不能继续 flush 半完成运行态');
    assert.equal(notices.length, 0, 'stale fence 让位不应进入通用错误通知');
    assert.equal(craftService.isPlayerSessionFenceSuperseded(player), true);
    assert.deepEqual(tickService.listTickablePlayerIds([player.playerId]), []);

    await tickService.advanceCraftJobs([player.playerId], deps);
    assert.equal(durableCalls.filter((call) => call.kind === 'complete').length, 1, '旧 fence 后续 tick 不得重复提交');

    staleFence = false;
    player.runtimeOwnerId = 'runtime:new-session';
    player.sessionEpoch = 2;
    assert.equal(craftService.isPlayerSessionFenceSuperseded(player), false);
    assert.deepEqual(tickService.listTickablePlayerIds([player.playerId]), [player.playerId]);

    await tickService.advanceCraftJobs([player.playerId], deps);
    assert.equal(durableCalls.filter((call) => call.kind === 'complete').length, 2, '新 fence 应恢复一次完成提交');
    assert.equal(player.enhancementJob, null);
    assert.equal(notices.length, 0);
    assert.equal(flushes.length, 1);
  } finally {
    Math.random = originalRandom;
  }
}

async function testDurableEnhancementCancelUsesCancelOperation(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  const player = createPlayer('player:enhancement:durable-cancel', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], [], { durableCalls });
  const target = player.inventory.items[0];
  await craftService.startEnhancementDurably(player, { target: buildInventoryRef(target) });
  const cancelled = await craftService.cancelEnhancementDurably(player);
  assert.equal(cancelled.ok, true);
  assert.equal(durableCalls.at(-1)?.kind, 'cancel');
  assert.equal(durableCalls.some((call) => call.kind === 'complete'), false);
  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems.length, 0);
  assert.equal(player.inventory.items.some((item: any) => item.itemInstanceId === target.itemInstanceId), true);
}

async function testDurableEnhancementStopUsesStoppedCompletionKind(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  const player = createPlayer('player:enhancement:durable-stop', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], [], { durableCalls });
  const target = player.inventory.items[0];
  await craftService.startEnhancementDurably(player, { target: buildInventoryRef(target) });
  player.inventory.items = player.inventory.items.filter((item: { itemId?: string }) => item.itemId !== 'spirit_stone');
  player.wallet.balances[0].balance = 0;
  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const stopped = await craftService.tickEnhancementDurably(player);
    assert.equal(stopped.ok, true);
    assert.equal(stopped.messages?.[0]?.key, 'notice.craft.enhancement.wallet-insufficient');
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(durableCalls.at(-1)?.kind, 'complete');
  assert.equal(durableCalls.at(-1)?.args.completionKind, 'stopped');
}

async function testQueuedEnhancementDurableFailureRestoresQueueAndAssets(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  const player = createPlayer('player:enhancement:durable-queue-rollback', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const target = player.inventory.items[0];
  const queueId = 'queue:enhancement:durable-rollback';
  const payload = { target: buildInventoryRef(target) };
  player.techniqueActivityQueue.push({
    queueId,
    kind: 'enhancement',
    payload,
    label: '铁剑',
    state: 'pending',
    createdAt: 1,
  });
  const before = snapshotEnhancementRuntime(player);
  const { craftService } = createCraftHarness(player, [], [], {
    durableCalls,
    failDurableKinds: new Set(['start']),
  });
  await assert.rejects(
    () => craftService.startQueuedEnhancementDurably(player, () => {
      player.techniqueActivityQueue.shift();
      return craftService.startTechniqueActivity(player, 'enhancement', payload);
    }),
    /durable_start_failed/,
  );
  assert.deepEqual(snapshotEnhancementRuntime(player), before);
  assert.equal(durableCalls.at(-1)?.args.expectedQueueHeadId, queueId);
  assert.deepEqual(durableCalls.at(-1)?.args.nextTechniqueActivityQueue, []);
}

async function testTickUsesJobSuccessRateForFailure(): Promise<void> {
  const player = createPlayer('player:enhancement:failure', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], []);
  const target = player.inventory.items[0];
  if (!target?.itemInstanceId) {
    throw new Error('missing enhancement target instance id');
  }

  const start = craftService.startEnhancement(player, {
    target: {
      source: 'inventory',
      itemInstanceId: target.itemInstanceId,
      expectedItemInstanceId: target.itemInstanceId,
    },
  });
  assert.equal(start.ok, true);
  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;
  const failureRoll = Math.min(0.999, player.enhancementJob!.successRate + 0.001);
  assert.equal(failureRoll > player.enhancementJob!.successRate, true);

  const originalRandom = Math.random;
  Math.random = () => failureRoll;
  try {
    const failed = craftService.tickEnhancement(player);
    assert.equal(failed.ok, true);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(player.enhancementJob?.currentLevel, 0);
  assert.equal(player.enhancementJob?.targetLevel, 1);
  assert.equal(player.inventory.lockedItems?.some((item: { itemId?: string; enhanceLevel?: number }) => item.itemId === 'iron_sword' && item.enhanceLevel === 0), true);
  assert.equal(player.enhancementRecords[0]?.levels?.some((entry: { targetLevel?: number; failureCount?: number }) => (
    entry.targetLevel === 2 && entry.failureCount === 1
  )), true);
}

async function testProtectionFailureConsumesProtectionAndContinues(): Promise<void> {
  const player = createPlayer('player:enhancement:protected-failure', [
    createEquipmentItem('iron_sword', '铁剑', 8, 2),
    createEquipmentItem('iron_sword', '铁剑', 8, 0),
  ]);
  const { craftService } = createCraftHarness(player, [], []);
  const target = player.inventory.items[0];
  const protection = player.inventory.items[1];
  const start = craftService.startEnhancement(player, {
    target: buildInventoryRef(target),
    protection: buildInventoryRef(protection),
    targetLevel: 4,
    protectionStartLevel: 3,
  });
  assert.equal(start.ok, true);
  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === protection.itemInstanceId), true);

  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;
  const originalRandom = Math.random;
  Math.random = () => 0.999;
  try {
    const failed = craftService.tickEnhancement(player);
    assert.equal(failed.ok, true);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(player.inventory.items.some((item) => item.itemInstanceId === protection.itemInstanceId), false);
  assert.equal(player.enhancementJob?.currentLevel, 1);
  assert.equal(player.enhancementJob?.targetLevel, 2);
  assert.equal(player.inventory.lockedItems?.some((item: { itemId?: string; enhanceLevel?: number }) => item.itemId === 'iron_sword' && item.enhanceLevel === 1), true);
  assert.equal(player.enhancementRecords[0]?.levels?.some((entry: { targetLevel?: number; failureCount?: number }) => (
    entry.targetLevel === 3 && entry.failureCount === 1
  )), true);
}

async function testProtectionMissingStopsAndReturnsCurrentLevel(): Promise<void> {
  const player = createPlayer('player:enhancement:missing-protection', [
    createEquipmentItem('iron_sword', '铁剑', 8, 2),
    createEquipmentItem('iron_sword', '铁剑', 8, 0),
  ]);
  const { craftService } = createCraftHarness(player, [], []);
  const target = player.inventory.items[0];
  const protection = player.inventory.items[1];
  const start = craftService.startEnhancement(player, {
    target: buildInventoryRef(target),
    protection: buildInventoryRef(protection),
    targetLevel: 3,
    protectionStartLevel: 3,
  });
  assert.equal(start.ok, true);
  player.inventory.items = player.inventory.items.filter((item) => item.itemInstanceId !== protection.itemInstanceId);
  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;

  const originalRandom = Math.random;
  Math.random = () => 0.999;
  try {
    const stopped = craftService.tickEnhancement(player);
    assert.equal(stopped.ok, true);
    assert.equal(stopped.messages?.[0]?.key, 'notice.craft.enhancement.protection-missing');
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(player.inventory.items.some((item) => item.itemId === 'iron_sword' && item.enhanceLevel === 2), true);
  assert.equal(player.enhancementRecords[0]?.status, 'stopped');
}

async function testSpiritStoneMissingStopsOnSuccessSettlement(): Promise<void> {
  const player = createPlayer('player:enhancement:missing-spirit-stone', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], []);
  const target = player.inventory.items[0];
  const start = craftService.startEnhancement(player, { target: buildInventoryRef(target), targetLevel: 2 });
  assert.equal(start.ok, true);
  player.inventory.items = player.inventory.items.filter((item: { itemId?: string }) => item.itemId !== 'spirit_stone');
  player.wallet.balances[0].balance = 0;
  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const stopped = craftService.tickEnhancement(player);
    assert.equal(stopped.ok, true);
    assert.equal(stopped.messages?.[0]?.key, 'notice.craft.enhancement.wallet-insufficient');
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(player.inventory.items.some((item) => item.itemId === 'iron_sword' && item.enhanceLevel === 1), true);
  assert.equal(player.enhancementRecords[0]?.status, 'stopped');
}

async function testMissingLockedItemClearsJobWithoutSnapshotFallback(): Promise<void> {
  const player = createPlayer('player:enhancement:missing-locked-item', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, [], []);
  const target = player.inventory.items[0];
  const start = craftService.startEnhancement(player, { target: buildInventoryRef(target), targetLevel: 2 });
  assert.equal(start.ok, true);
  player.inventory.lockedItems = [];
  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const stopped = craftService.tickEnhancement(player);
    assert.equal(stopped.ok, true);
    assert.equal(stopped.messages?.[0]?.key, 'notice.craft.enhancement.target-missing');
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(player.inventory.items.some((item) => item.itemId === 'iron_sword'), false);
  assert.equal(player.wallet.balances[0].balance, 20);
  assert.equal(player.enhancementRecords[0]?.status, 'stopped');
}

async function testCancelReturnsLockedTargetWhenInventoryFull(): Promise<void> {
  const persistedActiveJobs: PersistedActiveJob[] = [];
  const persistedEnhancementRecords: unknown[] = [];
  const player = createPlayer('player:enhancement:cancel', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  const { craftService } = createCraftHarness(player, persistedActiveJobs, persistedEnhancementRecords);
  const target = player.inventory.items[0];
  if (!target?.itemInstanceId) {
    throw new Error('missing enhancement target instance id');
  }

  const start = craftService.startEnhancement(player, {
    target: {
      source: 'inventory',
      itemInstanceId: target.itemInstanceId,
      expectedItemInstanceId: target.itemInstanceId,
    },
  });
  assert.equal(start.ok, true);
  assert.equal(player.enhancementJob?.phase, 'enhancing');
  player.inventory.capacity = player.inventory.items.length;

  const cancelled = craftService.cancelTechniqueActivity(player, 'enhancement');
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.messages?.[0]?.key, 'notice.craft.enhancement.cancelled');
  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(player.inventory.items.length > player.inventory.capacity, true);
  assert.equal(player.inventory.items.some((item) => item.itemId === 'iron_sword' && item.enhanceLevel === 1), true);
  assert.deepEqual((cancelled as { groundDrops?: unknown[] }).groundDrops, []);
  assert.equal(player.enhancementRecords[0]?.status, 'cancelled');
  await settleAsync();
  assert.deepEqual(persistedActiveJobs.at(-1), {});
  assert.equal(persistedEnhancementRecords.length > 0, true);
}

async function testQueuedEnhancementDoesNotLockOrConsumeResources(): Promise<void> {
  const player = createPlayer('player:enhancement:queue-no-preconsume', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
  ]);
  player.alchemyJob = {
    jobRunId: 'job:alchemy:blocking',
    jobType: 'alchemy',
    phase: 'brewing',
    remainingTicks: 3,
    totalTicks: 3,
  };
  const { craftService } = createCraftHarness(player, [], []);
  const target = player.inventory.items[0];
  const targetInstanceId = target.itemInstanceId;
  const balanceBefore = Number(player.wallet.balances[0].balance);

  const queued = craftService.startEnhancement(player, {
    target: buildInventoryRef(target),
    queueMode: 'append',
  });

  assert.equal(queued.ok, true);
  assert.equal(player.techniqueActivityQueue.length, 1);
  assert.equal(player.techniqueActivityQueue[0]?.kind, 'enhancement');
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(player.inventory.items.some((item: { itemInstanceId?: string }) => item.itemInstanceId === targetInstanceId), true);
  assert.equal(Number(player.wallet.balances[0].balance), balanceBefore);
}

async function testDurableQueuedEnhancementDuringActiveJobDoesNotStartImmediately(): Promise<void> {
  const durableCalls: DurableEnhancementCall[] = [];
  const persistedActiveJobs: PersistedActiveJob[] = [];
  const player = createPlayer('player:enhancement:durable-queue-active', [
    createEquipmentItem('iron_sword', '铁剑', 8, 1),
    createEquipmentItem('iron_sword', '铁剑', 8, 0),
  ]);
  const { craftService } = createCraftHarness(player, persistedActiveJobs, [], { durableCalls });
  const firstTarget = player.inventory.items[0];
  const secondTarget = player.inventory.items[1];
  const secondTargetInstanceId = secondTarget.itemInstanceId;

  const start = await craftService.startEnhancementDurably(player, {
    target: buildInventoryRef(firstTarget),
  });
  assert.equal(start.ok, true);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.kind, 'start');
  const lockedCountAfterStart = player.inventory.lockedItems?.length ?? 0;

  const queued = await craftService.startEnhancementDurably(player, {
    target: buildInventoryRef(secondTarget),
    queueMode: 'append',
  });

  assert.equal(queued.ok, true);
  assert.equal((queued as { queued?: boolean }).queued, true);
  assert.equal(player.techniqueActivityQueue.length, 1);
  assert.equal(player.techniqueActivityQueue[0]?.kind, 'enhancement');
  assert.equal(player.inventory.lockedItems?.length ?? 0, lockedCountAfterStart);
  assert.equal(player.inventory.items.some((item: { itemInstanceId?: string }) => item.itemInstanceId === secondTargetInstanceId), true);
  assert.deepEqual(durableCalls.map((call) => call.kind), ['start']);
  assert.equal(persistedActiveJobs.length, 0);
  assert.equal(player.dirtyDomains.has('active_job'), true);
}

async function testEnhancementUsesTemplateNameWhenRuntimeItemNameMissing(): Promise<void> {
  const unnamedTarget = createEquipmentItem('iron_sword', 'iron_sword', 8, 1);
  delete unnamedTarget.name;
  const player = createPlayer('player:enhancement:template-name', [
    unnamedTarget,
  ]);
  const { craftService } = createCraftHarness(player, [], []);
  const target = player.inventory.items[0];
  const start = craftService.startEnhancement(player, {
    target: buildInventoryRef(target),
  });

  assert.equal(start.ok, true);
  assert.equal(player.enhancementJob?.targetItemName, '铁剑');
  assert.equal(player.enhancementRecords[0]?.itemName, '铁剑');
  assert.equal(start.messages?.[0]?.vars?.itemName, '铁剑');

  const queuedTarget = createEquipmentItem('iron_sword', 'iron_sword', 8, 0);
  player.inventory.items.push({
    ...queuedTarget,
    itemInstanceId: randomUUID(),
  });
  const queued = craftService.startEnhancement(player, {
    target: buildInventoryRef(player.inventory.items.at(-1)),
  });
  assert.equal(queued.ok, true);
  assert.equal(player.techniqueActivityQueue[0]?.label, '铁剑');
}

async function testHighLevelChainNoticeUsesBaseItemName(): Promise<void> {
  const player = createPlayer('player:enhancement:high-level-chain', [
    createEquipmentItem('equip.foundation_mixed_dual_sword', 'equip.foundation_mixed_dual_sword', 40, 20),
  ]);
  const { craftService } = createCraftHarness(player, [], []);
  craftService.enhancementConfigs.set('equip.foundation_mixed_dual_sword', { steps: [] });
  const target = player.inventory.items[0];
  const start = craftService.startEnhancement(player, {
    target: buildInventoryRef(target),
    targetLevel: 22,
  });
  assert.equal(start.ok, true);
  assert.equal(player.enhancementJob?.targetItemName, '混元双仪剑');
  assert.equal(start.messages?.[0]?.kind, 'enhancement');
  assert.equal(start.messages?.[0]?.vars?.itemName, '混元双仪剑');

  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const continued = craftService.tickEnhancement(player);
    assert.equal(continued.ok, true);
    assert.equal(continued.messages?.[0]?.key, 'notice.craft.enhancement.advance-continue');
    assert.equal(continued.messages?.[0]?.kind, 'enhancement');
    assert.equal(continued.messages?.[0]?.vars?.itemName, '混元双仪剑');
    assert.equal(continued.messages?.[0]?.vars?.currentLevel, 21);
    assert.equal(continued.messages?.[0]?.vars?.nextTargetLevel, 22);
  } finally {
    Math.random = originalRandom;
  }
}

async function testArtifactUsesExistingEnhancementLifecycle(): Promise<void> {
  const player = createPlayer('player:enhancement:artifact', [
    createArtifactItem('artifact.flying_sword', '巡天飞剑', 42, 0),
  ]);
  const { craftService } = createCraftHarness(player, [], []);
  const target = player.inventory.items[0];
  const start = craftService.startEnhancement(player, {
    target: buildInventoryRef(target),
  });
  assert.equal(start.ok, true);
  assert.equal(player.enhancementJob?.targetItemId, 'artifact.flying_sword');
  assert.equal(player.inventory.lockedItems?.some((item: { itemId?: string; type?: string }) => item.itemId === 'artifact.flying_sword' && item.type === 'artifact'), true);

  player.enhancementJob!.remainingTicks = 1;
  player.enhancementJob!.workRemainingTicks = 1;
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const completed = craftService.tickEnhancement(player);
    assert.equal(completed.ok, true);
    assert.equal(completed.messages?.[0]?.key, 'notice.craft.enhancement.success');
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(player.inventory.items.some((item) => item.itemId === 'artifact.flying_sword' && item.type === 'artifact' && item.enhanceLevel === 1), true);
}

function createCraftHarness(
  player: ReturnType<typeof createPlayer>,
  persistedActiveJobs: PersistedActiveJob[],
  persistedEnhancementRecords: unknown[],
  options: {
    durableCalls?: DurableEnhancementCall[];
    failDurableKinds?: ReadonlySet<DurableEnhancementCall['kind']>;
    durableErrorFactory?: (kind: DurableEnhancementCall['kind'], args: any) => Error | null;
    presenceSaves?: unknown[];
    presenceSaveHook?: (saveIndex: number) => void;
    assetMutationProbe?: AssetMutationProbe;
  } = {},
): {
  craftService: CraftPanelRuntimeService;
} {
  const playerRuntimeService = createPlayerRuntimeService(player, options.assetMutationProbe);
  const playerDomainPersistenceService = {
    isEnabled(): boolean {
      return true;
    },
    async savePlayerActiveJob(_playerId: string, activeJob: PersistedActiveJob | null): Promise<void> {
      persistedActiveJobs.push(activeJob ?? {});
    },
    async savePlayerTechniqueActivityQueue(): Promise<void> {
      return undefined;
    },
    async savePlayerEnhancementRecords(): Promise<void> {
      persistedEnhancementRecords.push(true);
    },
    ...(options.presenceSaves ? {
      async savePlayerPresence(_playerId: string, presence: unknown): Promise<void> {
        options.presenceSaves?.push(presence);
        options.presenceSaveHook?.(options.presenceSaves?.length ?? 0);
      },
    } : {}),
  };
  const durableOperationService = options.durableCalls
    ? createDurableOperationService(options.durableCalls, options.failDurableKinds, options.durableErrorFactory)
    : null;
  const playerPersistenceFlushService = {
    async flushPlayerDomains(playerId: string, domains: Iterable<string>): Promise<boolean> {
      assert.equal(playerId, player.playerId);
      for (const domain of domains) {
        player.dirtyDomains.delete(domain);
      }
      return true;
    },
  };
  const craftService = new CraftPanelRuntimeService(
    createContentTemplateRepository() as never,
    playerRuntimeService as never,
    playerDomainPersistenceService as never,
    {
      buildAlchemyPanelPayload(): unknown {
        return {};
      },
      buildAlchemyPanelPatchPayload(): unknown {
        return {};
      },
    } as never,
    {
      buildEnhancementPanelPayload(): unknown {
        return {};
      },
      buildEnhancementPanelPatchPayload(): unknown {
        return {};
      },
    } as never,
    durableOperationService as never,
    playerPersistenceFlushService as never,
  );
  craftService.enhancementConfigs.set('iron_sword', { steps: [] });
  return { craftService };
}

function createPlayer(playerId: string, items: Array<Record<string, unknown>>): any {
  const inventoryItems: Array<Record<string, unknown>> = items.map((item) => ({
    ...item,
    count: Math.max(1, Math.floor(Number(item.count) || 1)),
    itemInstanceId: typeof item.itemInstanceId === 'string' ? item.itemInstanceId : randomUUID(),
  }));
  inventoryItems.push({
    itemId: 'spirit_stone',
    name: '灵石',
    type: 'material',
    count: 20,
    level: 1,
    enhanceLevel: 0,
    itemInstanceId: randomUUID(),
  });
  return {
    playerId,
    sessionId: null,
    runtimeOwnerId: `runtime:${playerId}:offline`,
    sessionEpoch: 1,
    instanceId: 'instance:enhancement-smoke',
    inventory: {
      items: inventoryItems,
      lockedItems: [],
      capacity: 40,
      revision: 1,
    },
    equipment: { slots: [], revision: 1 },
    wallet: {
      balances: [{ walletType: 'spirit_stone', balance: 20, frozenBalance: 0, version: 1 }],
    },
    realm: { realmLv: 1 },
    enhancementSkill: { level: 5, exp: 0, expToNext: 60 },
    enhancementSkillLevel: 5,
    alchemySkill: { level: 1, exp: 0, expToNext: 60 },
    forgingSkill: { level: 1, exp: 0, expToNext: 60 },
    gatherSkill: { level: 1, exp: 0, expToNext: 60 },
    miningSkill: { level: 1, exp: 0, expToNext: 60 },
    formationSkill: { level: 1, exp: 0, expToNext: 60 },
    alchemyPresets: [],
    enhancementRecords: [],
    techniqueActivityQueue: [],
    persistentRevision: 1,
    selfRevision: 1,
    persistenceDomainRevisionByDomain: new Map<string, number>([['presence', 1]]),
    persistedDomainRevisionByDomain: new Map<string, number>(),
    dirtyDomains: new Set<string>(['presence']),
  };
}

function createEquipmentItem(itemId: string, name: string, level: number, enhanceLevel: number): Record<string, unknown> {
  return {
    itemId,
    name,
    type: 'equipment',
    count: 1,
    level,
    enhanceLevel,
  };
}

function createArtifactItem(itemId: string, name: string, level: number, enhanceLevel: number): Record<string, unknown> {
  return {
    itemId,
    name,
    type: 'artifact',
    count: 1,
    level,
    enhanceLevel,
    artifactMaxQiFactor: 1,
    artifactEffects: [{ type: 'traverse_unwalkable', costMaxQiRatio: 0.1 }],
  };
}

function createPlayerRuntimeService(player: any, assetMutationProbe?: AssetMutationProbe): any {
  return {
    getPlayer(playerId: string): any | null {
      return playerId === player.playerId ? player : null;
    },
    getPlayerOrThrow(playerId: string): any {
      if (playerId !== player.playerId) {
        throw new Error(`unknown player: ${playerId}`);
      }
      return player;
    },
    canAffordWallet(_playerId: string, itemId: string, amount: number): boolean {
      return itemId !== 'spirit_stone' || Number(player.wallet?.balances?.[0]?.balance ?? 0) >= amount;
    },
    debitWallet(_playerId: string, itemId: string, amount: number): void {
      if (itemId !== 'spirit_stone') {
        return;
      }
      const spiritStone = player.inventory.items.find((item: any) => item.itemId === 'spirit_stone');
      if (Number(spiritStone?.count ?? 0) < amount) {
        throw new Error('spirit stone insufficient');
      }
      spiritStone.count = Math.max(0, Number(spiritStone.count ?? 0) - amount);
      if (spiritStone.count <= 0) {
        player.inventory.items = player.inventory.items.filter((item: any) => item !== spiritStone);
      }
      player.wallet.balances[0].balance = Math.max(0, Number(spiritStone.count ?? 0));
      player.wallet.balances[0].version += 1;
      player.inventory.revision += 1;
      player.selfRevision += 1;
      player.persistentRevision += 1;
    },
    creditWallet(): void {},
    refreshWalletCacheFromInventory(): boolean {
      return false;
    },
    receiveInventoryItem(_playerId: string, item: { itemId: string; count: number }): void {
      player.inventory.items.push({
        itemId: item.itemId,
        name: item.itemId,
        type: 'material',
        count: item.count,
        level: 1,
        enhanceLevel: 0,
        itemInstanceId: randomUUID(),
      });
    },
    markPersistenceDirtyDomains(targetPlayer: any, domains: string[]): void {
      for (const domain of domains) {
        targetPlayer.dirtyDomains.add(domain);
        const revision = Math.max(0, Math.trunc(Number(targetPlayer.persistenceDomainRevisionByDomain.get(domain) ?? 0)));
        targetPlayer.persistenceDomainRevisionByDomain.set(domain, revision + 1);
      }
    },
    getPersistenceRevision(_playerId: string): number {
      return Number(player.persistentRevision);
    },
    getPersistenceDomainRevision(_playerId: string, domain: string): number {
      return Math.max(0, Math.trunc(Number(player.persistenceDomainRevisionByDomain.get(domain) ?? 0)));
    },
    isPersistenceDomainPersisted(_playerId: string, domain: string): boolean {
      if (player.dirtyDomains.has(domain)) {
        return false;
      }
      const revision = Math.max(0, Math.trunc(Number(player.persistenceDomainRevisionByDomain.get(domain) ?? 0)));
      return revision > 0
        && Number(player.persistedDomainRevisionByDomain.get(domain) ?? 0) === revision;
    },
    describePersistencePresence(playerId: string): any | null {
      if (playerId !== player.playerId) {
        return null;
      }
      return {
        online: typeof player.sessionId === 'string' && player.sessionId.length > 0,
        inWorld: true,
        runtimeOwnerId: player.runtimeOwnerId,
        sessionEpoch: player.sessionEpoch,
      };
    },
    buildPersistenceSnapshot(playerId: string): any | null {
      if (playerId !== player.playerId) {
        return null;
      }
      return {
        inventory: player.inventory,
        wallet: player.wallet,
        equipment: player.equipment,
        progression: {
          alchemySkill: player.alchemySkill,
          forgingSkill: player.forgingSkill,
          gatherSkill: player.gatherSkill,
          buildingSkill: player.buildingSkill,
          miningSkill: player.miningSkill,
          formationSkill: player.formationSkill,
          transmissionSkill: player.transmissionSkill,
          enhancementSkill: player.enhancementSkill,
          enhancementSkillLevel: player.enhancementSkillLevel,
        },
      };
    },
    markPersisted(_playerId: string, persistedDomains?: Iterable<string> | null, persistedRevision?: number | null): void {
      if (persistedDomains) {
        for (const domain of persistedDomains) {
          player.dirtyDomains.delete(domain);
          const revision = Math.max(0, Math.trunc(Number(player.persistenceDomainRevisionByDomain.get(domain) ?? 0)));
          player.persistedDomainRevisionByDomain.set(domain, revision);
        }
      }
      if (typeof persistedRevision === 'number') {
        player.persistedRevision = Math.min(persistedRevision, player.persistentRevision);
      }
    },
    bumpPersistentRevision(targetPlayer: any): void {
      targetPlayer.persistentRevision += 1;
    },
    tryRunSynchronousPlayerMutationWhileAssetIdle(_playerId: string, action: () => void): boolean {
      if (assetMutationProbe) {
        assetMutationProbe.idleChecks += 1;
        if (assetMutationProbe.busy) {
          return false;
        }
      }
      action();
      return true;
    },
    async runExclusiveAssetMutation(_playerIds: string[], action: () => unknown): Promise<unknown> {
      if (assetMutationProbe) {
        assetMutationProbe.exclusiveCalls += 1;
      }
      return action();
    },
    playerProgressionService: {
      refreshPreview(): void {},
      grantCraftRealmExp(): null {
        return null;
      },
    },
    playerAttributesService: {
      recalculate(): void {},
    },
    rebuildActionState(): void {},
  };
}

function createDurableOperationService(
  durableCalls: DurableEnhancementCall[],
  failKinds: ReadonlySet<DurableEnhancementCall['kind']> = new Set(),
  errorFactory?: (kind: DurableEnhancementCall['kind'], args: any) => Error | null,
): any {
  const record = (kind: DurableEnhancementCall['kind'], args: any): void => {
    durableCalls.push({ kind, args });
    const configuredError = errorFactory?.(kind, args);
    if (configuredError) {
      throw configuredError;
    }
    if (failKinds.has(kind)) {
      throw new Error(`durable_${kind}_failed`);
    }
  };
  return {
    isEnabled(): boolean {
      return true;
    },
    async startActiveJobWithAssets(args: any): Promise<void> {
      record('start', args);
    },
    async updateActiveJobState(args: any): Promise<void> {
      record('update', args);
    },
    async cancelActiveJobWithAssets(args: any): Promise<void> {
      record('cancel', args);
    },
    async completeActiveJobWithAssets(args: any): Promise<void> {
      record('complete', args);
    },
  };
}

function snapshotEnhancementRuntime(player: any): unknown {
  return JSON.parse(JSON.stringify({
    inventory: structuredClone(player.inventory),
    equipment: structuredClone(player.equipment),
    wallet: structuredClone(player.wallet),
    enhancementJob: player.enhancementJob ? structuredClone(player.enhancementJob) : null,
    enhancementRecords: structuredClone(player.enhancementRecords),
    enhancementSkill: structuredClone(player.enhancementSkill),
    enhancementSkillLevel: player.enhancementSkillLevel,
    techniqueActivityQueue: structuredClone(player.techniqueActivityQueue),
    selfRevision: player.selfRevision,
  }));
}

function createContentTemplateRepository(): any {
  return {
    normalizeItem(item: Record<string, unknown>): Record<string, unknown> {
      return {
        ...item,
        count: Math.max(1, Math.floor(Number(item.count) || 1)),
      };
    },
    getItemName(itemId: string): string {
      if (itemId === 'iron_sword') {
        return '铁剑';
      }
      if (itemId === 'artifact.flying_sword') {
        return '巡天飞剑';
      }
      if (itemId === 'equip.foundation_mixed_dual_sword') {
        return '混元双仪剑';
      }
      return itemId;
    },
  };
}

function buildInventoryRef(item: { itemInstanceId?: string }): { source: 'inventory'; itemInstanceId: string; expectedItemInstanceId: string } {
  if (!item.itemInstanceId) {
    throw new Error('missing inventory item instance id');
  }
  return {
    source: 'inventory',
    itemInstanceId: item.itemInstanceId,
    expectedItemInstanceId: item.itemInstanceId,
  };
}

async function settleAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof (value as PromiseLike<unknown>).then === 'function');
}

void main();
