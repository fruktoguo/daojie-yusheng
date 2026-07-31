import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { RedeemCodeRuntimeService } from '../runtime/redeem/redeem-code-runtime.service';

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function buildHarness(code: string, options: {
  persistentClaim?: boolean;
  persistedPresenceAhead?: boolean;
  finalizeFailureCount?: number;
} = {}) {
  const playerId = 'player:redeem-durable-smoke';
  const nowIso = '2026-04-23T00:00:00.000Z';
  const player = {
    playerId,
    name: '兑换烟测',
    runtimeOwnerId: `runtime-owner:${playerId}`,
    sessionEpoch: 9,
    instanceId: 'instance:redeem-smoke',
    inventory: {
      items: [] as Array<Record<string, unknown>>,
      capacity: 16,
      revision: 0,
    },
    wallet: {
      balances: [] as Array<Record<string, unknown>>,
    },
    persistentRevision: 0,
    selfRevision: 0,
    dirtyDomains: new Set<string>(),
    suppressImmediateDomainPersistence: false,
  };
  const durableCalls: Array<Record<string, unknown>> = [];
  const walletMutations: Array<Record<string, unknown>> = [];
  const walletCredits: Array<Record<string, unknown>> = [];
  const replacedInventories: Array<Array<Record<string, unknown>>> = [];
  const receivedInventories: Array<Record<string, unknown>> = [];
  const notices: Array<Record<string, unknown>> = [];
  const logbookMessages: Array<Record<string, unknown>> = [];
  const persistedDocuments: Array<Record<string, unknown>> = [];
  const claimCalls: Array<Record<string, unknown>> = [];
  const finalizeCalls: Array<Record<string, unknown>> = [];
  const savedPresences: Array<Record<string, unknown>> = [];
  const assetMutationCalls: Array<readonly string[]> = [];
  let assetMutationDepth = 0;
  let rewardOperationCommitted = false;
  let finalizeFailureCount = Math.max(0, Math.trunc(options.finalizeFailureCount ?? 0));
  const persistedPresence = options.persistedPresenceAhead === true
    ? {
        playerId,
        online: true,
        inWorld: true,
        lastHeartbeatAt: 1000,
        offlineSinceAt: null,
        runtimeOwnerId: `runtime-owner:${playerId}:persisted`,
        sessionEpoch: 28,
        transferState: null,
        transferTargetNodeId: null,
      }
    : null;
  const deferred = createDeferred<{ ok: boolean; alreadyCommitted: boolean; grantedCount: number; sourceType: string }>();
  const persistenceService: Record<string, unknown> = {
    async loadDocument() {
      return null;
    },
    async saveDocument(document: Record<string, unknown>) {
      persistedDocuments.push(document);
    },
  };
  if (options.persistentClaim === true) {
    const pendingRewards = [
      { itemId: 'rat_tail', count: 2 },
      { itemId: 'spirit_stone', count: 3 },
    ];
    persistenceService.claimCodeForUse = async (input: Record<string, unknown>) => {
      claimCalls.push(input);
      if (input.code !== code) {
        return { ok: false, reason: 'not_active' };
      }
      return {
        ok: true,
        skipped: false,
        code: {
          id: `code:${code}`,
          groupId: 'group:redeem-smoke',
          code,
          status: 'pending',
          pendingOperationId: input.operationId,
          pendingRewards: pendingRewards.map((entry) => ({ ...entry })),
          updatedAt: input.usedAt,
        },
      };
    };
    persistenceService.finalizeCodeUse = async (input: Record<string, unknown>) => {
      finalizeCalls.push(input);
      if (finalizeFailureCount > 0) {
        finalizeFailureCount -= 1;
        return { ok: false, reason: 'simulated_finalize_failure' };
      }
      if (input.code !== code) {
        return { ok: false, reason: 'not_pending' };
      }
      return {
        ok: true,
        skipped: false,
        code: {
          id: `code:${code}`,
          groupId: 'group:redeem-smoke',
          code,
          status: 'used',
          usedByPlayerId: input.playerId,
          usedByRoleName: input.playerName,
          usedAt: input.usedAt,
          updatedAt: input.usedAt,
        },
      };
    };
  }

  const service = new RedeemCodeRuntimeService(
    {
      createItem(itemId: string, count: number) {
        if (itemId === 'rat_tail') {
          return { itemId, count, name: '鼠尾', type: 'material' };
        }
        if (itemId === 'spirit_stone') {
          return { itemId, count, name: '灵石', type: 'currency' };
        }
        return null;
      },
      normalizeItem(item: Record<string, unknown>) {
        return {
          itemId: String(item?.itemId ?? ''),
          count: Math.max(1, Math.trunc(Number(item?.count ?? 1))),
          name: item?.name ?? '物品',
          type: item?.type ?? 'material',
        };
      },
    } as never,
    {
      async runExclusiveAssetMutation<T>(playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
        assetMutationCalls.push([...playerIds]);
        assetMutationDepth += 1;
        try {
          return await action();
        } finally {
          assetMutationDepth -= 1;
        }
      },
      getPlayerOrThrow(requestedPlayerId: string) {
        assert.equal(requestedPlayerId, playerId);
        return player;
      },
      creditWallet(requestedPlayerId: string, walletType: string, amount: number) {
        assert.equal(requestedPlayerId, playerId);
        assert.equal(assetMutationDepth, 1, '运行态钱包应用必须位于资产串行区');
        walletCredits.push({ walletType, amount });
        const existing = player.wallet.balances.find((entry) => entry.walletType === walletType);
        if (existing) {
          existing.balance = Number(existing.balance ?? 0) + amount;
          return player;
        }
        player.wallet.balances.push({ walletType, balance: amount, frozenBalance: 0, version: 1 });
        return player;
      },
      receiveInventoryItem(_requestedPlayerId: string, item: Record<string, unknown>) {
        receivedInventories.push(item);
        return player;
      },
      replaceInventoryItems(requestedPlayerId: string, items: Array<Record<string, unknown>>) {
        assert.equal(requestedPlayerId, playerId);
        assert.equal(assetMutationDepth, 1, '运行态背包应用必须位于资产串行区');
        const cloned = items.map((entry) => ({ ...entry }));
        replacedInventories.push(cloned);
        player.inventory.items = cloned;
        player.inventory.revision += 1;
        player.persistentRevision += 1;
        player.selfRevision += 1;
        player.dirtyDomains = new Set(['inventory']);
        return player;
      },
      queuePendingLogbookMessage(_requestedPlayerId: string, payload: Record<string, unknown>) {
        logbookMessages.push(payload);
      },
      enqueueNotice(_requestedPlayerId: string, payload: Record<string, unknown>) {
        notices.push(payload);
      },
      describePersistencePresence(requestedPlayerId: string) {
        assert.equal(requestedPlayerId, playerId);
        return {
          playerId,
          online: true,
          inWorld: true,
          lastHeartbeatAt: 1000,
          offlineSinceAt: null,
          runtimeOwnerId: player.runtimeOwnerId,
          sessionEpoch: player.sessionEpoch,
          transferState: null,
          transferTargetNodeId: null,
        };
      },
      ensureRuntimeSessionFenceAtLeast(requestedPlayerId: string, sessionEpochFloor: number) {
        assert.equal(requestedPlayerId, playerId);
        const normalizedFloor = Math.max(1, Math.trunc(Number(sessionEpochFloor)));
        if (Math.trunc(Number(player.sessionEpoch ?? 0)) <= normalizedFloor) {
          player.sessionEpoch = normalizedFloor;
          player.runtimeOwnerId = `runtime-owner:${playerId}:synced:${normalizedFloor}`;
        }
        return {
          runtimeOwnerId: player.runtimeOwnerId,
          sessionEpoch: player.sessionEpoch,
        };
      },
      playerProgressionService: {
        refreshPreview() {},
      },
    } as never,
    persistenceService as never,
    {
      isEnabled() {
        return true;
      },
      async grantInventoryItems(input: Record<string, unknown>) {
        assert.equal(assetMutationDepth, 1, 'durable 背包提交必须位于资产串行区');
        durableCalls.push(input);
        const result = await deferred.promise;
        if (result.ok) {
          rewardOperationCommitted = true;
        }
        return result;
      },
      async isOperationCommitted(operationId: string) {
        assert.equal(operationId, `op:${playerId}:redeem-code:${code}`);
        return rewardOperationCommitted;
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(requestedInstanceId: string) {
        assert.equal(requestedInstanceId, 'instance:redeem-smoke');
        return {
          assigned_node_id: 'node:redeem-smoke',
          ownership_epoch: 12,
        };
      },
    } as never,
    {
      isEnabled() {
        return options.persistedPresenceAhead === true;
      },
      async loadPlayerPresence(requestedPlayerId: string) {
        assert.equal(requestedPlayerId, playerId);
        return persistedPresence;
      },
      async savePlayerPresence(requestedPlayerId: string, presence: Record<string, unknown>) {
        assert.equal(requestedPlayerId, playerId);
        savedPresences.push(presence);
      },
    } as never,
  );

  (service as any).groups = [
    {
      id: 'group:redeem-smoke',
      name: '兑换烟测',
      rewards: [
        { itemId: 'rat_tail', count: 2 },
        { itemId: 'spirit_stone', count: 3 },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
  (service as any).codes = [
    {
      id: `code:${code}`,
      groupId: 'group:redeem-smoke',
      code,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
  (service as any).revision = 1;
  (service as any).catalogReady = true;

  return {
    code,
    service,
    player,
    durableCalls,
    walletMutations,
    walletCredits,
    replacedInventories,
    receivedInventories,
    notices,
    logbookMessages,
    persistedDocuments,
    claimCalls,
    finalizeCalls,
    savedPresences,
    assetMutationCalls,
    deferred,
  };
}

async function main(): Promise<void> {
  const success = buildHarness('REDEEM-DURABLE-CODE-001');
  const successPromise = success.service.redeemCodes(success.player.playerId, [success.code]);
  await nextTick();

  assert.equal(success.durableCalls.length, 1);
  assert.deepEqual(success.assetMutationCalls, [[success.player.playerId]]);
  assert.equal(success.durableCalls[0]?.playerId, success.player.playerId);
  assert.equal(success.durableCalls[0]?.expectedRuntimeOwnerId, success.player.runtimeOwnerId);
  assert.equal(success.durableCalls[0]?.expectedSessionEpoch, success.player.sessionEpoch);
  assert.equal(success.durableCalls[0]?.expectedInstanceId, 'instance:redeem-smoke');
  assert.equal(success.durableCalls[0]?.expectedAssignedNodeId, 'node:redeem-smoke');
  assert.equal(success.durableCalls[0]?.expectedOwnershipEpoch, 12);
  assert.equal(success.durableCalls[0]?.sourceType, 'redeem_code');
  assert.equal(success.durableCalls[0]?.sourceRefId, success.code);
  assert.equal((success.durableCalls[0]?.grantedItems as Array<Record<string, unknown>>)?.[0]?.itemId, 'rat_tail');
  assert.equal((success.durableCalls[0]?.grantedItems as Array<Record<string, unknown>>)?.[1]?.itemId, 'spirit_stone');
  assert.equal(success.notices.length, 0);
  assert.equal(success.logbookMessages.length, 0);
  assert.equal(success.persistedDocuments.length, 0);
  assert.equal(success.walletCredits.length, 0);
  assert.equal(success.replacedInventories.length, 0);
  assert.equal(success.receivedInventories.length, 0);

  success.deferred.resolve({
    ok: true,
    alreadyCommitted: false,
    grantedCount: 5,
    sourceType: 'redeem_code',
  });
  const successResult = await successPromise;
  assert.equal(successResult.results.length, 1);
  assert.equal(successResult.results[0]?.ok, true);
  assert.equal(success.walletCredits.length, 0);
  assert.equal(success.walletMutations.length, 0);
  assert.equal(success.replacedInventories.length, 1);
  assert.equal(success.player.inventory.items[0]?.itemId, 'rat_tail');
  assert.equal(success.player.inventory.items[0]?.count, 2);
  assert.equal(success.player.inventory.items[1]?.itemId, 'spirit_stone');
  assert.equal(success.player.inventory.items[1]?.count, 3);
  assert.equal(success.notices.length, 1);
  const redeemNoticeStructured = success.notices[0]?.structured as { key?: string } | undefined;
  assert.equal(redeemNoticeStructured?.key, 'notice.redeem.success');
  assert.equal(success.logbookMessages.length, 0);
  assert.equal(success.persistedDocuments.length, 0);
  assert.equal((success as any).service.codes[0]?.status, 'used');
  assert.equal(success.receivedInventories.length, 0);

  const failure = buildHarness('REDEEM-DURABLE-CODE-002');
  const failurePromise = failure.service.redeemCodes(failure.player.playerId, [failure.code]);
  await nextTick();
  assert.equal(failure.durableCalls.length, 1);
  failure.deferred.reject(new Error('redeem durable failed'));
  await assert.rejects(() => failurePromise, /redeem durable failed/);
  assert.equal(failure.player.inventory.items.length, 0);
  assert.equal(failure.walletMutations.length, 0);
  assert.equal(failure.walletCredits.length, 0);
  assert.equal(failure.notices.length, 0);
  assert.equal(failure.logbookMessages.length, 0);
  assert.equal(failure.persistedDocuments.length, 0);
  assert.equal((failure as any).service.codes[0]?.status, 'active');

  const persistentClaimFailure = buildHarness('REDEEM-DURABLE-CODE-003', { persistentClaim: true });
  const persistentClaimFailurePromise = persistentClaimFailure.service.redeemCodes(
    persistentClaimFailure.player.playerId,
    [persistentClaimFailure.code],
  );
  await nextTick();
  assert.equal(persistentClaimFailure.claimCalls.length, 1);
  assert.equal(persistentClaimFailure.claimCalls[0]?.playerId, persistentClaimFailure.player.playerId);
  assert.equal(persistentClaimFailure.claimCalls[0]?.code, persistentClaimFailure.code);
  assert.equal(persistentClaimFailure.claimCalls[0]?.operationId, `op:${persistentClaimFailure.player.playerId}:redeem-code:${persistentClaimFailure.code}`);
  assert.equal((persistentClaimFailure as any).service.codes[0]?.status, 'pending');

  const finalizeRetry = buildHarness('REDEEM-DURABLE-CODE-006', {
    persistentClaim: true,
    finalizeFailureCount: 1,
  });
  const finalizeFailurePromise = finalizeRetry.service.redeemCodes(
    finalizeRetry.player.playerId,
    [finalizeRetry.code],
  );
  await nextTick();
  finalizeRetry.deferred.resolve({
    ok: true,
    alreadyCommitted: false,
    grantedCount: 5,
    sourceType: 'redeem_code',
  });
  await assert.rejects(() => finalizeFailurePromise, /redeem_code_finalize_failed/);
  assert.equal(finalizeRetry.durableCalls.length, 1);
  assert.equal(finalizeRetry.replacedInventories.length, 1);
  assert.equal(finalizeRetry.notices.length, 0);
  assert.equal((finalizeRetry as any).service.codes[0]?.status, 'pending');
  (finalizeRetry as any).service.groups[0].rewards = [{ itemId: 'rat_tail', count: 99 }];
  (finalizeRetry as any).service._redeemRateMap.clear();

  const retryResult = await finalizeRetry.service.redeemCodes(
    finalizeRetry.player.playerId,
    [finalizeRetry.code],
  );
  assert.equal(retryResult.results[0]?.ok, true);
  assert.deepEqual(retryResult.results[0]?.rewards, [
    { itemId: 'rat_tail', count: 2 },
    { itemId: 'spirit_stone', count: 3 },
  ]);
  assert.equal(finalizeRetry.durableCalls.length, 1, '已提交奖励的重试不得再次调用 durable grant');
  assert.equal(finalizeRetry.replacedInventories.length, 1, '已提交奖励的重试不得再次应用运行态背包');
  assert.equal(finalizeRetry.player.inventory.items[0]?.count, 2);
  assert.equal(finalizeRetry.player.inventory.items[1]?.count, 3);
  assert.equal(finalizeRetry.finalizeCalls.length, 2);
  assert.equal(finalizeRetry.notices.length, 1);
  assert.equal((finalizeRetry as any).service.codes[0]?.status, 'used');

  const persistentClaimSuccess = buildHarness('REDEEM-DURABLE-CODE-004', { persistentClaim: true });
  const persistentClaimSuccessPromise = persistentClaimSuccess.service.redeemCodes(
    persistentClaimSuccess.player.playerId,
    [persistentClaimSuccess.code],
  );
  await nextTick();
  persistentClaimSuccess.deferred.resolve({
    ok: true,
    alreadyCommitted: false,
    grantedCount: 5,
    sourceType: 'redeem_code',
  });
  const persistentClaimSuccessResult = await persistentClaimSuccessPromise;
  assert.equal(persistentClaimSuccessResult.results[0]?.ok, true);
  assert.equal(persistentClaimSuccess.finalizeCalls.length, 1);
  assert.equal(persistentClaimSuccess.finalizeCalls[0]?.operationId, `op:${persistentClaimSuccess.player.playerId}:redeem-code:${persistentClaimSuccess.code}`);
  assert.equal((persistentClaimSuccess as any).service.codes[0]?.status, 'used');

  const staleFence = buildHarness('REDEEM-DURABLE-CODE-005', { persistedPresenceAhead: true });
  const staleFencePromise = staleFence.service.redeemCodes(staleFence.player.playerId, [staleFence.code]);
  await nextTick();
  assert.equal(staleFence.savedPresences.length, 1);
  assert.equal(staleFence.savedPresences[0]?.sessionEpoch, 28);
  assert.equal(staleFence.durableCalls.length, 1);
  assert.equal(staleFence.durableCalls[0]?.expectedSessionEpoch, 28);
  assert.equal(staleFence.durableCalls[0]?.expectedRuntimeOwnerId, `runtime-owner:${staleFence.player.playerId}:synced:28`);
  staleFence.deferred.resolve({
    ok: true,
    alreadyCommitted: false,
    grantedCount: 5,
    sourceType: 'redeem_code',
  });
  const staleFenceResult = await staleFencePromise;
  assert.equal(staleFenceResult.results[0]?.ok, true);
  assert.equal(persistentClaimFailure.durableCalls.length, 1);
  persistentClaimFailure.deferred.reject(new Error('redeem durable failed after claim'));
  await assert.rejects(() => persistentClaimFailurePromise, /redeem durable failed after claim/);
  assert.equal(persistentClaimFailure.player.inventory.items.length, 0);
  assert.equal(persistentClaimFailure.walletMutations.length, 0);
  assert.equal(persistentClaimFailure.walletCredits.length, 0);
  assert.equal(persistentClaimFailure.notices.length, 0);
  assert.equal(persistentClaimFailure.logbookMessages.length, 0);
  assert.equal(persistentClaimFailure.persistedDocuments.length, 0);
  assert.equal(persistentClaimFailure.finalizeCalls.length, 0);
  assert.equal((persistentClaimFailure as any).service.codes[0]?.status, 'pending');

  console.log(
    JSON.stringify(
      {
        ok: true,
        durableCallCount: success.durableCalls.length + failure.durableCalls.length + persistentClaimFailure.durableCalls.length + persistentClaimSuccess.durableCalls.length + staleFence.durableCalls.length + finalizeRetry.durableCalls.length,
        persistentClaimCount:
          persistentClaimFailure.claimCalls.length
          + persistentClaimSuccess.claimCalls.length
          + finalizeRetry.claimCalls.length,
        persistentFinalizeCount: persistentClaimSuccess.finalizeCalls.length + finalizeRetry.finalizeCalls.length,
        answers:
          'RedeemCodeRuntimeService 把灵石和普通物品统一纳入一次 grantInventoryItems 背包真源事务；持久化兑换码先抢占 pending 并冻结奖励快照，奖励成功后 finalize；finalize 失败重试只补核销，不重复 durable grant、运行态应用或 notice；兑换前同步数据库 player_presence fence',
        excludes: '不证明 live socket 兑换码链路、真实 PostgreSQL 并发条件更新或任务奖励库存抽象已统一切换到同一 durable 主链',
        completionMapping: 'release:proof:redeem-code-runtime-durable',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
