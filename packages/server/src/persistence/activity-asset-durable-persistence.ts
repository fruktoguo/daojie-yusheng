import {
  INVITATION_FOUNDATION_REALM_MIN_LEVEL,
  INVITATION_INVITEE_MERIT_REWARD,
  INVITATION_INVITEE_SPIRIT_STONE_REWARD,
  INVITATION_INVITER_BASE_MERIT_REWARD,
  INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
  INVITATION_INVITER_QI_REALM_MERIT_REWARD,
  INVITATION_QI_REALM_MIN_LEVEL,
  MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
  MERIT_ETERNAL_POOL_GRANT,
  MERIT_MONTH_CARD_DURATION_DAYS,
  MERIT_MONTH_CARD_POOL_GRANT,
} from '@mud/shared';
import type { PoolClient } from 'pg';

export const ACTIVITY_MONTH_CARD_TABLE = 'player_merit_month_card';
export const ACTIVITY_MONTH_CARD_CLAIM_TABLE = 'player_merit_month_card_claim';
export const ACTIVITY_DAILY_SIGN_IN_TABLE = 'player_daily_sign_in';
export const ACTIVITY_DAILY_SIGN_IN_CLAIM_TABLE = 'player_daily_sign_in_claim';
export const ACTIVITY_INVITATION_TABLE = 'player_invitation';

const DAY_MS = 24 * 60 * 60 * 1000;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export interface ActivityInvitationRewardSnapshot {
  inviteeSpiritStone: number;
  inviteeMerit: number;
  inviterMerit: number;
}

export type DurableActivityAssetSourceMutation =
  | {
      kind: 'activity_asset';
      action: 'activate_month_card' | 'activate_eternal';
      playerId: string;
      occurredAtMs: number;
      count: number;
    }
  | {
      kind: 'activity_asset';
      action: 'claim_month_card';
      playerId: string;
      occurredAtMs: number;
      claimDate: string;
      expectedRewardMerit: number;
    }
  | {
      kind: 'activity_asset';
      action: 'claim_daily_sign_in';
      playerId: string;
      occurredAtMs: number;
      claimDate: string;
      expectedRewardMerit: number;
      rewardPayload: unknown;
    }
  | {
      kind: 'activity_asset';
      action: 'claim_invitation_rewards';
      playerId: string;
      occurredAtMs: number;
      expectedRewards: ActivityInvitationRewardSnapshot;
    };

export function normalizeDurableActivityAssetSourceMutation(
  value: unknown,
): DurableActivityAssetSourceMutation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  if (source.kind !== 'activity_asset') {
    return null;
  }
  const playerId = normalizeRequiredString(source.playerId);
  const action = normalizeRequiredString(source.action);
  const occurredAtMs = normalizeNonNegativeInteger(source.occurredAtMs);
  if (!playerId || occurredAtMs === null) {
    return null;
  }
  if (action === 'activate_month_card' || action === 'activate_eternal') {
    const count = normalizePositiveInteger(source.count);
    const grantPerItem = action === 'activate_eternal' ? MERIT_ETERNAL_POOL_GRANT : MERIT_MONTH_CARD_POOL_GRANT;
    return count === null || count > Math.floor(POSTGRES_INTEGER_MAX / grantPerItem) ? null : {
      kind: 'activity_asset',
      action,
      playerId,
      occurredAtMs,
      count,
    };
  }
  if (action === 'claim_month_card') {
    const claimDate = normalizeDateKey(source.claimDate);
    const expectedRewardMerit = normalizePositiveInteger(source.expectedRewardMerit);
    return !claimDate || expectedRewardMerit === null ? null : {
      kind: 'activity_asset',
      action,
      playerId,
      occurredAtMs,
      claimDate,
      expectedRewardMerit,
    };
  }
  if (action === 'claim_daily_sign_in') {
    const claimDate = normalizeDateKey(source.claimDate);
    const expectedRewardMerit = normalizePositiveInteger(source.expectedRewardMerit);
    if (!claimDate || expectedRewardMerit === null) {
      return null;
    }
    return {
      kind: 'activity_asset',
      action,
      playerId,
      occurredAtMs,
      claimDate,
      expectedRewardMerit,
      rewardPayload: normalizeJsonValue(source.rewardPayload),
    };
  }
  if (action === 'claim_invitation_rewards') {
    const expectedRewards = normalizeInvitationRewardSnapshot(source.expectedRewards);
    return expectedRewards && sumInvitationRewards(expectedRewards) > 0 ? {
      kind: 'activity_asset',
      action,
      playerId,
      occurredAtMs,
      expectedRewards,
    } : null;
  }
  return null;
}

export async function persistDurableActivityAssetSourceMutation(
  client: PoolClient,
  mutation: DurableActivityAssetSourceMutation,
): Promise<void> {
  switch (mutation.action) {
    case 'activate_month_card':
    case 'activate_eternal':
      await persistMonthCardActivation(client, mutation);
      return;
    case 'claim_month_card':
      await persistMonthCardClaim(client, mutation);
      return;
    case 'claim_daily_sign_in':
      await persistDailySignInClaim(client, mutation);
      return;
    case 'claim_invitation_rewards':
      await persistInvitationRewardClaim(client, mutation);
      return;
  }
}

async function persistMonthCardActivation(
  client: PoolClient,
  mutation: Extract<DurableActivityAssetSourceMutation, { action: 'activate_month_card' | 'activate_eternal' }>,
): Promise<void> {
  const current = await client.query(
    `SELECT remaining_pool_merit, eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date
       FROM ${ACTIVITY_MONTH_CARD_TABLE}
      WHERE player_id = $1
      FOR UPDATE`,
    [mutation.playerId],
  );
  const existing = current.rows[0] ?? null;
  const previousRemainingPool = normalizeNonNegativeInteger(existing?.remaining_pool_merit) ?? 0;
  const previousFixedBonus = normalizeNonNegativeInteger(existing?.daily_sign_in_fixed_merit_bonus) ?? 0;
  const isEternal = mutation.action === 'activate_eternal';
  const grantedPool = mutation.count * (isEternal ? MERIT_ETERNAL_POOL_GRANT : MERIT_MONTH_CARD_POOL_GRANT);
  const grantedFixedBonus = isEternal ? mutation.count * MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS : 0;
  const totalPoolMerit = previousRemainingPool + grantedPool;
  const dailySignInFixedMeritBonus = previousFixedBonus + grantedFixedBonus;
  if (totalPoolMerit > POSTGRES_INTEGER_MAX || dailySignInFixedMeritBonus > POSTGRES_INTEGER_MAX) {
    throw new Error('activity_benefit_limit');
  }
  const expireAtMs = mutation.occurredAtMs + MERIT_MONTH_CARD_DURATION_DAYS * DAY_MS;
  await client.query(
    `INSERT INTO ${ACTIVITY_MONTH_CARD_TABLE}(
       player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit,
       eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $4, $5, $6, $7, now(), now())
     ON CONFLICT (player_id)
     DO UPDATE SET
       start_at_ms = EXCLUDED.start_at_ms,
       expire_at_ms = EXCLUDED.expire_at_ms,
       total_pool_merit = EXCLUDED.total_pool_merit,
       remaining_pool_merit = EXCLUDED.remaining_pool_merit,
       eternal_enabled = EXCLUDED.eternal_enabled,
       daily_sign_in_fixed_merit_bonus = EXCLUDED.daily_sign_in_fixed_merit_bonus,
       updated_at = now()`,
    [
      mutation.playerId,
      mutation.occurredAtMs,
      expireAtMs,
      totalPoolMerit,
      isEternal || existing?.eternal_enabled === true,
      dailySignInFixedMeritBonus,
      normalizeDateKey(existing?.last_claim_date),
    ],
  );
}

async function persistMonthCardClaim(
  client: PoolClient,
  mutation: Extract<DurableActivityAssetSourceMutation, { action: 'claim_month_card' }>,
): Promise<void> {
  const current = await client.query(
    `SELECT expire_at_ms, total_pool_merit, remaining_pool_merit, eternal_enabled, last_claim_date
       FROM ${ACTIVITY_MONTH_CARD_TABLE}
      WHERE player_id = $1
      FOR UPDATE`,
    [mutation.playerId],
  );
  const row = current.rows[0] ?? null;
  const expireAtMs = normalizeNonNegativeInteger(row?.expire_at_ms) ?? 0;
  const totalPoolMerit = normalizeNonNegativeInteger(row?.total_pool_merit) ?? 0;
  const remainingPoolMerit = normalizeNonNegativeInteger(row?.remaining_pool_merit) ?? 0;
  if (!row || (row.eternal_enabled !== true && expireAtMs <= mutation.occurredAtMs) || remainingPoolMerit <= 0) {
    throw new Error('month_card_inactive');
  }
  if (normalizeDateKey(row.last_claim_date) === mutation.claimDate) {
    throw new Error('month_card_already_claimed');
  }
  const rewardMerit = calculateMonthCardDailyReward(totalPoolMerit, remainingPoolMerit);
  if (rewardMerit !== mutation.expectedRewardMerit) {
    throw new Error('activity_reward_snapshot_changed');
  }
  await client.query(
    `INSERT INTO ${ACTIVITY_MONTH_CARD_CLAIM_TABLE}(player_id, claim_date, reward_merit, created_at)
     VALUES ($1, $2, $3, now())`,
    [mutation.playerId, mutation.claimDate, rewardMerit],
  );
  await client.query(
    `UPDATE ${ACTIVITY_MONTH_CARD_TABLE}
        SET last_claim_date = $2,
            remaining_pool_merit = $3,
            updated_at = now()
      WHERE player_id = $1`,
    [mutation.playerId, mutation.claimDate, Math.max(0, remainingPoolMerit - rewardMerit)],
  );
}

async function persistDailySignInClaim(
  client: PoolClient,
  mutation: Extract<DurableActivityAssetSourceMutation, { action: 'claim_daily_sign_in' }>,
): Promise<void> {
  const current = await client.query(
    `SELECT last_claim_date, streak_days, total_days
       FROM ${ACTIVITY_DAILY_SIGN_IN_TABLE}
      WHERE player_id = $1
      FOR UPDATE`,
    [mutation.playerId],
  );
  const row = current.rows[0] ?? null;
  const lastClaimDate = normalizeDateKey(row?.last_claim_date);
  if (lastClaimDate === mutation.claimDate) {
    throw new Error('daily_sign_in_already_claimed');
  }
  const rewardMerit = normalizePositiveInteger(
    isRecord(mutation.rewardPayload) ? mutation.rewardPayload.count : null,
  );
  if (rewardMerit === null || rewardMerit !== mutation.expectedRewardMerit) {
    throw new Error('activity_reward_snapshot_changed');
  }
  const previousDate = shiftDateKey(mutation.claimDate, -1);
  const streakDays = lastClaimDate === previousDate
    ? (normalizeNonNegativeInteger(row?.streak_days) ?? 0) + 1
    : 1;
  const totalDays = (normalizeNonNegativeInteger(row?.total_days) ?? 0) + 1;
  await client.query(
    `INSERT INTO ${ACTIVITY_DAILY_SIGN_IN_CLAIM_TABLE}(player_id, claim_date, reward_payload, created_at)
     VALUES ($1, $2, $3::jsonb, now())`,
    [mutation.playerId, mutation.claimDate, JSON.stringify(mutation.rewardPayload)],
  );
  await client.query(
    `INSERT INTO ${ACTIVITY_DAILY_SIGN_IN_TABLE}(
       player_id, last_claim_date, streak_days, total_days, last_reward_merit, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, now(), now())
     ON CONFLICT (player_id)
     DO UPDATE SET
       last_claim_date = EXCLUDED.last_claim_date,
       streak_days = EXCLUDED.streak_days,
       total_days = EXCLUDED.total_days,
       last_reward_merit = EXCLUDED.last_reward_merit,
       updated_at = now()`,
    [mutation.playerId, mutation.claimDate, streakDays, totalDays, rewardMerit],
  );
}

async function persistInvitationRewardClaim(
  client: PoolClient,
  mutation: Extract<DurableActivityAssetSourceMutation, { action: 'claim_invitation_rewards' }>,
): Promise<void> {
  const inviteeResult = await client.query(
    `UPDATE ${ACTIVITY_INVITATION_TABLE}
        SET invitee_reward_claimed = true,
            updated_at = now()
      WHERE invitee_player_id = $1
        AND invitee_reward_claimed = false
      RETURNING invitee_player_id`,
    [mutation.playerId],
  );
  const baseResult = await client.query(
    `UPDATE ${ACTIVITY_INVITATION_TABLE}
        SET inviter_base_reward_claimed = true,
            updated_at = now()
      WHERE inviter_player_id = $1
        AND inviter_base_reward_claimed = false
      RETURNING invitee_player_id`,
    [mutation.playerId],
  );
  const qiResult = await client.query(
    `UPDATE ${ACTIVITY_INVITATION_TABLE}
        SET inviter_qi_reward_claimed = true,
            updated_at = now()
      WHERE inviter_player_id = $1
        AND invitee_highest_realm_lv >= $2
        AND inviter_qi_reward_claimed = false
      RETURNING invitee_player_id`,
    [mutation.playerId, INVITATION_QI_REALM_MIN_LEVEL],
  );
  const foundationResult = await client.query(
    `UPDATE ${ACTIVITY_INVITATION_TABLE}
        SET inviter_foundation_reward_claimed = true,
            updated_at = now()
      WHERE inviter_player_id = $1
        AND invitee_highest_realm_lv >= $2
        AND inviter_foundation_reward_claimed = false
      RETURNING invitee_player_id`,
    [mutation.playerId, INVITATION_FOUNDATION_REALM_MIN_LEVEL],
  );
  const actualRewards: ActivityInvitationRewardSnapshot = {
    inviteeSpiritStone: (inviteeResult.rowCount ?? 0) * INVITATION_INVITEE_SPIRIT_STONE_REWARD,
    inviteeMerit: (inviteeResult.rowCount ?? 0) * INVITATION_INVITEE_MERIT_REWARD,
    inviterMerit:
      (baseResult.rowCount ?? 0) * INVITATION_INVITER_BASE_MERIT_REWARD
      + (qiResult.rowCount ?? 0) * INVITATION_INVITER_QI_REALM_MERIT_REWARD
      + (foundationResult.rowCount ?? 0) * INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
  };
  if (!isSameInvitationRewardSnapshot(actualRewards, mutation.expectedRewards)) {
    throw new Error('activity_reward_snapshot_changed');
  }
}

function calculateMonthCardDailyReward(totalPoolMerit: number, remainingPoolMerit: number): number {
  if (totalPoolMerit <= 0 || remainingPoolMerit <= 0) {
    return 0;
  }
  return Math.min(remainingPoolMerit, Math.max(1, Math.floor(totalPoolMerit / MERIT_MONTH_CARD_DURATION_DAYS)));
}

function normalizeInvitationRewardSnapshot(value: unknown): ActivityInvitationRewardSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const inviteeSpiritStone = normalizeNonNegativeInteger(value.inviteeSpiritStone);
  const inviteeMerit = normalizeNonNegativeInteger(value.inviteeMerit);
  const inviterMerit = normalizeNonNegativeInteger(value.inviterMerit);
  return inviteeSpiritStone === null || inviteeMerit === null || inviterMerit === null ? null : {
    inviteeSpiritStone,
    inviteeMerit,
    inviterMerit,
  };
}

function isSameInvitationRewardSnapshot(
  left: ActivityInvitationRewardSnapshot,
  right: ActivityInvitationRewardSnapshot,
): boolean {
  return left.inviteeSpiritStone === right.inviteeSpiritStone
    && left.inviteeMerit === right.inviteeMerit
    && left.inviterMerit === right.inviterMerit;
}

function sumInvitationRewards(value: ActivityInvitationRewardSnapshot): number {
  return value.inviteeSpiritStone + value.inviteeMerit + value.inviterMerit;
}

function normalizeJsonValue(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  }
  catch {
    return {};
  }
}

function normalizeDateKey(value: unknown): string {
  const normalized = normalizeRequiredString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function shiftDateKey(dateKey: string, offsetDays: number): string {
  const time = Date.parse(`${dateKey}T00:00:00.000Z`);
  return Number.isFinite(time)
    ? new Date(time + Math.trunc(offsetDays) * DAY_MS).toISOString().slice(0, 10)
    : dateKey;
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
