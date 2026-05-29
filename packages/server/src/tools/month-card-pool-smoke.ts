import assert from 'node:assert/strict';

import { MERIT_MONTH_CARD_POOL_GRANT } from '@mud/shared';
import { calculateMonthCardDailyReward, calculateMonthCardNextPool } from '../persistence/activity-persistence.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

function main(): void {
  let pool = 0;
  for (let i = 0; i < 10; i += 1) {
    pool = calculateMonthCardNextPool(pool);
  }
  assert.equal(pool, MERIT_MONTH_CARD_POOL_GRANT * 10);
  assert.equal(calculateMonthCardDailyReward({ totalPoolMerit: pool, remainingPoolMerit: pool }), 1000);

  const renewedPool = calculateMonthCardNextPool(2000);
  assert.equal(renewedPool, 5000);
  assert.equal(calculateMonthCardDailyReward({ totalPoolMerit: renewedPool, remainingPoolMerit: renewedPool }), 166);

  assert.equal(calculateMonthCardDailyReward({ totalPoolMerit: renewedPool, remainingPoolMerit: 20 }), 20);
  assert.equal(calculateMonthCardNextPool(-100), MERIT_MONTH_CARD_POOL_GRANT);

  console.log(JSON.stringify({
    ok: true,
    case: 'month-card-pool',
    tenCardsDailyReward: calculateMonthCardDailyReward({ totalPoolMerit: pool, remainingPoolMerit: pool }),
    renewedPoolDailyReward: calculateMonthCardDailyReward({ totalPoolMerit: renewedPool, remainingPoolMerit: renewedPool }),
  }, null, 2));
}

main();
