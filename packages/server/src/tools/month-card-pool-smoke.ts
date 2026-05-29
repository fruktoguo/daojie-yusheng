import assert from 'node:assert/strict';

import { MERIT_MONTH_CARD_POOL_GRANT } from '@mud/shared';
import { calculateMonthCardDailyReward, calculateMonthCardNextPool } from '../persistence/activity-persistence.service';
import { ActivityRuntimeService } from '../runtime/activity/activity-runtime.service';
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

  const activationCalls: Array<{ playerId: string; nowMs: number; poolGrant: number }> = [];
  const service = new ActivityRuntimeService({
    activateMonthCard: async (playerId: string, nowMs: number, poolGrant: number) => {
      activationCalls.push({ playerId, nowMs, poolGrant });
      return {
        playerId,
        startAt: nowMs,
        expireAt: nowMs,
        totalPoolMerit: poolGrant,
        remainingPoolMerit: poolGrant,
        lastClaimDate: null,
      };
    },
  } as never, {} as never);
  await service.activateMeritMonthCard('player:month-card-batch', 123456, 3);
  assert.deepEqual(activationCalls, [{
    playerId: 'player:month-card-batch',
    nowMs: 123456,
    poolGrant: MERIT_MONTH_CARD_POOL_GRANT * 3,
  }]);

  console.log(JSON.stringify({
    ok: true,
    case: 'month-card-pool',
    tenCardsDailyReward: calculateMonthCardDailyReward({ totalPoolMerit: pool, remainingPoolMerit: pool }),
    renewedPoolDailyReward: calculateMonthCardDailyReward({ totalPoolMerit: renewedPool, remainingPoolMerit: renewedPool }),
    batchUseDailyReward: calculateMonthCardDailyReward({ totalPoolMerit: batchPool, remainingPoolMerit: batchPool }),
  }, null, 2));
}

void main();
