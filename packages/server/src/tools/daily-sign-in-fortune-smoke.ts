import assert from 'node:assert/strict';

import { buildDailySignInFortune, buildDailySignInRewardPreview } from '../runtime/activity/activity-runtime.service';
import { resolvePlayerDailySignInFortuneLuck, resolvePlayerEffectiveLuck } from '../runtime/player/player-special-stat.helpers';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const day0 = buildDailySignInRewardPreview(40, 0, 0);
  const day1 = buildDailySignInRewardPreview(40, 0, 1);
  const day100 = buildDailySignInRewardPreview(40, 0, 100);
  assert.equal(day0.baseRandomMaxMerit, 80);
  assert.equal(day0.randomMaxMerit, 800);
  assert.equal(day0.targetRandomMeanMerit, 60.25);
  assert.equal(Math.round(day1.targetRandomMeanMerit * 100) / 100, 60.35);
  assert.equal(Math.round(day100.targetRandomMeanMerit * 100) / 100, 66.83);
  assert.ok(day100.targetRandomMeanMerit < 80);

  assert.deepEqual(buildDailySignInFortune(1, day0), {
    tier: 'very_bad',
    ratioPercent: 0,
    luckDelta: -10,
    randomMerit: 1,
    baseRandomMaxMerit: 80,
    randomMaxMerit: 800,
  });
  assert.equal(buildDailySignInFortune(80, day0).tier, 'great');
  assert.equal(buildDailySignInFortune(80, day0).luckDelta, 20);
  assert.equal(buildDailySignInFortune(81, day0).tier, 'transcendent_1');
  assert.equal(buildDailySignInFortune(240, day0).tier, 'transcendent_2');
  assert.equal(buildDailySignInFortune(420, day0).tier, 'transcendent_3');
  assert.equal(buildDailySignInFortune(799, day0).tier, 'transcendent_4');
  assert.equal(buildDailySignInFortune(799, day0).luckDelta, 202);
  assert.equal(buildDailySignInFortune(800, day0).tier, 'perfect');
  assert.equal(buildDailySignInFortune(800, day0).luckDelta, 666);
  const futureExpireAt = Date.now() + 60_000;
  const pastExpireAt = Date.now() - 60_000;
  assert.equal(resolvePlayerEffectiveLuck({ luck: 20, dailySignInFortuneLuck: -10, dailySignInFortuneExpireAt: futureExpireAt }), 10);
  assert.equal(resolvePlayerEffectiveLuck({ luck: 0, dailySignInFortuneLuck: -10, dailySignInFortuneExpireAt: futureExpireAt }), 0);
  assert.equal(resolvePlayerEffectiveLuck({ luck: 20, dailySignInFortuneLuck: -10, dailySignInFortuneExpireAt: pastExpireAt }), 20);
  assert.equal(resolvePlayerDailySignInFortuneLuck({ dailySignInFortuneLuck: 666, dailySignInFortuneExpireAt: 2000 }, 1000), 666);
  assert.equal(resolvePlayerDailySignInFortuneLuck({ dailySignInFortuneLuck: 666, dailySignInFortuneExpireAt: 1000 }, 1000), 0);

  // 验证 24 小时气运持续时间与次日 0 点可签到
  const signAt = Date.parse('2026-09-03T18:00:00.000+08:00');
  const fortuneExpireAt24h = signAt + 24 * 60 * 60 * 1000;
  // 1) 跨过次日 0 点（2026-09-04 00:05:00），气运依然生效（距签到仅 6 小时 5 分钟）
  const nextDay0Clock = Date.parse('2026-09-04T00:05:00.000+08:00');
  assert.equal(
    resolvePlayerDailySignInFortuneLuck({ dailySignInFortuneLuck: 20, dailySignInFortuneExpireAt: fortuneExpireAt24h }, nextDay0Clock),
    20,
    '跨过次日0点后，24小时未满时签到气运增幅应依然有效',
  );
  // 2) 满 24 小时后（2026-09-04 18:00:01），气运自然失效
  const after24Hours = fortuneExpireAt24h + 1000;
  assert.equal(
    resolvePlayerDailySignInFortuneLuck({ dailySignInFortuneLuck: 20, dailySignInFortuneExpireAt: fortuneExpireAt24h }, after24Hours),
    0,
    '满24小时后签到气运增幅应自然过期归零',
  );

  // 3) 验证 ActivityRuntimeService 在不同时间点的 getStatus 行为
  const mockFortunePayload = {
    itemId: 'merit',
    count: 100,
    fortune: {
      tier: 'good' as const,
      ratioPercent: 66,
      luckDelta: 15,
      randomMerit: 100,
      baseRandomMaxMerit: 80,
      randomMaxMerit: 800,
    },
  };

  let playerFortuneLuck = 0;
  let playerFortuneExpireAt = 0;
  const mockPlayerRuntimeService = {
    getPlayer: () => ({ realm: { realmLv: 1 } }),
    getPlayerOrThrow: () => ({ realm: { realmLv: 1 } }),
    setDailySignInFortuneLuck: (_playerId: string, luckDelta: number, expireAtMs: number) => {
      playerFortuneLuck = luckDelta;
      playerFortuneExpireAt = expireAtMs;
    },
  };

  // 场景 A：2026-09-03 18:00 签到，当天 20:00 查询
  const timeDay1Night = Date.parse('2026-09-03T20:00:00.000+08:00');
  const mockPersistenceDay1 = {
    isEnabled: () => false,
    loadMonthCard: async () => null,
    loadDailySignIn: async () => ({
      playerId: 'p_test',
      lastClaimDate: '2026-09-03',
      streakDays: 1,
      totalDays: 1,
      lastRewardMerit: 100,
      lastRewardPayload: mockFortunePayload,
      lastClaimedAtMs: signAt,
      fortuneExpireAtMs: fortuneExpireAt24h,
    }),
    loadInvitationStatus: async () => ({
      totalInvitees: 0,
      registeredRewardedCount: 0,
      qiReachedCount: 0,
      foundationReachedCount: 0,
    }),
    processInvitationRewards: async () => false,
    processInvitationJadeRewardMails: async () => false,
  };

  const { ActivityRuntimeService } = require('../runtime/activity/activity-runtime.service');
  const serviceDay1 = new ActivityRuntimeService(
    mockPersistenceDay1,
    mockPlayerRuntimeService,
    { isEnabled: () => true },
    { isEnabled: () => false },
  );

  const statusDay1 = await serviceDay1.getStatus('p_test', timeDay1Night);
  assert.equal(statusDay1.dailySignIn.canClaimToday, false, '当天已签到，不可再次签到');
  assert.ok(statusDay1.dailySignIn.lastFortune !== null, '签到气运应当存在');
  assert.equal(statusDay1.dailySignIn.lastFortune?.luckDelta, 15);
  assert.equal(statusDay1.dailySignIn.fortuneExpireAt, fortuneExpireAt24h, '气运过期时间应为24小时后');
  assert.equal(playerFortuneLuck, 15, '玩家身上的气运幸运值应被同步');
  assert.equal(playerFortuneExpireAt, fortuneExpireAt24h, '玩家身上的气运过期时间应被同步');

  // 场景 B：次日凌晨（2026-09-04 00:05:00），距签到仅 6 小时 5 分钟
  const serviceDay2Morning = new ActivityRuntimeService(
    mockPersistenceDay1,
    mockPlayerRuntimeService,
    { isEnabled: () => true },
    { isEnabled: () => false },
  );
  const statusDay2Morning = await serviceDay2Morning.getStatus('p_test', nextDay0Clock);
  assert.equal(statusDay2Morning.dailySignIn.canClaimToday, true, '每天0点后可以签到这点不改');
  assert.ok(statusDay2Morning.dailySignIn.lastFortune !== null, '次日0点后，因未满24小时，气运依然有效');
  assert.equal(statusDay2Morning.dailySignIn.lastFortune?.luckDelta, 15);
  assert.equal(statusDay2Morning.dailySignIn.fortuneExpireAt, fortuneExpireAt24h);
  assert.equal(playerFortuneLuck, 15, '次日0点后气运依然生效');

  // 场景 C：满 24 小时后（2026-09-04 18:05:00）
  const statusAfter24h = await serviceDay2Morning.getStatus('p_test', after24Hours);
  assert.equal(statusAfter24h.dailySignIn.canClaimToday, true);
  assert.equal(statusAfter24h.dailySignIn.lastFortune, null, '满24小时后气运应失效');
  assert.equal(statusAfter24h.dailySignIn.fortuneExpireAt, null);
  assert.equal(playerFortuneLuck, 0, '满24小时后玩家身上的幸运应清零');

  // 场景 D：旧数据兼容升级（更新前已有气运，无 fortuneExpireAtMs）
  let savedMigratedExpireAt = 0;
  const mockPersistenceLegacy = {
    isEnabled: () => false,
    loadMonthCard: async () => null,
    loadDailySignIn: async () => ({
      playerId: 'p_legacy',
      lastClaimDate: '2026-09-03',
      streakDays: 5,
      totalDays: 20,
      lastRewardMerit: 80,
      lastRewardPayload: mockFortunePayload,
      lastClaimedAtMs: null,
      fortuneExpireAtMs: timeDay1Night + 24 * 60 * 60 * 1000, // 经 loadDailySignIn 迁移后已自动设为 24 小时
    }),
    loadInvitationStatus: async () => ({
      totalInvitees: 0,
      registeredRewardedCount: 0,
      qiReachedCount: 0,
      foundationReachedCount: 0,
    }),
  };
  const serviceLegacy = new ActivityRuntimeService(
    mockPersistenceLegacy,
    mockPlayerRuntimeService,
    { isEnabled: () => true },
    { isEnabled: () => false },
  );
  const statusLegacy = await serviceLegacy.getStatus('p_legacy', timeDay1Night);
  assert.ok(statusLegacy.dailySignIn.lastFortune !== null, '历史气运经升级后应当有效');
  assert.equal(statusLegacy.dailySignIn.fortuneExpireAt, timeDay1Night + 24 * 60 * 60 * 1000, '对于原先已有的气运，更新后自动设为24小时');
  assert.equal(playerFortuneLuck, 15);

  process.stdout.write(JSON.stringify({
    ok: true,
    case: 'daily-sign-in-fortune',
    baseMean: day0.targetRandomMeanMerit,
    firstClaimMean: day1.targetRandomMeanMerit,
    day100Mean: day100.targetRandomMeanMerit,
    perfectLuckDelta: buildDailySignInFortune(800, day0).luckDelta,
    fortuneDurationHours: 24,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
