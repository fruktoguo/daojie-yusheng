/**
 * 活动中心持久化服务。
 *
 * 月卡有效期、月卡每日领取和每日签到都要求跨会话存在，数据库是唯一真源。
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  INVITATION_FOUNDATION_REALM_MIN_LEVEL,
  INVITATION_INVITEE_MERIT_REWARD,
  INVITATION_INVITEE_SPIRIT_STONE_REWARD,
  INVITATION_INVITER_BASE_MERIT_REWARD,
  INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
  INVITATION_INVITER_QI_REALM_MERIT_REWARD,
  INVITATION_QI_REALM_MIN_LEVEL,
  MERIT_ITEM_ID,
  MERIT_MONTH_CARD_DURATION_DAYS,
  MERIT_MONTH_CARD_POOL_GRANT,
  MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
  MERIT_ETERNAL_POOL_GRANT,
} from '@mud/shared';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';

const MONTH_CARD_TABLE = 'player_merit_month_card';
const MONTH_CARD_CLAIM_TABLE = 'player_merit_month_card_claim';
const DAILY_SIGN_IN_TABLE = 'player_daily_sign_in';
const DAILY_SIGN_IN_CLAIM_TABLE = 'player_daily_sign_in_claim';
const INVITATION_TABLE = 'player_invitation';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActivityMonthCardRecord {
  playerId: string;
  startAt: number;
  expireAt: number;
  totalPoolMerit: number;
  remainingPoolMerit: number;
  eternalEnabled: boolean;
  dailySignInFixedMeritBonus: number;
  lastClaimDate: string | null;
}

export interface ActivityMonthCardClaimResult {
  record: ActivityMonthCardRecord;
  rewardMerit: number;
}

export interface ActivityDailySignInRecord {
  playerId: string;
  lastClaimDate: string | null;
  streakDays: number;
  totalDays: number;
  lastRewardMerit: number | null;
}

export interface ActivityInvitationRecord {
  inviterUserId: string;
  inviterPlayerId: string;
  inviteeUserId: string;
  inviteePlayerId: string;
  invitationCode: string;
  inviteeHighestRealmLv: number;
  inviteeRewardClaimed: boolean;
  inviterBaseRewardClaimed: boolean;
  inviterQiRewardClaimed: boolean;
  inviterFoundationRewardClaimed: boolean;
}

export interface ActivityInvitationStatusRecord {
  totalInvitees: number;
  registeredRewardedCount: number;
  qiReachedCount: number;
  foundationReachedCount: number;
}

export interface ActivityInvitationInviteeProgressRecord {
  inviteePlayerId: string;
  highestRealmLv: number;
}

export interface ActivityInvitationLeaderboardRow {
  inviterPlayerId: string;
  totalInvitees: number;
  qiReachedCount: number;
  foundationReachedCount: number;
}

export interface ActivityInvitationRewardClaimResult {
  inviteeSpiritStone: number;
  inviteeMerit: number;
  inviterMerit: number;
}

@Injectable()
export class ActivityPersistenceService {
  private readonly logger = new Logger(ActivityPersistenceService.name);
  pool: Pool | null = null;
  enabled = false;

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('活动持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    const sharedPool = this.databasePoolProvider?.getPool?.('activity');
    if (!sharedPool) {
      this.logger.warn('活动持久化已禁用：数据库连接池不可用');
      return;
    }
    this.pool = sharedPool;
    try {
      await ensureActivityTables(sharedPool);
      this.enabled = true;
      this.logger.log('活动持久化已启用');
    } catch (error) {
      this.logger.error('活动持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
      this.pool = null;
      this.enabled = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.pool = null;
    this.enabled = false;
  }

  isEnabled(): boolean {
    return Boolean(this.pool && this.enabled);
  }

  async loadMonthCard(playerId: string): Promise<ActivityMonthCardRecord | null> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return null;
    }
    const result = await this.pool.query(
      `SELECT player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit,
              eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date
         FROM ${MONTH_CARD_TABLE}
        WHERE player_id = $1`,
      [normalizedPlayerId],
    );
    return normalizeMonthCardRow(result.rows[0], normalizedPlayerId);
  }

  async loadDailySignIn(playerId: string): Promise<ActivityDailySignInRecord | null> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return null;
    }
    const result = await this.pool.query(
      `SELECT player_id, last_claim_date, streak_days, total_days, last_reward_merit
         FROM ${DAILY_SIGN_IN_TABLE}
        WHERE player_id = $1`,
      [normalizedPlayerId],
    );
    return normalizeDailySignInRow(result.rows[0], normalizedPlayerId);
  }

  async activateMonthCard(
    playerId: string,
    nowMs = Date.now(),
    poolGrant = MERIT_MONTH_CARD_POOL_GRANT,
    durationDays = MERIT_MONTH_CARD_DURATION_DAYS,
  ): Promise<ActivityMonthCardRecord> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      throw new Error('activity_persistence_unavailable');
    }
    const durationMs = Math.max(1, Math.trunc(durationDays)) * DAY_MS;
    const grantedMerit = Math.max(0, Math.trunc(Number(poolGrant) || 0));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit,
                eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date
           FROM ${MONTH_CARD_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const existing = normalizeMonthCardRow(current.rows[0], normalizedPlayerId);
      const startAt = Math.trunc(nowMs);
      const expireAt = startAt + durationMs;
      const totalPoolMerit = calculateMonthCardNextPool(existing?.remainingPoolMerit ?? 0, grantedMerit);
      const remainingPoolMerit = totalPoolMerit;
      await client.query(
        `INSERT INTO ${MONTH_CARD_TABLE}(player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit, last_claim_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())
         ON CONFLICT (player_id)
         DO UPDATE SET
           start_at_ms = EXCLUDED.start_at_ms,
           expire_at_ms = EXCLUDED.expire_at_ms,
           total_pool_merit = EXCLUDED.total_pool_merit,
           remaining_pool_merit = EXCLUDED.remaining_pool_merit,
           updated_at = now()`,
        [normalizedPlayerId, startAt, expireAt, totalPoolMerit, remainingPoolMerit, existing?.lastClaimDate ?? null],
      );
      await client.query('COMMIT');
      return {
        playerId: normalizedPlayerId,
        startAt,
        expireAt,
        totalPoolMerit,
        remainingPoolMerit,
        eternalEnabled: existing?.eternalEnabled ?? false,
        dailySignInFixedMeritBonus: existing?.dailySignInFixedMeritBonus ?? 0,
        lastClaimDate: existing?.lastClaimDate ?? null,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async activateEternalMonthCard(
    playerId: string,
    nowMs = Date.now(),
    poolGrant = MERIT_ETERNAL_POOL_GRANT,
    fixedSignInBonus = MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
    durationDays = MERIT_MONTH_CARD_DURATION_DAYS,
  ): Promise<ActivityMonthCardRecord> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      throw new Error('activity_persistence_unavailable');
    }
    const durationMs = Math.max(1, Math.trunc(durationDays)) * DAY_MS;
    const grantedMerit = Math.max(0, Math.trunc(Number(poolGrant) || 0));
    const grantedFixedBonus = Math.max(0, Math.trunc(Number(fixedSignInBonus) || 0));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit,
                eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date
           FROM ${MONTH_CARD_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const existing = normalizeMonthCardRow(current.rows[0], normalizedPlayerId);
      const startAt = Math.trunc(nowMs);
      const expireAt = startAt + durationMs;
      const totalPoolMerit = calculateMonthCardNextPool(existing?.remainingPoolMerit ?? 0, grantedMerit);
      const remainingPoolMerit = totalPoolMerit;
      const dailySignInFixedMeritBonus = Math.max(
        0,
        Math.trunc(Number(existing?.dailySignInFixedMeritBonus ?? 0) || 0) + grantedFixedBonus,
      );
      await client.query(
        `INSERT INTO ${MONTH_CARD_TABLE}(
           player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit,
           eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, true, $6, $7, now(), now())
         ON CONFLICT (player_id)
         DO UPDATE SET
           start_at_ms = EXCLUDED.start_at_ms,
           expire_at_ms = EXCLUDED.expire_at_ms,
           total_pool_merit = EXCLUDED.total_pool_merit,
           remaining_pool_merit = EXCLUDED.remaining_pool_merit,
           eternal_enabled = true,
           daily_sign_in_fixed_merit_bonus = EXCLUDED.daily_sign_in_fixed_merit_bonus,
           updated_at = now()`,
        [normalizedPlayerId, startAt, expireAt, totalPoolMerit, remainingPoolMerit, dailySignInFixedMeritBonus, existing?.lastClaimDate ?? null],
      );
      await client.query('COMMIT');
      return {
        playerId: normalizedPlayerId,
        startAt,
        expireAt,
        totalPoolMerit,
        remainingPoolMerit,
        eternalEnabled: true,
        dailySignInFixedMeritBonus,
        lastClaimDate: existing?.lastClaimDate ?? null,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimMonthCard(playerId: string, claimDate: string, nowMs = Date.now()): Promise<ActivityMonthCardClaimResult> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    const normalizedClaimDate = normalizeDateKey(claimDate);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !normalizedClaimDate) {
      throw new Error('activity_persistence_unavailable');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit,
                eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date
           FROM ${MONTH_CARD_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const monthCard = normalizeMonthCardRow(current.rows[0], normalizedPlayerId);
      if (!monthCard || (!monthCard.eternalEnabled && monthCard.expireAt <= nowMs) || monthCard.remainingPoolMerit <= 0) {
        throw new Error('month_card_inactive');
      }
      if (monthCard.lastClaimDate === normalizedClaimDate) {
        throw new Error('month_card_already_claimed');
      }
      const rewardMerit = calculateMonthCardDailyReward(monthCard);
      const remainingPoolMerit = Math.max(0, monthCard.remainingPoolMerit - rewardMerit);
      await client.query(
        `INSERT INTO ${MONTH_CARD_CLAIM_TABLE}(player_id, claim_date, reward_merit, created_at)
         VALUES ($1, $2, $3, now())`,
        [normalizedPlayerId, normalizedClaimDate, rewardMerit],
      );
      await client.query(
        `UPDATE ${MONTH_CARD_TABLE}
            SET last_claim_date = $2,
                remaining_pool_merit = $3,
                updated_at = now()
          WHERE player_id = $1`,
        [normalizedPlayerId, normalizedClaimDate, remainingPoolMerit],
      );
      await client.query('COMMIT');
      return {
          record: {
            ...monthCard,
            remainingPoolMerit,
            lastClaimDate: normalizedClaimDate,
        },
        rewardMerit,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new Error('month_card_already_claimed');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async setMonthCardPool(
    playerId: string,
    totalPoolMerit: number,
    remainingPoolMerit: number,
    nowMs = Date.now(),
    options: { eternalEnabled?: boolean; dailySignInFixedMeritBonus?: number } = {},
  ): Promise<ActivityMonthCardRecord> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      throw new Error('activity_persistence_unavailable');
    }
    const normalizedTotalPool = Math.max(0, Math.trunc(Number(totalPoolMerit) || 0));
    const normalizedRemainingPool = Math.min(
      normalizedTotalPool,
      Math.max(0, Math.trunc(Number(remainingPoolMerit) || 0)),
    );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit,
                eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date
           FROM ${MONTH_CARD_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const existing = normalizeMonthCardRow(current.rows[0], normalizedPlayerId);
      const startAt = existing?.startAt && existing.startAt > 0 ? existing.startAt : Math.trunc(nowMs);
      const eternalEnabled = typeof options.eternalEnabled === 'boolean'
        ? options.eternalEnabled
        : existing?.eternalEnabled ?? false;
      const dailySignInFixedMeritBonus = Number.isFinite(Number(options.dailySignInFixedMeritBonus))
        ? Math.max(0, Math.trunc(Number(options.dailySignInFixedMeritBonus)))
        : existing?.dailySignInFixedMeritBonus ?? 0;
      const shouldCreateActiveWindow = (normalizedRemainingPool > 0 || eternalEnabled || dailySignInFixedMeritBonus > 0) && (!existing || existing.expireAt <= nowMs);
      const expireAt = shouldCreateActiveWindow
        ? Math.trunc(nowMs) + MERIT_MONTH_CARD_DURATION_DAYS * DAY_MS
        : existing?.expireAt ?? Math.trunc(nowMs);
      const lastClaimDate = existing?.lastClaimDate ?? null;
      await client.query(
        `INSERT INTO ${MONTH_CARD_TABLE}(
           player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit,
           eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
         ON CONFLICT (player_id)
         DO UPDATE SET
           start_at_ms = EXCLUDED.start_at_ms,
           expire_at_ms = EXCLUDED.expire_at_ms,
           total_pool_merit = EXCLUDED.total_pool_merit,
           remaining_pool_merit = EXCLUDED.remaining_pool_merit,
           eternal_enabled = EXCLUDED.eternal_enabled,
           daily_sign_in_fixed_merit_bonus = EXCLUDED.daily_sign_in_fixed_merit_bonus,
           last_claim_date = EXCLUDED.last_claim_date,
           updated_at = now()`,
        [
          normalizedPlayerId,
          startAt,
          expireAt,
          normalizedTotalPool,
          normalizedRemainingPool,
          eternalEnabled,
          dailySignInFixedMeritBonus,
          lastClaimDate,
        ],
      );
      await client.query('COMMIT');
      return {
        playerId: normalizedPlayerId,
        startAt,
        expireAt,
        totalPoolMerit: normalizedTotalPool,
        remainingPoolMerit: normalizedRemainingPool,
        eternalEnabled,
        dailySignInFixedMeritBonus,
        lastClaimDate,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDailySignIn(playerId: string, claimDate: string, rewardPayload: unknown): Promise<ActivityDailySignInRecord> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    const normalizedClaimDate = normalizeDateKey(claimDate);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !normalizedClaimDate) {
      throw new Error('activity_persistence_unavailable');
    }
    const previousDate = shiftDateKey(normalizedClaimDate, -1);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT player_id, last_claim_date, streak_days, total_days, last_reward_merit
           FROM ${DAILY_SIGN_IN_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const existing = normalizeDailySignInRow(current.rows[0], normalizedPlayerId);
      if (existing?.lastClaimDate === normalizedClaimDate) {
        throw new Error('daily_sign_in_already_claimed');
      }
      const rewardMerit = Math.max(1, Math.trunc(Number((rewardPayload as { count?: unknown } | null)?.count) || 1));
      const streakDays = existing?.lastClaimDate === previousDate ? existing.streakDays + 1 : 1;
      const totalDays = (existing?.totalDays ?? 0) + 1;
      await client.query(
        `INSERT INTO ${DAILY_SIGN_IN_CLAIM_TABLE}(player_id, claim_date, reward_payload, created_at)
         VALUES ($1, $2, $3::jsonb, now())`,
        [normalizedPlayerId, normalizedClaimDate, JSON.stringify(rewardPayload ?? { itemId: MERIT_ITEM_ID, count: rewardMerit })],
      );
      await client.query(
        `INSERT INTO ${DAILY_SIGN_IN_TABLE}(player_id, last_claim_date, streak_days, total_days, last_reward_merit, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())
         ON CONFLICT (player_id)
         DO UPDATE SET
           last_claim_date = EXCLUDED.last_claim_date,
           streak_days = EXCLUDED.streak_days,
           total_days = EXCLUDED.total_days,
           last_reward_merit = EXCLUDED.last_reward_merit,
           updated_at = now()`,
        [normalizedPlayerId, normalizedClaimDate, streakDays, totalDays, rewardMerit],
      );
      await client.query('COMMIT');
      return {
        playerId: normalizedPlayerId,
        lastClaimDate: normalizedClaimDate,
        streakDays,
        totalDays,
        lastRewardMerit: rewardMerit,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new Error('daily_sign_in_already_claimed');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listActiveMonthCardPlayerIds(nowMs = Date.now()): Promise<string[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
      const result = await this.pool.query(
        `SELECT player_id
           FROM ${MONTH_CARD_TABLE}
          WHERE (eternal_enabled = true OR expire_at_ms > $1)
            AND remaining_pool_merit > 0`,
        [Math.trunc(nowMs)],
      );
    return result.rows
      .map((row) => normalizePlayerId(row?.player_id))
      .filter((playerId) => playerId.length > 0);
  }

  async listEternalMonthCardPlayerIds(): Promise<string[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `SELECT player_id
         FROM ${MONTH_CARD_TABLE}
        WHERE eternal_enabled = true`,
    );
    return result.rows
      .map((row) => normalizePlayerId(row?.player_id))
      .filter((playerId) => playerId.length > 0);
  }

  async createInvitationRecord(input: {
    inviterUserId: string;
    inviterPlayerId: string;
    inviteeUserId: string;
    inviteePlayerId: string;
    invitationCode: string;
  }): Promise<ActivityInvitationRecord | null> {
    if (!this.pool || !this.enabled) {
      throw new Error('activity_persistence_unavailable');
    }
    const inviterUserId = normalizePlayerId(input.inviterUserId);
    const inviterPlayerId = normalizePlayerId(input.inviterPlayerId);
    const inviteeUserId = normalizePlayerId(input.inviteeUserId);
    const inviteePlayerId = normalizePlayerId(input.inviteePlayerId);
    const invitationCode = normalizeInvitationCode(input.invitationCode);
    if (!inviterUserId || !inviterPlayerId || !inviteeUserId || !inviteePlayerId || !invitationCode || inviterPlayerId === inviteePlayerId) {
      return null;
    }
    const result = await this.pool.query(
      `INSERT INTO ${INVITATION_TABLE}(
         inviter_user_id,
         inviter_player_id,
         invitee_user_id,
         invitee_player_id,
         invitation_code,
         invitee_highest_realm_lv,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 1, now(), now())
       ON CONFLICT (invitee_player_id) DO NOTHING
       RETURNING *`,
      [inviterUserId, inviterPlayerId, inviteeUserId, inviteePlayerId, invitationCode],
    );
    return normalizeInvitationRow(result.rows[0]) ?? null;
  }

  async loadInvitationStatus(inviterPlayerId: string): Promise<ActivityInvitationStatusRecord> {
    const normalizedPlayerId = normalizePlayerId(inviterPlayerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return {
        totalInvitees: 0,
        registeredRewardedCount: 0,
        qiReachedCount: 0,
        foundationReachedCount: 0,
      };
    }
    const result = await this.pool.query(
      `SELECT
         COUNT(*)::integer AS total_invitees,
         COUNT(*) FILTER (WHERE inviter_base_reward_claimed = true)::integer AS registered_rewarded_count,
         COUNT(*) FILTER (WHERE invitee_highest_realm_lv >= $2)::integer AS qi_reached_count,
         COUNT(*) FILTER (WHERE invitee_highest_realm_lv >= $3)::integer AS foundation_reached_count
       FROM ${INVITATION_TABLE}
       WHERE inviter_player_id = $1`,
      [normalizedPlayerId, INVITATION_QI_REALM_MIN_LEVEL, INVITATION_FOUNDATION_REALM_MIN_LEVEL],
    );
    const row = result.rows[0] ?? {};
    return {
      totalInvitees: normalizeCount(row.total_invitees),
      registeredRewardedCount: normalizeCount(row.registered_rewarded_count),
      qiReachedCount: normalizeCount(row.qi_reached_count),
      foundationReachedCount: normalizeCount(row.foundation_reached_count),
    };
  }

  async listInvitationInviteeProgress(inviterPlayerId: string): Promise<ActivityInvitationInviteeProgressRecord[]> {
    const normalizedPlayerId = normalizePlayerId(inviterPlayerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return [];
    }
    const result = await this.pool.query(
      `SELECT invitee_player_id, invitee_highest_realm_lv
       FROM ${INVITATION_TABLE}
       WHERE inviter_player_id = $1`,
      [normalizedPlayerId],
    );
    return result.rows
      .map((row) => ({
        inviteePlayerId: normalizePlayerId(row.invitee_player_id),
        highestRealmLv: Math.max(1, Math.trunc(Number(row.invitee_highest_realm_lv) || 1)),
      }))
      .filter((row) => row.inviteePlayerId.length > 0);
  }

  async updateInvitationInviteeHighestRealmLv(inviteePlayerId: string, highestRealmLv: number): Promise<void> {
    const normalizedPlayerId = normalizePlayerId(inviteePlayerId);
    const normalizedHighest = Math.max(1, Math.trunc(Number(highestRealmLv) || 1));
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return;
    }
    await this.pool.query(
      `UPDATE ${INVITATION_TABLE}
          SET invitee_highest_realm_lv = GREATEST(invitee_highest_realm_lv, $2),
              updated_at = now()
        WHERE invitee_player_id = $1`,
      [normalizedPlayerId, normalizedHighest],
    );
  }

  async syncInvitationInviteeHighestRealmLevels(highestRealmLvByPlayerId: Map<string, number>): Promise<void> {
    if (!this.pool || !this.enabled || highestRealmLvByPlayerId.size === 0) {
      return;
    }
    const rows = [...highestRealmLvByPlayerId.entries()]
      .map(([playerId, highestRealmLv]) => ({
        playerId: normalizePlayerId(playerId),
        highestRealmLv: Math.max(1, Math.trunc(Number(highestRealmLv) || 1)),
      }))
      .filter((row) => row.playerId.length > 0);
    if (rows.length === 0) {
      return;
    }
    const params: Array<string | number> = [];
    const values = rows
      .map((row, index) => {
        const offset = index * 2;
        params.push(row.playerId, row.highestRealmLv);
        return `($${offset + 1}::varchar, $${offset + 2}::integer)`;
      })
      .join(', ');
    await this.pool.query(
      `UPDATE ${INVITATION_TABLE} AS invitation
          SET invitee_highest_realm_lv = GREATEST(invitation.invitee_highest_realm_lv, incoming.highest_realm_lv),
              updated_at = CASE
                WHEN incoming.highest_realm_lv > invitation.invitee_highest_realm_lv THEN now()
                ELSE invitation.updated_at
              END
         FROM (VALUES ${values}) AS incoming(invitee_player_id, highest_realm_lv)
        WHERE invitation.invitee_player_id = incoming.invitee_player_id`,
      params,
    );
  }

  async listInvitationLeaderboardRows(excludedPlayerIds: Iterable<string> = []): Promise<ActivityInvitationLeaderboardRow[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const excluded = [...new Set([...excludedPlayerIds]
      .map((playerId) => normalizePlayerId(playerId))
      .filter((playerId) => playerId.length > 0))];
    const result = await this.pool.query(
      `SELECT
         inviter_player_id,
         COUNT(*)::integer AS total_invitees,
         COUNT(*) FILTER (WHERE invitee_highest_realm_lv >= $1)::integer AS qi_reached_count,
         COUNT(*) FILTER (WHERE invitee_highest_realm_lv >= $2)::integer AS foundation_reached_count
       FROM ${INVITATION_TABLE}
       WHERE NOT (inviter_player_id = ANY($3::varchar[]))
         AND NOT (invitee_player_id = ANY($3::varchar[]))
       GROUP BY inviter_player_id
       ORDER BY total_invitees DESC, qi_reached_count DESC, foundation_reached_count DESC, inviter_player_id ASC`,
      [INVITATION_QI_REALM_MIN_LEVEL, INVITATION_FOUNDATION_REALM_MIN_LEVEL, excluded],
    );
    return result.rows
      .map((row) => ({
        inviterPlayerId: normalizePlayerId(row.inviter_player_id),
        totalInvitees: normalizeCount(row.total_invitees),
        qiReachedCount: normalizeCount(row.qi_reached_count),
        foundationReachedCount: normalizeCount(row.foundation_reached_count),
      }))
      .filter((row) => row.inviterPlayerId.length > 0);
  }

  async hasPendingInvitationRewards(playerId: string): Promise<boolean> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return false;
    }
    const result = await this.pool.query(
      `SELECT 1
         FROM ${INVITATION_TABLE}
        WHERE invitee_player_id = $1
          AND invitee_reward_claimed = false
        UNION ALL
       SELECT 1
         FROM ${INVITATION_TABLE}
        WHERE inviter_player_id = $1
          AND (
            inviter_base_reward_claimed = false
            OR (invitee_highest_realm_lv >= $2 AND inviter_qi_reward_claimed = false)
            OR (invitee_highest_realm_lv >= $3 AND inviter_foundation_reward_claimed = false)
          )
        LIMIT 1`,
      [normalizedPlayerId, INVITATION_QI_REALM_MIN_LEVEL, INVITATION_FOUNDATION_REALM_MIN_LEVEL],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async claimPendingInvitationRewards(playerId: string): Promise<ActivityInvitationRewardClaimResult> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return { inviteeSpiritStone: 0, inviteeMerit: 0, inviterMerit: 0 };
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inviteeResult = await client.query(
        `UPDATE ${INVITATION_TABLE}
            SET invitee_reward_claimed = true,
                updated_at = now()
          WHERE invitee_player_id = $1
            AND invitee_reward_claimed = false
          RETURNING invitee_player_id`,
        [normalizedPlayerId],
      );
      const baseResult = await client.query(
        `UPDATE ${INVITATION_TABLE}
            SET inviter_base_reward_claimed = true,
                updated_at = now()
          WHERE inviter_player_id = $1
            AND inviter_base_reward_claimed = false
          RETURNING invitee_player_id`,
        [normalizedPlayerId],
      );
      const qiResult = await client.query(
        `UPDATE ${INVITATION_TABLE}
            SET inviter_qi_reward_claimed = true,
                updated_at = now()
          WHERE inviter_player_id = $1
            AND invitee_highest_realm_lv >= $2
            AND inviter_qi_reward_claimed = false
          RETURNING invitee_player_id`,
        [normalizedPlayerId, INVITATION_QI_REALM_MIN_LEVEL],
      );
      const foundationResult = await client.query(
        `UPDATE ${INVITATION_TABLE}
            SET inviter_foundation_reward_claimed = true,
                updated_at = now()
          WHERE inviter_player_id = $1
            AND invitee_highest_realm_lv >= $2
            AND inviter_foundation_reward_claimed = false
          RETURNING invitee_player_id`,
        [normalizedPlayerId, INVITATION_FOUNDATION_REALM_MIN_LEVEL],
      );
      await client.query('COMMIT');
      const inviteeCount = inviteeResult.rowCount ?? 0;
      const baseCount = baseResult.rowCount ?? 0;
      const qiCount = qiResult.rowCount ?? 0;
      const foundationCount = foundationResult.rowCount ?? 0;
      return {
        inviteeSpiritStone: inviteeCount * INVITATION_INVITEE_SPIRIT_STONE_REWARD,
        inviteeMerit: inviteeCount * INVITATION_INVITEE_MERIT_REWARD,
        inviterMerit:
          baseCount * INVITATION_INVITER_BASE_MERIT_REWARD
          + qiCount * INVITATION_INVITER_QI_REALM_MERIT_REWARD
          + foundationCount * INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function ensureActivityTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MONTH_CARD_TABLE} (
        player_id varchar(128) PRIMARY KEY,
        start_at_ms bigint NOT NULL,
        expire_at_ms bigint NOT NULL,
        total_pool_merit integer NOT NULL DEFAULT 0,
        remaining_pool_merit integer NOT NULL DEFAULT 0,
        eternal_enabled boolean NOT NULL DEFAULT false,
        daily_sign_in_fixed_merit_bonus integer NOT NULL DEFAULT 0,
        last_claim_date varchar(10),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE ${MONTH_CARD_TABLE} ADD COLUMN IF NOT EXISTS total_pool_merit integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ${MONTH_CARD_TABLE} ADD COLUMN IF NOT EXISTS remaining_pool_merit integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ${MONTH_CARD_TABLE} ADD COLUMN IF NOT EXISTS eternal_enabled boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE ${MONTH_CARD_TABLE} ADD COLUMN IF NOT EXISTS daily_sign_in_fixed_merit_bonus integer NOT NULL DEFAULT 0`);
    const nowMs = Date.now();
    const legacyDailyReward = Math.floor(MERIT_MONTH_CARD_POOL_GRANT / MERIT_MONTH_CARD_DURATION_DAYS);
    await client.query(
      `UPDATE ${MONTH_CARD_TABLE}
          SET total_pool_merit = legacy_pool.pool_merit,
              remaining_pool_merit = legacy_pool.pool_merit,
              start_at_ms = $1,
              expire_at_ms = $2,
              updated_at = now()
         FROM (
           SELECT player_id,
                  (CEIL(GREATEST(expire_at_ms - $1, 0)::numeric / $3::numeric)::integer * $4::integer) AS pool_merit
             FROM ${MONTH_CARD_TABLE}
            WHERE expire_at_ms > $1
              AND total_pool_merit <= 0
              AND remaining_pool_merit <= 0
         ) AS legacy_pool
        WHERE ${MONTH_CARD_TABLE}.player_id = legacy_pool.player_id
          AND legacy_pool.pool_merit > 0`,
      [nowMs, nowMs + MERIT_MONTH_CARD_DURATION_DAYS * DAY_MS, DAY_MS, legacyDailyReward],
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MONTH_CARD_CLAIM_TABLE} (
        player_id varchar(128) NOT NULL,
        claim_date varchar(10) NOT NULL,
        reward_merit integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (player_id, claim_date)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DAILY_SIGN_IN_TABLE} (
        player_id varchar(128) PRIMARY KEY,
        last_claim_date varchar(10),
        streak_days integer NOT NULL DEFAULT 0,
        total_days integer NOT NULL DEFAULT 0,
        last_reward_merit integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE ${DAILY_SIGN_IN_TABLE} ADD COLUMN IF NOT EXISTS last_reward_merit integer`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DAILY_SIGN_IN_CLAIM_TABLE} (
        player_id varchar(128) NOT NULL,
        claim_date varchar(10) NOT NULL,
        reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (player_id, claim_date)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INVITATION_TABLE} (
        invitee_player_id varchar(128) PRIMARY KEY,
        inviter_user_id varchar(128) NOT NULL,
        inviter_player_id varchar(128) NOT NULL,
        invitee_user_id varchar(128) NOT NULL,
        invitation_code varchar(32) NOT NULL,
        invitee_highest_realm_lv integer NOT NULL DEFAULT 1,
        invitee_reward_claimed boolean NOT NULL DEFAULT false,
        inviter_base_reward_claimed boolean NOT NULL DEFAULT false,
        inviter_qi_reward_claimed boolean NOT NULL DEFAULT false,
        inviter_foundation_reward_claimed boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE ${INVITATION_TABLE} ADD COLUMN IF NOT EXISTS invitee_highest_realm_lv integer NOT NULL DEFAULT 1`);
    await client.query(`ALTER TABLE ${INVITATION_TABLE} ADD COLUMN IF NOT EXISTS invitee_reward_claimed boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE ${INVITATION_TABLE} ADD COLUMN IF NOT EXISTS inviter_base_reward_claimed boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE ${INVITATION_TABLE} ADD COLUMN IF NOT EXISTS inviter_qi_reward_claimed boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE ${INVITATION_TABLE} ADD COLUMN IF NOT EXISTS inviter_foundation_reward_claimed boolean NOT NULL DEFAULT false`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_${MONTH_CARD_TABLE}_expire_at ON ${MONTH_CARD_TABLE}(expire_at_ms)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_${INVITATION_TABLE}_inviter_player ON ${INVITATION_TABLE}(inviter_player_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_${INVITATION_TABLE}_inviter_realm ON ${INVITATION_TABLE}(inviter_player_id, invitee_highest_realm_lv)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_${INVITATION_TABLE}_invitation_code ON ${INVITATION_TABLE}(invitation_code)`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function normalizeMonthCardRow(row: any, fallbackPlayerId: string): ActivityMonthCardRecord | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const playerId = normalizePlayerId(row.player_id) || fallbackPlayerId;
  const startAt = Math.max(0, Math.trunc(Number(row.start_at_ms) || 0));
  const expireAt = Math.max(0, Math.trunc(Number(row.expire_at_ms) || 0));
  const totalPoolMerit = Math.max(0, Math.trunc(Number(row.total_pool_merit) || 0));
  const remainingPoolMerit = Math.max(0, Math.trunc(Number(row.remaining_pool_merit) || 0));
  const dailySignInFixedMeritBonus = Math.max(0, Math.trunc(Number(row.daily_sign_in_fixed_merit_bonus) || 0));
  if (!playerId || expireAt <= 0) {
    return null;
  }
  return {
    playerId,
    startAt,
    expireAt,
    totalPoolMerit,
    remainingPoolMerit,
    eternalEnabled: row.eternal_enabled === true,
    dailySignInFixedMeritBonus,
    lastClaimDate: normalizeDateKey(row.last_claim_date) || null,
  };
}

export function calculateMonthCardDailyReward(monthCard: Pick<ActivityMonthCardRecord, 'totalPoolMerit' | 'remainingPoolMerit'>): number {
  const totalPoolMerit = Math.max(0, Math.trunc(Number(monthCard.totalPoolMerit) || 0));
  const remainingPoolMerit = Math.max(0, Math.trunc(Number(monthCard.remainingPoolMerit) || 0));
  if (totalPoolMerit <= 0 || remainingPoolMerit <= 0) {
    return 0;
  }
  const baseReward = Math.max(1, Math.floor(totalPoolMerit / MERIT_MONTH_CARD_DURATION_DAYS));
  return Math.min(remainingPoolMerit, baseReward);
}

export function calculateMonthCardNextPool(remainingPoolMerit: number, poolGrant = MERIT_MONTH_CARD_POOL_GRANT): number {
  const remaining = Math.max(0, Math.trunc(Number(remainingPoolMerit) || 0));
  const granted = Math.max(0, Math.trunc(Number(poolGrant) || 0));
  return remaining + granted;
}

function normalizeDailySignInRow(row: any, fallbackPlayerId: string): ActivityDailySignInRecord | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const playerId = normalizePlayerId(row.player_id) || fallbackPlayerId;
  if (!playerId) {
    return null;
  }
  return {
    playerId,
    lastClaimDate: normalizeDateKey(row.last_claim_date) || null,
    streakDays: Math.max(0, Math.trunc(Number(row.streak_days) || 0)),
    totalDays: Math.max(0, Math.trunc(Number(row.total_days) || 0)),
    lastRewardMerit: Number.isFinite(Number(row.last_reward_merit))
      ? Math.max(0, Math.trunc(Number(row.last_reward_merit)))
      : null,
  };
}

function normalizeInvitationRow(row: any): ActivityInvitationRecord | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const inviterUserId = normalizePlayerId(row.inviter_user_id);
  const inviterPlayerId = normalizePlayerId(row.inviter_player_id);
  const inviteeUserId = normalizePlayerId(row.invitee_user_id);
  const inviteePlayerId = normalizePlayerId(row.invitee_player_id);
  const invitationCode = normalizeInvitationCode(row.invitation_code);
  if (!inviterUserId || !inviterPlayerId || !inviteeUserId || !inviteePlayerId || !invitationCode) {
    return null;
  }
  return {
    inviterUserId,
    inviterPlayerId,
    inviteeUserId,
    inviteePlayerId,
    invitationCode,
    inviteeHighestRealmLv: Math.max(1, Math.trunc(Number(row.invitee_highest_realm_lv) || 1)),
    inviteeRewardClaimed: row.invitee_reward_claimed === true,
    inviterBaseRewardClaimed: row.inviter_base_reward_claimed === true,
    inviterQiRewardClaimed: row.inviter_qi_reward_claimed === true,
    inviterFoundationRewardClaimed: row.inviter_foundation_reward_claimed === true,
  };
}

function normalizePlayerId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInvitationCode(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 32)
    : '';
}

function normalizeCount(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function normalizeDateKey(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '23505');
}
