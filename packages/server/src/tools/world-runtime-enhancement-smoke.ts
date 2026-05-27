import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import type { RuntimeTechniqueActivityKind } from '@mud/shared';
import { computeEnhancementAdjustedSuccessRate } from '@mud/shared';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';

type PersistedActiveJob = {
  jobRunId?: string;
  jobType?: string;
  phase?: string;
  workTotalTicks?: number;
  workRemainingTicks?: number;
  interruptWaitRemainingTicks?: number;
};

async function main(): Promise<void> {
  testEnhancementCancelUsesPipelineLifecycle();
  await testStartInterruptAndCompleteEnhancement();
  await testTickUsesJobSuccessRateForFailure();
  await testProtectionFailureConsumesProtectionAndContinues();
  await testProtectionMissingStopsAndReturnsCurrentLevel();
  await testSpiritStoneMissingStopsOnSuccessSettlement();
  await testMissingLockedItemClearsJobWithoutSnapshotFallback();
  await testCancelReturnsLockedTarget();
  await testQueuedEnhancementDoesNotLockOrConsumeResources();
  await testEnhancementUsesTemplateNameWhenRuntimeItemNameMissing();

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
      '强化运行态物品缺少 name 或仅有 itemId 时，任务、通知和队列使用内容目录显示名。',
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
  } finally {
    Math.random = originalRandom;
  }

  await settleAsync();
  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(player.inventory.items.some((item) => item.itemId === 'iron_sword' && item.enhanceLevel === 2), true);
  assert.equal(player.wallet.balances[0].balance, 19);
  assert.equal(player.enhancementRecords[0]?.status, 'completed');
  assert.equal(persistedEnhancementRecords.length > 0, true);
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

async function testCancelReturnsLockedTarget(): Promise<void> {
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

  const cancelled = craftService.cancelTechniqueActivity(player, 'enhancement');
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.messages?.[0]?.key, 'notice.craft.enhancement.cancelled');
  assert.equal(player.enhancementJob, null);
  assert.equal(player.inventory.lockedItems?.length ?? 0, 0);
  assert.equal(player.inventory.items.some((item) => item.itemId === 'iron_sword' && item.enhanceLevel === 1), true);
  assert.equal(player.enhancementRecords[0]?.status, 'cancelled');
  await settleAsync();
  assert.equal(persistedActiveJobs.at(-1)?.phase ?? null, null);
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
  assert.equal(player.enhancementJob?.targetItemName, '+1 铁剑');
  assert.equal(start.messages?.[0]?.vars?.itemName, '+1 铁剑');

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

function createCraftHarness(
  player: ReturnType<typeof createPlayer>,
  persistedActiveJobs: PersistedActiveJob[],
  persistedEnhancementRecords: unknown[],
): {
  craftService: CraftPanelRuntimeService;
} {
  const playerRuntimeService = createPlayerRuntimeService(player);
  const playerDomainPersistenceService = {
    isEnabled(): boolean {
      return true;
    },
    async savePlayerActiveJob(_playerId: string, activeJob: PersistedActiveJob | null): Promise<void> {
      persistedActiveJobs.push(activeJob ?? {});
    },
    async savePlayerEnhancementRecords(): Promise<void> {
      persistedEnhancementRecords.push(true);
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
  );
  craftService.enhancementConfigs.set('iron_sword', { steps: [] });
  return { craftService };
}

function createPlayer(playerId: string, items: Array<Record<string, unknown>>): any {
  return {
    playerId,
    instanceId: 'instance:enhancement-smoke',
    inventory: {
      items: items.map((item) => ({
        ...item,
        count: Math.max(1, Math.floor(Number(item.count) || 1)),
        itemInstanceId: typeof item.itemInstanceId === 'string' ? item.itemInstanceId : randomUUID(),
      })),
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
    dirtyDomains: new Set<string>(),
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

function createPlayerRuntimeService(player: any): any {
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
      if (Number(player.wallet.balances[0].balance ?? 0) < amount) {
        throw new Error('spirit stone insufficient');
      }
      player.wallet.balances[0].balance = Math.max(0, Number(player.wallet.balances[0].balance ?? 0) - amount);
    },
    creditWallet(): void {},
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
      }
    },
    bumpPersistentRevision(targetPlayer: any): void {
      targetPlayer.persistentRevision += 1;
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

function createContentTemplateRepository(): any {
  return {
    normalizeItem(item: Record<string, unknown>): Record<string, unknown> {
      return {
        ...item,
        count: Math.max(1, Math.floor(Number(item.count) || 1)),
      };
    },
    getItemName(itemId: string): string {
      return itemId === 'iron_sword' ? '铁剑' : itemId;
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

void main();
