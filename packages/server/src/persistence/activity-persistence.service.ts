/**
 * 活动中心持久化服务。
 *
 * 月卡有效期、月卡每日领取和每日签到都要求跨会话存在，数据库是唯一真源。
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  DAILY_SIGN_IN_REWARD_MERIT,
  MERIT_ITEM_ID,
  MERIT_MONTH_CARD_DURATION_DAYS,
  MERIT_MONTH_CARD_POOL_GRANT,
} from '@mud/shared';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';

const MONTH_CARD_TABLE = 'player_merit_month_card';
const MONTH_CARD_CLAIM_TABLE = 'player_merit_month_card_claim';
const DAILY_SIGN_IN_TABLE = 'player_daily_sign_in';
const DAILY_SIGN_IN_CLAIM_TABLE = 'player_daily_sign_in_claim';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActivityMonthCardRecord {
  playerId: string;
  startAt: number;
  expireAt: number;
  totalPoolMerit: number;
  remainingPoolMerit: number;
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
      `SELECT player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit, last_claim_date
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
      `SELECT player_id, last_claim_date, streak_days, total_days
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
        `SELECT player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit, last_claim_date
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
        `SELECT player_id, start_at_ms, expire_at_ms, total_pool_merit, remaining_pool_merit, last_claim_date
           FROM ${MONTH_CARD_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const monthCard = normalizeMonthCardRow(current.rows[0], normalizedPlayerId);
      if (!monthCard || monthCard.expireAt <= nowMs || monthCard.remainingPoolMerit <= 0) {
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
        `SELECT player_id, last_claim_date, streak_days, total_days
           FROM ${DAILY_SIGN_IN_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const existing = normalizeDailySignInRow(current.rows[0], normalizedPlayerId);
      if (existing?.lastClaimDate === normalizedClaimDate) {
        throw new Error('daily_sign_in_already_claimed');
      }
      const streakDays = existing?.lastClaimDate === previousDate ? existing.streakDays + 1 : 1;
      const totalDays = (existing?.totalDays ?? 0) + 1;
      await client.query(
        `INSERT INTO ${DAILY_SIGN_IN_CLAIM_TABLE}(player_id, claim_date, reward_payload, created_at)
         VALUES ($1, $2, $3::jsonb, now())`,
        [normalizedPlayerId, normalizedClaimDate, JSON.stringify(rewardPayload ?? { itemId: MERIT_ITEM_ID, count: DAILY_SIGN_IN_REWARD_MERIT })],
      );
      await client.query(
        `INSERT INTO ${DAILY_SIGN_IN_TABLE}(player_id, last_claim_date, streak_days, total_days, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (player_id)
         DO UPDATE SET
           last_claim_date = EXCLUDED.last_claim_date,
           streak_days = EXCLUDED.streak_days,
           total_days = EXCLUDED.total_days,
           updated_at = now()`,
        [normalizedPlayerId, normalizedClaimDate, streakDays, totalDays],
      );
      await client.query('COMMIT');
      return {
        playerId: normalizedPlayerId,
        lastClaimDate: normalizedClaimDate,
        streakDays,
        totalDays,
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
        WHERE expire_at_ms > $1
          AND remaining_pool_merit > 0`,
      [Math.trunc(nowMs)],
    );
    return result.rows
      .map((row) => normalizePlayerId(row?.player_id))
      .filter((playerId) => playerId.length > 0);
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
        last_claim_date varchar(10),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE ${MONTH_CARD_TABLE} ADD COLUMN IF NOT EXISTS total_pool_merit integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ${MONTH_CARD_TABLE} ADD COLUMN IF NOT EXISTS remaining_pool_merit integer NOT NULL DEFAULT 0`);
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
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DAILY_SIGN_IN_CLAIM_TABLE} (
        player_id varchar(128) NOT NULL,
        claim_date varchar(10) NOT NULL,
        reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (player_id, claim_date)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_${MONTH_CARD_TABLE}_expire_at ON ${MONTH_CARD_TABLE}(expire_at_ms)`);
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
  if (!playerId || expireAt <= 0) {
    return null;
  }
  return {
    playerId,
    startAt,
    expireAt,
    totalPoolMerit,
    remainingPoolMerit,
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
  };
}

function normalizePlayerId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
