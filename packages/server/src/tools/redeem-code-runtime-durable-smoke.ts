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

function buildHarness(code: string) {
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
  const walletCredits: Array<Record<string, unknown>> = [];
  const replacedInventories: Array<Array<Record<string, unknown>>> = [];
  const receivedInventories: Array<Record<string, unknown>> = [];
  const notices: Array<Record<string, unknown>> = [];
  const logbookMessages: Array<Record<string, unknown>> = [];
  const persistedDocuments: Array<Record<string, unknown>> = [];
  const deferred = createDeferred<{ ok: boolean; alreadyCommitted: boolean; grantedCount: number; sourceType: string }>();

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
      getPlayerOrThrow(requestedPlayerId: string) {
        assert.equal(requestedPlayerId, playerId);
        return player;
      },
      creditWallet(requestedPlayerId: string, walletType: string, amount: number) {
        assert.equal(requestedPlayerId, playerId);
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
      playerProgressionService: {
        refreshPreview() {},
      },
    } as never,
    {
      async loadDocument() {
        return null;
      },
      async saveDocument(document: Record<string, unknown>) {
        persistedDocuments.push(document);
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async grantInventoryItems(input: Record<string, unknown>) {
        durableCalls.push(input);
        return deferred.promise;
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

  return {
    code,
    service,
    player,
    durableCalls,
    walletCredits,
    replacedInventories,
    receivedInventories,
    notices,
    logbookMessages,
    persistedDocuments,
    deferred,
  };
}

async function main(): Promise<void> {
  const success = buildHarness('REDEEM-DURABLE-CODE-001');
  const successPromise = success.service.redeemCodes(success.player.playerId, [success.code]);
  await nextTick();

  assert.equal(success.durableCalls.length, 1);
  assert.equal(success.durableCalls[0]?.playerId, success.player.playerId);
  assert.equal(success.durableCalls[0]?.expectedRuntimeOwnerId, success.player.runtimeOwnerId);
  assert.equal(success.durableCalls[0]?.expectedSessionEpoch, success.player.sessionEpoch);
  assert.equal(success.durableCalls[0]?.expectedInstanceId, 'instance:redeem-smoke');
  assert.equal(success.durableCalls[0]?.expectedAssignedNodeId, 'node:redeem-smoke');
  assert.equal(success.durableCalls[0]?.expectedOwnershipEpoch, 12);
  assert.equal(success.durableCalls[0]?.sourceType, 'redeem_code');
  assert.equal(success.durableCalls[0]?.sourceRefId, success.code);
  assert.equal((success.durableCalls[0]?.grantedItems as Array<Record<string, unknown>>)?.[0]?.itemId, 'rat_tail');
  assert.equal(success.notices.length, 0);
  assert.equal(success.logbookMessages.length, 0);
  assert.equal(success.persistedDocuments.length, 0);
  assert.equal(success.walletCredits.length, 0);
  assert.equal(success.replacedInventories.length, 0);
  assert.equal(success.receivedInventories.length, 0);

  success.deferred.resolve({
    ok: true,
    alreadyCommitted: false,
    grantedCount: 2,
    sourceType: 'redeem_code',
  });
  const successResult = await successPromise;
  assert.equal(successResult.results.length, 1);
  assert.equal(successResult.results[0]?.ok, true);
  assert.equal(success.walletCredits.length, 1);
  assert.deepEqual(success.walletCredits[0], { walletType: 'spirit_stone', amount: 3 });
  assert.equal(success.replacedInventories.length, 1);
  assert.equal(success.player.inventory.items[0]?.itemId, 'rat_tail');
  assert.equal(success.player.inventory.items[0]?.count, 2);
  assert.equal(success.notices.length, 1);
  assert.equal(success.logbookMessages.length, 1);
  assert.equal(success.persistedDocuments.length, 1);
  assert.equal((success as any).service.codes[0]?.status, 'used');
  assert.equal(success.receivedInventories.length, 0);

  const failure = buildHarness('REDEEM-DURABLE-CODE-002');
  const failurePromise = failure.service.redeemCodes(failure.player.playerId, [failure.code]);
  await nextTick();
  assert.equal(failure.durableCalls.length, 1);
  failure.deferred.reject(new Error('redeem durable failed'));
  await assert.rejects(() => failurePromise, /redeem durable failed/);
  assert.equal(failure.player.inventory.items.length, 0);
  assert.equal(failure.walletCredits.length, 0);
  assert.equal(failure.notices.length, 0);
  assert.equal(failure.logbookMessages.length, 0);
  assert.equal(failure.persistedDocuments.length, 0);
  assert.equal((failure as any).service.codes[0]?.status, 'active');

  console.log(
    JSON.stringify(
      {
        ok: true,
        durableCallCount: success.durableCalls.length + failure.durableCalls.length,
        answers:
          'RedeemCodeRuntimeService 的非钱包奖励现在会先走 grantInventoryItems durable 主链，成功提交后才落运行态 inventory、wallet、notice、logbook 和 code used 持久化；durable 失败时会保持运行态与兑换码状态不变',
        excludes: '不证明 live socket 兑换码链路或任务奖励库存抽象已统一切换到同一 durable 主链',
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
