import assert from 'node:assert/strict';

import {
  MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
  MERIT_ETERNAL_POOL_GRANT,
  MERIT_ETERNAL_USE_BEHAVIOR,
  MERIT_MONTH_CARD_POOL_GRANT,
} from '@mud/shared';
import { calculateMonthCardDailyReward, calculateMonthCardNextPool } from '../persistence/activity-persistence.service';
import { WorldGatewayActivityHelper } from '../network/world-gateway-activity.helper';
import { ActivityRuntimeService, normalizeActivityError } from '../runtime/activity/activity-runtime.service';
import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  let pool = 0;
  for (let i = 0; i < 10; i += 1) {
    pool = calculateMonthCardNextPool(pool);
  }
  assert.equal(pool, MERIT_MONTH_CARD_POOL_GRANT * 10);
  assert.equal(calculateMonthCardDailyReward({ totalPoolMerit: pool, remainingPoolMerit: pool }), 1000);

  const renewedPool = calculateMonthCardNextPool(2000);
  assert.equal(renewedPool, 5000);
  assert.equal(calculateMonthCardDailyReward({ totalPoolMerit: renewedPool, remainingPoolMerit: renewedPool }), 166);

  const batchPool = calculateMonthCardNextPool(500, MERIT_MONTH_CARD_POOL_GRANT * 3);
  assert.equal(batchPool, 9500);
  assert.equal(calculateMonthCardDailyReward({ totalPoolMerit: batchPool, remainingPoolMerit: batchPool }), 316);

  assert.equal(calculateMonthCardDailyReward({ totalPoolMerit: renewedPool, remainingPoolMerit: 20 }), 20);
  assert.equal(calculateMonthCardNextPool(-100), MERIT_MONTH_CARD_POOL_GRANT);
  assert.equal(
    normalizeActivityError(new Error('connect ECONNREFUSED internal-activity-db:5432')).message,
    '活动服务暂不可用，请稍后重试',
  );

  const activationCalls: Array<{ playerId: string; nowMs: number; poolGrant: number }> = [];
  const eternalActivationCalls: Array<{ playerId: string; nowMs: number; poolGrant: number; fixedSignInBonus: number }> = [];
  const service = new ActivityRuntimeService({
    activateMonthCard: async (playerId: string, nowMs: number, poolGrant: number) => {
      activationCalls.push({ playerId, nowMs, poolGrant });
      return {
        playerId,
        startAt: nowMs,
        expireAt: nowMs,
        totalPoolMerit: poolGrant,
        remainingPoolMerit: poolGrant,
        eternalEnabled: false,
        dailySignInFixedMeritBonus: 0,
        lastClaimDate: null,
      };
    },
    activateEternalMonthCard: async (playerId: string, nowMs: number, poolGrant: number, fixedSignInBonus: number) => {
      eternalActivationCalls.push({ playerId, nowMs, poolGrant, fixedSignInBonus });
      return {
        playerId,
        startAt: nowMs,
        expireAt: nowMs,
        totalPoolMerit: poolGrant,
        remainingPoolMerit: poolGrant,
        eternalEnabled: true,
        dailySignInFixedMeritBonus: fixedSignInBonus,
        lastClaimDate: null,
      };
    },
  } as never, {} as never, {} as never, {} as never);
  await service.activateMeritMonthCard('player:month-card-batch', 123456, 3);
  await service.activateEternalMonthCard('player:eternal-batch', 654321, 2);
  assert.deepEqual(activationCalls, [{
    playerId: 'player:month-card-batch',
    nowMs: 123456,
    poolGrant: MERIT_MONTH_CARD_POOL_GRANT * 3,
  }]);
  assert.deepEqual(eternalActivationCalls, [{
    playerId: 'player:eternal-batch',
    nowMs: 654321,
    poolGrant: MERIT_ETERNAL_POOL_GRANT * 2,
    fixedSignInBonus: MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS * 2,
  }]);
  await verifyWorldUseItemEternalDispatch();
  await verifyDurableActivityRuntimeSettlement();
  await verifyActivityGatewayErrorNormalization();

  console.log(JSON.stringify({
    ok: true,
    case: 'month-card-pool',
    tenCardsDailyReward: calculateMonthCardDailyReward({ totalPoolMerit: pool, remainingPoolMerit: pool }),
    renewedPoolDailyReward: calculateMonthCardDailyReward({ totalPoolMerit: renewedPool, remainingPoolMerit: renewedPool }),
    batchUseDailyReward: calculateMonthCardDailyReward({ totalPoolMerit: batchPool, remainingPoolMerit: batchPool }),
  }, null, 2));
}

async function verifyActivityGatewayErrorNormalization(): Promise<void> {
  const emittedErrors: Array<{ code: string; message: string }> = [];
  const helper = new WorldGatewayActivityHelper(
    { requireActivePlayerId: () => 'player:activity-error' } as never,
    {} as never,
    {
      getStatus: async () => {
        throw new Error('connect ECONNREFUSED internal-activity-db:5432');
      },
    } as never,
    {
      emitGatewayError: (_client: unknown, code: string, error: unknown) => {
        emittedErrors.push({
          code,
          message: error instanceof Error ? error.message : String(error),
        });
      },
    } as never,
    {} as never,
  );
  await helper.handleRequestActivityStatus({} as never, undefined);
  assert.deepEqual(emittedErrors, [{
    code: 'REQUEST_ACTIVITY_STATUS_FAILED',
    message: '活动服务暂不可用，请稍后重试',
  }]);
}

async function verifyDurableActivityRuntimeSettlement(): Promise<void> {
  const player = {
    playerId: 'player:activity-durable',
    runtimeOwnerId: 'runtime:activity-durable',
    sessionEpoch: 4,
    instanceId: null,
    inventory: {
      items: [{
        itemInstanceId: '1f5148ab-6f20-4d0b-973d-4d2be77ed94f',
        itemId: 'merit_eternal',
        count: 2,
      }],
      revision: 0,
    },
  };
  let releaseCommit: (() => void) | null = null;
  let rejectCommit: ((error: Error) => void) | null = null;
  const durableCalls: Array<Record<string, unknown>> = [];
  const playerRuntime = {
    playerDomainPersistenceService: {
      isEnabled: () => true,
      loadPlayerPresence: async () => ({ runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: 3 }),
      savePlayerPresence: async () => undefined,
    },
    runExclusiveAssetMutation: async (_ids: string[], action: () => Promise<unknown>) => action(),
    getPlayerOrThrow: () => player,
    peekInventoryItemByInstanceId: () => player.inventory.items[0] ?? null,
    describePersistencePresence: () => ({ runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: player.sessionEpoch }),
    getSessionFence: () => ({ runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: player.sessionEpoch }),
    replaceInventoryItems: (_playerId: string, items: typeof player.inventory.items) => {
      player.inventory.items = items.map((entry) => ({ ...entry }));
    },
  };
  const durable = {
    isEnabled: () => true,
    grantInventoryItems: async (input: Record<string, unknown>) => {
      durableCalls.push(input);
      await new Promise<void>((resolve, reject) => {
        releaseCommit = resolve;
        rejectCommit = reject;
      });
      return { ok: true, alreadyCommitted: false };
    },
  };
  const service = new ActivityRuntimeService(
    {} as never,
    playerRuntime as never,
    durable as never,
    {} as never,
  );
  const firstUse = service.activateEternalMonthCardFromInventoryItem(
    player.playerId,
    player.inventory.items[0]!.itemInstanceId,
    player.inventory.items[0]!,
    1,
    123456,
  );
  await waitFor(() => durableCalls.length === 1);
  assert.equal(player.inventory.items[0]?.count, 2, 'COMMIT 前不得提前扣除永恒');
  releaseCommit?.();
  await firstUse;
  assert.equal(player.inventory.items[0]?.count, 1);
  assert.ok(service.getCachedHeavenlyDaoShopDiscountPercent(player.playerId) > 0);
  assert.equal(durableCalls[0]?.sourceType, 'activity_eternal_activation');

  const failedUse = service.activateEternalMonthCardFromInventoryItem(
    player.playerId,
    player.inventory.items[0]!.itemInstanceId,
    player.inventory.items[0]!,
    1,
    123457,
  );
  await waitFor(() => durableCalls.length === 2);
  rejectCommit?.(new Error('database unavailable'));
  await assert.rejects(failedUse, /database unavailable/);
  assert.equal(player.inventory.items[0]?.count, 1, '事务失败不得扣除永恒');
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('等待 activity durable 调用超时');
}

async function verifyWorldUseItemEternalDispatch(): Promise<void> {
  const item = {
    itemInstanceId: 'inv:eternal:1',
    itemId: 'merit_eternal',
    name: '永恒',
    type: 'consumable',
    count: 3,
    allowBatchUse: true,
    useBehavior: MERIT_ETERNAL_USE_BEHAVIOR,
  };
  const activated: Array<{ playerId: string; count: number }> = [];
  const notices: Array<{ playerId: string; text: string; kind: string; structured: unknown }> = [];
  const refreshedQuestPlayerIds: string[] = [];
  const useItemService = new WorldRuntimeUseItemService(
    { normalizeItem: (source: unknown) => source },
    {},
    {
      peekInventoryItemByInstanceId: (playerId: string, itemInstanceId: string) => {
        assert.equal(playerId, 'player:eternal-use');
        assert.equal(itemInstanceId, item.itemInstanceId);
        return item;
      },
    },
    {
      activateEternalMonthCardFromInventoryItem: async (
        playerId: string,
        itemInstanceId: string,
        _item: unknown,
        count: number,
      ) => {
        assert.equal(itemInstanceId, item.itemInstanceId);
        activated.push({ playerId, count });
      },
    } as never,
  );
  await useItemService.dispatchUseItem('player:eternal-use', item.itemInstanceId, {
    refreshQuestStates: (playerId: string) => {
      refreshedQuestPlayerIds.push(playerId);
    },
    queuePlayerNotice: (playerId: string, text: string, kind: string, _a?: unknown, _b?: unknown, structured?: unknown) => {
      notices.push({ playerId, text, kind, structured });
    },
  }, { count: 2 });

  assert.deepEqual(activated, [{ playerId: 'player:eternal-use', count: 2 }]);
  assert.deepEqual(refreshedQuestPlayerIds, ['player:eternal-use']);
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.kind, 'success');
  assert.equal((notices[0]?.structured as { key?: string; vars?: Record<string, unknown> } | undefined)?.key, 'notice.activity.eternal-activated');
  assert.deepEqual((notices[0]?.structured as { vars?: Record<string, unknown> } | undefined)?.vars, {
    itemName: '永恒',
    count: 2,
    merit: MERIT_ETERNAL_POOL_GRANT * 2,
    dailySignInFixedMerit: MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS * 2,
  });
}

void main();
