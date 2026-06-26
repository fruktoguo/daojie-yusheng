/**
 * 活动中心共享常量与协议视图。
 *
 * 该文件只承载跨端稳定契约，不引入服务端或浏览器专属依赖。
 */

export const MERIT_ITEM_ID = 'merit';
export const MERIT_MONTH_CARD_ITEM_ID = 'merit_month_card';
export const MERIT_MONTH_CARD_USE_BEHAVIOR = 'activate_merit_month_card';
export const MERIT_ETERNAL_ITEM_ID = 'merit_eternal';
export const MERIT_ETERNAL_USE_BEHAVIOR = 'activate_merit_eternal';
export const MERIT_MONTH_CARD_DURATION_DAYS = 30;
export const MERIT_MONTH_CARD_POOL_GRANT = 3000;
export const MERIT_ETERNAL_POOL_GRANT = 90_000;
export const MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS = 1_000;
export const MERIT_MONTH_CARD_OFFLINE_MAX_HOURS = 72;
export const BASE_OFFLINE_MAX_HOURS = 48;
export const DAILY_SIGN_IN_RANDOM_MIN_MERIT = 1;
export const DAILY_SIGN_IN_RANDOM_BASE_MAX_MERIT = 40;
export const SPIRIT_STONE_ITEM_ID = 'spirit_stone';
export const INVITATION_INVITEE_SPIRIT_STONE_REWARD = 666;
export const INVITATION_INVITEE_MERIT_REWARD = 100;
export const INVITATION_INVITER_BASE_MERIT_REWARD = 100;
export const INVITATION_INVITER_QI_REALM_MERIT_REWARD = 300;
export const INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD = 600;
export const INVITATION_QI_REALM_MIN_LEVEL = 19;
export const INVITATION_FOUNDATION_REALM_MIN_LEVEL = 31;

export interface MeritMonthCardStatusView {
  active: boolean;
  startAt: number | null;
  expireAt: number | null;
  remainingDays: number;
  dailyRewardMerit: number;
  poolTotalMerit: number;
  poolRemainingMerit: number;
  eternal: boolean;
  heavenlyDaoShopDiscountPercent: number;
  dailySignInFixedMeritBonus: number;
  claimWindowDays: number;
  offlineMaxHours: number | null;
  canClaimToday: boolean;
  lastClaimDate: string | null;
  today: string;
  itemCount: number;
  firstItemInstanceId: string | null;
}

export interface DailySignInStatusView {
  canClaimToday: boolean;
  lastClaimDate: string | null;
  streakDays: number;
  totalDays: number;
  today: string;
  rewardPreview: {
    randomMinMerit: number;
    randomMaxMerit: number;
    fixedMerit: number;
  };
  lastRewardMerit: number | null;
}

export type InvitationStageKey = 'registered' | 'qi' | 'foundation';

export interface InvitationStageStatusView {
  key: InvitationStageKey;
  label: string;
  count: number;
  rewardMerit: number;
}

export interface InvitationStatusView {
  inviteCode: string;
  invitePath: string;
  totalInvitees: number;
  registeredRewardedCount: number;
  qiReachedCount: number;
  foundationReachedCount: number;
  inviteeReward: {
    spiritStone: number;
    merit: number;
  };
  stages: InvitationStageStatusView[];
}

export interface ActivityStatusView {
  serverNow: number;
  monthCard: MeritMonthCardStatusView;
  dailySignIn: DailySignInStatusView;
  invitation: InvitationStatusView;
  hasRedDot: boolean;
}

export interface ActivityOperationResultView {
  operation: 'activateMonthCard' | 'claimMonthCard' | 'claimDailySignIn';
  ok: boolean;
  message?: string;
}

export interface RequestActivityStatusView {}
export interface ClaimMeritMonthCardView {}
export interface ClaimDailySignInView {}
