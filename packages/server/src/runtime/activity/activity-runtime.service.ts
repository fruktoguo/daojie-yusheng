/**
 * 活动中心运行时服务。
 *
 * 负责把低频活动持久化状态投影为玩家视图，并执行领取奖励的在线资产变更。
 */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  BASE_OFFLINE_MAX_HOURS,
  DAILY_SIGN_IN_REWARD_MERIT,
  MERIT_ITEM_ID,
  MERIT_MONTH_CARD_DURATION_DAYS,
  MERIT_MONTH_CARD_ITEM_ID,
  MERIT_MONTH_CARD_OFFLINE_MAX_HOURS,
  type ActivityStatusView,
} from '@mud/shared';
import { ActivityPersistenceService, calculateMonthCardDailyReward } from '../../persistence/activity-persistence.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ActivityRuntimeService {
  constructor(
    @Inject(ActivityPersistenceService) private readonly activityPersistenceService: ActivityPersistenceService,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeService,
  ) {}

  async getStatus(playerId: string, nowMs = Date.now()): Promise<ActivityStatusView> {
    const today = getChinaDateKey(nowMs);
    const [monthCard, dailySignIn] = await Promise.all([
      this.activityPersistenceService.loadMonthCard(playerId),
      this.activityPersistenceService.loadDailySignIn(playerId),
    ]);
    const inventory = this.resolveMonthCardInventory(playerId);
    const active = Boolean(monthCard && monthCard.expireAt > nowMs && monthCard.remainingPoolMerit > 0);
    const dailyRewardMerit = monthCard && active ? calculateMonthCardDailyReward(monthCard) : 0;
    const monthCardCanClaim = active && dailyRewardMerit > 0 && monthCard?.lastClaimDate !== today;
    const dailyCanClaim = dailySignIn?.lastClaimDate !== today;
    return {
      serverNow: nowMs,
      monthCard: {
        active,
        startAt: monthCard?.startAt ?? null,
        expireAt: monthCard?.expireAt ?? null,
        remainingDays: active && monthCard ? Math.max(1, Math.ceil((monthCard.expireAt - nowMs) / DAY_MS)) : 0,
        dailyRewardMerit,
        poolTotalMerit: monthCard?.totalPoolMerit ?? 0,
        poolRemainingMerit: monthCard?.remainingPoolMerit ?? 0,
        claimWindowDays: MERIT_MONTH_CARD_DURATION_DAYS,
        offlineMaxHours: active ? MERIT_MONTH_CARD_OFFLINE_MAX_HOURS : BASE_OFFLINE_MAX_HOURS,
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
        rewardMerit: DAILY_SIGN_IN_REWARD_MERIT,
      },
      hasRedDot: monthCardCanClaim || dailyCanClaim || inventory.itemCount > 0,
    };
  }

  async activateMeritMonthCard(playerId: string, nowMs = Date.now()) {
    return this.activityPersistenceService.activateMonthCard(playerId, nowMs);
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
    await this.activityPersistenceService.claimDailySignIn(playerId, today, {
      itemId: MERIT_ITEM_ID,
      count: DAILY_SIGN_IN_REWARD_MERIT,
    });
    this.grantMerit(playerId, DAILY_SIGN_IN_REWARD_MERIT);
  }

  async listActiveMonthCardPlayerIds(nowMs = Date.now()): Promise<string[]> {
    return this.activityPersistenceService.listActiveMonthCardPlayerIds(nowMs);
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
