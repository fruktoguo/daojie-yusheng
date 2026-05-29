/**
 * 活动中心共享常量与协议视图。
 *
 * 该文件只承载跨端稳定契约，不引入服务端或浏览器专属依赖。
 */

export const MERIT_ITEM_ID = 'merit';
export const MERIT_MONTH_CARD_ITEM_ID = 'merit_month_card';
export const MERIT_MONTH_CARD_USE_BEHAVIOR = 'activate_merit_month_card';
export const MERIT_MONTH_CARD_DURATION_DAYS = 30;
export const MERIT_MONTH_CARD_POOL_GRANT = 3000;
export const MERIT_MONTH_CARD_OFFLINE_MAX_HOURS = 72;
export const BASE_OFFLINE_MAX_HOURS = 48;
export const DAILY_SIGN_IN_REWARD_MERIT = 20;

export interface MeritMonthCardStatusView {
  active: boolean;
  startAt: number | null;
  expireAt: number | null;
  remainingDays: number;
  dailyRewardMerit: number;
  poolTotalMerit: number;
  poolRemainingMerit: number;
  claimWindowDays: number;
  offlineMaxHours: number;
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
  rewardMerit: number;
}

export interface ActivityStatusView {
  serverNow: number;
  monthCard: MeritMonthCardStatusView;
  dailySignIn: DailySignInStatusView;
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
