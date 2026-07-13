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
  mergeItemStackInto,
  type ActivityStatusView,
  type DailySignInFortuneView,
  type InvitationStatusView,
} from '@mud/shared';
import { randomUUID } from 'node:crypto';
import { ActivityPersistenceService, calculateMonthCardDailyReward, type ActivityDailySignInRecord } from '../../persistence/activity-persistence.service';
import type { DurableActivityAssetSourceMutation } from '../../persistence/activity-asset-durable-persistence';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import { InstanceCatalogService } from '../../persistence/instance-catalog.service';
import { nextPlayerPersistenceVersion } from '../../persistence/player-domain-persistence.service';
import { PlayerCountersPersistenceService } from '../../persistence/player-counters-persistence.service';
import { NativePlayerAuthStoreService } from '../../http/native/native-player-auth-store.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { rollExpandedMeanInteger } from '../random/bounded-random';

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_SIGN_IN_RANDOM_MAX_MULTIPLIER = 10;
const DAILY_SIGN_IN_STREAK_MEAN_BONUS_PER_DAY = 0.01;
const DAILY_SIGN_IN_PERFECT_FORTUNE_LUCK_DELTA = 666;
const MAX_ITEM_COUNT = 2_147_483_647;

interface ActivityRuntimePlayer {
  playerId: string;
  instanceId?: string | null;
  inventory?: {
    items?: Array<Record<string, unknown>>;
  };
}

export interface DailySignInRewardPreview {
  randomMinMerit: number;
  randomMaxMerit: number;
  baseRandomMaxMerit: number;
  targetRandomMeanMerit: number;
  fixedMerit: number;
  effectiveStreakDays: number;
  streakBonusPercent: number;
}

export function buildDailySignInRewardPreview(
  historicalMaxRealmLv: number,
  fixedMerit: number,
  effectiveStreakDays = 0,
): DailySignInRewardPreview {
  const normalizedHistoricalMaxRealmLv = Math.max(0, Math.trunc(Number(historicalMaxRealmLv) || 0));
  const normalizedEffectiveStreakDays = Math.max(0, Math.trunc(Number(effectiveStreakDays) || 0));
  const randomMinMerit = DAILY_SIGN_IN_RANDOM_MIN_MERIT;
  const baseRandomMaxMerit = Math.max(randomMinMerit, DAILY_SIGN_IN_RANDOM_BASE_MAX_MERIT + normalizedHistoricalMaxRealmLv);
  const randomMaxMerit = Math.max(randomMinMerit, baseRandomMaxMerit * DAILY_SIGN_IN_RANDOM_MAX_MULTIPLIER);
  const baseTargetMean = (randomMinMerit + baseRandomMaxMerit) / 2;
  const streakBonus = normalizedEffectiveStreakDays * DAILY_SIGN_IN_STREAK_MEAN_BONUS_PER_DAY;
  const targetRandomMeanMerit = streakBonus > 0
    ? baseTargetMean + (baseRandomMaxMerit - baseTargetMean) * streakBonus / (1 + streakBonus)
    : baseTargetMean;
  return {
    randomMinMerit,
    randomMaxMerit,
    baseRandomMaxMerit,
    targetRandomMeanMerit,
    fixedMerit: Math.max(0, Math.trunc(Number(fixedMerit) || 0)),
    effectiveStreakDays: normalizedEffectiveStreakDays,
    streakBonusPercent: Math.round(streakBonus * 100),
  };
}

function rollDailySignInReward(preview: DailySignInRewardPreview): { randomMerit: number; fixedMerit: number; totalMerit: number; fortune: DailySignInFortuneView } {
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
    fortune: buildDailySignInFortune(randomMerit, preview),
  };
}

export function buildDailySignInFortune(randomMerit: number, preview: DailySignInRewardPreview): DailySignInFortuneView {
  const normalizedRandomMerit = Math.max(preview.randomMinMerit, Math.trunc(Number(randomMerit) || preview.randomMinMerit));
  const baseSpan = Math.max(1, preview.baseRandomMaxMerit - preview.randomMinMerit);
  const ratio = Math.max(0, (normalizedRandomMerit - preview.randomMinMerit) / baseSpan);
  const perfect = normalizedRandomMerit >= preview.randomMaxMerit;
  return {
    tier: perfect ? 'perfect' : resolveDailySignInFortuneTier(ratio),
    ratioPercent: Math.round(ratio * 1000) / 10,
    luckDelta: perfect
      ? DAILY_SIGN_IN_PERFECT_FORTUNE_LUCK_DELTA
      : Math.floor(ratio <= 1 ? ratio * 30 - 10 : ratio * 20),
    randomMerit: normalizedRandomMerit,
    baseRandomMaxMerit: preview.baseRandomMaxMerit,
    randomMaxMerit: preview.randomMaxMerit,
  };
}

function resolveDailySignInFortuneTier(ratio: number): DailySignInFortuneView['tier'] {
  if (ratio > 8) {
    return 'transcendent_4';
  }
  if (ratio > 4) {
    return 'transcendent_3';
  }
  if (ratio > 2) {
    return 'transcendent_2';
  }
  if (ratio > 1) {
    return 'transcendent_1';
  }
  if (ratio >= 0.8) {
    return 'great';
  }
  if (ratio >= 0.6) {
    return 'good';
  }
  if (ratio >= 0.4) {
    return 'neutral';
  }
  if (ratio >= 0.2) {
    return 'bad';
  }
  return 'very_bad';
}

function resolveEffectiveDailySignInStreakDays(dailySignIn: ActivityDailySignInRecord | null | undefined, today: string): number {
  if (!dailySignIn?.lastClaimDate) {
    return 1;
  }
  if (dailySignIn.lastClaimDate === today) {
    return Math.max(1, Math.trunc(Number(dailySignIn.streakDays) || 0));
  }
  return dailySignIn.lastClaimDate === shiftChinaDateKey(today, -1)
    ? Math.max(1, Math.trunc(Number(dailySignIn.streakDays) || 0) + 1)
    : 1;
}

function normalizeDailySignInFortuneView(payload: unknown): DailySignInFortuneView | null {
  const source = payload && typeof payload === 'object'
    ? (payload as { fortune?: Partial<DailySignInFortuneView> }).fortune
    : null;
  if (!source || typeof source !== 'object') {
    return null;
  }
  const tier = normalizeDailySignInFortuneTier(source.tier);
  if (!tier) {
    return null;
  }
  return {
    tier,
    ratioPercent: Math.max(0, Number(source.ratioPercent) || 0),
    luckDelta: Math.trunc(Number(source.luckDelta) || 0),
    randomMerit: Math.max(0, Math.trunc(Number(source.randomMerit) || 0)),
    baseRandomMaxMerit: Math.max(0, Math.trunc(Number(source.baseRandomMaxMerit) || 0)),
    randomMaxMerit: Math.max(0, Math.trunc(Number(source.randomMaxMerit) || 0)),
  };
}

function normalizeDailySignInFortuneTier(value: unknown): DailySignInFortuneView['tier'] | null {
  switch (value) {
    case 'very_bad':
    case 'bad':
    case 'neutral':
    case 'good':
    case 'great':
    case 'transcendent_1':
    case 'transcendent_2':
    case 'transcendent_3':
    case 'transcendent_4':
    case 'perfect':
      return value;
    default:
      return null;
  }
}

@Injectable()
export class ActivityRuntimeService {
  private readonly eternalBenefitPlayerIds = new Set<string>();

  constructor(
    @Inject(ActivityPersistenceService) private readonly activityPersistenceService: ActivityPersistenceService,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeService,
    @Inject(DurableOperationService) private readonly durableOperationService: DurableOperationService,
    @Inject(InstanceCatalogService) private readonly instanceCatalogService: InstanceCatalogService,
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
      resolveEffectiveDailySignInStreakDays(dailySignIn, today),
    );
    const lastFortune = dailySignIn?.lastClaimDate === today
      ? normalizeDailySignInFortuneView(dailySignIn?.lastRewardPayload)
      : null;
    this.syncDailySignInFortuneLuck(playerId, lastFortune, nowMs);
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
          baseRandomMaxMerit: dailySignInRewardPreview.baseRandomMaxMerit,
          expectedRandomMerit: dailySignInRewardPreview.targetRandomMeanMerit,
          fixedMerit: dailySignInRewardPreview.fixedMerit,
          effectiveStreakDays: dailySignInRewardPreview.effectiveStreakDays,
          streakBonusPercent: dailySignInRewardPreview.streakBonusPercent,
        },
        lastRewardMerit: dailySignIn?.lastRewardMerit ?? null,
        lastFortune,
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

  async activateMeritMonthCardFromInventoryItem(
    playerId: string,
    itemInstanceId: string,
    expectedItem: Record<string, unknown>,
    count = 1,
    nowMs = Date.now(),
  ): Promise<void> {
    await this.consumeActivityBenefitItemDurably(
      playerId,
      itemInstanceId,
      expectedItem,
      count,
      nowMs,
      'activate_month_card',
    );
  }

  async activateEternalMonthCardFromInventoryItem(
    playerId: string,
    itemInstanceId: string,
    expectedItem: Record<string, unknown>,
    count = 1,
    nowMs = Date.now(),
  ): Promise<void> {
    await this.consumeActivityBenefitItemDurably(
      playerId,
      itemInstanceId,
      expectedItem,
      count,
      nowMs,
      'activate_eternal',
    );
    this.setCachedEternalBenefit(playerId, true);
  }

  async claimMeritMonthCard(playerId: string, nowMs = Date.now()): Promise<void> {
    await this.runExclusiveActivityAssetMutation(playerId, async () => {
      const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
      const today = getChinaDateKey(nowMs);
      const monthCard = await this.activityPersistenceService.loadMonthCard(playerId);
      if (!monthCard || (!monthCard.eternalEnabled && monthCard.expireAt <= nowMs) || monthCard.remainingPoolMerit <= 0) {
        throw new Error('month_card_inactive');
      }
      if (monthCard.lastClaimDate === today) {
        throw new Error('month_card_already_claimed');
      }
      const rewardMerit = calculateMonthCardDailyReward(monthCard);
      const plan = this.planInventoryRewards(player, [{ itemId: MERIT_ITEM_ID, count: rewardMerit }]);
      await this.commitActivityInventoryMutation({
        player,
        sourceType: 'activity_month_card_claim',
        sourceRefId: `${today}:${rewardMerit}`,
        inventoryAction: 'grant',
        affectedItems: plan.grantedItems,
        nextInventoryItems: plan.nextInventoryItems,
        sourceMutation: {
          kind: 'activity_asset',
          action: 'claim_month_card',
          playerId,
          occurredAtMs: nowMs,
          claimDate: today,
          expectedRewardMerit: rewardMerit,
        },
      });
    });
  }

  async claimDailySignIn(playerId: string, nowMs = Date.now()): Promise<void> {
    await this.runExclusiveActivityAssetMutation(playerId, async () => {
      const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
      const today = getChinaDateKey(nowMs);
      const [monthCard, dailySignIn] = await Promise.all([
        this.activityPersistenceService.loadMonthCard(playerId),
        this.activityPersistenceService.loadDailySignIn(playerId),
      ]);
      if (dailySignIn?.lastClaimDate === today) {
        throw new Error('daily_sign_in_already_claimed');
      }
      const historicalMaxRealmLv = this.resolveHighestRealmLv(playerId);
      const rewardPreview = buildDailySignInRewardPreview(
        historicalMaxRealmLv,
        monthCard?.dailySignInFixedMeritBonus ?? 0,
        resolveEffectiveDailySignInStreakDays(dailySignIn, today),
      );
      const reward = rollDailySignInReward(rewardPreview);
      const rewardPayload = {
        itemId: MERIT_ITEM_ID,
        count: reward.totalMerit,
        randomMerit: reward.randomMerit,
        fixedMerit: reward.fixedMerit,
        randomMinMerit: rewardPreview.randomMinMerit,
        randomMaxMerit: rewardPreview.randomMaxMerit,
        baseRandomMaxMerit: rewardPreview.baseRandomMaxMerit,
        targetRandomMeanMerit: rewardPreview.targetRandomMeanMerit,
        effectiveStreakDays: rewardPreview.effectiveStreakDays,
        streakBonusPercent: rewardPreview.streakBonusPercent,
        historicalMaxRealmLv,
        fortune: reward.fortune,
      };
      const plan = this.planInventoryRewards(player, [{ itemId: MERIT_ITEM_ID, count: reward.totalMerit }]);
      await this.commitActivityInventoryMutation({
        player,
        sourceType: 'activity_daily_sign_in_claim',
        sourceRefId: `${today}:${reward.totalMerit}`,
        inventoryAction: 'grant',
        affectedItems: plan.grantedItems,
        nextInventoryItems: plan.nextInventoryItems,
        sourceMutation: {
          kind: 'activity_asset',
          action: 'claim_daily_sign_in',
          playerId,
          occurredAtMs: nowMs,
          claimDate: today,
          expectedRewardMerit: reward.totalMerit,
          rewardPayload,
        },
      });
      this.playerRuntimeService.setDailySignInFortuneLuck?.(
        playerId,
        reward.fortune.luckDelta,
        getNextChinaMidnightMs(nowMs),
      );
    });
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

  private async processInvitationRewards(playerId: string): Promise<boolean> {
    if (!this.activityPersistenceService.isEnabled()) {
      return false;
    }
    this.playerRuntimeService.getPlayerOrThrow(playerId);
    await this.refreshInvitationProgress(playerId);
    return this.runExclusiveActivityAssetMutation(playerId, async () => {
      const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
      const rewards = await this.activityPersistenceService.previewPendingInvitationRewards(playerId);
      const hasPendingReward = rewards.inviteeSpiritStone > 0 || rewards.inviteeMerit > 0 || rewards.inviterMerit > 0;
      if (!hasPendingReward) {
        return false;
      }
      const rewardItems = [
        ...(rewards.inviteeSpiritStone > 0 ? [{ itemId: SPIRIT_STONE_ITEM_ID, count: rewards.inviteeSpiritStone }] : []),
        ...((rewards.inviteeMerit + rewards.inviterMerit) > 0
          ? [{ itemId: MERIT_ITEM_ID, count: rewards.inviteeMerit + rewards.inviterMerit }]
          : []),
      ];
      const plan = this.planInventoryRewards(player, rewardItems);
      await this.commitActivityInventoryMutation({
        player,
        sourceType: 'activity_invitation_reward_claim',
        sourceRefId: `${rewards.inviteeSpiritStone}:${rewards.inviteeMerit}:${rewards.inviterMerit}`,
        inventoryAction: 'grant',
        affectedItems: plan.grantedItems,
        nextInventoryItems: plan.nextInventoryItems,
        sourceMutation: {
          kind: 'activity_asset',
          action: 'claim_invitation_rewards',
          playerId,
          occurredAtMs: Date.now(),
          expectedRewards: rewards,
        },
      });
      return true;
    });
  }

  private async consumeActivityBenefitItemDurably(
    playerId: string,
    itemInstanceId: string,
    expectedItem: Record<string, unknown>,
    count: number,
    nowMs: number,
    action: 'activate_month_card' | 'activate_eternal',
  ): Promise<void> {
    await this.runExclusiveActivityAssetMutation(playerId, async () => {
      const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
      const currentItem = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
      const expectedItemId = typeof expectedItem?.itemId === 'string' ? expectedItem.itemId.trim() : '';
      if (!currentItem || currentItem.itemId !== expectedItemId) {
        throw new Error('activity_item_changed');
      }
      const normalizedCount = Math.max(1, Math.trunc(Number(count) || 1));
      const poolGrantPerItem = action === 'activate_eternal' ? MERIT_ETERNAL_POOL_GRANT : MERIT_MONTH_CARD_POOL_GRANT;
      if (!Number.isSafeInteger(normalizedCount) || normalizedCount > Math.floor(MAX_ITEM_COUNT / poolGrantPerItem)) {
        throw new Error('activity_benefit_limit');
      }
      const nextInventoryItems = buildInventoryAfterConsume(player.inventory?.items, itemInstanceId, normalizedCount);
      await this.commitActivityInventoryMutation({
        player,
        sourceType: action === 'activate_eternal'
          ? 'activity_eternal_activation'
          : 'activity_month_card_activation',
        sourceRefId: `${itemInstanceId}:x${normalizedCount}`,
        inventoryAction: 'remove',
        affectedItems: [{ ...currentItem, count: normalizedCount }],
        nextInventoryItems,
        sourceMutation: {
          kind: 'activity_asset',
          action,
          playerId,
          occurredAtMs: Math.max(0, Math.trunc(Number(nowMs) || Date.now())),
          count: normalizedCount,
        },
      });
    });
  }

  private async runExclusiveActivityAssetMutation<T>(playerId: string, action: () => Promise<T>): Promise<T> {
    const coordinator = this.playerRuntimeService?.runExclusiveAssetMutation;
    if (typeof coordinator !== 'function') {
      throw new Error('activity_asset_serialization_unavailable');
    }
    return coordinator.call(this.playerRuntimeService, [playerId], action);
  }

  private planInventoryRewards(player: ActivityRuntimePlayer, rewards: Array<{ itemId: string; count: number }>): {
    grantedItems: Array<Record<string, unknown>>;
    nextInventoryItems: Array<Record<string, unknown>>;
  } {
    const nextInventoryItems = Array.isArray(player?.inventory?.items)
      ? player.inventory.items.map((entry: Record<string, unknown>) => ({ ...entry }))
      : [];
    const grantedItems: Array<Record<string, unknown>> = [];
    for (const reward of rewards) {
      const count = Math.max(1, Math.trunc(Number(reward.count) || 1));
      const item = this.playerRuntimeService.contentTemplateRepository?.createItem?.(reward.itemId, count);
      if (!item) {
        throw new Error(`activity_reward_item_missing:${reward.itemId}`);
      }
      const mergeResult = mergeItemStackInto(nextInventoryItems, { ...item });
      if (mergeResult.entry.count > MAX_ITEM_COUNT) {
        throw new Error('activity_reward_item_limit');
      }
      grantedItems.push({ ...item, count });
    }
    return { grantedItems, nextInventoryItems };
  }

  private async commitActivityInventoryMutation(input: {
    player: ActivityRuntimePlayer;
    sourceType: string;
    sourceRefId: string;
    inventoryAction: 'grant' | 'remove';
    affectedItems: Array<Record<string, unknown>>;
    nextInventoryItems: Array<Record<string, unknown>>;
    sourceMutation: DurableActivityAssetSourceMutation;
  }): Promise<void> {
    if (!this.durableOperationService?.isEnabled?.() || typeof this.durableOperationService?.grantInventoryItems !== 'function') {
      throw new Error('activity_persistence_unavailable');
    }
    const playerId = typeof input.player?.playerId === 'string' ? input.player.playerId.trim() : '';
    if (!playerId || !await this.syncCurrentPlayerPresence(playerId)) {
      throw new Error('activity_persistence_unavailable');
    }
    const fence = this.playerRuntimeService.getSessionFence?.(playerId)
      ?? this.playerRuntimeService.describePersistencePresence?.(playerId)
      ?? null;
    const expectedInstanceId = typeof input.player?.instanceId === 'string' && input.player.instanceId.trim()
      ? input.player.instanceId.trim()
      : null;
    const instanceLease = await this.resolveInstanceLeaseContext(expectedInstanceId);
    if (!fence?.runtimeOwnerId || !fence?.sessionEpoch || (expectedInstanceId && !instanceLease)) {
      throw new Error('activity_persistence_unavailable');
    }
    await this.durableOperationService.grantInventoryItems({
      operationId: `activity:${playerId}:${randomUUID()}`,
      playerId,
      expectedRuntimeOwnerId: fence.runtimeOwnerId,
      expectedSessionEpoch: Math.max(1, Math.trunc(Number(fence.sessionEpoch))),
      expectedInstanceId,
      expectedAssignedNodeId: instanceLease?.assignedNodeId ?? null,
      expectedOwnershipEpoch: instanceLease?.ownershipEpoch ?? null,
      sourceType: input.sourceType,
      sourceRefId: input.sourceRefId,
      inventoryAction: input.inventoryAction,
      grantedItems: buildDurableInventorySnapshots(input.affectedItems),
      nextInventoryItems: buildDurableInventorySnapshots(input.nextInventoryItems),
      sourceMutation: input.sourceMutation,
    });
    this.playerRuntimeService.replaceInventoryItems(playerId, input.nextInventoryItems);
  }

  private async resolveInstanceLeaseContext(instanceId: string | null): Promise<{
    assignedNodeId: string;
    ownershipEpoch: number;
  } | null> {
    if (!instanceId || !this.instanceCatalogService?.isEnabled?.()) {
      return null;
    }
    const row = await this.instanceCatalogService.loadInstanceCatalog(instanceId);
    const assignedNodeId = typeof row?.assigned_node_id === 'string' ? row.assigned_node_id.trim() : '';
    const ownershipEpoch = Number.isFinite(Number(row?.ownership_epoch))
      ? Math.max(1, Math.trunc(Number(row.ownership_epoch)))
      : 0;
    return assignedNodeId && ownershipEpoch > 0 ? { assignedNodeId, ownershipEpoch } : null;
  }

  private async syncCurrentPlayerPresence(playerId: string): Promise<boolean> {
    const persistence = this.playerRuntimeService?.playerDomainPersistenceService;
    if (!persistence?.isEnabled?.()) {
      return false;
    }
    const persistedPresence = typeof persistence.loadPlayerPresence === 'function'
      ? await persistence.loadPlayerPresence(playerId)
      : null;
    let presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
      return false;
    }
    const persistedSessionEpoch = Number.isFinite(Number(persistedPresence?.sessionEpoch))
      ? Math.max(0, Math.trunc(Number(persistedPresence.sessionEpoch)))
      : 0;
    const persistedRuntimeOwnerId = typeof persistedPresence?.runtimeOwnerId === 'string'
      ? persistedPresence.runtimeOwnerId.trim()
      : '';
    if (
      typeof this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast === 'function'
      && persistedSessionEpoch > 0
      && (
        Math.max(0, Math.trunc(Number(presence.sessionEpoch ?? 0))) <= persistedSessionEpoch
        || (persistedRuntimeOwnerId && persistedRuntimeOwnerId !== presence.runtimeOwnerId)
      )
    ) {
      this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast(playerId, persistedSessionEpoch);
      presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    }
    if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
      return false;
    }
    await persistence.savePlayerPresence(playerId, {
      ...presence,
      versionSeed: nextPlayerPersistenceVersion(),
    });
    return true;
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

  private syncDailySignInFortuneLuck(playerId: string, fortune: DailySignInFortuneView | null, nowMs: number): void {
    this.playerRuntimeService.setDailySignInFortuneLuck?.(
      playerId,
      fortune?.luckDelta ?? 0,
      fortune ? getNextChinaMidnightMs(nowMs) : 0,
    );
  }
}

function buildInventoryAfterConsume(
  items: readonly Record<string, unknown>[] | null | undefined,
  itemInstanceId: string,
  count: number,
): Array<Record<string, unknown>> {
  const normalizedItemInstanceId = typeof itemInstanceId === 'string' ? itemInstanceId.trim() : '';
  const normalizedCount = Math.max(1, Math.trunc(Number(count) || 1));
  const nextItems = Array.isArray(items) ? items.map((entry) => ({ ...entry })) : [];
  const index = nextItems.findIndex((entry) => entry.itemInstanceId === normalizedItemInstanceId);
  if (index < 0) {
    throw new Error('activity_item_changed');
  }
  const available = Math.max(1, Math.trunc(Number(nextItems[index]?.count ?? 1)));
  if (available < normalizedCount) {
    throw new Error('activity_item_count_changed');
  }
  if (available === normalizedCount) {
    nextItems.splice(index, 1);
  }
  else {
    nextItems[index] = { ...nextItems[index], count: available - normalizedCount };
  }
  return nextItems;
}

function buildDurableInventorySnapshots(items: readonly Record<string, unknown>[]): Array<{
  itemId: string;
  itemInstanceId?: string;
  count: number;
  rawPayload: unknown;
}> {
  return (Array.isArray(items) ? items : [])
    .map((entry) => ({
      itemId: typeof entry?.itemId === 'string' ? entry.itemId.trim() : '',
      itemInstanceId: typeof entry?.itemInstanceId === 'string' && entry.itemInstanceId.trim()
        ? entry.itemInstanceId.trim()
        : undefined,
      count: Math.max(1, Math.trunc(Number(entry?.count ?? 1))),
      rawPayload: { ...entry },
    }))
    .filter((entry) => entry.itemId);
}

export function getChinaDateKey(nowMs = Date.now()): string {
  const shifted = new Date(nowMs + CHINA_TIME_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

function shiftChinaDateKey(dateKey: string, offsetDays: number): string {
  const normalizedDateKey = typeof dateKey === 'string' ? dateKey.trim() : '';
  const time = Date.parse(`${normalizedDateKey}T00:00:00.000Z`);
  if (!Number.isFinite(time)) {
    return normalizedDateKey;
  }
  return new Date(time + Math.trunc(Number(offsetDays) || 0) * DAY_MS).toISOString().slice(0, 10);
}

function getNextChinaMidnightMs(nowMs = Date.now()): number {
  const nextDateKey = shiftChinaDateKey(getChinaDateKey(nowMs), 1);
  return Date.parse(`${nextDateKey}T00:00:00.000Z`) - CHINA_TIME_OFFSET_MS;
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
  if (message === 'activity_reward_snapshot_changed') {
    return new BadRequestException('活动状态已变化，请重试');
  }
  if (message === 'activity_item_changed' || message === 'activity_item_count_changed') {
    return new BadRequestException('活动道具状态已变化，请重试');
  }
  if (message === 'activity_benefit_limit' || message === 'activity_reward_item_limit') {
    return new BadRequestException('活动权益或奖励数量已达到上限');
  }
  return new BadRequestException('活动服务暂不可用，请稍后重试');
}
