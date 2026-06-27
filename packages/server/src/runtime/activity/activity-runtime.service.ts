/**
 * 活动中心运行时服务。
 *
 * 负责把低频活动持久化状态投影为玩家视图，并执行领取奖励的在线资产变更。
 */
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  BASE_OFFLINE_MAX_HOURS,
  DAILY_SIGN_IN_RANDOM_BASE_MAX_MERIT,
  DAILY_SIGN_IN_RANDOM_MIN_MERIT,
  HEAVENLY_DAO_SHOP_ETERNAL_DISCOUNT_PERCENT,
  INVITATION_FOUNDATION_REALM_MIN_LEVEL,
  INVITATION_INVITEE_MERIT_REWARD,
  INVITATION_INVITEE_SPIRIT_STONE_REWARD,
  INVITATION_INVITER_BASE_MERIT_REWARD,
  INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
  INVITATION_INVITER_QI_REALM_MERIT_REWARD,
  INVITATION_QI_REALM_MIN_LEVEL,
  MERIT_ITEM_ID,
  MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
  MERIT_ETERNAL_POOL_GRANT,
  MERIT_MONTH_CARD_DURATION_DAYS,
  MERIT_MONTH_CARD_ITEM_ID,
  MERIT_MONTH_CARD_OFFLINE_MAX_HOURS,
  MERIT_MONTH_CARD_POOL_GRANT,
  SPIRIT_STONE_ITEM_ID,
  type ActivityStatusView,
  type InvitationStatusView,
} from '@mud/shared';
import { ActivityPersistenceService, calculateMonthCardDailyReward } from '../../persistence/activity-persistence.service';
import { PlayerCountersPersistenceService } from '../../persistence/player-counters-persistence.service';
import { NativePlayerAuthStoreService } from '../../http/native/native-player-auth-store.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { rollExpandedMeanInteger } from '../random/bounded-random';

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_SIGN_IN_RANDOM_MAX_MULTIPLIER = 10;

interface DailySignInRewardPreview {
  randomMinMerit: number;
  randomMaxMerit: number;
  baseRandomMaxMerit: number;
  targetRandomMeanMerit: number;
  fixedMerit: number;
}

function buildDailySignInRewardPreview(historicalMaxRealmLv: number, fixedMerit: number): DailySignInRewardPreview {
  const normalizedHistoricalMaxRealmLv = Math.max(0, Math.trunc(Number(historicalMaxRealmLv) || 0));
  const randomMinMerit = DAILY_SIGN_IN_RANDOM_MIN_MERIT;
  const baseRandomMaxMerit = Math.max(randomMinMerit, DAILY_SIGN_IN_RANDOM_BASE_MAX_MERIT + normalizedHistoricalMaxRealmLv);
  const randomMaxMerit = Math.max(randomMinMerit, baseRandomMaxMerit * DAILY_SIGN_IN_RANDOM_MAX_MULTIPLIER);
  return {
    randomMinMerit,
    randomMaxMerit,
    baseRandomMaxMerit,
    targetRandomMeanMerit: (randomMinMerit + baseRandomMaxMerit) / 2,
    fixedMerit: Math.max(0, Math.trunc(Number(fixedMerit) || 0)),
  };
}

function rollDailySignInReward(preview: DailySignInRewardPreview): { randomMerit: number; fixedMerit: number; totalMerit: number } {
  const randomMerit = rollExpandedMeanInteger({
    min: preview.randomMinMerit,
    max: preview.randomMaxMerit,
    targetMean: preview.targetRandomMeanMerit,
  });
  const fixedMerit = Math.max(0, Math.trunc(Number(preview.fixedMerit) || 0));
  return {
    randomMerit,
    fixedMerit,
    totalMerit: randomMerit + fixedMerit,
  };
}

@Injectable()
export class ActivityRuntimeService {
  private readonly eternalBenefitPlayerIds = new Set<string>();

  constructor(
    @Inject(ActivityPersistenceService) private readonly activityPersistenceService: ActivityPersistenceService,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeService,
    @Optional()
    @Inject(PlayerCountersPersistenceService)
    private readonly playerCountersPersistenceService: PlayerCountersPersistenceService | null = null,
    @Optional()
    @Inject(NativePlayerAuthStoreService)
    private readonly authStore: NativePlayerAuthStoreService | null = null,
  ) {}

  async getStatus(playerId: string, nowMs = Date.now()): Promise<ActivityStatusView> {
    const today = getChinaDateKey(nowMs);
    const invitationHasPendingReward = await this.processInvitationRewards(playerId);
    const [monthCard, dailySignIn, invitation] = await Promise.all([
      this.activityPersistenceService.loadMonthCard(playerId),
      this.activityPersistenceService.loadDailySignIn(playerId),
      this.buildInvitationStatus(playerId),
    ]);
    const inventory = this.resolveMonthCardInventory(playerId);
    const eternal = monthCard?.eternalEnabled === true;
    const monthCardRewardActive = Boolean(monthCard && (eternal || monthCard.expireAt > nowMs) && monthCard.remainingPoolMerit > 0);
    const monthCardBenefitActive = Boolean(eternal || monthCardRewardActive);
    this.setCachedEternalBenefit(playerId, eternal);
    const dailyRewardMerit = monthCard && monthCardRewardActive ? calculateMonthCardDailyReward(monthCard) : 0;
    const monthCardCanClaim = monthCardRewardActive && dailyRewardMerit > 0 && monthCard?.lastClaimDate !== today;
    const dailyCanClaim = dailySignIn?.lastClaimDate !== today;
    const dailySignInRewardPreview = buildDailySignInRewardPreview(
      this.resolveHighestRealmLv(playerId),
      monthCard?.dailySignInFixedMeritBonus ?? 0,
    );
    return {
      serverNow: nowMs,
      monthCard: {
        active: monthCardBenefitActive,
        startAt: monthCard?.startAt ?? null,
        expireAt: monthCard?.expireAt ?? null,
        remainingDays: !eternal && monthCardRewardActive && monthCard ? Math.max(1, Math.ceil((monthCard.expireAt - nowMs) / DAY_MS)) : 0,
        dailyRewardMerit,
        poolTotalMerit: monthCard?.totalPoolMerit ?? 0,
        poolRemainingMerit: monthCard?.remainingPoolMerit ?? 0,
        claimWindowDays: MERIT_MONTH_CARD_DURATION_DAYS,
        eternal,
        heavenlyDaoShopDiscountPercent: eternal ? HEAVENLY_DAO_SHOP_ETERNAL_DISCOUNT_PERCENT : 0,
        dailySignInFixedMeritBonus: dailySignInRewardPreview.fixedMerit,
        offlineMaxHours: eternal ? null : monthCardBenefitActive ? MERIT_MONTH_CARD_OFFLINE_MAX_HOURS : BASE_OFFLINE_MAX_HOURS,
        canClaimToday: monthCardCanClaim,
        lastClaimDate: monthCard?.lastClaimDate ?? null,
        today,
        itemCount: inventory.itemCount,
        firstItemInstanceId: inventory.firstItemInstanceId,
      },
      dailySignIn: {
        canClaimToday: dailyCanClaim,
        lastClaimDate: dailySignIn?.lastClaimDate ?? null,
        streakDays: dailySignIn?.streakDays ?? 0,
        totalDays: dailySignIn?.totalDays ?? 0,
        today,
        rewardPreview: {
          randomMinMerit: dailySignInRewardPreview.randomMinMerit,
          randomMaxMerit: dailySignInRewardPreview.randomMaxMerit,
          expectedRandomMerit: dailySignInRewardPreview.targetRandomMeanMerit,
          fixedMerit: dailySignInRewardPreview.fixedMerit,
        },
        lastRewardMerit: dailySignIn?.lastRewardMerit ?? null,
      },
      invitation,
      hasRedDot: monthCardCanClaim || dailyCanClaim || invitationHasPendingReward,
    };
  }

  async activateMeritMonthCard(playerId: string, nowMs = Date.now(), count = 1) {
    const normalizedCount = Math.max(1, Math.trunc(Number(count) || 1));
    return this.activityPersistenceService.activateMonthCard(playerId, nowMs, normalizedCount * MERIT_MONTH_CARD_POOL_GRANT);
  }

  async activateEternalMonthCard(playerId: string, nowMs = Date.now(), count = 1) {
    const normalizedCount = Math.max(1, Math.trunc(Number(count) || 1));
    const record = await this.activityPersistenceService.activateEternalMonthCard(
      playerId,
      nowMs,
      normalizedCount * MERIT_ETERNAL_POOL_GRANT,
      normalizedCount * MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
    );
    this.setCachedEternalBenefit(playerId, true);
    return record;
  }

  async claimMeritMonthCard(playerId: string, nowMs = Date.now()): Promise<void> {
    this.playerRuntimeService.getPlayerOrThrow(playerId);
    const today = getChinaDateKey(nowMs);
    const claim = await this.activityPersistenceService.claimMonthCard(playerId, today, nowMs);
    this.grantMerit(playerId, claim.rewardMerit);
  }

  async claimDailySignIn(playerId: string, nowMs = Date.now()): Promise<void> {
    this.playerRuntimeService.getPlayerOrThrow(playerId);
    const today = getChinaDateKey(nowMs);
    const monthCard = await this.activityPersistenceService.loadMonthCard(playerId);
    const historicalMaxRealmLv = this.resolveHighestRealmLv(playerId);
    const rewardPreview = buildDailySignInRewardPreview(
      historicalMaxRealmLv,
      monthCard?.dailySignInFixedMeritBonus ?? 0,
    );
    const reward = rollDailySignInReward(rewardPreview);
    await this.activityPersistenceService.claimDailySignIn(playerId, today, {
      itemId: MERIT_ITEM_ID,
      count: reward.totalMerit,
      randomMerit: reward.randomMerit,
      fixedMerit: reward.fixedMerit,
      randomMinMerit: rewardPreview.randomMinMerit,
      randomMaxMerit: rewardPreview.randomMaxMerit,
      historicalMaxRealmLv,
    });
    this.grantMerit(playerId, reward.totalMerit);
  }

  async listActiveMonthCardPlayerIds(nowMs = Date.now()): Promise<string[]> {
    return this.activityPersistenceService.listActiveMonthCardPlayerIds(nowMs);
  }

  async listEternalMonthCardPlayerIds(): Promise<string[]> {
    return this.activityPersistenceService.listEternalMonthCardPlayerIds();
  }

  async getHeavenlyDaoShopDiscountPercent(playerId: string): Promise<number> {
    const monthCard = await this.activityPersistenceService.loadMonthCard(playerId);
    const eternal = monthCard?.eternalEnabled === true;
    this.setCachedEternalBenefit(playerId, eternal);
    return eternal ? HEAVENLY_DAO_SHOP_ETERNAL_DISCOUNT_PERCENT : 0;
  }

  getCachedHeavenlyDaoShopDiscountPercent(playerId: string): number {
    return this.eternalBenefitPlayerIds.has(playerId) ? HEAVENLY_DAO_SHOP_ETERNAL_DISCOUNT_PERCENT : 0;
  }

  getOfflineMaxHoursForPlayer(playerId: string, activeMonthCardPlayerIds: ReadonlySet<string>): number {
    return activeMonthCardPlayerIds.has(playerId) ? MERIT_MONTH_CARD_OFFLINE_MAX_HOURS : BASE_OFFLINE_MAX_HOURS;
  }

  private grantMerit(playerId: string, count: number): void {
    this.playerRuntimeService.getPlayerOrThrow(playerId);
    this.playerRuntimeService.receiveInventoryItem(playerId, {
      itemId: MERIT_ITEM_ID,
      name: '功德',
      type: 'consumable',
      count: Math.max(1, Math.trunc(count)),
    });
  }

  private grantInvitationRewards(playerId: string, rewards: { inviteeSpiritStone: number; inviteeMerit: number; inviterMerit: number }): void {
    if (rewards.inviteeSpiritStone > 0) {
      this.playerRuntimeService.grantItem(playerId, SPIRIT_STONE_ITEM_ID, rewards.inviteeSpiritStone);
    }
    if (rewards.inviteeMerit > 0) {
      this.grantMerit(playerId, rewards.inviteeMerit);
    }
    if (rewards.inviterMerit > 0) {
      this.grantMerit(playerId, rewards.inviterMerit);
    }
  }

  private async processInvitationRewards(playerId: string): Promise<boolean> {
    if (!this.activityPersistenceService.isEnabled()) {
      return false;
    }
    this.playerRuntimeService.getPlayerOrThrow(playerId);
    await this.refreshInvitationProgress(playerId);
    const hasPendingReward = await this.activityPersistenceService.hasPendingInvitationRewards(playerId);
    const rewards = await this.activityPersistenceService.claimPendingInvitationRewards(playerId);
    this.grantInvitationRewards(playerId, rewards);
    return hasPendingReward;
  }

  private async refreshInvitationProgress(playerId: string): Promise<void> {
    const selfHighest = this.resolveHighestRealmLv(playerId);
    await this.activityPersistenceService.updateInvitationInviteeHighestRealmLv(playerId, selfHighest);
    const invitees = await this.activityPersistenceService.listInvitationInviteeProgress(playerId);
    for (const invitee of invitees) {
      const highest = Math.max(invitee.highestRealmLv, this.resolveHighestRealmLv(invitee.inviteePlayerId));
      if (highest > invitee.highestRealmLv) {
        await this.activityPersistenceService.updateInvitationInviteeHighestRealmLv(invitee.inviteePlayerId, highest);
      }
    }
  }

  private resolveHighestRealmLv(playerId: string): number {
    const player = this.playerRuntimeService.getPlayer(playerId);
    const currentRealmLv = Math.max(1, Math.trunc(Number(player?.realm?.realmLv) || 1));
    const counterRealmLv = this.playerCountersPersistenceService?.get?.(playerId, 'highestRealmLv') ?? 0;
    return Math.max(currentRealmLv, Math.trunc(Number(counterRealmLv) || 0), 1);
  }

  private async buildInvitationStatus(playerId: string): Promise<InvitationStatusView> {
    const user = this.authStore?.getMemoryUserByPlayerId(playerId) ?? null;
    const inviteCode = user?.inviteCode ?? '';
    const invitePath = inviteCode ? `/?invite=${encodeURIComponent(inviteCode)}` : '';
    const stats = await this.activityPersistenceService.loadInvitationStatus(playerId);
    return {
      inviteCode,
      invitePath,
      totalInvitees: stats.totalInvitees,
      registeredRewardedCount: stats.registeredRewardedCount,
      qiReachedCount: stats.qiReachedCount,
      foundationReachedCount: stats.foundationReachedCount,
      inviteeReward: {
        spiritStone: INVITATION_INVITEE_SPIRIT_STONE_REWARD,
        merit: INVITATION_INVITEE_MERIT_REWARD,
      },
      stages: [
        {
          key: 'registered',
          label: '注册成功',
          count: stats.totalInvitees,
          rewardMerit: INVITATION_INVITER_BASE_MERIT_REWARD,
        },
        {
          key: 'qi',
          label: `达到练气(${INVITATION_QI_REALM_MIN_LEVEL}级)`,
          count: stats.qiReachedCount,
          rewardMerit: INVITATION_INVITER_QI_REALM_MERIT_REWARD,
        },
        {
          key: 'foundation',
          label: `达到筑基(${INVITATION_FOUNDATION_REALM_MIN_LEVEL}级)`,
          count: stats.foundationReachedCount,
          rewardMerit: INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
        },
      ],
    };
  }

  private resolveMonthCardInventory(playerId: string): { itemCount: number; firstItemInstanceId: string | null } {
    const player = this.playerRuntimeService.getPlayer(playerId);
    if (!player?.inventory?.items) {
      return { itemCount: 0, firstItemInstanceId: null };
    }
    let itemCount = 0;
    let firstItemInstanceId: string | null = null;
    for (const item of player.inventory.items) {
      if (!item || item.itemId !== MERIT_MONTH_CARD_ITEM_ID) {
        continue;
      }
      itemCount += Math.max(1, Math.trunc(Number(item.count ?? 1) || 1));
      if (!firstItemInstanceId && typeof item.itemInstanceId === 'string' && item.itemInstanceId.trim()) {
        firstItemInstanceId = item.itemInstanceId.trim();
      }
    }
    return { itemCount, firstItemInstanceId };
  }

  private setCachedEternalBenefit(playerId: string, enabled: boolean): void {
    if (!playerId) {
      return;
    }
    if (enabled) {
      this.eternalBenefitPlayerIds.add(playerId);
      return;
    }
    this.eternalBenefitPlayerIds.delete(playerId);
  }
}

export function getChinaDateKey(nowMs = Date.now()): string {
  const shifted = new Date(nowMs + CHINA_TIME_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

export function normalizeActivityError(error: unknown): BadRequestException {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'month_card_inactive') {
    return new BadRequestException('功德月卡未激活');
  }
  if (message === 'month_card_already_claimed') {
    return new BadRequestException('今日功德月卡奖励已领取');
  }
  if (message === 'daily_sign_in_already_claimed') {
    return new BadRequestException('今日已签到');
  }
  if (message === 'activity_persistence_unavailable') {
    return new BadRequestException('活动服务暂不可用');
  }
  return new BadRequestException(message || '活动操作失败');
}
